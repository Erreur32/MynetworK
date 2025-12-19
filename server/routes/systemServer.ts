/**
 * System Server Routes
 * 
 * Provides system information about the server (CPU, RAM, Disk, Docker)
 * Compatible with Docker containers
 */

import express from 'express';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
 * Get all disk usage
 * Returns disk usage for mounted filesystems.
 *
 * Implementation notes:
 * - When running in Docker with the host root mounted at HOST_ROOT_PATH,
 *   we use a very simple and robust approach: run `df` against the mounted
 *   host root directory (e.g. /host). This typically returns the main host
 *   filesystem (/, often sufficient for a dashboard).
 * - On non-Docker or unsupported environments, we fall back to a standard
 *   `df` call on local devices.
 */
const getAllDiskUsage = async (): Promise<Array<{ mount: string; total: number; free: number; used: number; percentage: number }>> => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const platform = process.platform;
    if (platform !== 'linux' && platform !== 'darwin') {
      // Windows or unsupported platform: no disk info
      return [];
    }

    const runningInDocker = isDocker();

    // Case 1: Docker with host root mounted (HOST_ROOT_PATH, e.g. /host)
    if (runningInDocker && HOST_ROOT_PATH) {
      try {
        // Method 1: Use chroot to execute df from host context
        const chrootDfCommand = `chroot ${HOST_ROOT_PATH} df -k 2>&1 | grep -E '^/dev/[^l]' | awk '{print $6" "$2" "$4" "$3}'`;
        console.log(`[SystemServer] Attempting chroot df command: chroot ${HOST_ROOT_PATH} df -k`);
        const { stdout, stderr } = await execAsync(chrootDfCommand, { timeout: 5000 });
        
        if (stderr && !stderr.includes('df:')) {
          console.log(`[SystemServer] chroot df stderr: ${stderr}`);
        }
        
        console.log(`[SystemServer] chroot df stdout (first 500 chars): ${stdout.substring(0, 500)}`);
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        console.log(`[SystemServer] chroot df parsed ${lines.length} lines`);
        
        const disks: Array<{ mount: string; total: number; free: number; used: number; percentage: number }> = [];
        const processedMounts = new Set<string>();
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) {
            const mount = parts[0];
            const total = parseInt(parts[1], 10) * 1024;
            const free = parseInt(parts[2], 10) * 1024;
            const used = parseInt(parts[3], 10) * 1024;
            const percentage = total > 0 ? (used / total) * 100 : 0;
            
            console.log(`[SystemServer] Processing mount: ${mount}, total: ${total} bytes, used: ${used} bytes`);
            
            // Filter out system directories
            if (mount !== '/' && 
                !mount.includes('/proc') && 
                !mount.includes('/sys') &&
                !mount.includes('/dev/') && 
                !mount.includes('/run') &&
                !mount.includes('/tmp') &&
                !mount.includes('/var/run') &&
                !mount.startsWith('/host') &&
                !processedMounts.has(mount) &&
                total > 100 * 1024 * 1024) { // Only disks > 100MB
              processedMounts.add(mount);
              disks.push({ 
                mount, 
                total, 
                free, 
                used, 
                percentage: Math.round(percentage * 100) / 100 
              });
              console.log(`[SystemServer] ✓ Added disk: ${mount}`);
            } else if (mount === '/' && !processedMounts.has('/')) {
              // Always include root mount
              processedMounts.add('/');
              disks.push({ 
                mount: '/', 
                total, 
                free, 
                used, 
                percentage: Math.round(percentage * 100) / 100 
              });
              console.log(`[SystemServer] ✓ Added root disk: /`);
            } else {
              console.log(`[SystemServer] Skipped mount: ${mount} (filtered or already processed)`);
            }
          } else {
            console.log(`[SystemServer] Skipped line (invalid format): ${line}`);
          }
        }
        
        if (disks.length > 0) {
          console.log(`[SystemServer] ✓ Found ${disks.length} disk(s) using chroot method`);
          return disks;
        } else {
          console.log(`[SystemServer] ⚠ chroot df returned no valid disks (${lines.length} lines parsed, ${processedMounts.size} processed)`);
        }
      } catch (error) {
        console.error(`[SystemServer] chroot df command failed:`, error);
      }
      
      // Method 2: Use df directly on mounted host paths (no chroot needed)
      // This reads all filesystems from the host by reading /host/proc/mounts
      // and then querying each mount point via the mounted /host path
      try {
        // Read host's /proc/mounts to get all mount points
        const mountsPath = join(HOST_ROOT_PATH, 'proc', 'mounts');
        const mountsContent = await fs.readFile(mountsPath, 'utf8');
        const mountLines = mountsContent.split('\n').filter(line => line.trim());
        
        // Extract real disk mount points (skip loop devices, tmpfs, etc.)
        const realMounts = new Set<string>();
        for (const line of mountLines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const device = parts[0];
            const mountpoint = parts[1];
            const fstype = parts[2];
            
            // Only include real block devices (not loop, tmpfs, proc, sys, etc.)
            // Exclude Docker bind mounts like /etc/resolv.conf, /etc/hostname, /etc/hosts
            if (device.startsWith('/dev/') && 
                !device.includes('/dev/loop') &&
                !device.includes('/dev/shm') &&
                fstype !== 'tmpfs' &&
                fstype !== 'proc' &&
                fstype !== 'sysfs' &&
                fstype !== 'devtmpfs' &&
                fstype !== 'devpts' &&
                !mountpoint.includes('/proc') &&
                !mountpoint.includes('/sys') &&
                !mountpoint.includes('/dev/') &&
                !mountpoint.includes('/run') &&
                !mountpoint.includes('/tmp') &&
                !mountpoint.startsWith('/host') &&
                !mountpoint.startsWith('/etc/resolv.conf') &&
                !mountpoint.startsWith('/etc/hostname') &&
                !mountpoint.startsWith('/etc/hosts') &&
                mountpoint !== '/etc/resolv.conf' &&
                mountpoint !== '/etc/hostname' &&
                mountpoint !== '/etc/hosts' &&
                !mountpoint.startsWith('/app')) {
              realMounts.add(mountpoint);
            }
          }
        }
        
        if (realMounts.size > 0) {
          // Get df output for all mount points by querying via mounted /host path
          const mountPointsArray = Array.from(realMounts);
          const disks: Array<{ mount: string; total: number; free: number; used: number; percentage: number }> = [];
          
          // Query each mount point by accessing it via the /host mount
          for (const mountpoint of mountPointsArray) {
            try {
              // Access the mount point via the /host mount (e.g., /host/home for /home)
              const hostPath = join(HOST_ROOT_PATH, mountpoint);
              
              // Check if the path exists and is accessible
              try {
                await fs.access(hostPath);
              } catch {
                // Path not accessible, skip
                continue;
              }
              
              // Use df directly on the mounted path (works without chroot)
              const dfCommand = `df -k "${hostPath}" 2>/dev/null | tail -n 1`;
              const { stdout } = await execAsync(dfCommand, { timeout: 2000 });
              const parts = stdout.trim().split(/\s+/);
              
              if (parts.length >= 6) {
                const total = parseInt(parts[1], 10) * 1024;
                const used = parseInt(parts[2], 10) * 1024;
                const available = parseInt(parts[3], 10) * 1024;
                const percentage = parseFloat(parts[4].replace('%', ''));
                
                // Only include disks > 100MB
                if (!Number.isNaN(total) && total > 100 * 1024 * 1024) {
                  disks.push({
                    mount: mountpoint,
                    total,
                    free: available,
                    used,
                    percentage: Math.round(percentage * 100) / 100
                  });
                  debugLog(`[SystemServer] ✓ Added disk: ${mountpoint} (${(total / 1024 / 1024 / 1024).toFixed(2)} GB)`);
                }
              }
            } catch (error) {
              // Skip this mountpoint if df fails
              debugLog(`[SystemServer] Failed to get disk info for ${mountpoint}: ${error}`);
              continue;
            }
          }
          
          if (disks.length > 0) {
            console.log(`[SystemServer] ✓ Found ${disks.length} disk(s) using /proc/mounts + df method (via /host mount)`);
            return disks;
          }
        }
      } catch (error) {
        debugLog(`[SystemServer] /proc/mounts + df method failed: ${error}`);
      }
      
      // Method 3: Fallback - query host root mount directly via /host mount (no chroot)
      try {
        const hostRootPath = join(HOST_ROOT_PATH, '/');
        const dfCommand = `df -k "${hostRootPath}" 2>/dev/null | tail -n 1`;
        const { stdout } = await execAsync(dfCommand, { timeout: 5000 });
        const parts = stdout.trim().split(/\s+/);

        if (parts.length >= 6) {
          const total = parseInt(parts[1], 10) * 1024;
          const used = parseInt(parts[2], 10) * 1024;
          const available = parseInt(parts[3], 10) * 1024;
          const percentage = parseFloat(parts[4].replace('%', ''));

          if (!Number.isNaN(total) && total > 0) {
            console.log(`[SystemServer] ✓ Found disk using direct df method (fallback)`);
            return [
              {
                mount: '/',
                total,
                free: available,
                used,
                percentage: Math.round(percentage * 100) / 100
              }
            ];
          }
        }
      } catch (error) {
        debugLog(`[SystemServer] Direct df command failed: ${error}`);
      }
    }

    // Case 2: Standard df on local devices (non-Docker or fallback)
    try {
      const command = `df -k | grep -E '^/dev/[^l]' | awk '{print $6" "$2" "$4" "$3}'`;
      const { stdout } = await execAsync(command, { timeout: 5000 });
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const disks: Array<{ mount: string; total: number; free: number; used: number; percentage: number }> = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const mount = parts[0];
          const total = parseInt(parts[1], 10) * 1024;
          const free = parseInt(parts[2], 10) * 1024;
          const used = parseInt(parts[3], 10) * 1024;
          const percentage = total > 0 ? (used / total) * 100 : 0;

          disks.push({
            mount,
            total,
            free,
            used,
            percentage: Math.round(percentage * 100) / 100
          });
        }
      }

      return disks;
    } catch (error) {
      debugLog(`[SystemServer] Standard df command failed: ${error}`);
    }
  } catch (error) {
    debugLog(`[SystemServer] getAllDiskUsage error: ${error}`);
  }

  return [];
};

