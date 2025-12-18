/**
 * Search routes
 * 
 * Handles search across all active plugins
 */

import { Router } from 'express';
import { searchService } from '../services/searchService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/search
 * Search across all active plugins
 * 
 * Body:
 * {
 *   query: string (required)
 *   pluginIds?: string[] (optional - filter by plugins)
 *   types?: string[] (optional - filter by result types: device, dhcp, port-forward, client, ap, switch)
 *   exactMatch?: boolean (default: false)
 *   caseSensitive?: boolean (default: false)
 * }
 */
router.post('/', requireAuth, autoLog('search', 'search'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { query, pluginIds, types, exactMatch, caseSensitive } = req.body;

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
            exactMatch: exactMatch === true,
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
    } catch (error: any) {
        logger.error('Search', 'Search failed:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Search failed',
                code: 'SEARCH_ERROR'
            }
        });
    }
}));

export default router;

