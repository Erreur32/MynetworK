/**
 * Search Service
 * 
 * Handles search across all active plugins
 * Searches in devices, DHCP clients, port forwarding, etc.
 */

import { pluginManager } from './pluginManager.js';
import { logger } from '../utils/logger.js';
import type { IPlugin } from '../plugins/base/PluginInterface.js';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';

export interface SearchResult {
    pluginId: string;
    pluginName: string;
    type: 'device' | 'dhcp' | 'port-forward' | 'client' | 'ap' | 'switch';
    id: string;
    name: string;
    ip?: string;
    mac?: string;
    port?: number | string;
    hostname?: string;
    active?: boolean;
    lastSeen?: Date;
    additionalData?: Record<string, any>;
}

export interface SearchOptions {
    query: string;
    pluginIds?: string[]; // Filter by specific plugins
    types?: SearchResult['type'][]; // Filter by result types
    exactMatch?: boolean; // Exact match vs partial match
    caseSensitive?: boolean; // Case sensitive vs insensitive
}

export class SearchService {
    /**
     * Search across all active plugins
     */
    async search(options: SearchOptions): Promise<SearchResult[]> {
        const { query, pluginIds, types, exactMatch = false, caseSensitive = false } = options;
        
        if (!query || query.trim().length === 0) {
            return [];
        }

        const normalizedQuery = caseSensitive ? query.trim() : query.trim().toLowerCase();
        const allResults: SearchResult[] = [];

        // Search in network scans (scan-réseau plugin)
        // Only include if no plugin filter or if scan-réseau is in the filter
        if (!pluginIds || pluginIds.length === 0 || pluginIds.includes('scan-reseau')) {
            try {
                const scanResults = await this.searchInNetworkScans(normalizedQuery, exactMatch, caseSensitive, types);
                allResults.push(...scanResults);
            } catch (error) {
                logger.error('SearchService', 'Error searching in network scans:', error);
            }
        }

        // Get all active plugins
        const plugins = pluginManager.getAllPlugins();
        const activePlugins = plugins.filter(plugin => {
            if (!plugin.isEnabled()) return false;
            if (pluginIds && pluginIds.length > 0) {
                return pluginIds.includes(plugin.getId());
            }
            return true;
        });

        // Search in each active plugin
        for (const plugin of activePlugins) {
            try {
                const pluginResults = await this.searchInPlugin(plugin, normalizedQuery, exactMatch, caseSensitive, types);
                allResults.push(...pluginResults);
            } catch (error) {
                logger.error('SearchService', `Error searching in plugin ${plugin.getId()}:`, error);
            }
        }

        return allResults;
    }

