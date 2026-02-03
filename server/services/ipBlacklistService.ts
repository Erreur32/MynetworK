/**
 * IP Blacklist Service
 *
 * This service manages a list of banned IP addresses that should be
 * completely ignored by the network scanner.
 *
 * Design goals:
 * - Centralize blacklist storage using AppConfigRepository (single source of truth).
 * - Keep the API very simple: add, remove, list, check.
 * - Be resilient to invalid data in the configuration (malformed JSON, invalid IPs).
 * - Never throw for user data issues: always fail safely and log when needed.
 */

import { AppConfigRepository } from '../database/models/AppConfig.js';
import { logger } from '../utils/logger.js';

const BLACKLIST_CONFIG_KEY = 'network_scan_blacklist';

/**
 * Parse the blacklist from AppConfig.
 * Always returns a valid string array, even if the stored value is invalid.
 */
function loadBlacklist(): string[] {
    try {
        const raw = AppConfigRepository.get(BLACKLIST_CONFIG_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            logger.warn('IpBlacklistService', 'Blacklist config is not an array, resetting to empty array');
            return [];
        }

        // Normalize values: keep only non-empty strings
        const normalized = parsed
            .filter((item: unknown) => typeof item === 'string')
            .map((ip: string) => ip.trim())
            .filter((ip: string) => ip.length > 0);

        return Array.from(new Set(normalized));
    } catch (error: any) {
        logger.error('IpBlacklistService', `Failed to parse blacklist config: ${error.message || error}`);
        return [];
    }
}

/**
 * Persist the blacklist array back to AppConfig.
 * This function never throws: it logs errors and returns a boolean.
 */
function saveBlacklist(ips: string[]): boolean {
    try {
        const uniqueIps = Array.from(new Set(ips.map((ip) => ip.trim()).filter((ip) => ip.length > 0)));
        return AppConfigRepository.set(BLACKLIST_CONFIG_KEY, JSON.stringify(uniqueIps));
    } catch (error: any) {
        logger.error('IpBlacklistService', `Failed to save blacklist config: ${error.message || error}`);
        return false;
    }
}

/**
 * Simple IPv4 validation used for blacklist entries.
 * This is intentionally strict: we only accept standard dotted IPv4 addresses.
 */
function isValidIpv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) {
        return false;
    }
    for (const part of parts) {
        if (!/^\d+$/.test(part)) {
            return false;
        }
        const num = parseInt(part, 10);
        if (Number.isNaN(num) || num < 0 || num > 255) {
            return false;
        }
    }
    return true;
}

export const ipBlacklistService = {
    /**
     * Get the full blacklist as a unique array of IP strings.
     * This method never throws and always returns a valid array.
     */
    getBlacklist(): string[] {
        return loadBlacklist();
    },

    /**
     * Check if a given IP is present in the blacklist.
     * If the IP is invalid, this method returns false.
     */
    isBlacklisted(ip: string): boolean {
        if (!ip || !isValidIpv4(ip.trim())) {
            return false;
        }
        const normalized = ip.trim();
        const list = loadBlacklist();
        return list.includes(normalized);
    },

    /**
     * Add an IP to the blacklist.
     * Invalid IPs are ignored to keep the configuration clean.
     */
    addToBlacklist(ip: string): boolean {
        if (!ip) {
            return false;
        }
        const normalized = ip.trim();
        if (!isValidIpv4(normalized)) {
            logger.warn('IpBlacklistService', `Attempted to add invalid IP to blacklist: ${normalized}`);
            return false;
        }

        const list = loadBlacklist();
        if (list.includes(normalized)) {
            // Already blacklisted, nothing to do
            return true;
        }

        list.push(normalized);
        return saveBlacklist(list);
    },

    /**
     * Remove an IP from the blacklist.
     * If the IP is not present, this is a no-op.
     */
    removeFromBlacklist(ip: string): boolean {
        if (!ip) {
            return false;
        }
        const normalized = ip.trim();
        const list = loadBlacklist();
        const filtered = list.filter((entry) => entry !== normalized);
        if (filtered.length === list.length) {
            // Nothing changed
            return true;
        }
        return saveBlacklist(filtered);
    }
};

