/**
 * Network Scan routes
 * 
 * Handles network scanning operations: scan network ranges, refresh existing IPs, get history, etc.
 */

import { Router } from 'express';
import { networkScanService } from '../services/networkScanService.js';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { AppConfigRepository } from '../database/models/AppConfig.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/network-scan/scan
 * Launch a full network scan
 * 
 * Body:
 * {
 *   range?: string (e.g., "192.168.1.0/24" or "192.168.1.1-254", auto-detect if not provided)
 *   autoDetect?: boolean (default: false)
 *   scanType?: 'full' | 'quick' (default: 'full')
 * }
 */
router.post('/scan', requireAuth, autoLog('network-scan', 'scan'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { range, autoDetect, scanType = 'full' } = req.body;

    // Validate scanType
    if (scanType !== 'full' && scanType !== 'quick') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'scanType must be "full" or "quick"',
                code: 'INVALID_SCAN_TYPE'
            }
        });
    }

    let scanRange: string;

    if (autoDetect || !range) {
        // Auto-detect network range
        const detectedRange = networkScanService.getNetworkRange();
        if (!detectedRange) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Could not auto-detect network range. Please specify a range manually.',
                    code: 'AUTO_DETECT_FAILED'
                }
            });
        }
        scanRange = detectedRange;
    } else {
        scanRange = range;
    }

    try {
        const result = await networkScanService.scanNetwork(scanRange, scanType);

        res.json({
            success: true,
            result: {
                range: scanRange,
                scanType,
                ...result
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Scan failed:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Scan failed',
                code: 'SCAN_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/refresh
 * Refresh existing IPs (re-ping known IPs)
 * 
 * Body:
 * {
 *   scanType?: 'full' | 'quick' (default: 'quick')
 * }
 */
router.post('/refresh', requireAuth, autoLog('network-scan', 'refresh'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { scanType = 'quick' } = req.body;

    // Validate scanType
    if (scanType !== 'full' && scanType !== 'quick') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'scanType must be "full" or "quick"',
                code: 'INVALID_SCAN_TYPE'
            }
        });
    }

    try {
        const result = await networkScanService.refreshExistingIps(scanType);

        res.json({
            success: true,
            result: {
                scanType,
                ...result
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Refresh failed:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Refresh failed',
                code: 'REFRESH_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/history
 * Get scan history with filters
 * 
 * Query params:
 * - status?: 'online' | 'offline' | 'unknown'
 * - ip?: string (partial match, e.g., "192.168.1")
 * - search?: string (search in IP, MAC, hostname)
 * - limit?: number (default: 100)
 * - offset?: number (default: 0)
 * - sortBy?: 'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency' (default: 'last_seen')
 * - sortOrder?: 'asc' | 'desc' (default: 'desc')
 */
router.get('/history', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
        status,
        ip,
        search,
        limit = 100,
        offset = 0,
        sortBy = 'last_seen',
        sortOrder = 'desc'
    } = req.query;

    // Validate status if provided
    if (status && status !== 'online' && status !== 'offline' && status !== 'unknown') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'status must be "online", "offline", or "unknown"',
                code: 'INVALID_STATUS'
            }
        });
    }

    // Validate sortBy
    const validSortBy = ['ip', 'last_seen', 'first_seen', 'status', 'ping_latency'];
    if (sortBy && !validSortBy.includes(sortBy as string)) {
        return res.status(400).json({
            success: false,
            error: {
                message: `sortBy must be one of: ${validSortBy.join(', ')}`,
                code: 'INVALID_SORT_BY'
            }
        });
    }

    // Validate sortOrder
    if (sortOrder && sortOrder !== 'asc' && sortOrder !== 'desc') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'sortOrder must be "asc" or "desc"',
                code: 'INVALID_SORT_ORDER'
            }
        });
    }

    try {
        const filters: any = {
            limit: Math.min(parseInt(limit as string) || 100, 1000), // Max 1000
            offset: parseInt(offset as string) || 0,
            sortBy: sortBy as any,
            sortOrder: sortOrder as 'asc' | 'desc'
        };

        if (status) filters.status = status;
        if (ip) filters.ip = ip as string;
        if (search) filters.search = search as string;

        const items = NetworkScanRepository.find(filters);
        const total = NetworkScanRepository.count({
            status: filters.status,
            ip: filters.ip,
            search: filters.search
        });

        res.json({
            success: true,
            result: {
                items,
                total,
                limit: filters.limit,
                offset: filters.offset
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get history:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get history',
                code: 'HISTORY_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/stats
 * Get scan statistics
 */
router.get('/stats', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const stats = await networkScanService.getStats();

        res.json({
            success: true,
            result: stats
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get stats:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get stats',
                code: 'STATS_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/config
 * Get automatic scan configuration
 */
router.get('/config', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const configStr = AppConfigRepository.get('network_scan_auto');
        
        if (!configStr) {
            return res.json({
                success: true,
                result: {
                    enabled: false,
                    interval: 30,
                    scanType: 'quick'
                }
            });
        }

        const config = JSON.parse(configStr);
        res.json({
            success: true,
            result: config
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get config',
                code: 'CONFIG_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/config
 * Configure automatic scan
 * 
 * Body:
 * {
 *   enabled: boolean
 *   interval?: number (minutes: 15, 30, 60, 120, 360, 720, 1440)
 *   scanType?: 'full' | 'quick' (default: 'quick')
 * }
 */
router.post('/config', requireAuth, autoLog('network-scan', 'config'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { enabled, interval = 30, scanType = 'quick' } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'enabled must be a boolean',
                code: 'INVALID_ENABLED'
            }
        });
    }

    // Validate interval
    const validIntervals = [15, 30, 60, 120, 360, 720, 1440];
    if (!validIntervals.includes(interval)) {
        return res.status(400).json({
            success: false,
            error: {
                message: `interval must be one of: ${validIntervals.join(', ')} minutes`,
                code: 'INVALID_INTERVAL'
            }
        });
    }

    // Validate scanType
    if (scanType !== 'full' && scanType !== 'quick') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'scanType must be "full" or "quick"',
                code: 'INVALID_SCAN_TYPE'
            }
        });
    }

    try {
        const config = {
            enabled,
            interval,
            scanType
        };

        AppConfigRepository.set('network_scan_auto', JSON.stringify(config));

        // TODO: Update cron scheduler (will be implemented in networkScanScheduler.ts)
        // For now, just save the config

        res.json({
            success: true,
            result: config
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to save config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to save config',
                code: 'CONFIG_SAVE_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/:id
 * Get details of a specific IP
 */
router.get('/:id', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ip = req.params.id;

    try {
        const scan = NetworkScanRepository.findByIp(ip);

        if (!scan) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'IP not found',
                    code: 'IP_NOT_FOUND'
                }
            });
        }

        res.json({
            success: true,
            result: scan
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get IP details:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get IP details',
                code: 'GET_IP_ERROR'
            }
        });
    }
}));

