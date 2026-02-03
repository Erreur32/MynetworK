/**
 * Network Scan Service
 * 
 * Handles network scanning operations: ping scanning, MAC detection, hostname resolution
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as dns from 'dns';
import { NetworkScanRepository, type NetworkScan, type CreateNetworkScanInput } from '../database/models/NetworkScan.js';
import { logger } from '../utils/logger.js';
import { vendorDetectionService } from './vendorDetection.js';
import { WiresharkVendorService } from './wiresharkVendorService.js';
import { metricsCollector } from './metricsCollector.js';
import { pluginManager } from './pluginManager.js';
import { PluginPriorityConfigService } from './pluginPriorityConfig.js';
import { AppConfigRepository } from '../database/models/AppConfig.js';
import { ipBlacklistService } from './ipBlacklistService.js';

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
                // error.code can be a number (exit code) or string (system error code like 'ENOENT')
                const errorCode = error.code;
                if (error.signal === 'SIGTERM' || 
                    error.message?.includes('timeout') ||
                    (typeof errorCode === 'string' && errorCode === 'ENOENT') ||
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
const PING_TIMEOUT = isWindows ? 3000 : 3000; // 3 seconds timeout (increased for Docker)
const MAX_CONCURRENT_PINGS = 20; // Maximum number of simultaneous ping operations

/**
 * Detect if running in Docker container
 * @returns true if running in Docker, false otherwise
 */
function isDockerEnv(): boolean {
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
}

/**
 * Get host filesystem path prefix for Docker
 * In Docker, host filesystem is mounted at /host
 * @returns Path prefix (e.g., '/host' in Docker, '' otherwise)
 */
function getHostPathPrefix(): string {
    if (isDockerEnv()) {
        const HOST_ROOT_PATH = process.env.HOST_ROOT_PATH || '/host';
        // Check if /host/proc exists (mounted from host)
        try {
            const fsSync = require('fs').accessSync;
            fsSync(`${HOST_ROOT_PATH}/proc`);
            return HOST_ROOT_PATH;
        } catch {
            // Host filesystem not mounted, return empty (use container paths)
            logger.debug('NetworkScanService', 'Docker detected but host filesystem not mounted at /host');
            return '';
        }
    }
    return '';
}

/**
 * Network Scan Service
 * Provides methods to scan network ranges, ping hosts, detect MAC addresses, and resolve hostnames
 */
export class NetworkScanService {
    // Current scan progress (in-memory, cleared after scan completes)
    private currentScanProgress: {
        scanned: number;
        total: number;
        found: number;
        updated: number;
        isActive: boolean;
    } | null = null;
    
    // Last scan result (stored after scan completes, cleared when new scan starts)
    private lastScanResult: {
        range: string;
        scanType: 'full' | 'quick';
        scanned: number;
        found: number;
        updated: number;
        duration: number;
        detectionSummary?: { mac: number; vendor: number; hostname: number };
    } | null = null;
    
