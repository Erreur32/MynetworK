/**
 * System Server Routes
 * 
 * Provides system information about the server (CPU, RAM, Network)
 * Compatible with Docker containers
 * Note: Disk usage and Docker version features removed for security (required unsafe mounts)
 */

import express from 'express';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Host root path used when running inside Docker with host filesystem mounted
// This allows the application to read real host metrics (disks, uptime, hostname)
const HOST_ROOT_PATH = process.env.HOST_ROOT_PATH || '/host';

// Debug mode - enable verbose logging for Docker operations
const DEBUG_MODE = process.env.DEBUG === 'true' || process.env.DEBUG_VERBOSE === 'true' || process.env.DEBUG_SYSTEM === 'true';

/**
 * Debug logger - only logs if DEBUG mode is enabled
 */
const debugLog = (...args: any[]) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

const router = express.Router();
router.use(requireAuth);

/**
 * Detect if running in Docker
 */
const isDocker = (): boolean => {
  try {
    // Check /proc/self/cgroup (Linux)
    const cgroup = fsSync.readFileSync('/proc/self/cgroup', 'utf8');
    if (cgroup.includes('docker') || cgroup.includes('containerd')) {
      return true;
    }
  } catch {
    // Not Linux or file doesn't exist
  }
  
  // Check environment variable
  if (process.env.DOCKER === 'true' || process.env.DOCKER_CONTAINER === 'true') {
    return true;
  }
  
  // Check for .dockerenv file
  try {
    fsSync.accessSync('/.dockerenv');
    return true;
  } catch {
    return false;
  }
};

/**
 * Get CPU usage
 * Returns average CPU usage percentage
 */
const getCpuUsage = async (): Promise<number> => {
  const cpus = os.cpus();
  
  // Get initial CPU times
  const initialTimes = cpus.map(cpu => ({
    user: cpu.times.user,
    nice: cpu.times.nice,
    sys: cpu.times.sys,
    idle: cpu.times.idle,
    irq: cpu.times.irq
  }));
  
  // Wait 100ms
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Get new CPU times
  const newCpus = os.cpus();
  const newTimes = newCpus.map(cpu => ({
    user: cpu.times.user,
    nice: cpu.times.nice,
    sys: cpu.times.sys,
    idle: cpu.times.idle,
    irq: cpu.times.irq
  }));
  
  // Calculate average usage
  let totalUsage = 0;
  let totalIdle = 0;
  
  for (let i = 0; i < cpus.length; i++) {
    const initial = initialTimes[i];
    const current = newTimes[i];
    
    const initialTotal = initial.user + initial.nice + initial.sys + initial.idle + initial.irq;
    const currentTotal = current.user + current.nice + current.sys + current.idle + current.irq;
    
    const totalDiff = currentTotal - initialTotal;
    const idleDiff = current.idle - initial.idle;
    
    const usage = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;
    totalUsage += usage;
  }
  
  return totalUsage / cpus.length;
};

/**
 * Disk usage and Docker version/stats detection were removed entirely for security:
 * they required mounting the full host filesystem (/:ro) and the Docker socket
 * (docker.sock), both of which are container-escape risks. See CLAUDE.md Gotchas.
 * No route in this file exposes disk or Docker info anymore.
 */

/**
 * Try multiple host-mounted paths to read the real host hostname, falling
 * back to the container hostname if none work or the result still looks
 * like a container ID (12 hex chars).
 */
async function getHostHostname(defaultHostname: string): Promise<string> {
  const hostnameMethods = [
    join(HOST_ROOT_PATH, 'proc', 'sys', 'kernel', 'hostname'), // Try /proc first (now mounted separately)
    join(HOST_ROOT_PATH, 'etc', 'hostname'),
  ];

  for (const hostnamePath of hostnameMethods) {
    try {
      const hostHostname = await fs.readFile(hostnamePath, 'utf8');
      if (hostHostname && hostHostname.trim().length > 0) {
        const trimmedHostname = hostHostname.trim();
        // Only use if it's not a container ID (container IDs are usually 12 hex chars)
        if (trimmedHostname.length > 12 || !/^[a-f0-9]+$/.test(trimmedHostname)) {
          debugLog(`[SystemServer] ✓ Read host hostname from ${hostnamePath}: ${trimmedHostname}`);
          return trimmedHostname;
        }
        debugLog(`[SystemServer] Hostname from ${hostnamePath} looks like container ID, trying next method`);
      }
    } catch (error) {
      debugLog(`[SystemServer] Cannot read hostname from ${hostnamePath}: ${error}`);
    }
  }

  if (defaultHostname.length === 12 && /^[a-f0-9]+$/.test(defaultHostname)) {
    debugLog(`[SystemServer] ⚠ Hostname appears to be container ID (${defaultHostname}), but could not read host hostname`);
  }
  return defaultHostname;
}

