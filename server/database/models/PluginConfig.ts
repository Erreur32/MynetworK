/**
 * Plugin configuration model and database operations
 * 
 * Handles storage and retrieval of plugin configurations
 */

import { getDatabase } from '../connection.js';

export interface PluginConfig {
    id: number;
    pluginId: string;
    enabled: boolean;
    settings: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreatePluginConfigInput {
    pluginId: string;
    enabled?: boolean;
    settings?: Record<string, unknown>;
}

export interface UpdatePluginConfigInput {
    enabled?: boolean;
    settings?: Record<string, unknown>;
}

/**
 * Plugin configuration repository for database operations
 */
export class PluginConfigRepository {
    /**
     * Create or update plugin configuration
     */
    static upsert(input: CreatePluginConfigInput): PluginConfig {
        if (!input.pluginId) {
            throw new Error('pluginId is required');
        }
        
        const db = getDatabase();
        const stmt = db.prepare(`
            INSERT INTO plugin_configs (plugin_id, enabled, settings)
            VALUES (?, ?, ?)
            ON CONFLICT(plugin_id) DO UPDATE SET
                enabled = excluded.enabled,
                settings = excluded.settings,
                updated_at = CURRENT_TIMESTAMP
        `);
        
        stmt.run(
            input.pluginId,
            input.enabled ? 1 : 0,
            JSON.stringify(input.settings || {})
        );
        
        return this.findByPluginId(input.pluginId)!;
    }

    /**
     * Find configuration by plugin ID
     */
    static findByPluginId(pluginId: string): PluginConfig | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM plugin_configs WHERE plugin_id = ?');
        const row = stmt.get(pluginId) as any;
        
        if (!row) return null;
        
        let settings: Record<string, unknown>;
        try {
            settings = JSON.parse(row.settings);
        } catch (parseError) {
            console.error(`[PluginConfig] Failed to parse settings JSON for plugin ${pluginId}:`, parseError);
            settings = {};
        }
        
        // Debug logging for UniFi plugin
        if (pluginId === 'unifi' && settings) {
            const apiKey = settings.apiKey as string;
            const apiMode = settings.apiMode as string;
            console.log(`[PluginConfig] Loaded UniFi config - apiMode: ${apiMode}, apiKey type: ${typeof apiKey}, apiKey length: ${apiKey?.length || 0}, apiKey preview: ${apiKey ? (apiKey.length > 8 ? `${apiKey.substring(0, 8)}...` : '***') : 'N/A'}`);
            console.log(`[PluginConfig] Raw settings keys: ${Object.keys(settings).join(', ')}`);
        }
        
        return {
            id: row.id,
            pluginId: row.plugin_id,
            enabled: row.enabled === 1,
            settings: settings,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }

    /**
     * Get all plugin configurations
     */
    static findAll(): PluginConfig[] {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM plugin_configs ORDER BY plugin_id');
        const rows = stmt.all() as any[];
        
        return rows.map(row => ({
            id: row.id,
            pluginId: row.plugin_id,
            enabled: row.enabled === 1,
            settings: JSON.parse(row.settings),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        }));
    }

    /**
     * Update plugin configuration
     */
    static update(pluginId: string, input: UpdatePluginConfigInput): PluginConfig | null {
        const db = getDatabase();
        const updates: string[] = [];
        const values: any[] = [];
        
        if (input.enabled !== undefined) {
            updates.push('enabled = ?');
            values.push(input.enabled ? 1 : 0);
        }
        if (input.settings !== undefined) {
            updates.push('settings = ?');
            values.push(JSON.stringify(input.settings));
        }
        
        if (updates.length === 0) {
            return this.findByPluginId(pluginId);
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(pluginId);
        
        const stmt = db.prepare(`UPDATE plugin_configs SET ${updates.join(', ')} WHERE plugin_id = ?`);
        stmt.run(...values);
        
        return this.findByPluginId(pluginId);
    }

    /**
     * Delete plugin configuration
     */
    static delete(pluginId: string): boolean {
        const db = getDatabase();
        const stmt = db.prepare('DELETE FROM plugin_configs WHERE plugin_id = ?');
        const result = stmt.run(pluginId);
        return result.changes > 0;
    }
}

