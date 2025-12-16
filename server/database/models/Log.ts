/**
 * Log model and database operations
 * 
 * Handles logging of user actions and system events
 */

import { getDatabase } from '../connection.js';

export interface Log {
    id: number;
    userId?: number;
    username?: string;
    pluginId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    level: 'info' | 'warning' | 'error';
    timestamp: Date;
}

export interface CreateLogInput {
    userId?: number;
    username?: string;
    pluginId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    level?: 'info' | 'warning' | 'error';
}

export interface LogFilters {
    userId?: number;
    pluginId?: string;
    action?: string;
    resource?: string;
    level?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}

/**
 * Log repository for database operations
 */
export class LogRepository {
    /**
     * Create a new log entry
     */
    static create(input: CreateLogInput): Log {
        const db = getDatabase();
        const stmt = db.prepare(`
            INSERT INTO logs (
                user_id, username, plugin_id, action, resource, resource_id,
                details, ip_address, user_agent, level
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            input.userId || null,
            input.username || null,
            input.pluginId || null,
            input.action,
            input.resource,
            input.resourceId || null,
            input.details ? JSON.stringify(input.details) : null,
            input.ipAddress || null,
            input.userAgent || null,
            input.level || 'info'
        );
        
        return this.findById(result.lastInsertRowid as number)!;
    }

    /**
     * Find log by ID
     */
    static findById(id: number): Log | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM logs WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            userId: row.user_id || undefined,
            username: row.username || undefined,
            pluginId: row.plugin_id || undefined,
            action: row.action,
            resource: row.resource,
            resourceId: row.resource_id || undefined,
            details: row.details ? JSON.parse(row.details) : undefined,
            ipAddress: row.ip_address || undefined,
            userAgent: row.user_agent || undefined,
            level: row.level,
            timestamp: new Date(row.timestamp)
        };
    }

    /**
     * Find logs with filters
     */
    static find(filters: LogFilters): Log[] {
        const db = getDatabase();
        const conditions: string[] = [];
        const values: any[] = [];
        
        if (filters.userId !== undefined) {
            conditions.push('user_id = ?');
            values.push(filters.userId);
        }
        if (filters.pluginId !== undefined) {
            conditions.push('plugin_id = ?');
            values.push(filters.pluginId);
        }
        if (filters.action !== undefined) {
            conditions.push('action = ?');
            values.push(filters.action);
        }
        if (filters.resource !== undefined) {
            conditions.push('resource = ?');
            values.push(filters.resource);
        }
        if (filters.level !== undefined) {
            conditions.push('level = ?');
            values.push(filters.level);
        }
        if (filters.startDate !== undefined) {
            conditions.push('timestamp >= ?');
            values.push(filters.startDate.toISOString());
        }
        if (filters.endDate !== undefined) {
            conditions.push('timestamp <= ?');
            values.push(filters.endDate.toISOString());
        }
        
        let query = 'SELECT * FROM logs';
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY timestamp DESC';
        
        if (filters.limit !== undefined) {
            query += ' LIMIT ?';
            values.push(filters.limit);
            if (filters.offset !== undefined) {
                query += ' OFFSET ?';
                values.push(filters.offset);
            }
        }
        
        const stmt = db.prepare(query);
        const rows = stmt.all(...values) as any[];
        
        return rows.map(row => ({
            id: row.id,
            userId: row.user_id || undefined,
            username: row.username || undefined,
            pluginId: row.plugin_id || undefined,
            action: row.action,
            resource: row.resource,
            resourceId: row.resource_id || undefined,
            details: row.details ? JSON.parse(row.details) : undefined,
            ipAddress: row.ip_address || undefined,
            userAgent: row.user_agent || undefined,
            level: row.level,
            timestamp: new Date(row.timestamp)
        }));
    }

    /**
     * Count logs with filters
     */
    static count(filters: Omit<LogFilters, 'limit' | 'offset'>): number {
        const db = getDatabase();
        const conditions: string[] = [];
        const values: any[] = [];
        
        if (filters.userId !== undefined) {
            conditions.push('user_id = ?');
            values.push(filters.userId);
        }
        if (filters.pluginId !== undefined) {
            conditions.push('plugin_id = ?');
            values.push(filters.pluginId);
        }
        if (filters.action !== undefined) {
            conditions.push('action = ?');
            values.push(filters.action);
        }
        if (filters.resource !== undefined) {
            conditions.push('resource = ?');
            values.push(filters.resource);
        }
        if (filters.level !== undefined) {
            conditions.push('level = ?');
            values.push(filters.level);
        }
        if (filters.startDate !== undefined) {
            conditions.push('timestamp >= ?');
            values.push(filters.startDate.toISOString());
        }
        if (filters.endDate !== undefined) {
            conditions.push('timestamp <= ?');
            values.push(filters.endDate.toISOString());
        }
        
        let query = 'SELECT COUNT(*) as count FROM logs';
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        const stmt = db.prepare(query);
        const result = stmt.get(...values) as { count: number };
        return result.count;
    }

    /**
     * Delete old logs (cleanup)
     */
    static deleteOld(daysToKeep: number): number {
        const db = getDatabase();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const stmt = db.prepare('DELETE FROM logs WHERE timestamp < ?');
        const result = stmt.run(cutoffDate.toISOString());
        return result.changes;
    }

    /**
     * Delete all logs
     */
    static deleteAll(): number {
        const db = getDatabase();
        const stmt = db.prepare('DELETE FROM logs');
        const result = stmt.run();
        return result.changes;
    }
}