/**
 * Read the real host uptime from the host-mounted /proc/uptime, falling
 * back to the container's own uptime if unavailable.
 */
async function getHostUptime(defaultUptime: number): Promise<number> {
  try {
    const hostUptimePath = join(HOST_ROOT_PATH, 'proc', 'uptime');
    const uptimeContent = await fs.readFile(hostUptimePath, 'utf8');
    const firstField = uptimeContent.split(' ')[0];
    const hostUptimeSeconds = parseFloat(firstField);
    if (!Number.isNaN(hostUptimeSeconds) && hostUptimeSeconds > 0) {
      debugLog(`[SystemServer] Read host uptime from ${hostUptimePath}: ${Math.floor(hostUptimeSeconds / 3600)}h`);
      return hostUptimeSeconds;
    }
  } catch (error) {
    debugLog(`[SystemServer] Cannot read host uptime: ${error}`);
  }
  return defaultUptime;
}

/**
 * GET /api/system/server
 * Get server system information
 */
router.get('/server', async (_req, res) => {
  try {
    const cpuUsage = await getCpuUsage();
    const ramUsage = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
      percentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
    };

    // Default to container/system values
    let hostname = os.hostname();
    let uptime = os.uptime();

    // When running in Docker with host filesystem mounted, try to read
    // hostname and uptime from the host so that the dashboard reflects
    // the real machine instead of the container identity.
    if (isDocker()) {
      [hostname, uptime] = await Promise.all([
        getHostHostname(hostname),
        getHostUptime(uptime)
      ]);
    }

    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname,
      uptime,
      nodeVersion: process.version,
      docker: isDocker(),
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'Unknown',
        usage: Math.round(cpuUsage * 100) / 100
      },
      memory: {
        total: ramUsage.total,
        free: ramUsage.free,
        used: ramUsage.used,
        percentage: Math.round(ramUsage.percentage * 100) / 100
      }
    };
    
    res.json({
      success: true,
      result: systemInfo
    });
  } catch (error) {
    logger.error('SystemServer', 'Error getting system info:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get system information',
        code: 'SYSTEM_ERROR'
      }
    });
  }
});

// Store previous network stats for calculating speed
let previousNetworkStats: { rxBytes: number; txBytes: number; timestamp: number } | null = null;
const networkHistory: Array<{ timestamp: number; download: number; upload: number }> = [];
const MAX_HISTORY = 60; // Keep last 60 data points (5 minutes at 5s interval)

/**
 * Get network interface statistics from /proc/net/dev (Linux)
 * Works both in Docker and on host machine
 * Tries multiple paths to access host network stats
 */
