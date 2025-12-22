/**
 * Network Scan Service
 * 
 * Handles network scanning operations: ping scanning, MAC detection, hostname resolution
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import dns from 'dns';
import { NetworkScanRepository, type NetworkScan, type CreateNetworkScanInput } from '../database/models/NetworkScan.js';
import { logger } from '../utils/logger.js';
import { vendorDetectionService } from './vendorDetection.js';

// Custom execAsync that doesn't reject on non-zero exit codes (needed for ping)
// ping returns non-zero exit code on packet loss, which is normal for offline hosts
const execAsync = (command: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> => {
    return new Promise((resolve, reject) => {
        const childProcess = exec(command, {
            timeout: options?.timeout,
            killSignal: 'SIGTERM'
        }, (error, stdout, stderr) => {
            // Don't reject on non-zero exit code - ping returns non-zero on packet loss
            // Only reject on real errors (timeout, spawn errors, etc.)
            if (error) {
                // Check if it's a real error (timeout, spawn error) or just exit code
                if (error.signal === 'SIGTERM' || 
                    error.message?.includes('timeout') ||
                    error.code === 'ENOENT' ||
                    error.message?.includes('spawn')) {
                    reject(error);
                } else {
                    // Non-zero exit code but command executed - this is normal for ping
                    resolve({ stdout: stdout || '', stderr: stderr || '' });
                }
            } else {
                resolve({ stdout: stdout || '', stderr: stderr || '' });
            }
        });
    });
};

const dnsReverseAsync = promisify(dns.reverse);

const isWindows = process.platform === 'win32';
const PING_FLAG = isWindows ? '-n' : '-c';
const PING_TIMEOUT = isWindows ? 2000 : 2000; // 2 seconds timeout
const MAX_CONCURRENT_PINGS = 20; // Maximum number of simultaneous ping operations

/**
 * Network Scan Service
 * Provides methods to scan network ranges, ping hosts, detect MAC addresses, and resolve hostnames
 */
