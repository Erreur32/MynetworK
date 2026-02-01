/**
 * Search Service
 * 
 * Handles search across all active plugins
 * Searches in devices, DHCP clients, port forwarding, etc.
 * Mode: IP/MAC (exact, wildcard *, range 1-32) vs text (hostname, vendor, comment).
 */

import { pluginManager } from './pluginManager.js';
import { logger } from '../utils/logger.js';
import type { IPlugin } from '../plugins/base/PluginInterface.js';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';

export type SearchQueryMode = 'ip-mac' | 'text';

export interface ParsedQuery {
    mode: SearchQueryMode;
    /** For ip-mac: exact IPv4 (single IP) */
    ipExact?: string;
    /** For ip-mac: SQL LIKE pattern e.g. "192.168.32.%" or "192.168.32.1" */
    ipLike?: string;
    /** For ip-mac: range last octet */
    ipRange?: { prefix: string; start: number; end: number };
    /** For ip-mac: SQL LIKE pattern e.g. "AA:BB:CC:%" */
    macLike?: string;
    /** For text: search term (hostname, vendor, comment) */
    text?: string;
}

function parseQuery(query: string): ParsedQuery {
    const trimmed = query.trim();
    if (!trimmed) {
        return { mode: 'text', text: '' };
    }

    // IP exact: 192.168.32.1
    const ipExactRe = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipExactRe.test(trimmed)) {
        const parts = trimmed.split('.').map(Number);
        if (parts.length === 4 && parts.every(p => p >= 0 && p <= 255)) {
            return { mode: 'ip-mac', ipExact: trimmed, ipLike: trimmed };
        }
    }

    // IP wildcard: 192.168.32.* or 192.168.32.1* (partial last octet)
    if (trimmed.endsWith('*') && /^[\d.]+\*$/.test(trimmed)) {
        const prefix = trimmed.slice(0, -1); // part before *
        if (prefix.endsWith('.')) {
            const parts = prefix.slice(0, -1).split('.').map(Number);
            if (parts.length >= 1 && parts.length <= 3 && parts.every(p => p >= 0 && p <= 255)) {
                return { mode: 'ip-mac', ipLike: prefix + '%' };
            }
        } else {
            const parts = prefix.split('.').map(Number);
            if (parts.length >= 1 && parts.length <= 4 && parts.every(p => p >= 0 && p <= 255)) {
                return { mode: 'ip-mac', ipLike: prefix + '%' };
            }
        }
    }

    // IP range: 192.168.32.1-32 or 192.168.32.1-192.168.32.32
    const ipRangeRe = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})-(\d{1,3})$/; // 192.168.32.1-32
    const ipRangeFullRe = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})-(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/; // 192.168.32.1-192.168.32.32
    if (ipRangeRe.test(trimmed)) {
        const m = trimmed.match(ipRangeRe)!;
        const prefix = m[1] + '.';
        const start = parseInt(m[2], 10);
        const end = parseInt(m[3], 10);
        if (start >= 0 && start <= 255 && end >= 0 && end <= 255 && start <= end) {
            return { mode: 'ip-mac', ipRange: { prefix, start, end }, ipLike: prefix + '%' };
        }
    }
    if (ipRangeFullRe.test(trimmed)) {
        const [startIp, endIp] = trimmed.split('-').map(s => s.trim());
        const startParts = startIp.split('.').map(Number);
        const endParts = endIp.split('.').map(Number);
        if (startParts.length === 4 && endParts.length === 4 &&
            startParts[0] === endParts[0] && startParts[1] === endParts[1] && startParts[2] === endParts[2]) {
            const prefix = startParts.slice(0, 3).join('.') + '.';
            const start = startParts[3];
            const end = endParts[3];
            if (start <= end) {
                return { mode: 'ip-mac', ipRange: { prefix, start, end }, ipLike: prefix + '%' };
            }
        }
    }

    // MAC exact: AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF
    const macExactRe = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
    if (macExactRe.test(trimmed)) {
        const macNorm = trimmed.replace(/-/g, ':');
        return { mode: 'ip-mac', macLike: macNorm };
    }

    // MAC wildcard: AA:BB:* or AA:BB:CC:*
    if (trimmed.includes('*') && /^[0-9A-Fa-f*:.-]+$/.test(trimmed)) {
        const macLike = trimmed.replace(/-/g, ':').replace(/\*/g, '%');
        return { mode: 'ip-mac', macLike };
    }

    // MAC with non-standard format (e.g. BC::2:4::11::9:9::44::E:) — normalize and match
    if (/^[0-9A-Fa-f:.-]+$/i.test(trimmed) && (trimmed.includes(':') || trimmed.includes('-'))) {
        const normalized = normalizeMacForSearch(trimmed);
        if (normalized) {
            return { mode: 'ip-mac', macLike: normalized + '%' };
        }
    }

    return { mode: 'text', text: trimmed };
}