    // Cache for plugin stats during scan (to avoid repeated getStats() calls)
    private cachedFreeboxStats: any | null = null;
    private cachedUniFiStats: any | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 30000; // 30 seconds cache validity
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
        detectionSummary?: { mac: number; vendor: number; hostname: number };
    }> {
        // Check if a scan is already in progress
        if (this.currentScanProgress && this.currentScanProgress.isActive) {
            const progress = this.currentScanProgress;
            logger.warn('NetworkScanService', `Scan already in progress: ${progress.scanned}/${progress.total} scanned. Rejecting new scan request.`);
            throw new Error(`A scan is already in progress (${progress.scanned}/${progress.total} IPs scanned). Please wait for it to complete.`);
        }

        const startTime = Date.now();
        
        // Parse IP range to get list of IPs to scan
        let ipsToScan = this.parseIpRange(range);

        // Filter out Docker IPs and blacklisted IPs before scanning
        const blacklist = ipBlacklistService.getBlacklist();
        if (blacklist.length > 0) {
            // Ensure blacklisted IPs are not kept in the main table
            for (const bannedIp of blacklist) {
                try {
                    if (this.isValidIp(bannedIp)) {
                        NetworkScanRepository.delete(bannedIp);
                    }
                } catch {
                    // Ignore delete errors, database issues are logged inside the repository
                }
            }
        }

        ipsToScan = ipsToScan.filter(ip => {
            if (this.isDockerIp(ip)) {
                logger.debug('NetworkScanService', `Skipping Docker IP during scan: ${ip}`);
                return false;
            }
            if (ipBlacklistService.isBlacklisted(ip)) {
                logger.info('NetworkScanService', `Skipping blacklisted IP during scan: ${ip}`);
                return false;
            }
            return true;
        });
        
        if (ipsToScan.length === 0) {
            throw new Error('Invalid IP range format. Use CIDR (192.168.1.0/24) or range (192.168.1.1-254)');
        }

        logger.info('NetworkScanService', `Starting scan of ${ipsToScan.length} IPs (type: ${scanType})`);

        // Clear last scan result when starting a new scan
        this.lastScanResult = null;

        // Initialize plugin stats cache for full scans (to avoid repeated getStats() calls)
        if (scanType === 'full') {
            await this.initializePluginStatsCache();
        }

        // Check Wireshark vendor database status at start of scan
        if (scanType === 'full') {
            try {
                const vendorStats = WiresharkVendorService.getStats();
                logger.info('NetworkScanService', `Wireshark vendor database: ${vendorStats.totalVendors} vendors available, last update: ${vendorStats.lastUpdate || 'never'}`);
                if (vendorStats.totalVendors === 0) {
                    logger.error('NetworkScanService', '⚠️ Wireshark vendor database is EMPTY! Vendor detection will FAIL. Please update the vendor database in Admin settings.');
                } else if (vendorStats.totalVendors < 1000) {
                    logger.warn('NetworkScanService', `⚠️ Wireshark vendor database has only ${vendorStats.totalVendors} vendors (expected >1000). Vendor detection may be LIMITED. Please update the vendor database in Admin settings.`);
                }
            } catch (error: any) {
                logger.error('NetworkScanService', `Failed to check Wireshark vendor database: ${error.message || error}`);
            }
        }

        // Initialize progress tracking
        this.currentScanProgress = {
            scanned: 0,
            total: ipsToScan.length,
            found: 0,
            updated: 0,
            isActive: true
        };

        let found = 0;
        let updated = 0;
        let scanned = 0;
        let vendorsFound = 0; // Track vendors found during this scan
        const latencies: number[] = []; // Collect latencies for metrics

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
                    // Collect latency for metrics (including 0ms)
                    if (latency !== undefined && latency >= 0) {
                        latencies.push(latency);
                    } else if (latency === undefined) {
                        // IP is online but no latency - log for debugging (only first few to avoid spam)
                        if (scanned < 5) {
                            logger.debug('NetworkScanService', `[${ip}] IP is online but latency is undefined (may be blocked by firewall or parsing issue)`);
                        }
                    }
                    const existing = NetworkScanRepository.findByIp(ip);
                    const wasNew = !existing;
                    
                    // Update progress tracking
                    if (this.currentScanProgress) {
                        this.currentScanProgress.scanned = scanned;
                        this.currentScanProgress.found = found;
                        this.currentScanProgress.updated = updated;
                    }
                    
                    // Log progress for every 10th online IP
                    if (scanned % 10 === 0) {
                        logger.info('NetworkScanService', `Scan progress: ${scanned}/${ipsToScan.length} scanned, ${found} found, ${updated} updated`);
                    }
                    
                    // Prepare scan data
                    // Note: pingLatency can be undefined if ping succeeded but no latency was parsed
                    const scanData: CreateNetworkScanInput = {
                        ip,
                        status: 'online',
                        pingLatency: latency // Can be undefined if ping succeeded but latency parsing failed
                    };
                    
                    // If full scan, get MAC, vendor, and hostname
                    if (scanType === 'full') {
                        let macToUse: string | null = null;
                        try {
                            const mac = await this.getMacAddress(ip);
                            if (mac) {
                                macToUse = mac;
                                scanData.mac = mac;
                                logger.info('NetworkScanService', `[${ip}] Found MAC: ${mac}`);
                            } else {
                                logger.debug('NetworkScanService', `[${ip}] No MAC detected by getMacAddress`);
                                if (existing?.mac) {
                                    // Preserve existing MAC if detection failed
                                    macToUse = existing.mac;
                                    scanData.mac = existing.mac;
                                    logger.info('NetworkScanService', `[${ip}] Using existing MAC: ${existing.mac}`);
                                }
                            }
                            
                            // Detect vendor from MAC address using priority configuration
                            // IMPORTANT: Always try to detect vendor if we have a MAC (new or existing)
                            if (macToUse) {
                                try {
                                    const vendorResult = await this.getVendorWithSource(macToUse, ip, existing);
                                    if (vendorResult) {
                                        scanData.vendor = vendorResult.vendor;
                                        scanData.vendorSource = vendorResult.source;
                                        vendorsFound++;
                                        logger.info('NetworkScanService', `[${ip}] ✓ Vendor saved: ${vendorResult.vendor} (MAC: ${macToUse}, source: ${vendorResult.source})`);
                                    } else {
                                        // Preserve existing vendor if available and valid, otherwise log
                                        const existingVendor = existing?.vendor?.trim() || '';
                                        if (existingVendor && existingVendor !== '--' && existingVendor.toLowerCase() !== 'unknown') {
                                            scanData.vendor = existing.vendor;
                                            scanData.vendorSource = existing.vendorSource || 'manual';
                                            logger.debug('NetworkScanService', `[${ip}] Preserving existing vendor: ${existingVendor} (source: ${scanData.vendorSource})`);
                                        } else {
                                            logger.info('NetworkScanService', `[${ip}] ✗ No vendor found for MAC: ${macToUse} (tried all plugins in priority order)`);
                                        }
                                    }
                                } catch (error: any) {
                                    logger.error('NetworkScanService', `[${ip}] ✗ Vendor detection failed for MAC ${macToUse}: ${error.message || error}`);
                                    // Preserve existing vendor if detection failed
                                    const existingVendor = existing?.vendor?.trim() || '';
                                    if (existingVendor && existingVendor !== '--' && existingVendor.toLowerCase() !== 'unknown') {
                                        scanData.vendor = existing.vendor;
                                        scanData.vendorSource = existing.vendorSource || 'manual';
                                    }
                                }
                            } else {
                                logger.debug('NetworkScanService', `[${ip}] No MAC available, skipping vendor detection`);
                                // Preserve existing vendor if no MAC
                                if (existing?.vendor && existing.vendor.trim().length > 0 && existing.vendor.trim() !== '--') {
                                    scanData.vendor = existing.vendor;
                                    scanData.vendorSource = existing.vendorSource || 'manual';
                                }
                            }
                        } catch (error: any) {
                            logger.error('NetworkScanService', `[${ip}] MAC/vendor detection error: ${error.message || error}`);
                            // MAC detection may fail, preserve existing if available
                            if (existing?.mac) {
                                scanData.mac = existing.mac;
                            }
                            if (existing?.vendor && existing.vendor.trim().length > 0 && existing.vendor.trim() !== '--') {
                                scanData.vendor = existing.vendor;
                                scanData.vendorSource = existing.vendorSource || 'manual';
                            }
                        }
                        
                        try {
                            logger.debug('NetworkScanService', `[${ip}] Starting hostname detection...`);
                            const hostnameResult = await this.getHostnameWithSource(ip, existing);
                            // Double-check that hostname is not an IP before saving
                            if (hostnameResult && hostnameResult.hostname) {
                                const cleanedHostname = hostnameResult.hostname.trim();
                                // Final validation: ensure it's not an IP address
                                if (cleanedHostname && 
                                    cleanedHostname !== ip && 
                                    !/^\d+\.\d+\.\d+\.\d+$/.test(cleanedHostname) &&
                                    cleanedHostname.length > 0 &&
                                    cleanedHostname.length < 64) {
                                    scanData.hostname = cleanedHostname;
                                    scanData.hostnameSource = hostnameResult.source;
                                    logger.info('NetworkScanService', `[${ip}] ✓ Found hostname: ${cleanedHostname} (source: ${hostnameResult.source})`);
                                } else {
                                    logger.debug('NetworkScanService', `[${ip}] ✗ Rejected invalid hostname: ${cleanedHostname}`);
                                }
                            } else {
                                logger.debug('NetworkScanService', `[${ip}] ✗ No hostname detected after trying all methods`);
                            }
                            // Only preserve existing hostname if new detection failed AND it's valid
                            // Note: Manual hostnames are already protected in getHostnameWithSource()
                            // If hostname was manually deleted (empty), it won't be preserved here
                            if (!scanData.hostname && existing?.hostname) {
                                const existingHostname = existing.hostname.trim();
                                // Check if existing hostname is not an IP address
                                if (existingHostname && 
                                    existingHostname !== ip && 
                                    !/^\d+\.\d+\.\d+\.\d+$/.test(existingHostname) &&
                                    existingHostname.length > 0 &&
                                    existingHostname.length < 64) {
                                    scanData.hostname = existing.hostname;
                                    scanData.hostnameSource = existing.hostnameSource || 'manual';
                                    logger.debug('NetworkScanService', `[${ip}] Preserving existing hostname: ${existingHostname} (source: ${scanData.hostnameSource})`);
                                }
                            }
                        } catch (error: any) {
                            // Hostname resolution may fail, preserve existing if available (but not if it's an IP)
                            if (!scanData.hostname && existing?.hostname) {
                                const existingHostname = existing.hostname.trim();
                                if (existingHostname && 
                                    existingHostname !== ip && 
                                    !/^\d+\.\d+\.\d+\.\d+$/.test(existingHostname) &&
                                    existingHostname.length > 0 &&
                                    existingHostname.length < 64) {
                                    scanData.hostname = existing.hostname;
                                    scanData.hostnameSource = existing.hostnameSource || 'manual';
                                    logger.debug('NetworkScanService', `[${ip}] Preserving existing hostname after error: ${existingHostname} (source: ${scanData.hostnameSource})`);
                                }
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
                    
                    // Update progress tracking (already done above, but ensure it's updated after found/updated increment)
                    if (this.currentScanProgress) {
                        this.currentScanProgress.scanned = scanned;
                        this.currentScanProgress.found = found;
                        this.currentScanProgress.updated = updated;
                    }
                } else {
                    // IP is offline - update existing entry if it exists (do not update lastSeen: keep the time when it was last seen online)
                    const existing = NetworkScanRepository.findByIp(ip);
                    if (existing && existing.status === 'online') {
                        const updatedScan = NetworkScanRepository.update(ip, {
                            status: 'offline'
                        });
                        if (updatedScan) {
                            // Record in history table
                            NetworkScanRepository.addHistoryEntry(updatedScan.ip, updatedScan.status, updatedScan.pingLatency);
                        }
                        updated++;
                    }
                    
                    // Update progress tracking for offline IPs too
                    if (this.currentScanProgress) {
                        this.currentScanProgress.scanned = scanned;
                        this.currentScanProgress.updated = updated;
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
        if (scanType === 'full') {
            logger.info('NetworkScanService', `Vendors found during this scan: ${vendorsFound} (out of ${scanned} scanned IPs)`);
        }
        
        // Generate detection summary (only for full scans)
        let detectionSummary: { mac: number; vendor: number; hostname: number } | undefined;
        if (scanType === 'full') {
            try {
                const allScans = NetworkScanRepository.find({ limit: 10000 });
                const scansWithMac = allScans.filter(s => s.mac && s.mac.trim().length > 0 && s.mac !== '00:00:00:00:00:00');
                // Filter out empty vendors, "--", "unknown", and IP addresses
                const scansWithVendor = allScans.filter(s => {
                    const vendor = s.vendor?.trim() || '';
                    return vendor.length > 0 && 
                           vendor !== '--' && 
                           vendor.toLowerCase() !== 'unknown' &&
                           !/^\d+\.\d+\.\d+\.\d+$/.test(vendor);
                });
                const scansWithHostname = allScans.filter(s => {
                    const hostname = s.hostname?.trim() || '';
                    return hostname.length > 0 && 
                           !/^\d+\.\d+\.\d+\.\d+$/.test(hostname);
                });
                detectionSummary = {
                    mac: scansWithMac.length,
                    vendor: scansWithVendor.length,
                    hostname: scansWithHostname.length
                };
                logger.info('NetworkScanService', `Detection summary: ${detectionSummary.mac} with MAC, ${detectionSummary.vendor} with vendor, ${detectionSummary.hostname} with hostname`);
            } catch (error: any) {
                logger.debug('NetworkScanService', `Failed to generate detection summary: ${error.message || error}`);
            }
        }

        // Record metrics AFTER scan completes (not during, to avoid performance impact)
        metricsCollector.recordScanComplete(duration, scanned, found, updated, latencies);

        // Store final results before clearing progress
        const finalResult = {
            range,
            scanType,
            scanned,
            found,
            updated,
            duration,
            detectionSummary
        };
        this.lastScanResult = finalResult;

        // Clear progress tracking after scan completes
        this.currentScanProgress = null;

        // Invalidate plugin stats cache after scan completes
        this.invalidatePluginStatsCache();

        return finalResult;
    }

    /**
     * Scan a single IP address manually
     * 
     * @param ip IP address to scan
     * @param fullScan If true, get MAC, vendor, and hostname; if false, ping only
     * @param manualMac Optional MAC address provided manually
     * @param manualHostname Optional hostname provided manually
     * @returns NetworkScan entry or null if failed
     */
    async scanSingleIp(ip: string, fullScan: boolean = true, manualMac?: string, manualHostname?: string): Promise<NetworkScan | null> {
        if (!this.isValidIp(ip)) {
            logger.error('NetworkScanService', `Invalid IP address: ${ip}`);
            return null;
        }

        // Skip Docker IPs completely to avoid scanning internal container networks
        if (this.isDockerIp(ip)) {
            logger.debug('NetworkScanService', `Skipping Docker IP in scanSingleIp: ${ip}`);
            return null;
        }

        // Skip and clean up blacklisted IPs
        if (ipBlacklistService.isBlacklisted(ip)) {
            logger.info('NetworkScanService', `Skipping blacklisted IP in scanSingleIp: ${ip}`);
            try {
                NetworkScanRepository.delete(ip);
            } catch {
                // Repository already logs database errors; we do not fail the scan here
            }
            return null;
        }

        try {
            // Ping the IP first
            const pingResult = await this.pingHost(ip);
            const existing = NetworkScanRepository.findByIp(ip);
            
            // Prepare scan data
            const scanData: CreateNetworkScanInput = {
                ip,
                status: pingResult.success ? 'online' : 'offline',
                pingLatency: pingResult.latency
            };

            // Use manual MAC if provided, otherwise try to detect
            if (manualMac) {
                scanData.mac = manualMac;
                scanData.vendorSource = 'manual';
            } else if (fullScan) {
                try {
                    const mac = await this.getMacAddress(ip);
                    if (mac) {
                        scanData.mac = mac;
                    } else if (existing?.mac) {
                        // Preserve existing MAC if detection failed
                        scanData.mac = existing.mac;
                    }
                } catch (error: any) {
                    logger.debug('NetworkScanService', `[${ip}] MAC detection failed: ${error.message}`);
                    if (existing?.mac) {
                        scanData.mac = existing.mac;
                    }
                }
            }

            // Use manual hostname if provided, otherwise try to detect
            if (manualHostname) {
                scanData.hostname = manualHostname;
                scanData.hostnameSource = 'manual';
            } else if (fullScan && !manualHostname) {
                try {
                    const hostnameResult = await this.getHostnameWithSource(ip, existing);
                    if (hostnameResult) {
                        scanData.hostname = hostnameResult.hostname;
                        scanData.hostnameSource = hostnameResult.source;
                    } else if (existing?.hostname) {
                        scanData.hostname = existing.hostname;
                        scanData.hostnameSource = existing.hostnameSource;
                    }
                } catch (error: any) {
                    logger.debug('NetworkScanService', `[${ip}] Hostname detection failed: ${error.message}`);
                    if (existing?.hostname) {
                        scanData.hostname = existing.hostname;
                        scanData.hostnameSource = existing.hostnameSource;
                    }
                }
            }

            // Detect vendor if we have a MAC
            if (scanData.mac && fullScan) {
                try {
                    const vendorResult = await this.getVendorWithSource(scanData.mac, ip, existing);
                    if (vendorResult) {
                        scanData.vendor = vendorResult.vendor;
                        scanData.vendorSource = vendorResult.source;
                    } else if (existing?.vendor && existing.vendor.trim() !== '--') {
                        scanData.vendor = existing.vendor;
                        scanData.vendorSource = existing.vendorSource;
                    }
                } catch (error: any) {
                    logger.debug('NetworkScanService', `[${ip}] Vendor detection failed: ${error.message}`);
                    if (existing?.vendor && existing.vendor.trim() !== '--') {
                        scanData.vendor = existing.vendor;
                        scanData.vendorSource = existing.vendorSource;
                    }
                }
            }

            // Save to database
            const savedScan = NetworkScanRepository.upsert(scanData);
            
            // Record in history
            NetworkScanRepository.addHistoryEntry(savedScan.ip, savedScan.status, savedScan.pingLatency);
            
            logger.info('NetworkScanService', `[${ip}] Manual scan completed: status=${savedScan.status}, mac=${savedScan.mac || 'none'}, hostname=${savedScan.hostname || 'none'}`);
            
            return savedScan;
        } catch (error: any) {
            logger.error('NetworkScanService', `[${ip}] Failed to scan single IP: ${error.message || error}`);
            return null;
        }
    }

    /**
     * Rescan a single IP address with full scan including port scan
     * This performs a complete rescan: ping, MAC detection, hostname resolution, vendor detection, and port scan
     * 
     * @param ip IP address to rescan
     * @returns NetworkScan entry with updated information including open ports
     */
    async rescanSingleIpWithPorts(ip: string): Promise<NetworkScan | null> {
        if (!this.isValidIp(ip)) {
            logger.error('NetworkScanService', `Invalid IP address: ${ip}`);
            return null;
        }

        // Skip Docker IPs completely
        if (this.isDockerIp(ip)) {
            logger.debug('NetworkScanService', `Skipping Docker IP in rescanSingleIpWithPorts: ${ip}`);
            return null;
        }

        // Skip blacklisted IPs
        if (ipBlacklistService.isBlacklisted(ip)) {
            logger.info('NetworkScanService', `Skipping blacklisted IP in rescanSingleIpWithPorts: ${ip}`);
            return null;
        }

        try {
            // First, perform full scan (ping + MAC + hostname + vendor)
            const scanResult = await this.scanSingleIp(ip, true);
            
            if (!scanResult || scanResult.status !== 'online') {
                logger.info('NetworkScanService', `[${ip}] IP is offline, skipping port scan`);
                return scanResult;
            }

            // Then perform port scan if IP is online
            try {
                const { portScanService } = await import('./portScanService.js');
                const isNmapAvailable = await portScanService.isNmapAvailable();
                
                if (isNmapAvailable) {
                    logger.info('NetworkScanService', `[${ip}] Starting port scan...`);
                    const { openPorts } = await portScanService.runPortScan(ip);
                    
                    // Update the scan entry with port scan results
                    const existing = NetworkScanRepository.findByIp(ip);
                    const existingAdditionalInfo = existing?.additionalInfo || {};
                    const merged: Record<string, unknown> = {
                        ...existingAdditionalInfo,
                        openPorts,
                        lastPortScan: new Date().toISOString()
                    };
                    
                    const updated = NetworkScanRepository.update(ip, { additionalInfo: merged });
                    logger.info('NetworkScanService', `[${ip}] Port scan completed: ${openPorts.length} open port(s) found`);
                    
                    return updated || scanResult;
                } else {
                    logger.warn('NetworkScanService', `[${ip}] nmap not available, skipping port scan`);
                    return scanResult;
                }
            } catch (portScanError: any) {
                logger.warn('NetworkScanService', `[${ip}] Port scan failed: ${portScanError.message || portScanError}`);
                // Return the scan result even if port scan failed
                return scanResult;
            }
        } catch (error: any) {
            logger.error('NetworkScanService', `[${ip}] Failed to rescan IP with ports: ${error.message || error}`);
            return null;
        }
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
        
        // Check if a scan is already in progress
        if (this.currentScanProgress && this.currentScanProgress.isActive) {
            const progress = this.currentScanProgress;
            logger.warn('NetworkScanService', `Scan already in progress: ${progress.scanned}/${progress.total} scanned. Rejecting refresh request.`);
            throw new Error(`A scan is already in progress (${progress.scanned}/${progress.total} IPs scanned). Please wait for it to complete.`);
        }
        
        // Get all existing IPs from database
        const existingScans = NetworkScanRepository.find({ limit: 10000 });

        // Load configured range and blacklist to restrict refresh scope
        const configuredRange = this.getConfiguredRange();
        const blacklist = ipBlacklistService.getBlacklist();

        // Ensure blacklisted IPs are not kept in the main table
        if (blacklist.length > 0) {
            for (const bannedIp of blacklist) {
                try {
                    if (this.isValidIp(bannedIp)) {
                        NetworkScanRepository.delete(bannedIp);
                    }
                } catch {
                    // Ignore delete errors, repository already logs failures
                }
            }
        }

        const ipsToRefresh = existingScans
            .map(scan => scan.ip)
            .filter(ip => {
                // Always skip invalid IPs early
                if (!this.isValidIp(ip)) {
                    return false;
                }

                // Skip Docker networks such as 172.17-31.x.x and 10.10.x.x
                if (this.isDockerIp(ip)) {
                    logger.debug('NetworkScanService', `Skipping Docker IP during refresh: ${ip}`);
                    return false;
                }

                // Skip blacklisted IPs completely
                if (ipBlacklistService.isBlacklisted(ip)) {
                    logger.info('NetworkScanService', `Skipping blacklisted IP during refresh: ${ip}`);
                    return false;
                }

                // If a configured range exists, keep only IPs inside this range
                if (configuredRange) {
                    return this.isIpInRange(ip, configuredRange);
                }

                // No configured range: keep the IP
                return true;
            });
        
        if (ipsToRefresh.length === 0) {
            return {
                scanned: 0,
                online: 0,
                offline: 0,
                duration: Date.now() - startTime
            };
        }

        logger.info('NetworkScanService', `Refreshing ${ipsToRefresh.length} existing IPs (type: ${scanType})`);

        // Initialize plugin stats cache for full scans (to avoid repeated getStats() calls)
        if (scanType === 'full') {
            await this.initializePluginStatsCache();
        }

        // Check Wireshark vendor database status at start of refresh
        if (scanType === 'full') {
            try {
                const vendorStats = WiresharkVendorService.getStats();
                logger.info('NetworkScanService', `Wireshark vendor database: ${vendorStats.totalVendors} vendors available, last update: ${vendorStats.lastUpdate || 'never'}`);
                if (vendorStats.totalVendors === 0) {
                    logger.error('NetworkScanService', '⚠️ Wireshark vendor database is EMPTY! Vendor detection will FAIL. Please update the vendor database in Admin settings.');
                } else if (vendorStats.totalVendors < 1000) {
                    logger.warn('NetworkScanService', `⚠️ Wireshark vendor database has only ${vendorStats.totalVendors} vendors (expected >1000). Vendor detection may be LIMITED. Please update the vendor database in Admin settings.`);
                }
            } catch (error: any) {
                logger.error('NetworkScanService', `Failed to check Wireshark vendor database: ${error.message || error}`);
            }
        }

        // Initialize progress tracking for refresh
        this.currentScanProgress = {
            scanned: 0,
            total: ipsToRefresh.length,
            found: 0,
            updated: 0,
            isActive: true
        };

        let online = 0;
        let offline = 0;
        let scanned = 0;
        let vendorsFound = 0; // Track vendors found during this refresh

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
                
                // Update progress tracking
                if (this.currentScanProgress) {
                    this.currentScanProgress.scanned = scanned;
                    this.currentScanProgress.updated = online + offline;
                }
                
                if (result.status === 'fulfilled' && result.value.success) {
                    const latency = result.value.latency;
                    
                    const existing = NetworkScanRepository.findByIp(ip);
                    const updateData: Partial<NetworkScan> = {
                        status: 'online',
                        pingLatency: latency,
                        lastSeen: new Date() // Always update lastSeen on refresh when ping succeeds
                    };
                    
                    // If full scan, update MAC, vendor, and hostname
                    if (scanType === 'full') {
                        let macToUse: string | null = null;
                        try {
                            const mac = await this.getMacAddress(ip);
                            if (mac) {
                                macToUse = mac;
                                updateData.mac = mac;
                                logger.info('NetworkScanService', `[${ip}] Found MAC: ${mac}`);
                            } else {
                                logger.debug('NetworkScanService', `[${ip}] No MAC detected by getMacAddress`);
                                if (existing?.mac) {
                                    // Preserve existing MAC if detection failed
                                    macToUse = existing.mac;
                                    updateData.mac = existing.mac;
                                    logger.info('NetworkScanService', `[${ip}] Using existing MAC: ${existing.mac}`);
                                }
                            }
                            
                            // Detect vendor from MAC address using priority configuration
                            // IMPORTANT: Always try to detect vendor if we have a MAC (new or existing)
                            if (macToUse) {
                                try {
                                    const vendorResult = await this.getVendorWithSource(macToUse, ip, existing);
                                    if (vendorResult) {
                                        updateData.vendor = vendorResult.vendor;
                                        updateData.vendorSource = vendorResult.source;
                                        vendorsFound++;
                                        logger.info('NetworkScanService', `[${ip}] ✓ Vendor updated: ${vendorResult.vendor} (MAC: ${macToUse}, source: ${vendorResult.source})`);
                                    } else {
                                        // Preserve existing vendor if available and valid, otherwise log
                                        const existingVendor = existing?.vendor?.trim() || '';
                                        if (existingVendor && existingVendor !== '--' && existingVendor.toLowerCase() !== 'unknown') {
                                            updateData.vendor = existing.vendor;
                                            updateData.vendorSource = existing.vendorSource || 'manual';
                                            logger.debug('NetworkScanService', `[${ip}] Preserving existing vendor: ${existingVendor} (source: ${updateData.vendorSource})`);
                                        } else {
                                            logger.info('NetworkScanService', `[${ip}] ✗ No vendor found for MAC: ${macToUse} (tried all plugins in priority order)`);
                                        }
                                    }
                                } catch (error: any) {
                                    logger.error('NetworkScanService', `[${ip}] ✗ Vendor detection failed for MAC ${macToUse}: ${error.message || error}`);
                                    // Preserve existing vendor if detection failed
                                    const existingVendor = existing?.vendor?.trim() || '';
                                    if (existingVendor && existingVendor !== '--' && existingVendor.toLowerCase() !== 'unknown') {
                                        updateData.vendor = existing.vendor;
                                        updateData.vendorSource = existing.vendorSource || 'manual';
                                    }
                                }
                            } else {
                                logger.debug('NetworkScanService', `[${ip}] No MAC available, skipping vendor detection`);
                                // Preserve existing vendor if no MAC
                                if (existing?.vendor && existing.vendor.trim().length > 0 && existing.vendor.trim() !== '--') {
                                    updateData.vendor = existing.vendor;
                                    updateData.vendorSource = existing.vendorSource || 'manual';
                                }
                            }
                        } catch (error: any) {
                            logger.error('NetworkScanService', `[${ip}] MAC/vendor detection error: ${error.message || error}`);
                            // Preserve existing MAC/vendor if detection failed
                            if (existing?.mac) {
                                updateData.mac = existing.mac;
                            }
                            if (existing?.vendor && existing.vendor.trim().length > 0 && existing.vendor.trim() !== '--') {
                                updateData.vendor = existing.vendor;
                                updateData.vendorSource = existing.vendorSource || 'manual';
                            }
                        }
                        
                        try {
                            const hostnameResult = await this.getHostnameWithSource(ip, existing);
                            // Double-check that hostname is not an IP before saving
                            if (hostnameResult && hostnameResult.hostname) {
                                const cleanedHostname = hostnameResult.hostname.trim();
                                // Final validation: ensure it's not an IP address
                                if (cleanedHostname && 
                                    cleanedHostname !== ip && 
                                    !/^\d+\.\d+\.\d+\.\d+$/.test(cleanedHostname) &&
                                    cleanedHostname.length > 0 &&
                                    cleanedHostname.length < 64) {
                                    updateData.hostname = cleanedHostname;
                                    updateData.hostnameSource = hostnameResult.source;
                                    logger.debug('NetworkScanService', `Set hostname ${cleanedHostname} for ${ip} (source: ${hostnameResult.source})`);
                                } else {
                                    logger.debug('NetworkScanService', `Rejected invalid hostname (IP) ${cleanedHostname} for ${ip}`);
                                }
                            }
                            // Only preserve existing hostname if new detection failed AND it's valid
                            if (!updateData.hostname && existing?.hostname) {
                                const existingHostname = existing.hostname.trim();
                                // Check if existing hostname is not an IP address
                                if (existingHostname && 
                                    existingHostname !== ip && 
                                    !/^\d+\.\d+\.\d+\.\d+$/.test(existingHostname) &&
                                    existingHostname.length > 0 &&
                                    existingHostname.length < 64) {
                                    updateData.hostname = existing.hostname;
                                    updateData.hostnameSource = existing.hostnameSource || 'manual';
                                    logger.debug('NetworkScanService', `Preserving existing hostname ${existingHostname} for ${ip} (source: ${updateData.hostnameSource})`);
                                } else {
                                    // Existing hostname is invalid, don't preserve it
                                    logger.debug('NetworkScanService', `Skipping invalid existing hostname (IP) ${existingHostname} for ${ip}`);
                                }
                            }
                        } catch (error) {
                            logger.debug('NetworkScanService', `Failed to get hostname for ${ip}:`, error);
                            // Preserve existing hostname if detection failed (but not if it's an IP)
                            if (!updateData.hostname && existing?.hostname) {
                                const existingHostname = existing.hostname.trim();
                                // Check if existing hostname is not an IP address
                                if (existingHostname && 
                                    existingHostname !== ip && 
                                    !/^\d+\.\d+\.\d+\.\d+$/.test(existingHostname) &&
                                    existingHostname.length > 0 &&
                                    existingHostname.length < 64) {
                                    updateData.hostname = existing.hostname;
                                    updateData.hostnameSource = existing.hostnameSource || 'manual';
                        }
                    }
                        }
                    } else {
                        // In quick scan mode, preserve existing MAC, vendor, and hostname (but clean invalid hostnames)
                        if (existing?.mac) {
                            updateData.mac = existing.mac;
                        }
                        if (existing?.vendor) {
                            updateData.vendor = existing.vendor;
                        }
                        // Preserve hostname only if it's valid (not an IP address)
                        if (existing?.hostname) {
                            const existingHostname = existing.hostname.trim();
                            // Check if existing hostname is not an IP address
                            if (existingHostname && 
                                existingHostname !== ip && 
                                !/^\d+\.\d+\.\d+\.\d+$/.test(existingHostname)) {
                                // Valid hostname, preserve it
                                updateData.hostname = existing.hostname;
                            } else {
                                // Invalid hostname (IP), remove it by setting to undefined
                                // This will clear the invalid hostname in the database (converted to NULL)
                                updateData.hostname = undefined;
                                logger.debug('NetworkScanService', `Clearing invalid hostname (IP) ${existing.hostname} for ${ip} during quick refresh`);
                            }
                        }
                    }
                    
                    const updatedScan = NetworkScanRepository.update(ip, updateData);
                    if (updatedScan) {
                        // Record in history table
                        NetworkScanRepository.addHistoryEntry(updatedScan.ip, updatedScan.status, updatedScan.pingLatency);
                    }
                    online++;
                    
                    // Update progress tracking
                    if (this.currentScanProgress) {
                        this.currentScanProgress.scanned = scanned;
                        this.currentScanProgress.updated = online + offline;
                    }
                } else {
                    // IP is offline (do not update lastSeen: keep the time when it was last seen online)
                    const updatedScan = NetworkScanRepository.update(ip, {
                        status: 'offline'
                    });
                    if (updatedScan) {
                        // Record in history table
                        NetworkScanRepository.addHistoryEntry(updatedScan.ip, updatedScan.status, updatedScan.pingLatency);
                    }
                    offline++;
                    
                    // Update progress tracking
                    if (this.currentScanProgress) {
                        this.currentScanProgress.scanned = scanned;
                        this.currentScanProgress.updated = online + offline;
                    }
                }
            }
            
            // Small delay between batches
            if (i + MAX_CONCURRENT_PINGS < ipsToRefresh.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const duration = Date.now() - startTime;
        logger.info('NetworkScanService', `Refresh completed: ${scanned} scanned, ${online} online, ${offline} offline in ${duration}ms`);
        if (scanType === 'full') {
            logger.info('NetworkScanService', `Vendors found during this refresh: ${vendorsFound} (out of ${scanned} scanned IPs)`);
        }

        // Clear progress tracking after refresh completes
        this.currentScanProgress = null;

        // Invalidate plugin stats cache after refresh completes
        this.invalidatePluginStatsCache();

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
                    const candidateIp = `${baseIp}.${i}`;
                    // Skip Docker and blacklisted IPs directly in the generated list
                    if (this.isDockerIp(candidateIp) || ipBlacklistService.isBlacklisted(candidateIp)) {
                        continue;
                    }
                    ips.push(candidateIp);
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
                    if (fourth === 0 || fourth === 255) {
                        continue;
                    }
                    const candidateIp = `${baseIp}.${third}.${fourth}`;
                    if (this.isDockerIp(candidateIp) || ipBlacklistService.isBlacklisted(candidateIp)) {
                        continue;
                    }
                    ips.push(candidateIp);
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
                const candidateIp = `${baseIp}.${i}`;
                if (this.isDockerIp(candidateIp) || ipBlacklistService.isBlacklisted(candidateIp)) {
                    continue;
                }
                ips.push(candidateIp);
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
        
        // Detect if running in Docker (use the helper function)
        const runningInDocker = isDockerEnv();
        
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
            // Increase timeout buffer for Docker environments
            const { stdout, stderr } = await execAsync(command, {
                timeout: PING_TIMEOUT + 1000 // Add 1 second buffer for Docker
            });
            
            // Check if ping was successful by looking for latency in output
            // If stdout contains latency info, ping succeeded
            const latency = this.parsePingLatency(stdout);
            
            // IMPORTANT: latency can be 0 (for very fast responses <1ms), which is still a successful ping
            if (latency !== null && latency >= 0) {
                // Log first few successful pings for debugging
                if (Math.random() < 0.05) { // Log ~5% of successful pings
                    logger.debug('NetworkScanService', `[${ip}] Ping successful, latency: ${latency}ms`);
                }
            return {
                success: true,
                    latency: latency
                };
            }
            
            // No latency found - ping failed (host unreachable, timeout, etc.)
            // This is normal if devices block ICMP or are offline
            // Check for Windows-specific success indicators even without explicit latency
            if (stdout && stdout.length > 0) {
                // Windows: Check for "Reply from" which indicates successful ping
                if (stdout.includes('Reply from') && stdout.includes('TTL')) {
                    // Windows ping succeeded but latency parsing might have failed
                    // Try one more time with improved parsing
                    const retryLatency = this.parsePingLatency(stdout);
                    if (retryLatency !== null && retryLatency >= 0) {
                        logger.debug('NetworkScanService', `[${ip}] Windows ping successful (retry parse), latency: ${retryLatency}ms`);
                        return {
                            success: true,
                            latency: retryLatency
                        };
                    }
                    // If still no latency but we have "Reply from", assume success with 0ms
                    logger.debug('NetworkScanService', `[${ip}] Windows ping successful (Reply from detected), assuming <1ms`);
                    return {
                        success: true,
                        latency: 0
                    };
                }
                
                // Linux: Check for successful ping indicators (icmp_seq, bytes from, etc.)
                // Format: "64 bytes from 192.168.1.50: icmp_seq=1 ttl=128 time=0.342 ms"
                if (stdout.includes('icmp_seq=') && stdout.includes('bytes from')) {
                    // Linux ping succeeded but latency parsing might have failed
                    // Try to extract latency from output
                    const retryLatency = this.parsePingLatency(stdout);
                    if (retryLatency !== null && retryLatency >= 0) {
                        logger.debug('NetworkScanService', `[${ip}] Linux ping successful (retry parse), latency: ${retryLatency}ms`);
                        return {
                            success: true,
                            latency: retryLatency
                        };
                    }
                    // If we see icmp_seq but no parsed latency, assume very fast response
                    logger.debug('NetworkScanService', `[${ip}] Linux ping successful (icmp_seq detected), assuming <1ms`);
                    return {
                        success: true,
                        latency: 0
                    };
                }
                
                // Check if ping started but didn't receive response (timeout)
                // This is normal behavior for devices blocking ICMP
                const hasTimeout = stdout.includes('no answer') || 
                                 stdout.includes('timeout') || 
                                 stdout.includes('100% packet loss') ||
                                 stdout.includes('Request timed out') ||
                                 stdout.includes('Destination host unreachable') ||
                                 (stdout.includes('PING') && !stdout.includes('time=') && !stdout.includes('time<') && !stdout.includes('Reply from'));
                
                if (hasTimeout) {
                    // Normal timeout - device may be blocking ICMP, don't log
                    return { success: false };
                }
                
                // If we got output but no latency and it's not a timeout, log for debugging (first 5 only)
                const logCount = Math.floor(Math.random() * 100);
                if (logCount < 5) {
                    logger.debug('NetworkScanService', `[${ip}] Ping output without latency (may be parsing issue). Command: ${command}`);
                    logger.debug('NetworkScanService', `[${ip}] Output: ${stdout.substring(0, 300)}`);
                }
            }
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
                const envType = runningInDocker ? 'Docker' : 'npm';
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
        logger.info('NetworkScanService', `[MAC] Starting MAC detection for ${ip}`);
        
        try {
            // Step 1: Try plugins first (if any are enabled) according to priority configuration
            // This ensures plugins are used before system methods, which may fail in Docker
            const config = PluginPriorityConfigService.getConfig();
            const priority = config.vendorPriority; // Use vendorPriority as it includes all plugins (freebox, unifi, scanner)
            
            // Filter to only plugins that can provide MAC addresses (freebox, unifi)
            const macPlugins = priority.filter(p => p === 'freebox' || p === 'unifi');
            
            if (macPlugins.length > 0) {
                logger.info('NetworkScanService', `[MAC] Trying plugins in priority order: ${macPlugins.join(', ')}`);
                
                for (const pluginName of macPlugins) {
                    try {
                        if (pluginName === 'freebox') {
                            const mac = await this.getMacFromFreebox(ip);
                            if (mac) {
                                logger.info('NetworkScanService', `[MAC] ✓ Found MAC ${mac} for ${ip} from Freebox plugin`);
                                return mac;
                            }
                        } else if (pluginName === 'unifi') {
                            const mac = await this.getMacFromUniFi(ip);
                            if (mac) {
                                logger.info('NetworkScanService', `[MAC] ✓ Found MAC ${mac} for ${ip} from UniFi plugin`);
                                return mac;
                            }
                        }
                    } catch (error: any) {
                        logger.debug('NetworkScanService', `[MAC] Plugin ${pluginName} failed for ${ip}: ${error.message || error}`);
                        // Continue to next plugin
                    }
                }
                
                logger.info('NetworkScanService', `[MAC] All plugins failed or returned no MAC for ${ip}, trying system methods...`);
            } else {
                logger.info('NetworkScanService', `[MAC] No MAC-capable plugins enabled for ${ip}, using system methods only`);
            }
            
            // Step 2: Try system methods (fallback if no plugins or all plugins failed)
            // These methods should work even without plugins, especially important in Docker
            if (isWindows) {
                // Windows: arp -a
                logger.debug('NetworkScanService', `[MAC] Trying Windows arp -a for ${ip}...`);
                try {
                const { stdout } = await execAsync(`arp -a ${ip}`);
                const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                if (match) {
                        const mac = match[0].toLowerCase().replace(/-/g, ':');
                        logger.info('NetworkScanService', `[MAC] ✓ Found MAC ${mac} for ${ip} using Windows arp`);
                        return mac;
                    }
                } catch (error: any) {
                    logger.debug('NetworkScanService', `[MAC] Windows arp failed for ${ip}: ${error.message || error}`);
                }
            } else {
                // Linux/Mac: Try multiple methods for better detection (like WatchYourLAN)
                
                // Method 1: Try ip neigh get (forces ARP request if not in table)
                // This is more reliable than 'show' as it will query if needed
                // In Docker, we need to ensure we can access the host's network namespace
                try {
                    // First try to force an ARP request
                    logger.debug('NetworkScanService', `[MAC] Trying ip neigh get/show for ${ip}...`);
                    const { stdout } = await execAsync(`ip neigh get ${ip} 2>/dev/null || ip neigh show ${ip}`, { timeout: 3000 });
                    logger.debug('NetworkScanService', `[MAC] ip neigh output for ${ip}: ${stdout.substring(0, 100)}`);
                    const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                    if (match) {
                        const mac = match[0].toLowerCase().replace(/-/g, ':');
                        // Filter out invalid MACs (00:00:00:00:00:00)
                        if (mac !== '00:00:00:00:00:00' && mac.length === 17) {
                            logger.info('NetworkScanService', `[MAC] Found MAC ${mac} for ${ip} using ip neigh`);
                            return mac;
                        } else {
                            logger.debug('NetworkScanService', `[MAC] Invalid MAC found for ${ip}: ${mac}`);
                        }
                    } else {
                        logger.debug('NetworkScanService', `[MAC] No MAC pattern found in ip neigh output for ${ip}`);
                    }
                } catch (error: any) {
                    logger.debug('NetworkScanService', `[MAC] ip neigh get/show failed for ${ip}: ${error.message || error}`);
                    // Try alternative: ip neigh show (read-only, faster)
                    try {
                        logger.debug('NetworkScanService', `[MAC] Trying ip neigh show (fallback) for ${ip}...`);
                        const { stdout } = await execAsync(`ip neigh show ${ip} 2>/dev/null`, { timeout: 1000 });
                        const match = stdout.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
                        if (match) {
                            const mac = match[0].toLowerCase().replace(/-/g, ':');
                            if (mac !== '00:00:00:00:00:00' && mac.length === 17) {
                                logger.info('NetworkScanService', `[MAC] Found MAC ${mac} for ${ip} using ip neigh show`);
                                return mac;
                            }
                        }
                    } catch (error2: any) {
                        logger.debug('NetworkScanService', `[MAC] ip neigh show also failed for ${ip}: ${error2.message || error2}`);
                    }
                }
                
                // Method 2: Try reading /proc/net/arp (Linux only)
                // In Docker, try /host/proc/net/arp first (mounted from host), then container /proc/net/arp
                const hostPathPrefix = getHostPathPrefix();
                const arpPaths = hostPathPrefix 
                    ? [`${hostPathPrefix}/proc/net/arp`, '/proc/net/arp']  // Try host first, then container
                    : ['/proc/net/arp'];  // Only container path
                
                for (const arpPath of arpPaths) {
                    try {
                        logger.debug('NetworkScanService', `[MAC] Trying ${arpPath} for ${ip}...`);
                        const { stdout } = await execAsync(`cat ${arpPath} 2>/dev/null | grep "^${ip.replace(/\./g, '\\.')} "`, { timeout: 1000 });
                        logger.debug('NetworkScanService', `[MAC] ${arpPath} output for ${ip}: ${stdout.substring(0, 100)}`);
                        const parts = stdout.trim().split(/\s+/);
                        if (parts.length >= 4 && parts[3] !== '00:00:00:00:00:00') {
                            const mac = parts[3].toLowerCase().replace(/-/g, ':');
                            if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) {
                                logger.info('NetworkScanService', `[MAC] Found MAC ${mac} for ${ip} using ${arpPath}`);
                                return mac;
                            } else {
                                logger.debug('NetworkScanService', `[MAC] Invalid MAC format from ${arpPath} for ${ip}: ${mac}`);
                            }
                        } else {
                            logger.debug('NetworkScanService', `[MAC] No valid MAC found in ${arpPath} for ${ip}`);
                        }
                    } catch (error: any) {
                        logger.debug('NetworkScanService', `[MAC] ${arpPath} failed for ${ip}: ${error.message || error}`);
                        // Continue to next path
                    }
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
                } catch (error: any) {
                    logger.debug('NetworkScanService', `[MAC] Traditional arp command failed for ${ip}: ${error.message || error}`);
                    // Continue - all system methods have been tried
                }
            }
            
            // All methods (plugins and system) have been tried and failed
            logger.info('NetworkScanService', `[MAC] ✗ All detection methods failed for ${ip}`);
        } catch (error) {
            // Unexpected error during MAC detection
            logger.error('NetworkScanService', `[MAC] Unexpected error during MAC detection for ${ip}:`, error);
        }
        
        return null;
    }

    /**
     * Initialize plugin stats cache at the start of a scan
     * This avoids repeated getStats() calls which can be slow (especially for Freebox Revolution)
     */
    private async initializePluginStatsCache(): Promise<void> {
        // Clear existing cache
        this.cachedFreeboxStats = null;
        this.cachedUniFiStats = null;
        this.cacheTimestamp = 0;

        // Get plugin priority config to determine which plugins are enabled
        const config = PluginPriorityConfigService.getConfig();
        const priority = config.vendorPriority;
        const macPlugins = priority.filter(p => p === 'freebox' || p === 'unifi');

        // Cache Freebox stats if plugin is enabled
        if (macPlugins.includes('freebox')) {
            try {
                const freeboxPlugin = pluginManager.getPlugin('freebox');
                if (freeboxPlugin && freeboxPlugin.isEnabled()) {
                    logger.info('NetworkScanService', '[Cache] Initializing Freebox stats cache...');
                    this.cachedFreeboxStats = await freeboxPlugin.getStats();
                    this.cacheTimestamp = Date.now();
                    logger.info('NetworkScanService', '[Cache] Freebox stats cached successfully');
                }
            } catch (error: any) {
                logger.warn('NetworkScanService', `[Cache] Failed to cache Freebox stats: ${error.message || error}. Will use fallback.`);
                // Continue without cache - getMacFromFreebox() will call getStats() directly
            }
        }

        // Cache UniFi stats if plugin is enabled
        if (macPlugins.includes('unifi')) {
            try {
                const unifiPlugin = pluginManager.getPlugin('unifi');
                if (unifiPlugin && unifiPlugin.isEnabled()) {
                    logger.info('NetworkScanService', '[Cache] Initializing UniFi stats cache...');
                    this.cachedUniFiStats = await unifiPlugin.getStats();
                    if (!this.cacheTimestamp) {
                        this.cacheTimestamp = Date.now();
                    }
                    logger.info('NetworkScanService', '[Cache] UniFi stats cached successfully');
                }
            } catch (error: any) {
                logger.warn('NetworkScanService', `[Cache] Failed to cache UniFi stats: ${error.message || error}. Will use fallback.`);
                // Continue without cache - getMacFromUniFi() will call getStats() directly
            }
        }
    }

    /**
     * Invalidate plugin stats cache after scan completes
     */
    private invalidatePluginStatsCache(): void {
        this.cachedFreeboxStats = null;
        this.cachedUniFiStats = null;
        this.cacheTimestamp = 0;
        logger.debug('NetworkScanService', '[Cache] Plugin stats cache invalidated');
    }

    /**
     * Get MAC address from Freebox plugin
     * @param ip IP address
     * @returns MAC address or null if not found
     */
    private async getMacFromFreebox(ip: string): Promise<string | null> {
        try {
            const freeboxPlugin = pluginManager.getPlugin('freebox');
            if (!freeboxPlugin || !freeboxPlugin.isEnabled()) {
                logger.debug('NetworkScanService', `[MAC] Freebox plugin not available or disabled for ${ip}`);
                return null;
            }
            
            // Use cached stats if available and still valid, otherwise fetch fresh stats
            let stats: any;
            if (this.cachedFreeboxStats && this.cacheTimestamp && (Date.now() - this.cacheTimestamp) < this.CACHE_TTL) {
                stats = this.cachedFreeboxStats;
                logger.debug('NetworkScanService', `[MAC] Using cached Freebox stats for ${ip}`);
            } else {
                // Cache expired or not available, fetch fresh stats
                stats = await freeboxPlugin.getStats();
                logger.debug('NetworkScanService', `[MAC] Fetched fresh Freebox stats for ${ip} (cache expired or unavailable)`);
            }
            if (!stats?.devices || !Array.isArray(stats.devices)) {
                logger.debug('NetworkScanService', `[MAC] No devices found in Freebox stats for ${ip}`);
                return null;
            }
            
            // Find device by IP
            const device = stats.devices.find((d: any) => d.ip === ip);
            if (device && device.mac) {
                const mac = device.mac.toLowerCase().trim();
                // Validate MAC format
                if (/^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$/.test(mac)) {
                    logger.info('NetworkScanService', `[MAC] Found MAC ${mac} for ${ip} from Freebox`);
                    return mac.replace(/-/g, ':');
                } else {
                    logger.debug('NetworkScanService', `[MAC] Invalid MAC format from Freebox for ${ip}: ${mac}`);
                }
            } else {
                logger.debug('NetworkScanService', `[MAC] Device not found in Freebox stats for ${ip}`);
            }
        } catch (error: any) {
            logger.debug('NetworkScanService', `[MAC] Freebox lookup failed for ${ip}: ${error.message || error}`);
        }
        return null;
    }

    /**
     * Get MAC address from UniFi plugin
     * @param ip IP address
     * @returns MAC address or null if not found
     */
    private async getMacFromUniFi(ip: string): Promise<string | null> {
        try {
            const unifiPlugin = pluginManager.getPlugin('unifi');
            if (!unifiPlugin || !unifiPlugin.isEnabled()) {
                logger.debug('NetworkScanService', `[MAC] UniFi plugin not available or disabled for ${ip}`);
                return null;
            }
            
            // Use cached stats if available and still valid, otherwise fetch fresh stats
            let stats: any;
            if (this.cachedUniFiStats && this.cacheTimestamp && (Date.now() - this.cacheTimestamp) < this.CACHE_TTL) {
                stats = this.cachedUniFiStats;
                logger.debug('NetworkScanService', `[MAC] Using cached UniFi stats for ${ip}`);
            } else {
                // Cache expired or not available, fetch fresh stats
                stats = await unifiPlugin.getStats();
                logger.debug('NetworkScanService', `[MAC] Fetched fresh UniFi stats for ${ip} (cache expired or unavailable)`);
            }
            if (!stats?.devices || !Array.isArray(stats.devices)) {
                logger.debug('NetworkScanService', `[MAC] No devices found in UniFi stats for ${ip}`);
                return null;
            }
            
            // Find device by IP (devices can be access points, switches, or clients)
            const device = stats.devices.find((d: any) => d.ip === ip);
            if (device && device.mac) {
                const mac = device.mac.toLowerCase().trim();
                // Validate MAC format
                if (/^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$/.test(mac)) {
                    logger.info('NetworkScanService', `[MAC] Found MAC ${mac} for ${ip} from UniFi`);
                    return mac.replace(/-/g, ':');
                } else {
                    logger.debug('NetworkScanService', `[MAC] Invalid MAC format from UniFi for ${ip}: ${mac}`);
                }
            } else {
                logger.debug('NetworkScanService', `[MAC] Device not found in UniFi stats for ${ip}`);
            }
        } catch (error: any) {
            logger.debug('NetworkScanService', `[MAC] UniFi lookup failed for ${ip}: ${error.message || error}`);
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
     * Get hostname for an IP using multiple methods with priority configuration
     * Returns hostname and its source
     * 
     * @param ip IP address
     * @param existingScan Optional existing scan data to check for conflicts
     * @returns Object with hostname and source, or null if not found
     */
    async getHostnameWithSource(ip: string, existingScan?: NetworkScan): Promise<{ hostname: string; source: string } | null> {
        const config = PluginPriorityConfigService.getConfig();
        const priority = config.hostnamePriority;
        const overwrite = config.overwriteExisting.hostname;
        
        // NEVER overwrite manual hostnames, regardless of overwrite setting
        const isManualHostname = existingScan?.hostnameSource === 'manual' && 
                                 existingScan?.hostname && 
                                 existingScan.hostname.trim().length > 0;
        
        if (isManualHostname) {
            logger.debug('NetworkScanService', `[${ip}] Preserving manual hostname: ${existingScan.hostname} (never overwritten)`);
            return null; // Return null to indicate we should keep the existing manual hostname
        }
        
        // Try each plugin in priority order
        for (const pluginName of priority) {
            if (pluginName === 'freebox') {
                const result = await this.getHostnameFromFreebox(ip);
                if (result) {
                    // Check if we should overwrite existing data (but manual hostnames are already handled above)
                    if (existingScan?.hostname && !overwrite && existingScan.hostname.trim().length > 0) {
                        logger.debug('NetworkScanService', `[${ip}] Keeping existing hostname (overwrite disabled): ${existingScan.hostname}`);
                        continue; // Skip to next plugin
                    }
                    return { hostname: result, source: 'freebox' };
                }
            } else if (pluginName === 'unifi') {
                const result = await this.getHostnameFromUniFi(ip);
                if (result) {
                    if (existingScan?.hostname && !overwrite && existingScan.hostname.trim().length > 0) {
                        logger.debug('NetworkScanService', `[${ip}] Keeping existing hostname (overwrite disabled): ${existingScan.hostname}`);
                        continue;
                    }
                    return { hostname: result, source: 'unifi' };
                }
            } else if (pluginName === 'scanner') {
                // Scanner methods (reverse DNS, NetBIOS, etc.)
                const result = await this.getHostnameFromSystem(ip);
                if (result) {
                    if (existingScan?.hostname && !overwrite && existingScan.hostname.trim().length > 0) {
                        logger.debug('NetworkScanService', `[${ip}] Keeping existing hostname (overwrite disabled): ${existingScan.hostname}`);
                        continue;
                    }
                    return { hostname: result, source: 'scanner' };
                }
            }
        }
        
        return null;
    }
    
    /**
     * Get hostname from Freebox plugin
     */
    private async getHostnameFromFreebox(ip: string): Promise<string | null> {
        try {
            const freeboxPlugin = pluginManager.getPlugin('freebox');
            if (!freeboxPlugin || !freeboxPlugin.isEnabled()) return null;
            
            const stats = await freeboxPlugin.getStats();
            if (!stats?.devices || !Array.isArray(stats.devices)) return null;
            
            // Try by IP first
            const device = stats.devices.find((d: any) => d.ip === ip);
            if (device) {
                const hostname = (device.hostname || device.name) as string | undefined;
                if (this.isValidHostname(hostname, ip)) {
                    return hostname!.split('.')[0];
                }
            }
            
            // Try by MAC
            const existingScan = NetworkScanRepository.findByIp(ip);
            if (existingScan?.mac) {
                const deviceByMac = stats.devices.find((d: any) => {
                    const deviceMac = (d.mac || '').toLowerCase().replace(/[:-]/g, '');
                    const scanMac = existingScan.mac.toLowerCase().replace(/[:-]/g, '');
                    return deviceMac === scanMac;
                });
                if (deviceByMac) {
                    const hostname = (deviceByMac.hostname || deviceByMac.name) as string | undefined;
                    if (this.isValidHostname(hostname, ip)) {
                        return hostname!.split('.')[0];
                    }
                }
            }
        } catch (error: any) {
            logger.debug('NetworkScanService', `Freebox hostname lookup failed for ${ip}: ${error.message || error}`);
        }
        return null;
    }
    
    /**
     * Get hostname from UniFi plugin
     */
    private async getHostnameFromUniFi(ip: string): Promise<string | null> {
        try {
            const unifiPlugin = pluginManager.getPlugin('unifi');
            if (!unifiPlugin || !unifiPlugin.isEnabled()) return null;
            
            const stats = await unifiPlugin.getStats();
            if (!stats?.devices || !Array.isArray(stats.devices)) return null;
            
            // Try by IP first
            const device = stats.devices.find((d: any) => d.ip === ip);
            if (device) {
                const hostname = (device.hostname || device.name) as string | undefined;
                if (this.isValidHostname(hostname, ip)) {
                    return hostname!.split('.')[0];
                }
            }
            
            // Try by MAC
            const existingScan = NetworkScanRepository.findByIp(ip);
            if (existingScan?.mac) {
                const deviceByMac = stats.devices.find((d: any) => {
                    const deviceMac = (d.mac || '').toLowerCase().replace(/[:-]/g, '');
                    const scanMac = existingScan.mac.toLowerCase().replace(/[:-]/g, '');
                    return deviceMac === scanMac;
                });
                if (deviceByMac) {
                    const hostname = (deviceByMac.hostname || deviceByMac.name) as string | undefined;
                    if (this.isValidHostname(hostname, ip)) {
                        return hostname!.split('.')[0];
                    }
                }
            }
        } catch (error: any) {
            logger.debug('NetworkScanService', `UniFi hostname lookup failed for ${ip}: ${error.message || error}`);
        }
        return null;
    }
    
    /**
     * Get hostname from system methods (reverse DNS, NetBIOS, etc.)
     */
    private async getHostnameFromSystem(ip: string): Promise<string | null> {
        // This will call the existing getHostname method but skip plugins
        // For now, we'll use the existing logic but skip plugin parts
        return await this.getHostnameSystemOnly(ip);
    }
    
    /**
     * Get hostname for an IP (backward compatibility)
     * Uses priority configuration and returns just the hostname
     * 
     * @param ip IP address
     * @returns Hostname or null if not found
     */
    async getHostname(ip: string): Promise<string | null> {
        const result = await this.getHostnameWithSource(ip);
        return result?.hostname || null;
    }

    /**
     * Get vendor for a MAC address using multiple methods with priority configuration
     * Returns vendor and its source
     * @param mac MAC address
     * @param ip IP address (for plugin lookup)
     * @param existingScan Optional existing scan data to check for conflicts
     * @returns Object with vendor and source, or null if not found
     */
    async getVendorWithSource(mac: string, ip: string, existingScan?: NetworkScan): Promise<{ vendor: string; source: string } | null> {
        // Si MAC vide mais IP connue, essayer de récupérer MAC depuis Freebox
        let macToUse = mac;
        if (!macToUse || macToUse.trim().length === 0) {
            logger.info('NetworkScanService', `[${ip}] No MAC provided, trying to get from Freebox...`);
            const macFromFreebox = await this.getMacFromFreebox(ip);
            if (macFromFreebox) {
                macToUse = macFromFreebox;
                logger.info('NetworkScanService', `[${ip}] Got MAC from Freebox: ${macFromFreebox}`);
            }
        }
        
        // Si toujours pas de MAC, essayer vendor directement depuis Freebox par IP
        if (!macToUse || macToUse.trim().length === 0) {
            logger.info('NetworkScanService', `[${ip}] No MAC available, trying vendor detection by IP from Freebox...`);
            const vendorFromFreebox = await this.getVendorFromFreeboxByIp(ip);
            if (vendorFromFreebox) {
                return { vendor: vendorFromFreebox, source: 'freebox' };
            }
        }

        const config = PluginPriorityConfigService.getConfig();
        const priority = config.vendorPriority;
        const overwrite = config.overwriteExisting.vendor;
        
        // Check if existing vendor should be considered as "empty" (empty string, "--", null, undefined, or "unknown")
        // If empty, we ALWAYS try to find a vendor (overwrite empty values)
        const existingVendor = existingScan?.vendor?.trim() || '';
        const isEmptyVendor = !existingVendor || 
            existingVendor === '' || 
            existingVendor === '--' || 
            existingVendor.toLowerCase() === 'unknown';
        
        const hasValidExistingVendor = !isEmptyVendor;
        
        logger.info('NetworkScanService', `[${ip}] Starting vendor detection for MAC ${macToUse || '(none)'}, priority: [${priority.join(', ')}], overwrite: ${overwrite}, existing: "${existingVendor || '(empty)'}"`);
        
        // If vendor exists and is valid AND overwrite is disabled, keep existing
        if (hasValidExistingVendor && !overwrite) {
            logger.info('NetworkScanService', `[${ip}] Keeping existing vendor (overwrite disabled): ${existingVendor} (source: ${existingScan?.vendorSource || 'unknown'})`);
            return null; // Return null to preserve existing vendor
        }
        
        // If vendor is empty, always try to find one (even if overwrite is disabled)
        if (isEmptyVendor) {
            logger.info('NetworkScanService', `[${ip}] Existing vendor is empty, will search for vendor (overwrite empty values)`);
        }
        
        // Try each plugin in priority order
        for (const pluginName of priority) {
            logger.info('NetworkScanService', `[${ip}] Trying vendor detection with plugin: ${pluginName}`);
            
            if (pluginName === 'freebox') {
                // Use macToUse (may be from Freebox if original MAC was empty)
                const result = macToUse ? await this.getVendorFromFreebox(macToUse, ip) : await this.getVendorFromFreeboxByIp(ip);
                if (result) {
                    logger.info('NetworkScanService', `[${ip}] ✓ Found vendor from Freebox: ${result}`);
                    return { vendor: result, source: 'freebox' };
                } else {
                    logger.debug('NetworkScanService', `[${ip}] ✗ No vendor found from Freebox`);
                }
            } else if (pluginName === 'unifi') {
                const result = macToUse ? await this.getVendorFromUniFi(macToUse, ip) : null;
                if (result) {
                    logger.info('NetworkScanService', `[${ip}] ✓ Found vendor from UniFi: ${result}`);
                    return { vendor: result, source: 'unifi' };
                } else {
                    logger.debug('NetworkScanService', `[${ip}] ✗ No vendor found from UniFi`);
                }
            } else if (pluginName === 'scanner') {
                // Scanner methods (Wireshark DB, local DB, API) - requires MAC
                if (macToUse) {
                    const result = await this.getVendorFromScanner(macToUse);
                    if (result) {
                        logger.info('NetworkScanService', `[${ip}] ✓ Found vendor from Scanner (${result.source}): ${result.vendor}`);
                        return { vendor: result.vendor, source: result.source };
                    } else {
                        logger.debug('NetworkScanService', `[${ip}] ✗ No vendor found from Scanner`);
                    }
                } else {
                    logger.debug('NetworkScanService', `[${ip}] ✗ Scanner requires MAC, skipping`);
                }
            }
        }
        
        logger.info('NetworkScanService', `[${ip}] ✗ No vendor found after trying all plugins in priority order`);
        return null;
    }

    /**
     * Get vendor from Freebox by IP (when MAC not available)
     */
    private async getVendorFromFreeboxByIp(ip: string): Promise<string | null> {
        try {
            const freeboxPlugin = pluginManager.getPlugin('freebox');
            if (!freeboxPlugin || !freeboxPlugin.isEnabled()) {
                return null;
            }
            
            const stats = await freeboxPlugin.getStats();
            if (!stats?.devices || !Array.isArray(stats.devices)) {
                return null;
            }
            
            const device = stats.devices.find((d: any) => d.ip === ip);
            if (device) {
                const vendor = device.type || device.vendor_name;
                if (vendor && typeof vendor === 'string' && vendor !== 'unknown' && vendor.trim().length > 0) {
                    logger.info('NetworkScanService', `[VENDOR] Freebox: ✓ Found vendor ${vendor} by IP ${ip}`);
                    return vendor.trim();
                }
            }
        } catch (error: any) {
            logger.debug('NetworkScanService', `[VENDOR] Freebox lookup by IP failed for ${ip}: ${error.message || error}`);
        }
        return null;
    }
    
    /**
     * Get vendor from Freebox plugin
     */
    private async getVendorFromFreebox(mac: string, ip: string): Promise<string | null> {
        try {
            logger.debug('NetworkScanService', `[VENDOR] Freebox: Looking up vendor for MAC ${mac}, IP ${ip}`);
            
            const freeboxPlugin = pluginManager.getPlugin('freebox');
            if (!freeboxPlugin || !freeboxPlugin.isEnabled()) {
                logger.debug('NetworkScanService', `[VENDOR] Freebox: Plugin not available or disabled`);
                return null;
            }
            
            const stats = await freeboxPlugin.getStats();
            if (!stats?.devices || !Array.isArray(stats.devices)) {
                logger.debug('NetworkScanService', `[VENDOR] Freebox: No devices found in stats`);
                return null;
            }
            
            logger.debug('NetworkScanService', `[VENDOR] Freebox: Checking ${stats.devices.length} devices`);
            
            // Try by MAC first (more reliable)
            const normalizedMac = mac.toLowerCase().replace(/[:-]/g, '');
            const device = stats.devices.find((d: any) => {
                const deviceMac = (d.mac || '').toLowerCase().replace(/[:-]/g, '');
                return deviceMac === normalizedMac;
            });
            
            if (!device) {
                // Try by IP as fallback
                logger.debug('NetworkScanService', `[VENDOR] Freebox: Device not found by MAC, trying IP ${ip}`);
                const deviceByIp = stats.devices.find((d: any) => d.ip === ip);
                if (deviceByIp && deviceByIp.mac) {
                    const deviceMac = (deviceByIp.mac || '').toLowerCase().replace(/[:-]/g, '');
                    if (deviceMac === normalizedMac) {
                        const vendor = deviceByIp.type || deviceByIp.vendor_name;
                        if (vendor && typeof vendor === 'string' && vendor !== 'unknown' && vendor.trim().length > 0) {
                            logger.debug('NetworkScanService', `[VENDOR] Freebox: ✓ Found vendor ${vendor} (via IP)`);
                            return vendor.trim();
                        }
                    }
                }
                logger.debug('NetworkScanService', `[VENDOR] Freebox: ✗ Device not found for MAC ${mac} or IP ${ip}`);
                return null;
            }
            
            // Freebox provides vendor_name in the 'type' field
            const vendor = device.type || device.vendor_name;
            if (vendor && typeof vendor === 'string' && vendor !== 'unknown' && vendor.trim().length > 0) {
                logger.debug('NetworkScanService', `[VENDOR] Freebox: ✓ Found vendor ${vendor} (via MAC)`);
                return vendor.trim();
            } else {
                logger.debug('NetworkScanService', `[VENDOR] Freebox: ✗ No vendor field found in device data`);
            }
        } catch (error: any) {
            logger.error('NetworkScanService', `[VENDOR] Freebox: Vendor lookup failed for ${ip}: ${error.message || error}`);
        }
        return null;
    }

    /**
     * Get vendor from UniFi plugin
     */
    private async getVendorFromUniFi(mac: string, ip: string): Promise<string | null> {
        try {
            logger.debug('NetworkScanService', `[VENDOR] UniFi: Looking up vendor for MAC ${mac}, IP ${ip}`);
            
            const unifiPlugin = pluginManager.getPlugin('unifi');
            if (!unifiPlugin || !unifiPlugin.isEnabled()) {
                logger.debug('NetworkScanService', `[VENDOR] UniFi: Plugin not available or disabled`);
                return null;
            }
            
            const stats = await unifiPlugin.getStats();
            if (!stats?.devices || !Array.isArray(stats.devices)) {
                logger.debug('NetworkScanService', `[VENDOR] UniFi: No devices found in stats`);
                return null;
            }
            
            logger.debug('NetworkScanService', `[VENDOR] UniFi: Checking ${stats.devices.length} devices`);
            
            // Try by MAC first (more reliable)
            const normalizedMac = mac.toLowerCase().replace(/[:-]/g, '');
            const device = stats.devices.find((d: any) => {
                const deviceMac = (d.mac || '').toLowerCase().replace(/[:-]/g, '');
                return deviceMac === normalizedMac;
            });
            
            if (!device) {
                // Try by IP as fallback
                logger.debug('NetworkScanService', `[VENDOR] UniFi: Device not found by MAC, trying IP ${ip}`);
                const deviceByIp = stats.devices.find((d: any) => d.ip === ip);
                if (deviceByIp && deviceByIp.mac) {
                    const deviceMac = (deviceByIp.mac || '').toLowerCase().replace(/[:-]/g, '');
                    if (deviceMac === normalizedMac) {
                        const vendor = deviceByIp.vendor || deviceByIp.vendor_name || deviceByIp.type;
                        if (vendor && typeof vendor === 'string' && vendor !== 'unknown' && vendor.trim().length > 0) {
                            logger.debug('NetworkScanService', `[VENDOR] UniFi: ✓ Found vendor ${vendor} (via IP)`);
                            return vendor.trim();
                        }
                    }
                }
                logger.debug('NetworkScanService', `[VENDOR] UniFi: ✗ Device not found for MAC ${mac} or IP ${ip}`);
                return null;
            }
            
            const vendor = device.vendor || device.vendor_name || device.type;
            if (vendor && typeof vendor === 'string' && vendor !== 'unknown' && vendor.trim().length > 0) {
                logger.debug('NetworkScanService', `[VENDOR] UniFi: ✓ Found vendor ${vendor} (via MAC)`);
                return vendor.trim();
            } else {
                logger.debug('NetworkScanService', `[VENDOR] UniFi: ✗ No vendor field found in device data`);
            }
        } catch (error: any) {
            logger.error('NetworkScanService', `[VENDOR] UniFi: Vendor lookup failed for ${ip}: ${error.message || error}`);
        }
        return null;
    }

    /**
     * Get vendor from scanner methods (Wireshark DB, local DB, API)
     */
    private async getVendorFromScanner(mac: string): Promise<{ vendor: string; source: string } | null> {
        try {
            // Normalize MAC address and extract OUI (first 3 octets)
            // MAC can be in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
            // OUI needs to be in format XX:XX:XX (with colons)
            const normalizedMac = mac.toLowerCase().trim();
            let oui: string;
            
            if (normalizedMac.includes(':')) {
                // Format: XX:XX:XX:XX:XX:XX
                oui = normalizedMac.split(':').slice(0, 3).join(':');
            } else if (normalizedMac.includes('-')) {
                // Format: XX-XX-XX-XX-XX-XX
                oui = normalizedMac.split('-').slice(0, 3).join(':');
            } else {
                // Format: XXXXXXXXXXXX (no separators)
                oui = `${normalizedMac.substring(0, 2)}:${normalizedMac.substring(2, 4)}:${normalizedMac.substring(4, 6)}`;
            }
            
            logger.debug('NetworkScanService', `[VENDOR] Scanner: Looking up OUI ${oui} for MAC ${mac}`);
            
            // First try Wireshark database
            try {
                const wiresharkVendor = WiresharkVendorService.lookupVendor(oui);
                if (wiresharkVendor) {
                    logger.debug('NetworkScanService', `[VENDOR] Scanner: ✓ Found vendor from Wireshark DB: ${wiresharkVendor}`);
                    return { vendor: wiresharkVendor, source: 'scanner' };
                } else {
                    logger.debug('NetworkScanService', `[VENDOR] Scanner: ✗ No vendor found in Wireshark DB for OUI ${oui}`);
                }
            } catch (error: any) {
                logger.debug('NetworkScanService', `[VENDOR] Scanner: Wireshark lookup failed for OUI ${oui}: ${error.message || error}`);
            }
            
            // Then try local database (vendorDetectionService includes local OUI DB)
            let vendor = vendorDetectionService.detectVendor(mac);
            if (vendor) {
                logger.debug('NetworkScanService', `[VENDOR] Scanner: ✓ Found vendor from local OUI DB: ${vendor}`);
                return { vendor, source: 'scanner' };
            } else {
                logger.debug('NetworkScanService', `[VENDOR] Scanner: ✗ No vendor found in local OUI DB for MAC ${mac}`);
            }
            
            // If not found locally, try API
            logger.debug('NetworkScanService', `[VENDOR] Scanner: Trying API lookup for MAC ${mac}...`);
            vendor = await vendorDetectionService.detectVendorFromApi(mac);
            if (vendor) {
                logger.debug('NetworkScanService', `[VENDOR] Scanner: ✓ Found vendor from API: ${vendor}`);
                return { vendor, source: 'api' };
            } else {
                logger.debug('NetworkScanService', `[VENDOR] Scanner: ✗ No vendor found from API for MAC ${mac}`);
            }
        } catch (error: any) {
            logger.error('NetworkScanService', `[VENDOR] Scanner: Vendor detection failed for MAC ${mac}: ${error.message || error}`);
        }
        
        logger.debug('NetworkScanService', `[VENDOR] Scanner: ✗ No vendor found for MAC ${mac} after trying all methods`);
        return null;
    }
    
    /**
     * Validate hostname format
     */
    private isValidHostname(hostname: string | undefined, ip: string): boolean {
        return !!(
            hostname &&
            typeof hostname === 'string' &&
            hostname !== ip &&
            !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
            hostname.length > 0 &&
            hostname.length < 64
        );
    }
    
    /**
     * Get hostname for an IP using multiple methods (system only, no plugins)
     * Tries reverse DNS, getent hosts, /etc/hosts, and NetBIOS/SMB
     * 
     * @param ip IP address
     * @returns Hostname or null if not found
     */
    private async getHostnameSystemOnly(ip: string): Promise<string | null> {
        logger.info('NetworkScanService', `[HOSTNAME] Starting system hostname detection for ${ip}...`);
        
        // Method 1: Try reverse DNS lookup (PTR record)
        // Note: Reverse DNS often doesn't work for local network IPs, but worth trying
        try {
            logger.info('NetworkScanService', `[HOSTNAME] Method 1: Trying reverse DNS (PTR) for ${ip}...`);
            const hostnames = await dnsReverseAsync(ip);
            if (hostnames && hostnames.length > 0 && hostnames[0]) {
                const hostname = hostnames[0].trim();
                logger.info('NetworkScanService', `[HOSTNAME] Reverse DNS returned: ${hostname}`);
                // Filter out generic reverse DNS entries and IP addresses
                // Also filter out hostnames that are just IPs or invalid
                if (hostname && 
                    !hostname.includes('in-addr.arpa') && 
                    hostname.length > 0 &&
                    hostname.length < 64 && // Max hostname length
                    hostname !== ip && // Don't return IP as hostname
                    !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && // Don't return IP-like strings
                    !hostname.toLowerCase().includes(ip.replace(/\./g, '-')) && // Don't return IP with dashes
                    /^[a-zA-Z0-9.-]+$/.test(hostname)) { // Only valid hostname characters
                    // Extract first part before dot (hostname, not FQDN)
                    const shortHostname = hostname.split('.')[0];
                    if (shortHostname && shortHostname.length > 0 && shortHostname.length < 64) {
                        logger.info('NetworkScanService', `[HOSTNAME] ✓ Found hostname ${shortHostname} for ${ip} using reverse DNS`);
                        return shortHostname;
                    }
                } else {
                    logger.info('NetworkScanService', `[HOSTNAME] ✗ Reverse DNS returned invalid hostname: ${hostname}`);
                }
            } else {
                logger.info('NetworkScanService', `[HOSTNAME] ✗ Reverse DNS returned no results for ${ip}`);
            }
        } catch (error: any) {
            logger.info('NetworkScanService', `[HOSTNAME] ✗ Reverse DNS failed for ${ip}: ${error.message || error}`);
        }
        
        if (isWindows) {
            // Windows: Try NetBIOS name resolution
            try {
                const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 3000 });
                // Parse NetBIOS output for computer name
                const nameMatch = stdout.match(/<00>\s+UNIQUE\s+([A-Z0-9-]+)/i);
                if (nameMatch && nameMatch[1]) {
                    const hostname = nameMatch[1].trim();
                    // Filter out IP addresses
                    if (hostname && 
                        hostname.length > 0 &&
                        hostname !== ip && // Don't return IP as hostname
                        !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) { // Don't return IP-like strings
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
            // Note: getent may not be available in Alpine Linux (uses musl libc)
            // If getent fails, we'll fall back to reading /etc/hosts directly (Method 3)
            try {
                logger.info('NetworkScanService', `[HOSTNAME] Method 2: Trying getent hosts for ${ip}...`);
                // Try to find getent command (may be in /usr/glibc-compat/bin/getent if glibc is installed)
                let getentCommand = 'getent';
                try {
                    // Check if getent exists in standard locations
                    await execAsync('which getent 2>/dev/null || test -x /usr/glibc-compat/bin/getent', { timeout: 500 });
                    // If glibc-compat is installed, getent might be there
                    try {
                        await execAsync('test -x /usr/glibc-compat/bin/getent', { timeout: 100 });
                        getentCommand = '/usr/glibc-compat/bin/getent';
                    } catch {
                        // Use default getent
                    }
                } catch {
                    // getent not found, skip this method
                    logger.debug('NetworkScanService', `[HOSTNAME] ✗ getent command not found, skipping Method 2`);
                    throw new Error('getent not available');
                }
                
                const { stdout } = await execAsync(`${getentCommand} hosts ${ip} 2>/dev/null`, { timeout: 2000 });
                logger.info('NetworkScanService', `[HOSTNAME] getent hosts output for ${ip}: ${stdout.substring(0, 200)}`);
                const parts = stdout.trim().split(/\s+/);
                if (parts.length >= 2) {
                    // getent hosts returns: IP hostname [aliases...]
                    const hostname = parts[1].trim();
                    logger.info('NetworkScanService', `[HOSTNAME] getent hosts parsed hostname: ${hostname}`);
                    // Filter out IP addresses and generic entries
                    if (hostname && 
                        hostname.length > 0 &&
                        hostname.length < 64 && // Max hostname length
                        !hostname.includes('in-addr.arpa') &&
                        hostname !== ip && // Don't return IP as hostname
                        !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && // Don't return IP-like strings
                        !hostname.toLowerCase().includes(ip.replace(/\./g, '-')) && // Don't return IP with dashes
                        /^[a-zA-Z0-9.-]+$/.test(hostname)) { // Only valid hostname characters
                        // Extract first part before dot (hostname, not FQDN)
                        const shortHostname = hostname.split('.')[0];
                        if (shortHostname && shortHostname.length > 0 && shortHostname.length < 64) {
                            logger.info('NetworkScanService', `[HOSTNAME] ✓ Found hostname ${shortHostname} for ${ip} using getent hosts`);
                            return shortHostname;
                        }
                    } else {
                        logger.info('NetworkScanService', `[HOSTNAME] ✗ getent hosts returned invalid hostname for ${ip}: ${hostname}`);
                    }
                } else {
                    logger.info('NetworkScanService', `[HOSTNAME] ✗ getent hosts returned insufficient data for ${ip} (parts: ${parts.length})`);
                }
            } catch (error: any) {
                logger.info('NetworkScanService', `[HOSTNAME] ✗ getent hosts failed for ${ip}: ${error.message || error}`);
            }
            
            // Method 3: Try reading /etc/hosts directly
            // In Docker, try /host/etc/hosts first (mounted from host), then container /etc/hosts
            const hostPathPrefix = getHostPathPrefix();
            const hostsPaths = hostPathPrefix 
                ? [`${hostPathPrefix}/etc/hosts`, '/etc/hosts']  // Try host first, then container
                : ['/etc/hosts'];  // Only container path
            
            logger.info('NetworkScanService', `[HOSTNAME] Method 3: Trying /etc/hosts files for ${ip} (paths: ${hostsPaths.join(', ')})...`);
            
            for (const hostsPath of hostsPaths) {
                try {
                    logger.info('NetworkScanService', `[HOSTNAME] Trying ${hostsPath} for ${ip}...`);
                    const { stdout } = await execAsync(`grep "^${ip.replace(/\./g, '\\.')}\\s" ${hostsPath} 2>/dev/null | head -1`, { timeout: 1000 });
                    logger.info('NetworkScanService', `[HOSTNAME] ${hostsPath} output for ${ip}: ${stdout.substring(0, 100)}`);
                    const parts = stdout.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        const hostname = parts[1].trim();
                        // Filter out comments, IP addresses, and ensure it's a valid hostname
                        if (hostname && 
                            hostname.length > 0 &&
                            hostname.length < 64 && // Max hostname length
                            !hostname.startsWith('#') &&
                            hostname !== ip && // Don't return IP as hostname
                            !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && // Don't return IP-like strings
                            !hostname.toLowerCase().includes(ip.replace(/\./g, '-')) && // Don't return IP with dashes
                            /^[a-zA-Z0-9.-]+$/.test(hostname)) { // Only valid hostname characters
                            // Extract first part before dot (hostname, not FQDN)
                            const shortHostname = hostname.split('.')[0];
                            if (shortHostname && shortHostname.length > 0 && shortHostname.length < 64) {
                                logger.info('NetworkScanService', `[HOSTNAME] Found hostname ${shortHostname} for ${ip} using ${hostsPath}`);
                                return shortHostname;
                            }
                        } else {
                            logger.debug('NetworkScanService', `[HOSTNAME] ${hostsPath} returned invalid hostname for ${ip}: ${hostname}`);
                        }
                    } else {
                        logger.debug('NetworkScanService', `[HOSTNAME] ${hostsPath} returned insufficient data for ${ip}`);
                    }
                } catch (error: any) {
                    logger.debug('NetworkScanService', `[HOSTNAME] ${hostsPath} lookup failed for ${ip}: ${error.message || error}`);
                    // Continue to next path
                }
            }
            
            // Method 4: Try SMB/NetBIOS (smbclient or nmblookup)
            // NetBIOS is very effective for Windows and Samba devices
            try {
                logger.info('NetworkScanService', `[HOSTNAME] Method 4: Trying nmblookup (NetBIOS) for ${ip}...`);
                // Try nmblookup first (faster, no authentication needed)
                // Use -A for node status query (more reliable)
                const { stdout, stderr } = await execAsync(`nmblookup -A ${ip} 2>&1`, { timeout: 5000 });
                logger.info('NetworkScanService', `[HOSTNAME] nmblookup output for ${ip}: ${stdout.substring(0, 300)}`);
                if (stderr && !stderr.includes('name_query')) {
                    logger.info('NetworkScanService', `[HOSTNAME] nmblookup stderr for ${ip}: ${stderr.substring(0, 200)}`);
                }
                
                // Look for NetBIOS name in output with multiple patterns
                // Format examples:
                //   NAME <00> UNIQUE
                //   NAME <20> UNIQUE
                //   NAME <03> UNIQUE
                //   NAME GROUP
                const patterns = [
                    /([A-Z0-9-]{1,15})\s+<00>\s+UNIQUE/i,  // Workstation service
                    /([A-Z0-9-]{1,15})\s+<20>\s+UNIQUE/i,  // File server service
                    /([A-Z0-9-]{1,15})\s+<03>\s+UNIQUE/i,  // Messenger service
                    /([A-Z0-9-]{1,15})\s+<00>\s+GROUP/i,    // Domain name
                    /([A-Z0-9-]{1,15})\s+UNIQUE/i,          // Generic UNIQUE
                ];
                
                let hostname: string | null = null;
                for (const pattern of patterns) {
                    const match = stdout.match(pattern);
                    if (match && match[1]) {
                        const candidate = match[1].trim();
                        // NetBIOS names are max 15 chars, filter out common invalid patterns
                        if (candidate && 
                            candidate.length > 0 &&
                            candidate.length <= 15 &&
                            candidate !== ip &&
                            !/^\d+\.\d+\.\d+\.\d+$/.test(candidate) &&
                            !candidate.match(/^[0-9]+$/) && // Not just numbers
                            /^[A-Z0-9-]+$/i.test(candidate)) {
                            hostname = candidate;
                            break;
                        }
                    }
                }
                
                if (hostname) {
                    logger.info('NetworkScanService', `[HOSTNAME] ✓ Found hostname ${hostname} for ${ip} using nmblookup`);
                    return hostname;
                } else {
                    logger.info('NetworkScanService', `[HOSTNAME] ✗ nmblookup returned no valid hostname for ${ip}`);
                }
            } catch (error: any) {
                logger.info('NetworkScanService', `[HOSTNAME] ✗ nmblookup failed for ${ip}: ${error.message || error}`);
            }
            
            // Method 5: Try to extract hostname from ARP table (some systems store hostnames there)
            try {
                logger.info('NetworkScanService', `[HOSTNAME] Method 5: Trying ARP table for ${ip}...`);
                const hostPathPrefix = getHostPathPrefix();
                const arpPaths = hostPathPrefix 
                    ? [`${hostPathPrefix}/proc/net/arp`, '/proc/net/arp']
                    : ['/proc/net/arp'];
                
                for (const arpPath of arpPaths) {
                    try {
                        // Read ARP table and look for hostname in comments or additional fields
                        const { stdout } = await execAsync(`cat ${arpPath} 2>/dev/null | grep "^${ip.replace(/\./g, '\\.')} "`, { timeout: 1000 });
                        const parts = stdout.trim().split(/\s+/);
                        // ARP table format: IP HWtype HWaddress Flags Mask IFace [hostname]
                        // Some systems add hostname as last field
                        if (parts.length >= 6) {
                            const possibleHostname = parts[parts.length - 1].trim();
                            if (possibleHostname && 
                                possibleHostname !== ip &&
                                !/^\d+\.\d+\.\d+\.\d+$/.test(possibleHostname) &&
                                /^[a-zA-Z0-9.-]+$/.test(possibleHostname) &&
                                possibleHostname.length > 0 &&
                                possibleHostname.length < 64) {
                                const shortHostname = possibleHostname.split('.')[0];
                                logger.info('NetworkScanService', `[HOSTNAME] ✓ Found hostname ${shortHostname} for ${ip} using ARP table`);
                                return shortHostname;
                            }
                        }
                    } catch (error: any) {
                        logger.debug('NetworkScanService', `[HOSTNAME] ✗ ARP table lookup failed for ${ip} in ${arpPath}: ${error.message || error}`);
                    }
                }
            } catch (error: any) {
                logger.debug('NetworkScanService', `[HOSTNAME] ✗ ARP table method failed for ${ip}: ${error.message || error}`);
            }
            
            // Method 6: Try mDNS/Bonjour (avahi-resolve/avahi-browse) if available
            // mDNS is very effective for Apple devices, IoT devices, and Linux machines
            try {
                logger.info('NetworkScanService', `[HOSTNAME] Method 6: Trying mDNS/Bonjour for ${ip}...`);
                
                // Method 6a: Try avahi-resolve (reverse lookup)
                try {
                    const { stdout } = await execAsync(`avahi-resolve -a ${ip} 2>/dev/null`, { timeout: 3000 });
                    const parts = stdout.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        const hostname = parts[1].trim();
                        if (hostname && 
                            hostname !== ip &&
                            !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
                            /^[a-zA-Z0-9.-]+$/.test(hostname) &&
                            hostname.length > 0 &&
                            hostname.length < 64) {
                            const shortHostname = hostname.split('.')[0];
                            logger.info('NetworkScanService', `[HOSTNAME] ✓ Found hostname ${shortHostname} for ${ip} using avahi-resolve`);
                            return shortHostname;
                        }
                    }
                } catch (error: any) {
                    logger.info('NetworkScanService', `[HOSTNAME] ✗ avahi-resolve failed for ${ip}: ${error.message || error}`);
                }
                
                // Method 6b: Try avahi-browse (browse all services and match IP)
                // This is slower but more comprehensive
                try {
                    // Browse all services and grep for our IP
                    const { stdout } = await execAsync(`timeout 2 avahi-browse -atr 2>/dev/null | grep "${ip}" | head -1`, { timeout: 3000 });
                    if (stdout.trim()) {
                        // Format: hostname [IP] port ...
                        const escapedIp = ip.replace(/\./g, '\\.');
                        const match = stdout.match(new RegExp(`([a-zA-Z0-9.-]+)\\s+\\[${escapedIp}\\]`));
                        if (match && match[1]) {
                            const hostname = match[1].trim();
                            if (hostname && 
                                hostname !== ip &&
                                !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
                                /^[a-zA-Z0-9.-]+$/.test(hostname) &&
                                hostname.length > 0 &&
                                hostname.length < 64) {
                                const shortHostname = hostname.split('.')[0];
                                logger.info('NetworkScanService', `[HOSTNAME] ✓ Found hostname ${shortHostname} for ${ip} using avahi-browse`);
                                return shortHostname;
                            }
                        }
                    }
                } catch (error: any) {
                    logger.info('NetworkScanService', `[HOSTNAME] ✗ avahi-browse failed for ${ip}: ${error.message || error}`);
                }
            } catch (error: any) {
                logger.info('NetworkScanService', `[HOSTNAME] ✗ mDNS lookup failed for ${ip}: ${error.message || error}`);
            }
            
            // Method 7: Try LLMNR (Link-Local Multicast Name Resolution) - Windows and some Linux
            try {
                logger.info('NetworkScanService', `[HOSTNAME] Method 7: Trying LLMNR for ${ip}...`);
                // Use systemd-resolve or resolvectl if available (systemd systems)
                try {
                    const { stdout } = await execAsync(`resolvectl query ${ip} 2>/dev/null | grep -i "name:" | head -1`, { timeout: 2000 });
                    const match = stdout.match(/name:\s+([a-zA-Z0-9.-]+)/i);
                    if (match && match[1]) {
                        const hostname = match[1].trim();
                        if (hostname && 
                            hostname !== ip &&
                            !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
                            /^[a-zA-Z0-9.-]+$/.test(hostname) &&
                            hostname.length > 0 &&
                            hostname.length < 64) {
                            const shortHostname = hostname.split('.')[0];
                            logger.info('NetworkScanService', `[HOSTNAME] ✓ Found hostname ${shortHostname} for ${ip} using LLMNR`);
                            return shortHostname;
                        }
                    }
                } catch (error: any) {
                    // resolvectl not available, skip
                }
            } catch (error: any) {
                logger.info('NetworkScanService', `[HOSTNAME] ✗ LLMNR lookup failed for ${ip}: ${error.message || error}`);
            }
        }
        
        logger.info('NetworkScanService', `[HOSTNAME] ✗ All hostname detection methods failed for ${ip}`);
        return null;
    }

    /**
     * Get current scan progress (if a scan is in progress)
     */
    getScanProgress(): { scanned: number; total: number; found: number; updated: number; isActive: boolean } | null {
        return this.currentScanProgress;
    }

    /**
     * Get last scan result (stored after scan completes)
     */
    getLastScanResult(): {
        range: string;
        scanType: 'full' | 'quick';
        scanned: number;
        found: number;
        updated: number;
        duration: number;
        detectionSummary?: { mac: number; vendor: number; hostname: number };
    } | null {
        return this.lastScanResult;
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
     * Check if an IP belongs to a Docker network that should be ignored.
     *
     * Important notes:
     * - Docker uses 172.17.0.0/16 by default, but many setups use 172.17-31.x.x.
     * - In this application, we also know that 10.10.x.x is used by Docker on some hosts.
     * - We explicitly skip these ranges so that the scanner focuses on the real LAN.
     */
    private isDockerIp(ip: string): boolean {
        if (!ip || !this.isValidIp(ip)) {
            return false;
        }

        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) {
            return false;
        }

        // 172.17.0.0/16 to 172.31.255.255 (typical Docker bridge networks)
        if (parts[0] === 172 && parts[1] >= 17 && parts[1] <= 31) {
            return true;
        }

        // 10.10.0.0/16 (user-specific Docker network where 10.10.1.x is used)
        if (parts[0] === 10 && parts[1] === 10) {
            return true;
        }

        return false;
    }

    /**
     * Get configured default network range from AppConfig.
     * Returns null if no valid configuration is found.
     *
     * This is used to ensure that:
     * - Manual refresh operations only re-ping IPs in the expected LAN range.
     * - History views can be limited to the primary LAN when desired.
     */
    getConfiguredRange(): string | null {
        try {
            const raw = AppConfigRepository.get('network_scan_default');
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.defaultRange === 'string' && parsed.defaultRange.trim().length > 0) {
                return parsed.defaultRange.trim();
            }
            return null;
        } catch (error: any) {
            logger.warn('NetworkScanService', `Failed to parse network_scan_default config: ${error.message || error}`);
            return null;
        }
    }

    /**
     * Check if an IP address belongs to a given range.
     * Supports the same notations as parseIpRange (CIDR and simple last-octet ranges).
     *
     * This helper is intentionally conservative:
     * - For invalid inputs, it returns false instead of throwing.
     * - It only supports IPv4 addresses in dotted notation.
     */
    private isIpInRange(ip: string, range: string): boolean {
        if (!this.isValidIp(ip)) {
            return false;
        }
        const trimmedRange = range.trim();
        if (trimmedRange.length === 0) {
            return false;
        }

        // CIDR notation: 192.168.1.0/24
        if (trimmedRange.includes('/')) {
            const [network, cidrStr] = trimmedRange.split('/');
            const cidr = parseInt(cidrStr, 10);
            if (Number.isNaN(cidr) || cidr < 0 || cidr > 32) {
                return false;
            }

            const networkParts = network.split('.').map(Number);
            const ipParts = ip.split('.').map(Number);
            if (networkParts.length !== 4 || ipParts.length !== 4) {
                return false;
            }
            if (networkParts.some(p => Number.isNaN(p) || p < 0 || p > 255) ||
                ipParts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
                return false;
            }

            const toInt = (parts: number[]): number =>
                (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];

            const mask = cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0;
            const networkInt = toInt(networkParts) & mask;
            const ipInt = toInt(ipParts) & mask;
            return networkInt === ipInt;
        }

        // Simple range notation: 192.168.1.1-254
        if (trimmedRange.includes('-')) {
            const parts = trimmedRange.split('-');
            if (parts.length !== 2) {
                return false;
            }
            const startIp = parts[0].trim();
            const endStr = parts[1].trim();

            const startParts = startIp.split('.').map(Number);
            const ipParts = ip.split('.').map(Number);
            if (startParts.length !== 4 || ipParts.length !== 4) {
                return false;
            }
            if (startParts.some(p => Number.isNaN(p) || p < 0 || p > 255) ||
                ipParts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
                return false;
            }

            const endNum = parseInt(endStr, 10);
            if (Number.isNaN(endNum) || endNum < 1 || endNum > 255) {
                return false;
            }

            const basePrefix = `${startParts[0]}.${startParts[1]}.${startParts[2]}`;
            const basePrefixIp = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
            if (basePrefix !== basePrefixIp) {
                return false;
            }

            const startNum = startParts[3];
            const ipLast = ipParts[3];
            if (endNum < startNum) {
                return false;
            }

            return ipLast >= startNum && ipLast <= endNum;
        }

        // Single IP: exact match
        if (this.isValidIp(trimmedRange)) {
            return ip === trimmedRange;
        }

        return false;
    }

    /**
     * Parse latency from ping output
     * Handles various ping output formats from different systems
     */
    private parsePingLatency(output: string): number | null {
        if (!output || output.trim().length === 0) {
            return null;
        }
        
        // Windows formats (improved detection):
        // "Reply from 192.168.1.1: bytes=32 time<1ms TTL=64"
        // "Reply from 192.168.1.1: bytes=32 time=1ms TTL=64"
        // "Reply from 192.168.1.1: bytes=32 time=10ms TTL=64"
        // Also check for "Reply" keyword which indicates success on Windows
        // Try to match decimal values first (some Windows versions may show decimals)
        const windowsMatchDecimal = output.match(/time[<=]([\d.]+)\s*ms/i);
        if (windowsMatchDecimal) {
            const latency = parseFloat(windowsMatchDecimal[1]);
            return latency >= 0 ? latency : null;
        }
        const windowsMatch = output.match(/time[<=](\d+)\s*ms/i);
        if (windowsMatch) {
            const latency = parseFloat(windowsMatch[1]);
            return latency >= 0 ? latency : null;
        }
        
        // Windows alternative: Check for "Reply from" without explicit time (very fast response)
        // If we see "Reply from" but no time, assume <1ms (0ms)
        if (output.includes('Reply from') && output.includes('TTL') && !output.match(/time[<=]/i)) {
            // Windows ping sometimes shows "Reply from" without time for very fast responses
            return 0; // <1ms response
        }
        
        // Windows: Check for successful ping indicators even without explicit latency
        // "Ping statistics for 192.168.1.1: Packets: Sent = 1, Received = 1, Lost = 0 (0% loss)"
        if (output.includes('Received = 1') && output.includes('Lost = 0')) {
            // Ping succeeded but latency might be in a different format
            // Try to find any time value (with decimals)
            const anyTimeMatch = output.match(/([\d.]+)\s*ms/i);
            if (anyTimeMatch) {
                const latency = parseFloat(anyTimeMatch[1]);
                if (latency >= 0 && latency < 10000) {
                    return latency;
                }
            }
            // If no explicit time but packet received, assume very fast (<1ms)
            return 0;
        }
        
        // Linux formats:
        // "64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=0.123 ms"
        // "64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=1.23ms"
        // "64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=123 ms"
        const linuxMatch = output.match(/time[=:]\s*([\d.]+)\s*ms/i);
        if (linuxMatch) {
            const latency = parseFloat(linuxMatch[1]);
            return latency >= 0 ? latency : null;
        }
        
        // Alternative Linux format (some systems):
        // "1 packets transmitted, 1 received, 0% packet loss, time 0ms"
        // "rtt min/avg/max/mdev = 0.123/0.456/0.789/0.123 ms"
        const rttMatch = output.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*[\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+/i);
        if (rttMatch) {
            const latency = parseFloat(rttMatch[1]);
            return latency >= 0 ? latency : null;
        }
        
        // Check for "time" keyword with number (fallback)
        const genericMatch = output.match(/time[=:]\s*([\d.]+)/i);
        if (genericMatch) {
            const latency = parseFloat(genericMatch[1]);
            // Assume milliseconds if value is reasonable (< 10000ms)
            if (latency >= 0 && latency < 10000) {
                return latency;
            }
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

