/**
 * Search routes
 * 
 * Handles search across all active plugins
 */

import { Router } from 'express';
import { searchService } from '../services/searchService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';
import { logger } from '../utils/logger.js';
import { pluginManager } from '../services/pluginManager.js';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { freeboxApi } from '../services/freeboxApi.js';

const router = Router();

/**
 * POST /api/search
 * Search across all active plugins
 * 
 * Body:
 * {
 *   query: string (required)
 *   pluginIds?: string[] (optional - filter by plugins)
 *   types?: string[] (optional - filter by result types: device, dhcp, port-forward, client, ap, switch)
 *   exactMatch?: boolean (default: false)
 *   caseSensitive?: boolean (default: false)
 * }
 */
router.post('/', requireAuth, autoLog('search', 'search'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { query, pluginIds, types, exactMatch, caseSensitive } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Search query is required',
                code: 'MISSING_QUERY'
            }
        });
    }

    // Validate pluginIds if provided
    if (pluginIds && (!Array.isArray(pluginIds) || pluginIds.some(id => typeof id !== 'string'))) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'pluginIds must be an array of strings',
                code: 'INVALID_PLUGIN_IDS'
            }
        });
    }

    // Validate types if provided
    const validTypes = ['device', 'dhcp', 'port-forward', 'client', 'ap', 'switch'];
    if (types && (!Array.isArray(types) || types.some(t => !validTypes.includes(t)))) {
        return res.status(400).json({
            success: false,
            error: {
                message: `types must be an array containing one or more of: ${validTypes.join(', ')}`,
                code: 'INVALID_TYPES'
            }
        });
    }

    try {
        const results = await searchService.search({
            query: query.trim(),
            pluginIds,
            types,
            exactMatch: exactMatch === true,
            caseSensitive: caseSensitive === true
        });

        res.json({
            success: true,
            result: {
                query: query.trim(),
                count: results.length,
                results
            }
        });
    } catch (error: any) {
        logger.error('Search', 'Search failed:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Search failed',
                code: 'SEARCH_ERROR'
            }
        });
    }
}));

/**
 * GET /api/search/ip-details/:ip
 * Get complete details for a specific IP address from all sources (Freebox, UniFi, Scanner)
 * Aggregates information from all plugins and scanner database
 */
