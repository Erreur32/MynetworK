/**
 * Scan Réseau Plugin
 * 
 * Plugin for network scanning functionality
 * Discovers and tracks IP addresses on the local network
 */

import { BasePlugin } from '../base/BasePlugin.js';
import { networkScanService } from '../../services/networkScanService.js';
import { NetworkScanRepository } from '../../database/models/NetworkScan.js';
import { logger } from '../../utils/logger.js';
import type { PluginConfig, PluginStats, Device } from '../base/PluginInterface.js';

export class ScanReseauPlugin extends BasePlugin {
    constructor() {
        super('scan-reseau', 'Scan Réseau', '0.5.6');
    }

    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        logger.debug('ScanReseauPlugin', `Initialized with enabled: ${config.enabled}`);
    }

    async start(): Promise<void> {
        // BasePlugin.start() already checks if plugin is enabled
        await super.start();
        
        // Double check: don't proceed if not enabled
        if (!this.isEnabled()) {
            logger.debug('ScanReseauPlugin', 'Plugin is not enabled, skipping');
            return;
        }
        
        logger.debug('ScanReseauPlugin', 'Plugin started - network scan service is ready');
        // No connection to establish - service is always available
    }

    async stop(): Promise<void> {
        await super.stop();
        logger.debug('ScanReseauPlugin', 'Plugin stopped');
    }

    /**
     * Get plugin statistics
     * Returns network scan statistics and list of discovered devices
     */
    async getStats(): Promise<PluginStats> {
        if (!this.isEnabled()) {
            throw new Error('Scan Réseau plugin is not enabled');
        }

        try {
            // Get statistics from service
            const stats = await networkScanService.getStats();
            
            // Get list of discovered IPs (limit to 1000 most recent)
            const devices = NetworkScanRepository.find({ 
                limit: 1000,
                sortBy: 'last_seen',
                sortOrder: 'desc'
            });

            // Convert to Device format for plugin stats
            const deviceList: Device[] = devices.map(scan => ({
                id: scan.ip,
                name: scan.hostname || scan.ip,
                ip: scan.ip,
                mac: scan.mac,
                type: 'network-device',
                active: scan.status === 'online',
                lastSeen: scan.lastSeen
            }));

            return {
                devices: deviceList,
                system: {
                    totalIps: stats.total,
                    onlineIps: stats.online,
                    offlineIps: stats.offline,
                    unknownIps: stats.unknown,
                    lastScan: stats.lastScan
                }
            };
        } catch (error) {
            logger.error('ScanReseauPlugin', 'Failed to get stats:', error);
            throw error;
        }
    }

    /**
     * Test connection
     * Always returns true since there's no external connection required
     */
    async testConnection(): Promise<boolean> {
        if (!this.isEnabled()) {
            return false;
        }
        
        // Service is always available (no external connection)
        return true;
    }
}

