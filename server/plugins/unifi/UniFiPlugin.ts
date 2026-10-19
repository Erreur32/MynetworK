/**
 * UniFi Plugin
 * 
 * Plugin for integrating with UniFi Controller
 */

import { BasePlugin } from '../base/BasePlugin.js';
import { UniFiApiService } from './UniFiApiService.js';
import { logger } from '../../utils/logger.js';
import { WiresharkVendorService } from '../../services/wiresharkVendorService.js';
import type { PluginConfig, PluginStats, Device } from '../base/PluginInterface.js';

/**
 * Builds a summary of the gateway device for NAT/WAN/LAN display.
 * Extracts WAN and LAN ports from the gateway's network_table when available
 * (UniFi API returns interface list with name, type, ip, etc.).
 */
function buildGatewayNatSummary(
    gatewayDevice: any,
    _portForwardRules: Array<{ enabled: boolean }>
): {
    ip?: string;
    name?: string;
    model?: string;
    wanPorts: Array<{ name: string; type: string; ip?: string; up?: boolean }>;
    lanPorts: Array<{ name: string; type?: string; ip?: string }>;
    portCount?: number;
} | null {
    if (!gatewayDevice) {
        return null;
    }
    const wanPorts: Array<{ name: string; type: string; ip?: string; up?: boolean }> = [];
    const lanPorts: Array<{ name: string; type?: string; ip?: string }> = [];

    // UniFi gateway devices may expose network_table (array of interfaces: WAN, WAN2, LAN, etc.)
    const networkTable = gatewayDevice.network_table || gatewayDevice.networkTable || [];
    if (Array.isArray(networkTable) && networkTable.length > 0) {
        for (const net of networkTable) {
            const name = (net.name || net.display_name || net.interface_name || '').toString().trim() || 'Interface';
            const type = (net.type || net.purpose || '').toString().toLowerCase();
            const ip = net.ip || net.address;
            const up = net.up !== undefined ? !!net.up : (!!ip && type.indexOf('wan') !== -1);

            if (type.indexOf('wan') !== -1 || (name.toLowerCase().indexOf('wan') !== -1 && type !== 'lan')) {
                wanPorts.push({ name, type: type || 'wan', ip, up });
            } else if (type.indexOf('lan') !== -1 || name.toLowerCase().indexOf('lan') !== -1) {
                lanPorts.push({ name, type: type || 'lan', ip });
            }
        }
    }

    // Fallback: single WAN/LAN when no network_table (e.g. USG) - use device ip as LAN
    if (wanPorts.length === 0 && lanPorts.length === 0 && gatewayDevice.ip) {
        lanPorts.push({ name: 'LAN', type: 'lan', ip: gatewayDevice.ip });
    }

    const portCount = typeof gatewayDevice.num_port === 'number' ? gatewayDevice.num_port : undefined;

    return {
        ip: gatewayDevice.ip,
        name: gatewayDevice.name || gatewayDevice.model,
        model: gatewayDevice.model,
        wanPorts,
        lanPorts,
        portCount
    };
}

interface BandwidthRawPoint {
    timestamp: number; // ms
    rx_bytes: number;
    tx_bytes: number;
}

interface WanInterface {
    id: string;   // 'wan1', 'wan2', etc.
    name: string; // Display name
    ip?: string;
}

/**
 * Extract WAN bytes from a gateway device entry (from stat/device).
 * Tries multiple field formats used by different UniFi firmware versions.
 */
function extractWanBytesFromGatewayDevice(
    device: any,
    wanIndex: 1 | 2 = 1
): { rx_bytes: number; tx_bytes: number } | null {
    if (!device) return null;

    const wan = `wan${wanIndex}`;

    // Format 1: Direct WAN fields (UniFiOS CloudGateway / UDM Pro)
    const directRx = device[`${wan}_rx_bytes`];
    const directTx = device[`${wan}_tx_bytes`];
    if (typeof directRx === 'number' && typeof directTx === 'number' && (directRx > 0 || directTx > 0)) {
        return { rx_bytes: directRx, tx_bytes: directTx };
    }

    // Format 2: uplink field (primary WAN / single-WAN devices)
    if (wanIndex === 1 && device.uplink) {
        const upRx = device.uplink.rx_bytes;
        const upTx = device.uplink.tx_bytes;
        if (typeof upRx === 'number' && typeof upTx === 'number' && (upRx > 0 || upTx > 0)) {
            return { rx_bytes: upRx, tx_bytes: upTx };
        }
    }

    // Format 3: network_table wan entries
    const networkTable = device.network_table || device.networkTable || [];
    if (Array.isArray(networkTable) && networkTable.length > 0) {
        const wanEntries = networkTable.filter((n: any) => {
            const type = (n.type || n.purpose || '').toString().toLowerCase();
            const name = (n.name || '').toString().toLowerCase();
            return type.includes('wan') || (name.includes('wan') && !type.includes('lan'));
        });
        const entry = wanEntries[wanIndex - 1];
        if (entry) {
            const netRx = entry.rx_bytes;
            const netTx = entry.tx_bytes;
            if (typeof netRx === 'number' && (netRx > 0 || netTx > 0)) {
                return { rx_bytes: netRx, tx_bytes: netTx };
            }
        }
    }

    // Format 4: wan_stats array
    if (Array.isArray(device.wan_stats)) {
        const wanStat = device.wan_stats[wanIndex - 1];
        if (wanStat) {
            const wsRx = wanStat.rx_bytes;
            const wsTx = wanStat.tx_bytes;
            if (typeof wsRx === 'number' && (wsRx > 0 || wsTx > 0)) {
                return { rx_bytes: wsRx, tx_bytes: wsTx };
            }
        }
    }

    return null;
}

/**
 * Gateway device rule shared by getStats() and the live WAN sampler.
 */
