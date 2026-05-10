/**
 * Topology node position repository.
 *
 * Persists user-driven manual placements so the layout survives reloads.
 * One row per node; an empty table means "everything goes back to dagre".
 */

import { getDatabase, checkpointWAL } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface NodePosition {
    nodeId: string;
    x: number;
    y: number;
}

interface PositionRow {
    node_id: string;
    x: number;
    y: number;
}

export class TopologyNodePositionRepository {
    static getAll(): Map<string, { x: number; y: number }> {
        const map = new Map<string, { x: number; y: number }>();
        try {
            const db = getDatabase();
            const rows = db
                .prepare('SELECT node_id, x, y FROM topology_node_positions')
                .all() as PositionRow[];
            for (const row of rows) {
                map.set(row.node_id, { x: row.x, y: row.y });
            }
        } catch (error) {
            logger.error('TopologyNodePosition', 'Failed to load positions:', error);
        }
        return map;
    }

    static set(nodeId: string, x: number, y: number): boolean {
        try {
            const db = getDatabase();
            db.prepare(`
                INSERT INTO topology_node_positions (node_id, x, y, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(node_id) DO UPDATE SET
                    x = excluded.x,
                    y = excluded.y,
                    updated_at = CURRENT_TIMESTAMP
            `).run(nodeId, x, y);
            checkpointWAL();
            return true;
        } catch (error) {
            logger.error('TopologyNodePosition', `Failed to save position for ${nodeId}:`, error);
            return false;
        }
    }

    static setMany(positions: NodePosition[]): boolean {
        try {
            const db = getDatabase();
            const stmt = db.prepare(`
                INSERT INTO topology_node_positions (node_id, x, y, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(node_id) DO UPDATE SET
                    x = excluded.x,
                    y = excluded.y,
                    updated_at = CURRENT_TIMESTAMP
            `);
            const tx = db.transaction((items: NodePosition[]) => {
                for (const p of items) stmt.run(p.nodeId, p.x, p.y);
            });
            tx(positions);
            checkpointWAL();
            return true;
        } catch (error) {
            logger.error('TopologyNodePosition', 'Failed to save positions batch:', error);
            return false;
        }
    }

    static clear(): boolean {
        try {
            const db = getDatabase();
            db.prepare('DELETE FROM topology_node_positions').run();
            checkpointWAL();
            return true;
        } catch (error) {
            logger.error('TopologyNodePosition', 'Failed to clear positions:', error);
            return false;
        }
    }
}
