/**
 * Plugin management routes
 * 
 * Handles plugin configuration, enabling/disabling, and stats retrieval
 */

import { Router } from 'express';
import { pluginManager } from '../services/pluginManager.js';
import { PluginConfigRepository } from '../database/models/PluginConfig.js';
import { loggingService } from '../services/loggingService.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';
import { logger } from '../utils/logger.js';
import type { PluginConfig } from '../plugins/base/PluginInterface.js';
import { freeboxApi } from '../services/freeboxApi.js';

const router = Router();

// GET /api/plugins - Get all plugins with their status
// Optimized: Lightweight connection status check without heavy API calls
router.get('/', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const plugins = pluginManager.getAllPlugins();
    
    const pluginsWithStatus = plugins.map((plugin) => {
        const dbConfig = PluginConfigRepository.findByPluginId(plugin.getId());
        const isEnabled = plugin.isEnabled();
        const pluginId = plugin.getId();
        
        // Lightweight connection status check (no API calls)
        let connectionStatus = false;
        if (isEnabled) {
            if (pluginId === 'freebox') {
                // Check Freebox connection status using lightweight method
                connectionStatus = freeboxApi.isLoggedIn();
            } else if (pluginId === 'unifi') {
                // Check UniFi connection status using plugin's internal state
                try {
                    const unifiPlugin = pluginManager.getPlugin('unifi') as any;
                    if (unifiPlugin && unifiPlugin.apiService) {
                        // Use the lightweight isLoggedIn() method from UniFiApiService
                        connectionStatus = unifiPlugin.apiService.isLoggedIn();
                    } else {
                        // Fallback: if plugin is enabled and configured, assume not connected yet
                        connectionStatus = false;
                    }
                } catch {
                    connectionStatus = false;
                }
            } else if (pluginId === 'scan-reseau') {
                // Scanner plugin doesn't need external connection - if enabled, it's "connected"
                connectionStatus = isEnabled;
            } else {
                // For other plugins, check if configured
                connectionStatus = dbConfig !== null;
            }
        }
        
        // Basic plugin info without heavy API calls
        const pluginData = {
            id: pluginId,
            name: plugin.getName(),
            version: plugin.getVersion(),
            enabled: isEnabled,
            configured: dbConfig !== null,
            connectionStatus,
            settings: dbConfig?.settings || {}
        };

        // Validate plugin data structure
        if (!pluginData.id || !pluginData.name || typeof pluginData.enabled !== 'boolean') {
            logger.warn('Plugin', `Invalid plugin data structure for plugin ${pluginId}`);
        }

        return pluginData;
    });

    // Validate response structure
    if (!Array.isArray(pluginsWithStatus)) {
        throw createError('Invalid plugins data format', 500, 'INVALID_PLUGINS_FORMAT');
    }

    res.json({
        success: true,
        result: pluginsWithStatus
    });
}), autoLog('plugin.list', 'plugin'));

// GET /api/plugins/:id - Get plugin details
router.get('/:id', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const pluginId = req.params.id;
    const plugin = pluginManager.getPlugin(pluginId);
    
    if (!plugin) {
        throw createError('Plugin not found', 404, 'PLUGIN_NOT_FOUND');
    }

    const dbConfig = PluginConfigRepository.findByPluginId(pluginId);
    const isEnabled = plugin.isEnabled();
    
    let connectionStatus = false;
    if (isEnabled) {
        try {
            const testResult = await pluginManager.testPluginConnection(pluginId);
            connectionStatus = testResult.success;
        } catch {
            connectionStatus = false;
        }
    }

    res.json({
        success: true,
        result: {
            id: plugin.getId(),
            name: plugin.getName(),
            version: plugin.getVersion(),
            enabled: isEnabled,
            configured: dbConfig !== null,
            connectionStatus,
            settings: dbConfig?.settings || {}
        }
    });
}), autoLog('plugin.get', 'plugin', (req) => req.params.id));

// GET /api/plugins/:id/stats - Get plugin statistics
router.get('/:id/stats', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const pluginId = req.params.id;
    const startTime = Date.now();
    
    try {
        const stats = await pluginManager.getPluginStats(pluginId);
        const executionTime = Date.now() - startTime;
        
        res.json({
            success: true,
            result: stats,
            data: stats, // Also include as 'data' for compatibility with MyNetwork format
            source: `plugin_${pluginId}_stats`,
            timestamp: new Date().toISOString(),
            timing: {
                execution_ms: executionTime,
                total_execution: executionTime
            },
            endpoint: 'stats',
            plugin_id: pluginId
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get plugin stats';
        throw createError(message, 500, 'PLUGIN_STATS_ERROR');
    }
}), autoLog('plugin.getStats', 'plugin', (req) => req.params.id));

// GET /api/plugins/stats/all - Get statistics from all enabled plugins
router.get('/stats/all', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    
    try {
        const allStatsResult = await pluginManager.getAllStatsWithTiming();
        const totalExecutionTime = Date.now() - startTime;
        
        // Count successful plugins
        const successfulPlugins = Object.values(allStatsResult.stats).filter(stats => stats !== null).length;
        const totalPlugins = Object.keys(allStatsResult.stats).length;
        
        res.json({
            success: true,
            result: allStatsResult.stats,
            data: allStatsResult.stats, // Also include as 'data' for compatibility with MyNetwork format
            source: 'unified_stats_api',
            timestamp: new Date().toISOString(),
            timing: {
                ...allStatsResult.timing,
                total_execution: totalExecutionTime,
                execution_ms: totalExecutionTime
            },
            endpoint: 'stats/all',
            modules_loaded: successfulPlugins,
            total_plugins: totalPlugins
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get all stats';
        throw createError(message, 500, 'PLUGIN_STATS_ERROR');
    }
}), autoLog('plugin.getAllStats', 'plugin'));

