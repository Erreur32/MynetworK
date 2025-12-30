/**
 * UniFi Plugin
 * 
 * Plugin for integrating with UniFi Controller
 */

import { BasePlugin } from '../base/BasePlugin.js';
import { UniFiApiService } from './UniFiApiService.js';
import { logger } from '../../utils/logger.js';
import type { PluginConfig, PluginStats, Device } from '../base/PluginInterface.js';

export class UniFiPlugin extends BasePlugin {
    private apiService: UniFiApiService;

    constructor() {
        super('unifi', 'UniFi Controller', '0.3.6');
        this.apiService = new UniFiApiService();
    }

    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        
        const settings = config.settings;
        const apiMode = (settings?.apiMode as 'controller' | 'site-manager') || 'controller';

        logger.debug('UniFiPlugin', `Initializing with mode: ${apiMode}, enabled: ${config.enabled}`);

        if (apiMode === 'site-manager') {
            // Site Manager API mode
            const apiKey = settings?.apiKey as string;
            if (apiKey) {
                this.apiService.setSiteManagerConnection(apiKey);
                logger.debug('UniFiPlugin', 'Site Manager API key set');
            }
        } else {
            // Controller API mode (local)
            const url = settings?.url as string;
            const username = settings?.username as string;
            const password = settings?.password as string;
            const site = (settings?.site as string) || 'default';

            // Only set connection if all required settings are provided and not empty
            if (url && url.trim() && username && username.trim() && password && password.trim()) {
                this.apiService.setConnection(url.trim(), username.trim(), password, site.trim() || 'default');
                logger.debug('UniFiPlugin', `Controller connection details set: URL=${url.trim()}, Site=${site.trim() || 'default'}`);
            } else {
                logger.debug('UniFiPlugin', 'Controller connection details not set - missing or empty required fields');
            }
        }
    }

    async start(): Promise<void> {
        // BasePlugin.start() already checks if plugin is enabled
        await super.start();
        
        // Double check: don't proceed if not enabled
        if (!this.isEnabled()) {
            logger.debug('UniFiPlugin', 'Plugin is not enabled, skipping connection');
            return;
        }
        
        // Only try to login if we have connection details
        // Use this.config directly (protected property from BasePlugin)
        if (!this.config) {
            logger.debug('UniFiPlugin', 'No configuration available, skipping login');
            return;
        }
        
        const settings = this.config.settings;
        const apiMode = (settings?.apiMode as 'controller' | 'site-manager') || 'controller';
        
        if (apiMode === 'controller') {
            const url = settings?.url as string;
            const username = settings?.username as string;
            const password = settings?.password as string;
            
            // Only try to login if we have all required settings
            if (!url || !username || !password) {
                // This is normal if the plugin is not configured yet - only log at debug level
                // console.log('[UniFiPlugin] Controller API not fully configured (missing URL, username, or password), skipping login');
                return;
            }
            
            try {
                const loggedIn = await this.apiService.login();
                if (!loggedIn) {
                    throw new Error('Failed to authenticate with UniFi controller');
                }
                // Connection successful - no need to log every time
                // logger.success('UniFiPlugin', 'Successfully connected to UniFi controller');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                // Si c'est une erreur SSL, ne pas faire planter le serveur
                // Le plugin restera initialisé mais non connecté
                if (errorMessage.includes('EPROTO') || errorMessage.includes('wrong version number') || 
                    errorMessage.includes('SSL') || errorMessage.includes('TLS')) {
                    logger.error('UniFiPlugin', 'SSL/TLS error detected. The controller might be using HTTP instead of HTTPS.');
                    logger.warn('UniFiPlugin', 'Try configuring the URL with http:// instead of https://, or check the controller configuration.');
                    // Ne pas lancer d'erreur pour éviter de faire planter le serveur
                    // Le plugin pourra être reconnecté plus tard via l'interface
                    return;
                }
                
                logger.error('UniFiPlugin', `Login failed: ${errorMessage}`);
                // Pour les autres erreurs, lancer l'exception normalement
                throw error;
            }
        } else if (apiMode === 'site-manager') {
            const apiKey = settings?.apiKey as string;
            if (!apiKey) {
                console.log('[UniFiPlugin] Site Manager API key not configured, skipping login');
                return;
            }
            
            try {
                const loggedIn = await this.apiService.login();
                if (!loggedIn) {
                    throw new Error('Failed to authenticate with UniFi Site Manager API');
                }
            } catch (error) {
                console.error('[UniFiPlugin] Site Manager login failed:', error);
                throw error;
            }
        }
    }

    async stop(): Promise<void> {
        // Only logout if plugin was enabled and we're actually logged in
        // This prevents unnecessary API calls when plugin is disabled
        if (this.isEnabled() && this.apiService.isLoggedIn()) {
            await this.apiService.logout();
        }
        await super.stop();
    }

    async getStats(): Promise<PluginStats> {
        if (!this.isEnabled()) {
            throw new Error('UniFi plugin is not enabled');
        }

        // Check if we have configuration
        if (!this.config) {
            throw new Error('UniFi plugin is not configured');
        }

        // Check if we need to login
        if (!this.apiService.isLoggedIn()) {
            // Try to reconnect only if we have valid configuration
            const settings = this.config.settings;
            const apiMode = (settings?.apiMode as 'controller' | 'site-manager') || 'controller';
            
            if (apiMode === 'controller') {
                const url = settings?.url as string;
                const username = settings?.username as string;
                const password = settings?.password as string;
                
                // Debug: log what we have
                if (!url || !username || !password) {
                    console.log('[UniFiPlugin] Missing configuration:', {
                        hasUrl: !!url,
                        hasUsername: !!username,
                        hasPassword: !!password,
                        apiMode,
                        settingsKeys: Object.keys(settings || {})
                    });
                    throw new Error('UniFi Controller API not fully configured (missing URL, username, or password)');
                }
                
                try {
                    await this.start();
                } catch (error) {
                    logger.error('UniFiPlugin', 'Failed to reconnect:', error);
                    throw error;
                }
            } else {
                const apiKey = settings?.apiKey as string;
                if (!apiKey) {
                    logger.error('UniFiPlugin', 'Missing Site Manager API key');
                    throw new Error('UniFi Site Manager API key not configured');
                }
                try {
                    await this.start();
                } catch (error) {
                    logger.error('UniFiPlugin', 'Failed to reconnect:', error);
                    throw error;
                }
            }
        }

        try {
            const [devices, clients, stats, sysinfo, wlans] = await Promise.all([
                this.apiService.getDevices(),
                this.apiService.getClients(),
                this.apiService.getNetworkStats(),
                this.apiService.getSystemInfo(),
                this.apiService.getWlans().catch(() => []) // Get WLANs, but don't fail if unavailable
            ]);

            // Log summary only if debug is enabled
            logger.debug('UniFiPlugin', `Retrieved ${devices.length} devices, ${clients.length} clients`);
            logger.verbose('UniFiPlugin', `First device DEBUG:`, devices.length > 0 ? {
                name: devices[0].name,
                type: devices[0].type,
                model: devices[0].model,
                state: devices[0].state
            } : 'No devices');
            logger.verbose('UniFiPlugin', `First client DEBUG:`, clients.length > 0 ? {
                name: clients[0].name || clients[0].hostname,
                ip: clients[0].ip,
                mac: clients[0].mac
            } : 'No clients');

            // Normalize devices
            // UniFi devices from getAccessDevices are typically access points, switches, gateways
            // They have type like 'uap', 'uap-ac', 'usw', 'ugw', etc.
            const normalizedDevices: Device[] = devices.map((device: any) => {
                // Determine device type - UniFi uses 'uap' for access points
                let deviceType = device.type || device.model || 'unknown';
                // If type is not set but model contains UAP/AP, mark as access point
                if (!device.type && device.model) {
                    const modelLower = device.model.toLowerCase();
                    if (modelLower.includes('uap') || modelLower.includes('ap')) {
                        deviceType = 'uap';
                    }
                }
                return {
                    id: device._id || device.mac || '',
                    name: device.name || device.model || 'Unknown Device',
                    ip: device.ip,
                    mac: device.mac,
                    type: deviceType,
                    active: device.state === 1 || device.state === 'connected',
                    lastSeen: device.last_seen ? new Date(device.last_seen * 1000) : undefined,
                    ...device // Include all original fields
                };
            });

            // Add clients as devices too
            const clientDevices: Device[] = clients.map((client: any) => ({
                id: client._id || client.mac || '',
                name: client.name || client.hostname || 'Unknown Client',
                ip: client.ip,
                mac: client.mac,
                type: 'client',
                active: true,
                lastSeen: client.last_seen ? new Date(client.last_seen * 1000) : undefined,
                ...client
            }));

            // Combine devices and clients
            const allDevices = [...normalizedDevices, ...clientDevices];

            // Normalize network stats
            const networkStats = {
                download: stats.wan?.rx_bytes || 0,
                upload: stats.wan?.tx_bytes || 0,
                totalDownload: stats.wan?.rx_bytes || 0,
                totalUpload: stats.wan?.tx_bytes || 0
            };

            // Get API mode from settings
            const apiMode = (this.config?.settings?.apiMode as 'controller' | 'site-manager') || 'controller';

            // Normalize system stats
            const systemStats: any = {
                // Uptime (in seconds) if available
                uptime: sysinfo.uptime || 0,
                // Controller / site display name when exposed by UniFi (e.g. "☠ UniFi Netwok 32")
                name: sysinfo.name,
                siteName: sysinfo.name,
                hostname: sysinfo.hostname,
                // Controller firmware / version information
                version: sysinfo.version,
                previousVersion: sysinfo.previous_version,
                updateAvailable: sysinfo.update_available === true,
                updateDownloaded: sysinfo.update_downloaded === true,
                unsupportedDeviceCount: typeof sysinfo.unsupported_device_count === 'number'
                    ? sysinfo.unsupported_device_count
                    : 0,
                // API mode (controller vs site-manager)
                apiMode: apiMode,
                // Basic memory information if present
                memory: sysinfo.mem ? {
                    total: sysinfo.mem.total,
                    used: sysinfo.mem.used,
                    free: sysinfo.mem.free
                } : undefined,
                // Basic CPU information if present
                cpu: sysinfo.cpu ? {
                    usage: sysinfo.cpu.usage,
                    cores: sysinfo.cpu.cores
                } : undefined
            };

            // Build a minimal "sites" summary so the frontend can display a Sites tab
            const siteId = (this.config?.settings?.site as string) || 'default';
            const apsCount = normalizedDevices.filter((d: any) => {
                const type = (d.type || '').toString().toLowerCase();
                const model = (d.model || '').toString().toLowerCase();
                return (type === 'uap' ||
                    type.includes('uap') ||
                    type === 'accesspoint' ||
                    type === 'ap' ||
                    model.includes('uap') ||
                    model.includes('ap')) &&
                    type !== 'client';
            }).length;
            const switchesCount = normalizedDevices.filter((d: any) => {
                const type = (d.type || '').toString().toLowerCase();
                return type.startsWith('usw');
            }).length;
            const clientsCount = clientDevices.length;

            const sites = [{
                id: siteId,
                name: systemStats.name || siteId,
                hostname: systemStats.hostname,
                status: 'online',
                devices: {
                    total: allDevices.length,
                    aps: apsCount,
                    switches: switchesCount,
                    clients: clientsCount
                }
            }];

            return {
                devices: allDevices,
                network: networkStats,
                system: systemStats,
                sites,
                wlans: wlans // Add WiFi networks (SSIDs)
            };
        } catch (error) {
            logger.error('UniFiPlugin', 'Failed to get stats:', error);
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        // Let errors propagate so they can be caught and displayed to the user
        return await this.apiService.testConnection();
    }
}