/**
 * Get Docker version from host system
 * Returns Docker version string or null if not available
 */
const getDockerVersion = async (): Promise<string | null> => {
  if (!isDocker()) {
    return null;
  }

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Method 1: Try to execute docker --version from host binary paths
    const dockerPaths = [
      '/usr/bin/docker',
      '/usr/local/bin/docker',
      '/bin/docker'
    ];
    
    for (const dockerPath of dockerPaths) {
      const hostDockerPath = `${HOST_ROOT_PATH}${dockerPath}`;
      try {
        await fs.access(hostDockerPath);
        // Try to execute docker --version via the host path
        const { stdout } = await execAsync(`"${hostDockerPath}" --version 2>/dev/null`, { timeout: 2000 });
        if (stdout && stdout.trim()) {
          debugLog(`[SystemServer] ✓ Docker version found via ${hostDockerPath}`);
          return stdout.trim();
        }
      } catch (error) {
        // Continue to next path
        continue;
      }
    }
    
    // Method 2: Try via chroot
    try {
      const { stdout } = await execAsync(`chroot ${HOST_ROOT_PATH} docker --version 2>/dev/null`, { timeout: 2000 });
      if (stdout && stdout.trim()) {
        debugLog(`[SystemServer] ✓ Docker version found via chroot`);
        return stdout.trim();
      }
    } catch {
      // Docker not found or not accessible via chroot
    }
    
    // Method 3: Use Docker API via Unix socket (if docker socket is mounted)
    // This works even if docker binary is not available in container
    try {
      const dockerSocket = '/var/run/docker.sock';
      try {
        await fs.access(dockerSocket);
        debugLog(`[SystemServer] Docker socket found at ${dockerSocket}, querying Docker API`);
        
        // Try Method 3a: Use curl to query Docker API via Unix socket
        try {
          const curlCommand = `curl --unix-socket ${dockerSocket} -s http://localhost/version 2>/dev/null`;
          const { stdout } = await execAsync(curlCommand, { timeout: 2000 });
          
          if (stdout && stdout.trim()) {
            try {
              const versionInfo = JSON.parse(stdout);
              // Docker API returns: {"Version": "24.0.7", "ApiVersion": "1.43", ...}
              if (versionInfo.Version) {
                const versionString = `Docker version ${versionInfo.Version}`;
                debugLog(`[SystemServer] ✓ Docker version found via API (curl): ${versionString}`);
                return versionString;
              }
            } catch (parseError) {
              // If JSON parsing fails, try to extract version from raw output
              const versionMatch = stdout.match(/"Version"\s*:\s*"([^"]+)"/);
              if (versionMatch && versionMatch[1]) {
                const versionString = `Docker version ${versionMatch[1]}`;
                debugLog(`[SystemServer] ✓ Docker version found via API (curl, parsed): ${versionString}`);
                return versionString;
              }
            }
          }
        } catch (curlError) {
          // curl not available or failed, try Node.js HTTP
          debugLog(`[SystemServer] curl method failed, trying Node.js HTTP: ${curlError}`);
        }
        
        // Method 3b: Use Node.js HTTP to query Docker API via Unix socket
        try {
          const http = await import('http');
          const versionInfo = await new Promise<any>((resolve, reject) => {
            const options = {
              socketPath: dockerSocket,
              path: '/version',
              method: 'GET'
            };
            
            const req = http.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                try {
                  resolve(JSON.parse(data));
          } catch {
                  reject(new Error('Failed to parse Docker API response'));
                }
              });
            });
            
            req.on('error', reject);
            req.setTimeout(2000, () => {
              req.destroy();
              reject(new Error('Docker API request timeout'));
            });
            req.end();
          });
          
          if (versionInfo && versionInfo.Version) {
            const versionString = `Docker version ${versionInfo.Version}`;
            debugLog(`[SystemServer] ✓ Docker version found via API (HTTP): ${versionString}`);
            return versionString;
          }
        } catch (httpError) {
          debugLog(`[SystemServer] HTTP method failed: ${httpError}`);
        }
        
        // Fallback: Try docker command if available
        const dockerBinaries = ['/usr/bin/docker', '/usr/local/bin/docker', '/bin/docker'];
        for (const dockerPath of dockerBinaries) {
          try {
            await fs.access(dockerPath);
            const { stdout: cmdStdout } = await execAsync(`"${dockerPath}" --version 2>&1`, { timeout: 2000 });
            if (cmdStdout && cmdStdout.trim() && !cmdStdout.includes('command not found')) {
              debugLog(`[SystemServer] ✓ Docker version found via ${dockerPath}: ${cmdStdout.trim()}`);
              return cmdStdout.trim();
            }
          } catch {
            continue;
          }
        }
        
        // Try without path (if in PATH)
        try {
          const { stdout: cmdStdout } = await execAsync(`docker --version 2>&1`, { timeout: 2000 });
          if (cmdStdout && cmdStdout.trim() && !cmdStdout.includes('command not found')) {
            debugLog(`[SystemServer] ✓ Docker version found via docker command: ${cmdStdout.trim()}`);
            return cmdStdout.trim();
          }
        } catch {
          // Ignore
        }
        
        debugLog(`[SystemServer] Docker socket exists but could not get version`);
      } catch (error) {
        debugLog(`[SystemServer] Docker socket exists but API query failed: ${error}`);
      }
    } catch (error) {
      debugLog(`[SystemServer] Docker socket check failed: ${error}`);
    }
    
    // Method 4: Try to read Docker version from host /usr/libexec/docker or similar
    // Some systems store Docker info in different locations
    const alternativePaths = [
      '/usr/libexec/docker/docker',
      '/snap/bin/docker',
    ];
    
    for (const dockerPath of alternativePaths) {
      const hostDockerPath = `${HOST_ROOT_PATH}${dockerPath}`;
      try {
        await fs.access(hostDockerPath);
        const { stdout } = await execAsync(`"${hostDockerPath}" --version 2>/dev/null`, { timeout: 2000 });
        if (stdout && stdout.trim()) {
          debugLog(`[SystemServer] ✓ Docker version found via ${hostDockerPath}`);
          return stdout.trim();
        }
      } catch {
        continue;
      }
    }
    
    debugLog(`[SystemServer] ⚠ Could not find Docker version using any method`);
  } catch (error) {
    debugLog(`[SystemServer] Error getting Docker version: ${error}`);
  }
  
  return null;
};

