/**
 * UniFi Controller API Service
 * 
 * Handles communication with UniFi Controller API (local) and Site Manager API (cloud)
 * Documentation: 
 * - Controller API: https://ubntwiki.com/products/software/unifi-controller/api
 * - Site Manager API: https://developer.ui.com/site-manager-api/gettingstarted/
 */

// UniFi controllers often use self-signed certificates, so we disable TLS verification
// This is considered acceptable here because communication is limited to the local UniFi
// controller or trusted Site Manager API endpoints. If an administrator prefers strict
// TLS verification, they can explicitly set NODE_TLS_REJECT_UNAUTHORIZED in the
// environment, which will bypass this override.
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { logger } from '../../utils/logger.js';

export interface UniFiDevice {
    _id: string;
    name: string;
    ip?: string;
    mac?: string;
    type?: string;
    model?: string;
    state?: number; // 0 = offline, 1 = online
    uptime?: number;
    last_seen?: number;
    [key: string]: unknown;
}

export interface UniFiStats {
    wan?: {
        rx_bytes?: number;
        tx_bytes?: number;
        rx_packets?: number;
        tx_packets?: number;
    };
    [key: string]: unknown;
}

export type UniFiApiMode = 'controller' | 'site-manager';

export class UniFiApiService {
    private apiMode: UniFiApiMode = 'controller';
    /**
     * Base URL of the UniFi controller, for example:
     * https://192.168.1.206:8443
     */
    private url: string = '';
    private username: string = '';
    private password: string = '';
    private apiKey: string = ''; // For Site Manager API
    private site: string = 'default';
    private isAuthenticated: boolean = false;
    private siteManagerBaseUrl = 'https://api.ui.com/v1';
    private loginInProgress: Promise<boolean> | null = null;

    /**
     * Session management for controller mode (HTTP + cookie)
     * 
     * In modern UniFi controllers where API tokens are not available,
     * the recommended approach is:
     * - Perform a POST /api/login with local username/password
     * - Store the returned session cookie
     * - Reuse this cookie for all subsequent /api/s/<site>/... calls
     * 
     * This mirrors the working curl sequence:
     *   curl -k -c cookie.txt -H "Content-Type: application/json" -d '{"username":"...","password":"..."}' https://controller/api/login
     *   curl -k -b cookie.txt https://controller/api/s/default/stat/device
     * 
     * The fields below keep the in-memory session state on the backend.
     */
    private sessionCookie: string | null = null;
    private lastLoginAt: number | null = null;
    private readonly sessionTtlMs: number = 15 * 60 * 1000; // 15 minutes

    /**
     * Set UniFi controller connection details (local Controller API)
     */
    setConnection(url: string, username: string, password: string, site: string = 'default'): void {
        this.apiMode = 'controller';
        this.url = url;
        this.username = username;
        this.password = password;
        this.site = site;
        this.apiKey = '';
        this.isAuthenticated = false;
        this.sessionCookie = null;
        this.lastLoginAt = null;
    }

    /**
     * Set UniFi Site Manager API connection (cloud API)
     * 
     * Note: Site Manager API requires an API key (not username/password).
     * Get your API key from: https://unifi.ui.com/api
     * The API key must be included in the 'X-API-Key' header for all requests.
     */
    setSiteManagerConnection(apiKey: string): void {
        this.apiMode = 'site-manager';
        this.apiKey = apiKey;
        this.url = ''; // Site Manager API does NOT use URL/username/password
        this.username = '';
        this.password = '';
        this.site = '';
        this.isAuthenticated = false;
    }

    /**
     * Connect and authenticate to UniFi (Controller or Site Manager)
     */
    async login(): Promise<boolean> {
        // If login is already in progress, wait for it
        if (this.loginInProgress) {
            return await this.loginInProgress;
        }

        // Start login process
        this.loginInProgress = (async () => {
            try {
                if (this.apiMode === 'site-manager') {
                    // Site Manager API uses API key, no login needed
                    if (!this.apiKey) {
                        throw new Error('UniFi Site Manager API key not set');
                    }
                    this.isAuthenticated = true;
                    logger.success('UniFi', 'Site Manager API authenticated');
                    return true;
                } else {
                    if (!this.url || !this.username || !this.password) {
                        throw new Error('UniFi connection details not set');
                    }

                    // Controller API (local) using HTTP + session cookie (curl-like)
                    await this.rawControllerLogin();
                    this.isAuthenticated = true;
                    // Authentication successful - no need to log every time (logged at plugin level if needed)
                    // logger.success('UniFi', 'Controller API authenticated via HTTP session cookie');
                    return true;
                }
            } catch (error) {
                logger.error('UniFi', 'Login failed:', error);
        this.isAuthenticated = false;
                return false;
            } finally {
                // Clear login in progress flag
                this.loginInProgress = null;
            }
        })();

        return await this.loginInProgress;
    }