/** Normalize MAC for search (e.g. BC::2:4::11::9:9::44::E:) → BC:02:04:11:09:09 or full 6 groups */
function normalizeMacForSearch(input: string): string | null {
    const s = input.replace(/-/g, ':').replace(/::+/g, ':').replace(/^:|:$/g, '');
    const segments = s.split(':').filter(Boolean);
    if (segments.length < 1) return null;
    const padded = segments.map(seg => {
        const hex = seg.replace(/[^0-9A-Fa-f]/g, '');
        if (!hex) return '00';
        return hex.length === 1 ? '0' + hex : hex.slice(0, 2);
    });
    return padded.slice(0, 6).join(':');
}

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
    caseSensitive?: boolean; // Case sensitive vs insensitive
}

export class SearchService {
    /**
     * Search across all active plugins.
     * Mode is derived from query: IP/MAC (exact, wildcard *, range) → match IP/MAC; else → text search (hostname, vendor, comment).
     */
    async search(options: SearchOptions): Promise<SearchResult[]> {
        const { query, pluginIds, types, caseSensitive = false } = options;
        
        if (!query || query.trim().length === 0) {
            return [];
        }

        const parsed = parseQuery(query.trim());
        const allResults: SearchResult[] = [];

        if (!pluginIds || pluginIds.length === 0 || pluginIds.includes('scan-reseau')) {
            try {
                const scanResults = await this.searchInNetworkScans(parsed, caseSensitive, types);
                allResults.push(...scanResults);
            } catch (error) {
                logger.error('SearchService', 'Error searching in network scans:', error);
            }
        }

        const plugins = pluginManager.getAllPlugins();
        const activePlugins = plugins.filter(plugin => {
            if (!plugin.isEnabled()) return false;
            if (pluginIds && pluginIds.length > 0) {
                return pluginIds.includes(plugin.getId());
            }
            return true;
        });

        for (const plugin of activePlugins) {
            try {
                const pluginResults = await this.searchInPlugin(plugin, parsed, caseSensitive, types);
                allResults.push(...pluginResults);
            } catch (error) {
                logger.error('SearchService', `Error searching in plugin ${plugin.getId()}:`, error);
            }
        }

        // Merge by IP: one row per IP, combine Freebox + UniFi + Scan (sources, DHCP, openPortsCount)
        const byIp = new Map<string, SearchResult[]>();
        for (const r of allResults) {
            if (!r.ip) continue;
            const list = byIp.get(r.ip) || [];
            list.push(r);
            byIp.set(r.ip, list);
        }
        const merged: SearchResult[] = [];
        for (const [ip, list] of byIp) {
            const sources: string[] = [];
            const sourceSet = new Set<string>();
            for (const r of list) {
                if (r.pluginName && !sourceSet.has(r.pluginName)) {
                    sourceSet.add(r.pluginName);
                    sources.push(r.pluginName);
                }
            }
            let name = '';
            let hostname: string | undefined;
            let mac: string | undefined;
            let active: boolean | undefined;
            let lastSeen: Date | undefined;
            let dhcpFrom: 'freebox' | 'unifi' | undefined;
            let openPortsCount = 0;
            let openPorts: { port: number; protocol?: string }[] | undefined;
            const additionalData: Record<string, any> = { sources };

            // Ports ouverts : depuis le résultat Scan Réseau dans la liste, ou lookup par IP (recherche hostname ne retourne pas toujours le scan)
            const scanResult = list.find((r) => r.pluginId === 'scan-reseau');
            if (scanResult) {
                const ad = scanResult.additionalData as { openPorts?: { port: number; protocol?: string }[]; lastPortScan?: string } | undefined;
                if (ad?.openPorts && Array.isArray(ad.openPorts)) {
                    openPorts = ad.openPorts.map((p) => ({ port: p.port, protocol: p.protocol }));
                    openPortsCount = openPorts.length;
                }
                if (ad?.lastPortScan) (additionalData as any).lastPortScan = ad.lastPortScan;
            }
            // Si pas de ports (ex: recherche par hostname, scan pas dans la liste car hostname différent), compléter par lookup IP
            if (openPortsCount === 0) {
                const scanByIp = NetworkScanRepository.findByIp(ip);
                if (scanByIp?.additionalInfo) {
                    const info = scanByIp.additionalInfo as { openPorts?: { port: number; protocol?: string }[]; lastPortScan?: string };
                    if (info.openPorts && Array.isArray(info.openPorts) && info.openPorts.length > 0) {
                        openPorts = info.openPorts.map((p) => ({ port: p.port, protocol: p.protocol }));
                        openPortsCount = openPorts.length;
                    }
                    if (info.lastPortScan) (additionalData as any).lastPortScan = info.lastPortScan;
                }
            }

            for (const r of list) {
                if (r.name && !name) name = r.name;
                if (r.hostname && !hostname) hostname = r.hostname;
                if (r.mac && !mac) mac = r.mac;
                if (r.active !== undefined && active === undefined) active = r.active;
                if (r.lastSeen && !lastSeen) lastSeen = r.lastSeen;
                if (r.pluginId === 'freebox' && (r.type === 'dhcp' || (r.additionalData as any)?.static !== undefined)) {
                    dhcpFrom = 'freebox';
                }
                if (r.pluginId === 'unifi' && r.type === 'client') {
                    dhcpFrom = dhcpFrom || 'unifi';
                    const uad = r.additionalData as { is_wired?: boolean; is_wireless?: boolean; ap_name?: string; sw_name?: string; ssid?: string; last_uplink_name?: string } | undefined;
                    if (uad) {
                        // Toujours copier WiFi/Filaire pour tout client UniFi (indépendant du DHCP)
                        additionalData.is_wired = uad.is_wired === true;
                        additionalData.is_wireless = uad.is_wireless === true;
                        const apName = uad.ap_name || uad.last_uplink_name;
                        if (apName) (additionalData as any).ap_name = apName;
                        if (uad.sw_name) (additionalData as any).sw_name = uad.sw_name;
                        if (uad.ssid !== undefined) (additionalData as any).ssid = uad.ssid;
                    }
                }
            }
            if (!name && list.length > 0) name = list[0].name || ip;
            additionalData.dhcpFrom = dhcpFrom;
            additionalData.dhcpOn = !!dhcpFrom;
            additionalData.openPortsCount = openPortsCount;
            if (openPorts) additionalData.openPorts = openPorts;

            merged.push({
                pluginId: list[0].pluginId,
                pluginName: sources.join(', ') || list[0].pluginName,
                type: list[0].type,
                id: ip,
                name,
                ip,
                mac,
                hostname,
                active,
                lastSeen,
                additionalData
            });
        }
        return merged;
    }

