/**
 * Plugin interface definition
 * 
 * All plugins must implement this interface to be compatible with the plugin system
 */

import { Router } from 'express';

/**
 * Plugin configuration
 */
export interface PluginConfig {
    id: string;                    // Unique plugin identifier (e.g., 'freebox', 'unifi')
    enabled: boolean;                // Whether the plugin is enabled
    settings: Record<string, unknown>; // Plugin-specific settings
}

/**
 * Common device structure (normalized across plugins)
 */
export interface Device {
    id: string;
    name: string;
    ip?: string;
    mac?: string;
    type?: string;
    active?: boolean;
    lastSeen?: Date;
    [key: string]: unknown; // Allow additional plugin-specific fields
}

/**
 * Network statistics
 */
export interface NetworkStats {
    download?: number;              // Download speed in bytes/s
    upload?: number;                // Upload speed in bytes/s
    totalDownload?: number;          // Total downloaded bytes
    totalUpload?: number;           // Total uploaded bytes
    [key: string]: unknown;
}

/**
 * System statistics
 */
export interface SystemStats {
    temperature?: number;            // CPU temperature in Celsius
    uptime?: number;                // Uptime in seconds
    memory?: {
        total?: number;
        used?: number;
        free?: number;
    };
    cpu?: {
        usage?: number;
        cores?: number;
    };
    [key: string]: unknown;
}

/**
 * Plugin statistics (unified format)
 */
export interface PluginStats {
    devices?: Device[];
    network?: NetworkStats;
    system?: SystemStats;
    [key: string]: unknown; // Allow additional plugin-specific data
}

/**
 * Plugin interface that all plugins must implement
 */
export interface IPlugin {
    /**
     * Get plugin identifier
     */
    getId(): string;

    /**
     * Get plugin display name
     */
    getName(): string;

    /**
     * Get plugin version
     */
    getVersion(): string;

    /**
     * Initialize plugin with configuration
     */
    initialize(config: PluginConfig): Promise<void>;

    /**
     * Start plugin (connect, authenticate, etc.)
     */
    start(): Promise<void>;

    /**
     * Stop plugin (disconnect, cleanup)
     */
    stop(): Promise<void>;

    /**
     * Check if plugin is enabled
     */
    isEnabled(): boolean;

    /**
     * Get plugin statistics
     */
    getStats(): Promise<PluginStats>;

    /**
     * Test connection to the plugin's data source
     */
    testConnection(): Promise<boolean>;

    /**
     * Get Express routes for this plugin (optional)
     * If implemented, routes will be mounted at /api/plugins/{pluginId}/
     */
    getRoutes?(): Router;
}

