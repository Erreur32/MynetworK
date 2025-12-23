/**
 * Network Scan routes
 * 
 * Handles network scanning operations: scan network ranges, refresh existing IPs, get history, etc.
 */

import { Router } from 'express';
import cron from 'node-cron';
import { networkScanService } from '../services/networkScanService.js';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { AppConfigRepository } from '../database/models/AppConfig.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';
import { logger } from '../utils/logger.js';
import { networkScanScheduler, type UnifiedAutoScanConfig } from '../services/networkScanScheduler.js';
import { 
    getRetentionConfig, 
    saveRetentionConfig, 
    executePurge,
    initializePurgeService,
    purgeHistoryOnly,
    purgeScansOnly,
    purgeOfflineOnly,
    clearAllScanData
} from '../services/databasePurgeService.js';
import { PluginPriorityConfigService } from '../services/pluginPriorityConfig.js';
import { WiresharkVendorService } from '../services/wiresharkVendorService.js';

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
        // First, try to use default config if available (user preference)
        const defaultConfigStr = AppConfigRepository.get('network_scan_default');
        if (defaultConfigStr) {
            try {
                const defaultConfig = JSON.parse(defaultConfigStr);
                if (defaultConfig.defaultRange && !defaultConfig.defaultAutoDetect) {
                    // User has configured a default range and doesn't want auto-detect
                    scanRange = defaultConfig.defaultRange;
                    logger.info('NetworkScan', `Using configured default range: ${scanRange}`);
                } else if (defaultConfig.defaultRange && defaultConfig.defaultAutoDetect) {
                    // User wants auto-detect, but we'll still prefer their configured range if auto-detect fails
                    const detectedRange = networkScanService.getNetworkRange();
                    scanRange = detectedRange || defaultConfig.defaultRange;
                    logger.info('NetworkScan', `Auto-detect preferred, using: ${scanRange}`);
                } else {
                    // No default range configured, use auto-detect
                    const detectedRange = networkScanService.getNetworkRange();
                    if (!detectedRange) {
                        return res.status(400).json({
                            success: false,
                            error: {
                                message: 'Could not auto-detect network range. Please specify a range manually or configure a default range.',
                                code: 'AUTO_DETECT_FAILED'
                            }
                        });
                    }
                    scanRange = detectedRange;
                }
            } catch (e) {
                logger.warn('NetworkScan', 'Failed to parse default config, falling back to auto-detect');
                // Fallback to auto-detect
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
            }
        } else {
            // No default config, use auto-detect
            const detectedRange = networkScanService.getNetworkRange();
            if (!detectedRange) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'Could not auto-detect network range. Please specify a range manually or configure a default range.',
                        code: 'AUTO_DETECT_FAILED'
                    }
                });
            }
            scanRange = detectedRange;
        }
    } else {
        scanRange = range;
    }

    try {
        // Pause auto scans during manual scan to avoid conflicts
        const { networkScanScheduler } = await import('../services/networkScanScheduler.js');
        networkScanScheduler.pauseAutoScans();

    try {
        const result = await networkScanService.scanNetwork(scanRange, scanType);

        // Track last manual scan
        AppConfigRepository.set('network_scan_last_manual', JSON.stringify({
            type: 'full',
            scanType: scanType,
            range: scanRange,
            timestamp: new Date().toISOString(),
            result: result
        }));

        res.json({
            success: true,
            result: {
                range: scanRange,
                scanType,
                    ...result,
                    detectionSummary: result.detectionSummary // Include detection summary in response
            }
        });
        } finally {
            // Always resume auto scans after manual scan completes (success or failure)
            networkScanScheduler.resumeAutoScans();
        }
    } catch (error: any) {
        logger.error('NetworkScan', 'Scan failed:', error);
        logger.error('NetworkScan', 'Error details:', {
            message: error.message,
            stack: error.stack,
            range: scanRange,
            scanType
        });
        
        // Provide more detailed error message with suggestions
        let errorMessage = error.message || 'Scan failed';
        let suggestion: string | undefined;
        
        if (error.message?.includes('too large') || error.message?.includes('Maximum 1000 IPs')) {
            // Extract IP from range and suggest /24
            const ipMatch = scanRange.match(/(\d+\.\d+\.\d+)\./);
            if (ipMatch) {
                const suggestedRange = `${ipMatch[1]}.0/24`;
                errorMessage = `Network range too large. Maximum 1000 IPs allowed.`;
                suggestion = `Try using a smaller range like ${suggestedRange} (254 IPs)`;
            } else {
                errorMessage = `Network range too large. Maximum 1000 IPs allowed.`;
                suggestion = `Try using a /24 subnet (e.g., 192.168.1.0/24)`;
            }
        } else if (error.message?.includes('ping') || error.message?.includes('Permission denied')) {
            errorMessage = 'Network scan failed: Missing network permissions. Ensure Docker container has NET_RAW and NET_ADMIN capabilities.';
        } else if (error.message?.includes('command not found') || error.message?.includes('ping')) {
            errorMessage = 'Network scan failed: ping command not available. Ensure iputils-ping is installed in Docker container.';
        }
        
        return res.status(500).json({
            success: false,
            error: {
                message: errorMessage,
                code: 'SCAN_ERROR',
                suggestion,
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        });
    }
}));