export class NetworkScanService {
    /**
     * Scan a network range for active IP addresses
     * 
     * @param range Network range in CIDR notation (e.g., "192.168.1.0/24") or range notation (e.g., "192.168.1.1-254")
     * @param scanType 'full' for ping + MAC + hostname, 'quick' for ping only
     * @returns Scan results with statistics
     */
    async scanNetwork(range: string, scanType: 'full' | 'quick' = 'full'): Promise<{
        scanned: number;
        found: number;
        updated: number;
        duration: number;
    }> {
        const startTime = Date.now();
        
        // Parse IP range to get list of IPs to scan
        const ipsToScan = this.parseIpRange(range);
        
        if (ipsToScan.length === 0) {
            throw new Error('Invalid IP range format. Use CIDR (192.168.1.0/24) or range (192.168.1.1-254)');
        }

        logger.info('NetworkScanService', `Starting scan of ${ipsToScan.length} IPs (type: ${scanType})`);

        let found = 0;
        let updated = 0;
        let scanned = 0;

        // Process IPs in batches to limit concurrent operations
        for (let i = 0; i < ipsToScan.length; i += MAX_CONCURRENT_PINGS) {
            const batch = ipsToScan.slice(i, i + MAX_CONCURRENT_PINGS);
            
            // Ping all IPs in batch in parallel
            const pingPromises = batch.map(ip => this.pingHost(ip));
            const pingResults = await Promise.allSettled(pingPromises);
            
            // Process results
            for (let j = 0; j < batch.length; j++) {
                const ip = batch[j];
                const result = pingResults[j];
                scanned++;
                
                if (result.status === 'fulfilled' && result.value.success) {
                    const latency = result.value.latency;
                    const existing = NetworkScanRepository.findByIp(ip);
                    const wasNew = !existing;
                    
                    // Prepare scan data
                    const scanData: CreateNetworkScanInput = {
                        ip,
                        status: 'online',
                        pingLatency: latency
                    };
                    
                    // If full scan, get MAC, vendor, and hostname
                    if (scanType === 'full') {
                        try {
                            const mac = await this.getMacAddress(ip);
                            if (mac) {
                                scanData.mac = mac;
                                
                                // Detect vendor from MAC address (inspired by WatchYourLAN)
                                try {
                                    const vendor = vendorDetectionService.detectVendor(mac);
                                    if (vendor) {
                                        scanData.vendor = vendor;
                                    }
                                } catch (error) {
                                    logger.debug('NetworkScanService', `Failed to detect vendor for ${ip}:`, error);
                                }
                            } else if (existing?.mac) {
                                // Preserve existing MAC if detection failed
                                scanData.mac = existing.mac;
                                logger.debug('NetworkScanService', `Preserving existing MAC ${existing.mac} for ${ip}`);
                            }
                        } catch (error) {
                            // MAC detection may fail, preserve existing if available
                            logger.debug('NetworkScanService', `Failed to get MAC for ${ip}:`, error);
                            if (existing?.mac) {
                                scanData.mac = existing.mac;
                            }
                        }
                        
                        try {
                            const hostname = await this.getHostname(ip);
                            if (hostname) {
                                scanData.hostname = hostname;
                            } else if (existing?.hostname) {
                                // Preserve existing hostname if detection failed
                                scanData.hostname = existing.hostname;
                                logger.debug('NetworkScanService', `Preserving existing hostname ${existing.hostname} for ${ip}`);
                            }
                        } catch (error) {
                            // Hostname resolution may fail, preserve existing if available
                            logger.debug('NetworkScanService', `Failed to get hostname for ${ip}:`, error);
                            if (existing?.hostname) {
                                scanData.hostname = existing.hostname;
                            }
                        }
                    } else {
                        // In quick scan mode, preserve existing MAC and hostname
                        if (existing?.mac) {
                            scanData.mac = existing.mac;
                        }
                        if (existing?.hostname) {
                            scanData.hostname = existing.hostname;
                        }
                        if (existing?.vendor) {
                            scanData.vendor = existing.vendor;
                        }
                    }
                    
                    // Upsert (create or update) the scan entry
                    const savedScan = NetworkScanRepository.upsert(scanData);
                    
                    // Record in history table
                    NetworkScanRepository.addHistoryEntry(savedScan.ip, savedScan.status, savedScan.pingLatency);
                    
                    if (wasNew) {
                        found++;
                    } else {
                        updated++;
                    }
                } else {
                    // IP is offline - update existing entry if it exists
                    const existing = NetworkScanRepository.findByIp(ip);
                    if (existing && existing.status === 'online') {
                        const updatedScan = NetworkScanRepository.update(ip, {
                            status: 'offline',
                            lastSeen: new Date()
                        });
                        if (updatedScan) {
                            // Record in history table
                            NetworkScanRepository.addHistoryEntry(updatedScan.ip, updatedScan.status, updatedScan.pingLatency);
                        }
                        updated++;
                    }
                }
            }
            
            // Small delay between batches to avoid overwhelming the system
            if (i + MAX_CONCURRENT_PINGS < ipsToScan.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const duration = Date.now() - startTime;
        logger.info('NetworkScanService', `Scan completed: ${scanned} scanned, ${found} found, ${updated} updated in ${duration}ms`);

        return {
            scanned,
            found,
            updated,
            duration
        };
    }

    /**
     * Refresh existing IPs in the database (re-ping known IPs)
     * 
     * @param scanType 'full' for ping + MAC + hostname, 'quick' for ping only
     * @returns Refresh results with statistics
     */
    async refreshExistingIps(scanType: 'full' | 'quick' = 'quick'): Promise<{
        scanned: number;
        online: number;
        offline: number;
        duration: number;
    }> {
        const startTime = Date.now();
        
        // Get all existing IPs from database
        const existingScans = NetworkScanRepository.find({ limit: 10000 });
        const ipsToRefresh = existingScans.map(scan => scan.ip);
        
        if (ipsToRefresh.length === 0) {
            return {
                scanned: 0,
                online: 0,
                offline: 0,
                duration: Date.now() - startTime
            };
        }

        logger.info('NetworkScanService', `Refreshing ${ipsToRefresh.length} existing IPs (type: ${scanType})`);

        let online = 0;
        let offline = 0;
        let scanned = 0;

        // Process IPs in batches
        for (let i = 0; i < ipsToRefresh.length; i += MAX_CONCURRENT_PINGS) {
            const batch = ipsToRefresh.slice(i, i + MAX_CONCURRENT_PINGS);
            
            // Ping all IPs in batch in parallel
            const pingPromises = batch.map(ip => this.pingHost(ip));
            const pingResults = await Promise.allSettled(pingPromises);
            
            // Process results
            for (let j = 0; j < batch.length; j++) {
                const ip = batch[j];
                const result = pingResults[j];
                scanned++;
                
                if (result.status === 'fulfilled' && result.value.success) {
                    const latency = result.value.latency;
                    
                    const existing = NetworkScanRepository.findByIp(ip);
                    const updateData: Partial<NetworkScan> = {
                        status: 'online',
                        pingLatency: latency,
                        lastSeen: new Date()
                    };
                    
                    // If full scan, update MAC, vendor, and hostname
                    if (scanType === 'full') {
                        try {
                            const mac = await this.getMacAddress(ip);
                            if (mac) {
                                updateData.mac = mac;
                                
                                // Detect vendor from MAC address (inspired by WatchYourLAN)
                                try {
                                    const vendor = vendorDetectionService.detectVendor(mac);
                                    if (vendor) {
                                        updateData.vendor = vendor;
                                    }
                                } catch (error) {
                                    logger.debug('NetworkScanService', `Failed to detect vendor for ${ip}:`, error);
                                }
                            } else if (existing?.mac) {
                                // Preserve existing MAC if detection failed
                                updateData.mac = existing.mac;
                                logger.debug('NetworkScanService', `Preserving existing MAC ${existing.mac} for ${ip}`);
                            }
                        } catch (error) {
                            logger.debug('NetworkScanService', `Failed to get MAC for ${ip}:`, error);
                            // Preserve existing MAC if detection failed
                            if (existing?.mac) {
                                updateData.mac = existing.mac;
                            }
                        }
                        
                        try {
                            const hostname = await this.getHostname(ip);
                            if (hostname) {
                                updateData.hostname = hostname;
                            } else if (existing?.hostname) {
                                // Preserve existing hostname if detection failed
                                updateData.hostname = existing.hostname;
                                logger.debug('NetworkScanService', `Preserving existing hostname ${existing.hostname} for ${ip}`);
                            }
                        } catch (error) {
                            logger.debug('NetworkScanService', `Failed to get hostname for ${ip}:`, error);
                            // Preserve existing hostname if detection failed
                            if (existing?.hostname) {
                                updateData.hostname = existing.hostname;
                            }
                        }
                    } else {
                        // In quick scan mode, preserve existing MAC and hostname
                        if (existing?.mac) {
                            updateData.mac = existing.mac;
                        }
                        if (existing?.hostname) {
                            updateData.hostname = existing.hostname;
                        }
                        if (existing?.vendor) {
                            updateData.vendor = existing.vendor;
                        }
                    }
                    
                    const updatedScan = NetworkScanRepository.update(ip, updateData);
                    if (updatedScan) {
                        // Record in history table
                        NetworkScanRepository.addHistoryEntry(updatedScan.ip, updatedScan.status, updatedScan.pingLatency);
                    }
                    online++;
                } else {
                    // IP is offline
                    const updatedScan = NetworkScanRepository.update(ip, {
                        status: 'offline',
                        lastSeen: new Date()
                    });
                    if (updatedScan) {
                        // Record in history table
                        NetworkScanRepository.addHistoryEntry(updatedScan.ip, updatedScan.status, updatedScan.pingLatency);
                    }
                    offline++;
                }
            }
            
            // Small delay between batches
            if (i + MAX_CONCURRENT_PINGS < ipsToRefresh.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const duration = Date.now() - startTime;
        logger.info('NetworkScanService', `Refresh completed: ${scanned} scanned, ${online} online, ${offline} offline in ${duration}ms`);

        return {
            scanned,
            online,
            offline,
            duration
        };
    }

    /**
     * Get the local network range automatically
     * Returns the network range in CIDR notation (e.g., "192.168.1.0/24")
     * Always limits to /24 subnet which is the standard for most local networks
     * - Most home/office networks use /24 (192.168.x.0/24 or 10.0.x.0/24)
     * - This limits scanning to 254 IPs max (safe and practical)
     * - Prevents scanning overly large networks like /16 (65536 IPs) which would fail
     */
    getNetworkRange(): string | null {
        const interfaces = os.networkInterfaces();
        
        // Priority order: prefer 192.168.x.x, then 10.x.x.x, then 172.16-31.x.x (but skip Docker networks 172.17-31.x.x)
        const preferredRanges: Array<{ pattern: RegExp; priority: number }> = [
            { pattern: /^192\.168\./, priority: 1 },      // Highest priority: 192.168.x.x
            { pattern: /^10\./, priority: 2 },             // Second: 10.x.x.x
            { pattern: /^172\.(1[6-9]|2[0-9]|3[0-1])\./, priority: 3 } // Third: 172.16-31.x.x (private range, but may be Docker)
        ];
        
        const foundInterfaces: Array<{ ip: string; priority: number; name: string }> = [];
        
        for (const name of Object.keys(interfaces)) {
            // Skip Docker interfaces explicitly
            if (name.startsWith('lo') || 
                name.startsWith('docker') || 
                name.startsWith('veth') || 
                name.startsWith('br-') ||
                name.startsWith('eth0') && name.includes('docker')) {
                continue;
            }
            
            for (const iface of interfaces[name] || []) {
                // Skip internal (loopback) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    const ip = iface.address;
                    
                    // Skip Docker networks (172.17.0.0/16 to 172.31.255.255)
                    // Docker uses 172.17.0.0/16 by default, but can use other ranges
                    // We'll prefer 192.168.x.x and 10.x.x.x over 172.x.x.x
                    if (ip.startsWith('172.')) {
                        const parts = ip.split('.').map(Number);
                        // Docker typically uses 172.17-31.x.x, skip these
                        if (parts.length === 4 && parts[0] === 172 && parts[1] >= 17 && parts[1] <= 31) {
                            logger.debug('NetworkScanService', `Skipping Docker network interface ${name} with IP ${ip}`);
                            continue;
                        }
                    }
                    
                    const parts = ip.split('.');
                    if (parts.length === 4) {
                        // Find priority for this IP
                        let priority = 99; // Default low priority
                        for (const pref of preferredRanges) {
                            if (pref.pattern.test(ip)) {
                                priority = pref.priority;
                                break;
                            }
                        }
                        
                        foundInterfaces.push({
                            ip: `${parts[0]}.${parts[1]}.${parts[2]}.0/24`,
                            priority,
                            name
                        });
                    }
                }
            }
        }
        
        // Sort by priority (lower number = higher priority)
        foundInterfaces.sort((a, b) => a.priority - b.priority);
        
        if (foundInterfaces.length > 0) {
            const selected = foundInterfaces[0];
            logger.debug('NetworkScanService', `Auto-detected network range: ${selected.ip} from interface ${selected.name}`);
            return selected.ip;
        }
        
        return null;
    }

    /**
     * Parse IP range notation to array of IP addresses
     * Supports:
     * - CIDR notation: "192.168.1.0/24"
     * - Range notation: "192.168.1.1-254"
     * - Single IP: "192.168.1.1"
     */
    parseIpRange(range: string): string[] {
        const ips: string[] = [];
        const trimmedRange = range.trim();
        
        // Validate that range contains only private IP addresses
        if (!this.isPrivateIpRange(trimmedRange)) {
            throw new Error('Only private IP ranges are allowed (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)');
        }
        
        // CIDR notation: 192.168.1.0/24
        if (trimmedRange.includes('/')) {
            const [network, cidrStr] = trimmedRange.split('/');
            const cidr = parseInt(cidrStr, 10);
            
            if (isNaN(cidr) || cidr < 0 || cidr > 32) {
                throw new Error(`Invalid CIDR notation: ${cidrStr}`);
            }
            
            const networkParts = network.split('.').map(Number);
            if (networkParts.length !== 4 || networkParts.some(p => isNaN(p) || p < 0 || p > 255)) {
                throw new Error(`Invalid network address: ${network}`);
            }
            
            // Calculate IP range from CIDR
            const hostBits = 32 - cidr;
            const numHosts = Math.pow(2, hostBits);
            
            // For /24, scan 1-254 (skip .0 and .255)
            if (cidr === 24) {
                const baseIp = `${networkParts[0]}.${networkParts[1]}.${networkParts[2]}`;
                for (let i = 1; i <= 254; i++) {
                    ips.push(`${baseIp}.${i}`);
                }
            } else if (cidr >= 16 && cidr < 24) {
                // For /16 to /23, scan all hosts (limit to reasonable size)
                if (numHosts > 1000) {
                    throw new Error(`CIDR /${cidr} would scan ${numHosts} IPs, which is too large. Maximum 1000 IPs allowed.`);
                }
                // Generate all IPs in range (simplified - would need proper bit manipulation for full support)
                const baseIp = `${networkParts[0]}.${networkParts[1]}`;
                for (let i = 0; i < numHosts && i < 1000; i++) {
                    const third = Math.floor(i / 256);
                    const fourth = i % 256;
                    if (fourth !== 0 && fourth !== 255) {
                        ips.push(`${baseIp}.${third}.${fourth}`);
                    }
                }
            } else {
                throw new Error(`CIDR /${cidr} not supported. Only /16 to /24 are supported.`);
            }
        }
        // Range notation: 192.168.1.1-254
        else if (trimmedRange.includes('-')) {
            const parts = trimmedRange.split('-');
            if (parts.length !== 2) {
                throw new Error(`Invalid range notation: ${trimmedRange}`);
            }
            
            const startIp = parts[0].trim();
            const endStr = parts[1].trim();
            
            const startParts = startIp.split('.').map(Number);
            if (startParts.length !== 4 || startParts.some(p => isNaN(p) || p < 0 || p > 255)) {
                throw new Error(`Invalid start IP: ${startIp}`);
            }
            
            const endNum = parseInt(endStr, 10);
            if (isNaN(endNum) || endNum < 1 || endNum > 255) {
                throw new Error(`Invalid end number: ${endStr}`);
            }
            
            const baseIp = `${startParts[0]}.${startParts[1]}.${startParts[2]}`;
            const startNum = startParts[3];
            
            if (endNum < startNum) {
                throw new Error(`End number (${endNum}) must be greater than start number (${startNum})`);
            }
            
            for (let i = startNum; i <= endNum && i <= 254; i++) {
                ips.push(`${baseIp}.${i}`);
            }
        }
        // Single IP
        else {
            if (this.isValidIp(trimmedRange)) {
                ips.push(trimmedRange);
            } else {
                throw new Error(`Invalid IP address: ${trimmedRange}`);
            }
        }
        
        return ips;
    }

    /**
     * Ping a single IP address
     * 
     * @param ip IP address to ping
     * @returns Ping result with success status and latency
     */
    async pingHost(ip: string): Promise<{ success: boolean; latency?: number }> {
        if (!this.isValidIp(ip)) {
            return { success: false };
        }
        
        // Detect if running in Docker
        const isDockerEnv = ((): boolean => {
            try {
                const fsSync = require('fs').readFileSync;
                const cgroup = fsSync('/proc/self/cgroup', 'utf8');
                if (cgroup.includes('docker') || cgroup.includes('containerd')) {
                    return true;
                }
            } catch {
                // Not Linux or file doesn't exist
            }
            
            if (process.env.DOCKER === 'true' || process.env.DOCKER_CONTAINER === 'true') {
                return true;
            }
            
            try {
                const fsSync = require('fs').accessSync;
                fsSync('/.dockerenv');
                return true;
            } catch {
                return false;
            }
        })();
        
        // Determine ping command based on environment
        let pingCommand = 'ping';
        if (!isWindows) {
            // On Linux (Docker or npm), try to find ping command dynamically
            // This works for both Docker and npm dev mode
            try {
                const { stdout: whichOutput } = await execAsync('which ping', { timeout: 1000 });
                const foundPath = whichOutput.trim();
                if (foundPath) {
                    pingCommand = foundPath;
                } else {
                    // If 'which' doesn't return a path, try common paths
                    throw new Error('which ping returned empty');
                }
            } catch {
                // If 'which' fails, try common paths
                try {
                    await execAsync('test -x /bin/ping', { timeout: 100 });
                    pingCommand = '/bin/ping';
                } catch {
                    try {
                        await execAsync('test -x /usr/bin/ping', { timeout: 100 });
                        pingCommand = '/usr/bin/ping';
                    } catch {
                        // Fallback to 'ping' and let the system PATH find it
                        pingCommand = 'ping';
                    }
                }
            }
        }
        
        try {
            // Use single ping with timeout
            // Note: On some systems, ping requires NET_RAW capability or root permissions
            const command = isWindows
                ? `ping ${PING_FLAG} 1 -w ${PING_TIMEOUT} ${ip}`
                : `${pingCommand} ${PING_FLAG} 1 -W ${Math.floor(PING_TIMEOUT / 1000)} ${ip}`;
            
            // Execute ping command - our custom execAsync doesn't reject on non-zero exit codes
            const { stdout, stderr } = await execAsync(command, {
                timeout: PING_TIMEOUT + 500 // Add 500ms buffer
            });
            
            // Check if ping was successful by looking for latency in output
            // If stdout contains latency info, ping succeeded
            const latency = this.parsePingLatency(stdout);
            
            if (latency !== null) {
                return {
                    success: true,
                    latency: latency
                };
            }
            
            // No latency found - ping failed (host unreachable, timeout, etc.)
            // This is normal and shouldn't be logged as an error
            return { success: false };
        } catch (error: any) {
            // Only real errors reach here (timeout, permission, command not found, spawn errors)
            const errorMessage = error.message || String(error);
            const errorStderr = error.stderr || '';
            
            // Check for permission errors
            if (errorMessage.includes('Permission denied') || 
                errorMessage.includes('Operation not permitted') ||
                errorStderr.includes('Permission denied') ||
                errorStderr.includes('Operation not permitted')) {
                logger.warn('NetworkScanService', `Ping permission denied for ${ip}. Ensure NET_RAW capability is enabled or run with appropriate permissions.`);
                logger.debug('NetworkScanService', `Ping error details: ${errorMessage}, stderr: ${errorStderr}`);
            } 
            // Check for command not found
            else if (errorMessage.includes('command not found') || 
                     errorMessage.includes('ENOENT') ||
                     errorMessage.includes('spawn') ||
                     errorStderr.includes('command not found')) {
                const envType = isDockerEnv ? 'Docker' : 'npm';
                logger.error('NetworkScanService', `Ping command not found. Tried: ${pingCommand}. In ${envType} mode, ensure ping is available.`);
                logger.error('NetworkScanService', `Error details: ${errorMessage}, stderr: ${errorStderr}`);
            }
            // Timeout errors are also normal for offline hosts, but we log them at debug level
            else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout') || error.signal === 'SIGTERM') {
                // Timeout is normal for offline hosts, don't log as error
                logger.debug('NetworkScanService', `Ping timeout for ${ip} (host may be offline)`);
            }
            
            return { success: false };
        }
    }

    /**
     * Get MAC address for an IP using ARP table or arp-scan
     * Inspired by WatchYourLAN's approach - uses multiple methods for better detection
     * 
     * @param ip IP address
     * @returns MAC address or null if not found
     */
    async getMacAddress(ip: string): Promise<string | null> {
        try {
            if (isWindows) {
                // Windows: arp -a
                const { stdout } = await execAsync(`arp -a ${ip}`);
                const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                if (match) {
                    return match[0].toLowerCase().replace(/-/g, ':');
                }
            } else {
                // Linux/Mac: Try multiple methods for better detection (like WatchYourLAN)
                
                // Method 1: Try ip neigh get (forces ARP request if not in table)
                // This is more reliable than 'show' as it will query if needed
                try {
                    const { stdout } = await execAsync(`ip neigh get ${ip} 2>/dev/null || ip neigh show ${ip}`, { timeout: 3000 });
                    const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                    if (match) {
                        const mac = match[0].toLowerCase().replace(/-/g, ':');
                        // Filter out invalid MACs (00:00:00:00:00:00)
                        if (mac !== '00:00:00:00:00:00') {
                            logger.debug('NetworkScanService', `Found MAC ${mac} for ${ip} using ip neigh`);
                            return mac;
                        }
                    }
                } catch (error) {
                    logger.debug('NetworkScanService', `ip neigh failed for ${ip}:`, error);
                }
                
                // Method 2: Try reading /proc/net/arp (Linux only, works in Docker with host network)
                try {
                    const { stdout } = await execAsync(`cat /proc/net/arp 2>/dev/null | grep "^${ip.replace(/\./g, '\\.')} "`, { timeout: 1000 });
                    const parts = stdout.trim().split(/\s+/);
                    if (parts.length >= 4 && parts[3] !== '00:00:00:00:00:00') {
                        const mac = parts[3].toLowerCase().replace(/-/g, ':');
                        if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) {
                            logger.debug('NetworkScanService', `Found MAC ${mac} for ${ip} using /proc/net/arp`);
                            return mac;
                        }
                    }
                } catch (error) {
                    logger.debug('NetworkScanService', `/proc/net/arp failed for ${ip}:`, error);
                }
                
                // Method 3: Try arp-scan if available (like WatchYourLAN)
                // arp-scan is more reliable for network scanning but requires root/privileges
                try {
                    // Get network interface for arp-scan
                    const networkInterface = this.getNetworkInterface();
                    if (networkInterface) {
                        // arp-scan -l -q -x (local network, quiet, exit after first match)
                        // Note: arp-scan scans entire network, so we parse output for our IP
                        const { stdout } = await execAsync(
                            `arp-scan -l -q -x -I ${networkInterface} 2>/dev/null | grep ${ip}`,
                            { timeout: 5000 }
                        );
                        const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                        if (match) {
                            const mac = match[0].toLowerCase().replace(/-/g, ':');
                            if (mac !== '00:00:00:00:00:00') {
                                logger.debug('NetworkScanService', `Found MAC ${mac} for ${ip} using arp-scan`);
                                return mac;
                            }
                        }
                    }
                } catch (error) {
                    // arp-scan not available or failed (may require root privileges)
                    logger.debug('NetworkScanService', `arp-scan not available or failed for ${ip}:`, error);
                }
                
                // Method 4: Fallback to traditional arp command
                try {
                    const { stdout } = await execAsync(`arp -n ${ip}`, { timeout: 2000 });
                    const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                    if (match) {
                        const mac = match[0].toLowerCase().replace(/-/g, ':');
                        if (mac !== '00:00:00:00:00:00') {
                            logger.debug('NetworkScanService', `Found MAC ${mac} for ${ip} using arp`);
                            return mac;
                        }
                    }
                } catch {
                    // ARP not available
                }
            }
        } catch (error) {
            // All methods failed
            logger.debug('NetworkScanService', `Failed to get MAC for ${ip}:`, error);
        }
        
        return null;
    }

    /**
     * Get the primary network interface name
     * Used for arp-scan command
     */
    private getNetworkInterface(): string | null {
        try {
            const interfaces = os.networkInterfaces();
            
            for (const name of Object.keys(interfaces)) {
                // Skip loopback and Docker interfaces
                if (name.startsWith('lo') || name.startsWith('docker') || name.startsWith('veth') || name.startsWith('br-')) {
                    continue;
                }
                
                for (const iface of interfaces[name] || []) {
                    // Return first IPv4 non-internal interface
                    if (iface.family === 'IPv4' && !iface.internal) {
                        return name;
                    }
                }
            }
        } catch (error) {
            logger.debug('NetworkScanService', 'Failed to get network interface:', error);
        }
        
        return null;
    }

    /**
     * Get hostname for an IP using multiple methods
     * Tries reverse DNS, getent hosts, /etc/hosts, and NetBIOS/SMB
     * 
     * @param ip IP address
     * @returns Hostname or null if not found
     */
    async getHostname(ip: string): Promise<string | null> {
        // Method 1: Try reverse DNS lookup (PTR record)
        try {
            const hostnames = await dnsReverseAsync(ip);
            if (hostnames && hostnames.length > 0 && hostnames[0]) {
                const hostname = hostnames[0].trim();
                // Filter out generic reverse DNS entries
                if (hostname && !hostname.includes('in-addr.arpa') && hostname.length > 0) {
                    logger.debug('NetworkScanService', `Found hostname ${hostname} for ${ip} using reverse DNS`);
                    return hostname;
                }
            }
        } catch (error) {
            logger.debug('NetworkScanService', `Reverse DNS failed for ${ip}:`, error);
        }
        
        if (isWindows) {
            // Windows: Try NetBIOS name resolution
            try {
                const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 3000 });
                // Parse NetBIOS output for computer name
                const nameMatch = stdout.match(/<00>\s+UNIQUE\s+([A-Z0-9-]+)/i);
                if (nameMatch && nameMatch[1]) {
                    const hostname = nameMatch[1].trim();
                    if (hostname && hostname.length > 0) {
                        logger.debug('NetworkScanService', `Found hostname ${hostname} for ${ip} using NetBIOS`);
                        return hostname;
                    }
                }
            } catch (error) {
                logger.debug('NetworkScanService', `NetBIOS lookup failed for ${ip}:`, error);
            }
        } else {
            // Linux/Mac: Try multiple methods
            
            // Method 2: Try getent hosts (checks /etc/hosts and DNS)
            try {
                const { stdout } = await execAsync(`getent hosts ${ip} 2>/dev/null`, { timeout: 2000 });
                const parts = stdout.trim().split(/\s+/);
                if (parts.length >= 2) {
                    // getent hosts returns: IP hostname [aliases...]
                    const hostname = parts[1].trim();
                    if (hostname && hostname.length > 0 && !hostname.includes('in-addr.arpa')) {
                        logger.debug('NetworkScanService', `Found hostname ${hostname} for ${ip} using getent hosts`);
                        return hostname;
                    }
                }
            } catch (error) {
                logger.debug('NetworkScanService', `getent hosts failed for ${ip}:`, error);
            }
            
            // Method 3: Try reading /etc/hosts directly
            try {
                const { stdout } = await execAsync(`grep "^${ip.replace(/\./g, '\\.')}\\s" /etc/hosts 2>/dev/null | head -1`, { timeout: 1000 });
                const parts = stdout.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const hostname = parts[1].trim();
                    if (hostname && hostname.length > 0 && !hostname.startsWith('#')) {
                        logger.debug('NetworkScanService', `Found hostname ${hostname} for ${ip} using /etc/hosts`);
                        return hostname;
                    }
                }
            } catch (error) {
                logger.debug('NetworkScanService', `/etc/hosts lookup failed for ${ip}:`, error);
            }
            