function isGatewayDevice(d: any): boolean {
    const type = (d.type || '').toString().toLowerCase();
    const model = (d.model || '').toString().toLowerCase();
    return type.includes('ugw') || type.includes('udm') || type.includes('ucg') || type.includes('gateway')
        || model.includes('ugw') || model.includes('udm') || model.includes('ucg') || model.includes('gateway');
}

type TopClient = { mac: string; name: string; ip?: string; vendor?: string | null; download: number; upload: number };

/**
 * Live "top talkers" from one stat/sta result. See fetchTopClients() for why only the
 * '*_bytes-r' fields are used.
 */
function computeTopClients(clients: any[], limit: number): TopClient[] {
    const rates: Array<Omit<TopClient, 'vendor'>> = [];

    for (const client of clients) {
        const mac = (client.mac || '').toString().toLowerCase();
        if (!mac) continue;

        // Only '*_bytes-r' fields are an actual measured rate (bytes/sec, computed by the
        // controller). 'rx_rate' / 'tx_rate' / 'phy_*_rate' / 'sw_*_rate' are NOT
        // throughput, they're the negotiated WiFi PHY rate or Ethernet port speed (link
        // capability, not usage). Confirmed the hard way: two different IoT devices both
        // showed exactly "307 Mb/s" simultaneously, a real traffic rate would never
        // coincidentally match another device's to the Mb/s, that's a fixed link-rate
        // constant. Those fields must never be used here again.
        const rxBytesPerSec = Number(client['rx_bytes-r']) || Number(client['wired-rx_bytes-r']) || 0;
        const txBytesPerSec = Number(client['tx_bytes-r']) || Number(client['wired-tx_bytes-r']) || 0;

        const download = Math.round(rxBytesPerSec / 1024);
        const upload = Math.round(txBytesPerSec / 1024);

        if (download === 0 && upload === 0) continue;

        rates.push({
            mac,
            name: client.name || client.hostname || client.ip || mac,
            ip: client.ip,
            download,
            upload
        });
    }

    if (rates.length === 0) return [];

    rates.sort((a, b) => (b.download + b.upload) - (a.download + a.upload));
    const result = rates.slice(0, limit);

    return result.map(r => ({
        ...r,
        vendor: r.mac.length >= 8 ? WiresharkVendorService.lookupVendor(r.mac.slice(0, 8)) : null
    }));
}

/**
 * Sum of every currently-connected client's real-time rate from one stat/sta result (same
 * '*_bytes-r' fields as computeTopClients, totalled across ALL clients instead of ranking the top N).
 * Used as the "total_clients" side of the LAN estimate: LAN ≈ total_clients − WAN. This is an
 * approximation, not a direct measurement, UniFi has no single "LAN interface" counter the
 * way it has one clear WAN interface, and this total includes internet-bound traffic too
 * (subtracting WAN accounts for that, imperfectly, since the two are sampled independently).
 */
function computeTotalClientTraffic(clients: any[]): { download: number; upload: number } {
    let totalRxBytesPerSec = 0;
    let totalTxBytesPerSec = 0;

    for (const client of clients) {
        totalRxBytesPerSec += Number(client['rx_bytes-r']) || Number(client['wired-rx_bytes-r']) || 0;
        totalTxBytesPerSec += Number(client['tx_bytes-r']) || Number(client['wired-tx_bytes-r']) || 0;
    }

    return {
        download: Math.round(totalRxBytesPerSec / 1024),
        upload: Math.round(totalTxBytesPerSec / 1024)
    };
}

/**
 * Detect available WAN interfaces from a gateway device entry.
 */
function detectWanInterfaces(device: any): WanInterface[] {
    if (!device) return [];
    const interfaces: WanInterface[] = [];

    // Check network_table for WAN entries
    const networkTable = device.network_table || device.networkTable || [];
    if (Array.isArray(networkTable) && networkTable.length > 0) {
        const wanEntries = networkTable.filter((n: any) => {
            const type = (n.type || n.purpose || '').toString().toLowerCase();
            const name = (n.name || '').toString().toLowerCase();
            return type.includes('wan') || (name.includes('wan') && !type.includes('lan'));
        });
        if (wanEntries.length > 0) {
            wanEntries.forEach((n: any, i: number) => {
                interfaces.push({
                    id: `wan${i + 1}`,
                    name: n.name || n.display_name || `WAN${i + 1}`,
                    ip: n.ip || n.address
                });
            });
            return interfaces;
        }
    }

    // Check for wan1/wan2 direct fields
    if (typeof device.wan1_rx_bytes === 'number') {
        interfaces.push({ id: 'wan1', name: 'WAN 1' });
    }
    if (typeof device.wan2_rx_bytes === 'number') {
        interfaces.push({ id: 'wan2', name: 'WAN 2' });
    }
    if (interfaces.length > 0) return interfaces;

    // Check uplink as fallback single-WAN
    if (device.uplink && typeof device.uplink.rx_bytes === 'number') {
        interfaces.push({ id: 'wan1', name: 'WAN' });
    }

    // If nothing detected but it's a gateway device, assume single WAN
    if (interfaces.length === 0) {
        interfaces.push({ id: 'wan1', name: 'WAN' });
    }

    return interfaces;
}

export class UniFiPlugin extends BasePlugin {
    private apiService: UniFiApiService;
    private _bandwidthHistories: Map<string, BandwidthRawPoint[]> = new Map();
    private _wanInterfaces: WanInterface[] = [];
    // Gateway MAC, lets the live sampler request only the gateway instead of every device
    private _gatewayMac: string | null = null;
    // stat/dashboard returns 0 on many controllers: once seen, stop asking for a while
    private _dashboardZeroUntilMs = 0;
    private static readonly DASHBOARD_ZERO_RETRY_MS = 5 * 60 * 1000;
    // getStats() result shared for a few seconds (dashboard, ip-details, scan, metrics, search...)
    private _statsCache: { at: number; generation: number; stats: PluginStats } | null = null;
    private _statsInFlight: { generation: number; promise: Promise<PluginStats> } | null = null;
    private static readonly STATS_TTL_MS = 10_000;
    // History points: 30s apart from the background sampler (no WebSocket client) and 2s apart
    // while the live WebSocket runs. 20160 points cover 7 days at 30s; live points older than
    // HISTORY_LIVE_DETAIL_MS are thinned to one per HISTORY_COMPACT_STEP_MS when the buffer is
    // full, so live sessions do not shrink the 7-day window (see _trimHistory).
    private readonly BANDWIDTH_MAX = 20160;
    private static readonly HISTORY_LIVE_DETAIL_MS = 10 * 60 * 1000;
    private static readonly HISTORY_COMPACT_STEP_MS = 30_000;