const getNetworkStats = async (): Promise<{ rxBytes: number; txBytes: number } | null> => {
  const fs = await import('fs/promises');
  const fsSync = await import('fs');
  
  // List of possible paths to try (Docker might mount host /proc)
  const possiblePaths = [
    '/proc/net/dev',           // Standard path
    '/host/proc/net/dev',      // Docker with host proc mounted
    '/host/run/host/proc/net/dev', // Alternative Docker path
  ];
  
  for (const path of possiblePaths) {
    try {
      // Check if file exists
      try {
        await fs.access(path);
      } catch {
        continue; // Try next path
      }
      
      // Try to read the file
      const content = await fs.readFile(path, 'utf8');
      const lines = content.trim().split('\n').slice(2); // Skip header lines
      
      let totalRxBytes = 0;
      let totalTxBytes = 0;
      let validInterfaces = 0;
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10) {
          const iface = parts[0].replace(':', '');
          // Skip loopback and virtual interfaces
          if (iface === 'lo' || iface.startsWith('docker') || iface.startsWith('veth') || iface.startsWith('br-')) {
            continue;
          }
          
          const rxBytes = parseInt(parts[1], 10);
          const txBytes = parseInt(parts[9], 10);
          
          if (!isNaN(rxBytes) && !isNaN(txBytes) && rxBytes > 0 && txBytes > 0) {
            totalRxBytes += rxBytes;
            totalTxBytes += txBytes;
            validInterfaces++;
          }
        }
      }
      
      if (validInterfaces > 0 && (totalRxBytes > 0 || totalTxBytes > 0)) {
        logger.debug('Network', `Successfully read from ${path}, found ${validInterfaces} interfaces`);
        return { rxBytes: totalRxBytes, txBytes: totalTxBytes };
      }
    } catch (error) {
      // Continue to next path
      continue;
    }
  }
  
  // Fallback: try using command (might work if we have access)
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Try to read from host if in Docker
    const commands = [
      'cat /proc/net/dev 2>/dev/null',
      'cat /host/proc/net/dev 2>/dev/null',
      'cat /host/run/host/proc/net/dev 2>/dev/null'
    ];
    
    for (const cmd of commands) {
      try {
        const { stdout } = await execAsync(cmd, { timeout: 2000 });
        const lines = stdout.trim().split('\n').slice(2);
        
        let totalRxBytes = 0;
        let totalTxBytes = 0;
        let validInterfaces = 0;
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 10) {
            const iface = parts[0].replace(':', '');
            if (iface === 'lo' || iface.startsWith('docker') || iface.startsWith('veth') || iface.startsWith('br-')) {
              continue;
            }
            
            const rxBytes = parseInt(parts[1], 10);
            const txBytes = parseInt(parts[9], 10);
            
            if (!isNaN(rxBytes) && !isNaN(txBytes) && rxBytes > 0 && txBytes > 0) {
              totalRxBytes += rxBytes;
              totalTxBytes += txBytes;
              validInterfaces++;
            }
          }
        }
        
        if (validInterfaces > 0 && (totalRxBytes > 0 || totalTxBytes > 0)) {
          logger.debug('Network', `Successfully read via command: ${cmd}, found ${validInterfaces} interfaces`);
          return { rxBytes: totalRxBytes, txBytes: totalTxBytes };
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    logger.debug('Network', 'Command fallback also failed');
  }
  
  logger.debug('Network', 'Could not read network stats from any source');
  return null;
};

/**
 * GET /api/system/server/network
 * Get system network traffic statistics from host machine
 */
router.get('/network', async (_req, res) => {
  try {
    const currentStats = await getNetworkStats();
    const now = Date.now();
    
    if (!currentStats) {
      // Return empty data if stats unavailable (but still return success)
      logger.debug('Network', 'No network stats available, returning empty data');
      return res.json({
        success: true,
        result: {
          current: { download: 0, upload: 0 },
          history: networkHistory.slice(-MAX_HISTORY)
        }
      });
    }
    
    let downloadSpeed = 0;
    let uploadSpeed = 0;
    
    if (previousNetworkStats) {
      const timeDiff = (now - previousNetworkStats.timestamp) / 1000; // seconds
      if (timeDiff > 0 && timeDiff < 60) { // Sanity check: max 60 seconds between calls
        downloadSpeed = (currentStats.rxBytes - previousNetworkStats.rxBytes) / timeDiff;
        uploadSpeed = (currentStats.txBytes - previousNetworkStats.txBytes) / timeDiff;
        
        // Ensure non-negative values
        downloadSpeed = Math.max(0, downloadSpeed);
        uploadSpeed = Math.max(0, uploadSpeed);
        
        // Add to history
        networkHistory.push({
          timestamp: now,
          download: downloadSpeed,
          upload: uploadSpeed
        });
        
        // Keep only last MAX_HISTORY entries
        if (networkHistory.length > MAX_HISTORY) {
          networkHistory.shift();
        }
      } else {
        // Time difference too large, reset history
        logger.debug('Network', 'Time difference too large, resetting history');
        networkHistory.length = 0;
      }
    } else {
      // First call, initialize but don't calculate speed yet
      logger.debug('Network', 'First call, initializing stats');
    }
    
    // Update previous stats
    previousNetworkStats = {
      rxBytes: currentStats.rxBytes,
      txBytes: currentStats.txBytes,
      timestamp: now
    };
    
    const networkData = {
      current: {
        download: downloadSpeed,
        upload: uploadSpeed
      },
      history: networkHistory.slice(-MAX_HISTORY)
    };
    
    res.json({
      success: true,
      result: networkData
    });
  } catch (error) {
    logger.error('SystemServer', 'Error getting network data:', error);
    // Return empty data instead of error to prevent frontend crashes
    res.json({
      success: true,
      result: {
        current: { download: 0, upload: 0 },
        history: []
      }
    });
  }
});

// GET /api/system/server/docker: removed for security (required docker.sock mount)

export default router;

