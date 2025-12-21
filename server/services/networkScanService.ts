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

const execAsync = promisify(exec);
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
                    
                    // If full scan, get MAC and hostname
                    if (scanType === 'full') {
                        try {
                            const mac = await this.getMacAddress(ip);
                            if (mac) scanData.mac = mac;
                        } catch (error) {
                            // MAC detection may fail, continue without it
                            logger.debug('NetworkScanService', `Failed to get MAC for ${ip}:`, error);
                        }
                        
                        try {
                            const hostname = await this.getHostname(ip);
                            if (hostname) scanData.hostname = hostname;
                        } catch (error) {
                            // Hostname resolution may fail, continue without it
                            logger.debug('NetworkScanService', `Failed to get hostname for ${ip}:`, error);
                        }
                    }
                    
                    // Upsert (create or update) the scan entry
                    NetworkScanRepository.upsert(scanData);
                    
                    if (wasNew) {
                        found++;
                    } else {
                        updated++;
                    }
                } else {
                    // IP is offline - update existing entry if it exists
                    const existing = NetworkScanRepository.findByIp(ip);
                    if (existing && existing.status === 'online') {
                        NetworkScanRepository.update(ip, {
                            status: 'offline',
                            lastSeen: new Date()
                        });
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
                    
                    const updateData: Partial<NetworkScan> = {
                        status: 'online',
                        pingLatency: latency,
                        lastSeen: new Date()
                    };
                    
                    // If full scan, update MAC and hostname
                    if (scanType === 'full') {
                        try {
                            const mac = await this.getMacAddress(ip);
                            if (mac) updateData.mac = mac;
                        } catch (error) {
                            logger.debug('NetworkScanService', `Failed to get MAC for ${ip}:`, error);
                        }
                        
                        try {
                            const hostname = await this.getHostname(ip);
                            if (hostname) updateData.hostname = hostname;
                        } catch (error) {
                            logger.debug('NetworkScanService', `Failed to get hostname for ${ip}:`, error);
                        }
                    }
                    
                    NetworkScanRepository.update(ip, updateData);
                    online++;
                } else {
                    // IP is offline
                    NetworkScanRepository.update(ip, {
                        status: 'offline',
                        lastSeen: new Date()
                    });
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
        
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                // Skip internal (loopback) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    const ip = iface.address;
                    const parts = ip.split('.');
                    
                    // Always use /24 subnet (standard for local networks)
                    // Extract first 3 octets: 192.168.1.x -> 192.168.1.0/24
                    if (parts.length === 4) {
                        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
                    }
                }
            }
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
        
        try {
            // Use single ping with timeout
            const command = isWindows
                ? `ping ${PING_FLAG} 1 -w ${PING_TIMEOUT} ${ip}`
                : `ping ${PING_FLAG} 1 -W ${Math.floor(PING_TIMEOUT / 1000)} ${ip}`;
            
            const { stdout } = await execAsync(command, {
                timeout: PING_TIMEOUT + 500 // Add 500ms buffer
            });
            
            // Parse latency from ping output
            const latency = this.parsePingLatency(stdout);
            
            return {
                success: true,
                latency: latency || undefined
            };
        } catch (error: any) {
            // Ping failed (host unreachable, timeout, etc.)
            // Log permission errors for debugging
            if (error.message?.includes('Permission denied') || error.message?.includes('Operation not permitted')) {
                logger.warn('NetworkScanService', `Ping permission denied for ${ip}. Ensure NET_RAW capability is enabled.`);
            } else if (error.message?.includes('command not found') || error.message?.includes('ping')) {
                logger.warn('NetworkScanService', `Ping command not found. Ensure iputils-ping is installed.`);
            }
            return { success: false };
        }
    }

    /**
     * Get MAC address for an IP using ARP table
     * May not work in Docker environments
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
                // Linux/Mac: arp -n or ip neigh
                try {
                    // Try ip neigh first (more reliable)
                    const { stdout } = await execAsync(`ip neigh show ${ip}`);
                    const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                    if (match) {
                        return match[0].toLowerCase().replace(/-/g, ':');
                    }
                } catch {
                    // Fallback to arp
                    try {
                        const { stdout } = await execAsync(`arp -n ${ip}`);
                        const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                        if (match) {
                            return match[0].toLowerCase().replace(/-/g, ':');
                        }
                    } catch {
                        // ARP not available
                    }
                }
            }
        } catch (error) {
            // ARP command failed or MAC not found
            logger.debug('NetworkScanService', `Failed to get MAC for ${ip}:`, error);
        }
        
        return null;
    }

    /**
     * Get hostname for an IP using reverse DNS lookup
     * 
     * @param ip IP address
     * @returns Hostname or null if not found
     */
    async getHostname(ip: string): Promise<string | null> {
        try {
            const hostnames = await dnsReverseAsync(ip);
            if (hostnames && hostnames.length > 0) {
                return hostnames[0];
            }
        } catch (error) {
            // Reverse DNS lookup failed
            logger.debug('NetworkScanService', `Failed to get hostname for ${ip}:`, error);
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