    /**
     * Logout from UniFi controller
     */
    async logout(): Promise<void> {
        if (this.apiMode === 'site-manager') {
            // Site Manager API does not maintain a session in the same way
            this.isAuthenticated = false;
            return;
        }

        // Controller API (local) - perform a best-effort logout on /api/logout
        if (this.isAuthenticated && this.sessionCookie && this.url) {
            try {
                const baseUrl = this.url.replace(/\/+$/, '');
                const logoutUrl = `${baseUrl}/api/logout`;
                await fetch(logoutUrl, {
                    method: 'POST',
                    headers: {
                        'Cookie': this.sessionCookie,
                        'Accept': 'application/json'
                    }
                }).catch(() => {
                    // Ignore errors on logout, as the session may already be invalid
                });
            } catch (error) {
                logger.debug('UniFi', 'HTTP logout failed:', error);
            }
        }

        this.isAuthenticated = false;
        this.sessionCookie = null;
        this.lastLoginAt = null;
    }

    /**
     * Check if authenticated
     */
    isLoggedIn(): boolean {
        if (this.apiMode === 'site-manager') {
            return this.isAuthenticated && this.apiKey !== '';
        }
        // For controller mode, we only rely on our in-memory session state
        return this.isAuthenticated && !!this.sessionCookie;
    }

