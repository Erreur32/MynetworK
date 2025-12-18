/**
 * Search Service
 * 
 * Handles search across all active plugins
 * Searches in devices, DHCP clients, port forwarding, etc.
 */

import { pluginManager } from './pluginManager.js';
import { logger } from '../utils/logger.js';
import type { IPlugin } from '../plugins/base/PluginInterface.js';

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
                            if (
                                matches(device.name) ||
                                matches(device.mac) ||
                                matches(device.ip) ||
                                matches(device.hostname)
                            ) {
                                results.push({
                                    pluginId,
                                    pluginName,
                                    type: 'device',
                                    id: device.id || device.mac || '',
                                    name: device.name || 'Unknown Device',
                                    ip: device.ip,
                                    mac: device.mac,
                                    hostname: device.hostname,
                                    active: device.active,
                                    lastSeen: device.lastSeen,
                                    additionalData: {
                                        vendor: device.type,
                                        ...device
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

                            if (
                                (!typeFilter || 
                                 (isAP && typeFilter.includes('ap')) ||
                                 (isSwitch && typeFilter.includes('switch')) ||
                                 (isGateway && typeFilter.includes('switch'))
                                ) &&
                                (
                                    matches(device.name) ||
                                    matches(device.mac) ||
                                    matches(device.ip) ||
                                    matches(device.model)
                                )
                            ) {
                                results.push({
                                    pluginId,
                                    pluginName,
                                    type: isAP ? 'ap' : 'switch',
                                    id: device.id || device.mac || '',
                                    name: device.name || device.model || 'Unknown Device',
                                    ip: device.ip,
                                    mac: device.mac,
                                    active: device.active,
                                    lastSeen: device.lastSeen,
                                    additionalData: {
                                        model: device.model,
                                        type: device.type,
                                        ...device
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
                            if (device.type === 'client' || !device.type) {
                                if (
                                    matches(device.name) ||
                                    matches(device.mac) ||
                                    matches(device.ip) ||
                                    matches(device.hostname)
                                ) {
                                    // Avoid duplicates
                                    const exists = results.some(r => 
                                        r.type === 'client' && 
                                        (r.mac === device.mac || r.id === device.id)
                                    );
                                    if (!exists) {
                                        results.push({
                                            pluginId,
                                            pluginName,
                                            type: 'client',
                                            id: device.id || device.mac || '',
                                            name: device.name || device.hostname || 'Unknown Client',
                                            ip: device.ip,
                                            mac: device.mac,
                                            hostname: device.hostname,
                                            active: device.active,
                                            lastSeen: device.lastSeen,
                                            additionalData: {
                                                ...device
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
}

export const searchService = new SearchService();

