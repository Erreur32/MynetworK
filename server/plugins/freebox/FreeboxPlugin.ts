/**
 * Freebox Plugin
 * 
 * Plugin for integrating with Freebox API
 * Refactored from the original freeboxApi service
 */

import { BasePlugin } from '../base/BasePlugin.js';
import { freeboxApi } from '../../services/freeboxApi.js';
import type { PluginConfig, PluginStats, Device } from '../base/PluginInterface.js';

export class FreeboxPlugin extends BasePlugin {
    // Use the singleton instance from freeboxApi service to share the same session
    // This ensures the plugin uses the same session as the routes (/api/auth/*)
    private apiService = freeboxApi;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private readonly KEEP_ALIVE_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes
    
    // Protection against concurrent calls to getStats()
    private isGettingStats = false;
    private statsPromise: Promise<PluginStats> | null = null;

    constructor() {
        super('freebox', 'Freebox', '0.4.8');
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
        
        console.log('[FreeboxPlugin] Starting Freebox plugin...');
        console.log('[FreeboxPlugin] Base URL:', this.apiService.getBaseUrl());
        
        // Reload token from file (important after Docker restart or file changes)
        // freeboxApi singleton has reloadToken() method
        if (typeof this.apiService.reloadToken === 'function') {
            console.log('[FreeboxPlugin] Reloading token from file...');
            this.apiService.reloadToken();
        }
        
        // Check if already registered
        const isRegistered = this.apiService.isRegistered();
        console.log('[FreeboxPlugin] Is registered:', isRegistered);
        
        if (!isRegistered) {
            console.log('[FreeboxPlugin] Not registered yet, skipping login. Register via /api/auth/register');
            return;
        }

        // Always attempt to login on startup (session may have expired)
        // This ensures the plugin is connected after Docker restart or server restart
        try {
            console.log('[FreeboxPlugin] Checking session status...');
            const isLoggedIn = await this.apiService.checkSession();
            console.log('[FreeboxPlugin] Current session status:', isLoggedIn);
            
            if (!isLoggedIn) {
                console.log('[FreeboxPlugin] Session not valid or expired, attempting to login...');
                await this.apiService.login();
                console.log('[FreeboxPlugin] Login successful - session restored');
            } else {
                console.log('[FreeboxPlugin] Session is valid, maintaining connection');
            }
            
            // Start keep-alive mechanism to maintain session
            this.startKeepAlive();
            console.log('[FreeboxPlugin] Plugin started successfully');
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[FreeboxPlugin] Login failed:', errorMessage);
            console.error('[FreeboxPlugin] Plugin will continue but may not be fully functional. User can manually authenticate via UI.');
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
        // Protection against concurrent calls: if a call is already in progress, return the same promise
        if (this.isGettingStats && this.statsPromise) {
            console.log('[FreeboxPlugin] getStats() already in progress, reusing existing promise');
            return this.statsPromise;
        }
        
        // Start new stats retrieval
        this.isGettingStats = true;
        this.statsPromise = this._getStatsInternal();
        
        try {
            const result = await this.statsPromise;
            return result;
        } finally {
            this.isGettingStats = false;
            this.statsPromise = null;
        }
    }
    
    /**
     * Internal method to get stats (actual implementation)
     * Separated from getStats() to enable concurrent call protection
     */
    private async _getStatsInternal(): Promise<PluginStats> {
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
        let isLoggedIn = await this.apiService.checkSession();
        if (!isLoggedIn) {
            try {
                console.log('[FreeboxPlugin] Session expired in getStats(), attempting to reconnect...');
                await this.apiService.login();
                // Wait a bit for the session to be fully established
                await new Promise(resolve => setTimeout(resolve, 100));
                // Verify login was successful
                isLoggedIn = await this.apiService.checkSession();
                if (!isLoggedIn) {
                    console.error('[FreeboxPlugin] Login succeeded but session verification failed - session token may be invalid');
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
            // Fetch data from Freebox API in groups to avoid overloading Revolution
            // Group 1: Fast endpoints (system info, connection status)
            // Group 2: DHCP endpoints (can be slow on Revolution)
            // Group 3: Network endpoints (port forwarding, WiFi, LAN browser - can be slow)
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/c70980b8-6d32-4e8c-a501-4c043570cc94',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FreeboxPlugin.ts:226',message:'Starting grouped API calls',data:{endpointCount:8},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            const parallelStartTime = Date.now();
            
            // Group 1: Fast endpoints (system info, connection status)
            const [
                connectionResult,
                systemResult
            ] = await Promise.allSettled([
                this.apiService.getConnectionStatus(),
                this.apiService.getSystemInfo()
            ]);
            
            // Group 2: DHCP endpoints (can be slow on Revolution)
            const [
                dhcpConfigResult,
                dhcpLeasesResult,
                dhcpStaticLeasesResult
            ] = await Promise.allSettled([
                this.apiService.getDhcpConfig(),
                this.apiService.getDhcpLeases(),
                this.apiService.getDhcpStaticLeases()
            ]);
            
            // Group 3: Network endpoints (port forwarding, WiFi, LAN browser - can be slow)
            const [
                devicesResult,
                portForwardResult,
                wifiBssResult
            ] = await Promise.allSettled([
                this.apiService.getLanHosts('pub'),
                this.apiService.getPortForwardingRules(),
                this.apiService.getWifiBss()
            ]);
            
            const parallelDuration = Date.now() - parallelStartTime;
            // #region agent log
            const results = [devicesResult,connectionResult,systemResult,dhcpConfigResult,dhcpLeasesResult,dhcpStaticLeasesResult,portForwardResult,wifiBssResult];
            const endpoints = ['lan/browser/pub','connection','system','dhcp/config','dhcp/dynamic_lease','dhcp/static_lease','fw/redir','wifi/bss'];
            fetch('http://127.0.0.1:7243/ingest/c70980b8-6d32-4e8c-a501-4c043570cc94',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FreeboxPlugin.ts:236',message:'Parallel API calls completed',data:{totalDuration:parallelDuration,results:results.map((r,i)=>({endpoint:endpoints[i],status:r.status,success:r.status==='fulfilled'?r.value.success:false}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion

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

            // Store DHCP leases for IP lookup
            if (dhcpLeasesResult.status === 'fulfilled' && dhcpLeasesResult.value.success && Array.isArray(dhcpLeasesResult.value.result)) {
                activeLeases = dhcpLeasesResult.value.result.length;
                totalConfigured += activeLeases;
                // Store leases for IP details lookup
                dhcpStats.leases = dhcpLeasesResult.value.result;
            }

            if (dhcpStaticLeasesResult.status === 'fulfilled' && dhcpStaticLeasesResult.value.success && Array.isArray(dhcpStaticLeasesResult.value.result)) {
                const staticCount = dhcpStaticLeasesResult.value.result.length;
                totalConfigured += staticCount;
                // Store static leases for IP details lookup
                dhcpStats.staticLeases = dhcpStaticLeasesResult.value.result;
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
                
                // Log full BSS data for debugging if no networks found
                if (bssList.length > 0) {
                    console.log('[FreeboxPlugin] First BSS item structure:', JSON.stringify(bssList[0], null, 2));
                }
                
                for (const bss of bssList) {
                    // Check if BSS is enabled - check multiple possible locations
                    // Default to enabled if not explicitly disabled (more permissive)
                    const enabled = bss.enabled !== undefined ? bss.enabled : (bss.config?.enabled !== undefined ? bss.config.enabled : true);
                    const isEnabled = enabled !== false && enabled !== 0; // More permissive: only exclude if explicitly false/0
                    
                    // Get SSID from multiple possible locations with improved detection
                    // Try multiple fields in order of priority
                    let ssid: string | null = null;
                    
                    // Priority 1: Direct SSID field
                    if (bss.ssid && typeof bss.ssid === 'string' && bss.ssid.trim() !== '') {
                        ssid = bss.ssid.trim();
                    }
                    // Priority 2: Name field
                    else if (bss.name && typeof bss.name === 'string' && bss.name.trim() !== '') {
                        ssid = bss.name.trim();
                    }
                    // Priority 3: SSID in config object
                    else if (bss.config?.ssid && typeof bss.config.ssid === 'string' && bss.config.ssid.trim() !== '') {
                        ssid = bss.config.ssid.trim();
                    }
                    // Priority 4: ID field (but skip if it looks like a MAC address)
                    else if (bss.id) {
                        const idStr = String(bss.id).trim();
                        // MAC addresses are typically 12 hex digits (with or without separators)
                        // Skip if it looks like a MAC (contains only hex chars and separators)
                        const macPattern = /^[0-9a-fA-F]{2}[:-]?([0-9a-fA-F]{2}[:-]?){4}[0-9a-fA-F]{2}$/;
                        if (!macPattern.test(idStr) && idStr.length > 0) {
                            ssid = idStr;
                        } else {
                            console.log('[FreeboxPlugin] Skipping BSS ID that looks like MAC:', idStr);
                        }
                    }
                    // Priority 5: Try other possible fields
                    else if (bss.bssid && typeof bss.bssid === 'string' && bss.bssid.trim() !== '') {
                        const bssidStr = bss.bssid.trim();
                        // Only use if it doesn't look like a MAC address
                        const macPattern = /^[0-9a-fA-F]{2}[:-]?([0-9a-fA-F]{2}[:-]?){4}[0-9a-fA-F]{2}$/;
                        if (!macPattern.test(bssidStr)) {
                            ssid = bssidStr;
                        }
                    }
                    
                    // Log if SSID not found for debugging
                    if (!ssid) {
                        console.log('[FreeboxPlugin] No SSID found in BSS item. Available fields:', Object.keys(bss));
                        console.log('[FreeboxPlugin] BSS item content:', JSON.stringify(bss, null, 2));
                    }
                    
                    // Only add if we have a valid SSID (not a MAC address)
                    // Accept even if enabled status is unclear (more permissive)
                    if (ssid && ssid.trim() !== '') {
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
            let isLoggedIn = await this.apiService.checkSession();
            if (!isLoggedIn) {
                try {
                    console.log('[FreeboxPlugin] Session expired in testConnection(), attempting to reconnect...');
                    await this.apiService.login();
                    // Wait a bit for the session to be fully established
                    await new Promise(resolve => setTimeout(resolve, 100));
                    isLoggedIn = await this.apiService.checkSession();
                    if (!isLoggedIn) {
                        console.error('[FreeboxPlugin] Login succeeded but session verification failed in testConnection()');
                        return false;
                    }
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
    getApiService() {
        return this.apiService;
    }
}

