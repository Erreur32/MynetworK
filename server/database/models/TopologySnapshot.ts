/**
 * Topology snapshot repository
 *
 * Single-row table (id = 1 enforced via CHECK). The graph is recomputed on
 * demand and via daily cron — there is no history kept on purpose.
 */

import { getDatabase, checkpointWAL } from '../connection.js';
import { logger } from '../../utils/logger.js';
import type { TopologyGraph } from '../../types/topology.js';

interface SnapshotRow {
    graph_json: string;
    computed_at: string;
}

export class TopologySnapshotRepository {
    static get(): TopologyGraph | null {
        try {
            const db = getDatabase();
            const row = db
                .prepare('SELECT graph_json, computed_at FROM topology_snapshots WHERE id = 1')
                .get() as SnapshotRow | undefined;
            if (!row) return null;
            const graph = JSON.parse(row.graph_json) as TopologyGraph;
            return graph;
        } catch (error) {
            logger.error('TopologySnapshot', 'Failed to read snapshot:', error);
            return null;
        }
    }

    static save(graph: TopologyGraph): boolean {
        try {
            const db = getDatabase();
            const stmt = db.prepare(`
                INSERT INTO topology_snapshots (id, graph_json, computed_at)
                VALUES (1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    graph_json = excluded.graph_json,
                    computed_at = CURRENT_TIMESTAMP
            `);
            stmt.run(JSON.stringify(graph));
            checkpointWAL();
            return true;
        } catch (error) {
            logger.error('TopologySnapshot', 'Failed to save snapshot:', error);
            return false;
        }
    }
}
