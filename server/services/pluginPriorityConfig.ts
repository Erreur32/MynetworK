/**
 * Plugin Priority Configuration Service
 * 
 * Manages the priority order for plugins when detecting hostnames and vendors
 * Allows users to configure which plugin takes precedence when data conflicts
 */

import { AppConfigRepository } from '../database/models/AppConfig.js';
import { logger } from '../utils/logger.js';

export interface PluginPriorityConfig {
    hostnamePriority: ('freebox' | 'unifi' | 'scanner')[]; // Order: first has highest priority
    vendorPriority: ('freebox' | 'unifi' | 'scanner')[]; // Order: first has highest priority
    overwriteExisting: {
        hostname: boolean; // If true, plugin data overwrites existing non-empty hostname
        vendor: boolean; // If true, plugin data overwrites existing non-empty vendor
    };
}

const DEFAULT_CONFIG: PluginPriorityConfig = {
    hostnamePriority: ['freebox', 'unifi', 'scanner'],
    vendorPriority: ['freebox', 'unifi', 'scanner'],
    overwriteExisting: {
        hostname: true, // By default, plugin data overwrites scanner data
        vendor: true
    }
};

export class PluginPriorityConfigService {
    private static readonly CONFIG_KEY = 'plugin_priority_config';
    
    /**
     * Get current priority configuration
     */
    static getConfig(): PluginPriorityConfig {
        try {
            const configJson = AppConfigRepository.get(this.CONFIG_KEY);
            if (configJson) {
                const config = JSON.parse(configJson) as PluginPriorityConfig;
                // Validate and merge with defaults
                return {
                    hostnamePriority: config.hostnamePriority || DEFAULT_CONFIG.hostnamePriority,
                    vendorPriority: config.vendorPriority || DEFAULT_CONFIG.vendorPriority,
                    overwriteExisting: {
                        hostname: config.overwriteExisting?.hostname ?? DEFAULT_CONFIG.overwriteExisting.hostname,
                        vendor: config.overwriteExisting?.vendor ?? DEFAULT_CONFIG.overwriteExisting.vendor
                    }
                };
            }
        } catch (error) {
            logger.error('PluginPriorityConfig', `Failed to load config: ${error}`);
        }
        
        return DEFAULT_CONFIG;
    }
    
    /**
     * Save priority configuration
     */
    static setConfig(config: PluginPriorityConfig): boolean {
        try {
            // Validate config
            if (!Array.isArray(config.hostnamePriority) || !Array.isArray(config.vendorPriority)) {
                logger.error('PluginPriorityConfig', 'Invalid config format');
                return false;
            }
            
            // Ensure all plugins are present
            const allPlugins = ['freebox', 'unifi', 'scanner'];
            const hasAllHostname = allPlugins.every(p => config.hostnamePriority.includes(p as any));
            const hasAllVendor = allPlugins.every(p => config.vendorPriority.includes(p as any));
            
            if (!hasAllHostname || !hasAllVendor) {
                logger.error('PluginPriorityConfig', 'Config must include all plugins (freebox, unifi, scanner)');
                return false;
            }
            
            const success = AppConfigRepository.set(this.CONFIG_KEY, JSON.stringify(config));
            if (success) {
                logger.info('PluginPriorityConfig', 'Priority configuration saved successfully');
            }
            return success;
        } catch (error) {
            logger.error('PluginPriorityConfig', `Failed to save config: ${error}`);
            return false;
        }
    }
    
    /**
     * Reset to default configuration
     */
    static resetToDefault(): boolean {
        return this.setConfig(DEFAULT_CONFIG);
    }
}

