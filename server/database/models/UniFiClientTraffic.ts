/**
 * UniFi per-client traffic accumulation model.
 *
 * Fed by unifiTrafficHistoryService.ts, which polls stat/sta every 30s and
 * adds the positive delta (bytes transferred since the last poll) to both
 * today's row (unifi_client_traffic_daily) and the running all-time total
 * (unifi_client_traffic_totals). Counter resets (client reconnect/roam) are
 * handled upstream — only positive deltas ever reach this repository.
 */

import { getDatabase } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface UniFiClientTrafficEntry {
    mac: string;
    name: string;
    ip?: string;
    vendor?: string | null;
    rxBytes: number;
    txBytes: number;
}

interface TrafficRow {
    mac: string;
    name: string | null;
    ip: string | null;
    vendor: string | null;
    rx_bytes: number;
    tx_bytes: number;
}

function mapRow(row: TrafficRow): UniFiClientTrafficEntry {
    return {
        mac: row.mac,
        name: row.name || row.mac,
        ip: row.ip ?? undefined,
        vendor: row.vendor,
        rxBytes: row.rx_bytes,
        txBytes: row.tx_bytes
    };
}

export class UniFiClientTrafficRepository {
    /** Adds a positive delta to both today's row and the all-time total for this client. */
    static addDelta(input: {
        mac: string;
        name: string;
        ip?: string;
        vendor?: string | null;
        deltaRx: number;
        deltaTx: number;
    }): void {
        if (input.deltaRx <= 0 && input.deltaTx <= 0) return;

        try {
            const db = getDatabase();
            const today = new Date().toISOString().slice(0, 10);

            db.prepare(`
                INSERT INTO unifi_client_traffic_daily (mac, date, name, ip, vendor, rx_bytes, tx_bytes, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(mac, date) DO UPDATE SET
                    name = excluded.name,
                    ip = excluded.ip,
                    vendor = excluded.vendor,
                    rx_bytes = rx_bytes + excluded.rx_bytes,
                    tx_bytes = tx_bytes + excluded.tx_bytes,
                    updated_at = CURRENT_TIMESTAMP
            `).run(input.mac, today, input.name, input.ip ?? null, input.vendor ?? null, input.deltaRx, input.deltaTx);

            db.prepare(`
                INSERT INTO unifi_client_traffic_totals (mac, name, ip, vendor, rx_bytes, tx_bytes, first_seen, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(mac) DO UPDATE SET
                    name = excluded.name,
                    ip = excluded.ip,
                    vendor = excluded.vendor,
                    rx_bytes = rx_bytes + excluded.rx_bytes,
                    tx_bytes = tx_bytes + excluded.tx_bytes,
                    updated_at = CURRENT_TIMESTAMP
            `).run(input.mac, input.name, input.ip ?? null, input.vendor ?? null, input.deltaRx, input.deltaTx);
        } catch (err) {
            logger.error('UniFiClientTraffic', `addDelta failed for mac=${input.mac}: ${(err as Error).message}`);
        }
    }

    static getTopToday(limit = 10): UniFiClientTrafficEntry[] {
        try {
            const db = getDatabase();
            const today = new Date().toISOString().slice(0, 10);
            const rows = db.prepare(`
                SELECT mac, name, ip, vendor, rx_bytes, tx_bytes
                FROM unifi_client_traffic_daily
                WHERE date = ?
                ORDER BY (rx_bytes + tx_bytes) DESC
                LIMIT ?
            `).all(today, limit) as TrafficRow[];
            return rows.map(mapRow);
        } catch (err) {
            logger.error('UniFiClientTraffic', `getTopToday failed: ${(err as Error).message}`);
            return [];
        }
    }

    static getTopAllTime(limit = 10): UniFiClientTrafficEntry[] {
        try {
            const db = getDatabase();
            const rows = db.prepare(`
                SELECT mac, name, ip, vendor, rx_bytes, tx_bytes
                FROM unifi_client_traffic_totals
                ORDER BY (rx_bytes + tx_bytes) DESC
                LIMIT ?
            `).all(limit) as TrafficRow[];
            return rows.map(mapRow);
        } catch (err) {
            logger.error('UniFiClientTraffic', `getTopAllTime failed: ${(err as Error).message}`);
            return [];
        }
    }

    /** Batch lookup of today's accumulated traffic for a set of MACs (network-scan table columns). */
    static getTodayByMacs(macs: string[]): Record<string, { rxBytes: number; txBytes: number } | null> {
        const normalized = macs.map((mac) => mac.toLowerCase().trim());
        const result: Record<string, { rxBytes: number; txBytes: number } | null> = {};
        for (const mac of normalized) result[mac] = null;
        if (normalized.length === 0) return result;

        try {
            const db = getDatabase();
            const today = new Date().toISOString().slice(0, 10);
            const placeholders = normalized.map(() => '?').join(',');
            const rows = db.prepare(`
                SELECT mac, rx_bytes, tx_bytes
                FROM unifi_client_traffic_daily
                WHERE date = ? AND mac IN (${placeholders})
            `).all(today, ...normalized) as Pick<TrafficRow, 'mac' | 'rx_bytes' | 'tx_bytes'>[];

            for (const row of rows) {
                result[row.mac] = { rxBytes: row.rx_bytes, txBytes: row.tx_bytes };
            }
        } catch (err) {
            logger.error('UniFiClientTraffic', `getTodayByMacs failed: ${(err as Error).message}`);
        }
        return result;
    }

    /** Deletes daily rows older than `days`. The all-time totals table is never purged. */
    static purgeDailyOlderThan(days: number): number {
        try {
            const db = getDatabase();
            const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
            const result = db.prepare(`DELETE FROM unifi_client_traffic_daily WHERE date < ?`).run(cutoff);
            return result.changes;
        } catch (err) {
            logger.error('UniFiClientTraffic', `purgeDailyOlderThan failed: ${(err as Error).message}`);
            return 0;
        }
    }
}