router.get('/ip-details/:ip', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { ip } = req.params;

    // Validate IP format (basic IPv4 validation)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Invalid IP address format',
                code: 'INVALID_IP'
            }
        });
    }

    try {
        const aggregatedData: any = {
            ip,
            freebox: null,
            unifi: null,
            scanner: null
        };

        // Get Scanner data (from network_scans table)
        const scanData = NetworkScanRepository.findByIp(ip);
        if (scanData) {
            aggregatedData.scanner = {
                mac: scanData.mac,
                hostname: scanData.hostname,
                vendor: scanData.vendor,
                hostnameSource: scanData.hostnameSource,
                vendorSource: scanData.vendorSource,
                status: scanData.status,
                pingLatency: scanData.pingLatency,
                firstSeen: scanData.firstSeen,
                lastSeen: scanData.lastSeen,
                scanCount: scanData.scanCount,
                additionalInfo: scanData.additionalInfo
            };
        }

        // Get Freebox data
        try {
            const freeboxPlugin = pluginManager.getPlugin('freebox');
            if (freeboxPlugin && freeboxPlugin.isEnabled()) {
                const freeboxStats = await pluginManager.getPluginStats('freebox');
                if (freeboxStats?.devices && Array.isArray(freeboxStats.devices)) {
                    const freeboxDevice = freeboxStats.devices.find((d: any) => d.ip === ip);
                    if (freeboxDevice) {
                        aggregatedData.freebox = {
                            name: freeboxDevice.name,
                            mac: freeboxDevice.mac,
                            hostname: freeboxDevice.hostname,
                            active: freeboxDevice.active,
                            lastSeen: freeboxDevice.lastSeen,
                            type: freeboxDevice.type,
                            ...freeboxDevice
                        };
                    }
                }

                // Also check DHCP leases
                const systemStats = freeboxStats?.system as any;
                if (systemStats?.dhcp) {
                    const dhcpLeases = [...(systemStats.dhcp.leases || []), ...(systemStats.dhcp.staticLeases || [])];
                    const dhcpLease = dhcpLeases.find((l: any) => l.ip === ip);
                    if (dhcpLease) {
                        aggregatedData.freebox = aggregatedData.freebox || {};
                        aggregatedData.freebox.dhcp = {
                            hostname: dhcpLease.hostname || dhcpLease.host,
                            mac: dhcpLease.mac,
                            static: dhcpLease.static || false,
                            ...dhcpLease
                        };
                    }
                }

                // Check port forwarding rules for this IP
                try {
                    const portForwardResponse = await freeboxApi.getPortForwardingRules();
                    if (portForwardResponse.success && Array.isArray(portForwardResponse.result)) {
                        const rules = portForwardResponse.result as any[];
                        // Filter rules that match this IP (lan_ip)
                        const matchingRules = rules.filter((rule: any) => rule.lan_ip === ip);
                        if (matchingRules.length > 0) {
                            aggregatedData.freebox = aggregatedData.freebox || {};
                            aggregatedData.freebox.portForwarding = matchingRules.map((rule: any) => ({
                                id: rule.id,
                                enabled: rule.enabled !== false,
                                comment: rule.comment || '',
                                lan_port: rule.lan_port,
                                wan_port_start: rule.wan_port_start,
                                wan_port_end: rule.wan_port_end || rule.wan_port_start,
                                lan_ip: rule.lan_ip,
                                ip_proto: rule.ip_proto || 'tcp',
                                src_ip: rule.src_ip
                            }));
                        }
                    }
                } catch (portForwardError: any) {
                    logger.debug('Search', `Failed to get port forwarding rules for IP ${ip}:`, portForwardError.message);
                }
            }
        } catch (error: any) {
            logger.debug('Search', `Failed to get Freebox data for IP ${ip}:`, error.message);
        }

        // Get UniFi data
        try {
            const unifiPlugin = pluginManager.getPlugin('unifi');
            if (unifiPlugin && unifiPlugin.isEnabled()) {
                const unifiStats = await pluginManager.getPluginStats('unifi');
                
                // Check devices (APs, switches)
                if (unifiStats?.devices && Array.isArray(unifiStats.devices)) {
                    const unifiDevice = unifiStats.devices.find((d: any) => d.ip === ip);
                    if (unifiDevice) {
                        aggregatedData.unifi = aggregatedData.unifi || {};
                        aggregatedData.unifi.device = {
                            name: unifiDevice.name,
                            mac: unifiDevice.mac,
                            type: unifiDevice.type,
                            model: unifiDevice.model,
                            active: unifiDevice.active,
                            lastSeen: unifiDevice.lastSeen,
                            ...unifiDevice
                        };
                    }
                }

                // Check clients (wireless and wired) - Clients are in devices array with type 'client'
                // Also check the clients array directly if available
                let unifiClient: any = null;
                
                // First, try to find in devices array
                if (unifiStats?.devices && Array.isArray(unifiStats.devices)) {
                    unifiClient = unifiStats.devices.find((d: any) => {
                        // Check if it's a client by type or by checking if it has client-specific fields
                        const isClient = d.type === 'client' || d.type === 'sta' || (d.ip && !d.model && !d.type?.includes('usw') && !d.type?.includes('uap'));
                        return isClient && d.ip === ip;
                    });
                }
                
                // If not found in devices, try to get from clients directly if available
                if (!unifiClient && unifiStats?.clients && Array.isArray(unifiStats.clients)) {
                    unifiClient = unifiStats.clients.find((c: any) => c.ip === ip);
                }
                
                // Also try to get clients from the plugin's getStats if available
                if (!unifiClient) {
                    try {
                        const unifiPlugin = pluginManager.getPlugin('unifi');
                        if (unifiPlugin) {
                            const pluginStats = await unifiPlugin.getStats();
                            if (pluginStats?.devices && Array.isArray(pluginStats.devices)) {
                                unifiClient = pluginStats.devices.find((d: any) => {
                                    const isClient = d.type === 'client' || d.type === 'sta';
                                    return isClient && d.ip === ip;
                                });
                            }
                        }
                    } catch (error: any) {
                        logger.debug('Search', `Failed to get fresh UniFi stats:`, error.message);
                    }
                }
                
                if (unifiClient) {
                    logger.debug('Search', `Found UniFi client for IP ${ip}:`, {
                            name: unifiClient.name,
                            mac: unifiClient.mac,
                            type: unifiClient.type,
                            is_wired: unifiClient.is_wired,
                            is_wireless: unifiClient.is_wireless,
                            ssid: unifiClient.ssid,
                            essid: unifiClient.essid,
                            ap_mac: unifiClient.ap_mac,
                            ap_name: unifiClient.ap_name,
                            last_uplink_mac: unifiClient.last_uplink_mac,
                            last_uplink_name: unifiClient.last_uplink_name,
                            sw_mac: unifiClient.sw_mac,
                            sw_name: unifiClient.sw_name,
                            sw_port: unifiClient.sw_port,
                            sw_port_idx: unifiClient.sw_port_idx,
                            tx_rate: unifiClient.tx_rate,
                            rx_rate: unifiClient.rx_rate,
                            phy_tx_rate: unifiClient.phy_tx_rate,
                            phy_rx_rate: unifiClient.phy_rx_rate,
                            rssi: unifiClient.rssi,
                            signal: unifiClient.signal,
                            radio: unifiClient.radio,
                            channel: unifiClient.channel,
                        // Log all client fields to see what's available
                        allFields: Object.keys(unifiClient)
                    });
                    
                    // Determine if client is wired or wireless based on available fields
                    // Check for wired indicators (must have sw_port, not just sw_mac which can be AP MAC)
                    const hasWiredIndicators = !!(unifiClient.sw_port || unifiClient.sw_port_idx);
                    // Check for wireless indicators (SSID, AP info, or signal/RSSI)
                    const hasWirelessIndicators = !!(unifiClient.ssid || unifiClient.essid || unifiClient.ap_mac || unifiClient.ap_name || unifiClient.last_uplink_name || unifiClient.radio || (unifiClient.rssi && unifiClient.rssi < 0) || (unifiClient.signal && unifiClient.signal < 0));
                    
                    // Determine connection type
                    let is_wired = false;
                    let is_wireless = false;
                    
                    if (unifiClient.is_wired === true) {
                        is_wired = true;
                    } else if (unifiClient.is_wireless === true) {
                        is_wireless = true;
                    } else {
                        // Auto-detect based on indicators
                        // Priority: SSID/ESSID is a strong indicator of wireless
                        if (unifiClient.ssid || unifiClient.essid) {
                            is_wireless = true;
                        } else if (hasWiredIndicators && !hasWirelessIndicators) {
                            // Only wired indicators, no wireless indicators
                            is_wired = true;
                        } else if (hasWirelessIndicators && !hasWiredIndicators) {
                            // Only wireless indicators, no wired indicators
                            is_wireless = true;
                        } else if (hasWiredIndicators && hasWirelessIndicators) {
                            // Both indicators present - check which is stronger
                            // If SSID exists, it's definitely wireless
                            if (unifiClient.ssid || unifiClient.essid) {
                                is_wireless = true;
                            } else if (unifiClient.sw_port || unifiClient.sw_port_idx) {
                                // Has port number, likely wired
                                is_wired = true;
                            } else {
                                // Default to wireless if AP info exists
                                is_wireless = !!(unifiClient.ap_mac || unifiClient.ap_name);
                            }
                        }
                    }
                    
                    // Get SSID from multiple possible fields
                    const ssid = unifiClient.ssid || unifiClient.essid || unifiClient.wifi_ssid || unifiClient.wlan_ssid;
                    
                    // Get signal strength from multiple possible fields (RSSI is negative, signal might be positive)
                    let rssi = unifiClient.rssi;
                    let signal = unifiClient.signal;
                    
                    // RSSI should be negative (dBm). If it's positive, it might be wrong or a different metric
                    // Use signal if it's negative and rssi is positive or missing
                    if (signal !== undefined && signal !== null && typeof signal === 'number') {
                        if (signal < 0) {
                            // signal is negative, use it as RSSI
                            rssi = signal;
                        } else if (rssi !== undefined && rssi !== null && typeof rssi === 'number') {
                            // Both exist, prefer the negative one
                            if (rssi > 0 && signal > 0) {
                                // Both positive, might be wrong - try to find negative value elsewhere
                                // Check noise field (usually negative)
                                if (unifiClient.noise !== undefined && unifiClient.noise < 0) {
                                    // Estimate RSSI from noise (RSSI is usually higher than noise)
                                    rssi = unifiClient.noise + 20; // Rough estimate
                                }
                            } else if (rssi > 0) {
                                // rssi is positive but signal is also positive, use signal if it makes sense
                                // or try to convert
                                if (signal <= 100) {
                                    // Might be percentage
                                    rssi = -30 - ((100 - signal) * 0.7);
                                }
                            }
                        } else {
                            // Only signal exists
                            if (signal < 0) {
                                rssi = signal;
                            } else if (signal <= 100) {
                                // Might be percentage, convert to RSSI
                                rssi = -30 - ((100 - signal) * 0.7);
                            }
                        }
                    }
                    
                    // If rssi is still positive or missing, try other fields
                    if (!rssi || (typeof rssi === 'number' && rssi > 0)) {
                        if (unifiClient.signal_strength !== undefined && unifiClient.signal_strength < 0) {
                            rssi = unifiClient.signal_strength;
                        } else if (unifiClient.noise !== undefined && unifiClient.noise < 0) {
                            // Estimate RSSI from noise
                            rssi = unifiClient.noise + 20;
                        }
                    }
                    
                    aggregatedData.unifi = aggregatedData.unifi || {};
                    aggregatedData.unifi.client = {
                        name: unifiClient.name || unifiClient.hostname,
                        mac: unifiClient.mac,
                        hostname: unifiClient.hostname,
                        ip: unifiClient.ip,
                        is_wired: is_wired,
                        is_wireless: is_wireless,
                        ssid: ssid, // Use the normalized SSID
                        essid: unifiClient.essid, // Keep original essid too
                        ap_name: unifiClient.ap_name || unifiClient.last_uplink_name,
                        ap_mac: unifiClient.ap_mac || unifiClient.last_uplink_mac,
                        sw_port: unifiClient.sw_port || unifiClient.sw_port_idx,
                        sw_mac: unifiClient.sw_mac || unifiClient.last_uplink_mac,
                        sw_name: unifiClient.sw_name,
                        signal: signal !== undefined ? signal : rssi, // Keep original signal or use rssi
                        rssi: rssi, // Normalized RSSI
                        radio: unifiClient.radio,
                        radio_proto: unifiClient.radio_proto,
                        channel: unifiClient.channel,
                        tx_rate: unifiClient.tx_rate || unifiClient.phy_tx_rate || unifiClient.sw_tx_rate,
                        rx_rate: unifiClient.rx_rate || unifiClient.phy_rx_rate || unifiClient.sw_rx_rate,
                        tx_bytes: unifiClient.tx_bytes,
                        rx_bytes: unifiClient.rx_bytes,
                        last_seen: unifiClient.last_seen ? (typeof unifiClient.last_seen === 'number' ? unifiClient.last_seen : (unifiClient.last_seen instanceof Date ? unifiClient.last_seen.getTime() / 1000 : new Date(unifiClient.last_seen).getTime() / 1000)) : undefined,
                        ...unifiClient // Spread all original fields to ensure nothing is lost
                    };
                } else {
                    logger.debug('Search', `No UniFi client found for IP ${ip} in ${unifiStats.devices?.length || 0} devices`);
                }

                // If we found a client, try to get more details about the connected switch/AP
                if (aggregatedData.unifi?.client) {
                    const client = aggregatedData.unifi.client;
                    
                    // Find the switch if sw_mac is available
                    if (client.sw_mac && unifiStats?.devices) {
                        const switchDevice = unifiStats.devices.find((d: any) => {
                            const deviceMac = (d.mac || '').toLowerCase().replace(/[:-]/g, '');
                            const switchMac = (client.sw_mac || '').toLowerCase().replace(/[:-]/g, '');
                            return deviceMac === switchMac && (d.type?.includes('usw') || d.type?.includes('switch'));
                        });
                        if (switchDevice) {
                            aggregatedData.unifi.switch = {
                                name: switchDevice.name,
                                mac: switchDevice.mac,
                                ip: switchDevice.ip,
                                model: switchDevice.model,
                                port_table: switchDevice.port_table,
                                eth_port_table: switchDevice.eth_port_table,
                                ports: switchDevice.ports,
                                num_port: switchDevice.num_port
                            };
                        }
                    }

                    // Find the AP if ap_mac is available
                    if (client.ap_mac && unifiStats?.devices) {
                        const apDevice = unifiStats.devices.find((d: any) => {
                            const deviceMac = (d.mac || '').toLowerCase().replace(/[:-]/g, '');
                            const apMac = (client.ap_mac || '').toLowerCase().replace(/[:-]/g, '');
                            return deviceMac === apMac && (d.type?.includes('uap') || d.type?.includes('ap'));
                        });
                        if (apDevice) {
                            aggregatedData.unifi.ap = {
                                name: apDevice.name,
                                mac: apDevice.mac,
                                ip: apDevice.ip,
                                model: apDevice.model,
                                ssids: apDevice.ssids
                            };
                        }
                    }
                }
            }
        } catch (error: any) {
            logger.debug('Search', `Failed to get UniFi data for IP ${ip}:`, error.message);
        }

        res.json({
            success: true,
            result: aggregatedData
        });
    } catch (error: any) {
        logger.error('Search', `Failed to get IP details for ${ip}:`, error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get IP details',
                code: 'IP_DETAILS_ERROR'
            }
        });
    }
}));

export default router;