// POST /api/plugins/:id/config - Configure plugin (admin only)
router.post('/:id/config', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const pluginId = req.params.id;
    const plugin = pluginManager.getPlugin(pluginId);
    
    if (!plugin) {
        throw createError('Plugin not found', 404, 'PLUGIN_NOT_FOUND');
    }

    const { enabled, settings } = req.body;

    if (enabled === undefined && !settings) {
        throw createError('Either enabled or settings must be provided', 400, 'MISSING_FIELDS');
    }

    // Get current config
    const currentConfig = PluginConfigRepository.findByPluginId(pluginId);
    
    // Merge settings: new settings override old ones, but keep sensitive fields if not provided
    const mergedSettings = { ...(currentConfig?.settings || {}) };
    if (settings) {
        // Merge new settings, but only update fields that are explicitly provided
        // This ensures password/apiKey are not lost if not provided in update
        for (const [key, value] of Object.entries(settings)) {
            // Only update if value is provided (not empty string for password/apiKey)
            if (value !== undefined && value !== null) {
                // For password and apiKey, allow empty string to clear them, but don't overwrite with undefined
                if (key === 'password' || key === 'apiKey') {
                    if (value !== '') {
                        mergedSettings[key] = value;
                    } else {
                        // Empty string means clear the password
                        delete mergedSettings[key];
                    }
                } else {
                    mergedSettings[key] = value;
                }
            }
        }
    }
    
    const newConfig: PluginConfig = {
        id: pluginId,
        enabled: enabled !== undefined ? enabled : (currentConfig?.enabled || false),
        settings: mergedSettings
    };
    
    // Debug log to verify password is being saved
    if (pluginId === 'unifi' && settings?.password) {
        console.log(`[PluginConfig] Saving UniFi config with password: ${settings.password ? '***' : 'missing'}`);
    }

    // Update plugin configuration
    await pluginManager.updatePluginConfig(pluginId, newConfig);

    // If scan-reseau plugin was enabled/disabled, update network scan schedulers
    if (pluginId === 'scan-reseau') {
        try {
            const { networkScanScheduler } = await import('../services/networkScanScheduler.js');
            networkScanScheduler.checkPluginStatusAndUpdate();
            logger.info('Plugin', 'Network scan schedulers updated after scan-reseau plugin state change');
        } catch (error) {
            logger.error('Plugin', 'Failed to update network scan schedulers:', error);
            // Don't fail the request if scheduler update fails
        }
    }

    await loggingService.logUserAction(
        req.user!.userId,
        req.user!.username,
        'plugin.configure',
        'plugin',
        {
            resourceId: pluginId,
            details: { enabled: newConfig.enabled, settingsKeys: Object.keys(newConfig.settings) }
        }
    );

    res.json({
        success: true,
        result: {
            message: 'Plugin configuration updated',
            config: newConfig
        }
    });
}), autoLog('plugin.configure', 'plugin', (req) => req.params.id));

// POST /api/plugins/:id/test - Test plugin connection (admin only)
router.post('/:id/test', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const pluginId = req.params.id;
    const plugin = pluginManager.getPlugin(pluginId);
    
    if (!plugin) {
        throw createError('Plugin not found', 404, 'PLUGIN_NOT_FOUND');
    }

    // If test settings are provided in request body, use them temporarily
    // Otherwise use current plugin configuration
    const testSettings = req.body.settings;
    let connectionStatus = false;
    let errorMessage: string | null = null;

    try {
        if (testSettings && Object.keys(testSettings).length > 0) {
            // Temporarily configure plugin with test settings
            const dbConfig = PluginConfigRepository.findByPluginId(pluginId);
            const currentConfig: PluginConfig | null = dbConfig ? {
                id: dbConfig.pluginId,
                enabled: dbConfig.enabled,
                settings: dbConfig.settings
            } : null;
            
            const testConfig: PluginConfig = {
                id: pluginId,
                enabled: currentConfig?.enabled || false,
                settings: { ...(currentConfig?.settings || {}), ...testSettings }
            };
            
            // Reinitialize plugin with test config
            await plugin.stop();
            await plugin.initialize(testConfig);
            
            // Test connection
            connectionStatus = await plugin.testConnection();
            
            // Restore original config
            if (currentConfig) {
                await plugin.stop();
                await plugin.initialize(currentConfig);
                if (currentConfig.enabled) {
                    await plugin.start();
                }
            } else {
                // If no original config, just stop the plugin
                await plugin.stop();
            }
        } else {
            // Use current plugin configuration
            const testResult = await pluginManager.testPluginConnection(pluginId);
            connectionStatus = testResult.success;
            if (!testResult.success && testResult.error) {
                errorMessage = testResult.error;
            }
        }
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[PluginTest] Error testing ${pluginId}:`, error);
        connectionStatus = false;
    }

    // Build a more informative message
    let message: string;
    if (connectionStatus) {
        message = 'Connection successful';
    } else {
        if (errorMessage) {
            // Include error details in the message
            message = `Connection failed: ${errorMessage}`;
        } else {
            // Fallback message with plugin-specific details
            if (pluginId === 'unifi') {
                message = 'Connection failed: Unable to connect or retrieve data from UniFi. Verify URL, credentials, and site name. Check backend logs for details.';
            } else if (pluginId === 'freebox') {
                message = 'Connection failed: Unable to connect to Freebox API. Check backend logs for details.';
            } else {
                message = 'Connection failed: Unable to connect. Check backend logs for details.';
            }
        }
    }

    res.json({
        success: true,
        result: {
            connected: connectionStatus,
            message,
            error: errorMessage || undefined
        }
    });
}), autoLog('plugin.test', 'plugin', (req) => req.params.id));

export default router;

