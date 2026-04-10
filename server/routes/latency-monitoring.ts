/**
 * Latency Monitoring API Routes
 * 
 * Handles API requests for latency monitoring functionality
 */

import { Router } from 'express';
import { latencyMonitoringService } from '../services/latencyMonitoringService.js';
import { logger } from '../utils/logger.js';

const router = Router();
const isValidIpv4 = (ip: string | undefined): ip is string =>
    !!ip && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip);

// Validate batch IP array, returns error response or null if valid
const validateIpBatch = (ips: unknown, res: any): boolean => {
    if (!Array.isArray(ips) || ips.length === 0) {
        res.status(400).json({ success: false, error: { message: 'Invalid request body. Expected { ips: string[] }' } });
        return false;
    }
    const invalid = ips.filter((ip: string) => !isValidIpv4(ip));
    if (invalid.length > 0) {
        res.status(400).json({ success: false, error: { message: `Invalid IP addresses: ${invalid.join(', ')}` } });
        return false;
    }
    return true;
};

/**
 * GET /api/latency-monitoring/status
 * Get list of all IPs with monitoring enabled
 */
router.get('/status', (req, res) => {
    try {
        const enabledIps = latencyMonitoringService.getMonitoringStatus();
        res.json({
            success: true,
            result: enabledIps
        });
    } catch (error: any) {
        logger.error('LatencyMonitoringAPI', 'Failed to get monitoring status:', error.message || error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get monitoring status',
                details: error.message || String(error)
            }
        });
    }
});

/**
 * POST /api/latency-monitoring/enable/:ip
 * Enable monitoring for an IP address
 */
router.post('/enable/:ip', (req, res) => {
    try {
        const ip = req.params.ip;
        
        if (!isValidIpv4(ip)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Invalid IP address format'
                }
            });
        }

        latencyMonitoringService.startMonitoring(ip);
        
        res.json({
            success: true,
            result: {
                ip,
                enabled: true
            }
        });
    } catch (error: any) {
        logger.error('LatencyMonitoringAPI', `Failed to enable monitoring for ${req.params.ip}:`, error.message || error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to enable monitoring',
                details: error.message || String(error)
            }
        });
    }
});

/**
 * POST /api/latency-monitoring/disable/:ip
 * Disable monitoring for an IP address
 */
router.post('/disable/:ip', (req, res) => {
    try {
        const ip = req.params.ip;
        
        if (!isValidIpv4(ip)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Invalid IP address format'
                }
            });
        }

        latencyMonitoringService.stopMonitoring(ip);
        
        res.json({
            success: true,
            result: {
                ip,
                enabled: false
            }
        });
    } catch (error: any) {
        logger.error('LatencyMonitoringAPI', `Failed to disable monitoring for ${req.params.ip}:`, error.message || error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to disable monitoring',
                details: error.message || String(error)
            }
        });
    }
});

/**
 * GET /api/latency-monitoring/measurements/:ip
 * Get measurements for an IP address
 * Query params: ?days=30 (default: 30)
 */
router.get('/measurements/:ip', (req, res) => {
    try {
        const ip = req.params.ip;
        const days = parseInt(req.query.days as string) || 30;
        
        if (!isValidIpv4(ip)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Invalid IP address format'
                }
            });
        }

        const measurements = latencyMonitoringService.getMeasurements(ip, days);
        
        const formattedMeasurements = measurements.map(m => ({
            latency: m.latency !== null ? Number(m.latency) : null,
            packetLoss: m.packetLoss,
            measuredAt: m.measuredAt.toISOString()
        }));
        
        // Debug: log sample measurements
        if (formattedMeasurements.length > 0) {
            const sample = formattedMeasurements.slice(0, 5);
            logger.debug('LatencyMonitoringAPI', `Sample measurements for ${ip}:`, sample);
        }
        
        res.json({
            success: true,
            result: formattedMeasurements
        });
    } catch (error: any) {
        logger.error('LatencyMonitoringAPI', `Failed to get measurements for ${req.params.ip}:`, error.message || error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get measurements',
                details: error.message || String(error)
            }
        });
    }
});

/**
 * GET /api/latency-monitoring/stats/:ip
 * Get statistics for an IP address (Avg1h, Max)
 */
router.get('/stats/:ip', (req, res) => {
    try {
        const ip = req.params.ip;
        
        if (!isValidIpv4(ip)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Invalid IP address format'
                }
            });
        }

        const stats = latencyMonitoringService.getStatistics(ip);
        
        res.json({
            success: true,
            result: {
                avg1h: stats.avg1h,
                max: stats.max,
                min: stats.min,
                avg24h: stats.avg24h,
                packetLossPercent: stats.packetLossPercent,
                totalMeasurements: stats.totalMeasurements
            }
        });
    } catch (error: any) {
        logger.error('LatencyMonitoringAPI', `Failed to get stats for ${req.params.ip}:`, error.message || error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get statistics',
                details: error.message || String(error)
            }
        });
    }
});

/**
 * POST /api/latency-monitoring/stats/batch
 * Get statistics for multiple IPs in batch
 * Body: { ips: string[] }
 */
router.post('/stats/batch', (req, res) => {
    try {
        const { ips } = req.body;
        if (!validateIpBatch(ips, res)) return;

        const stats = latencyMonitoringService.getStatisticsBatch(ips);
        
        res.json({
            success: true,
            result: stats
        });
    } catch (error: any) {
        logger.error('LatencyMonitoringAPI', 'Failed to get batch stats:', error.message || error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get batch statistics',
                details: error.message || String(error)
            }
        });
    }
});

/**
 * POST /api/latency-monitoring/status/batch
 * Get monitoring status for multiple IPs in batch
 * Body: { ips: string[] }
 */
router.post('/status/batch', (req, res) => {
    try {
        const { ips } = req.body;
        if (!validateIpBatch(ips, res)) return;

        const status = latencyMonitoringService.getMonitoringStatusBatch(ips);
        
        res.json({
            success: true,
            result: status
        });
    } catch (error: any) {
        logger.error('LatencyMonitoringAPI', 'Failed to get batch status:', error.message || error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to get batch status',
                details: error.message || String(error)
            }
        });
    }
});

export default router;

