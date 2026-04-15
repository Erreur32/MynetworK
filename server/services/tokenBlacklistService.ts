/**
 * Token blacklist service
 *
 * Maintains an in-memory Set for fast lookups, backed by SQLite for persistence.
 * Expired tokens are cleaned up periodically.
 */

import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { TokenBlacklistRepository } from '../database/models/TokenBlacklist.js';
import { logger } from '../utils/logger.js';

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

class TokenBlacklistService {
    private cache: Set<string> = new Set();
    private cleanupTimer: NodeJS.Timeout | null = null;

    /**
     * Initialize: load persisted blacklist into memory and start cleanup timer
     */
    init(): void {
        this.cache = TokenBlacklistRepository.loadAllHashes();
        const count = this.cache.size;
        if (count > 0) {
            logger.info('TokenBlacklist', `Loaded ${count} blacklisted token(s) from database`);
        }

        this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    }

    /**
     * Hash a raw JWT for storage (we never store the full token)
     */
    hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    /**
     * Blacklist a token (logout, ban, password change, etc.)
     */
    revoke(token: string, userId?: number, reason: string = 'logout'): boolean {
        const hash = this.hashToken(token);

        // Decode token to get its expiration (no verification needed, already verified)
        let expiresAt: Date;
        try {
            const decoded = jwt.decode(token) as { exp?: number } | null;
            if (decoded?.exp) {
                expiresAt = new Date(decoded.exp * 1000);
            } else {
                // Fallback: 7 days from now
                expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            }
        } catch {
            expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }

        // Add to in-memory cache
        this.cache.add(hash);

        // Persist to SQLite
        const persisted = TokenBlacklistRepository.add(hash, expiresAt, userId, reason);

        if (persisted) {
            logger.info('TokenBlacklist', `Token revoked (reason: ${reason}, userId: ${userId ?? 'unknown'})`);
        }

        return persisted;
    }

    /**
     * Check if a token is blacklisted (fast in-memory check)
     */
    isRevoked(token: string): boolean {
        const hash = this.hashToken(token);
        return this.cache.has(hash);
    }

    /**
     * Remove expired tokens from both cache and database
     */
    private cleanup(): void {
        const removed = TokenBlacklistRepository.cleanup();
        if (removed > 0) {
            // Reload cache from DB after cleanup
            this.cache = TokenBlacklistRepository.loadAllHashes();
            logger.debug('TokenBlacklist', `Cleaned up ${removed} expired token(s), ${this.cache.size} remaining`);
        }
    }

    /**
     * Shutdown: stop cleanup timer
     */
    close(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}

export const tokenBlacklistService = new TokenBlacklistService();