    constructor() {
        super('unifi', 'UniFi Controller', '0.12.1');
        this.apiService = new UniFiApiService();
    }

    /**
     * Public accessor for the underlying UniFi API service, e.g. for MCP tools.
     */
    getApiService(): UniFiApiService {
        return this.apiService;
    }

    private _getOrCreateHistory(wanId: string): BandwidthRawPoint[] {
        if (!this._bandwidthHistories.has(wanId)) {
            this._bandwidthHistories.set(wanId, []);
        }
        return this._bandwidthHistories.get(wanId)!;
    }

    /**
     * fetchedAt is the time the counters were fetched from the controller, not the time of
     * this call: the API service may serve a cached response, and stamping it with Date.now()
     * would skew the computed rates.
     */
    private _pushToHistory(wanId: string, rxBytes: number, txBytes: number, fetchedAt: number = Date.now()): void {
        const history = this._getOrCreateHistory(wanId);
        const last = history[history.length - 1];
        if (!last) {
            history.push({ timestamp: fetchedAt, rx_bytes: rxBytes, tx_bytes: txBytes });
        } else if (fetchedAt <= last.timestamp) {
            // Same (cached) or older sample than the last point, nothing new
            return;
        } else if (rxBytes < last.rx_bytes || txBytes < last.tx_bytes) {
            // Counter reset (reboot), clear history and start fresh
            this._bandwidthHistories.set(wanId, [{ timestamp: fetchedAt, rx_bytes: rxBytes, tx_bytes: txBytes }]);
        } else if (rxBytes > last.rx_bytes || txBytes > last.tx_bytes) {
            // Only push when bytes actually changed, avoids zero-rate entries
            // when the controller hasn't updated its counters yet
            history.push({ timestamp: fetchedAt, rx_bytes: rxBytes, tx_bytes: txBytes });
            if (history.length > this.BANDWIDTH_MAX) this._trimHistory(wanId, history);
        }
        // If bytes are identical to last entry → skip (controller hasn't refreshed yet)
    }

    /**
     * Keep the history under BANDWIDTH_MAX. First thin the dense live points older than
     * HISTORY_LIVE_DETAIL_MS to one per HISTORY_COMPACT_STEP_MS: counters are cumulative, so
     * dropping intermediate points keeps the average rate between the kept points exact.
     * Only then drop the oldest points.
     */
    private _trimHistory(wanId: string, history: BandwidthRawPoint[]): void {
        const cutoff = history[history.length - 1].timestamp - UniFiPlugin.HISTORY_LIVE_DETAIL_MS;
        const kept: BandwidthRawPoint[] = [];
        for (const point of history) {
            const prev = kept[kept.length - 1];
            if (prev && point.timestamp < cutoff && point.timestamp - prev.timestamp < UniFiPlugin.HISTORY_COMPACT_STEP_MS) continue;
            kept.push(point);
        }
        if (kept.length > this.BANDWIDTH_MAX) kept.splice(0, kept.length - this.BANDWIDTH_MAX);
        this._bandwidthHistories.set(wanId, kept);
    }

    getBandwidthHistory(wanId = 'wan1', rangeSeconds = 0): Array<{ time: string; timestamp: number; download: number; upload: number }> {
        const history = this._bandwidthHistories.get(wanId) || [];
        if (history.length < 2) return [];

        let filtered: BandwidthRawPoint[];
        if (rangeSeconds > 0) {
            const cutoff = Date.now() - rangeSeconds * 1000;
            filtered = history.filter(p => p.timestamp >= cutoff);
            // Need at least the point just before the cutoff to compute first rate
            if (filtered.length < 2) {
                const idxFirst = history.findIndex(p => p.timestamp >= cutoff);
                filtered = idxFirst > 0 ? history.slice(idxFirst - 1) : history;
            }
        } else {
            // Live: last 10 points, used to seed the live chart before WebSocket points arrive.
            // Points are 2s apart while the live WebSocket runs and 30s apart otherwise, so this
            // spans ~20s to ~5 min; rates stay correct as each one uses the real time delta.
            filtered = history.slice(-10);
        }

        if (filtered.length < 2) return [];
        const result = [];
        const showSeconds = rangeSeconds === 0 || rangeSeconds <= 3600;
        for (let i = 1; i < filtered.length; i++) {
            const prev = filtered[i - 1];
            const curr = filtered[i];
            const dtSec = (curr.timestamp - prev.timestamp) / 1000;
            if (dtSec <= 0) continue;
            const download = Math.max(0, Math.round((curr.rx_bytes - prev.rx_bytes) / dtSec / 1024));
            const upload = Math.max(0, Math.round((curr.tx_bytes - prev.tx_bytes) / dtSec / 1024));
            const d = new Date(curr.timestamp);
            const time = showSeconds
                ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            result.push({ time, timestamp: curr.timestamp, download, upload });
        }
        return result;
    }

    /**
     * Get bandwidth history: for range > 0, try the controller's built-in report first
     * (has data from before server start), then fall back to in-memory history.
     */
    async getBandwidthReport(rangeSeconds: number): Promise<Array<{ time: string; timestamp: number; download: number; upload: number }>> {
        try {
            return await this.apiService.getBandwidthReport(rangeSeconds);
        } catch {
            return [];
        }
    }

