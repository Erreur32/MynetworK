/**
 * Metrics export routes
 * 
 * Exports metrics in Prometheus and InfluxDB formats
 */

import { Router } from 'express';
import { 
    generatePrometheusMetrics, 
    generateInfluxDBMetrics,
    getDefaultMetricsConfig,
    type MetricsConfig
} from '../services/metricsService.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';
import { loggingService } from '../services/loggingService.js';
import { getDatabase } from '../database/connection.js';

const router = Router();

// GET /api/metrics/prometheus - Export metrics in Prometheus format
router.get('/prometheus', asyncHandler(async (_req, res) => {
    try {
        const metrics = await generatePrometheusMetrics();
        res.set('Content-Type', 'text/plain; version=0.0.4');
        res.send(metrics);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate Prometheus metrics';
        throw createError(message, 500, 'METRICS_EXPORT_ERROR');
    }
}));

// GET /api/metrics/influxdb - Export metrics in InfluxDB line protocol format
router.get('/influxdb', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const metrics = await generateInfluxDBMetrics();
        
        // Log action
        await loggingService.logUserAction(
            req.user!.userId,
            req.user!.username,
            'metrics.export',
            'metrics',
            { details: { format: 'influxdb' } }
        );
        
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate InfluxDB metrics';
        throw createError(message, 500, 'METRICS_EXPORT_ERROR');
    }
}), autoLog('metrics.export', 'metrics'));

// GET /api/metrics/config - Get metrics export configuration
router.get('/config', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const db = getDatabase();
        const stmt = db.prepare('SELECT value FROM app_config WHERE key = ?');
        const row = stmt.get('metrics_config') as { value: string } | undefined;
        
        let config: MetricsConfig;
        if (row) {
            try {
                config = JSON.parse(row.value);
            } catch {
                config = getDefaultMetricsConfig();
            }
        } else {
            config = getDefaultMetricsConfig();
        }
        
        res.json({
            success: true,
            result: config
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get metrics config';
        throw createError(message, 500, 'METRICS_CONFIG_ERROR');
    }
}), autoLog('metrics.getConfig', 'metrics'));

// POST /api/metrics/config - Update metrics export configuration
router.post('/config', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const config: MetricsConfig = req.body.config || getDefaultMetricsConfig();
        
        // Validate config structure
        if (!config.prometheus || !config.influxdb) {
            throw createError('Invalid configuration structure', 400, 'INVALID_CONFIG');
        }
        
        const db = getDatabase();
        
        // Ensure app_config table exists
        db.exec(`
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const stmt = db.prepare(`
            INSERT INTO app_config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `);
        
        stmt.run('metrics_config', JSON.stringify(config));
        
        // Log action
        await loggingService.logUserAction(
            req.user!.userId,
            req.user!.username,
            'metrics.updateConfig',
            'metrics',
            { details: { config } }
        );
        
        res.json({
            success: true,
            result: {
                message: 'Metrics configuration updated successfully',
                config
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update metrics config';
        throw createError(message, 500, 'METRICS_CONFIG_ERROR');
    }
}), autoLog('metrics.updateConfig', 'metrics'));

export default router;

