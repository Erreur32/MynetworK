/**
 * App Configuration Repository
 * 
 * Manages application-wide configuration settings stored in app_config table
 * Used for settings like PUBLIC_URL, timezone, language, etc.
 */

import { getDatabase, checkpointWAL } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface AppConfig {
    key: string;
    value: string;
    updated_at: string;
}

export class AppConfigRepository {
    /**
     * Get a configuration value by key
     */
    static get(key: string): string | null {
        try {
            const db = getDatabase();
            if (!db) {
                logger.error('AppConfig', 'Database not initialized');
                return null;
            }

            const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined;
            return row?.value || null;
        } catch (error) {
            logger.error('AppConfig', `Failed to get config ${key}:`, error);
            return null;
        }
    }

    /**
     * Set a configuration value
     * Forces a WAL checkpoint after saving to ensure persistence in Docker environments
     */
    static set(key: string, value: string): boolean {
        try {
            const db = getDatabase();
            if (!db) {
                logger.error('AppConfig', 'Database not initialized');
                return false;
            }

            const stmt = db.prepare(`
                INSERT INTO app_config (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `);
            
            const result = stmt.run(key, value);
            
            // Verify the write was successful
            if (result.changes === 0) {
                logger.warn('AppConfig', `No changes made when setting config ${key}`);
                return false;
            }

            // Force WAL checkpoint to ensure changes are persisted (important in Docker)
            checkpointWAL();

            // Verify the value was actually saved by reading it back
            const savedValue = this.get(key);
            if (savedValue !== value) {
                logger.error('AppConfig', `Config ${key} was not saved correctly. Expected: ${value}, Got: ${savedValue}`);
                return false;
            }

            logger.debug('AppConfig', `Config ${key} saved and verified successfully`);
            return true;
        } catch (error) {
            logger.error('AppConfig', `Failed to set config ${key}:`, error);
            return false;
        }
    }

    /**
     * Get all configuration values
     */
    static getAll(): Record<string, string> {
        try {
            const db = getDatabase();
            if (!db) {
                logger.error('AppConfig', 'Database not initialized');
                return {};
            }

            const rows = db.prepare('SELECT key, value FROM app_config').all() as AppConfig[];
            const config: Record<string, string> = {};
            for (const row of rows) {
                config[row.key] = row.value;
            }
            return config;
        } catch (error) {
            logger.error('AppConfig', 'Failed to get all config:', error);
            return {};
        }
    }

    /**
     * Delete a configuration value
     */
    static delete(key: string): boolean {
        try {
            const db = getDatabase();
            if (!db) {
                logger.error('AppConfig', 'Database not initialized');
                return false;
            }

            db.prepare('DELETE FROM app_config WHERE key = ?').run(key);
            return true;
        } catch (error) {
            logger.error('AppConfig', `Failed to delete config ${key}:`, error);
            return false;
        }
    }
}

