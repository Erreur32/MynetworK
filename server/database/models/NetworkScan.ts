/**
 * NetworkScan model and database operations
 * 
 * Handles storage and retrieval of network scan results (IP addresses discovered on the local network)
 */

import { getDatabase } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface NetworkScan {
    id: number;
    ip: string;
    mac?: string;
    hostname?: string;
    vendor?: string;
    status: 'online' | 'offline' | 'unknown';
    pingLatency?: number; // Latency in milliseconds
    firstSeen: Date;
    lastSeen: Date;
    scanCount: number;
    additionalInfo?: Record<string, unknown>; // JSON for additional information
}

export interface CreateNetworkScanInput {
    ip: string;
    mac?: string;
    hostname?: string;
    vendor?: string;
    status?: 'online' | 'offline' | 'unknown';
    pingLatency?: number;
    additionalInfo?: Record<string, unknown>;
}

export interface NetworkScanFilters {
    status?: 'online' | 'offline' | 'unknown';
    ip?: string; // Partial IP match (e.g., "192.168.1")
    search?: string; // Search in IP, MAC, or hostname
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    sortBy?: 'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency' | 'hostname' | 'mac' | 'vendor';
    sortOrder?: 'asc' | 'desc';
}

/**
 * NetworkScan repository for database operations
 */
export class NetworkScanRepository {
    /**
     * Create or update a network scan entry
     * If IP already exists, updates the entry; otherwise creates a new one
     */
    static upsert(input: CreateNetworkScanInput): NetworkScan {
        const db = getDatabase();
        
        // Check if IP already exists
        const existing = this.findByIp(input.ip);
        
        if (existing) {
            // Update existing entry
            return this.update(input.ip, {
                mac: input.mac,
                hostname: input.hostname,
                vendor: input.vendor,
                status: input.status,
                pingLatency: input.pingLatency,
                additionalInfo: input.additionalInfo,
                lastSeen: new Date(),
                scanCount: existing.scanCount + 1
            })!;
        } else {
            // Create new entry
            return this.create(input);
        }
    }