/**
 * Query Docker API via Unix socket
 */
const queryDockerApi = async <T = any>(path: string): Promise<T | null> => {
  try {
    const http = await import('http');
    const dockerSocket = '/var/run/docker.sock';
    await fs.access(dockerSocket);
    
    return await new Promise<T | null>((resolve, reject) => {
      const options = {
        socketPath: dockerSocket,
        path,
        method: 'GET'
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error('Failed to parse Docker API response'));
          }
        });
      });
      
      req.on('error', (err) => {
        console.error(`[SystemServer] Docker API request error for ${path}:`, err);
        reject(err);
      });
      req.setTimeout(3000, () => {
        req.destroy();
        const timeoutError = new Error(`Docker API request timeout for ${path}`);
        console.error(`[SystemServer]`, timeoutError);
        reject(timeoutError);
      });
      req.end();
    });
  } catch (error) {
    console.error(`[SystemServer] Docker API query failed for ${path}:`, error);
    return null;
  }
};

/**
 * Get Docker statistics (containers, images, volumes, etc.)
 */
const getDockerStats = async (): Promise<{
  version: string | null;
  containers: {
    total: number;
    running: number;
    stopped: number;
    paused: number;
  };
  images: number;
  volumes: number;
  networks: number;
  diskUsage: {
    images: number;
    containers: number;
    volumes: number;
    buildCache: number;
    total: number;
  } | null;
} | null> => {
  // Try to access Docker socket even if not running in Docker
  // This allows getting Docker stats when running locally (npm run dev) with Docker installed
  const dockerSocket = '/var/run/docker.sock';
  
  try {
    await fs.access(dockerSocket);
    console.log(`[SystemServer] ✓ Docker socket accessible at ${dockerSocket}`);
  } catch (accessError) {
    console.log(`[SystemServer] ⚠ Docker socket not accessible at ${dockerSocket}:`, accessError);
    return null;
  }

  try {
    
    // Get Docker version
    const versionInfo = await queryDockerApi<{ Version: string }>('/version');
    const dockerVersion = versionInfo?.Version ? `Docker version ${versionInfo.Version}` : null;
    if (!dockerVersion) {
      console.log(`[SystemServer] ⚠ Could not get Docker version from API`);
    } else {
      console.log(`[SystemServer] ✓ Docker version: ${dockerVersion}`);
    }
    
    // Get containers stats
    const containers = await queryDockerApi<Array<{ State: string }>>('/containers/json?all=true');
    const containersStats = containers ? {
      total: containers.length,
      running: containers.filter(c => c.State === 'running').length,
      stopped: containers.filter(c => c.State === 'exited').length,
      paused: containers.filter(c => c.State === 'paused').length
    } : { total: 0, running: 0, stopped: 0, paused: 0 };
    if (!containers) {
      console.log(`[SystemServer] ⚠ Could not get containers from API (queryDockerApi returned null)`);
    } else {
      console.log(`[SystemServer] ✓ Containers: ${containersStats.running}/${containersStats.total} running`);
    }
    
    // Get images count
    const images = await queryDockerApi<Array<unknown>>('/images/json');
    const imagesCount = images ? images.length : 0;
    if (!images) {
      console.log(`[SystemServer] ⚠ Could not get images from API (queryDockerApi returned null)`);
    } else {
      console.log(`[SystemServer] ✓ Images: ${imagesCount}`);
    }
    
    // Get volumes count
    const volumes = await queryDockerApi<{ Volumes?: Array<unknown> }>('/volumes');
    const volumesCount = volumes?.Volumes ? volumes.Volumes.length : 0;
    if (!volumes) {
      console.log(`[SystemServer] ⚠ Could not get volumes from API (queryDockerApi returned null)`);
    } else {
      console.log(`[SystemServer] ✓ Volumes: ${volumesCount}`);
    }
    
    // Get networks count
    const networks = await queryDockerApi<Array<unknown>>('/networks');
    const networksCount = networks ? networks.length : 0;
    if (!networks) {
      console.log(`[SystemServer] ⚠ Could not get networks from API (queryDockerApi returned null)`);
    } else {
      console.log(`[SystemServer] ✓ Networks: ${networksCount}`);
    }
    
    // Get disk usage (optional - may not be available on all Docker versions)
    let diskUsage: {
      images: number;
      containers: number;
      volumes: number;
      buildCache: number;
      total: number;
    } | null = null;
    
    try {
      const systemInfo = await queryDockerApi<{
        ImagesSize?: number;
        ContainersSize?: number;
        VolumesSize?: number;
        BuildCacheSize?: number;
      }>('/system/df');
      
      if (systemInfo) {
        diskUsage = {
          images: systemInfo.ImagesSize || 0,
          containers: systemInfo.ContainersSize || 0,
          volumes: systemInfo.VolumesSize || 0,
          buildCache: systemInfo.BuildCacheSize || 0,
          total: (systemInfo.ImagesSize || 0) + 
                 (systemInfo.ContainersSize || 0) + 
                 (systemInfo.VolumesSize || 0) + 
                 (systemInfo.BuildCacheSize || 0)
        };
      }
    } catch {
      // Disk usage not available, continue without it
    }
    
    const stats = {
      version: dockerVersion,
      containers: containersStats,
      images: imagesCount,
      volumes: volumesCount,
      networks: networksCount,
      diskUsage
    };
    
    // Always log in production to help diagnose issues
    const formatBytesForLog = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };
    console.log(`[SystemServer] ✓ Docker stats retrieved:`, {
      version: dockerVersion,
      containers: `${containersStats.running}/${containersStats.total}`,
      images: imagesCount,
      volumes: volumesCount,
      networks: networksCount,
      diskUsage: diskUsage ? formatBytesForLog(diskUsage.total) : 'N/A'
    });
    
    return stats;
  } catch (error) {
    console.error(`[SystemServer] Error getting Docker stats:`, error);
    // Log more details in production to help diagnose
    console.error(`[SystemServer] Docker socket path: ${dockerSocket}`);
    console.error(`[SystemServer] Docker socket accessible: ${fsSync.existsSync(dockerSocket)}`);
    return null;
  }
};

