/**
 * Freebox Plugin
 * 
 * Plugin for integrating with Freebox API
 * Refactored from the original freeboxApi service
 */

import { BasePlugin } from '../base/BasePlugin.js';
import { FreeboxApiService } from './FreeboxApiService.js';
import type { PluginConfig, PluginStats, Device } from '../base/PluginInterface.js';

export class FreeboxPlugin extends BasePlugin {
    private apiService: FreeboxApiService;

    constructor() {
        super('freebox', 'Freebox', '1.0.0');
        this.apiService = new FreeboxApiService();
    }

    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        
        const settings = config.settings;
        const url = (settings.url as string) || 'https://mafreebox.freebox.fr';
        
        this.apiService.setBaseUrl(url);
    }

    async start(): Promise<void> {
        // BasePlugin.start() already checks if plugin is enabled
        await super.start();
        
        // Double check: don't proceed if not enabled
        if (!this.isEnabled()) {
            console.log('[FreeboxPlugin] Plugin is not enabled, skipping connection');
            return;
        }
        
        // Check if already registered
        if (!this.apiService.isRegistered()) {
            console.log('[FreeboxPlugin] Not registered yet, skipping login. Register via /api/auth/register');
            return;
        }

        // Try to login
        try {
            const isLoggedIn = await this.apiService.checkSession();
            if (!isLoggedIn) {
                await this.apiService.login();
            }
        } catch (error) {
            console.error('[FreeboxPlugin] Login failed:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        await this.apiService.logout();
        await super.stop();
    }

    async getStats(): Promise<PluginStats> {
        if (!this.isEnabled()) {
            throw new Error('Freebox plugin is not enabled');
        }

        // Check if we have configuration
        if (!this.config) {
            throw new Error('Freebox plugin is not configured');
        }

        // Check if registered
        if (!this.apiService.isRegistered()) {
            throw new Error('Freebox plugin not registered. Please register first via /api/auth/register');
        }

        // Check if logged in, try to reconnect if needed
        const isLoggedIn = await this.apiService.checkSession();
        if (!isLoggedIn) {
            try {
                await this.apiService.login();
            } catch (error) {
                throw new Error(`Freebox plugin not connected: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        try {
            // Fetch data from Freebox API in parallel
            const [
                devicesResult,
                connectionResult,
                systemResult,
                dhcpConfigResult,
                dhcpLeasesResult,
                dhcpStaticLeasesResult,
                portForwardResult
            ] = await Promise.allSettled([
                this.apiService.getLanHosts('pub'),
                this.apiService.getConnectionStatus(),
                this.apiService.getSystemInfo(),
                this.apiService.getDhcpConfig(),
                this.apiService.getDhcpLeases(),
                this.apiService.getDhcpStaticLeases(),
                this.apiService.getPortForwardingRules()
            ]);

            // Normalize devices
            const devices: Device[] = [];
            if (devicesResult.status === 'fulfilled' && devicesResult.value.success && Array.isArray(devicesResult.value.result)) {
                devices.push(...devicesResult.value.result.map((device: any) => ({
                    id: device.id?.toString() || device.mac || '',
                    name: device.primary_name || device.hostname || 'Unknown Device',
                    ip: device.l3connectivities?.[0]?.addr || device.ip,
                    mac: device.mac,
                    type: device.vendor_name || 'unknown',
                    active: device.active === true,
                    lastSeen: device.last_time_reachable ? new Date(device.last_time_reachable * 1000) : undefined,
                    ...device // Include all original fields
                })));
            }

            // Normalize network stats
            const networkStats: PluginStats['network'] = {};
            if (connectionResult.status === 'fulfilled' && connectionResult.value.success && connectionResult.value.result) {
                const conn = connectionResult.value.result;
                networkStats.download = conn.rate_down || 0;
                networkStats.upload = conn.rate_up || 0;
            }

            // Normalize system stats
            const systemStats: PluginStats['system'] = {};
            if (systemResult.status === 'fulfilled' && systemResult.value.success && systemResult.value.result) {
                const sys = systemResult.value.result as any;

                // Basic system metrics
                systemStats.temperature = sys.temp_cpum || sys.temp_cpub || undefined;
                systemStats.uptime = sys.uptime_val || undefined;

                // Firmware versions (box + player when available)
                const boxFirmware: string | undefined =
                    sys.firmware ||
                    sys.firmware_version ||
                    sys.version;

                if (boxFirmware) {
                    // Store normalized firmware version for the main box
                    (systemStats as any).firmware = boxFirmware;
                }

                // Player firmware is not always exposed by the API.
                // We try several common field names and only keep it if present.
                const playerFirmware: string | undefined =
                    sys.player_firmware ||
                    sys.player_firmware_version ||
                    sys.player_version;

                if (playerFirmware) {
                    (systemStats as any).playerFirmware = playerFirmware;
                }
            }

            // DHCP / Port forwarding summary
            let dhcpEnabled: boolean | undefined;
            if (dhcpConfigResult.status === 'fulfilled' && dhcpConfigResult.value.success && dhcpConfigResult.value.result) {
                const dhcp = dhcpConfigResult.value.result as any;
                // dhcp.dhcp is the main object, dhcp.dhcp.enabled indicates DHCP service
                const dhcpConfig = dhcp.dhcp || dhcp;
                dhcpEnabled = dhcpConfig.enabled === true;
            }

            const dhcpStats: any = {};
            if (typeof dhcpEnabled === 'boolean') {
                dhcpStats.enabled = dhcpEnabled;
            }

            let activeLeases = 0;
            let totalConfigured = 0;

            if (dhcpLeasesResult.status === 'fulfilled' && dhcpLeasesResult.value.success && Array.isArray(dhcpLeasesResult.value.result)) {
                activeLeases = dhcpLeasesResult.value.result.length;
                totalConfigured += activeLeases;
            }

            if (dhcpStaticLeasesResult.status === 'fulfilled' && dhcpStaticLeasesResult.value.success && Array.isArray(dhcpStaticLeasesResult.value.result)) {
                const staticCount = dhcpStaticLeasesResult.value.result.length;
                totalConfigured += staticCount;
            }

            if (activeLeases > 0) {
                dhcpStats.activeLeases = activeLeases;
            }
            if (totalConfigured > 0) {
                dhcpStats.totalConfigured = totalConfigured;
            }

            if (Object.keys(dhcpStats).length > 0) {
                systemStats.dhcp = dhcpStats;
            }

            if (portForwardResult.status === 'fulfilled' && portForwardResult.value.success && Array.isArray(portForwardResult.value.result)) {
                const rules = portForwardResult.value.result as any[];
                const activeRules = rules.filter((r) => r.enabled !== false);
                systemStats.portForwarding = {
                    totalRules: rules.length,
                    enabledRules: activeRules.length
                };
            }

            return {
                devices,
                network: networkStats,
                system: systemStats
            };
        } catch (error) {
            console.error('[FreeboxPlugin] Failed to get stats:', error);
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            if (!this.apiService.isRegistered()) {
                return false;
            }
            const result = await this.apiService.getSystemInfo();
            return result.success;
        } catch {
            return false;
        }
    }

    /**
     * Get the underlying API service (for backward compatibility)
     */
    getApiService(): FreeboxApiService {
        return this.apiService;
    }
}

