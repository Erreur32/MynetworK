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
 * Convert a value to a valid Prometheus number
 * Handles objects, null, undefined, and ensures numeric output
 */
function toPrometheusNumber(value: any): number {
    // If value is null or undefined, return 0
    if (value === null || value === undefined) {
        return 0;
    }
    
    // If value is already a number, return it
    if (typeof value === 'number') {
        return isNaN(value) || !isFinite(value) ? 0 : value;
    }
    
    // If value is a boolean, convert to 0 or 1
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    
    // If value is an object, try to extract numeric value
    if (typeof value === 'object') {
        // If it has a 'value' property, use that
        if ('value' in value && typeof value.value === 'number') {
            return toPrometheusNumber(value.value);
        }
        // If it has a 'usage' property, use that (for CPU)
        if ('usage' in value && typeof value.usage === 'number') {
            return toPrometheusNumber(value.usage);
        }
        // If it has a 'percentage' property, use that (for memory/disk)
        if ('percentage' in value && typeof value.percentage === 'number') {
            return toPrometheusNumber(value.percentage);
        }
        // Otherwise, return 0 (don't convert object to string)
        return 0;
    }
    
    // Try to parse as number
    const parsed = parseFloat(String(value));
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
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
                    const cpuUsage = typeof sys.cpu === 'object' && sys.cpu !== null ? sys.cpu.usage : sys.cpu;
                    const cpuValue = toPrometheusNumber(cpuUsage);
                    lines.push(`# HELP mynetwork_cpu_usage CPU usage percentage`);
                    lines.push(`# TYPE mynetwork_cpu_usage gauge`);
                    lines.push(`mynetwork_cpu_usage ${cpuValue}`);
                }
                
                // Memory
                if (sys.memory) {
                    const memTotal = toPrometheusNumber(sys.memory.total);
                    const memUsed = toPrometheusNumber(sys.memory.used);
                    const memFree = toPrometheusNumber(sys.memory.free);
                    
                    lines.push(`# HELP mynetwork_memory_total Total memory in bytes`);
                    lines.push(`# TYPE mynetwork_memory_total gauge`);
                    lines.push(`mynetwork_memory_total ${memTotal}`);
                    
                    lines.push(`# HELP mynetwork_memory_used Used memory in bytes`);
                    lines.push(`# TYPE mynetwork_memory_used gauge`);
                    lines.push(`mynetwork_memory_used ${memUsed}`);
                    
                    lines.push(`# HELP mynetwork_memory_free Free memory in bytes`);
                    lines.push(`# TYPE mynetwork_memory_free gauge`);
                    lines.push(`mynetwork_memory_free ${memFree}`);
                    
                    // Use percentage from API if available, otherwise calculate
                    if (sys.memory.percentage !== undefined) {
                        const usagePercent = toPrometheusNumber(sys.memory.percentage);
                        lines.push(`# HELP mynetwork_memory_usage Memory usage percentage`);
                        lines.push(`# TYPE mynetwork_memory_usage gauge`);
                        lines.push(`mynetwork_memory_usage ${usagePercent.toFixed(2)}`);
                    } else if (memTotal > 0 && memUsed > 0) {
                        const usagePercent = (memUsed / memTotal) * 100;
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
                        const mountpoint = (disk.mountpoint || disk.mount || `/disk${index}`).replace(/"/g, '\\"');
                        const device = (disk.device || 'unknown').replace(/"/g, '\\"');
                        const labels = `{mountpoint="${mountpoint}",device="${device}"}`;
                        
                        const diskTotal = toPrometheusNumber(disk.total);
                        const diskUsed = toPrometheusNumber(disk.used);
                        const diskFree = toPrometheusNumber(disk.free);
                        const diskUsage = disk.percentage !== undefined ? toPrometheusNumber(disk.percentage) : (diskTotal > 0 && diskUsed > 0 ? (diskUsed / diskTotal) * 100 : 0);
                        
                        if (diskTotal > 0) lines.push(`mynetwork_disk_total${labels} ${diskTotal}`);
                        if (diskUsed > 0) lines.push(`mynetwork_disk_used${labels} ${diskUsed}`);
                        if (diskFree > 0) lines.push(`mynetwork_disk_free${labels} ${diskFree}`);
                        if (diskUsage > 0) lines.push(`mynetwork_disk_usage${labels} ${diskUsage.toFixed(2)}`);
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
                
                const netDownload = toPrometheusNumber(net.download);
                const netUpload = toPrometheusNumber(net.upload);
                
                lines.push(`# HELP mynetwork_network_download Download speed in bytes per second`);
                lines.push(`# TYPE mynetwork_network_download gauge`);
                lines.push(`mynetwork_network_download ${netDownload}`);
                
                lines.push(`# HELP mynetwork_network_upload Upload speed in bytes per second`);
                lines.push(`# TYPE mynetwork_network_upload gauge`);
                lines.push(`mynetwork_network_upload ${netUpload}`);
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
                    const downloadValue = toPrometheusNumber(stats.network.download);
                    lines.push(`# HELP mynetwork_plugin_network_download Plugin download speed in bytes per second`);
                    lines.push(`# TYPE mynetwork_plugin_network_download gauge`);
                    lines.push(`mynetwork_plugin_network_download${pluginLabels} ${downloadValue}`);
                }
                if (stats.network.upload !== undefined) {
                    const uploadValue = toPrometheusNumber(stats.network.upload);
                    lines.push(`# HELP mynetwork_plugin_network_upload Plugin upload speed in bytes per second`);
                    lines.push(`# TYPE mynetwork_plugin_network_upload gauge`);
                    lines.push(`mynetwork_plugin_network_upload${pluginLabels} ${uploadValue}`);
                }
            }
            
            // System stats from plugins
            if (stats.system) {
                if (stats.system.uptime !== undefined) {
                    const uptimeValue = toPrometheusNumber(stats.system.uptime);
                    lines.push(`# HELP mynetwork_plugin_uptime Plugin uptime in seconds`);
                    lines.push(`# TYPE mynetwork_plugin_uptime gauge`);
                    lines.push(`mynetwork_plugin_uptime${pluginLabels} ${uptimeValue}`);
                }
                if (stats.system.temperature !== undefined) {
                    const tempValue = toPrometheusNumber(stats.system.temperature);
                    lines.push(`# HELP mynetwork_plugin_temperature Plugin temperature in Celsius`);
                    lines.push(`# TYPE mynetwork_plugin_temperature gauge`);
                    lines.push(`mynetwork_plugin_temperature${pluginLabels} ${tempValue}`);
                }
                if (stats.system.memory) {
                    if (stats.system.memory.total !== undefined) {
                        const memTotalValue = toPrometheusNumber(stats.system.memory.total);
                        lines.push(`# HELP mynetwork_plugin_memory_total Plugin total memory in bytes`);
                        lines.push(`# TYPE mynetwork_plugin_memory_total gauge`);
                        lines.push(`mynetwork_plugin_memory_total${pluginLabels} ${memTotalValue}`);
                    }
                    if (stats.system.memory.used !== undefined) {
                        const memUsedValue = toPrometheusNumber(stats.system.memory.used);
                        lines.push(`# HELP mynetwork_plugin_memory_used Plugin used memory in bytes`);
                        lines.push(`# TYPE mynetwork_plugin_memory_used gauge`);
                        lines.push(`mynetwork_plugin_memory_used${pluginLabels} ${memUsedValue}`);
                    }
                }
                if (stats.system.cpu) {
                    if (stats.system.cpu.usage !== undefined) {
                        const cpuUsageValue = toPrometheusNumber(stats.system.cpu.usage);
                        lines.push(`# HELP mynetwork_plugin_cpu_usage Plugin CPU usage percentage`);
                        lines.push(`# TYPE mynetwork_plugin_cpu_usage gauge`);
                        lines.push(`mynetwork_plugin_cpu_usage${pluginLabels} ${cpuUsageValue}`);
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
                    const totalIpsValue = toPrometheusNumber(sys.totalIps);
                    lines.push(`# HELP mynetwork_scan_total_ips Total number of scanned IP addresses`);
                    lines.push(`# TYPE mynetwork_scan_total_ips gauge`);
                    lines.push(`mynetwork_scan_total_ips${pluginLabels} ${totalIpsValue}`);
                }
                if (sys.onlineIps !== undefined) {
                    const onlineIpsValue = toPrometheusNumber(sys.onlineIps);
                    lines.push(`# HELP mynetwork_scan_online_ips Number of online IP addresses`);
                    lines.push(`# TYPE mynetwork_scan_online_ips gauge`);
                    lines.push(`mynetwork_scan_online_ips${pluginLabels} ${onlineIpsValue}`);
                }
                if (sys.offlineIps !== undefined) {
                    const offlineIpsValue = toPrometheusNumber(sys.offlineIps);
                    lines.push(`# HELP mynetwork_scan_offline_ips Number of offline IP addresses`);
                    lines.push(`# TYPE mynetwork_scan_offline_ips gauge`);
                    lines.push(`mynetwork_scan_offline_ips${pluginLabels} ${offlineIpsValue}`);
                }
                if (sys.unknownIps !== undefined) {
                    const unknownIpsValue = toPrometheusNumber(sys.unknownIps);
                    lines.push(`# HELP mynetwork_scan_unknown_ips Number of unknown status IP addresses`);
                    lines.push(`# TYPE mynetwork_scan_unknown_ips gauge`);
                    lines.push(`mynetwork_scan_unknown_ips${pluginLabels} ${unknownIpsValue}`);
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
                    const cpuUsage = typeof sys.cpu === 'object' && sys.cpu !== null ? sys.cpu.usage : sys.cpu;
                    const cpuValue = toPrometheusNumber(cpuUsage);
                    lines.push(`mynetwork,type=cpu usage=${cpuValue} ${timestamp}`);
                }
                
                // Memory
                if (sys.memory) {
                    const memTotal = toPrometheusNumber(sys.memory.total);
                    const memUsed = toPrometheusNumber(sys.memory.used);
                    const memFree = toPrometheusNumber(sys.memory.free);
                    lines.push(`mynetwork,type=memory total=${Math.round(memTotal)}i,used=${Math.round(memUsed)}i,free=${Math.round(memFree)}i ${timestamp}`);
                    
                    // Use percentage from API if available, otherwise calculate
                    if (sys.memory.percentage !== undefined) {
                        const usagePercent = toPrometheusNumber(sys.memory.percentage);
                        lines.push(`mynetwork,type=memory usage=${usagePercent.toFixed(2)} ${timestamp}`);
                    } else if (memTotal > 0 && memUsed > 0) {
                        const usagePercent = (memUsed / memTotal) * 100;
                        lines.push(`mynetwork,type=memory usage=${usagePercent.toFixed(2)} ${timestamp}`);
                    }
                }
                
                // Disk
                if (sys.disks && Array.isArray(sys.disks)) {
                    sys.disks.forEach((disk: any) => {
                        const mountpoint = (disk.mountpoint || disk.mount || 'unknown').replace(/[ ,=]/g, '_');
                        const device = (disk.device || 'unknown').replace(/[ ,=]/g, '_');
                        
                        const diskTotal = toPrometheusNumber(disk.total);
                        const diskUsed = toPrometheusNumber(disk.used);
                        const diskFree = toPrometheusNumber(disk.free);
                        
                        if (diskTotal > 0 || diskUsed > 0 || diskFree > 0) {
                            lines.push(`mynetwork,type=disk,mountpoint=${mountpoint},device=${device} total=${Math.round(diskTotal)}i,used=${Math.round(diskUsed)}i,free=${Math.round(diskFree)}i ${timestamp}`);
                        }
                        
                        const diskUsage = disk.percentage !== undefined ? toPrometheusNumber(disk.percentage) : (diskTotal > 0 && diskUsed > 0 ? (diskUsed / diskTotal) * 100 : 0);
                        if (diskUsage > 0) {
                            lines.push(`mynetwork,type=disk,mountpoint=${mountpoint},device=${device} usage=${diskUsage.toFixed(2)} ${timestamp}`);
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
                const netDownload = toPrometheusNumber(net.download);
                const netUpload = toPrometheusNumber(net.upload);
                lines.push(`mynetwork,type=network download=${Math.round(netDownload)}i,upload=${Math.round(netUpload)}i ${timestamp}`);
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
                if (net.download !== undefined) {
                    const downloadValue = toPrometheusNumber(net.download);
                    netFields.push(`download=${Math.round(downloadValue)}i`);
                }
                if (net.upload !== undefined) {
                    const uploadValue = toPrometheusNumber(net.upload);
                    netFields.push(`upload=${Math.round(uploadValue)}i`);
                }
                if (netFields.length > 0) {
                    lines.push(`mynetwork,type=plugin_network,plugin=${pluginTag} ${netFields.join(',')} ${timestamp}`);
                }
            }
            
            // System stats from plugins
            if (stats.system) {
                const sys = stats.system;
                const sysFields: string[] = [];
                
                if (sys.uptime !== undefined) {
                    const uptimeValue = toPrometheusNumber(sys.uptime);
                    sysFields.push(`uptime=${Math.round(uptimeValue)}i`);
                }
                if (sys.temperature !== undefined) {
                    const tempValue = toPrometheusNumber(sys.temperature);
                    sysFields.push(`temperature=${tempValue}`);
                }
                if (sys.memory) {
                    if (sys.memory.total !== undefined) {
                        const memTotalValue = toPrometheusNumber(sys.memory.total);
                        sysFields.push(`memory_total=${Math.round(memTotalValue)}i`);
                    }
                    if (sys.memory.used !== undefined) {
                        const memUsedValue = toPrometheusNumber(sys.memory.used);
                        sysFields.push(`memory_used=${Math.round(memUsedValue)}i`);
                    }
                    if (sys.memory.free !== undefined) {
                        const memFreeValue = toPrometheusNumber(sys.memory.free);
                        sysFields.push(`memory_free=${Math.round(memFreeValue)}i`);
                    }
                }
                if (sys.cpu) {
                    if (sys.cpu.usage !== undefined) {
                        const cpuUsageValue = toPrometheusNumber(sys.cpu.usage);
                        sysFields.push(`cpu_usage=${cpuUsageValue}`);
                    }
                    if (sys.cpu.cores !== undefined) {
                        const cpuCoresValue = toPrometheusNumber(sys.cpu.cores);
                        sysFields.push(`cpu_cores=${Math.round(cpuCoresValue)}i`);
                    }
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
                if (sys.totalIps !== undefined) {
                    const totalIpsValue = toPrometheusNumber(sys.totalIps);
                    scanFields.push(`total_ips=${Math.round(totalIpsValue)}i`);
                }
                if (sys.onlineIps !== undefined) {
                    const onlineIpsValue = toPrometheusNumber(sys.onlineIps);
                    scanFields.push(`online_ips=${Math.round(onlineIpsValue)}i`);
                }
                if (sys.offlineIps !== undefined) {
                    const offlineIpsValue = toPrometheusNumber(sys.offlineIps);
                    scanFields.push(`offline_ips=${Math.round(offlineIpsValue)}i`);
                }
                if (sys.unknownIps !== undefined) {
                    const unknownIpsValue = toPrometheusNumber(sys.unknownIps);
                    scanFields.push(`unknown_ips=${Math.round(unknownIpsValue)}i`);
                }
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

