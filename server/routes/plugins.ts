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
                        // Trim API key to avoid whitespace issues
                        mergedSettings[key] = typeof value === 'string' ? value.trim() : value;
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
    
    // Debug log to verify password and API key are being saved
    if (pluginId === 'unifi') {
        if (settings?.password) {
            logger.debug('PluginConfig', `Saving UniFi config with password: ${settings.password ? '***' : 'missing'}`);
        }
        if (settings?.apiKey) {
            const apiKeyPreview = typeof settings.apiKey === 'string' && settings.apiKey.length > 8 
                ? `${settings.apiKey.substring(0, 8)}...` 
                : '***';
            logger.debug('PluginConfig', `Saving UniFi config with API key: ${apiKeyPreview} (length: ${typeof settings.apiKey === 'string' ? settings.apiKey.length : 'N/A'})`);
        }
        // Log final merged settings for debugging
        if (mergedSettings.apiKey) {
            const finalApiKeyPreview = typeof mergedSettings.apiKey === 'string' && mergedSettings.apiKey.length > 8 
                ? `${mergedSettings.apiKey.substring(0, 8)}...` 
                : '***';
            logger.debug('PluginConfig', `Final merged UniFi settings - apiMode: ${mergedSettings.apiMode}, apiKey: ${finalApiKeyPreview} (length: ${typeof mergedSettings.apiKey === 'string' ? mergedSettings.apiKey.length : 'N/A'})`);
        }
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
    
    // Store original config for restoration (needed in finally block)
    let currentConfig: PluginConfig | null = null;
    let needsRestore = false;

    try {
        if (testSettings && Object.keys(testSettings).length > 0) {
            // Temporarily configure plugin with test settings
            const dbConfig = PluginConfigRepository.findByPluginId(pluginId);
            currentConfig = dbConfig ? {
                id: dbConfig.pluginId,
                enabled: dbConfig.enabled,
                settings: dbConfig.settings
            } : null;
            
            // Merge test settings with current config
            let mergedTestSettings = { ...(currentConfig?.settings || {}), ...testSettings };
            
            // CRITICAL: Clean up merged settings based on apiMode to prevent incorrect auto-detection
            // For UniFi plugin, if testing in controller mode, remove apiKey to prevent auto-switching to Site Manager
            // If testing in site-manager mode, remove controller-specific fields
            if (pluginId === 'unifi') {
                const testApiMode = (testSettings.apiMode as string) || (mergedTestSettings.apiMode as string) || 'controller';
                if (testApiMode === 'controller') {
                    // Remove apiKey when testing in controller mode to prevent auto-detection to Site Manager
                    delete mergedTestSettings.apiKey;
                    logger.debug('PluginTest', 'UniFi test in controller mode - removed apiKey from test settings to prevent auto-detection');
                } else if (testApiMode === 'site-manager') {
                    // Remove controller-specific fields when testing in site-manager mode
                    delete mergedTestSettings.url;
                    delete mergedTestSettings.username;
                    delete mergedTestSettings.password;
                    delete mergedTestSettings.site;
                    logger.debug('PluginTest', 'UniFi test in site-manager mode - removed controller fields from test settings');
                }
            }
            
            // CRITICAL: Compare test settings with current config to avoid unnecessary reinitialization
            // If settings are identical, test with current config without stopping/restarting the plugin
            const currentSettings = currentConfig?.settings || {};
            
            // Helper function to normalize values for comparison
            const normalizeValue = (value: any): any => {
                if (value === null || value === undefined) return '';
                if (typeof value === 'string') return value.trim();
                return value;
            };
            
            // Check if test settings are identical to current settings
            // Only compare the keys that are in testSettings (don't require all keys to match)
            const settingsAreIdentical = Object.keys(testSettings).every(key => {
                const testValue = normalizeValue(testSettings[key]);
                const currentValue = normalizeValue(currentSettings[key]);
                const isEqual = testValue === currentValue;
                if (!isEqual) {
                    logger.debug('PluginTest', `Setting ${key} differs: test="${testValue}" vs current="${currentValue}"`);
                }
                return isEqual;
            }) && Object.keys(testSettings).length > 0; // At least one setting provided
            
            logger.debug('PluginTest', `Settings comparison for ${pluginId}: identical=${settingsAreIdentical}, enabled=${currentConfig?.enabled}, pluginEnabled=${plugin.isEnabled()}`);
            
            if (settingsAreIdentical && currentConfig) {
                // Settings are identical to current config - check if plugin is already enabled and working
                // If plugin is enabled, check actual connection status without testing (to avoid breaking active connection)
                // If plugin is disabled, do a proper test
                if (currentConfig.enabled && plugin.isEnabled()) {
                    // Plugin is already enabled with these exact settings - check actual connection status
                    // without doing a full test (which would risk breaking active connection with 429 errors)
                    logger.debug('PluginTest', `Test settings identical to current config for ${pluginId}, plugin is enabled - checking connection status without full test`);
                    
                    // Check actual connection status for UniFi plugin
                    if (pluginId === 'unifi') {
                        try {
                            const unifiPlugin = plugin as any;
                            if (unifiPlugin && unifiPlugin.apiService) {
                                // Check if actually logged in
                                const isLoggedIn = unifiPlugin.apiService.isLoggedIn();
                                if (isLoggedIn) {
                                    // Plugin is already connected with these exact settings - return success immediately
                                    // DO NOT do a test - it would risk breaking the active connection (429 errors, etc.)
                                    logger.debug('PluginTest', `Plugin ${pluginId} is already connected with identical settings - returning success without test`);
                                    connectionStatus = true;
                                } else {
                                    // Plugin is enabled but not connected - this is a problem, but don't test
                                    // Testing would risk breaking things. Just report the status.
                                    logger.debug('PluginTest', `Plugin ${pluginId} is enabled but not connected - reporting status without test to avoid breaking connection`);
                                    connectionStatus = false;
                                    errorMessage = 'Plugin is enabled but not connected. Try restarting the plugin or check the configuration.';
                                }
                            } else {
                                // Can't check status - assume not connected but don't test to avoid breaking things
                                logger.debug('PluginTest', `Cannot check connection status for ${pluginId} - reporting not connected without test`);
                                connectionStatus = false;
                                errorMessage = 'Cannot verify connection status. Plugin may need to be restarted.';
                            }
                        } catch (error) {
                            // Error checking status - don't test, just report error
                            logger.debug('PluginTest', `Error checking connection status for ${pluginId}:`, error);
                            connectionStatus = false;
                            errorMessage = error instanceof Error ? error.message : 'Error checking connection status';
                        }
                    } else {
                        // For other plugins, check connection status if available, otherwise assume working if enabled
                        try {
                            // Try to check actual connection status without doing a full test
                            if (pluginId === 'freebox') {
                                const { freeboxApi } = await import('../services/freeboxApi.js');
                                connectionStatus = freeboxApi.isLoggedIn();
                            } else {
                                // For other plugins, assume working if enabled
                                connectionStatus = true;
                            }
                        } catch {
                            // If check fails, assume working if enabled (don't test to avoid breaking)
                            connectionStatus = true;
                        }
                    }
                    // No restoration needed - plugin was never modified
                } else {
                    // Plugin is disabled or not enabled - safe to test
                    logger.debug('PluginTest', `Test settings identical to current config for ${pluginId}, plugin disabled - testing without reinitialization`);
                    const testResult = await pluginManager.testPluginConnection(pluginId);
                    connectionStatus = testResult.success;
                    if (!testResult.success && testResult.error) {
                        errorMessage = testResult.error;
                    }
                    // No restoration needed - plugin was never modified
                }
            } else {
                // Settings are different - need to temporarily reconfigure plugin
                const testConfig: PluginConfig = {
                    id: pluginId,
                    enabled: currentConfig?.enabled || false,
                    settings: mergedTestSettings
                };
                
                // Mark that we need to restore the config (even if error occurs)
                needsRestore = true;
                
                // Reinitialize plugin with test config
                await plugin.stop();
                await plugin.initialize(testConfig);
                
                // Test connection
                connectionStatus = await plugin.testConnection();
                
                // Restore original config (only if test succeeded, otherwise restore in finally)
                if (currentConfig) {
                    await plugin.stop();
                    await plugin.initialize(currentConfig);
                    if (currentConfig.enabled) {
                        await plugin.start();
                    }
                    needsRestore = false; // Successfully restored
                } else {
                    // If no original config, just stop the plugin
                    await plugin.stop();
                    needsRestore = false; // Nothing to restore
                }
            }
        } else {
            // No test settings provided - test with current plugin configuration
            // BUT: If plugin is already enabled and connected, just check status without full test
            if (plugin.isEnabled()) {
                if (pluginId === 'unifi') {
                    try {
                        const unifiPlugin = plugin as any;
                        if (unifiPlugin && unifiPlugin.apiService) {
                            const isLoggedIn = unifiPlugin.apiService.isLoggedIn();
                            if (isLoggedIn) {
                                // Already connected - return success without testing
                                logger.debug('PluginTest', `Plugin ${pluginId} is already connected - returning success without test`);
                                connectionStatus = true;
                            } else {
                                // Enabled but not connected - do a test to try to connect
                                logger.debug('PluginTest', `Plugin ${pluginId} is enabled but not connected - doing test to establish connection`);
                                const testResult = await pluginManager.testPluginConnection(pluginId);
                                connectionStatus = testResult.success;
                                if (!testResult.success && testResult.error) {
                                    errorMessage = testResult.error;
                                }
                            }
                        } else {
                            // Can't check - do a test
                            const testResult = await pluginManager.testPluginConnection(pluginId);
                            connectionStatus = testResult.success;
                            if (!testResult.success && testResult.error) {
                                errorMessage = testResult.error;
                            }
                        }
                    } catch (error) {
                        // Error checking - do a test
                        logger.debug('PluginTest', `Error checking connection status, doing test:`, error);
                        const testResult = await pluginManager.testPluginConnection(pluginId);
                        connectionStatus = testResult.success;
                        if (!testResult.success && testResult.error) {
                            errorMessage = testResult.error;
                        }
                    }
                } else {
                    // For other plugins, do a test
                    const testResult = await pluginManager.testPluginConnection(pluginId);
                    connectionStatus = testResult.success;
                    if (!testResult.success && testResult.error) {
                        errorMessage = testResult.error;
                    }
                }
            } else {
                // Plugin is disabled - safe to test
                const testResult = await pluginManager.testPluginConnection(pluginId);
                connectionStatus = testResult.success;
                if (!testResult.success && testResult.error) {
                    errorMessage = testResult.error;
                }
            }
        }
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[PluginTest] Error testing ${pluginId}:`, error);
        connectionStatus = false;
        // Error occurred - will restore in finally block if needed
    } finally {
        // CRITICAL: Always restore original config if we modified it and restoration didn't happen
        // This ensures the plugin is never left in a broken state after a test
        if (needsRestore && currentConfig) {
            try {
                await plugin.stop();
                await plugin.initialize(currentConfig);
                if (currentConfig.enabled) {
                    await plugin.start();
                }
                logger.debug('PluginTest', `Restored original config for ${pluginId} after test error`);
            } catch (restoreError) {
                // Log but don't throw - we've already set the error message
                logger.error('PluginTest', `Failed to restore original config for ${pluginId} after test:`, restoreError);
                // Try to at least stop the plugin to prevent it from running with test config
                try {
                    await plugin.stop();
                } catch (stopError) {
                    logger.error('PluginTest', `Failed to stop plugin ${pluginId} during restore:`, stopError);
                }
            }
        } else if (needsRestore && !currentConfig) {
            // No original config but we modified the plugin - just stop it
            try {
                await plugin.stop();
            } catch (stopError) {
                logger.error('PluginTest', `Failed to stop plugin ${pluginId} after test:`, stopError);
            }
        }
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

// GET /api/plugins/:id/token - Get plugin token/API key (for display in settings)
router.get('/:id/token', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const pluginId = req.params.id;
    const plugin = pluginManager.getPlugin(pluginId);
    
    if (!plugin) {
        throw createError('Plugin not found', 404, 'PLUGIN_NOT_FOUND');
    }

    // Get plugin config from database
    const dbConfig = PluginConfigRepository.findByPluginId(pluginId);
    const settings = dbConfig?.settings || {};

    if (pluginId === 'unifi') {
        // For UniFi, check if using Site Manager API (apiKey) or Controller API (username/password)
        const apiMode = (settings?.apiMode as 'controller' | 'site-manager') || 'controller';
        const apiKey = settings?.apiKey as string | undefined;
        
        // Also try to get from plugin's apiService if available
        let apiKeyFromService: string | null = null;
        try {
            const unifiPlugin = plugin as any;
            if (unifiPlugin?.apiService?.getApiKey) {
                apiKeyFromService = unifiPlugin.apiService.getApiKey();
            }
        } catch {
            // Ignore errors
        }

        res.json({
            success: true,
            result: {
                apiMode,
                apiKey: apiKeyFromService || apiKey || null,
                hasApiKey: !!(apiKeyFromService || apiKey),
                isConfigured: dbConfig !== null
            }
        });
    } else {
        // For other plugins, return null (no token support yet)
        res.json({
            success: true,
            result: {
                apiKey: null,
                isConfigured: dbConfig !== null
            }
        });
    }
}), autoLog('plugin.getToken', 'plugin', (req) => req.params.id));

export default router;