    /**
     * Make request to Site Manager API
     */
    private async siteManagerRequest<T>(endpoint: string): Promise<T> {
        if (!this.apiKey) {
            throw new Error('API key not set');
        }

        const response = await fetch(`${this.siteManagerBaseUrl}${endpoint}`, {
            headers: {
                'X-API-Key': this.apiKey, // Official UniFi Site Manager API uses 'X-API-Key' (case-sensitive)
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
            }
            throw new Error(`Site Manager API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.data || data;
    }

    /**
     * Perform a raw login to the UniFi controller using HTTP + JSON body,
     * mimicking the working curl sequence provided by the user.
     * 
     * This method:
     * - Sends POST /api/login with { username, password }
     * - Extracts the Set-Cookie header
     * - Stores the cookie and login timestamp for reuse
     */
    private async rawControllerLogin(): Promise<void> {
        if (!this.url || !this.username || !this.password) {
            throw new Error('UniFi connection details not set');
        }

        const baseUrl = this.url.replace(/\/+$/, '');
        const loginUrl = `${baseUrl}/api/login`;

        // Login is verbose (only shown if verbose debug enabled)

        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                username: this.username,
                password: this.password
            })
        });

        if (!response.ok) {
            throw new Error(`UniFi login failed: ${response.status} ${response.statusText}`);
        }

        // UniFi returns session information in the Set-Cookie header.
        // We need to transform it into a proper Cookie header value:
        //   "name=value; Path=/; HttpOnly, other=value2; Path=/; HttpOnly"
        // becomes:
        //   "name=value; other=value2"
        const setCookie = response.headers.get('set-cookie');
        if (!setCookie) {
            throw new Error('UniFi login did not return any Set-Cookie header');
        }

        // Split potential multiple cookies, keep only the "name=value" part of each
        const rawCookies = setCookie.split(',').map((c) => c.trim()).filter((c) => c.length > 0);
        const cookiePairs: string[] = [];

        for (const raw of rawCookies) {
            const firstPart = raw.split(';')[0].trim();
            if (firstPart.includes('=')) {
                cookiePairs.push(firstPart);
            }
        }

        if (cookiePairs.length === 0) {
            throw new Error('UniFi login returned Set-Cookie header without usable cookies');
        }

        // This value will be sent as the Cookie header on subsequent requests
        this.sessionCookie = cookiePairs.join('; ');
        this.lastLoginAt = Date.now();
        this.isAuthenticated = true;

        // Session stored successfully (logged at verbose level if needed)
    }

    /**
     * Perform a GET request to the UniFi controller API using the stored session cookie.
     * This method:
     * - Ensures the session is valid (refreshes it if expired)
     * - Sends the Cookie header
     * - Handles 401/403 by retrying once after re-login
     * - Normalizes the JSON response, returning either data.data or data
     */
    private async controllerRequest<T>(path: string): Promise<T> {
        if (!this.url) {
            throw new Error('UniFi controller URL not set');
        }

        // Refresh session if missing or expired
        const now = Date.now();
        if (!this.sessionCookie || !this.lastLoginAt || (now - this.lastLoginAt) > this.sessionTtlMs) {
            await this.rawControllerLogin();
        }

        const baseUrl = this.url.replace(/\/+$/, '');
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const url = `${baseUrl}${normalizedPath}`;

        const doRequest = async (): Promise<T> => {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Cookie': this.sessionCookie as string,
                    'Accept': 'application/json'
                }
            });

            if (response.status === 401 || response.status === 403) {
                throw new Error(`UNIFI_SESSION_EXPIRED_${response.status}`);
            }

            if (!response.ok) {
                throw new Error(`UniFi controller API error: ${response.status} ${response.statusText} (${normalizedPath})`);
            }

            const json = await response.json();
            // UniFi controllers typically return { meta: {...}, data: [...] }
            return (json.data ?? json) as T;
        };

        try {
            return await doRequest();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith('UNIFI_SESSION_EXPIRED')) {
                logger.debug('UniFi', 'Session appears to be expired, re-authenticating and retrying request...');
                // Force a fresh login and retry once
                this.sessionCookie = null;
                this.isAuthenticated = false;
                await this.rawControllerLogin();
                return await doRequest();
            }
            throw error;
        }
    }

    /**
     * Ensure we're logged in, reconnect if needed
     */
    private async ensureLoggedIn(): Promise<void> {
        if (!this.isLoggedIn()) {
            logger.debug('UniFi', 'Not logged in, attempting login...');
            const loggedIn = await this.login();
            if (!loggedIn) {
                throw new Error('Failed to login to UniFi controller');
            }
        }
    }

    /**
     * Get all devices (access points, switches, etc.)
     */
    async getDevices(): Promise<UniFiDevice[]> {
        await this.ensureLoggedIn();

        try {
            if (this.apiMode === 'site-manager') {
                // Site Manager API: Get devices from all sites
                const sites = await this.siteManagerRequest<Array<{ id: string; name: string }>>('/sites');
                const allDevices: UniFiDevice[] = [];

                for (const site of sites) {
                    try {
                        const devices = await this.siteManagerRequest<Array<any>>(`/sites/${site.id}/devices`);
                        if (Array.isArray(devices)) {
                            allDevices.push(...devices.map((d: any) => ({
                                _id: d.id || d.mac || '',
                                name: d.name || d.model || 'Unknown',
                                ip: d.ip,
                                mac: d.mac,
                                type: d.type || d.model,
                                model: d.model,
                                state: d.state === 'connected' ? 1 : 0,
                                uptime: d.uptime,
                                last_seen: d.last_seen ? Math.floor(new Date(d.last_seen).getTime() / 1000) : undefined
                            })));
                        }
                    } catch (error) {
                        logger.debug('UniFi', `Failed to get devices for site ${site.name}:`, error);
                    }
                }

                return allDevices;
            } else {
                // Controller API (local) - HTTP + cookie: /api/s/<site>/stat/device
                const encodedSite = encodeURIComponent(this.site);
                logger.debug('UniFi', `Getting devices for site via HTTP: ${this.site} (encoded: ${encodedSite})`);
                const devices = await this.controllerRequest<any[]>(`/api/s/${encodedSite}/stat/device`);

                return devices.map((d: any) => ({
                    _id: d._id || d.mac || '',
                    name: d.name || d.model || 'Unknown Device',
                    ip: d.ip,
                    mac: d.mac,
                    type: d.type || d.model,
                    model: d.model,
                    state: typeof d.state === 'number' ? d.state : (d.state === 'connected' ? 1 : 0),
                    uptime: d.uptime,
                    last_seen: d.last_seen,
                }));
            }
        } catch (error) {
            logger.error('UniFi', 'Failed to get devices:', error);
            throw error;
        }
    }

    /**
     * Get all clients (connected devices)
     */
    async getClients(): Promise<any[]> {
        await this.ensureLoggedIn();

        try {
            if (this.apiMode === 'site-manager') {
                // Site Manager API: Get clients from all sites
                const sites = await this.siteManagerRequest<Array<{ id: string; name: string }>>('/sites');
                const allClients: any[] = [];

                for (const site of sites) {
                    try {
                        // Site Manager API might have a clients endpoint, or we get them from devices
                        // For now, we'll get devices and filter for clients
                        const devices = await this.siteManagerRequest<Array<any>>(`/sites/${site.id}/devices`);
                        if (Array.isArray(devices)) {
                            const clients = devices.filter((d: any) => d.type === 'client' || d.device_type === 'client');
                            allClients.push(...clients.map((c: any) => ({
                                _id: c.id || c.mac || '',
                                name: c.name || c.hostname || 'Unknown',
                                ip: c.ip,
                                mac: c.mac,
                                hostname: c.hostname,
                                last_seen: c.last_seen ? Math.floor(new Date(c.last_seen).getTime() / 1000) : undefined
                            })));
                        }
                    } catch (error) {
                        logger.debug('UniFi', `Failed to get clients for site ${site.name}:`, error);
                    }
                }

                return allClients;
            } else {
                // Controller API (local) - HTTP + cookie: /api/s/<site>/stat/sta
                const encodedSite = encodeURIComponent(this.site);
                logger.debug('UniFi', `Getting clients for site via HTTP: ${this.site} (encoded: ${encodedSite})`);
                const clients = await this.controllerRequest<any[]>(`/api/s/${encodedSite}/stat/sta`);
                return clients;
            }
        } catch (error) {
            logger.error('UniFi', 'Failed to get clients:', error);
            throw error;
        }
    }

    /**
     * Get WiFi networks (WLANs/SSIDs)
     */
    async getWlans(): Promise<Array<{ name: string; enabled: boolean; ssid?: string }>> {
        await this.ensureLoggedIn();

        try {
            if (this.apiMode === 'site-manager') {
                // Site Manager API: Get WLANs from all sites
                const sites = await this.siteManagerRequest<Array<{ id: string; name: string }>>('/sites');
                const allWlans: Array<{ name: string; enabled: boolean; ssid?: string }> = [];

                for (const site of sites) {
                    try {
                        const wlans = await this.siteManagerRequest<Array<any>>(`/sites/${site.id}/wlans`);
                        if (Array.isArray(wlans)) {
                            allWlans.push(...wlans.map((w: any) => ({
                                name: w.name || w.ssid || 'Unknown',
                                enabled: w.enabled !== false,
                                ssid: w.ssid || w.name
                            })));
                        }
                    } catch (error) {
                        logger.debug('UniFi', `Failed to get WLANs for site ${site.name}:`, error);
                    }
                }

                return allWlans;
            } else {
                // Controller API (local) - HTTP + cookie: /api/s/<site>/rest/wlanconf
                const encodedSite = encodeURIComponent(this.site);
                logger.debug('UniFi', `Getting WLANs for site via HTTP: ${this.site} (encoded: ${encodedSite})`);
                const wlans = await this.controllerRequest<any[]>(`/api/s/${encodedSite}/rest/wlanconf`);

                return wlans.map((w: any) => ({
                    name: w.name || w.ssid || 'Unknown',
                    enabled: w.enabled !== false,
                    ssid: w.ssid || w.name
                }));
            }
        } catch (error) {
            logger.error('UniFi', 'Failed to get WLANs:', error);
            // Return empty array instead of throwing to avoid breaking the stats
            return [];
        }
    }

    /**
     * Get network statistics
     */
    async getNetworkStats(): Promise<UniFiStats> {
        await this.ensureLoggedIn();

        try {
            if (this.apiMode === 'site-manager') {
                // Site Manager API: Get ISP metrics
                const sites = await this.siteManagerRequest<Array<{ id: string; name: string }>>('/sites');
                let totalRxBytes = 0;
                let totalTxBytes = 0;

                for (const site of sites) {
                    try {
                        const metrics = await this.siteManagerRequest<any>(`/sites/${site.id}/isp-metrics`);
                        if (metrics && metrics.wan) {
                            totalRxBytes += metrics.wan.rx_bytes || 0;
                            totalTxBytes += metrics.wan.tx_bytes || 0;
                        }
                    } catch (error) {
                        logger.debug('UniFi', `Failed to get metrics for site ${site.name}:`, error);
                    }
                }

                return {
                    wan: {
                        rx_bytes: totalRxBytes,
                        tx_bytes: totalTxBytes
                    }
                };
            } else {
                // Controller API (local) - Reproduce node-unifi's getSitesStats() pattern
                // node-unifi calls /api/s/<site>/stat/dashboard which contains WAN stats
                const encodedSite = encodeURIComponent(this.site);
                
                try {
                    // Try to get dashboard stats (contains WAN data) - this is what node-unifi does
                    const dashboardResponse = await this.controllerRequest<any>(`/api/s/${encodedSite}/stat/dashboard`);
                    
                    // Extract WAN stats from dashboard response
                    // UniFi returns dashboard data in various formats depending on version
                    let wanStats: any = {};
                    
                    if (Array.isArray(dashboardResponse) && dashboardResponse.length > 0) {
                        // Some controllers return array with dashboard object
                        const dashboard = dashboardResponse[0];
                        wanStats = dashboard?.wan || dashboard?.wan_stats || {};
                    } else if (dashboardResponse && typeof dashboardResponse === 'object') {
                        // Some controllers return object directly
                        wanStats = dashboardResponse.wan || dashboardResponse.wan_stats || {};
                    }
                    
                    // Extract bytes from WAN stats (node-unifi pattern)
                    const rxBytes = wanStats.rx_bytes || wanStats.bytes_r || 0;
                    const txBytes = wanStats.tx_bytes || wanStats.bytes_t || 0;
                    const rxPackets = wanStats.rx_packets || wanStats.packets_r || 0;
                    const txPackets = wanStats.tx_packets || wanStats.packets_t || 0;
                    
                    if (rxBytes > 0 || txBytes > 0) {
                        logger.verbose('UniFi', `Found WAN stats from dashboard (node-unifi pattern): rx=${rxBytes}, tx=${txBytes}`);
                        return {
                            wan: {
                                rx_bytes: rxBytes,
                                tx_bytes: txBytes,
                                rx_packets: rxPackets,
                                tx_packets: txPackets
                            }
                        };
                    }
                    } catch (error) {
                        logger.debug('UniFi', 'Failed to get dashboard stats (node-unifi pattern), trying sysinfo:', error);
                }
                
                // Fallback: Try to get WAN stats from sysinfo (some controllers expose it there)
                try {
                    const sysinfo = await this.getSystemInfo();
                    if (sysinfo && sysinfo.wan) {
                        const wan = sysinfo.wan;
                        logger.verbose('UniFi', `Found WAN stats from sysinfo: rx=${wan.rx_bytes || 0}, tx=${wan.tx_bytes || 0}`);
                        return {
                            wan: {
                                rx_bytes: wan.rx_bytes || 0,
                                tx_bytes: wan.tx_bytes || 0,
                                rx_packets: wan.rx_packets || 0,
                                tx_packets: wan.tx_packets || 0
                            }
                        };
                    }
                } catch (error) {
                    logger.debug('UniFi', 'Failed to get WAN stats from sysinfo:', error);
                }
                
                // If all methods fail, return empty stats (graceful degradation)
                logger.debug('UniFi', 'No WAN stats available, returning empty stats');
                return {
                    wan: {
                        rx_bytes: 0,
                        tx_bytes: 0
                    }
                };
            }
        } catch (error) {
            logger.error('UniFi', 'Failed to get network stats:', error);
            throw error;
        }
    }

    /**
     * Get system information
     */
    async getSystemInfo(): Promise<any> {
        await this.ensureLoggedIn();

        try {
            if (this.apiMode === 'site-manager') {
                // Site Manager API: Get hosts information
                const hosts = await this.siteManagerRequest<Array<any>>('/hosts');
                // Aggregate system info from hosts
                return {
                    uptime: 0, // Not directly available in Site Manager API
                    hosts: hosts.length
                };
            } else {
                // Controller API (local) - HTTP + cookie: /api/s/<site>/stat/sysinfo
                const encodedSite = encodeURIComponent(this.site);
                logger.debug('UniFi', `Getting system info for site via HTTP: ${this.site} (encoded: ${encodedSite})`);

                const sysinfoResponse = await this.controllerRequest<any>(`/api/s/${encodedSite}/stat/sysinfo`);

                let sysinfoData: any = {};

                if (Array.isArray(sysinfoResponse) && sysinfoResponse.length > 0) {
                    sysinfoData = sysinfoResponse[0];
                } else if (sysinfoResponse && typeof sysinfoResponse === 'object') {
                    sysinfoData = sysinfoResponse;
                }

                logger.verbose('UniFi', 'getSystemInfo - extracted sysinfo via HTTP');
                return sysinfoData || {};
            }
        } catch (error) {
            logger.error('UniFi', 'Failed to get system info:', error);
            throw error;
        }
    }

    /**
     * Get all sites (Site Manager API only)
     */
    async getSites(): Promise<Array<{ id: string; name: string }>> {
        if (this.apiMode !== 'site-manager') {
            throw new Error('getSites() is only available for Site Manager API');
        }
        if (!this.isLoggedIn()) {
            throw new Error('Not authenticated to UniFi');
        }

        try {
            return await this.siteManagerRequest<Array<{ id: string; name: string }>>('/sites');
        } catch (error) {
            logger.error('UniFi', 'Failed to get sites:', error);
            throw error;
        }
    }

    /**
     * Test connection to UniFi (Controller or Site Manager)
     * Verifies that we can not only connect, but also retrieve data from the site
     */
    async testConnection(): Promise<boolean> {
        try {
            if (this.apiMode === 'site-manager') {
                if (!this.apiKey) {
                    const errorMsg = 'Site Manager API key not set';
                    logger.debug('UniFi', `Test connection failed: ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                // Test by making a simple API call to get sites
                const sites = await this.siteManagerRequest<Array<{ id: string; name: string }>>('/sites');
                if (!Array.isArray(sites) || sites.length === 0) {
                    const errorMsg = 'No sites found or invalid response from Site Manager API';
                    logger.debug('UniFi', `Test connection failed: ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                logger.success('UniFi', `Test connection successful: Site Manager API - Found ${sites.length} site(s)`);
                return true;
            } else {
                // Controller API mode
                if (!this.url || !this.username || !this.password) {
                    const errorMsg = 'Missing connection details (URL, username, or password)';
                    logger.debug('UniFi', `Test connection failed: ${errorMsg}`);
                    throw new Error(errorMsg);
                }

                if (!this.site) {
                    const errorMsg = 'Site name is required';
                    logger.debug('UniFi', `Test connection failed: ${errorMsg}`);
                    throw new Error(errorMsg);
                }

                // Try to login
                const loggedIn = await this.login();
                if (!loggedIn) {
                    const errorMsg = 'Login failed. Verify URL, username, and password';
                    logger.debug('UniFi', `Test connection failed: ${errorMsg}`);
                    throw new Error(errorMsg);
                }

                // Verify we can retrieve data from the site
                try {
                    const encodedSite = encodeURIComponent(this.site);
                    const devices = await this.controllerRequest<any[]>(`/api/s/${encodedSite}/stat/device`);
                    if (!Array.isArray(devices)) {
                        const errorMsg = `Could not retrieve devices from site "${this.site}". Invalid response format.`;
                        logger.debug('UniFi', `Test connection failed: ${errorMsg}`);
                        await this.logout();
                        throw new Error(errorMsg);
                    }
                    // Test connection successful - no need to log every time (too verbose)
                    // logger.success('UniFi', `Test connection successful: Controller API - Found ${devices.length} device(s) on site "${this.site}"`);
                    await this.logout();
                    return true;
                } catch (dataError) {
                    const errorMsg = dataError instanceof Error 
                        ? `Could not retrieve data from site "${this.site}": ${dataError.message}`
                        : `Could not retrieve data from site "${this.site}"`;
                    logger.error('UniFi', `Test connection failed: ${errorMsg}`, dataError);
                    await this.logout();
                    throw new Error(errorMsg);
                }
            }
        } catch (error) {
            // If it's already an Error with a message, re-throw it
            if (error instanceof Error) {
                logger.error('UniFi', 'Test connection error:', error);
                // Try to logout if we're logged in
                try {
                    if (this.isAuthenticated) {
                        await this.logout();
                    }
                } catch {
                    // Ignore logout errors
                }
                throw error;
            }
            // Otherwise, wrap it in an Error
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error('UniFi', 'Test connection error:', error);
            // Try to logout if we're logged in
            try {
                if (this.isAuthenticated) {
                    await this.logout();
                }
            } catch {
                // Ignore logout errors
            }
            throw new Error(`Connection test failed: ${errorMsg}`);
        }
    }

    /**
     * Get current API mode
     */
    getApiMode(): UniFiApiMode {
        return this.apiMode;
    }
}

