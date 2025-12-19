/**
 * Freebox Plugin
 * 
 * Plugin for integrating with Freebox API
 * Refactored from the original freeboxApi service
 */

import { BasePlugin } from '../base/BasePlugin.js';
import { FreeboxApiService } from './FreeboxApiService.js';
import { freeboxApi } from '../../services/freeboxApi.js';
import type { PluginConfig, PluginStats, Device } from '../base/PluginInterface.js';

export class FreeboxPlugin extends BasePlugin {
    // Use the singleton instance from freeboxApi service to share the same session
    // This ensures the plugin uses the same session as the routes (/api/auth/*)
    // Type assertion needed because freeboxApi is from a different FreeboxApiService class
    private apiService: FreeboxApiService = freeboxApi as unknown as FreeboxApiService;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private readonly KEEP_ALIVE_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes

    constructor() {
        super('freebox', 'Freebox', '1.0.0');
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
        
        // Reload token from file (important after Docker restart)
        // freeboxApi singleton has reloadToken() method
        if (typeof (this.apiService as any).reloadToken === 'function') {
            (this.apiService as any).reloadToken();
        }
        
        // Check if already registered
        if (!this.apiService.isRegistered()) {
            console.log('[FreeboxPlugin] Not registered yet, skipping login. Register via /api/auth/register');
            return;
        }

        // Simple login logic - same as what the Auth button does
        try {
            // Check if session is already valid
            const isLoggedIn = await this.apiService.checkSession();
            
            if (!isLoggedIn) {
                console.log('[FreeboxPlugin] Session not valid, attempting to login...');
                await this.apiService.login();
                console.log('[FreeboxPlugin] Login successful');
            } else {
                console.log('[FreeboxPlugin] Session is valid, maintaining connection');
            }
            
            // Start keep-alive mechanism to maintain session
            this.startKeepAlive();
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[FreeboxPlugin] Login failed:', errorMessage);
            // Don't throw - allow plugin to continue, user can manually authenticate via UI
        }
    }

    async stop(): Promise<void> {
        // Stop keep-alive mechanism
        this.stopKeepAlive();
        
        await this.apiService.logout();
        await super.stop();
    }

    /**
     * Start keep-alive mechanism to maintain Freebox session
     * The session expires after inactivity, so we periodically check and renew it
     */
    private startKeepAlive(): void {
        // Clear any existing interval
        this.stopKeepAlive();

        console.log('[FreeboxPlugin] Starting session keep-alive (checking every 2 minutes)');

        this.keepAliveInterval = setInterval(async () => {
            if (!this.isEnabled()) {
                // Plugin disabled, stop keep-alive
                this.stopKeepAlive();
                return;
            }

            if (!this.apiService.isRegistered()) {
                // Not registered, stop keep-alive
                this.stopKeepAlive();
                return;
            }

            try {
                // Check if session is still valid
                const isLoggedIn = await this.apiService.checkSession();
                
                if (!isLoggedIn) {
                    // Session expired, renew it
                    console.log('[FreeboxPlugin] Session expired, renewing...');
                    await this.apiService.login();
                    console.log('[FreeboxPlugin] Session renewed successfully');
                } else {
                    // Session is valid, make a light request to keep it alive
                    // Using getSystemInfo as it's a lightweight endpoint
                    try {
                        await this.apiService.getSystemInfo();
                        // Silently succeed - session is maintained
                    } catch (error) {
                        // If request fails, session might be expired, try to renew
                        console.log('[FreeboxPlugin] Keep-alive request failed, attempting to renew session...');
                        try {
                            await this.apiService.login();
                            console.log('[FreeboxPlugin] Session renewed after keep-alive failure');
                        } catch (loginError) {
                            console.error('[FreeboxPlugin] Failed to renew session:', loginError);
                        }
                    }
                }
            } catch (error) {
                console.error('[FreeboxPlugin] Keep-alive error:', error);
                // Try to renew session on error
                try {
                    await this.apiService.login();
                    console.log('[FreeboxPlugin] Session renewed after keep-alive error');
                } catch (loginError) {
                    console.error('[FreeboxPlugin] Failed to renew session after error:', loginError);
                }
            }
        }, this.KEEP_ALIVE_INTERVAL_MS);
    }