    getWanInterfaces(): WanInterface[] {
        return this._wanInterfaces;
    }

    /**
     * Lightweight WAN bandwidth fetch for real-time WebSocket polling and background sampling.
     * Reads the gateway's byte counters (gateway-only stat/device request when its MAC is known),
     * much lighter than full getStats(). stat/dashboard is only a fallback for WAN1.
     * Pushes new byte counters to history and returns computed KB/s rates for each WAN.
     */
    async fetchWanBandwidth(): Promise<Record<string, { download: number; upload: number }> | null> {
        if (!this.isEnabled() || !this.config) return null;

        try {
            const wans = this._wanInterfaces.length > 0 ? this._wanInterfaces : [{ id: 'wan1', name: 'WAN' }];

            // Fetch fresh gateway data to get current byte counters
            // (getNetworkStats/dashboard API returns 0 on many controllers,
            //  and cached gateway device has stale counters)
            let freshGateway: any = null;
            let gatewayFetchedAt = 0;
            try {
                const sample = await this.apiService.getGatewayDeviceSample(isGatewayDevice, this._gatewayMac);
                freshGateway = sample.device;
                gatewayFetchedAt = sample.fetchedAt;
                if (freshGateway?.mac) this._gatewayMac = String(freshGateway.mac);
            } catch { /* ignore, will fall back to networkStats */ }

            for (const wan of wans) {
                const wanIdx = (parseInt(wan.id.replace('wan', ''), 10) || 1) as 1 | 2;

                // Priority 1: fresh gateway device (live byte counters)
                const deviceWan = freshGateway ? extractWanBytesFromGatewayDevice(freshGateway, wanIdx) : null;
                if (deviceWan && (deviceWan.rx_bytes > 0 || deviceWan.tx_bytes > 0)) {
                    this._pushToHistory(wan.id, deviceWan.rx_bytes, deviceWan.tx_bytes, gatewayFetchedAt);
                    continue;
                }

                // Priority 2: networkStats (dashboard API, WAN1 only, works on some controllers).
                // Asked once per tick at most, and not again for a while once it returned 0.
                if (wanIdx === 1 && Date.now() >= this._dashboardZeroUntilMs) {
                    try {
                        const { stats, fetchedAt } = await this.apiService.getNetworkStatsWithFetchTime();
                        const rxBytes = stats.wan?.rx_bytes || 0;
                        const txBytes = stats.wan?.tx_bytes || 0;
                        if (rxBytes > 0 || txBytes > 0) {
                            this._pushToHistory(wan.id, rxBytes, txBytes, fetchedAt);
                        } else {
                            this._dashboardZeroUntilMs = Date.now() + UniFiPlugin.DASHBOARD_ZERO_RETRY_MS;
                        }
                    } catch { /* ignore */ }
                }
            }

            // Compute rates for all WANs from history
            const result: Record<string, { download: number; upload: number }> = {};
            for (const wan of wans) {
                const history = this._bandwidthHistories.get(wan.id) || [];
                if (history.length >= 2) {
                    const prev = history[history.length - 2];
                    const curr = history[history.length - 1];
                    const dtSec = (curr.timestamp - prev.timestamp) / 1000;
                    if (dtSec > 0) {
                        result[wan.id] = {
                            download: Math.max(0, Math.round((curr.rx_bytes - prev.rx_bytes) / dtSec / 1024)),
                            upload: Math.max(0, Math.round((curr.tx_bytes - prev.tx_bytes) / dtSec / 1024)),
                        };
                    } else {
                        result[wan.id] = { download: 0, upload: 0 };
                    }
                } else {
                    result[wan.id] = { download: 0, upload: 0 };
                }
            }

            return result;
        } catch (error) {
            logger.debug('UniFiPlugin', 'fetchWanBandwidth failed:', error);
            return null;
        }
    }

    /**
     * Live "top talkers": per-client throughput, from the controller's own instantaneous rate
     * fields ('rx_bytes-r' / 'tx_bytes-r' / 'wired-rx_bytes-r' / 'wired-tx_bytes-r', in
     * bytes/sec). No minimum threshold, filtering happens purely on whether these fields are
     * present and non-zero. A client with none of these fields simply won't show up; that's
     * preferable to guessing from a link-capability field and showing a fabricated rate (see the
     * git history for why, 'rx_rate'/'tx_rate'/'phy_*_rate'/'sw_*_rate' are NOT throughput, they
     * are the negotiated WiFi PHY rate or Ethernet port speed).
     */
    async fetchTopClients(limit = 10): Promise<TopClient[]> {
        if (!this.isEnabled() || !this.config) return [];

        try {
            return computeTopClients(await this.apiService.getClients(), limit);
        } catch (error) {
            logger.debug('UniFiPlugin', 'fetchTopClients failed:', error);
            return [];
        }
    }

    /**
     * Top clients and total client rate from a single stat/sta request, for the live
     * WebSocket which needs both on the same tick. On error: empty list, zero totals.
     */
    async fetchClientTraffic(limit = 10): Promise<{ topClients: TopClient[]; total: { download: number; upload: number } }> {
        if (!this.isEnabled() || !this.config) return { topClients: [], total: { download: 0, upload: 0 } };

        try {
            const clients = await this.apiService.getClients();
            return { topClients: computeTopClients(clients, limit), total: computeTotalClientTraffic(clients) };
        } catch (error) {
            logger.debug('UniFiPlugin', 'fetchClientTraffic failed:', error);
            return { topClients: [], total: { download: 0, upload: 0 } };
        }
    }

    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        // New settings may point to another controller/site: forget derived state
        this._clearStatsCache();
        this._gatewayMac = null;
        this._dashboardZeroUntilMs = 0;

        const settings = config.settings;
        const apiMode = (settings?.apiMode as 'controller' | 'site-manager') || 'controller';

