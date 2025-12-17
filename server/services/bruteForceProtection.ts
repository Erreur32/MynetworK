/**
 * Brute Force Protection Service
 * 
 * Protects against brute force attacks by tracking failed login attempts
 * and temporarily blocking IPs or usernames after too many failures
 */

import { logger } from '../utils/logger.js';

interface FailedAttempt {
    count: number;
    firstAttempt: number;
    lastAttempt: number;
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
     * Check if an IP or username is currently blocked
     */
    isBlocked(identifier: string): boolean {
        const attempt = this.attempts.get(identifier);
        if (!attempt) {
            return false;
        }

        // Clean up expired entries
        const now = Date.now();
        const windowMs = this.config.trackingWindow * 60 * 1000;
        
        // If outside tracking window, reset
        if (now - attempt.firstAttempt > windowMs) {
            this.attempts.delete(identifier);
            return false;
        }

        // Check if currently blocked
        if (attempt.blockedUntil && now < attempt.blockedUntil) {
            return true;
        }

        // If block expired but still in tracking window, reset block but keep tracking
        if (attempt.blockedUntil && now >= attempt.blockedUntil) {
            attempt.blockedUntil = undefined;
            // Reset count if block expired
            if (now - attempt.lastAttempt > this.config.lockoutDuration * 60 * 1000) {
                attempt.count = 0;
            }
        }

        return false;
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
     */
    recordFailedAttempt(identifier: string, ipAddress?: string): boolean {
        const now = Date.now();
        const windowMs = this.config.trackingWindow * 60 * 1000;

        let attempt = this.attempts.get(identifier);
        
        if (!attempt) {
            // First failed attempt
            attempt = {
                count: 1,
                firstAttempt: now,
                lastAttempt: now
            };
            this.attempts.set(identifier, attempt);
            logger.warn('BruteForce', `Failed login attempt #1 for ${identifier}${ipAddress ? ` from ${ipAddress}` : ''}`);
            return false;
        }

        // Check if outside tracking window
        if (now - attempt.firstAttempt > windowMs) {
            // Reset tracking
            attempt.count = 1;
            attempt.firstAttempt = now;
            attempt.lastAttempt = now;
            attempt.blockedUntil = undefined;
            logger.warn('BruteForce', `Failed login attempt #1 for ${identifier}${ipAddress ? ` from ${ipAddress}` : ''} (window reset)`);
            return false;
        }

        // Increment count
        attempt.count++;
        attempt.lastAttempt = now;

        logger.warn('BruteForce', `Failed login attempt #${attempt.count} for ${identifier}${ipAddress ? ` from ${ipAddress}` : ''}`);

        // Check if we should block
        if (attempt.count >= this.config.maxAttempts) {
            const lockoutMs = this.config.lockoutDuration * 60 * 1000;
            attempt.blockedUntil = now + lockoutMs;
            
            logger.error('BruteForce', `BLOCKED ${identifier}${ipAddress ? ` from ${ipAddress}` : ''} for ${this.config.lockoutDuration} minutes after ${attempt.count} failed attempts`);
            return true;
        }

        return false;
    }

    /**
     * Record a successful login attempt (reset counter)
     */
    recordSuccessfulAttempt(identifier: string): void {
        const attempt = this.attempts.get(identifier);
        if (attempt && attempt.count > 0) {
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
        if (!attempt) {
            return {
                count: 0,
                isBlocked: false,
                remainingLockoutTime: 0,
                firstAttempt: null,
                lastAttempt: null
            };
        }

        return {
            count: attempt.count,
            isBlocked: this.isBlocked(identifier),
            remainingLockoutTime: this.getRemainingLockoutTime(identifier),
            firstAttempt: attempt.firstAttempt,
            lastAttempt: attempt.lastAttempt
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
                    count: attempt.count,
                    blockedUntil: attempt.blockedUntil,
                    remainingTime: Math.ceil((attempt.blockedUntil - now) / 1000)
                });
            }
        }

        return blocked;
    }

    /**
     * Clean up old entries (should be called periodically)
     */
    cleanup(): void {
        const now = Date.now();
        const windowMs = this.config.trackingWindow * 60 * 1000;
        let cleaned = 0;

        for (const [identifier, attempt] of this.attempts.entries()) {
            // Remove if outside tracking window and not blocked
            if (now - attempt.firstAttempt > windowMs) {
                if (!attempt.blockedUntil || now >= attempt.blockedUntil) {
                    this.attempts.delete(identifier);
                    cleaned++;
                }
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

