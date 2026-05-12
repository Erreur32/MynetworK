/**
 * UniFi device port-table snapshot model.
 *
 * Stores the most recent live `port_table` (as raw JSON, exactly as returned
 * by the UniFi controller) and the local-uplink port indices, keyed by the
 * device MAC. Used by topologyService.ts to replay the port grid when the
 * device is offline at scan time — without this, an offline switch would
 * either disappear from the topology card or render with no port grid at all.
 *
 * One row per UniFi infra device; upserted on every successful poll where a
 * non-empty port_table is present.
 */

import { getDatabase } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface UniFiDeviceSnapshot {
    mac: string;
    model?: string;
    portTable: Array<Record<string, unknown>>;
    localUplinkPortIdxs: number[];
    capturedAt: Date;
}

interface UniFiDeviceSnapshotRow {
    mac: string;
    model: string | null;
    port_table_json: string;
    local_uplink_port_idxs_json: string | null;
    captured_at: string;
}

function parseRow(row: UniFiDeviceSnapshotRow): UniFiDeviceSnapshot | null {
    try {
        const portTable = JSON.parse(row.port_table_json);
        if (!Array.isArray(portTable)) return null;
        const uplinks = row.local_uplink_port_idxs_json
            ? JSON.parse(row.local_uplink_port_idxs_json)
            : [];
        return {
            mac: row.mac,
            model: row.model ?? undefined,
            portTable,
            localUplinkPortIdxs: Array.isArray(uplinks) ? uplinks.filter((x): x is number => typeof x === 'number') : [],
            capturedAt: new Date(row.captured_at)
        };
    } catch (err) {
        // Snapshot row exists but its JSON is corrupt — log and treat as miss.
        // Don't throw: a missing snapshot just degrades to "no ports" rendering.
        logger.warn('UniFiDeviceSnapshot', `Corrupt snapshot row for mac=${row.mac}: ${(err as Error).message}`);
        return null;
    }
}

export class UniFiDeviceSnapshotRepository {
    /**
     * Insert or replace the snapshot for this MAC. Called every time UniFi
     * returns a non-empty port_table for the device so the cache always
     * reflects the latest known port layout.
     */
    static upsert(input: {
        mac: string;
        model?: string;
        portTable: Array<Record<string, unknown>>;
        localUplinkPortIdxs: number[];
    }): void {
        try {
            const db = getDatabase();
            db.prepare(`
                INSERT INTO unifi_device_snapshots (mac, model, port_table_json, local_uplink_port_idxs_json, captured_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(mac) DO UPDATE SET
                    model = excluded.model,
                    port_table_json = excluded.port_table_json,
                    local_uplink_port_idxs_json = excluded.local_uplink_port_idxs_json,
                    captured_at = excluded.captured_at
            `).run(
                input.mac,
                input.model ?? null,
                JSON.stringify(input.portTable),
                JSON.stringify(input.localUplinkPortIdxs)
            );
        } catch (err) {
            // Cache write is best-effort: a failed snapshot just means we
            // can't replay this device offline. Never let it break a topology
            // build — log and move on.
            logger.error('UniFiDeviceSnapshot', `Upsert failed for mac=${input.mac}: ${(err as Error).message}`);
        }
    }

    static findByMac(mac: string): UniFiDeviceSnapshot | null {
        const db = getDatabase();
        const row = db.prepare(`
            SELECT mac, model, port_table_json, local_uplink_port_idxs_json, captured_at
            FROM unifi_device_snapshots
            WHERE mac = ?
        `).get(mac) as UniFiDeviceSnapshotRow | undefined;
        return row ? parseRow(row) : null;
    }

    /** Bulk fetch: returns a Map keyed by MAC of every cached snapshot.
     *  Topology rebuilds call this once at the start of UniFi collection so
     *  the offline-replay branch can do O(1) lookups instead of N indexed
     *  SELECTs (one per offline device). The table is one row per UniFi
     *  device — small enough that a full scan beats per-MAC queries. */
    static findAll(): Map<string, UniFiDeviceSnapshot> {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT mac, model, port_table_json, local_uplink_port_idxs_json, captured_at
            FROM unifi_device_snapshots
        `).all() as UniFiDeviceSnapshotRow[];
        const out = new Map<string, UniFiDeviceSnapshot>();
        for (const row of rows) {
            const parsed = parseRow(row);
            if (parsed) out.set(parsed.mac, parsed);
        }
        return out;
    }
}
