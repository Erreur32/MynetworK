/**
 * LatencyMonitoring model and database operations
 * 
 * Handles storage and retrieval of latency monitoring configuration and measurements
 */

import { getDatabase } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface LatencyMonitoring {
    id: number;
    ip: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface LatencyMeasurement {
    id: number;
    ip: string;
    latency: number | null; // null if packet loss
    packetLoss: boolean;
    measuredAt: Date;
}

export interface LatencyStatistics {
    avg1h: number | null;
    max: number | null;
    min: number | null;
    avg24h: number | null;
    packetLossPercent: number;
    totalMeasurements: number;
}

export interface CreateLatencyMonitoringInput {
    ip: string;
    enabled?: boolean;
}

/**
 * LatencyMonitoring repository for database operations
 */
export class LatencyMonitoringRepository {
    /**
     * Enable monitoring for an IP address
     */
    static enableMonitoring(ip: string): LatencyMonitoring {
        const db = getDatabase();
        
        // Check if entry already exists
        const existing = db.prepare('SELECT * FROM latency_monitoring WHERE ip = ?').get(ip) as any;
        
        if (existing) {
            // Update existing entry
            const stmt = db.prepare(`
                UPDATE latency_monitoring 
                SET enabled = 1, updated_at = CURRENT_TIMESTAMP 
                WHERE ip = ?
            `);
            stmt.run(ip);
            
            return this.mapRowToLatencyMonitoring({
                ...existing,
                enabled: 1,
                updated_at: new Date().toISOString()
            });
        } else {
            // Create new entry
            const stmt = db.prepare(`
                INSERT INTO latency_monitoring (ip, enabled) 
                VALUES (?, 1)
            `);
            const result = stmt.run(ip);
            
            return this.findById(result.lastInsertRowid as number)!;
        }
    }

    /**
     * Disable monitoring for an IP address
     */
    static disableMonitoring(ip: string): void {
        const db = getDatabase();
        const stmt = db.prepare(`
            UPDATE latency_monitoring 
            SET enabled = 0, updated_at = CURRENT_TIMESTAMP 
            WHERE ip = ?
        `);
        stmt.run(ip);
    }

    /**
     * Check if monitoring is enabled for an IP
     */
    static isMonitoringEnabled(ip: string): boolean {
        const db = getDatabase();
        const stmt = db.prepare('SELECT enabled FROM latency_monitoring WHERE ip = ?');
        const row = stmt.get(ip) as any;
        return row ? row.enabled === 1 : false;
    }

    /**
     * Get all IPs with monitoring enabled
     */
    static getEnabledIps(): string[] {
        const db = getDatabase();
        const stmt = db.prepare('SELECT ip FROM latency_monitoring WHERE enabled = 1');
        const rows = stmt.all() as Array<{ ip: string }>;
        return rows.map(row => row.ip);
    }

    /**
     * Get monitoring status for multiple IPs
     */
    static getMonitoringStatusBatch(ips: string[]): Record<string, boolean> {
        if (ips.length === 0) return {};
        
        const db = getDatabase();
        const placeholders = ips.map(() => '?').join(',');
        const stmt = db.prepare(`
            SELECT ip, enabled FROM latency_monitoring 
            WHERE ip IN (${placeholders})
        `);
        const rows = stmt.all(...ips) as Array<{ ip: string; enabled: number }>;
        
        const result: Record<string, boolean> = {};
        ips.forEach(ip => {
            result[ip] = false; // Default to false
        });
        rows.forEach(row => {
            result[row.ip] = row.enabled === 1;
        });
        
        return result;
    }

    /**
     * Find monitoring entry by ID
     */
    static findById(id: number): LatencyMonitoring | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM latency_monitoring WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return this.mapRowToLatencyMonitoring(row);
    }

    /**
     * Find monitoring entry by IP
     */
    static findByIp(ip: string): LatencyMonitoring | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM latency_monitoring WHERE ip = ?');
        const row = stmt.get(ip) as any;
        
        if (!row) return null;
        
        return this.mapRowToLatencyMonitoring(row);
    }

    /**
     * Create a latency measurement
     */
    static createMeasurement(ip: string, latency: number | null, packetLoss: boolean): LatencyMeasurement {
        const db = getDatabase();
        const stmt = db.prepare(`
            INSERT INTO latency_measurements (ip, latency, packet_loss) 
            VALUES (?, ?, ?)
        `);
        const result = stmt.run(ip, latency, packetLoss ? 1 : 0);
        
        return this.findMeasurementById(result.lastInsertRowid as number)!;
    }

    /**
     * Get measurements for an IP within a time range
     */
    static getMeasurements(ip: string, days: number = 30): LatencyMeasurement[] {
        const db = getDatabase();
        const stmt = db.prepare(`
            SELECT * FROM latency_measurements 
            WHERE ip = ? AND measured_at >= datetime('now', '-' || ? || ' days')
            ORDER BY measured_at ASC
        `);
        const rows = stmt.all(ip, days) as any[];
        
        return rows.map(row => this.mapRowToLatencyMeasurement(row));
    }

    /**
     * Get simplified statistics (Avg1h, Max) for an IP
     */
    static getStatistics(ip: string): LatencyStatistics {
        const db = getDatabase();
        
        // Get measurements from last hour
        const stmt1h = db.prepare(`
            SELECT latency, packet_loss 
            FROM latency_measurements 
            WHERE ip = ? AND measured_at >= datetime('now', '-1 hour')
        `);
        const measurements1h = stmt1h.all(ip) as Array<{ latency: number | null; packet_loss: number }>;
        
        // Get all measurements for max calculation
        const stmtAll = db.prepare(`
            SELECT latency, packet_loss 
            FROM latency_measurements 
            WHERE ip = ?
        `);
        const allMeasurements = stmtAll.all(ip) as Array<{ latency: number | null; packet_loss: number }>;
        
        // Calculate statistics
        const validLatencies1h = measurements1h
            .filter(m => m.latency !== null && m.packet_loss === 0)
            .map(m => m.latency!);
        
        const validLatenciesAll = allMeasurements
            .filter(m => m.latency !== null && m.packet_loss === 0)
            .map(m => m.latency!);
        
        const packetLossCount = allMeasurements.filter(m => m.packet_loss === 1).length;
        const totalMeasurements = allMeasurements.length;
        
        const avg1h = validLatencies1h.length > 0
            ? validLatencies1h.reduce((sum, lat) => sum + lat, 0) / validLatencies1h.length
            : null;
        
        const max = validLatenciesAll.length > 0
            ? Math.max(...validLatenciesAll)
            : null;
        
        const min = validLatenciesAll.length > 0
            ? Math.min(...validLatenciesAll)
            : null;
        
        // Get 24h average
        const stmt24h = db.prepare(`
            SELECT latency 
            FROM latency_measurements 
            WHERE ip = ? AND measured_at >= datetime('now', '-24 hours') AND packet_loss = 0 AND latency IS NOT NULL
        `);
        const measurements24h = stmt24h.all(ip) as Array<{ latency: number }>;
        const avg24h = measurements24h.length > 0
            ? measurements24h.reduce((sum, m) => sum + m.latency, 0) / measurements24h.length
            : null;
        
        const packetLossPercent = totalMeasurements > 0
            ? (packetLossCount / totalMeasurements) * 100
            : 0;
        
        return {
            avg1h: avg1h !== null ? avg1h : null,
            max: max !== null ? max : null,
            min: min !== null ? min : null,
            avg24h: avg24h !== null ? avg24h : null,
            packetLossPercent: packetLossPercent,
            totalMeasurements
        };
    }

    /**
     * Get statistics for multiple IPs in batch
     */
    static getStatisticsBatch(ips: string[]): Record<string, { avg1h: number | null; max: number | null }> {
        const result: Record<string, { avg1h: number | null; max: number | null }> = {};
        
        ips.forEach(ip => {
            const stats = this.getStatistics(ip);
            result[ip] = {
                avg1h: stats.avg1h,
                max: stats.max
            };
        });
        
        return result;
    }

    /**
     * Find measurement by ID
     */
    static findMeasurementById(id: number): LatencyMeasurement | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM latency_measurements WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return this.mapRowToLatencyMeasurement(row);
    }

    /**
     * Delete old measurements (for purge)
     */
    static deleteOldMeasurements(days: number): number {
        const db = getDatabase();
        const stmt = db.prepare(`
            DELETE FROM latency_measurements 
            WHERE measured_at < datetime('now', '-' || ? || ' days')
        `);
        const result = stmt.run(days);
        return result.changes;
    }

    /**
     * Get count of measurements for an IP
     */
    static getMeasurementCount(ip: string): number {
        const db = getDatabase();
        const stmt = db.prepare('SELECT COUNT(*) as count FROM latency_measurements WHERE ip = ?');
        const row = stmt.get(ip) as any;
        return row ? row.count : 0;
    }

    /**
     * Map database row to LatencyMonitoring interface
     */
    private static mapRowToLatencyMonitoring(row: any): LatencyMonitoring {
        return {
            id: row.id,
            ip: row.ip,
            enabled: row.enabled === 1,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to LatencyMeasurement interface
     */
    private static mapRowToLatencyMeasurement(row: any): LatencyMeasurement {
        // Ensure latency is a number, not a string
        const latency = row.latency !== null && row.latency !== undefined 
            ? Number(row.latency) 
            : null;
        
        return {
            id: row.id,
            ip: row.ip,
            latency: latency,
            packetLoss: row.packet_loss === 1,
            measuredAt: new Date(row.measured_at)
        };
    }
}