/**
 * DELETE /api/network-scan/:id
 * Delete a specific IP from history
 */
router.delete('/:id', requireAuth, autoLog('network-scan', 'delete'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ip = req.params.id;

    try {
        const deleted = NetworkScanRepository.delete(ip);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'IP not found',
                    code: 'IP_NOT_FOUND'
                }
            });
        }

        res.json({
            success: true,
            result: {
                ip,
                deleted: true
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to delete IP:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to delete IP',
                code: 'DELETE_IP_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/:id/hostname
 * Update hostname for a specific IP
 */
router.post('/:id/hostname', requireAuth, autoLog('network-scan', 'update-hostname'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ip = req.params.id;
    const { hostname } = req.body;

    if (hostname !== undefined && typeof hostname !== 'string' && hostname !== null) {
        return res.status(400).json({
            success: false,
            error: {
                message: 'hostname must be a string or null',
                code: 'INVALID_HOSTNAME'
            }
        });
    }

    try {
        const updated = NetworkScanRepository.update(ip, {
            hostname: hostname && hostname.trim() ? hostname.trim() : undefined
        });

        if (!updated) {
            return res.status(404).json({
                success: false,
                error: {
                    message: 'IP not found',
                    code: 'IP_NOT_FOUND'
                }
            });
        }

        res.json({
            success: true,
            result: updated
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to update hostname:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to update hostname',
                code: 'UPDATE_HOSTNAME_ERROR'
            }
        });
    }
}));

/**
 * DELETE /api/network-scan/clear
 * Clear all scan history (admin only)
 */
router.delete('/clear', requireAuth, requireAdmin, autoLog('network-scan', 'clear'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const deletedCount = NetworkScanRepository.deleteAll();

        res.json({
            success: true,
            result: {
                deleted: deletedCount
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to clear history:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to clear history',
                code: 'CLEAR_ERROR'
            }
        });
    }
}));

export default router;