    /**
     * Search in a specific plugin (IP/MAC mode or text mode from ParsedQuery)
     */
    private async searchInPlugin(
        plugin: IPlugin,
        parsed: ParsedQuery,
        caseSensitive: boolean,
        typeFilter?: SearchResult['type'][]
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const pluginId = plugin.getId();
        const pluginName = plugin.getName();

        try {
            const stats = await pluginManager.getPluginStats(pluginId);
            if (!stats) return results;

            const isIpMac = parsed.mode === 'ip-mac';
            const ipLike = parsed.ipLike;
            const macLike = parsed.macLike;
            const ipRange = parsed.ipRange;
            const text = parsed.text ?? '';

            const ipMatches = (value: string | undefined | null): boolean => {
                if (!value || !ipLike) return false;
                if (ipLike.endsWith('%')) {
                    const prefix = ipLike.slice(0, -1);
                    if (!value.startsWith(prefix)) return false;
                    if (ipRange) {
                        const parts = value.split('.');
                        if (parts.length !== 4) return false;
                        const last = parseInt(parts[3], 10);
                        if (isNaN(last)) return false;
                        return last >= ipRange.start && last <= ipRange.end;
                    }
                    return true;
                }
                return value === ipLike;
            };

            const macMatches = (value: string | undefined | null): boolean => {
                if (!value || !macLike) return false;
                const normalizedValue = normalizeMacForSearch(value as string) || (value as string).replace(/-/g, ':');
                const pattern = macLike.replace(/%/g, '');
                if (!macLike.includes('%')) {
                    return normalizedValue.toLowerCase() === macLike.toLowerCase();
                }
                return normalizedValue.toLowerCase().startsWith(pattern.toLowerCase());
            };

            const textMatches = (value: string | number | undefined | null): boolean => {
                if (value === undefined || value === null || !text) return false;
                const str = String(value);
                const a = caseSensitive ? str : str.toLowerCase();
                const b = caseSensitive ? text : text.toLowerCase();
                return a.includes(b);
            };

            const matchesIpMac = (ip?: string | null, mac?: string | null): boolean => {
                if (ipLike && ipMatches(ip)) return true;
                if (macLike && macMatches(mac)) return true;
                return false;
            };

            const matchesText = (name?: string | null, hostname?: string | null, vendor?: string | null, comment?: string | null): boolean => {
                return textMatches(name) || textMatches(hostname) || textMatches(vendor) || textMatches(comment);
            };

            // Search in Freebox plugin
            if (pluginId === 'freebox') {
                if (!typeFilter || typeFilter.includes('device')) {
                    if (stats.devices && Array.isArray(stats.devices)) {
                        for (const device of stats.devices) {
                            const dev = device as { name?: string; mac?: string; ip?: string; hostname?: string; id?: string; active?: boolean; lastSeen?: Date; type?: string; comment?: string };
                            const match = isIpMac
                                ? matchesIpMac(dev.ip, dev.mac)
                                : matchesText(dev.name, dev.hostname, dev.type, dev.comment);
                            if (match) {
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
                            const match = isIpMac
                                ? matchesIpMac(lease.ip, lease.mac)
                                : matchesText(lease.hostname, lease.host, undefined, lease.comment);
                            if (match) {
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
                            const match = isIpMac
                                ? matchesIpMac(pf.host_ip || pf.host, undefined)
                                : matchesText(pf.name, undefined, undefined, pf.comment) || textMatches(pf.protocol);
                            if (match) {
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
                            const match = isIpMac
                                ? matchesIpMac(dev.ip, dev.mac)
                                : matchesText(dev.name, undefined, dev.model);
                            if (
                                (!typeFilter || 
                                 (isAP && typeFilter.includes('ap')) ||
                                 (isSwitch && typeFilter.includes('switch')) ||
                                 (isGateway && typeFilter.includes('switch'))
                                ) &&
                                match
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
                            const match = isIpMac
                                ? matchesIpMac(client.ip, client.mac)
                                : matchesText(client.name, client.hostname);
                            if (match) {
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

                    // Also check devices array for clients (type 'client' ou appareil avec IP + indicateur client WiFi/Filaire)
                    if (stats.devices && Array.isArray(stats.devices)) {
                        for (const device of stats.devices) {
                            const dev = device as { name?: string; mac?: string; ip?: string; hostname?: string; id?: string; active?: boolean; lastSeen?: Date; type?: string };
                            const typeLower = (dev.type || '').toString().toLowerCase();
                            const isClientType = dev.type === 'client' || !dev.type || typeLower === 'wireless' || typeLower === 'wired';
                            const isDeviceType = typeLower.includes('uap') || typeLower.includes('usw') || typeLower.includes('ugw') || typeLower.includes('ap') || typeLower.includes('switch');
                            if ((isClientType && !isDeviceType) || (dev.ip && !isDeviceType && (dev as any).mac && ((dev as any).ssid !== undefined || (dev as any).ap_mac !== undefined || (dev as any).sw_port !== undefined))) {
                                const match = isIpMac
                                    ? matchesIpMac(dev.ip, dev.mac)
                                    : matchesText(dev.name, dev.hostname);
                                if (match) {
                                    // Avoid duplicates
                                    const exists = results.some(r => 
                                        r.type === 'client' && 
                                        (r.mac === dev.mac || r.id === dev.id)
                                    );
                                    if (!exists) {
                                        const devAny = dev as Record<string, unknown>;
                                        const hasWiredIndicators = !!(devAny.sw_port !== undefined && devAny.sw_port !== null || devAny.sw_port_idx !== undefined && devAny.sw_port_idx !== null);
                                        const hasWirelessIndicators = !!(devAny.ssid || devAny.essid || devAny.ap_mac || devAny.ap_name || devAny.last_uplink_name || devAny.radio ||
                                            (typeof devAny.rssi === 'number' && devAny.rssi < 0) || (typeof devAny.signal === 'number' && devAny.signal < 0));
                                        let is_wired = devAny.is_wired === true;
                                        let is_wireless = devAny.is_wireless === true;
                                        if (!is_wired && !is_wireless) {
                                            if (devAny.ssid || devAny.essid) {
                                                is_wireless = true;
                                            } else if (hasWiredIndicators && !hasWirelessIndicators) {
                                                is_wired = true;
                                            } else if (hasWirelessIndicators && !hasWiredIndicators) {
                                                is_wireless = true;
                                            } else if (hasWiredIndicators && hasWirelessIndicators) {
                                                if (devAny.ssid || devAny.essid) {
                                                    is_wireless = true;
                                                } else if (devAny.sw_port !== undefined && devAny.sw_port !== null || devAny.sw_port_idx !== undefined && devAny.sw_port_idx !== null) {
                                                    is_wired = true;
                                                } else {
                                                    is_wireless = !!(devAny.ap_mac || devAny.ap_name);
                                                }
                                            }
                                        }
                                        let sw_name = devAny.sw_name as string | undefined;
                                        if (!sw_name && (devAny.sw_mac || devAny.last_uplink_mac) && stats.devices && Array.isArray(stats.devices)) {
                                            const clientSwMac = ((devAny.sw_mac as string) || (devAny.last_uplink_mac as string) || '').toLowerCase().replace(/[:-]/g, '');
                                            if (clientSwMac) {
                                                const switchDevice = stats.devices.find((d: any) => {
                                                    const deviceMac = (d.mac || '').toLowerCase().replace(/[:-]/g, '');
                                                    if (deviceMac !== clientSwMac) return false;
                                                    const type = (d.type || '').toString().toLowerCase();
                                                    const model = (d.model || '').toString().toLowerCase();
                                                    return type.includes('usw') || type.includes('switch') || model.includes('usw') || model.includes('switch');
                                                });
                                                if (switchDevice?.name) sw_name = switchDevice.name;
                                            }
                                        }
                                        const ap_name = (devAny.ap_name as string) || (devAny.last_uplink_name as string);
                                        // Si on a ap_name/sw_name mais pas les flags, les déduire pour afficher la colonne AP/Switch
                                        if (!is_wired && !is_wireless) {
                                            if (ap_name || devAny.ssid || devAny.essid) is_wireless = true;
                                            else if (sw_name) is_wired = true;
                                        }
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
                                                ...devAny,
                                                is_wired,
                                                is_wireless,
                                                ap_name,
                                                sw_name: sw_name || (devAny.sw_name as string)
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
     * Search in network scans (scan-réseau plugin) using ParsedQuery (ip-mac or text mode)
     */
    private async searchInNetworkScans(
        parsed: ParsedQuery,
        caseSensitive: boolean,
        typeFilter?: SearchResult['type'][]
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];

        if (typeFilter && typeFilter.length > 0 && !typeFilter.includes('device')) {
            return results;
        }

        try {
            const filters: Parameters<typeof NetworkScanRepository.find>[0] = {};

            if (parsed.mode === 'text' && parsed.text) {
                filters.textSearch = caseSensitive ? parsed.text : parsed.text.toLowerCase();
            } else if (parsed.mode === 'ip-mac') {
                if (parsed.ipLike) {
                    filters.ipLike = parsed.ipLike;
                    if (parsed.ipRange) {
                        filters.ipRange = parsed.ipRange;
                    }
                }
                if (parsed.macLike) {
                    filters.macLike = parsed.macLike;
                }
            }

            const scans = NetworkScanRepository.find(filters);

            for (const scan of scans) {
                const info = scan.additionalInfo as { openPorts?: { port: number }[]; lastPortScan?: string } | undefined;
                const openPorts = info?.openPorts;
                const openPortsCount = Array.isArray(openPorts) ? openPorts.length : 0;
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
                        scanCount: scan.scanCount,
                        openPorts,
                        openPortsCount,
                        lastPortScan: info?.lastPortScan
                    }
                });
            }
        } catch (error) {
            logger.error('SearchService', 'Error searching in network scans:', error);
        }

        return results;
    }
}

export const searchService = new SearchService();