    /**
     * Search in a specific plugin
     */
    private async searchInPlugin(
        plugin: IPlugin,
        query: string,
        exactMatch: boolean,
        caseSensitive: boolean,
        typeFilter?: SearchResult['type'][]
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const pluginId = plugin.getId();
        const pluginName = plugin.getName();

        try {
            // Get plugin stats which contains devices and other data
            const stats = await pluginManager.getPluginStats(pluginId);
            if (!stats) return results;

            // Helper function to check if a value matches the query
            const matches = (value: string | number | undefined | null): boolean => {
                if (value === undefined || value === null) return false;
                const strValue = String(value);
                const normalizedValue = caseSensitive ? strValue : strValue.toLowerCase();
                
                if (exactMatch) {
                    return normalizedValue === query;
                } else {
                    return normalizedValue.includes(query);
                }
            };

            // Search in Freebox plugin
            if (pluginId === 'freebox') {
                // Search in devices
                if (!typeFilter || typeFilter.includes('device')) {
                    if (stats.devices && Array.isArray(stats.devices)) {
                        for (const device of stats.devices) {
                            const dev = device as { name?: string; mac?: string; ip?: string; hostname?: string; id?: string; active?: boolean; lastSeen?: Date; type?: string };
                            if (
                                matches(dev.name) ||
                                matches(dev.mac) ||
                                matches(dev.ip) ||
                                matches(dev.hostname)
                            ) {
                                results.push({
                                    pluginId,
                                    pluginName,
                                    type: 'device',
                                    id: dev.id || dev.mac || '',
                                    name: dev.name || 'Unknown Device',
                                    ip: dev.ip,
                                    mac: dev.mac,
                                    hostname: dev.hostname,
                                    active: dev.active,
                                    lastSeen: dev.lastSeen,
                                    additionalData: {
                                        vendor: dev.type,
                                        ...dev
                                    }
                                });
                            }
                        }
                    }
                }

                // Search in DHCP leases (from system stats)
                if (!typeFilter || typeFilter.includes('dhcp')) {
                    const systemStats = stats.system as any;
                    if (systemStats?.dhcp) {
                        const dhcpLeases = systemStats.dhcp.leases || [];
                        const dhcpStatic = systemStats.dhcp.staticLeases || [];
                        const allDhcp = [...dhcpLeases, ...dhcpStatic];

                        for (const lease of allDhcp) {
                            if (
                                matches(lease.hostname) ||
                                matches(lease.mac) ||
                                matches(lease.ip) ||
                                matches(lease.host)
                            ) {
                                results.push({
                                    pluginId,
                                    pluginName,
                                    type: 'dhcp',
                                    id: lease.mac || lease.ip || '',
                                    name: lease.hostname || lease.host || 'Unknown',
                                    ip: lease.ip,
                                    mac: lease.mac,
                                    hostname: lease.hostname || lease.host,
                                    additionalData: {
                                        static: lease.static || false,
                                        ...lease
                                    }
                                });
                            }
                        }
                    }
                }

                // Search in port forwarding rules
                if (!typeFilter || typeFilter.includes('port-forward')) {
                    const systemStats = stats.system as any;
                    if (systemStats?.portForwarding) {
                        const portForwards = Array.isArray(systemStats.portForwarding)
                            ? systemStats.portForwarding
                            : [];

                        for (const pf of portForwards) {
                            if (
                                matches(pf.name) ||
                                matches(pf.host) ||
                                matches(pf.host_ip) ||
                                matches(pf.wan_port_start) ||
                                matches(pf.wan_port_end) ||
                                matches(pf.lan_port) ||
                                matches(pf.protocol)
                            ) {
                                results.push({
                                    pluginId,
                                    pluginName,
                                    type: 'port-forward',
                                    id: pf.id || `${pf.wan_port_start}-${pf.lan_port}`,
                                    name: pf.name || `Port ${pf.wan_port_start}`,
                                    ip: pf.host_ip || pf.host,
                                    port: pf.wan_port_start || pf.lan_port,
                                    additionalData: {
                                        protocol: pf.protocol,
                                        wanPort: pf.wan_port_start,
                                        lanPort: pf.lan_port,
                                        enabled: pf.enabled,
                                        ...pf
                                    }
                                });
                            }
                        }
                    }
                }
            }

            // Search in UniFi plugin
            if (pluginId === 'unifi') {
                // Search in devices (APs, switches, gateways)
                if (!typeFilter || typeFilter.includes('ap') || typeFilter.includes('switch')) {
                    if (stats.devices && Array.isArray(stats.devices)) {
                        for (const device of stats.devices) {
                            const deviceType = device.type || '';
                            const isAP = deviceType.includes('uap') || deviceType.includes('ap');
                            const isSwitch = deviceType.includes('usw') || deviceType.includes('switch');
                            const isGateway = deviceType.includes('ugw') || deviceType.includes('gateway');

                            const dev = device as { name?: string; mac?: string; ip?: string; model?: string; id?: string; active?: boolean; lastSeen?: Date; type?: string };
                            if (
                                (!typeFilter || 
                                 (isAP && typeFilter.includes('ap')) ||
                                 (isSwitch && typeFilter.includes('switch')) ||
                                 (isGateway && typeFilter.includes('switch'))
                                ) &&
                                (
                                    matches(dev.name) ||
                                    matches(dev.mac) ||
                                    matches(dev.ip) ||
                                    matches(dev.model)
                                )
                            ) {
                                results.push({
                                    pluginId,
                                    pluginName,
                                    type: isAP ? 'ap' : 'switch',
                                    id: dev.id || dev.mac || '',
                                    name: dev.name || dev.model || 'Unknown Device',
                                    ip: dev.ip,
                                    mac: dev.mac,
                                    active: dev.active,
                                    lastSeen: dev.lastSeen,
                                    additionalData: {
                                        model: dev.model,
                                        type: dev.type,
                                        ...dev
                                    }
                                });
                            }
                        }
                    }
                }

                // Search in clients
                if (!typeFilter || typeFilter.includes('client')) {
                    // Clients are also in devices array, but we can also check system stats
                    const systemStats = stats.system as any;
                    if (systemStats?.clients && Array.isArray(systemStats.clients)) {
                        for (const client of systemStats.clients) {
                            if (
                                matches(client.name) ||
                                matches(client.hostname) ||
                                matches(client.mac) ||
                                matches(client.ip)
                            ) {
                                results.push({
                                    pluginId,
                                    pluginName,
                                    type: 'client',
                                    id: client._id || client.mac || '',
                                    name: client.name || client.hostname || 'Unknown Client',
                                    ip: client.ip,
                                    mac: client.mac,
                                    hostname: client.hostname,
                                    active: client.is_wired || client.is_wireless,
                                    lastSeen: client.last_seen ? new Date(client.last_seen * 1000) : undefined,
                                    additionalData: {
                                        ssid: client.ssid,
                                        is_wired: client.is_wired,
                                        is_wireless: client.is_wireless,
                                        ...client
                                    }
                                });
                            }
                        }
                    }

                    // Also check devices array for clients
                    if (stats.devices && Array.isArray(stats.devices)) {
                        for (const device of stats.devices) {
                            const dev = device as { name?: string; mac?: string; ip?: string; hostname?: string; id?: string; active?: boolean; lastSeen?: Date; type?: string };
                            if (dev.type === 'client' || !dev.type) {
                                if (
                                    matches(dev.name) ||
                                    matches(dev.mac) ||
                                    matches(dev.ip) ||
                                    matches(dev.hostname)
                                ) {
                                    // Avoid duplicates
                                    const exists = results.some(r => 
                                        r.type === 'client' && 
                                        (r.mac === dev.mac || r.id === dev.id)
                                    );
                                    if (!exists) {
                                        results.push({
                                            pluginId,
                                            pluginName,
                                            type: 'client',
                                            id: dev.id || dev.mac || '',
                                            name: dev.name || dev.hostname || 'Unknown Client',
                                            ip: dev.ip,
                                            mac: dev.mac,
                                            hostname: dev.hostname,
                                            active: dev.active,
                                            lastSeen: dev.lastSeen,
                                            additionalData: {
                                                ...dev
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('SearchService', `Error searching in plugin ${pluginId}:`, error);
        }

        return results;
    }

    /**
     * Search in network scans (scan-réseau plugin)
     */
    private async searchInNetworkScans(
        query: string,
        exactMatch: boolean,
        caseSensitive: boolean,
        typeFilter?: SearchResult['type'][]
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];

        // Only search for 'device' type if type filter is specified
        if (typeFilter && typeFilter.length > 0 && !typeFilter.includes('device')) {
            return results;
        }

        try {
            // Use NetworkScanRepository to search
            // Search in all scans (online and offline) - filtering by active status will be done later if needed
            const scans = NetworkScanRepository.find({
                search: query // NetworkScanRepository.find uses LIKE search, so we pass the query as-is
            });

            // Helper function to check if a value matches the query
            const matches = (value: string | number | undefined | null): boolean => {
                if (value === undefined || value === null) return false;
                const strValue = String(value);
                const normalizedValue = caseSensitive ? strValue : strValue.toLowerCase();
                
                if (exactMatch) {
                    return normalizedValue === query;
                } else {
                    return normalizedValue.includes(query);
                }
            };

            for (const scan of scans) {
                // Check if matches query in IP, MAC, hostname, or vendor
                if (
                    matches(scan.ip) ||
                    matches(scan.mac) ||
                    matches(scan.hostname) ||
                    matches(scan.vendor)
                ) {
                    results.push({
                        pluginId: 'scan-reseau',
                        pluginName: 'Scan Réseau',
                        type: 'device',
                        id: scan.ip,
                        name: scan.hostname || scan.vendor || scan.ip,
                        ip: scan.ip,
                        mac: scan.mac,
                        hostname: scan.hostname,
                        active: scan.status === 'online',
                        lastSeen: scan.lastSeen,
                        additionalData: {
                            vendor: scan.vendor,
                            status: scan.status,
                            pingLatency: scan.pingLatency,
                            hostnameSource: scan.hostnameSource,
                            vendorSource: scan.vendorSource,
                            scanCount: scan.scanCount
                        }
                    });
                }
            }
        } catch (error) {
            logger.error('SearchService', 'Error searching in network scans:', error);
        }

        return results;
    }
}

export const searchService = new SearchService();