/**
 * Get disk usage (legacy - returns first disk or root)
 */
const getDiskUsage = async (): Promise<{ total: number; free: number; used: number; percentage: number }> => {
  const disks = await getAllDiskUsage();
  if (disks.length > 0) {
    // Return root disk (/) or first disk
    const rootDisk = disks.find(d => d.mount === '/') || disks[0];
    return {
      total: rootDisk.total,
      free: rootDisk.free,
      used: rootDisk.used,
      percentage: rootDisk.percentage
    };
  }
  
  return {
    total: 0,
    free: 0,
    used: 0,
    percentage: 0
  };
};

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
    let dockerVersion: string | null = null;

    // When running in Docker with host filesystem mounted, try to read
    // hostname and uptime from the host so that the dashboard reflects
    // the real machine instead of the container identity.
    if (isDocker()) {
      // Try multiple methods to get host hostname
      const hostnameMethods = [
        join(HOST_ROOT_PATH, 'proc', 'sys', 'kernel', 'hostname'), // Try /proc first (now mounted separately)
        join(HOST_ROOT_PATH, 'etc', 'hostname'),
      ];
      
      for (const hostnamePath of hostnameMethods) {
        try {
          await fs.access(hostnamePath);
          const hostHostname = await fs.readFile(hostnamePath, 'utf8');
          if (hostHostname && hostHostname.trim().length > 0) {
            const trimmedHostname = hostHostname.trim();
            // Only use if it's not a container ID (container IDs are usually 12 hex chars)
            if (trimmedHostname.length > 12 || !/^[a-f0-9]+$/.test(trimmedHostname)) {
              hostname = trimmedHostname;
              debugLog(`[SystemServer] ✓ Read host hostname from ${hostnamePath}: ${hostname}`);
              break;
            } else {
              debugLog(`[SystemServer] Hostname from ${hostnamePath} looks like container ID, trying next method`);
            }
          }
        } catch (error) {
          debugLog(`[SystemServer] Cannot read hostname from ${hostnamePath}: ${error}`);
          // Try next method
          continue;
        }
      }
      
      if (hostname === os.hostname() && hostname.length === 12 && /^[a-f0-9]+$/.test(hostname)) {
        debugLog(`[SystemServer] ⚠ Hostname appears to be container ID (${hostname}), but could not read host hostname`);
      }

      // Try to read host uptime
      try {
        const hostUptimePath = join(HOST_ROOT_PATH, 'proc', 'uptime');
        try {
          await fs.access(hostUptimePath);
          const uptimeContent = await fs.readFile(hostUptimePath, 'utf8');
          const firstField = uptimeContent.split(' ')[0];
          const hostUptimeSeconds = parseFloat(firstField);
          if (!Number.isNaN(hostUptimeSeconds) && hostUptimeSeconds > 0) {
            uptime = hostUptimeSeconds;
            debugLog(`[SystemServer] Read host uptime from ${hostUptimePath}: ${Math.floor(uptime / 3600)}h`);
          }
        } catch (accessError) {
          debugLog(`[SystemServer] Cannot access host uptime file at ${hostUptimePath}`);
        }
      } catch (error) {
        debugLog(`[SystemServer] Error reading host uptime: ${error}`);
      }

      // Try to get Docker version from host
      dockerVersion = await getDockerVersion();
      if (dockerVersion) {
        debugLog(`[SystemServer] ✓ Found Docker version: ${dockerVersion}`);
      } else {
        debugLog(`[SystemServer] ⚠ Could not detect Docker version from host`);
      }
    }
    
    const diskUsage = await getDiskUsage();
    const allDisks = await getAllDiskUsage();
    
    // Filter out fake disks (Docker bind mounts, container paths, etc.)
    const realDisks = allDisks.filter(d => 
      d.mount !== '/etc/resolv.conf' &&
      d.mount !== '/etc/hostname' &&
      d.mount !== '/etc/hosts' &&
      !d.mount.startsWith('/app') &&
      !d.mount.startsWith('/host') &&
      d.total > 100 * 1024 * 1024 // Only disks > 100MB
    );
    
    // Log disk information for debugging (always log in production to help diagnose issues)
    if (realDisks.length > 0) {
      console.log(`[SystemServer] ✓ Found ${realDisks.length} disk(s):`, realDisks.map(d => `${d.mount} (${(d.total / (1024 * 1024 * 1024)).toFixed(2)} GB)`).join(', '));
    } else {
      console.log(`[SystemServer] ⚠ No disks found via getAllDiskUsage(), using fallback disk info`);
    }
    
    // Get Docker stats (includes version)
    const dockerStats = await getDockerStats();
    
    // Ensure Docker version is set (prefer dockerStats.version, then dockerVersion from getDockerVersion)
    const finalDockerVersion = dockerStats?.version || dockerVersion || null;
    if (finalDockerVersion) {
      console.log(`[SystemServer] ✓ Docker version: ${finalDockerVersion}`);
    } else if (isDocker()) {
      console.log(`[SystemServer] ⚠ Running in Docker but could not detect version`);
    }
    
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname,
      uptime,
      nodeVersion: process.version,
      docker: isDocker(),
      dockerVersion: finalDockerVersion,
      dockerStats: dockerStats,
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
      },
      disk: {
        total: diskUsage.total,
        free: diskUsage.free,
        used: diskUsage.used,
        percentage: Math.round(diskUsage.percentage * 100) / 100
      },
      disks: realDisks.map(d => ({
        mount: d.mount,
        total: d.total,
        free: d.free,
        used: d.used,
        percentage: Math.round(d.percentage * 100) / 100
      }))
    };
    
    res.json({
      success: true,
      result: systemInfo
    });
  } catch (error) {
    console.error('[SystemServer] Error getting system info:', error);
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
        console.log(`[Network] Successfully read from ${path}, found ${validInterfaces} interfaces`);
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
          console.log(`[Network] Successfully read via command: ${cmd}, found ${validInterfaces} interfaces`);
          return { rxBytes: totalRxBytes, txBytes: totalTxBytes };
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.log('[Network] Command fallback also failed');
  }
  
  console.log('[Network] Could not read network stats from any source');
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
      console.log('[Network] No network stats available, returning empty data');
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
        console.log('[Network] Time difference too large, resetting history');
        networkHistory.length = 0;
      }
    } else {
      // First call, initialize but don't calculate speed yet
      console.log('[Network] First call, initializing stats');
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
    console.error('[SystemServer] Error getting network data:', error);
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

/**
 * GET /api/system/server/docker
 * Get Docker-specific information and statistics
 */
router.get('/server/docker', async (_req, res) => {
  try {
    const dockerInfo = {
      isDocker: isDocker(),
      containerId: null as string | null,
      image: null as string | null,
      version: null as string | null,
      stats: null as Awaited<ReturnType<typeof getDockerStats>> | null
    };
    
    if (dockerInfo.isDocker) {
      try {
        // Try to get container ID from hostname (common in Docker)
        dockerInfo.containerId = os.hostname();
        
        // Try to get image from environment
        dockerInfo.image = process.env.DOCKER_IMAGE || null;
        
        // Get Docker stats (includes version and detailed stats)
        dockerInfo.stats = await getDockerStats();
        
        // Fallback to getDockerVersion if stats didn't provide version
        if (!dockerInfo.stats?.version) {
        dockerInfo.version = await getDockerVersion();
        } else {
          dockerInfo.version = dockerInfo.stats.version;
        }
      } catch (error) {
        console.error('[SystemServer] Error getting Docker info:', error);
        // Try fallback version detection
        dockerInfo.version = await getDockerVersion();
      }
    }
    
    res.json({
      success: true,
      result: dockerInfo
    });
  } catch (error) {
    console.error('[SystemServer] Error getting Docker info:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get Docker information',
        code: 'DOCKER_ERROR'
      }
    });
  }
});

export default router;

