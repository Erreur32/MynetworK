/**
 * Metrics Service
 * 
 * Exports metrics in Prometheus and InfluxDB formats
 * Collects data from system stats and plugin stats
 */

import { pluginManager } from './pluginManager.js';
import type { PluginStats } from '../plugins/base/PluginInterface.js';
import { metricsCollector } from './metricsCollector.js';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { getDatabase } from '../database/connection.js';
import { bruteForceProtection } from './bruteForceProtection.js';

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
                
                // Count active clients (devices with type='client' or connectivity_type='wifi')
                const activeClients = stats.devices.filter((d: any) => {
                    const isActive = d.active !== false;
                    const isClient = (d.type === 'client' || d.type === 'Client') || 
                                    (d.connectivity_type === 'wifi' || d.access_point?.connectivity_type === 'wifi');
                    return isActive && isClient;
                }).length;
                
                lines.push(`# HELP mynetwork_plugin_clients_active Active clients count`);
                lines.push(`# TYPE mynetwork_plugin_clients_active gauge`);
                lines.push(`mynetwork_plugin_clients_active${pluginLabels} ${activeClients}`);
                
                // Count unique IPs detected
                const uniqueIps = new Set<string>();
                stats.devices.forEach((d: any) => {
                    if (d.ip && typeof d.ip === 'string' && d.ip.trim() !== '') {
                        uniqueIps.add(d.ip.trim());
                    }
                });
                
                lines.push(`# HELP mynetwork_plugin_ips_detected Number of unique IP addresses detected`);
                lines.push(`# TYPE mynetwork_plugin_ips_detected gauge`);
                lines.push(`mynetwork_plugin_ips_detected${pluginLabels} ${uniqueIps.size}`);
            }
            
            // Network scan plugin specific metrics
            if (pluginId === 'scan-reseau' && stats.system) {
                const sys = stats.system as any;
                if (sys.totalIps !== undefined) {
                    lines.push(`# HELP mynetwork_scan_total_ips Total number of scanned IP addresses`);
                    lines.push(`# TYPE mynetwork_scan_total_ips gauge`);
                    lines.push(`mynetwork_scan_total_ips${pluginLabels} ${sys.totalIps}`);
                }
                if (sys.onlineIps !== undefined) {
                    lines.push(`# HELP mynetwork_scan_online_ips Number of online IP addresses`);
                    lines.push(`# TYPE mynetwork_scan_online_ips gauge`);
                    lines.push(`mynetwork_scan_online_ips${pluginLabels} ${sys.onlineIps}`);
                }
                if (sys.offlineIps !== undefined) {
                    lines.push(`# HELP mynetwork_scan_offline_ips Number of offline IP addresses`);
                    lines.push(`# TYPE mynetwork_scan_offline_ips gauge`);
                    lines.push(`mynetwork_scan_offline_ips${pluginLabels} ${sys.offlineIps}`);
                }
                if (sys.unknownIps !== undefined) {
                    lines.push(`# HELP mynetwork_scan_unknown_ips Number of unknown status IP addresses`);
                    lines.push(`# TYPE mynetwork_scan_unknown_ips gauge`);
                    lines.push(`mynetwork_scan_unknown_ips${pluginLabels} ${sys.unknownIps}`);
                }
            }
            
            // WiFi networks with source (Freebox or UniFi)
            if (pluginId === 'freebox' && stats.system && (stats.system as any).wifiNetworks) {
                const wifiNetworks = (stats.system as any).wifiNetworks as Array<{ ssid: string; band: string; enabled: boolean }>;
                const enabledWifiNetworks = wifiNetworks.filter((w: any) => w.enabled !== false);
                
                lines.push(`# HELP mynetwork_wifi_networks_total Total WiFi networks count`);
                lines.push(`# TYPE mynetwork_wifi_networks_total gauge`);
                lines.push(`mynetwork_wifi_networks_total{source="freebox"} ${wifiNetworks.length}`);
                
                lines.push(`# HELP mynetwork_wifi_networks_enabled Enabled WiFi networks count`);
                lines.push(`# TYPE mynetwork_wifi_networks_enabled gauge`);
                lines.push(`mynetwork_wifi_networks_enabled{source="freebox"} ${enabledWifiNetworks.length}`);
                
                // Individual WiFi network metrics
                enabledWifiNetworks.forEach((wifi: any) => {
                    const ssid = (wifi.ssid || '').replace(/"/g, '\\"');
                    const band = (wifi.band || 'unknown').replace(/"/g, '\\"');
                    const wifiLabels = `{source="freebox",ssid="${ssid}",band="${band}"}`;
                    lines.push(`mynetwork_wifi_network_enabled${wifiLabels} 1`);
                });
            }
            
            if (pluginId === 'unifi' && stats.wlans && Array.isArray(stats.wlans)) {
                const wlans = stats.wlans as Array<{ name: string; enabled: boolean; ssid?: string }>;
                const enabledWlans = wlans.filter((w: any) => w.enabled !== false);
                
                lines.push(`# HELP mynetwork_wifi_networks_total Total WiFi networks count`);
                lines.push(`# TYPE mynetwork_wifi_networks_total gauge`);
                lines.push(`mynetwork_wifi_networks_total{source="unifi"} ${wlans.length}`);
                
                lines.push(`# HELP mynetwork_wifi_networks_enabled Enabled WiFi networks count`);
                lines.push(`# TYPE mynetwork_wifi_networks_enabled gauge`);
                lines.push(`mynetwork_wifi_networks_enabled{source="unifi"} ${enabledWlans.length}`);
                
                // Individual WiFi network metrics
                enabledWlans.forEach((wlan: any) => {
                    const ssid = (wlan.ssid || wlan.name || 'unknown').replace(/"/g, '\\"');
                    const wlanLabels = `{source="unifi",ssid="${ssid}"}`;
                    lines.push(`mynetwork_wifi_network_enabled${wlanLabels} 1`);
                });
            }
        }
    } catch (error) {
        console.error('[MetricsService] Failed to fetch plugin stats:', error);
    }
    
    // Application metrics (aggregated, no high cardinality)
    try {
        const appMetrics = metricsCollector.getAllMetrics();
        
        // Scan metrics (performance metrics, calculated AFTER scan)
        if (appMetrics.scan.scanCount > 0) {
            lines.push(`# HELP mynetwork_scan_duration_seconds Duration of last scan in seconds`);
            lines.push(`# TYPE mynetwork_scan_duration_seconds gauge`);
            lines.push(`mynetwork_scan_duration_seconds ${(appMetrics.scan.lastScanDuration / 1000).toFixed(3)}`);
            
            lines.push(`# HELP mynetwork_scan_last_timestamp Timestamp of last scan (Unix timestamp)`);
            lines.push(`# TYPE mynetwork_scan_last_timestamp gauge`);
            lines.push(`mynetwork_scan_last_timestamp ${appMetrics.scan.lastScanTimestamp}`);
            
            lines.push(`# HELP mynetwork_scan_ips_scanned Number of IPs scanned in last scan`);
            lines.push(`# TYPE mynetwork_scan_ips_scanned gauge`);
            lines.push(`mynetwork_scan_ips_scanned ${appMetrics.scan.lastScanScanned}`);
            
            lines.push(`# HELP mynetwork_scan_ips_found Number of IPs found in last scan`);
            lines.push(`# TYPE mynetwork_scan_ips_found gauge`);
            lines.push(`mynetwork_scan_ips_found ${appMetrics.scan.lastScanFound}`);
            
            lines.push(`# HELP mynetwork_scan_runs_total Total number of scans executed`);
            lines.push(`# TYPE mynetwork_scan_runs_total counter`);
            lines.push(`mynetwork_scan_runs_total ${appMetrics.scan.scanCount}`);
            
            // Latency metrics (aggregated, not per IP)
            if (appMetrics.scan.latencyCount > 0) {
                const avgLatency = appMetrics.scan.latencySum / appMetrics.scan.latencyCount;
                lines.push(`# HELP mynetwork_scan_latency_avg_ms Average ping latency in milliseconds`);
                lines.push(`# TYPE mynetwork_scan_latency_avg_ms gauge`);
                lines.push(`mynetwork_scan_latency_avg_ms ${avgLatency.toFixed(2)}`);
                
                if (appMetrics.scan.latencyMin !== Infinity) {
                    lines.push(`# HELP mynetwork_scan_latency_min_ms Minimum ping latency in milliseconds`);
                    lines.push(`# TYPE mynetwork_scan_latency_min_ms gauge`);
                    lines.push(`mynetwork_scan_latency_min_ms ${appMetrics.scan.latencyMin}`);
                }
                
                if (appMetrics.scan.latencyMax > 0) {
                    lines.push(`# HELP mynetwork_scan_latency_max_ms Maximum ping latency in milliseconds`);
                    lines.push(`# TYPE mynetwork_scan_latency_max_ms gauge`);
                    lines.push(`mynetwork_scan_latency_max_ms ${appMetrics.scan.latencyMax}`);
                }
            }
        }
        
        // Database metrics
        const dbStats = NetworkScanRepository.getDatabaseStats();
        lines.push(`# HELP mynetwork_scan_db_entries_scans Number of entries in network_scans table`);
        lines.push(`# TYPE mynetwork_scan_db_entries_scans gauge`);
        lines.push(`mynetwork_scan_db_entries_scans ${dbStats.scansCount}`);
        
        lines.push(`# HELP mynetwork_scan_db_entries_history Number of entries in network_scan_history table`);
        lines.push(`# TYPE mynetwork_scan_db_entries_history gauge`);
        lines.push(`mynetwork_scan_db_entries_history ${dbStats.historyCount}`);
        
        lines.push(`# HELP mynetwork_scan_db_size_bytes Estimated database size in bytes`);
        lines.push(`# TYPE mynetwork_scan_db_size_bytes gauge`);
        lines.push(`mynetwork_scan_db_size_bytes ${dbStats.totalSize}`);
        
        if (dbStats.oldestScan) {
            lines.push(`# HELP mynetwork_scan_db_oldest_entry Timestamp of oldest entry (Unix timestamp)`);
            lines.push(`# TYPE mynetwork_scan_db_oldest_entry gauge`);
            lines.push(`mynetwork_scan_db_oldest_entry ${Math.floor(dbStats.oldestScan.getTime() / 1000)}`);
        }
        
        // Auth metrics (aggregated, no username)
        lines.push(`# HELP mynetwork_auth_login_success_total Total successful login attempts`);
        lines.push(`# TYPE mynetwork_auth_login_success_total counter`);
        lines.push(`mynetwork_auth_login_success_total ${appMetrics.auth.loginSuccessTotal}`);
        
        lines.push(`# HELP mynetwork_auth_login_failed_total Total failed login attempts`);
        lines.push(`# TYPE mynetwork_auth_login_failed_total counter`);
        lines.push(`mynetwork_auth_login_failed_total ${appMetrics.auth.loginFailedTotal}`);
        
        lines.push(`# HELP mynetwork_auth_login_blocked_total Total blocked login attempts`);
        lines.push(`# TYPE mynetwork_auth_login_blocked_total counter`);
        lines.push(`mynetwork_auth_login_blocked_total ${appMetrics.auth.loginBlockedTotal}`);
        
        lines.push(`# HELP mynetwork_auth_ip_blocked_total Total IP blocking events`);
        lines.push(`# TYPE mynetwork_auth_ip_blocked_total counter`);
        lines.push(`mynetwork_auth_ip_blocked_total ${appMetrics.auth.ipBlockedTotal}`);
        
        lines.push(`# HELP mynetwork_auth_sessions_active Number of active sessions`);
        lines.push(`# TYPE mynetwork_auth_sessions_active gauge`);
        lines.push(`mynetwork_auth_sessions_active ${appMetrics.auth.sessionsActive}`);
        
        // API metrics (aggregated by status only, no route/method)
        lines.push(`# HELP mynetwork_api_requests_total Total API requests`);
        lines.push(`# TYPE mynetwork_api_requests_total counter`);
        lines.push(`mynetwork_api_requests_total ${appMetrics.api.requestsTotal}`);
        
        lines.push(`# HELP mynetwork_api_errors_total Total API errors (status >= 400)`);
        lines.push(`# TYPE mynetwork_api_errors_total counter`);
        lines.push(`mynetwork_api_errors_total ${appMetrics.api.errorsTotal}`);
        
        // API requests by status (limited to common status codes to avoid high cardinality)
        const commonStatuses = ['200', '400', '401', '403', '404', '500'];
        for (const status of commonStatuses) {
            const count = appMetrics.api.requestsByStatus[status] || 0;
            if (count > 0 || appMetrics.api.requestsTotal > 0) {
                lines.push(`# HELP mynetwork_api_requests_by_status_total API requests by status code`);
                lines.push(`# TYPE mynetwork_api_requests_by_status_total counter`);
                lines.push(`mynetwork_api_requests_by_status_total{status="${status}"} ${count}`);
            }
        }
        
        // API duration metrics (aggregated)
        if (appMetrics.api.requestsDurationCount > 0) {
            const avgDuration = appMetrics.api.requestsDurationSum / appMetrics.api.requestsDurationCount;
            lines.push(`# HELP mynetwork_api_request_duration_avg_ms Average API request duration in milliseconds`);
            lines.push(`# TYPE mynetwork_api_request_duration_avg_ms gauge`);
            lines.push(`mynetwork_api_request_duration_avg_ms ${avgDuration.toFixed(2)}`);
            
            if (appMetrics.api.requestsDurationMin !== Infinity) {
                lines.push(`# HELP mynetwork_api_request_duration_min_ms Minimum API request duration in milliseconds`);
                lines.push(`# TYPE mynetwork_api_request_duration_min_ms gauge`);
                lines.push(`mynetwork_api_request_duration_min_ms ${appMetrics.api.requestsDurationMin}`);
            }
            
            if (appMetrics.api.requestsDurationMax > 0) {
                lines.push(`# HELP mynetwork_api_request_duration_max_ms Maximum API request duration in milliseconds`);
                lines.push(`# TYPE mynetwork_api_request_duration_max_ms gauge`);
                lines.push(`mynetwork_api_request_duration_max_ms ${appMetrics.api.requestsDurationMax}`);
            }
        }
        
        // Security metrics (aggregated by level only)
        lines.push(`# HELP mynetwork_security_events_total Security events by level`);
        lines.push(`# TYPE mynetwork_security_events_total counter`);
        for (const [level, count] of Object.entries(appMetrics.security.eventsByLevel)) {
            lines.push(`mynetwork_security_events_total{level="${level}"} ${count}`);
        }
        
        lines.push(`# HELP mynetwork_security_settings_changed_total Total security settings changes`);
        lines.push(`# TYPE mynetwork_security_settings_changed_total counter`);
        lines.push(`mynetwork_security_settings_changed_total ${appMetrics.security.settingsChangedTotal}`);
        
        // Update blocked IPs count from bruteForceProtection
        const blockedIPs = bruteForceProtection.getBlockedIdentifiers();
        metricsCollector.updateBlockedIpsCount(blockedIPs.length);
        
        lines.push(`# HELP mynetwork_security_blocked_ips_count Number of currently blocked IPs`);
        lines.push(`# TYPE mynetwork_security_blocked_ips_count gauge`);
        lines.push(`mynetwork_security_blocked_ips_count ${blockedIPs.length}`);
        
        // Scheduler metrics
        lines.push(`# HELP mynetwork_scan_scheduler_enabled Scheduler enabled status (1=enabled, 0=disabled)`);
        lines.push(`# TYPE mynetwork_scan_scheduler_enabled gauge`);
        lines.push(`mynetwork_scan_scheduler_enabled ${appMetrics.scheduler.enabled}`);
        
        if (appMetrics.scheduler.lastRunTimestamp > 0) {
            lines.push(`# HELP mynetwork_scan_scheduler_last_run Timestamp of last scheduled scan (Unix timestamp)`);
            lines.push(`# TYPE mynetwork_scan_scheduler_last_run gauge`);
            lines.push(`mynetwork_scan_scheduler_last_run ${appMetrics.scheduler.lastRunTimestamp}`);
        }
        
        if (appMetrics.scheduler.nextRunTimestamp > 0) {
            lines.push(`# HELP mynetwork_scan_scheduler_next_run Timestamp of next scheduled scan (Unix timestamp)`);
            lines.push(`# TYPE mynetwork_scan_scheduler_next_run gauge`);
            lines.push(`mynetwork_scan_scheduler_next_run ${appMetrics.scheduler.nextRunTimestamp}`);
        }
        
        lines.push(`# HELP mynetwork_scan_scheduler_runs_total Total number of scheduled scans executed`);
        lines.push(`# TYPE mynetwork_scan_scheduler_runs_total counter`);
        lines.push(`mynetwork_scan_scheduler_runs_total ${appMetrics.scheduler.runsTotal}`);
    } catch (error) {
        console.error('[MetricsService] Failed to fetch application metrics:', error);
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
                
                // Count active clients
                const activeClients = stats.devices.filter((d: any) => {
                    const isActive = d.active !== false;
                    const isClient = (d.type === 'client' || d.type === 'Client') || 
                                    (d.connectivity_type === 'wifi' || d.access_point?.connectivity_type === 'wifi');
                    return isActive && isClient;
                }).length;
                
                // Count unique IPs detected
                const uniqueIps = new Set<string>();
                stats.devices.forEach((d: any) => {
                    if (d.ip && typeof d.ip === 'string' && d.ip.trim() !== '') {
                        uniqueIps.add(d.ip.trim());
                    }
                });
                
                lines.push(`mynetwork,type=plugin_devices,plugin=${pluginTag} total=${stats.devices.length}i,active=${activeDevices}i,clients_active=${activeClients}i,ips_detected=${uniqueIps.size}i ${timestamp}`);
            }
            
            // Network scan plugin specific metrics
            if (pluginId === 'scan-reseau' && stats.system) {
                const sys = stats.system as any;
                const scanFields: string[] = [];
                if (sys.totalIps !== undefined) scanFields.push(`total_ips=${sys.totalIps}i`);
                if (sys.onlineIps !== undefined) scanFields.push(`online_ips=${sys.onlineIps}i`);
                if (sys.offlineIps !== undefined) scanFields.push(`offline_ips=${sys.offlineIps}i`);
                if (sys.unknownIps !== undefined) scanFields.push(`unknown_ips=${sys.unknownIps}i`);
                if (scanFields.length > 0) {
                    lines.push(`mynetwork,type=scan_reseau,plugin=${pluginTag} ${scanFields.join(',')} ${timestamp}`);
                }
            }
            
            // WiFi networks with source (Freebox or UniFi)
            if (pluginId === 'freebox' && stats.system && (stats.system as any).wifiNetworks) {
                const wifiNetworks = (stats.system as any).wifiNetworks as Array<{ ssid: string; band: string; enabled: boolean }>;
                const enabledWifiNetworks = wifiNetworks.filter((w: any) => w.enabled !== false);
                
                lines.push(`mynetwork,type=wifi_networks,source=freebox total=${wifiNetworks.length}i,enabled=${enabledWifiNetworks.length}i ${timestamp}`);
                
                // Individual WiFi network metrics
                enabledWifiNetworks.forEach((wifi: any) => {
                    const ssid = (wifi.ssid || '').replace(/[ ,=]/g, '_');
                    const band = (wifi.band || 'unknown').replace(/[ ,=]/g, '_');
                    lines.push(`mynetwork,type=wifi_network,source=freebox,ssid=${ssid},band=${band} enabled=1 ${timestamp}`);
                });
            }
            
            if (pluginId === 'unifi' && stats.wlans && Array.isArray(stats.wlans)) {
                const wlans = stats.wlans as Array<{ name: string; enabled: boolean; ssid?: string }>;
                const enabledWlans = wlans.filter((w: any) => w.enabled !== false);
                
                lines.push(`mynetwork,type=wifi_networks,source=unifi total=${wlans.length}i,enabled=${enabledWlans.length}i ${timestamp}`);
                
                // Individual WiFi network metrics
                enabledWlans.forEach((wlan: any) => {
                    const ssid = (wlan.ssid || wlan.name || 'unknown').replace(/[ ,=]/g, '_');
                    lines.push(`mynetwork,type=wifi_network,source=unifi,ssid=${ssid} enabled=1 ${timestamp}`);
                });
            }
        }
    } catch (error) {
        console.error('[MetricsService] Failed to fetch plugin stats:', error);
    }
    
    // Application metrics (aggregated, no high cardinality)
    try {
        const appMetrics = metricsCollector.getAllMetrics();
        const timestamp = Date.now() * 1000000; // Nanoseconds
        
        // Scan metrics
        if (appMetrics.scan.scanCount > 0) {
            lines.push(`mynetwork,type=scan_metrics duration_seconds=${(appMetrics.scan.lastScanDuration / 1000).toFixed(3)},last_timestamp=${appMetrics.scan.lastScanTimestamp}i,ips_scanned=${appMetrics.scan.lastScanScanned}i,ips_found=${appMetrics.scan.lastScanFound}i,runs_total=${appMetrics.scan.scanCount}i ${timestamp}`);
            
            if (appMetrics.scan.latencyCount > 0) {
                const avgLatency = appMetrics.scan.latencySum / appMetrics.scan.latencyCount;
                const latencyFields: string[] = [`latency_avg_ms=${avgLatency.toFixed(2)}`];
                if (appMetrics.scan.latencyMin !== Infinity) {
                    latencyFields.push(`latency_min_ms=${appMetrics.scan.latencyMin}`);
                }
                if (appMetrics.scan.latencyMax > 0) {
                    latencyFields.push(`latency_max_ms=${appMetrics.scan.latencyMax}`);
                }
                lines.push(`mynetwork,type=scan_latency ${latencyFields.join(',')} ${timestamp}`);
            }
        }
        
        // Database metrics
        const dbStats = NetworkScanRepository.getDatabaseStats();
        const dbFields: string[] = [
            `entries_scans=${dbStats.scansCount}i`,
            `entries_history=${dbStats.historyCount}i`,
            `size_bytes=${dbStats.totalSize}i`
        ];
        if (dbStats.oldestScan) {
            dbFields.push(`oldest_entry=${Math.floor(dbStats.oldestScan.getTime() / 1000)}i`);
        }
        lines.push(`mynetwork,type=scan_database ${dbFields.join(',')} ${timestamp}`);
        
        // Auth metrics
        lines.push(`mynetwork,type=auth login_success_total=${appMetrics.auth.loginSuccessTotal}i,login_failed_total=${appMetrics.auth.loginFailedTotal}i,login_blocked_total=${appMetrics.auth.loginBlockedTotal}i,ip_blocked_total=${appMetrics.auth.ipBlockedTotal}i,sessions_active=${appMetrics.auth.sessionsActive}i ${timestamp}`);
        
        // API metrics
        const apiFields: string[] = [
            `requests_total=${appMetrics.api.requestsTotal}i`,
            `errors_total=${appMetrics.api.errorsTotal}i`
        ];
        if (appMetrics.api.requestsDurationCount > 0) {
            const avgDuration = appMetrics.api.requestsDurationSum / appMetrics.api.requestsDurationCount;
            apiFields.push(`request_duration_avg_ms=${avgDuration.toFixed(2)}`);
            if (appMetrics.api.requestsDurationMin !== Infinity) {
                apiFields.push(`request_duration_min_ms=${appMetrics.api.requestsDurationMin}`);
            }
            if (appMetrics.api.requestsDurationMax > 0) {
                apiFields.push(`request_duration_max_ms=${appMetrics.api.requestsDurationMax}`);
            }
        }
        lines.push(`mynetwork,type=api ${apiFields.join(',')} ${timestamp}`);
        
        // API requests by status (limited to common status codes)
        const commonStatuses = ['200', '400', '401', '403', '404', '500'];
        for (const status of commonStatuses) {
            const count = appMetrics.api.requestsByStatus[status] || 0;
            if (count > 0 || appMetrics.api.requestsTotal > 0) {
                lines.push(`mynetwork,type=api_requests_by_status,status=${status} count=${count}i ${timestamp}`);
            }
        }
        
        // Security metrics
        const blockedIPs = bruteForceProtection.getBlockedIdentifiers();
        metricsCollector.updateBlockedIpsCount(blockedIPs.length);
        
        for (const [level, count] of Object.entries(appMetrics.security.eventsByLevel)) {
            lines.push(`mynetwork,type=security_events,level=${level} count=${count}i ${timestamp}`);
        }
        lines.push(`mynetwork,type=security settings_changed_total=${appMetrics.security.settingsChangedTotal}i,blocked_ips_count=${blockedIPs.length}i ${timestamp}`);
        
        // Scheduler metrics
        const schedulerFields: string[] = [`enabled=${appMetrics.scheduler.enabled}i`, `runs_total=${appMetrics.scheduler.runsTotal}i`];
        if (appMetrics.scheduler.lastRunTimestamp > 0) {
            schedulerFields.push(`last_run=${appMetrics.scheduler.lastRunTimestamp}i`);
        }
        if (appMetrics.scheduler.nextRunTimestamp > 0) {
            schedulerFields.push(`next_run=${appMetrics.scheduler.nextRunTimestamp}i`);
        }
        lines.push(`mynetwork,type=scan_scheduler ${schedulerFields.join(',')} ${timestamp}`);
    } catch (error) {
        console.error('[MetricsService] Failed to fetch application metrics:', error);
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