    /**
     * Stop keep-alive mechanism
     */
    private stopKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            console.log('[FreeboxPlugin] Stopped session keep-alive');
        }
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
                console.log('[FreeboxPlugin] Session expired in getStats(), attempting to reconnect...');
                await this.apiService.login();
                // Verify login was successful
                const verified = await this.apiService.checkSession();
                if (!verified) {
                    throw new Error('Login appeared successful but session verification failed');
                }
                console.log('[FreeboxPlugin] Reconnection successful in getStats()');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error('[FreeboxPlugin] Failed to reconnect in getStats():', errorMessage);
                // Clear sensitive data (DHCP, Port Forwarding) when auth fails
                // Return minimal stats without sensitive information
                return {
                    devices: [],
                    network: {},
                    system: {
                        // Keep only non-sensitive info like firmware if available from previous successful call
                        // But don't include DHCP or portForwarding
                    }
                };
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
                portForwardResult,
                wifiBssResult
            ] = await Promise.allSettled([
                this.apiService.getLanHosts('pub'),
                this.apiService.getConnectionStatus(),
                this.apiService.getSystemInfo(),
                this.apiService.getDhcpConfig(),
                this.apiService.getDhcpLeases(),
                this.apiService.getDhcpStaticLeases(),
                this.apiService.getPortForwardingRules(),
                this.apiService.getWifiBss()
            ]);

            // Verify we're still authenticated after API calls
            // If session expired during calls, clear sensitive data
            const stillLoggedIn = await this.apiService.checkSession();
            if (!stillLoggedIn) {
                console.warn('[FreeboxPlugin] Session expired during getStats() calls, clearing sensitive data');
            }

            // Normalize devices
            const devices: Device[] = [];
            if (devicesResult.status === 'fulfilled' && devicesResult.value.success && Array.isArray(devicesResult.value.result)) {
                devices.push(...devicesResult.value.result.map((device: any) => {
                    // Extract MAC address from l2ident if available, otherwise use device.mac
                    let mac = device.mac;
                    if (!mac && device.l2ident) {
                        // l2ident.id contains the MAC if type is "mac_address"
                        if (device.l2ident.type === 'mac_address' || device.l2ident.type === 'mac') {
                            mac = device.l2ident.id;
                        } else if (device.l2ident.id && /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(device.l2ident.id)) {
                            // If l2ident.id looks like a MAC address, use it
                            mac = device.l2ident.id;
                        }
                    }
                    
                    return {
                        id: device.id?.toString() || mac || '',
                        name: device.primary_name || device.hostname || 'Unknown Device',
                        ip: device.l3connectivities?.[0]?.addr || device.ip,
                        mac: mac,
                        type: device.vendor_name || 'unknown',
                        active: device.active === true,
                        lastSeen: device.last_time_reachable ? new Date(device.last_time_reachable * 1000) : undefined,
                        hostname: device.primary_name || device.hostname,
                        ...device // Include all original fields
                    };
                }));
            }

            // Normalize network stats
            const networkStats: PluginStats['network'] = {};
            if (connectionResult.status === 'fulfilled' && connectionResult.value.success && connectionResult.value.result) {
                const conn = connectionResult.value.result as any;
                networkStats.download = conn.rate_down || 0;
                networkStats.upload = conn.rate_up || 0;
            }

            // Get API version info
            let apiVersion: string | undefined;
            try {
                const apiVersionResult = await this.apiService.getApiVersion();
                if (apiVersionResult.success && apiVersionResult.result) {
                    const versionInfo = apiVersionResult.result as any;
                    apiVersion = versionInfo.api_version || versionInfo.apiVersion;
                }
            } catch {
                // Silently fail if API version cannot be retrieved
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

                // Add API version if available
                if (apiVersion) {
                    (systemStats as any).apiVersion = apiVersion;
                } else if (sys.api_version) {
                    (systemStats as any).apiVersion = sys.api_version;
                }
            }

            // DHCP / Port forwarding summary
            // Only include these sensitive data if we're still authenticated
            if (stillLoggedIn) {
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
            } else {
                // Session expired during API calls - don't include sensitive data
                console.log('[FreeboxPlugin] Skipping DHCP and Port Forwarding data due to expired session');
            }

            // Extract WiFi networks (SSIDs) from BSS
            const wifiNetworks: Array<{ ssid: string; band: string; enabled: boolean }> = [];
            if (wifiBssResult.status === 'fulfilled' && wifiBssResult.value.success && Array.isArray(wifiBssResult.value.result)) {
                const bssList = wifiBssResult.value.result as any[];
                console.log('[FreeboxPlugin] WiFi BSS list:', bssList.length, 'items');
                for (const bss of bssList) {
                    // Check if BSS is enabled - check multiple possible locations
                    const enabled = bss.enabled !== undefined ? bss.enabled : (bss.config?.enabled !== undefined ? bss.config.enabled : true);
                    const isEnabled = enabled === true || enabled === 1 || (enabled !== false && enabled !== 0);
                    
                    // Get SSID from multiple possible locations
                    // Priority: ssid > name > id (but skip if id looks like a MAC address)
                    let ssid = bss.ssid || bss.name;
                    
                    // If no ssid/name, try id but only if it doesn't look like a MAC address
                    if (!ssid && bss.id) {
                        const idStr = String(bss.id);
                        // MAC addresses are typically 12 hex digits (with or without separators)
                        // Skip if it looks like a MAC (contains only hex chars and separators)
                        const macPattern = /^[0-9a-fA-F]{2}[:-]?([0-9a-fA-F]{2}[:-]?){4}[0-9a-fA-F]{2}$/;
                        if (!macPattern.test(idStr)) {
                            ssid = idStr;
                        }
                    }
                    
                    console.log('[FreeboxPlugin] BSS item:', { 
                        enabled: bss.enabled, 
                        configEnabled: bss.config?.enabled,
                        isEnabled,
                        ssid,
                        bssId: bss.id,
                        bssName: bss.name,
                        bssSsid: bss.ssid,
                        channel: bss.channel,
                        type: bss.type,
                        raw: JSON.stringify(bss).substring(0, 200)
                    });
                    
                    // Only add if we have a valid SSID (not a MAC address) and it's enabled
                    if (isEnabled && ssid && ssid.trim() !== '') {
                        // Determine frequency band from channel or type
                        let band = '';
                        if (bss.channel) {
                            const channel = typeof bss.channel === 'number' ? bss.channel : parseInt(String(bss.channel));
                            if (!isNaN(channel)) {
                                if (channel >= 1 && channel <= 14) {
                                    band = '2.4G';
                                } else if (channel >= 36 && channel <= 165) {
                                    band = '5G';
                                } else if (channel > 165 && channel <= 233) {
                                    // 6GHz band (WiFi 6E/7) - channels 1-233 in 6GHz, but we check > 165 to avoid overlap
                                    band = '6G';
                                }
                            }
                        }
                        // Fallback: try to determine from type or other fields
                        if (!band) {
                            const type = (bss.type || '').toString().toLowerCase();
                            if (type.includes('2.4') || type.includes('24')) {
                                band = '2.4G';
                            } else if (type.includes('5')) {
                                band = '5G';
                            } else if (type.includes('6')) {
                                band = '6G';
                            } else {
                                band = 'WiFi'; // Default if unknown
                            }
                        }
                        
                        wifiNetworks.push({
                            ssid: ssid,
                            band: band,
                            enabled: true
                        });
                        console.log('[FreeboxPlugin] Added WiFi network:', ssid, 'band:', band);
                    } else {
                        console.log('[FreeboxPlugin] Skipped BSS:', { enabled: bss.enabled, ssid: bss.ssid, channel: bss.channel });
                    }
                }
            } else {
                if (wifiBssResult.status === 'rejected') {
                    console.log('[FreeboxPlugin] WiFi BSS request failed:', wifiBssResult.reason);
                } else if (wifiBssResult.status === 'fulfilled' && !wifiBssResult.value.success) {
                    console.log('[FreeboxPlugin] WiFi BSS API returned error:', wifiBssResult.value);
                } else {
                    console.log('[FreeboxPlugin] WiFi BSS result is not an array:', wifiBssResult);
                }
            }
            
            if (wifiNetworks.length > 0) {
                systemStats.wifiNetworks = wifiNetworks;
                console.log('[FreeboxPlugin] Added', wifiNetworks.length, 'WiFi networks to stats');
            } else {
                console.log('[FreeboxPlugin] No WiFi networks found or enabled');
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
            
            // Check if logged in, try to reconnect if needed (same logic as getStats)
            const isLoggedIn = await this.apiService.checkSession();
            if (!isLoggedIn) {
                try {
                    console.log('[FreeboxPlugin] Session expired in testConnection(), attempting to reconnect...');
                    await this.apiService.login();
                    console.log('[FreeboxPlugin] Reconnection successful in testConnection()');
                } catch (error) {
                    console.error('[FreeboxPlugin] Failed to reconnect in testConnection():', error);
                    return false;
                }
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

