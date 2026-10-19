/**
 * Aggregated per-IP details (scan, Freebox, UniFi), shared by the Search page
 * route and the MCP machine-details tool.
 */
import { pluginManager } from './pluginManager.js';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { freeboxApi } from './freeboxApi.js';
import { networkScanService } from './networkScanService.js';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/errorMessage.js';

// Freebox stats then port forwarding rules, kept sequential (same Freebox session).
// getStats() only carries the rule counts, so the rules themselves are fetched here.
async function fetchFreeboxData(ip: string): Promise<{ stats: any; portForwardRules: any[] | null }> {
    const stats = await pluginManager.getPluginStats('freebox');
    let portForwardRules: any[] | null = null;
    try {
        const portForwardResponse = await freeboxApi.getPortForwardingRules();
        if (portForwardResponse.success && Array.isArray(portForwardResponse.result)) {
            portForwardRules = portForwardResponse.result as any[];
        }
    } catch (portForwardError: unknown) {
        logger.debug('Search', `Failed to get port forwarding rules for IP ${ip}:`, getErrorMessage(portForwardError));
    }
    return { stats, portForwardRules };
}

/**
 * @param options.ping false skips the real-time ping (status/latency then come
 *   from the last scan), for IPs outside the scan ranges that must not be probed.
 */
