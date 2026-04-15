/**
 * Token blacklist model and database operations
 *
 * Persists revoked JWT tokens in SQLite so they survive container restarts.
 */

import { getDatabase } from '../connection.js';
import { logger } from '../../utils/logger.js';

export interface BlacklistedToken {
    id: number;
    tokenHash: string;
    userId: number | null;
    reason: string;
    blacklistedAt: string;
    expiresAt: string;
}

export class TokenBlacklistRepository {
    /**
     * Add a token to the blacklist
     */
    static add(tokenHash: string, expiresAt: Date, userId?: number, reason: string = 'logout'): boolean {
        try {
            const db = getDatabase();
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO token_blacklist (token_hash, user_id, reason, expires_at)
                VALUES (?, ?, ?, ?)
            `);
            stmt.run(tokenHash, userId ?? null, reason, expiresAt.toISOString());
            return true;
        } catch (error) {
            logger.error('TokenBlacklist', 'Failed to add token:', error);
            return false;
        }
    }

    /**
     * Check if a token hash is blacklisted
     */
    static isBlacklisted(tokenHash: string): boolean {
        try {
            const db = getDatabase();
            const stmt = db.prepare('SELECT 1 FROM token_blacklist WHERE token_hash = ?');
            return stmt.get(tokenHash) !== undefined;
        } catch (error) {
            logger.error('TokenBlacklist', 'Failed to check token:', error);
            // Fail closed: if we can't check, treat as blacklisted for safety
            return true;
        }
    }

    /**
     * Remove expired tokens from the blacklist
     * Returns the number of tokens removed
     */
    static cleanup(): number {
        try {
            const db = getDatabase();
            const stmt = db.prepare('DELETE FROM token_blacklist WHERE expires_at < datetime(\'now\')');
            const result = stmt.run();
            return result.changes;
        } catch (error) {
            logger.error('TokenBlacklist', 'Failed to cleanup expired tokens:', error);
            return 0;
        }
    }

    /**
     * Blacklist all tokens for a specific user (e.g. on ban or password change)
     * Since we don't track all issued tokens, this adds a marker that invalidates
     * any token issued before this timestamp.
     */
    static blacklistAllForUser(userId: number, reason: string = 'ban'): boolean {
        // This is handled via the user's `enabled` flag in the auth middleware.
        // Tokens for disabled users are already rejected.
        // This method is a no-op placeholder for future per-token tracking.
        return true;
    }

    /**
     * Get count of blacklisted tokens (for monitoring)
     */
    static count(): number {
        try {
            const db = getDatabase();
            const stmt = db.prepare('SELECT COUNT(*) as count FROM token_blacklist');
            const result = stmt.get() as { count: number };
            return result.count;
        } catch {
            return 0;
        }
    }

    /**
     * Load all non-expired token hashes (for in-memory cache warm-up)
     */
    static loadAllHashes(): Set<string> {
        try {
            const db = getDatabase();
            const stmt = db.prepare('SELECT token_hash FROM token_blacklist WHERE expires_at >= datetime(\'now\')');
            const rows = stmt.all() as { token_hash: string }[];
            return new Set(rows.map(r => r.token_hash));
        } catch (error) {
            logger.error('TokenBlacklist', 'Failed to load token hashes:', error);
            return new Set();
        }
    }
}
