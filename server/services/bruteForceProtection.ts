/**
 * Brute Force Protection Service
 * 
 * Protects against brute force attacks by tracking failed login attempts
 * and temporarily blocking IPs or usernames after too many failures
 */

import { logger } from '../utils/logger.js';

interface FailedAttempt {
    timestamps: number[];   // failed-attempt times within the sliding tracking window
    blockedUntil?: number;
}

interface BruteForceConfig {
    maxAttempts: number;        // Maximum failed attempts before blocking (default: 5)
    lockoutDuration: number;    // Lockout duration in minutes (default: 15)
    trackingWindow: number;     // Time window in minutes to track attempts (default: 30)
}

class BruteForceProtectionService {
    private attempts: Map<string, FailedAttempt> = new Map();
    private config: BruteForceConfig;

    constructor() {
        // Default configuration - can be overridden via setConfig
        this.config = {
            maxAttempts: 5,
            lockoutDuration: 15,
            trackingWindow: 30
        };
    }

    /**
     * Update brute force protection configuration
     */
    setConfig(config: Partial<BruteForceConfig>): void {
        this.config = { ...this.config, ...config };
        logger.info('BruteForce', `Configuration updated: maxAttempts=${this.config.maxAttempts}, lockoutDuration=${this.config.lockoutDuration}min`);
    }

    /**
     * Get current configuration
     */
    getConfig(): BruteForceConfig {
        return { ...this.config };
    }

    /**
     * Check if an IP or username is currently blocked.
     * Pure read — does not mutate state (previously reset block/count as a side
     * effect here, which was unsafe to call from getStats() and other read paths).
     */
    isBlocked(identifier: string): boolean {
        const attempt = this.attempts.get(identifier);
        if (!attempt || !attempt.blockedUntil) {
            return false;
        }
        return Date.now() < attempt.blockedUntil;
    }

    /**
     * Get remaining lockout time in seconds (0 if not blocked)
     */
    getRemainingLockoutTime(identifier: string): number {
        const attempt = this.attempts.get(identifier);
        if (!attempt || !attempt.blockedUntil) {
            return 0;
        }

        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((attempt.blockedUntil - now) / 1000));
        return remaining;
    }

    /**
     * Record a failed login attempt
     * Returns true if the identifier should now be blocked
     *
     * Uses a sliding window (timestamps of individual attempts) rather than a
     * fixed window with a single reset point — a fixed window lets an attacker
     * pace attempts around the reset boundary to never accumulate enough
     * failures in a single window to trigger a lockout.
     */
    recordFailedAttempt(identifier: string, ipAddress?: string): boolean {
        const now = Date.now();
        const windowMs = this.config.trackingWindow * 60 * 1000;

        let attempt = this.attempts.get(identifier);
        if (!attempt) {
            attempt = { timestamps: [] };
            this.attempts.set(identifier, attempt);
        }

        // Drop attempts outside the sliding window before counting
        attempt.timestamps = attempt.timestamps.filter(t => now - t <= windowMs);
        attempt.timestamps.push(now);

        const count = attempt.timestamps.length;
        logger.warn('BruteForce', `Failed login attempt #${count} for ${identifier}${ipAddress ? ` from ${ipAddress}` : ''}`);

        if (count >= this.config.maxAttempts) {
            const lockoutMs = this.config.lockoutDuration * 60 * 1000;
            attempt.blockedUntil = now + lockoutMs;

            logger.error('BruteForce', `BLOCKED ${identifier}${ipAddress ? ` from ${ipAddress}` : ''} for ${this.config.lockoutDuration} minutes after ${count} failed attempts`);
            return true;
        }

        return false;
    }

    /**
     * Record a successful login attempt (reset counter)
     */
    recordSuccessfulAttempt(identifier: string): void {
        const attempt = this.attempts.get(identifier);
        if (attempt && attempt.timestamps.length > 0) {
            logger.info('BruteForce', `Successful login for ${identifier}, resetting failed attempt counter`);
            this.attempts.delete(identifier);
        }
    }

    /**
     * Get statistics for an identifier
     */
    getStats(identifier: string): {
        count: number;
        isBlocked: boolean;
        remainingLockoutTime: number;
        firstAttempt: number | null;
        lastAttempt: number | null;
    } {
        const attempt = this.attempts.get(identifier);
        if (!attempt || attempt.timestamps.length === 0) {
            return {
                count: 0,
                isBlocked: false,
                remainingLockoutTime: 0,
                firstAttempt: null,
                lastAttempt: null
            };
        }

        return {
            count: attempt.timestamps.length,
            isBlocked: this.isBlocked(identifier),
            remainingLockoutTime: this.getRemainingLockoutTime(identifier),
            firstAttempt: attempt.timestamps[0],
            lastAttempt: attempt.timestamps[attempt.timestamps.length - 1]
        };
    }

    /**
     * Manually unblock an identifier (admin function)
     */
    unblock(identifier: string): boolean {
        const attempt = this.attempts.get(identifier);
        if (!attempt) {
            return false;
        }

        logger.info('BruteForce', `Manually unblocked ${identifier}`);
        this.attempts.delete(identifier);
        return true;
    }

    /**
     * Get all blocked identifiers
     */
    getBlockedIdentifiers(): Array<{
        identifier: string;
        count: number;
        blockedUntil: number;
        remainingTime: number;
    }> {
        const now = Date.now();
        const blocked: Array<{
            identifier: string;
            count: number;
            blockedUntil: number;
            remainingTime: number;
        }> = [];

        for (const [identifier, attempt] of this.attempts.entries()) {
            if (attempt.blockedUntil && now < attempt.blockedUntil) {
                blocked.push({
                    identifier,
                    count: attempt.timestamps.length,
                    blockedUntil: attempt.blockedUntil,
                    remainingTime: Math.ceil((attempt.blockedUntil - now) / 1000)
                });
            }
        }

        return blocked;
    }

    /**
     * Clean up old entries (should be called periodically).
     * Also bounds the Map's size over time by pruning stale timestamps —
     * without this, entries lingered indefinitely since isBlocked() no longer
     * deletes them as a read side effect.
     */
    cleanup(): void {
        const now = Date.now();
        const windowMs = this.config.trackingWindow * 60 * 1000;
        let cleaned = 0;

        for (const [identifier, attempt] of this.attempts.entries()) {
            if (attempt.blockedUntil && now < attempt.blockedUntil) {
                continue; // still actively blocked, keep as-is
            }

            attempt.timestamps = attempt.timestamps.filter(t => now - t <= windowMs);

            if (attempt.timestamps.length === 0) {
                this.attempts.delete(identifier);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug('BruteForce', `Cleaned up ${cleaned} expired attempt records`);
        }
    }
}

// Export singleton instance
export const bruteForceProtection = new BruteForceProtectionService();

// Cleanup every 5 minutes
setInterval(() => {
    bruteForceProtection.cleanup();
}, 5 * 60 * 1000);

