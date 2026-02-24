/**
 * Port Scan Service
 *
 * Runs nmap on target IPs (online hosts from network scan) and stores open ports
 * in NetworkScan.additionalInfo. Used after full scan when portScanEnabled is ON.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

const DEFAULT_PORT_RANGE = '1-10000';
const NMAP_TIMEOUT_MS = 120000; // 2 minutes per host
const MAX_ONLINE_HOSTS = 200;

export interface OpenPort {
    port: number;
    protocol: string;
}

export interface PortScanProgress {
    active: boolean;
    current: number;
    total: number;
    currentIp?: string;
}

let _portScanProgress: PortScanProgress = { active: false, current: 0, total: 0 };
let _portScanAbortRequested = false;

/**
 * Check if nmap is available on the system
 */
export async function isNmapAvailable(): Promise<boolean> {
    try {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'where nmap' : 'which nmap';
        await execAsync(cmd, { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Parse nmap stdout for open ports (lines like "22/tcp   open   ssh" or "80/tcp open")
 */
function parseNmapOutput(stdout: string): OpenPort[] {
    const openPorts: OpenPort[] = [];
    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
        // Match: port/tcp or port/udp followed by "open"
        const match = line.match(/^\s*(\d+)\/(tcp|udp)\s+open/i);
        if (match) {
            const port = parseInt(match[1], 10);
            const protocol = (match[2] || 'tcp').toLowerCase();
            if (!isNaN(port) && port >= 1 && port <= 65535) {
                openPorts.push({ port, protocol });
            }
        }
    }
    openPorts.sort((a, b) => a.port - b.port);
    return openPorts;
}

/**
 * Run nmap on a single IP and return open ports
 */
export async function runPortScan(
    ip: string,
    options?: { portRange?: string }
): Promise<{ openPorts: OpenPort[] }> {
    const portRange = options?.portRange ?? DEFAULT_PORT_RANGE;
    const isWin = process.platform === 'win32';
    // -sT: TCP connect scan, -Pn: skip host discovery, -p: port range
    const cmd = `nmap -sT -Pn -p ${portRange} ${ip}`;
    try {
        const { stdout } = await execAsync(cmd, {
            timeout: NMAP_TIMEOUT_MS,
            maxBuffer: 2 * 1024 * 1024
        });
        const openPorts = parseNmapOutput(stdout);
        return { openPorts };
    } catch (err: any) {
        if (err.stdout) {
            const openPorts = parseNmapOutput(err.stdout);
            return { openPorts };
        }
        logger.debug('PortScanService', `nmap failed for ${ip}: ${err.message || err}`);
        throw err;
    }
}

/**
 * Get current port scan progress (for optional API)
 */
export function getPortScanProgress(): PortScanProgress {
    return { ..._portScanProgress };
}

/**
 * Request abort of the running background port scan. The loop checks this flag between hosts.
 */
export function requestPortScanAbort(): void {
    _portScanAbortRequested = true;
}

/**
 * Run port scan on all online hosts (background). Updates each host's additionalInfo
 * with openPorts and lastPortScan. Call without await to fire-and-forget.
 * Can be stopped via requestPortScanAbort().
 */
export async function runPortScanForOnlineHosts(options?: { portRange?: string }): Promise<void> {
    const available = await isNmapAvailable();
    if (!available) {
        logger.warn('PortScanService', 'nmap not available - skipping port scan');
        return;
    }

    const online = NetworkScanRepository.find({
        status: 'online',
        limit: MAX_ONLINE_HOSTS,
        sortBy: 'last_seen',
        sortOrder: 'desc'
    });

    if (online.length === 0) {
        logger.info('PortScanService', 'No online hosts to scan for ports');
        return;
    }

    _portScanAbortRequested = false;
    _portScanProgress = { active: true, current: 0, total: online.length };
    logger.info('PortScanService', `Starting background port scan for ${online.length} online host(s)`);

    for (let i = 0; i < online.length; i++) {
        if (_portScanAbortRequested) {
            _portScanProgress.active = false;
            _portScanProgress.current = i;
            logger.info('PortScanService', `Background port scan stopped by user at ${i}/${online.length}`);
            return;
        }

        const host = online[i];
        _portScanProgress.currentIp = host.ip;
        _portScanProgress.current = i;

        try {
            const { openPorts } = await runPortScan(host.ip, options);
            const existing = host.additionalInfo || {};
            const merged: Record<string, unknown> = {
                ...existing,
                openPorts,
                lastPortScan: new Date().toISOString()
            };
            NetworkScanRepository.update(host.ip, { additionalInfo: merged });
            logger.debug('PortScanService', `${host.ip}: ${openPorts.length} open port(s)`);
        } catch (err: any) {
            logger.warn('PortScanService', `Port scan failed for ${host.ip}: ${err.message || err}`);
        }
    }

    _portScanProgress = { active: false, current: online.length, total: online.length };
    logger.info('PortScanService', 'Background port scan completed');
}

export const portScanService = {
    isNmapAvailable,
    runPortScan,
    runPortScanForOnlineHosts,
    getPortScanProgress,
    requestPortScanAbort
};