/**
 * GET /api/network-scan/progress
 * Get current scan progress (if a scan is in progress)
 */
router.get('/progress', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const progress = networkScanService.getScanProgress();
    
    if (!progress) {
        return res.json({
            success: true,
            result: null
        });
    }
    
    res.json({
        success: true,
        result: progress
    });
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
        // Pause auto scans during manual refresh to avoid conflicts
        const { networkScanScheduler } = await import('../services/networkScanScheduler.js');
        networkScanScheduler.pauseAutoScans();

    try {
        const result = await networkScanService.refreshExistingIps(scanType);

        // Track last manual refresh
        AppConfigRepository.set('network_scan_last_manual', JSON.stringify({
            type: 'refresh',
            scanType: scanType,
            timestamp: new Date().toISOString(),
            result: result
        }));

        res.json({
            success: true,
            result: {
                scanType,
                ...result
            }
        });
        } finally {
            // Always resume auto scans after manual refresh completes (success or failure)
            networkScanScheduler.resumeAutoScans();
        }
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
    const validSortBy = ['ip', 'last_seen', 'first_seen', 'status', 'ping_latency', 'hostname', 'mac', 'vendor'];
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
 * GET /api/network-scan/stats-history
 * Get historical statistics for charts
 * Query params:
 * - hours?: number (default: 24)
 */
router.get('/stats-history', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const hours = parseInt(req.query.hours as string) || 24;
        const history = NetworkScanRepository.getHistoricalStats(Math.min(hours, 168)); // Max 7 days

        res.json({
            success: true,
            result: history
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get stats history:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get stats history',
                code: 'STATS_HISTORY_ERROR'
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

        // Update cron scheduler
        networkScanScheduler.updateScanScheduler(config);

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
 * GET /api/network-scan/refresh-config
 * Get automatic refresh configuration
 */
router.get('/refresh-config', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const configStr = AppConfigRepository.get('network_scan_refresh_auto');
        
        if (!configStr) {
            return res.json({
                success: true,
                result: {
                    enabled: false,
                    interval: 15
                }
            });
        }

        const config = JSON.parse(configStr);
        res.json({
            success: true,
            result: config
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get refresh config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get refresh config',
                code: 'CONFIG_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/refresh-config
 * Configure automatic refresh
 * 
 * Body:
 * {
 *   enabled: boolean
 *   interval?: number (minutes: 5, 10, 15, 30, 60)
 * }
 */
router.post('/refresh-config', requireAuth, autoLog('network-scan', 'refresh-config'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { enabled, interval = 15 } = req.body;

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
    const validIntervals = [5, 10, 15, 30, 60];
    if (!validIntervals.includes(interval)) {
        return res.status(400).json({
            success: false,
            error: {
                message: `interval must be one of: ${validIntervals.join(', ')} minutes`,
                code: 'INVALID_INTERVAL'
            }
        });
    }

    try {
        const config = {
            enabled,
            interval,
            scanType: req.body.scanType || 'quick'
        };

        AppConfigRepository.set('network_scan_refresh_auto', JSON.stringify(config));

        // Update cron scheduler
        networkScanScheduler.updateRefreshScheduler(config);

        res.json({
            success: true,
            result: config
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to save refresh config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to save refresh config',
                code: 'CONFIG_SAVE_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/default-config
 * Get default scan configuration (default IP range, scan type, etc.)
 */
router.get('/default-config', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const configStr = AppConfigRepository.get('network_scan_default');
        
        if (!configStr) {
            return res.json({
                success: true,
                result: {
                    defaultRange: '192.168.1.0/24',
                    defaultScanType: 'full',
                    defaultAutoDetect: false
                }
            });
        }

        const config = JSON.parse(configStr);
        res.json({
            success: true,
            result: config
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get default config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get default config',
                code: 'CONFIG_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/default-config
 * Save default scan configuration
 * 
 * Body:
 * {
 *   defaultRange?: string (e.g., "192.168.1.0/24")
 *   defaultScanType?: 'full' | 'quick' (default: 'full')
 *   defaultAutoDetect?: boolean (default: false)
 * }
 */
router.post('/default-config', requireAuth, autoLog('network-scan', 'default-config'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { defaultRange = '192.168.1.0/24', defaultScanType = 'full', defaultAutoDetect = false } = req.body;

    // Validate defaultScanType
    if (defaultScanType !== 'full' && defaultScanType !== 'quick') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'defaultScanType must be "full" or "quick"',
                code: 'INVALID_SCAN_TYPE'
            }
        });
    }

    // Validate defaultRange format (basic validation)
    if (typeof defaultRange !== 'string' || defaultRange.trim() === '') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'defaultRange must be a non-empty string',
                code: 'INVALID_RANGE'
            }
        });
    }

    // Validate defaultAutoDetect
    if (typeof defaultAutoDetect !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'defaultAutoDetect must be a boolean',
                code: 'INVALID_AUTO_DETECT'
            }
        });
    }

    try {
        const config = {
            defaultRange: defaultRange.trim(),
            defaultScanType,
            defaultAutoDetect
        };

        AppConfigRepository.set('network_scan_default', JSON.stringify(config));

        res.json({
            success: true,
            result: config
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to save default config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to save default config',
                code: 'CONFIG_SAVE_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/unified-config
 * Get unified automatic scan configuration (new unified structure)
 * IMPORTANT: This route must be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/unified-config', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        // Try to get unified config first
        const unifiedConfigStr = AppConfigRepository.get('network_scan_unified_auto');

        if (unifiedConfigStr) {
            // New unified config exists
            const config: UnifiedAutoScanConfig = JSON.parse(unifiedConfigStr);
        res.json({
            success: true,
                result: config
            });
            return;
        }

        // Fallback: migrate from old configs
        const scanConfigStr = AppConfigRepository.get('network_scan_auto');
        const refreshConfigStr = AppConfigRepository.get('network_scan_refresh_auto');
        
        const scanConfig = scanConfigStr ? JSON.parse(scanConfigStr) : null;
        const refreshConfig = refreshConfigStr ? JSON.parse(refreshConfigStr) : null;

        // Build unified config from old configs
        const unifiedConfig: UnifiedAutoScanConfig = {
            enabled: (scanConfig?.enabled || refreshConfig?.enabled) ?? false,
            fullScan: scanConfig?.enabled ? {
                enabled: true,
                interval: scanConfig.interval,
                scanType: scanConfig.scanType
            } : undefined,
            refresh: refreshConfig?.enabled ? {
                enabled: true,
                interval: refreshConfig.interval,
                scanType: refreshConfig.scanType || 'quick'
            } : undefined
        };

        res.json({
            success: true,
            result: unifiedConfig
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get unified config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get unified config',
                code: 'CONFIG_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/auto-status
 * Get automatic scan and refresh status (config + scheduler status + last execution)
 * IMPORTANT: This route must be defined BEFORE /:id to avoid route conflicts
 */
router.get('/auto-status', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        // Try to get unified config first
        const unifiedConfigStr = AppConfigRepository.get('network_scan_unified_auto');
        let unifiedConfig: UnifiedAutoScanConfig | null = null;
        
        logger.info('NetworkScan', `Loading unified config from DB: exists=${!!unifiedConfigStr}`);
        
        if (unifiedConfigStr) {
            try {
            unifiedConfig = JSON.parse(unifiedConfigStr);
                logger.info('NetworkScan', `Parsed unified config: ${JSON.stringify(unifiedConfig)}`);
            } catch (e) {
                logger.error('NetworkScan', `Failed to parse unified config: ${e}`);
                unifiedConfig = null;
            }
        }
        
        if (!unifiedConfig) {
            // Fallback to old configs
            const scanConfigStr = AppConfigRepository.get('network_scan_auto');
            const refreshConfigStr = AppConfigRepository.get('network_scan_refresh_auto');
            const scanConfig = scanConfigStr ? JSON.parse(scanConfigStr) : { enabled: false, interval: 30, scanType: 'quick' };
            const refreshConfig = refreshConfigStr ? JSON.parse(refreshConfigStr) : { enabled: false, interval: 15 };
            
            unifiedConfig = {
                enabled: scanConfig.enabled || refreshConfig.enabled,
                fullScan: scanConfig.enabled ? {
                    enabled: true,
                    interval: scanConfig.interval,
                    scanType: scanConfig.scanType
                } : undefined,
                refresh: refreshConfig.enabled ? {
                    enabled: true,
                    interval: refreshConfig.interval,
                    scanType: refreshConfig.scanType || 'quick'
                } : undefined
            };
        }
        
        // Get scheduler status
        const scanStatus = networkScanScheduler.getScanStatus();
        const refreshStatus = networkScanScheduler.getRefreshStatus();
        
        // Get last scan dates (manual and auto)
        const lastManualStr = AppConfigRepository.get('network_scan_last_manual');
        const lastAutoStr = AppConfigRepository.get('network_scan_last_auto');
        
        let lastManual: { type: string; scanType: string; timestamp: string; range?: string } | null = null;
        let lastAuto: { type: string; scanType: string; timestamp: string; range?: string } | null = null;
        
        if (lastManualStr) {
            try {
                lastManual = JSON.parse(lastManualStr);
            } catch (e) {
                logger.warn('NetworkScan', 'Failed to parse last manual scan');
            }
        }
        
        if (lastAutoStr) {
            try {
                lastAuto = JSON.parse(lastAutoStr);
            } catch (e) {
                logger.warn('NetworkScan', 'Failed to parse last auto scan');
            }
        }
        
        // Determine last full scan and last refresh (manual or auto)
        const lastFullScan = lastManual?.type === 'full' ? lastManual : (lastAuto?.type === 'full' ? lastAuto : null);
        const lastRefresh = lastManual?.type === 'refresh' ? lastManual : (lastAuto?.type === 'refresh' ? lastAuto : null);
        
        // Ensure fullScan and refresh objects exist with defaults
        const fullScanConfig = unifiedConfig.fullScan || { enabled: false, interval: 1440, scanType: 'full' };
        const refreshConfig = unifiedConfig.refresh || { enabled: false, interval: 10 };
        
        // Calculate enabled status: true if master switch is enabled AND at least one sub-config is enabled
        // This ensures the status reflects the actual state of the schedulers
        const isEnabled = unifiedConfig.enabled && (fullScanConfig.enabled || refreshConfig.enabled);
        
        // Log the calculation for debugging (use info level so it's always visible)
        logger.info('NetworkScan', `Auto-status calculation: master=${unifiedConfig.enabled}, fullScan=${fullScanConfig.enabled}, refresh=${refreshConfig.enabled}, result=${isEnabled}`);
        logger.info('NetworkScan', `Full unified config: ${JSON.stringify(unifiedConfig)}`);
        
        const result = {
            enabled: isEnabled,
                fullScan: {
                config: fullScanConfig,
                    scheduler: scanStatus,
                    lastExecution: lastFullScan ? {
                        timestamp: lastFullScan.timestamp,
                        type: lastManual?.type === 'full' ? 'manual' : 'auto',
                        scanType: lastFullScan.scanType,
                        range: lastFullScan.range
                    } : null
                },
                refresh: {
                config: refreshConfig,
                    scheduler: refreshStatus,
                    lastExecution: lastRefresh ? {
                        timestamp: lastRefresh.timestamp,
                        type: lastManual?.type === 'refresh' ? 'manual' : 'auto',
                        scanType: lastRefresh.scanType
                    } : null
                },
                lastScan: (() => {
                    // Get the most recent scan (manual or auto, full or refresh)
                    const scans = [lastManual, lastAuto].filter(Boolean) as Array<{ timestamp: string; type: string; scanType: string; range?: string }>;
                    if (scans.length === 0) return null;
                    scans.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    const mostRecent = scans[0];
                    return {
                        timestamp: mostRecent.timestamp,
                        type: mostRecent.type,
                        scanType: mostRecent.scanType,
                        isManual: lastManual?.timestamp === mostRecent.timestamp,
                        range: mostRecent.range
                    };
                })()
        };
        
        // Log the complete result being sent
        logger.info('NetworkScan', `Auto-status result: enabled=${result.enabled}, fullScan.config.enabled=${result.fullScan.config.enabled}, refresh.config.enabled=${result.refresh.config.enabled}`);
        
        res.json({
            success: true,
            result: result
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get auto status:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get auto status',
                code: 'STATUS_ERROR'
            }
        });
    }
}));

// Route /auto-status moved above - see definition before /:id route (line 678)

/**
 * GET /api/network-scan/retention-config
 * Get current retention configuration
 * IMPORTANT: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/retention-config', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const config = getRetentionConfig();
        res.json({
            success: true,
            result: config
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get retention config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get retention config',
                code: 'RETENTION_CONFIG_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/retention-config
 * Update retention configuration
 * IMPORTANT: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.post('/retention-config', requireAuth, requireAdmin, autoLog('network-scan', 'retention-config'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const {
            historyRetentionDays,
            scanRetentionDays,
            offlineRetentionDays,
            autoPurgeEnabled,
            purgeSchedule
        } = req.body;

        const config: any = {};
        if (historyRetentionDays !== undefined) config.historyRetentionDays = historyRetentionDays;
        if (scanRetentionDays !== undefined) config.scanRetentionDays = scanRetentionDays;
        if (offlineRetentionDays !== undefined) config.offlineRetentionDays = offlineRetentionDays;
        if (autoPurgeEnabled !== undefined) config.autoPurgeEnabled = autoPurgeEnabled;
        if (purgeSchedule !== undefined) config.purgeSchedule = purgeSchedule;

        const success = saveRetentionConfig(config);
        
        if (success) {
            res.json({
                success: true,
                result: getRetentionConfig()
            });
        } else {
            return res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to save retention config',
                    code: 'RETENTION_CONFIG_SAVE_ERROR'
                }
            });
        }
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to save retention config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to save retention config',
                code: 'RETENTION_CONFIG_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/database-stats
 * Get database statistics for scan tables
 * IMPORTANT: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/database-stats', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const stats = NetworkScanRepository.getDatabaseStats();
        const retentionConfig = getRetentionConfig();
        
        res.json({
            success: true,
            result: {
                scansCount: stats.scansCount,
                historyCount: stats.historyCount,
                oldestScan: stats.oldestScan ? stats.oldestScan.toISOString() : null,
                oldestHistory: stats.oldestHistory ? stats.oldestHistory.toISOString() : null,
                totalSize: stats.totalSize,
                retentionConfig
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get database stats:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get database stats',
                code: 'DATABASE_STATS_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/plugin-priority-config
 * Get plugin priority configuration for hostname and vendor detection
 */
router.get('/plugin-priority-config', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const config = PluginPriorityConfigService.getConfig();
            res.json({
                success: true,
                result: config
            });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get plugin priority config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get plugin priority config',
                code: 'PLUGIN_PRIORITY_CONFIG_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/plugin-priority-config
 * Save plugin priority configuration for hostname and vendor detection
 */
router.post('/plugin-priority-config', requireAuth, requireAdmin, autoLog('network-scan', 'plugin-priority-config'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const { hostnamePriority, vendorPriority, overwriteExisting } = req.body;
        
        // Validate input
        if (!Array.isArray(hostnamePriority) || !Array.isArray(vendorPriority)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'hostnamePriority and vendorPriority must be arrays',
                    code: 'INVALID_CONFIG'
                }
            });
        }
        
        // Validate that all plugins are present
        const allPlugins = ['freebox', 'unifi', 'scanner'];
        const hasAllHostname = allPlugins.every(p => hostnamePriority.includes(p));
        const hasAllVendor = allPlugins.every(p => vendorPriority.includes(p));
        
        if (!hasAllHostname || !hasAllVendor) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Priority arrays must include all plugins: freebox, unifi, scanner',
                    code: 'INVALID_CONFIG'
                }
            });
        }
        
        const config = {
            hostnamePriority,
            vendorPriority,
            overwriteExisting: overwriteExisting || {
                hostname: true,
                vendor: true
            }
        };
        
        const success = PluginPriorityConfigService.setConfig(config);
        
        if (success) {
        res.json({
            success: true,
                result: config
        });
        } else {
            return res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to save plugin priority config',
                    code: 'SAVE_ERROR'
                }
            });
        }
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to save plugin priority config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to save plugin priority config',
                code: 'PLUGIN_PRIORITY_CONFIG_ERROR'
            }
        });
    }
}));

