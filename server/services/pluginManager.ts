/**
 * Plugin Manager
 * 
 * Manages all plugins: registration, initialization, and lifecycle
 */

import { FreeboxPlugin } from '../plugins/freebox/FreeboxPlugin.js';
import { UniFiPlugin } from '../plugins/unifi/UniFiPlugin.js';
import { PluginConfigRepository } from '../database/models/PluginConfig.js';
import { logger } from '../utils/logger.js';
import type { IPlugin, PluginStats, PluginConfig } from '../plugins/base/PluginInterface.js';

export class PluginManager {
    private plugins: Map<string, IPlugin> = new Map();

    constructor() {
        // Register all available plugins
        this.registerPlugin(new FreeboxPlugin());
        this.registerPlugin(new UniFiPlugin());
        // TODO: Register ScanPlugin when implemented
    }

    /**
     * Register a plugin
     */
    registerPlugin(plugin: IPlugin): void {
        this.plugins.set(plugin.getId(), plugin);
        logger.debug('PluginManager', `Registered plugin: ${plugin.getName()} (${plugin.getId()})`);
    }

    /**
     * Get plugin by ID
     */
    getPlugin(pluginId: string): IPlugin | undefined {
        return this.plugins.get(pluginId);
    }

    /**
     * Get all registered plugins
     */
    getAllPlugins(): IPlugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Initialize plugin from database configuration
     */
    async initializePlugin(pluginId: string): Promise<void> {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        // Load configuration from database
        const dbConfig = PluginConfigRepository.findByPluginId(pluginId);
        
        if (!dbConfig) {
            // Create default configuration in database
            PluginConfigRepository.upsert({
                pluginId: pluginId,
                enabled: false,
                settings: {}
            });
            
            // Initialize plugin with default config
            const defaultConfig: PluginConfig = {
                id: pluginId,
                enabled: false,
                settings: {}
            };
            await plugin.initialize(defaultConfig);
            return;
        }

        // Initialize with database config
        const config: PluginConfig = {
            id: dbConfig.pluginId,
            enabled: dbConfig.enabled,
            settings: dbConfig.settings
        };

        await plugin.initialize(config);

        // Start plugin if enabled
        if (config.enabled) {
            try {
                await plugin.start();
            } catch (error) {
                logger.error('PluginManager', `Failed to start plugin ${pluginId}:`, error);
                // Don't throw - plugin will remain initialized but not started
            }
        }
    }

    /**
     * Initialize all plugins from database
     */
    async initializeAllPlugins(): Promise<void> {
        logger.debug('PluginManager', 'Initializing all plugins...');
        
        for (const plugin of this.plugins.values()) {
            try {
                await this.initializePlugin(plugin.getId());
            } catch (error) {
                logger.error('PluginManager', `Failed to initialize plugin ${plugin.getId()}:`, error);
            }
        }
        
        logger.debug('PluginManager', 'All plugins initialized');
    }

    /**
     * Update plugin configuration
     */
    async updatePluginConfig(pluginId: string, config: Partial<PluginConfig>): Promise<void> {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        // Get current config from database
        const dbConfig = PluginConfigRepository.findByPluginId(pluginId);
        if (!dbConfig) {
            throw new Error(`Plugin ${pluginId} configuration not found`);
        }

        // Merge with new config
        const mergedSettings = { ...dbConfig.settings, ...(config.settings || {}) };
        const newEnabled = config.enabled !== undefined ? config.enabled : dbConfig.enabled;

        // Save to database
        PluginConfigRepository.upsert({
            pluginId: pluginId,
            enabled: newEnabled,
            settings: mergedSettings
        });

        // Create PluginConfig object for plugin initialization
        const newConfig: PluginConfig = {
            id: pluginId,
            enabled: newEnabled,
            settings: mergedSettings
        };

        // Reinitialize plugin
        await plugin.stop();
        await plugin.initialize(newConfig);

        // Start if enabled
        if (newConfig.enabled) {
            try {
                await plugin.start();
            } catch (error) {
                logger.error('PluginManager', `Failed to start plugin ${pluginId}:`, error);
                throw error;
            }
        }
    }

    /**
     * Get stats from a specific plugin
     */
    async getPluginStats(pluginId: string): Promise<PluginStats> {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        if (!plugin.isEnabled()) {
            throw new Error(`Plugin ${pluginId} is not enabled`);
        }

        return await plugin.getStats();
    }

    /**
     * Get stats from all enabled plugins
     */
    async getAllStats(): Promise<Record<string, PluginStats | null>> {
        const allStats: Record<string, PluginStats | null> = {};

        for (const [id, plugin] of this.plugins) {
            if (plugin.isEnabled()) {
                try {
                    allStats[id] = await plugin.getStats();
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    
                    // Only log error if it's not a "not configured" error (expected for unconfigured plugins)
                    if (!errorMessage.includes('not configured') && !errorMessage.includes('not fully configured')) {
                        logger.error('PluginManager', `Failed to get stats for plugin ${id}:`, error);
                    }
                    // Return null instead of throwing to allow other plugins to work
                    allStats[id] = null;
                }
            } else {
                allStats[id] = null;
            }
        }

        return allStats;
    }

    /**
     * Get stats from all enabled plugins with timing information
     * Returns stats along with timing data for each plugin
     */
    async getAllStatsWithTiming(): Promise<{
        stats: Record<string, PluginStats | null>;
        timing: Record<string, number>;
    }> {
        const allStats: Record<string, PluginStats | null> = {};
        const timing: Record<string, number> = {};

        // Process plugins in parallel for better performance
        const pluginPromises = Array.from(this.plugins.entries()).map(async ([id, plugin]) => {
            if (plugin.isEnabled()) {
                const pluginStartTime = Date.now();
                try {
                    const stats = await plugin.getStats();
                    const pluginExecutionTime = Date.now() - pluginStartTime;
                    timing[`${id}_api`] = pluginExecutionTime;
                    return { id, stats, success: true };
                } catch (error) {
                    const pluginExecutionTime = Date.now() - pluginStartTime;
                    timing[`${id}_api`] = pluginExecutionTime;
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    
                    // Only log error if it's not a "not configured" error (expected for unconfigured plugins)
                    if (!errorMessage.includes('not configured') && !errorMessage.includes('not fully configured')) {
                        logger.error('PluginManager', `Failed to get stats for plugin ${id}:`, error);
                    }
                    return { id, stats: null, success: false };
                }
            } else {
                return { id, stats: null, success: false };
            }
        });

        const results = await Promise.all(pluginPromises);
        
        // Build stats object from results
        for (const result of results) {
            allStats[result.id] = result.stats;
        }

        return { stats: allStats, timing };
    }

    /**
     * Test connection for a plugin
     * Returns an object with success status and optional error message
     */
    async testPluginConnection(pluginId: string): Promise<{ success: boolean; error?: string }> {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return { success: false, error: 'Plugin not found' };
        }

        try {
            const result = await plugin.testConnection();
            if (result) {
                return { success: true };
            } else {
                // Test returned false but no exception was thrown
                // This means the test failed silently (e.g., login failed, no data retrieved)
                return { 
                    success: false, 
                    error: 'Connection test failed. Check logs for details or verify your configuration (URL, credentials, site name).' 
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('PluginManager', `Test connection error for ${pluginId}:`, error);
            return { success: false, error: errorMessage };
        }
    }
}

export const pluginManager = new PluginManager();

