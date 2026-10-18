/**
 * Search routes
 * 
 * Handles search across all active plugins
 */

import { Router } from 'express';
import { getIpDetails, compactIpDetails } from '../services/ipDetailsService.js';
import { searchService } from '../services/searchService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';
import { logger } from '../utils/logger.js';
import { param } from '../utils/params.js';
import { getErrorMessage } from '../utils/errorMessage.js';

const router = Router();

/**
 * POST /api/search
 * Search across all active plugins.
 * Mode is derived from query: IP/MAC (exact, wildcard *, range 1-32) vs text (hostname, vendor, comment).
 *
 * Body:
 * {
 *   query: string (required)
 *   pluginIds?: string[] (optional - filter by plugins)
 *   types?: string[] (optional - filter by result types: device, dhcp, port-forward, client, ap, switch)
 *   caseSensitive?: boolean (default: false)
 * }
 */
router.post('/', requireAuth, autoLog('search', 'search'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { query, pluginIds, types, caseSensitive } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Search query is required',
                code: 'MISSING_QUERY'
            }
        });
    }

    // Validate pluginIds if provided
    if (pluginIds && (!Array.isArray(pluginIds) || pluginIds.some(id => typeof id !== 'string'))) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'pluginIds must be an array of strings',
                code: 'INVALID_PLUGIN_IDS'
            }
        });
    }

    // Validate types if provided
    const validTypes = ['device', 'dhcp', 'port-forward', 'client', 'ap', 'switch'];
    if (types && (!Array.isArray(types) || types.some(t => !validTypes.includes(t)))) {
        return res.status(400).json({
            success: false,
            error: {
                message: `types must be an array containing one or more of: ${validTypes.join(', ')}`,
                code: 'INVALID_TYPES'
            }
        });
    }

    try {
        const results = await searchService.search({
            query: query.trim(),
            pluginIds,
            types,
            caseSensitive: caseSensitive === true
        });

        res.json({
            success: true,
            result: {
                query: query.trim(),
                count: results.length,
                results
            }
        });
    } catch (error: unknown) {
        logger.error('Search', 'Search failed:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: getErrorMessage(error) || 'Search failed',
                code: 'SEARCH_ERROR'
            }
        });
    }
}));

/**
 * GET /api/search/ip-details/:ip
 * Get complete details for a specific IP address from all sources (Freebox, UniFi, Scanner)
 * Aggregates information from all plugins and scanner database
 */
router.get('/ip-details/:ip', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ip = param(req, 'ip');

    // Validate IP format (basic IPv4 validation)
    const ipRegex = /^\d{1,3}(?:\.\d{1,3}){3}$/;
    if (!ipRegex.test(ip)) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'Invalid IP address format',
                code: 'INVALID_IP'
            }
        });
    }

    try {
        const aggregatedData = await getIpDetails(ip);

        res.json({
            success: true,
            result: req.apiToken ? compactIpDetails(aggregatedData) : aggregatedData
        });
    } catch (error: unknown) {
        logger.error('Search', `Failed to get IP details for ${ip}:`, error);
        return res.status(500).json({
            success: false,
            error: {
                message: getErrorMessage(error) || 'Failed to get IP details',
                code: 'IP_DETAILS_ERROR'
            }
        });
    }
}));

export default router;