/**
 * GET /api/network-scan/wireshark-vendor-stats
 * Get IEEE OUI vendor database statistics
 * Note: Route name kept for backward compatibility, but uses IEEE OUI database
 */
router.get('/wireshark-vendor-stats', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        let stats = WiresharkVendorService.getStats();
        
        // If database is empty, try to initialize it (safety check)
        if (stats.totalVendors === 0) {
            logger.warn('NetworkScan', 'Vendor database is empty, attempting to initialize...');
            try {
                await WiresharkVendorService.initialize();
                // Get stats again after initialization
                stats = WiresharkVendorService.getStats();
            } catch (initError: any) {
                logger.error('NetworkScan', `Failed to initialize vendor database: ${initError.message}`);
            }
        }
        
        res.json({
            success: true,
            result: stats
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to get IEEE OUI vendor stats:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to get IEEE OUI vendor stats',
                code: 'WIRESHARK_STATS_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/update-wireshark-vendors
 * Manually update IEEE OUI vendor database
 * Note: Route name kept for backward compatibility, but uses IEEE OUI database
 */
router.post('/update-wireshark-vendors', requireAuth, requireAdmin, autoLog('network-scan', 'update-wireshark-vendors'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const updateResult = await WiresharkVendorService.updateDatabase();
        const stats = WiresharkVendorService.getStats();
        res.json({
            success: true,
            result: {
                message: 'Vendor database updated successfully',
                stats: stats,
                updateSource: updateResult.source,
                vendorCount: updateResult.vendorCount
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to update IEEE OUI vendor database:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to update IEEE OUI vendor database',
                code: 'WIRESHARK_UPDATE_ERROR'
            }
        });
    }
}));

/**
 * DELETE /api/network-scan/clear
 * Clear all scan history (admin only)
 * IMPORTANT: Must be defined BEFORE /:id route to avoid route conflict
 */
router.delete('/clear', requireAuth, requireAdmin, autoLog('network-scan', 'clear'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        // Delete all scan entries
        const deletedScans = NetworkScanRepository.deleteAll();
        
        // Also purge all history entries (history is linked via foreign key, but we'll clean it explicitly)
        const deletedHistory = NetworkScanRepository.purgeHistory(0); // 0 days = delete all
        
        // Optimize database after purge
        NetworkScanRepository.optimizeDatabase();

        logger.info('NetworkScan', `Cleared all scan data: ${deletedScans} scans, ${deletedHistory} history entries deleted`);

        res.json({
            success: true,
            result: {
                deletedScans,
                deletedHistory,
                totalDeleted: deletedScans + deletedHistory
            },
            message: `All scan data cleared: ${deletedScans} scans and ${deletedHistory} history entries deleted`
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to clear scan data:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to clear scan data',
                code: 'CLEAR_ERROR'
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
    const { hostname, hostnameSource } = req.body;

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
        const updateData: any = {
            hostname: hostname && hostname.trim() ? hostname.trim() : undefined
        };
        
        // If hostnameSource is provided, use it; otherwise set to 'manual' if hostname is set
        if (hostnameSource) {
            updateData.hostnameSource = hostnameSource;
        } else if (hostname && hostname.trim()) {
            updateData.hostnameSource = 'manual';
        } else {
            updateData.hostnameSource = null; // Clear source if hostname is cleared
        }
        
        const updated = NetworkScanRepository.update(ip, updateData);

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

// Route /auto-status moved above - see definition before /:id route

/**
 * POST /api/network-scan/unified-config
 * Save unified automatic scan configuration (new unified structure)
 * 
 * Body:
 * {
 *   enabled: boolean (master switch)
 *   fullScan?: {
 *     enabled: boolean
 *     interval: number (minutes: 15, 30, 60, 120, 360, 720, 1440)
 *     scanType: 'full' | 'quick'
 *   }
 *   refresh?: {
 *     enabled: boolean
 *     interval: number (minutes: 5, 10, 15, 30, 60)
 *   }
 * }
 */
router.post('/unified-config', requireAuth, autoLog('network-scan', 'unified-config'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { enabled, fullScan, refresh } = req.body;

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: {
                message: 'enabled must be a boolean',
                code: 'INVALID_ENABLED'
            }
        });
    }

    // Validate fullScan if provided
    if (fullScan) {
        if (typeof fullScan.enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'fullScan.enabled must be a boolean',
                    code: 'INVALID_FULLSCAN_ENABLED'
                }
            });
        }
        if (fullScan.enabled) {
            const validIntervals = [15, 30, 60, 120, 360, 720, 1440];
            if (!validIntervals.includes(fullScan.interval)) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: `fullScan.interval must be one of: ${validIntervals.join(', ')} minutes`,
                        code: 'INVALID_FULLSCAN_INTERVAL'
                    }
                });
            }
            if (fullScan.scanType !== 'full' && fullScan.scanType !== 'quick') {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'fullScan.scanType must be "full" or "quick"',
                        code: 'INVALID_FULLSCAN_TYPE'
                    }
                });
            }
        }
    }

    // Validate refresh if provided
    if (refresh) {
        if (typeof refresh.enabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'refresh.enabled must be a boolean',
                    code: 'INVALID_REFRESH_ENABLED'
                }
            });
        }
        if (refresh.enabled) {
            const validIntervals = [5, 10, 15, 30, 60];
            if (!validIntervals.includes(refresh.interval)) {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: `refresh.interval must be one of: ${validIntervals.join(', ')} minutes`,
                        code: 'INVALID_REFRESH_INTERVAL'
                    }
                });
            }
            if (refresh.scanType !== 'full' && refresh.scanType !== 'quick') {
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'refresh.scanType must be "full" or "quick"',
                        code: 'INVALID_REFRESH_TYPE'
                    }
                });
            }
        }
    }

    try {
        // Build unified config - always include fullScan and refresh objects even if disabled
        // This ensures the configuration structure is consistent
        const config: UnifiedAutoScanConfig = {
            enabled,
            fullScan: fullScan ? {
                enabled: fullScan.enabled || false,
                interval: fullScan.interval || 1440,
                scanType: fullScan.scanType || 'full'
            } : undefined,
            refresh: refresh ? {
                enabled: refresh.enabled || false,
                interval: refresh.interval || 10,
                scanType: refresh.scanType || 'quick'
            } : undefined
        };

        // Debug: Log the config being saved
        logger.info('NetworkScan', `Saving unified config: enabled=${config.enabled}, fullScan=${config.fullScan?.enabled || false}, refresh=${config.refresh?.enabled || false}`);
        logger.debug('NetworkScan', `Full config being saved: ${JSON.stringify(config)}`);

        // Save unified config and verify it was saved successfully
        const unifiedConfigSaved = AppConfigRepository.set('network_scan_unified_auto', JSON.stringify(config));
        if (!unifiedConfigSaved) {
            logger.error('NetworkScan', 'Failed to save unified config to database');
            return res.status(500).json({
                success: false,
                error: {
                    message: 'Failed to save unified config to database',
                    code: 'CONFIG_SAVE_ERROR'
                }
            });
        }
        logger.info('NetworkScan', `Saved unified config: enabled=${config.enabled}, fullScan=${config.fullScan?.enabled || false}, refresh=${config.refresh?.enabled || false}`);

        // Also update old configs for backward compatibility
        if (config.fullScan) {
            const oldConfigSaved = AppConfigRepository.set('network_scan_auto', JSON.stringify({
                enabled: config.enabled && config.fullScan.enabled,
                interval: config.fullScan.interval,
                scanType: config.fullScan.scanType
            }));
            if (!oldConfigSaved) {
                logger.warn('NetworkScan', 'Failed to save old scan config (backward compatibility)');
            }
        } else {
            AppConfigRepository.set('network_scan_auto', JSON.stringify({ enabled: false, interval: 30, scanType: 'quick' }));
        }

        if (config.refresh) {
            const refreshConfigSaved = AppConfigRepository.set('network_scan_refresh_auto', JSON.stringify({
                enabled: config.enabled && config.refresh.enabled,
                interval: config.refresh.interval
            }));
            if (!refreshConfigSaved) {
                logger.warn('NetworkScan', 'Failed to save refresh config (backward compatibility)');
            }
        } else {
            AppConfigRepository.set('network_scan_refresh_auto', JSON.stringify({ enabled: false, interval: 15 }));
        }

        // Verify the config was persisted by reading it back
        const savedConfigStr = AppConfigRepository.get('network_scan_unified_auto');
        if (!savedConfigStr) {
            logger.error('NetworkScan', 'Config was not found after saving - persistence issue detected');
            return res.status(500).json({
                success: false,
                error: {
                    message: 'Configuration was not persisted correctly',
                    code: 'CONFIG_PERSISTENCE_ERROR'
                }
            });
        }

        const savedConfig: UnifiedAutoScanConfig = JSON.parse(savedConfigStr);
        if (savedConfig.enabled !== config.enabled) {
            logger.error('NetworkScan', `Config persistence mismatch: expected enabled=${config.enabled}, got enabled=${savedConfig.enabled}`);
            return res.status(500).json({
                success: false,
                error: {
                    message: 'Configuration was not persisted correctly',
                    code: 'CONFIG_PERSISTENCE_ERROR'
                }
            });
        }

        // Update schedulers immediately
        networkScanScheduler.updateUnifiedConfig(config);
        logger.info('NetworkScan', 'Schedulers updated with new unified config');

        res.json({
            success: true,
            result: config
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to save unified config:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to save unified config',
                code: 'CONFIG_SAVE_ERROR'
            }
        });
    }
}));