        logger.debug('UniFiPlugin', `Initializing with mode: ${apiMode}, enabled: ${config.enabled}`);

        if (apiMode === 'site-manager') {
            // Site Manager API mode
            const apiKey = settings?.apiKey as string;
            if (apiKey && apiKey.trim()) {
                logger.debug('UniFiPlugin', `Site Manager API key set (apiKeyLength: ${apiKey.length})`);
                this.apiService.setSiteManagerConnection(apiKey.trim());
            } else {
                logger.warn('UniFiPlugin', `Site Manager mode selected but API key is missing or empty. Type: ${typeof apiKey}, Value: ${apiKey ? 'present but empty/whitespace' : 'missing/null/undefined'}`);
            }
        } else {
            // Controller API mode (local) - but check for auto-detection of Site Manager
            const url = settings?.url as string;
            const username = settings?.username as string;
            const password = settings?.password as string;
            const site = (settings?.site as string) || 'default';
            const apiKey = settings?.apiKey as string;

            // Priority 1: If URL/username/password are present, use Controller mode (local)
            // This prevents auto-switching to Site Manager when local credentials are configured
            if (url && url.trim() && username && username.trim() && password && password.trim()) {
                // Check if URL is Site Manager (unifi.ui.com) - requires API key
                if ((() => { try { return new URL(url).hostname === 'unifi.ui.com'; } catch { return false; } })()) {
                    if (apiKey && apiKey.trim()) {
                        // Site Manager URL with valid API key -> use Site Manager
                        logger.debug('UniFiPlugin', 'Site Manager URL detected with API key - auto-switching to Site Manager (cloud) mode');
                        this.apiService.setSiteManagerConnection(apiKey.trim());
                    } else {
                        logger.warn('UniFiPlugin', 'Site Manager URL detected but no API key provided. For Site Manager (cloud), you must provide an API key. Get it from https://unifi.ui.com/api');
                    }
                } else {
                    // Local controller (UniFiOS or Classic) - auto-detected unless forceDeploymentType is set
                    const forceDeploymentType = (settings?.forceDeploymentType as 'auto' | 'unifios' | 'controller' | undefined) || 'auto';
                    this.apiService.setConnection(url.trim(), username.trim(), password, site.trim() || 'default', undefined, forceDeploymentType);
                    logger.debug('UniFiPlugin', `Controller connection set (site: ${site.trim() || 'default'}, forceDeployment: ${forceDeploymentType})`);
                }
            } else if (apiKey && apiKey.trim()) {
                // Priority 2: If only API key is present (without URL/username/password), use Site Manager
                logger.debug('UniFiPlugin', 'API key detected without local credentials - auto-switching to Site Manager (cloud) mode');
                this.apiService.setSiteManagerConnection(apiKey.trim());
            } else {
                logger.debug('UniFiPlugin', 'Controller connection details not set - missing or empty required fields');
            }
        }
    }

    async start(): Promise<void> {
        // BasePlugin.start() already checks if plugin is enabled
        await super.start();
        
        // Double check: don't proceed if not enabled
        if (!this.isEnabled()) {
            logger.debug('UniFiPlugin', 'Plugin is not enabled, skipping connection');
            return;
        }
        
        // Only try to login if we have connection details
        // Use this.config directly (protected property from BasePlugin)
        if (!this.config) {
            logger.debug('UniFiPlugin', 'No configuration available, skipping login');
            return;
        }
        
        const settings = this.config.settings;
        const apiMode = (settings?.apiMode as 'controller' | 'site-manager') || 'controller';
        
        if (apiMode === 'controller') {
            const url = settings?.url as string;
            const username = settings?.username as string;
            const password = settings?.password as string;
            
            // Only try to login if we have all required settings
            if (!url || !username || !password) {
                // This is normal if the plugin is not configured yet - only log at debug level
                // console.log('[UniFiPlugin] Controller API not fully configured (missing URL, username, or password), skipping login');
                return;
            }
            
            try {
                const loggedIn = await this.apiService.login();
                if (!loggedIn) {
                    throw new Error('Failed to authenticate with UniFi controller');
                }
                // Connection successful - no need to log every time
                // logger.success('UniFiPlugin', 'Successfully connected to UniFi controller');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                // Si c'est une erreur SSL, ne pas faire planter le serveur
                // Le plugin restera initialisé mais non connecté
                if (errorMessage.includes('EPROTO') || errorMessage.includes('wrong version number') || 
                    errorMessage.includes('SSL') || errorMessage.includes('TLS')) {
                    logger.error('UniFiPlugin', 'SSL/TLS error detected. The controller might be using HTTP instead of HTTPS.');
                    logger.warn('UniFiPlugin', 'Try configuring the URL with http:// instead of https://, or check the controller configuration.');
                    // Ne pas lancer d'erreur pour éviter de faire planter le serveur
                    // Le plugin pourra être reconnecté plus tard via l'interface
                    return;
                }
                
                logger.error('UniFiPlugin', `Login failed: ${errorMessage}`);
                // Pour les autres erreurs, lancer l'exception normalement
                throw error;
            }
        } else if (apiMode === 'site-manager') {
            const apiKey = settings?.apiKey as string;
            if (!apiKey || !apiKey.trim()) {
                const apiKeyType = typeof apiKey;
                const apiKeyLength = apiKey ? apiKey.length : 0;
                logger.warn('UniFiPlugin', `Site Manager API key not configured or empty during start(). Type: ${apiKeyType}, Length: ${apiKeyLength}, Value: ${apiKey ? 'present but empty/whitespace' : 'missing/null/undefined'}`);
                // Log all settings keys for debugging
                logger.debug('UniFiPlugin', `Available settings keys: ${Object.keys(settings || {}).join(', ')}`);
                return;
            }
            
            // Verify API key is set in apiService before attempting login
            logger.debug('UniFiPlugin', `Attempting Site Manager login (apiKeyLength: ${apiKey.length})`);
            
            // Ensure API key is set in apiService (in case initialize() didn't set it)
            if (!this.apiService || (this.apiService as any).apiMode !== 'site-manager') {
                logger.debug('UniFiPlugin', 'API service not configured for Site Manager, configuring now...');
                this.apiService.setSiteManagerConnection(apiKey.trim());
            }
            
            try {
                const loggedIn = await this.apiService.login();
                if (!loggedIn) {
                    throw new Error('Failed to authenticate with UniFi Site Manager API');
                }
            } catch (error) {
                logger.error('UniFiPlugin', 'Site Manager login failed:', error);
                throw error;
            }
        }
    }

    async stop(): Promise<void> {
        // Only logout if plugin was enabled and we're actually logged in
        // This prevents unnecessary API calls when plugin is disabled
        if (this.isEnabled() && this.apiService.isLoggedIn()) {
            await this.apiService.logout();
        }
        this._clearStatsCache();
        await super.stop();
    }

    /**
     * Return raw devices + clients for topology computation.
     * Kept separate from getStats() to avoid pulling unrelated data
     * (bandwidth history, port forwarding, sysinfo) when the topology
     * service only needs the device/client graph.
     */
    async getTopologyData(): Promise<{ devices: import('./UniFiApiService.js').UniFiDevice[]; clients: any[] }> {
        if (!this.isEnabled()) {
            throw new Error('UniFi plugin is not enabled');
        }
        if (!this.apiService.isLoggedIn()) {
            await this.start();
        }
        const [devices, clients] = await Promise.all([
            this.apiService.getDevices(),
            this.apiService.getClients()
        ]);
        return { devices, clients };
    }

    /**
     * Full stats (devices + clients + WAN + system + WLANs + NAT), shared for STATS_TTL_MS and
     * between concurrent callers: many routes and services call this, each call used to cost
     * 7 controller requests. The cache is dropped after any controller write (block client,
     * WLAN toggle, restart) and on configuration changes. Every caller gets its own deep copy.
     */
    async getStats(): Promise<PluginStats> {
        if (!this.isEnabled()) {
            throw new Error('UniFi plugin is not enabled');
        }

        // Check if we have configuration
        if (!this.config) {
            throw new Error('UniFi plugin is not configured');
        }

        const generation = this.apiService.getCacheGeneration();
        const cached = this._statsCache;
        if (cached && cached.generation === generation && Date.now() - cached.at < UniFiPlugin.STATS_TTL_MS) {
            return structuredClone(cached.stats);
        }

        // Join a request in flight only if no write happened since it started
        let inFlight = this._statsInFlight;
        if (!inFlight || inFlight.generation !== generation) {
            const promise: Promise<PluginStats> = this._computeStats()
                .then((stats) => {
                    // A write or a reconnection during the request makes the result possibly outdated: not cached
                    if (this.apiService.getCacheGeneration() === generation) {
                        this._statsCache = { at: Date.now(), generation, stats };
                    }
                    return stats;
                })
                .finally(() => {
                    if (this._statsInFlight?.promise === promise) this._statsInFlight = null;
                });
            inFlight = { generation, promise };
            this._statsInFlight = inFlight;
        }
        return structuredClone(await inFlight.promise);
    }

    private _clearStatsCache(): void {
        this._statsCache = null;
        this._statsInFlight = null;
    }

    private async _computeStats(): Promise<PluginStats> {
        if (!this.config) {
            throw new Error('UniFi plugin is not configured');
        }

        // Check if we need to login
        if (!this.apiService.isLoggedIn()) {
            // Try to reconnect only if we have valid configuration
            const settings = this.config.settings;
            const apiMode = (settings?.apiMode as 'controller' | 'site-manager') || 'controller';
            
            if (apiMode === 'controller') {
                const url = settings?.url as string;
                const username = settings?.username as string;
                const password = settings?.password as string;
                
                // Debug: log what we have
                if (!url || !username || !password) {
                    logger.debug('UniFiPlugin', 'Missing UniFi controller configuration', {
                        hasUrl: !!url,
                        hasUsername: !!username,
                        hasPassword: !!password,
                        apiMode,
                        settingsKeys: Object.keys(settings || {})
                    });
                    throw new Error('UniFi Controller API not fully configured (missing URL, username, or password)');
                }
                
                try {
                    await this.start();
                } catch (error) {
                    logger.error('UniFiPlugin', 'Failed to reconnect:', error);
                    throw error;
                }
            } else {
                const apiKey = settings?.apiKey as string;
                if (!apiKey || !apiKey.trim()) {
                    const apiKeyType = typeof apiKey;
                    const apiKeyLength = apiKey ? apiKey.length : 0;
                    logger.error('UniFiPlugin', `Missing Site Manager API key. Type: ${apiKeyType}, Length: ${apiKeyLength}, Value: ${apiKey ? 'present but empty/whitespace' : 'missing/null/undefined'}`);
                    throw new Error('UniFi Site Manager API key not configured or empty');
                }
                logger.debug('UniFiPlugin', `Reconnecting with Site Manager API key (apiKeyLength: ${apiKey.length})`);
                try {
                    await this.start();
                } catch (error) {
                    logger.error('UniFiPlugin', 'Failed to reconnect:', error);
                    throw error;
                }
            }
        }

        try {
            const [devicesSample, clients, statsSample, sysinfo, wlans, networkConf, portForwardRules] = await Promise.all([
                this.apiService.getDevicesWithFetchTime(),
                this.apiService.getClients(),
                this.apiService.getNetworkStatsWithFetchTime(),
                this.apiService.getSystemInfo(),
                this.apiService.getWlans().catch(() => []), // Get WLANs, but don't fail if unavailable
                this.apiService.getNetworkConfig().catch(() => ({ dhcpEnabled: false, dhcpRange: undefined })), // DHCP on UniFi (rest/networkconf)
                this.apiService.getPortForwardingRules().catch(() => []) // NAT rules count and list for dashboard
            ]);
            const devices = devicesSample.devices;
            const stats = statsSample.stats;

            // Log summary only if debug is enabled
            logger.debug('UniFiPlugin', `Retrieved ${devices.length} devices, ${clients.length} clients`);
            logger.verbose('UniFiPlugin', `First device DEBUG:`, devices.length > 0 ? {
                name: devices[0].name,
                type: devices[0].type,
                model: devices[0].model,
                state: devices[0].state
            } : 'No devices');
            logger.verbose('UniFiPlugin', `First client DEBUG:`, clients.length > 0 ? {
                name: clients[0].name || clients[0].hostname,
                ip: clients[0].ip,
                mac: clients[0].mac
            } : 'No clients');

            // Normalize devices
            // UniFi devices from getAccessDevices are typically access points, switches, gateways
            // They have type like 'uap', 'uap-ac', 'usw', 'ugw', etc.
            const normalizedDevices: Device[] = devices.map((device: any) => {
                // Determine device type - UniFi uses 'uap' for access points
                let deviceType = device.type || device.model || 'unknown';
                // If type is not set but model contains UAP/AP, mark as access point
                if (!device.type && device.model) {
                    const modelLower = device.model.toLowerCase();
                    if (modelLower.includes('uap') || modelLower.includes('ap')) {
                        deviceType = 'uap';
                    }
                }
                return {
                    id: device._id || device.mac || '',
                    name: device.name || device.model || 'Unknown Device',
                    ip: device.ip,
                    mac: device.mac,
                    type: deviceType,
                    active: device.state === 1 || device.state === 'connected',
                    lastSeen: device.last_seen ? new Date(device.last_seen * 1000) : undefined,
                    ...device // Include all original fields
                };
            });

            // Add clients as devices too (spread client first so type is overwritten last → always 'client' for search/UI)
            const clientDevices: Device[] = clients.map((client: any) => ({
                ...client,
                id: client._id || client.mac || '',
                name: client.name || client.hostname || 'Unknown Client',
                ip: client.ip,
                mac: client.mac,
                type: 'client',
                active: true,
                lastSeen: client.last_seen ? new Date(client.last_seen * 1000) : undefined
            }));

            // Combine devices and clients
            const allDevices = [...normalizedDevices, ...clientDevices];

            // Get API mode from settings
            const apiMode = (this.config?.settings?.apiMode as 'controller' | 'site-manager') || 'controller';
            // Get deployment type from API service
            const deploymentType = this.apiService.getDeploymentType();

            // Build NAT / gateway summary from gateway device (WAN/LAN ports, rule count)
            const gatewayDevice = devices.find(isGatewayDevice);
            // Remember the gateway MAC: it lets fetchWanBandwidth request the gateway alone
            if (gatewayDevice?.mac) this._gatewayMac = String(gatewayDevice.mac);
            const gatewaySummary = buildGatewayNatSummary(gatewayDevice, portForwardRules);

            // Detect WAN interfaces from gateway device and update cached list
            if (gatewayDevice) {
                this._wanInterfaces = detectWanInterfaces(gatewayDevice);
            } else if (this._wanInterfaces.length === 0) {
                this._wanInterfaces = [{ id: 'wan1', name: 'WAN' }];
            }

            // Collect WAN bytes for all known WAN interfaces.
            // Priority: stats from getNetworkStats() (stat/dashboard / site-manager isp-metrics)
            // Fallback: extract directly from gateway device fields (works for UniFiOS/CloudGateway).
            for (const wan of this._wanInterfaces) {
                const wanIdx = (parseInt(wan.id.replace('wan', ''), 10) || 1) as 1 | 2;

                let rxBytes: number;
                let txBytes: number;
                // Time the counters were fetched (cached responses can be slightly older than now)
                let fetchedAt = devicesSample.fetchedAt;

                if (wanIdx === 1 && (stats.wan?.rx_bytes || 0) > 0) {
                    // Use stats from API (stat/dashboard or site-manager)
                    rxBytes = stats.wan!.rx_bytes!;
                    txBytes = stats.wan!.tx_bytes || 0;
                    fetchedAt = statsSample.fetchedAt;
                } else {
                    // Fallback: extract from gateway device directly (UniFiOS CloudGateway)
                    const deviceWan = extractWanBytesFromGatewayDevice(gatewayDevice, wanIdx);
                    rxBytes = deviceWan?.rx_bytes || 0;
                    txBytes = deviceWan?.tx_bytes || 0;
                    if (rxBytes > 0 || txBytes > 0) {
                        logger.debug('UniFiPlugin', `WAN${wanIdx} bytes from gateway device: rx=${rxBytes}, tx=${txBytes}`);
                    }
                }

                if (rxBytes > 0 || txBytes > 0) {
                    this._pushToHistory(wan.id, rxBytes, txBytes, fetchedAt);
                }
            }

            // Compute current WAN speed (bytes/s) from last two history points (wan1)
            const primaryHistory = this._bandwidthHistories.get('wan1') || [];
            let downloadBytesPerSec = 0;
            let uploadBytesPerSec = 0;
            if (primaryHistory.length >= 2) {
                const prev = primaryHistory[primaryHistory.length - 2];
                const curr = primaryHistory[primaryHistory.length - 1];
                const dtSec = (curr.timestamp - prev.timestamp) / 1000;
                if (dtSec > 0) {
                    downloadBytesPerSec = Math.max(0, (curr.rx_bytes - prev.rx_bytes) / dtSec);
                    uploadBytesPerSec = Math.max(0, (curr.tx_bytes - prev.tx_bytes) / dtSec);
                }
            }

            // Normalize network stats, download/upload in bytes/s for formatSpeed compatibility
            const networkStats = {
                download: downloadBytesPerSec,
                upload: uploadBytesPerSec,
                totalDownload: primaryHistory[primaryHistory.length - 1]?.rx_bytes || 0,
                totalUpload: primaryHistory[primaryHistory.length - 1]?.tx_bytes || 0
            };

            // Extract temperature from UDM gateway / Dream devices (general_temperature or temperatures[])
            // Priority: gateway (UDM/UGW) > switch > AP
            const pickGatewayDevice = (devs: any[]): any | undefined => {
                const isGateway = (d: any) => {
                    const t = (d.type || '').toString().toLowerCase();
                    const m = (d.model || '').toString().toLowerCase();
                    return t === 'ugw' || t === 'udm' || m.includes('udm') || m.includes('dream') || m.includes('ugw');
                };
                return devs.find(isGateway) || devs.find((d: any) => typeof d.general_temperature === 'number' || Array.isArray(d.temperatures));
            };
            const extractTempSensors = (d: any): Array<{ id: string; name: string; value: number }> => {
                if (!d) return [];
                if (Array.isArray(d.temperatures) && d.temperatures.length > 0) {
                    return d.temperatures
                        .map((s: any, idx: number) => ({
                            id: (s?.id || s?.name || `sensor-${idx}`).toString(),
                            name: (s?.name || s?.type || `Sensor ${idx + 1}`).toString(),
                            value: typeof s?.value === 'number' ? Math.round(s.value) : 0,
                        }))
                        .filter((s: { value: number }) => s.value > 0);
                }
                if (typeof d.general_temperature === 'number' && d.general_temperature > 0) {
                    return [{ id: 'gateway', name: d.name || d.model || 'Gateway', value: Math.round(d.general_temperature) }];
                }
                return [];
            };
            const tempSourceDevice = pickGatewayDevice(devices);
            const unifiTempSensors = extractTempSensors(tempSourceDevice);
            const unifiTemperature = unifiTempSensors.length > 0
                ? Math.round(unifiTempSensors.reduce((a, s) => a + s.value, 0) / unifiTempSensors.length)
                : undefined;

            // Normalize system stats
            const systemStats: any = {
                // Uptime (in seconds) if available
                uptime: sysinfo.uptime || 0,
                // Temperature from gateway device (if exposed, e.g. UDM Pro/SE/Dream Router)
                temperature: unifiTemperature,
                temperatureSensors: unifiTempSensors,
                // Controller / site display name when exposed by UniFi (e.g. "☠ UniFi Netwok 32")
                name: sysinfo.name,
                siteName: sysinfo.name,
                hostname: sysinfo.hostname,
                // Controller firmware / version information
                version: sysinfo.version,
                previousVersion: sysinfo.previous_version,
                updateAvailable: sysinfo.update_available === true,
                updateDownloaded: sysinfo.update_downloaded === true,
                unsupportedDeviceCount: typeof sysinfo.unsupported_device_count === 'number'
                    ? sysinfo.unsupported_device_count
                    : 0,
                // API mode (controller vs site-manager vs unifios)
                apiMode: apiMode,
                // Deployment type (unifios, controller, cloud, unknown)
                deploymentType: deploymentType,
                // Feature capabilities based on deployment type
                capabilities: {
                    trafficFlowsV2: deploymentType === 'unifios',   // POST /v2/api/site/{site}/traffic-flows
                    ipsEvents: deploymentType !== 'cloud',           // GET /api/s/{site}/stat/ips/event
                    portForwarding: deploymentType !== 'cloud',      // REST portforward
                    bandwidthHistory: true,                          // All modes
                    wanInterfaces: deploymentType !== 'cloud',       // Requires gateway device
                },
                // DHCP enabled on UniFi (from rest/networkconf dhcpd_enabled)
                dhcpEnabled: networkConf?.dhcpEnabled === true,
                // DHCP range on UniFi (from rest/networkconf dhcpd_start/dhcpd_stop)
                dhcpRange: networkConf?.dhcpRange,
                // NAT: rule count and gateway WAN/LAN port summary for dashboard
                natRulesCount: Array.isArray(portForwardRules) ? portForwardRules.length : 0,
                gatewaySummary: gatewaySummary,
                // Basic memory information if present
                memory: sysinfo.mem ? {
                    total: sysinfo.mem.total,
                    used: sysinfo.mem.used,
                    free: sysinfo.mem.free
                } : undefined,
                // Basic CPU information if present
                cpu: sysinfo.cpu ? {
                    usage: sysinfo.cpu.usage,
                    cores: sysinfo.cpu.cores
                } : undefined
            };

            // Build a minimal "sites" summary so the frontend can display a Sites tab
            const siteId = (this.config?.settings?.site as string) || 'default';
            const apsCount = normalizedDevices.filter((d: any) => {
                const type = (d.type || '').toString().toLowerCase();
                const model = (d.model || '').toString().toLowerCase();
                return (type === 'uap' ||
                    type.includes('uap') ||
                    type === 'accesspoint' ||
                    type === 'ap' ||
                    model.includes('uap') ||
                    model.includes('ap')) &&
                    type !== 'client';
            }).length;
            const switchesCount = normalizedDevices.filter((d: any) => {
                const type = (d.type || '').toString().toLowerCase();
                return type.startsWith('usw');
            }).length;
            const clientsCount = clientDevices.length;

            const sites = [{
                id: siteId,
                name: systemStats.name || siteId,
                hostname: systemStats.hostname,
                status: 'online',
                devices: {
                    total: allDevices.length,
                    aps: apsCount,
                    switches: switchesCount,
                    clients: clientsCount
                }
            }];

            return {
                devices: allDevices,
                network: networkStats,
                system: systemStats,
                sites,
                wlans: wlans // Add WiFi networks (SSIDs)
            };
        } catch (error) {
            logger.error('UniFiPlugin', 'Failed to get stats:', error);
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        // Let errors propagate so they can be caught and displayed to the user.
        // An enabled plugin relies on this session (dashboard, WebSocket, MCP): no logout after the test.
        return await this.apiService.testConnection({ keepSession: this.isEnabled() });
    }
}