export async function getIpDetails(ip: string, options: { ping?: boolean } = {}): Promise<any> {
const aggregatedData: any = {
    ip,
    freebox: null,
    unifi: null,
    scanner: null
};

// Get Scanner data (from network_scans table)
const scanData = NetworkScanRepository.findByIp(ip);
const shouldPing = options.ping !== false;

// The ping, the Freebox calls and the UniFi stats are independent: run them concurrently
// (allSettled: each source keeps its own error handling below)
if (shouldPing) {
    logger.debug('Search', `Performing real-time ping for IP ${ip} to verify current status...`);
}
const [pingSettled, freeboxSettled, unifiSettled] = await Promise.allSettled([
    shouldPing ? networkScanService.pingHost(ip) : Promise.resolve(null),
    pluginManager.getPlugin('freebox')?.isEnabled() ? fetchFreeboxData(ip) : Promise.resolve(null),
    pluginManager.getPlugin('unifi')?.isEnabled() ? pluginManager.getPluginStats('unifi') : Promise.resolve(null)
]);

// Real-time ping result gives the current status
let currentStatus = scanData?.status || 'unknown';
let currentLatency = scanData?.pingLatency;

try {
    if (pingSettled.status === 'rejected') throw pingSettled.reason;
    const pingResult = pingSettled.value;
    // pingResult is null when the ping was skipped: keep the stored status
    if (pingResult?.success) {
        currentStatus = 'online';
        if (pingResult.latency !== undefined) {
            currentLatency = pingResult.latency;
        }
        logger.debug('Search', `IP ${ip} is currently online (latency: ${currentLatency}ms)`);
    } else if (pingResult) {
        currentStatus = 'offline';
        logger.debug('Search', `IP ${ip} is currently offline`);
    }
} catch (error: unknown) {
    logger.debug('Search', `Failed to ping IP ${ip} for real-time status check:`, getErrorMessage(error));
    // Keep existing status if ping fails
}

if (scanData) {
    // Filter out invalid vendor values (0, empty, null, undefined, "unknown", "0")
    // Handle both string and number types
    let vendor: string | undefined = undefined;
    if (scanData.vendor) {
        const vendorStr = String(scanData.vendor).trim();
        if (vendorStr !== '' && 
            vendorStr !== '0' && 
            vendorStr.toLowerCase() !== 'unknown' &&
            vendorStr.toLowerCase() !== 'null' &&
            vendorStr.toLowerCase() !== 'undefined') {
            vendor = vendorStr;
        }
    }
    
    aggregatedData.scanner = {
        mac: scanData.mac,
        hostname: scanData.hostname,
        vendor: vendor, // Only include vendor if it's valid
        hostnameSource: scanData.hostnameSource,
        vendorSource: scanData.vendorSource,
        status: currentStatus, // Use real-time status instead of stored status
        pingLatency: currentLatency, // Use real-time latency if available
        firstSeen: scanData.firstSeen,
        lastSeen: scanData.lastSeen,
        scanCount: scanData.scanCount,
        additionalInfo: scanData.additionalInfo
    };
} else if (currentStatus === 'online') {
    // If IP is online but not in database, create a minimal entry for display
    aggregatedData.scanner = {
        status: currentStatus,
        pingLatency: currentLatency
    };
}

// Get Freebox data
try {
    if (freeboxSettled.status === 'rejected') throw freeboxSettled.reason;
    const freeboxData = freeboxSettled.value;
    if (freeboxData) {
        const freeboxStats = freeboxData.stats;
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
            // Find DHCP lease matching the IP - check multiple possible fields
            const dhcpLease = dhcpLeases.find((l: any) => {
                // Check various possible IP fields
                return l.ip === ip || 
                       l.hostname === ip || 
                       l.host === ip ||
                       (l.static_ip && l.static_ip === ip) ||
                       (l.l3connectivities && Array.isArray(l.l3connectivities) && l.l3connectivities.some((conn: any) => conn.addr === ip));
            });
            if (dhcpLease) {
                aggregatedData.freebox = aggregatedData.freebox || {};
                // Extract IP from various possible locations
                const leaseIp = dhcpLease.ip || 
                              dhcpLease.static_ip || 
                              (dhcpLease.l3connectivities && Array.isArray(dhcpLease.l3connectivities) && dhcpLease.l3connectivities[0]?.addr) ||
                              ip;
                // Extract MAC from various possible locations
                const leaseMac = dhcpLease.mac || dhcpLease.l2ident?.id;
                
                // Check if this lease is a static reservation by comparing IP or MAC with static leases
                // We cannot use includes() because it compares by object reference, not by value
                let isStatic = false;
                if (dhcpLease.static !== undefined) {
                    // If the lease already has a static property, use it
                    isStatic = dhcpLease.static === true;
                } else if (systemStats.dhcp.staticLeases && Array.isArray(systemStats.dhcp.staticLeases)) {
                    // Check if the IP or MAC matches any static lease
                    isStatic = systemStats.dhcp.staticLeases.some((staticLease: any) => {
                        // Compare by IP (most reliable)
                        if (leaseIp && staticLease.ip && staticLease.ip === leaseIp) {
                            return true;
                        }
                        // Compare by MAC as fallback
                        if (leaseMac && staticLease.mac && staticLease.mac === leaseMac) {
                            return true;
                        }
                        return false;
                    });
                }
                
                aggregatedData.freebox.dhcp = {
                    ip: leaseIp,
                    hostname: dhcpLease.hostname || dhcpLease.host || dhcpLease.primary_name,
                    mac: leaseMac,
                    static: isStatic,
                    expires: dhcpLease.expires,
                    lease_time: dhcpLease.lease_time || dhcpLease.leaseTime,
                    comment: dhcpLease.comment || dhcpLease.description,
                    ...dhcpLease // Include all original fields
                };
                logger.debug('Search', `Found DHCP lease for IP ${ip}:`, {
                    static: aggregatedData.freebox.dhcp.static,
                    hostname: aggregatedData.freebox.dhcp.hostname,
                    mac: aggregatedData.freebox.dhcp.mac
                });
            }
        }

        // Check port forwarding rules for this IP
        {
            const rules = freeboxData.portForwardRules;
            if (rules) {
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
        }
    }
} catch (error: unknown) {
    logger.debug('Search', `Failed to get Freebox data for IP ${ip}:`, getErrorMessage(error));
}

// Get UniFi data
try {
    if (unifiSettled.status === 'rejected') throw unifiSettled.reason;
    const unifiStats: any = unifiSettled.value;
    if (unifiStats) {

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
} catch (error: unknown) {
    logger.debug('Search', `Failed to get UniFi data for IP ${ip}:`, getErrorMessage(error));
}

    return aggregatedData;
}

const pick = (src: any, keys: string[]): Record<string, unknown> | null => {
    if (!src) return null;
    const out: Record<string, unknown> = {};
    for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
    return out;
};

/**
 * Projection for API tokens: the aggregated payload spreads raw Freebox and
 * UniFi objects (needed by the UI), which must not leave through a token.
 */
export function compactIpDetails(d: any) {
    const f = d.freebox;
    const u = d.unifi;
    return {
        ip: d.ip,
        scanner: d.scanner && {
            ...pick(d.scanner, ['mac', 'hostname', 'vendor', 'status', 'pingLatency', 'firstSeen', 'lastSeen', 'scanCount']),
            openPorts: d.scanner.additionalInfo?.openPorts,
            lastPortScan: d.scanner.additionalInfo?.lastPortScan
        },
        freebox: f && {
            ...pick(f, ['name', 'mac', 'hostname', 'active', 'lastSeen', 'type']),
            dhcp: pick(f.dhcp, ['ip', 'hostname', 'mac', 'static', 'expires', 'lease_time', 'comment']),
            portForwarding: f.portForwarding
        },
        unifi: u && {
            device: pick(u.device, ['name', 'mac', 'ip', 'type', 'model', 'active', 'lastSeen']),
            client: pick(u.client, ['name', 'hostname', 'mac', 'ip', 'is_wired', 'is_wireless', 'ssid', 'ap_name', 'ap_mac', 'sw_name', 'sw_mac', 'sw_port', 'rssi', 'radio', 'channel', 'tx_rate', 'rx_rate', 'tx_bytes', 'rx_bytes', 'last_seen']),
            switch: pick(u.switch, ['name', 'mac', 'ip', 'model']),
            ap: pick(u.ap, ['name', 'mac', 'ip', 'model'])
        }
    };
}