    /**
     * Create a new network scan entry
     */
    static create(input: CreateNetworkScanInput): NetworkScan {
        const db = getDatabase();
        const stmt = db.prepare(`
            INSERT INTO network_scans (
                ip, mac, hostname, vendor, status, ping_latency, additional_info
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            input.ip,
            input.mac || null,
            input.hostname || null,
            input.vendor || null,
            input.status || 'unknown',
            input.pingLatency || null,
            input.additionalInfo ? JSON.stringify(input.additionalInfo) : null
        );
        
        return this.findById(result.lastInsertRowid as number)!;
    }

    /**
     * Find network scan by ID
     */
    static findById(id: number): NetworkScan | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM network_scans WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return this.mapRowToNetworkScan(row);
    }

    /**
     * Find network scan by IP address
     */
    static findByIp(ip: string): NetworkScan | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM network_scans WHERE ip = ?');
        const row = stmt.get(ip) as any;
        
        if (!row) return null;
        
        return this.mapRowToNetworkScan(row);
    }

    /**
     * Find network scans with filters
     */
    static find(filters: NetworkScanFilters = {}): NetworkScan[] {
        const db = getDatabase();
        const conditions: string[] = [];
        const values: any[] = [];
        
        if (filters.status !== undefined) {
            conditions.push('status = ?');
            values.push(filters.status);
        }
        
        if (filters.ip !== undefined) {
            conditions.push('ip LIKE ?');
            values.push(`${filters.ip}%`);
        }
        
        if (filters.search !== undefined) {
            conditions.push('(ip LIKE ? OR mac LIKE ? OR hostname LIKE ?)');
            const searchPattern = `%${filters.search}%`;
            values.push(searchPattern, searchPattern, searchPattern);
        }
        
        if (filters.startDate !== undefined) {
            conditions.push('last_seen >= ?');
            values.push(filters.startDate.toISOString());
        }
        
        if (filters.endDate !== undefined) {
            conditions.push('last_seen <= ?');
            values.push(filters.endDate.toISOString());
        }
        
        let query = 'SELECT * FROM network_scans';
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        // Sorting - for IP, we'll sort in JavaScript for proper numeric IPv4 sorting
        const sortBy = filters.sortBy || 'last_seen';
        const sortOrder = filters.sortOrder || 'desc';
        
        // For IP and hostname sorting, we need to fetch ALL results first, sort them, then paginate
        // IP: needs numeric sorting (192.168.1.1 before 192.168.1.100)
        // Hostname: needs to put empty/null/-- values at the end
        // For other columns, SQL ORDER BY works fine and can be done before LIMIT
        const needsJavaScriptSorting = sortBy === 'ip' || sortBy === 'hostname' || sortBy === 'mac' || sortBy === 'vendor';
        
        if (!needsJavaScriptSorting) {
            // For non-IP sorting, use SQL ORDER BY (more efficient)
            query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
        }
        
        // For IP sorting, we need to fetch all results first (no LIMIT yet)
        // For other sorting, we can apply LIMIT directly in SQL
        if (!needsJavaScriptSorting && filters.limit !== undefined) {
            query += ' LIMIT ?';
            values.push(filters.limit);
            if (filters.offset !== undefined) {
                query += ' OFFSET ?';
                values.push(filters.offset);
            }
        }
        
        const stmt = db.prepare(query);
        const rows = stmt.all(...values) as any[];
        
        let results = rows.map(row => this.mapRowToNetworkScan(row));
        
        // Special handling for custom sorting: IP (numeric), hostname/mac/vendor (empty values at end)
        // IMPORTANT: This must be done on ALL results before pagination
        if (needsJavaScriptSorting) {
            if (sortBy === 'ip') {
                // IP sorting: proper numeric IPv4 sorting
                // This ensures 192.168.1.1 comes before 192.168.1.100 (not lexicographically)
                const parseIp = (ip: string): number => {
                    const parts = ip.split('.').map(p => parseInt(p, 10));
                    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
                        return 0; // Invalid IP, sort to beginning
                    }
                    // Convert IP to numeric value: 192.168.1.1 -> 192168001001
                    return parts[0] * 1000000000 + parts[1] * 1000000 + parts[2] * 1000 + parts[3];
                };
                
                // Sort ALL results first
                results.sort((a, b) => {
                    const aVal = parseIp(a.ip);
                    const bVal = parseIp(b.ip);
                    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                });
            } else if (sortBy === 'hostname' || sortBy === 'mac' || sortBy === 'vendor') {
                // Hostname/MAC/Vendor sorting: put empty/null/-- values at the end
                const getValue = (item: NetworkScan): string => {
                    let value: string | undefined;
                    if (sortBy === 'hostname') value = item.hostname;
                    else if (sortBy === 'mac') value = item.mac;
                    else if (sortBy === 'vendor') value = item.vendor;
                    
                    // Treat empty, null, undefined, or '--' as empty
                    if (!value || value.trim() === '' || value.trim() === '--') {
                        return ''; // Will be sorted to end
                    }
                    return value.toLowerCase();
                };
                
                // Sort ALL results first
                results.sort((a, b) => {
                    const aVal = getValue(a);
                    const bVal = getValue(b);
                    
                    // Empty values go to the end
                    if (aVal === '' && bVal !== '') return 1; // a goes after b
                    if (aVal !== '' && bVal === '') return -1; // a goes before b
                    if (aVal === '' && bVal === '') return 0; // both empty, keep order
                    
                    // Both have values, sort alphabetically
                    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
                    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
                    return 0;
                });
            }
            
            // Apply pagination AFTER sorting all results
            if (filters.offset !== undefined || filters.limit !== undefined) {
                const offset = filters.offset || 0;
                const limit = filters.limit;
                if (limit !== undefined) {
                    results = results.slice(offset, offset + limit);
                } else if (offset > 0) {
                    results = results.slice(offset);
                }
            }
        }
        
        return results;
    }

    /**
     * Count network scans with filters
     */
    static count(filters: Omit<NetworkScanFilters, 'limit' | 'offset' | 'sortBy' | 'sortOrder'> = {}): number {
        const db = getDatabase();
        const conditions: string[] = [];
        const values: any[] = [];
        
        if (filters.status !== undefined) {
            conditions.push('status = ?');
            values.push(filters.status);
        }
        
        if (filters.ip !== undefined) {
            conditions.push('ip LIKE ?');
            values.push(`${filters.ip}%`);
        }
        
        if (filters.search !== undefined) {
            conditions.push('(ip LIKE ? OR mac LIKE ? OR hostname LIKE ?)');
            const searchPattern = `%${filters.search}%`;
            values.push(searchPattern, searchPattern, searchPattern);
        }
        
        if (filters.startDate !== undefined) {
            conditions.push('last_seen >= ?');
            values.push(filters.startDate.toISOString());
        }
        
        if (filters.endDate !== undefined) {
            conditions.push('last_seen <= ?');
            values.push(filters.endDate.toISOString());
        }
        
        let query = 'SELECT COUNT(*) as count FROM network_scans';
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        const stmt = db.prepare(query);
        const result = stmt.get(...values) as { count: number };
        return result.count;
    }

    /**
     * Update a network scan entry
     */
    static update(ip: string, updates: Partial<Omit<NetworkScan, 'id' | 'ip'>>): NetworkScan | null {
        const db = getDatabase();
        const existing = this.findByIp(ip);
        
        if (!existing) return null;
        
        const updateFields: string[] = [];
        const values: any[] = [];
        
        if (updates.mac !== undefined) {
            updateFields.push('mac = ?');
            values.push(updates.mac || null);
        }
        if (updates.hostname !== undefined) {
            updateFields.push('hostname = ?');
            values.push(updates.hostname || null);
        }
        if (updates.vendor !== undefined) {
            updateFields.push('vendor = ?');
            values.push(updates.vendor || null);
        }
        if (updates.status !== undefined) {
            updateFields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.pingLatency !== undefined) {
            updateFields.push('ping_latency = ?');
            values.push(updates.pingLatency || null);
        }
        if (updates.firstSeen !== undefined) {
            updateFields.push('first_seen = ?');
            values.push(updates.firstSeen.toISOString());
        }
        if (updates.lastSeen !== undefined) {
            updateFields.push('last_seen = ?');
            values.push(updates.lastSeen.toISOString());
        }
        if (updates.scanCount !== undefined) {
            updateFields.push('scan_count = ?');
            values.push(updates.scanCount);
        }
        if (updates.additionalInfo !== undefined) {
            updateFields.push('additional_info = ?');
            values.push(updates.additionalInfo ? JSON.stringify(updates.additionalInfo) : null);
        }
        
        if (updateFields.length === 0) {
            return existing;
        }
        
        values.push(ip);
        const query = `UPDATE network_scans SET ${updateFields.join(', ')} WHERE ip = ?`;
        const stmt = db.prepare(query);
        stmt.run(...values);
        
        return this.findByIp(ip);
    }

    /**
     * Delete a network scan entry by IP
     */
    static delete(ip: string): boolean {
        const db = getDatabase();
        const stmt = db.prepare('DELETE FROM network_scans WHERE ip = ?');
        const result = stmt.run(ip);
        return result.changes > 0;
    }

    /**
     * Delete all network scan entries
     */
    static deleteAll(): number {
        const db = getDatabase();
        const stmt = db.prepare('DELETE FROM network_scans');
        const result = stmt.run();
        return result.changes;
    }

    /**
     * Get statistics about network scans
     */
    static getStats(): {
        total: number;
        online: number;
        offline: number;
        unknown: number;
    } {
        const db = getDatabase();
        
        const totalStmt = db.prepare('SELECT COUNT(*) as count FROM network_scans');
        const totalResult = totalStmt.get() as { count: number };
        
        const onlineStmt = db.prepare('SELECT COUNT(*) as count FROM network_scans WHERE status = ?');
        const onlineResult = onlineStmt.get('online') as { count: number };
        
        const offlineStmt = db.prepare('SELECT COUNT(*) as count FROM network_scans WHERE status = ?');
        const offlineResult = offlineStmt.get('offline') as { count: number };
        
        const unknownStmt = db.prepare('SELECT COUNT(*) as count FROM network_scans WHERE status = ?');
        const unknownResult = unknownStmt.get('unknown') as { count: number };
        
        return {
            total: totalResult.count,
            online: onlineResult.count,
            offline: offlineResult.count,
            unknown: unknownResult.count
        };
    }

    /**
     * Get the most recent scan timestamp
     */
    static getLastScanDate(): Date | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT MAX(last_seen) as last_scan FROM network_scans');
        const result = stmt.get() as { last_scan: string | null };
        
        if (!result.last_scan) return null;
        return new Date(result.last_scan);
    }

    /**
     * Get historical statistics with fine granularity (by scan time, not by hour)
     * Returns an array of stats for each scan period (grouped by 15-minute intervals)
     * Uses network_scan_history table to get real historical data
     * This provides better visualization with proportional bars
     */
    static getHistoricalStats(hours: number = 24): Array<{
        time: string;
        total: number;
        online: number;
        offline: number;
    }> {
        const db = getDatabase();
        const now = new Date();
        const startDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
        
        // Use network_scan_history table to get real historical data
        // Group by 15-minute intervals for better granularity (instead of hourly)
        // This allows us to see changes between scans (e.g., refresh every 30 min)
        const stmt = db.prepare(`
            SELECT 
                strftime('%Y-%m-%d %H:%M', seen_at) as time_slot,
                COUNT(DISTINCT ip) as total,
                COUNT(DISTINCT CASE WHEN status = 'online' THEN ip END) as online,
                COUNT(DISTINCT CASE WHEN status = 'offline' THEN ip END) as offline
            FROM network_scan_history
            WHERE seen_at >= ?
            GROUP BY strftime('%Y-%m-%d %H', seen_at), (CAST(strftime('%M', seen_at) AS INTEGER) / 15)
            ORDER BY time_slot ASC
        `);
        
        const rows = stmt.all(startDate.toISOString()) as Array<{
            time_slot: string;
            total: number;
            online: number;
            offline: number;
        }>;
        
        // Convert to result format
        const result: Array<{
            time: string;
            total: number;
            online: number;
            offline: number;
        }> = [];
        
        rows.forEach(row => {
            if (row.time_slot) {
                // Parse the time slot and format it nicely
                const date = new Date(row.time_slot + ':00');
                result.push({
                    time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                    total: row.total || 0,
                    online: row.online || 0,
                    offline: row.offline || 0
                });
            }
        });
        
        // If we have very few data points, limit to last 48 entries (roughly 12 hours at 15-min intervals)
        // This ensures the graph shows recent activity
        if (result.length > 48) {
            return result.slice(-48);
        }
        
        return result;
    }

    /**
     * Add a history entry for when an IP was seen
     * Records each occurrence of an IP being scanned
     */
    static addHistoryEntry(ip: string, status: 'online' | 'offline' | 'unknown', pingLatency?: number): void {
        const db = getDatabase();
        try {
            const stmt = db.prepare(`
                INSERT INTO network_scan_history (ip, status, ping_latency, seen_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `);
            stmt.run(ip, status, pingLatency || null);
        } catch (error) {
            // Log error but don't throw - history is optional
            logger.error('NetworkScanRepository', `Failed to add history entry for ${ip}:`, error);
        }
    }

    /**
     * Map database row to NetworkScan interface
     */
    private static mapRowToNetworkScan(row: any): NetworkScan {
        return {
            id: row.id,
            ip: row.ip,
            mac: row.mac || undefined,
            hostname: row.hostname || undefined,
            vendor: row.vendor || undefined,
            status: row.status as 'online' | 'offline' | 'unknown',
            pingLatency: row.ping_latency || undefined,
            firstSeen: new Date(row.first_seen),
            lastSeen: new Date(row.last_seen),
            scanCount: row.scan_count,
            additionalInfo: row.additional_info ? JSON.parse(row.additional_info) : undefined
        };
    }
}