            // Method 4: Try SMB/NetBIOS (smbclient or nmblookup)
            try {
                // Try nmblookup first (faster, no authentication needed)
                const { stdout } = await execAsync(`nmblookup -A ${ip} 2>/dev/null | grep "<00>" | head -1`, { timeout: 3000 });
                const nameMatch = stdout.match(/([A-Z0-9-]+)\s+<00>/i);
                if (nameMatch && nameMatch[1]) {
                    const hostname = nameMatch[1].trim();
                    if (hostname && hostname.length > 0) {
                        logger.debug('NetworkScanService', `Found hostname ${hostname} for ${ip} using nmblookup`);
                        return hostname;
                    }
                }
            } catch (error) {
                logger.debug('NetworkScanService', `nmblookup failed for ${ip}:`, error);
            }
        }
        
        return null;
    }

    /**
     * Get statistics about network scans
     */
    async getStats(): Promise<{
        total: number;
        online: number;
        offline: number;
        unknown: number;
        lastScan?: Date;
    }> {
        const stats = NetworkScanRepository.getStats();
        const lastScan = NetworkScanRepository.getLastScanDate();
        
        return {
            ...stats,
            lastScan: lastScan || undefined
        };
    }

    /**
     * Validate if an IP address is valid IPv4
     */
    private isValidIp(ip: string): boolean {
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipv4Regex.test(ip)) return false;
        
        const parts = ip.split('.').map(Number);
        return parts.length === 4 && parts.every(p => p >= 0 && p <= 255);
    }

    /**
     * Check if IP range is in private IP space
     */
    private isPrivateIpRange(range: string): boolean {
        // Check if range contains private IP patterns
        const privatePatterns = [
            /^10\./,           // 10.0.0.0/8
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
            /^192\.168\./      // 192.168.0.0/16
        ];
        
        return privatePatterns.some(pattern => pattern.test(range));
    }

    /**
     * Parse latency from ping output
     */
    private parsePingLatency(output: string): number | null {
        // Windows: "Reply from 192.168.1.1: bytes=32 time<1ms TTL=64"
        // Linux: "64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=0.123 ms"
        
        const windowsMatch = output.match(/time[<=](\d+)ms/i);
        if (windowsMatch) {
            return parseInt(windowsMatch[1], 10);
        }
        
        const linuxMatch = output.match(/time=([\d.]+)\s*ms/i);
        if (linuxMatch) {
            return Math.round(parseFloat(linuxMatch[1]));
        }
        
        return null;
    }

    /**
     * Convert netmask to CIDR notation
     */
    private netmaskToCidr(netmask: string): number {
        const parts = netmask.split('.').map(Number);
        let cidr = 0;
        
        for (const part of parts) {
            let bits = 0;
            let mask = part;
            while (mask > 0) {
                if (mask & 1) bits++;
                mask >>= 1;
            }
            cidr += bits;
        }
        
        return cidr;
    }

    /**
     * Calculate network address from IP and netmask
     */
    private getNetworkAddress(ip: string, netmask: string): string {
        const ipParts = ip.split('.').map(Number);
        const maskParts = netmask.split('.').map(Number);
        
        const networkParts = ipParts.map((part, i) => part & maskParts[i]);
        return networkParts.join('.');
    }
}

// Export singleton instance
export const networkScanService = new NetworkScanService();

