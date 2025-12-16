/**
 * Metrics Service
 * 
 * Exports metrics in Prometheus and InfluxDB formats
 * Collects data from system stats and plugin stats
 */

import { pluginManager } from './pluginManager.js';
import type { PluginStats } from '../plugins/base/PluginInterface.js';

export interface MetricsConfig {
    prometheus: {
        enabled: boolean;
        port?: number;
        path?: string;
    };
    influxdb: {
        enabled: boolean;
        url?: string;
        database?: string;
        username?: string;
        password?: string;
        retention?: string;
    };
}

/**
 * Generate Prometheus metrics format
 */
export async function generatePrometheusMetrics(): Promise<string> {
    const lines: string[] = [];
    
    // System metrics
    try {
        const systemResponse = await fetch(`http://localhost:${process.env.PORT || 3003}/api/system/server`);
        if (systemResponse.ok) {
            const systemData = await systemResponse.json();
            if (systemData.success && systemData.result) {
                const sys = systemData.result;
                
                // CPU
                if (sys.cpu !== undefined) {
                    lines.push(`# HELP mynetwork_cpu_usage CPU usage percentage`);
                    lines.push(`# TYPE mynetwork_cpu_usage gauge`);
                    lines.push(`mynetwork_cpu_usage ${sys.cpu || 0}`);
                }
                
                // Memory
                if (sys.memory) {
                    lines.push(`# HELP mynetwork_memory_total Total memory in bytes`);
                    lines.push(`# TYPE mynetwork_memory_total gauge`);
                    lines.push(`mynetwork_memory_total ${sys.memory.total || 0}`);
                    
                    lines.push(`# HELP mynetwork_memory_used Used memory in bytes`);
                    lines.push(`# TYPE mynetwork_memory_used gauge`);
                    lines.push(`mynetwork_memory_used ${sys.memory.used || 0}`);
                    
                    lines.push(`# HELP mynetwork_memory_free Free memory in bytes`);
                    lines.push(`# TYPE mynetwork_memory_free gauge`);
                    lines.push(`mynetwork_memory_free ${sys.memory.free || 0}`);
                    
                    if (sys.memory.total && sys.memory.used) {
                        const usagePercent = (sys.memory.used / sys.memory.total) * 100;
                        lines.push(`# HELP mynetwork_memory_usage Memory usage percentage`);
                        lines.push(`# TYPE mynetwork_memory_usage gauge`);
                        lines.push(`mynetwork_memory_usage ${usagePercent.toFixed(2)}`);
                    }
                }
                
                // Disk
                if (sys.disks && Array.isArray(sys.disks)) {
                    lines.push(`# HELP mynetwork_disk_total Total disk space in bytes`);
                    lines.push(`# TYPE mynetwork_disk_total gauge`);
                    lines.push(`# HELP mynetwork_disk_used Used disk space in bytes`);
                    lines.push(`# TYPE mynetwork_disk_used gauge`);
                    lines.push(`# HELP mynetwork_disk_free Free disk space in bytes`);
                    lines.push(`# TYPE mynetwork_disk_free gauge`);
                    lines.push(`# HELP mynetwork_disk_usage Disk usage percentage`);
                    lines.push(`# TYPE mynetwork_disk_usage gauge`);
                    
                    sys.disks.forEach((disk: any, index: number) => {
                        const mountpoint = disk.mountpoint || `/disk${index}`;
                        const labels = `{mountpoint="${mountpoint}",device="${disk.device || 'unknown'}"}`;
                        
                        if (disk.total) lines.push(`mynetwork_disk_total${labels} ${disk.total}`);
                        if (disk.used) lines.push(`mynetwork_disk_used${labels} ${disk.used}`);
                        if (disk.free) lines.push(`mynetwork_disk_free${labels} ${disk.free}`);
                        if (disk.usage) lines.push(`mynetwork_disk_usage${labels} ${disk.usage}`);
                    });
                }
            }
        }
    } catch (error) {
        console.error('[MetricsService] Failed to fetch system stats:', error);
    }
    
    // Network stats
    try {
        const networkResponse = await fetch(`http://localhost:${process.env.PORT || 3003}/api/system/server/network`);
        if (networkResponse.ok) {
            const networkData = await networkResponse.json();
            if (networkData.success && networkData.result) {
                const net = networkData.result;
                
                lines.push(`# HELP mynetwork_network_download Download speed in bytes per second`);
                lines.push(`# TYPE mynetwork_network_download gauge`);
                lines.push(`mynetwork_network_download ${net.download || 0}`);
                
                lines.push(`# HELP mynetwork_network_upload Upload speed in bytes per second`);
                lines.push(`# TYPE mynetwork_network_upload gauge`);
                lines.push(`mynetwork_network_upload ${net.upload || 0}`);
            }
        }
    } catch (error) {
        console.error('[MetricsService] Failed to fetch network stats:', error);
    }
    
    // Plugin stats
    try {
        const allStats = await pluginManager.getAllStats();
        
        for (const [pluginId, stats] of Object.entries(allStats)) {
            if (!stats) continue;
            
            const pluginLabels = `{plugin="${pluginId}"}`;
            
            // Network stats from plugins
            if (stats.network) {
                if (stats.network.download !== undefined) {
                    lines.push(`# HELP mynetwork_plugin_network_download Plugin download speed in bytes per second`);
                    lines.push(`# TYPE mynetwork_plugin_network_download gauge`);
                    lines.push(`mynetwork_plugin_network_download${pluginLabels} ${stats.network.download}`);
                }
                if (stats.network.upload !== undefined) {
                    lines.push(`# HELP mynetwork_plugin_network_upload Plugin upload speed in bytes per second`);
                    lines.push(`# TYPE mynetwork_plugin_network_upload gauge`);
                    lines.push(`mynetwork_plugin_network_upload${pluginLabels} ${stats.network.upload}`);
                }
            }
            
            // System stats from plugins
            if (stats.system) {
                if (stats.system.uptime !== undefined) {
                    lines.push(`# HELP mynetwork_plugin_uptime Plugin uptime in seconds`);
                    lines.push(`# TYPE mynetwork_plugin_uptime gauge`);
                    lines.push(`mynetwork_plugin_uptime${pluginLabels} ${stats.system.uptime}`);
                }
                if (stats.system.temperature !== undefined) {
                    lines.push(`# HELP mynetwork_plugin_temperature Plugin temperature in Celsius`);
                    lines.push(`# TYPE mynetwork_plugin_temperature gauge`);
                    lines.push(`mynetwork_plugin_temperature${pluginLabels} ${stats.system.temperature}`);
                }
                if (stats.system.memory) {
                    if (stats.system.memory.total) {
                        lines.push(`# HELP mynetwork_plugin_memory_total Plugin total memory in bytes`);
                        lines.push(`# TYPE mynetwork_plugin_memory_total gauge`);
                        lines.push(`mynetwork_plugin_memory_total${pluginLabels} ${stats.system.memory.total}`);
                    }
                    if (stats.system.memory.used) {
                        lines.push(`# HELP mynetwork_plugin_memory_used Plugin used memory in bytes`);
                        lines.push(`# TYPE mynetwork_plugin_memory_used gauge`);
                        lines.push(`mynetwork_plugin_memory_used${pluginLabels} ${stats.system.memory.used}`);
                    }
                }
                if (stats.system.cpu) {
                    if (stats.system.cpu.usage !== undefined) {
                        lines.push(`# HELP mynetwork_plugin_cpu_usage Plugin CPU usage percentage`);
                        lines.push(`# TYPE mynetwork_plugin_cpu_usage gauge`);
                        lines.push(`mynetwork_plugin_cpu_usage${pluginLabels} ${stats.system.cpu.usage}`);
                    }
                }
            }
            
            // Device count
            if (stats.devices && Array.isArray(stats.devices)) {
                const activeDevices = stats.devices.filter((d: any) => d.active !== false).length;
                lines.push(`# HELP mynetwork_plugin_devices_total Total number of devices`);
                lines.push(`# TYPE mynetwork_plugin_devices_total gauge`);
                lines.push(`mynetwork_plugin_devices_total${pluginLabels} ${stats.devices.length}`);
                
                lines.push(`# HELP mynetwork_plugin_devices_active Active number of devices`);
                lines.push(`# TYPE mynetwork_plugin_devices_active gauge`);
                lines.push(`mynetwork_plugin_devices_active${pluginLabels} ${activeDevices}`);
            }
        }
    } catch (error) {
        console.error('[MetricsService] Failed to fetch plugin stats:', error);
    }
    
    return lines.join('\n') + '\n';
}

