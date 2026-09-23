/**
 * UniFi per-client traffic history — background accumulation.
 *
 * Independent of any WebSocket client being connected (unlike the live "top
 * talkers" badges, which only sample while the dashboard is open). Polls
 * stat/sta every minute, computes the delta since the last poll per MAC, and
 * accumulates it into unifi_client_traffic_daily / unifi_client_traffic_totals.
 * Delta baselines live in memory only — a backend restart loses at most one
 * poll's worth of traffic per client, which is an acceptable trade-off for
 * not needing to persist per-MAC baselines.
 */

import { pluginManager } from './pluginManager.js';
import { UniFiClientTrafficRepository } from '../database/models/UniFiClientTraffic.js';
import { WiresharkVendorService } from './wiresharkVendorService.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = 60_000; // 1 minute — accumulation doesn't need live granularity
const DAILY_RETENTION_DAYS = 30; // per-day rows purged after this; all-time totals are never purged
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

class UniFiTrafficHistoryService {
    private pollInterval: NodeJS.Timeout | null = null;
    private purgeInterval: NodeJS.Timeout | null = null;
    private baselines: Map<string, { rxBytes: number; txBytes: number }> = new Map();

    start(): void {
        if (this.pollInterval) return;
        logger.info('UniFiTrafficHistory', 'Starting per-client traffic accumulation (60s)');

        this.pollInterval = setInterval(() => { this.poll().catch(() => {}); }, POLL_INTERVAL_MS);
        this.purgeInterval = setInterval(() => {
            const deleted = UniFiClientTrafficRepository.purgeDailyOlderThan(DAILY_RETENTION_DAYS);
            if (deleted > 0) logger.debug('UniFiTrafficHistory', `Purged ${deleted} old daily row(s)`);
        }, PURGE_INTERVAL_MS);

        // Prime immediately so we don't wait a full minute for the first sample
        this.poll().catch(() => {});
    }

    stop(): void {
        if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
        if (this.purgeInterval) { clearInterval(this.purgeInterval); this.purgeInterval = null; }
    }

    private async poll(): Promise<void> {
        const unifiPlugin = pluginManager.getPlugin('unifi') as any;
        if (!unifiPlugin || !unifiPlugin.isEnabled?.() || typeof unifiPlugin.getApiService !== 'function') return;

        try {
            const clients = await unifiPlugin.getApiService().getClients();
            const seenMacs = new Set<string>();

            for (const client of clients) {
                const mac = (client.mac || '').toString().toLowerCase();
                if (!mac) continue;
                seenMacs.add(mac);

                // Some controllers report wired clients' cumulative counters under
                // 'wired-rx_bytes'/'wired-tx_bytes' instead of the plain fields — fall back to
                // those when present so wired devices aren't silently excluded from tracking.
                const rxBytes = Number(client.rx_bytes) || Number(client['wired-rx_bytes']) || 0;
                const txBytes = Number(client.tx_bytes) || Number(client['wired-tx_bytes']) || 0;
                if (rxBytes === 0 && txBytes === 0) continue;

                const baseline = this.baselines.get(mac);
                if (!baseline || rxBytes < baseline.rxBytes || txBytes < baseline.txBytes) {
                    // First sighting or counter reset (reconnect/roam) — establish a fresh
                    // baseline, no delta this tick (avoids counting pre-existing session bytes).
                    this.baselines.set(mac, { rxBytes, txBytes });
                    continue;
                }

                const deltaRx = rxBytes - baseline.rxBytes;
                const deltaTx = txBytes - baseline.txBytes;
                this.baselines.set(mac, { rxBytes, txBytes });
                if (deltaRx <= 0 && deltaTx <= 0) continue;

                const vendor = mac.length >= 8 ? WiresharkVendorService.lookupVendor(mac.slice(0, 8)) : null;
                UniFiClientTrafficRepository.addDelta({
                    mac,
                    name: client.name || client.hostname || client.ip || mac,
                    ip: client.ip,
                    vendor,
                    deltaRx,
                    deltaTx
                });
            }

            // Forget baselines for clients no longer seen — avoids unbounded growth over time
            for (const mac of this.baselines.keys()) {
                if (!seenMacs.has(mac)) this.baselines.delete(mac);
            }
        } catch (error) {
            logger.debug('UniFiTrafficHistory', 'poll failed:', error);
        }
    }
}

export const unifiTrafficHistoryService = new UniFiTrafficHistoryService();
