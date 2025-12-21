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

// GET /api/metrics/prometheus/audit - Audit Prometheus endpoint functionality
router.get('/prometheus/audit', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const auditResults: {
            endpoint: string;
            status: 'success' | 'error';
            message: string;
            metricsCount?: number;
            sampleMetrics?: string[];
            errors?: string[];
        }[] = [];
        
        // Test 1: Generate Prometheus metrics
        try {
            const metrics = await generatePrometheusMetrics();
            const metricsLines = metrics.split('\n').filter(line => line.trim() !== '' && !line.startsWith('#'));
            const helpLines = metrics.split('\n').filter(line => line.startsWith('# HELP'));
            const typeLines = metrics.split('\n').filter(line => line.startsWith('# TYPE'));
            
            // Count unique metric names (lines that start with mynetwork_ and don't start with #)
            const metricNames = new Set<string>();
            metricsLines.forEach(line => {
                const match = line.match(/^(mynetwork_[a-z_]+)/);
                if (match) {
                    metricNames.add(match[1]);
                }
            });
            
            // Get sample metrics (first 10 unique metric names)
            const sampleMetrics = Array.from(metricNames).slice(0, 10);
            
            auditResults.push({
                endpoint: 'generatePrometheusMetrics',
                status: 'success',
                message: `Metrics generated successfully: ${metricNames.size} unique metrics, ${metricsLines.length} data points`,
                metricsCount: metricNames.size,
                sampleMetrics
            });
        } catch (error) {
            auditResults.push({
                endpoint: 'generatePrometheusMetrics',
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
                errors: [error instanceof Error ? error.stack || error.message : String(error)]
            });
        }
        
        // Test 2: Check if endpoint is accessible (self-test)
        try {
            const testUrl = `http://localhost:${process.env.PORT || 3003}/api/metrics/prometheus`;
            const response = await fetch(testUrl);
            
            if (response.ok) {
                const content = await response.text();
                const lines = content.split('\n').filter(line => line.trim() !== '');
                
                auditResults.push({
                    endpoint: '/api/metrics/prometheus',
                    status: 'success',
                    message: `Endpoint accessible: HTTP ${response.status}, ${lines.length} lines returned`,
                    metricsCount: lines.filter(line => !line.startsWith('#') && line.trim() !== '').length
                });
            } else {
                auditResults.push({
                    endpoint: '/api/metrics/prometheus',
                    status: 'error',
                    message: `Endpoint returned HTTP ${response.status}`,
                    errors: [`HTTP ${response.status}: ${response.statusText}`]
                });
            }
        } catch (error) {
            auditResults.push({
                endpoint: '/api/metrics/prometheus',
                status: 'error',
                message: `Failed to access endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`,
                errors: [error instanceof Error ? error.stack || error.message : String(error)]
            });
        }
        
        // Log audit action
        await loggingService.logUserAction(
            req.user!.userId,
            req.user!.username,
            'metrics.audit',
            'metrics',
            { details: { results: auditResults } }
        );
        
        res.json({
            success: true,
            result: {
                auditDate: new Date().toISOString(),
                results: auditResults,
                summary: {
                    total: auditResults.length,
                    success: auditResults.filter(r => r.status === 'success').length,
                    errors: auditResults.filter(r => r.status === 'error').length
                }
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to audit Prometheus';
        throw createError(message, 500, 'METRICS_AUDIT_ERROR');
    }
}), autoLog('metrics.audit', 'metrics'));

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