/**
 * Generate InfluxDB line protocol format
 */
export async function generateInfluxDBMetrics(): Promise<string> {
    const lines: string[] = [];
    const timestamp = Date.now() * 1000000; // Nanoseconds
    
    // System metrics
    try {
        const systemResponse = await fetch(`http://localhost:${process.env.PORT || 3003}/api/system/server`);
        if (systemResponse.ok) {
            const systemData = await systemResponse.json();
            if (systemData.success && systemData.result) {
                const sys = systemData.result;
                
                // CPU
                if (sys.cpu !== undefined) {
                    lines.push(`mynetwork,type=cpu usage=${sys.cpu || 0} ${timestamp}`);
                }
                
                // Memory
                if (sys.memory) {
                    const mem = sys.memory;
                    lines.push(`mynetwork,type=memory total=${mem.total || 0}i,used=${mem.used || 0}i,free=${mem.free || 0}i ${timestamp}`);
                    if (mem.total && mem.used) {
                        const usagePercent = (mem.used / mem.total) * 100;
                        lines.push(`mynetwork,type=memory usage=${usagePercent.toFixed(2)} ${timestamp}`);
                    }
                }
                
                // Disk
                if (sys.disks && Array.isArray(sys.disks)) {
                    sys.disks.forEach((disk: any) => {
                        const mountpoint = (disk.mountpoint || 'unknown').replace(/[ ,=]/g, '_');
                        const device = (disk.device || 'unknown').replace(/[ ,=]/g, '_');
                        if (disk.total || disk.used || disk.free) {
                            lines.push(`mynetwork,type=disk,mountpoint=${mountpoint},device=${device} total=${disk.total || 0}i,used=${disk.used || 0}i,free=${disk.free || 0}i ${timestamp}`);
                        }
                        if (disk.usage !== undefined) {
                            lines.push(`mynetwork,type=disk,mountpoint=${mountpoint},device=${device} usage=${disk.usage} ${timestamp}`);
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error('[MetricsService] Failed to fetch system stats:', error);
    }
    
    // Network stats
    try {
        const networkResponse = await fetch(`http://localhost:${process.env.PORT || 3003}/api/system/server/network`);
        if (networkResponse.ok) {
            const networkData = await networkResponse.json();
            if (networkData.success && networkData.result) {
                const net = networkData.result;
                lines.push(`mynetwork,type=network download=${net.download || 0}i,upload=${net.upload || 0}i ${timestamp}`);
            }
        }
    } catch (error) {
        console.error('[MetricsService] Failed to fetch network stats:', error);
    }
    
    // Plugin stats
    try {
        const allStats = await pluginManager.getAllStats();
        
        for (const [pluginId, stats] of Object.entries(allStats)) {
            if (!stats) continue;
            
            const pluginTag = pluginId.replace(/[ ,=]/g, '_');
            
            // Network stats from plugins
            if (stats.network) {
                const net = stats.network;
                const netFields: string[] = [];
                if (net.download !== undefined) netFields.push(`download=${net.download}i`);
                if (net.upload !== undefined) netFields.push(`upload=${net.upload}i`);
                if (netFields.length > 0) {
                    lines.push(`mynetwork,type=plugin_network,plugin=${pluginTag} ${netFields.join(',')} ${timestamp}`);
                }
            }
            
            // System stats from plugins
            if (stats.system) {
                const sys = stats.system;
                const sysFields: string[] = [];
                
                if (sys.uptime !== undefined) sysFields.push(`uptime=${sys.uptime}i`);
                if (sys.temperature !== undefined) sysFields.push(`temperature=${sys.temperature}`);
                if (sys.memory) {
                    if (sys.memory.total !== undefined) sysFields.push(`memory_total=${sys.memory.total}i`);
                    if (sys.memory.used !== undefined) sysFields.push(`memory_used=${sys.memory.used}i`);
                    if (sys.memory.free !== undefined) sysFields.push(`memory_free=${sys.memory.free}i`);
                }
                if (sys.cpu) {
                    if (sys.cpu.usage !== undefined) sysFields.push(`cpu_usage=${sys.cpu.usage}`);
                    if (sys.cpu.cores !== undefined) sysFields.push(`cpu_cores=${sys.cpu.cores}i`);
                }
                
                if (sysFields.length > 0) {
                    lines.push(`mynetwork,type=plugin_system,plugin=${pluginTag} ${sysFields.join(',')} ${timestamp}`);
                }
            }
            
            // Device count
            if (stats.devices && Array.isArray(stats.devices)) {
                const activeDevices = stats.devices.filter((d: any) => d.active !== false).length;
                lines.push(`mynetwork,type=plugin_devices,plugin=${pluginTag} total=${stats.devices.length}i,active=${activeDevices}i ${timestamp}`);
            }
        }
    } catch (error) {
        console.error('[MetricsService] Failed to fetch plugin stats:', error);
    }
    
    return lines.join('\n') + '\n';
}

/**
 * Get default metrics configuration
 */
export function getDefaultMetricsConfig(): MetricsConfig {
    return {
        prometheus: {
            enabled: false,
            port: 9090,
            path: '/metrics'
        },
        influxdb: {
            enabled: false,
            url: 'http://localhost:8086',
            database: 'mynetwork',
            username: '',
            password: '',
            retention: '30d'
        }
    };
}