// Routes /retention-config and /database-stats moved above - see definitions before /:id route (around line 900)
// Duplicate routes removed - they are already defined before /:id route

/**
 * POST /api/network-scan/purge
 * Execute manual purge based on current retention configuration
 */
router.post('/purge', requireAuth, requireAdmin, autoLog('network-scan', 'purge'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const result = executePurge();
        
        res.json({
            success: true,
            result: {
                ...result,
                message: `Purge completed: ${result.totalDeleted} entries deleted`
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to execute purge:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to execute purge',
                code: 'PURGE_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/purge/history
 * Purge only history entries
 * Body: { retentionDays?: number } (0 = delete all, default: use config)
 */
router.post('/purge/history', requireAuth, requireAdmin, autoLog('network-scan', 'purge-history'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const { retentionDays } = req.body;
        const days = retentionDays !== undefined ? retentionDays : getRetentionConfig().historyRetentionDays;
        const deleted = purgeHistoryOnly(days);
        
        res.json({
            success: true,
            result: {
                deleted,
                retentionDays: days
            },
            message: `History purge completed: ${deleted} entries deleted`
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to purge history:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to purge history',
                code: 'PURGE_HISTORY_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/purge/scans
 * Purge only scan entries (all scans older than retention)
 * Body: { retentionDays?: number } (0 = delete all, default: use config)
 */
router.post('/purge/scans', requireAuth, requireAdmin, autoLog('network-scan', 'purge-scans'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const { retentionDays } = req.body;
        const days = retentionDays !== undefined ? retentionDays : getRetentionConfig().scanRetentionDays;
        const deleted = purgeScansOnly(days);
        
        res.json({
            success: true,
            result: {
                deleted,
                retentionDays: days
            },
            message: `Scan purge completed: ${deleted} entries deleted`
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to purge scans:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to purge scans',
                code: 'PURGE_SCANS_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/purge/offline
 * Purge only offline scan entries
 * Body: { retentionDays?: number } (0 = delete all, default: use config)
 */
router.post('/purge/offline', requireAuth, requireAdmin, autoLog('network-scan', 'purge-offline'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const { retentionDays } = req.body;
        const days = retentionDays !== undefined ? retentionDays : getRetentionConfig().offlineRetentionDays;
        const deleted = purgeOfflineOnly(days);
        
        res.json({
            success: true,
            result: {
                deleted,
                retentionDays: days
            },
            message: `Offline purge completed: ${deleted} entries deleted`
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to purge offline scans:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to purge offline scans',
                code: 'PURGE_OFFLINE_ERROR'
            }
        });
    }
}));

/**
 * POST /api/network-scan/purge/clear-all
 * Clear ALL scan data (for dev/testing)
 * WARNING: This deletes everything!
 */
router.post('/purge/clear-all', requireAuth, requireAdmin, autoLog('network-scan', 'clear-all'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const result = clearAllScanData();
        
        res.json({
            success: true,
            result: {
                ...result,
                message: `All scan data cleared: ${result.scansDeleted} scans, ${result.historyDeleted} history entries`
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to clear all scan data:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to clear all scan data',
                code: 'CLEAR_ALL_ERROR'
            }
        });
    }
}));

// Route /database-stats moved above - see definition before /:id route

/**
 * POST /api/network-scan/optimize-database
 * Optimize database by running VACUUM
 */
router.post('/optimize-database', requireAuth, requireAdmin, autoLog('network-scan', 'optimize-database'), asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        NetworkScanRepository.optimizeDatabase();
        
        res.json({
            success: true,
            result: {
                message: 'Database optimization completed'
            }
        });
    } catch (error: any) {
        logger.error('NetworkScan', 'Failed to optimize database:', error);
        return res.status(500).json({
            success: false,
            error: {
                message: error.message || 'Failed to optimize database',
                code: 'OPTIMIZE_ERROR'
            }
        });
    }
}));

export default router;

