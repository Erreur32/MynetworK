/**
 * UniFi Controller Wrapper
 * 
 * Secure replacement for node-unifi library
 * Uses only native fetch (no vulnerable dependencies like request, form-data, tough-cookie)
 * 
 * This wrapper provides the same interface as node-unifi but with modern, secure dependencies
 */

export interface UniFiControllerOptions {
    host: string;
    port?: number;
    username: string;
    password: string;
    site?: string;
    sslverify?: boolean;
}

export interface UniFiControllerCallback<T> {
    (error: any, data?: T): void;
}

export class UniFiController {
    private host: string;
    private port: number;
    private username: string;
    private password: string;
    private site: string;
    private sslverify: boolean;
    private baseUrl: string;
    private sessionCookie: string | null = null;
    private lastLoginAt: number | null = null;
    private readonly sessionTtlMs: number = 15 * 60 * 1000; // 15 minutes

    constructor(options: UniFiControllerOptions) {
        this.host = options.host;
        this.port = options.port || 8443;
        this.username = options.username;
        this.password = options.password;
        this.site = options.site || 'default';
        this.sslverify = options.sslverify !== false; // Default to true unless explicitly false
        
        // Build base URL
        const protocol = this.port === 443 || this.sslverify ? 'https' : 'http';
        this.baseUrl = `${protocol}://${this.host}:${this.port}`;
    }

    /**
     * Login to UniFi controller
     * Returns a promise that resolves when login is complete
     */
    async login(): Promise<void> {
        const loginUrl = `${this.baseUrl}/api/login`;
        
        try {
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

            // Extract session cookie from Set-Cookie header
            const setCookie = response.headers.get('set-cookie');
            if (!setCookie) {
                throw new Error('UniFi login did not return any Set-Cookie header');
            }

            // Parse cookies (handle multiple cookies)
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

            this.sessionCookie = cookiePairs.join('; ');
            this.lastLoginAt = Date.now();
            
            console.log('[UniFiController] Login successful');
        } catch (error) {
            console.error('[UniFiController] Login failed:', error);
            throw error;
        }
    }

    /**
     * Ensure we're logged in (refresh if needed)
     */
    private async ensureLoggedIn(): Promise<void> {
        const now = Date.now();
        if (!this.sessionCookie || !this.lastLoginAt || (now - this.lastLoginAt) > this.sessionTtlMs) {
            await this.login();
        }
    }

    /**
     * Make a request to the UniFi controller API
     */
    private async makeRequest<T>(path: string): Promise<T> {
        await this.ensureLoggedIn();

        const url = `${this.baseUrl}${path}`;
        
        const doRequest = async (): Promise<T> => {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Cookie': this.sessionCookie as string,
                    'Accept': 'application/json'
                }
            });

            if (response.status === 401 || response.status === 403) {
                // Session expired, force re-login
                this.sessionCookie = null;
                this.lastLoginAt = null;
                throw new Error(`UNIFI_SESSION_EXPIRED_${response.status}`);
            }

            if (!response.ok) {
                throw new Error(`UniFi API error: ${response.status} ${response.statusText} (${path})`);
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
                // Retry once after re-login
                await this.login();
                return await doRequest();
            }
            throw error;
        }
    }

    /**
     * Get sites (legacy method - returns array with current site)
     */
    getSites(callback: UniFiControllerCallback<any[]>): void {
        this.makeRequest<any[]>(`/api/s/${encodeURIComponent(this.site)}/self`)
            .then((data) => {
                // Return as array to match node-unifi interface
                callback(null, Array.isArray(data) ? data : [data]);
            })
            .catch((error) => {
                callback(error);
            });
    }

    /**
     * Get devices for the site
     */
    getDevices(callback: UniFiControllerCallback<any[]>): void {
        this.makeRequest<any[]>(`/api/s/${encodeURIComponent(this.site)}/stat/device`)
            .then((data) => {
                callback(null, Array.isArray(data) ? data : []);
            })
            .catch((error) => {
                callback(error);
            });
    }

    /**
     * Get clients (stations) for the site
     */
    getClients(callback: UniFiControllerCallback<any[]>): void {
        this.makeRequest<any[]>(`/api/s/${encodeURIComponent(this.site)}/stat/sta`)
            .then((data) => {
                callback(null, Array.isArray(data) ? data : []);
            })
            .catch((error) => {
                callback(error);
            });
    }

    /**
     * Get sites stats (network statistics)
     */
    getSitesStats(callback: UniFiControllerCallback<any>): void {
        // Try to get stats for the current site
        this.makeRequest<any>(`/api/s/${encodeURIComponent(this.site)}/stat/sysinfo`)
            .then((sysinfo) => {
                // Also try to get WAN stats if available
                this.makeRequest<any>(`/api/s/${encodeURIComponent(this.site)}/stat/dashboard`)
                    .then((dashboard) => {
                        // Combine sysinfo and dashboard data
                        const stats = {
                            ...sysinfo,
                            wan: dashboard?.wan || {},
                            dashboard: dashboard
                        };
                        // Return as array to match node-unifi interface
                        callback(null, Array.isArray(stats) ? stats : [stats]);
                    })
                    .catch(() => {
                        // If dashboard fails, just return sysinfo
                        callback(null, Array.isArray(sysinfo) ? sysinfo : [sysinfo]);
                    });
            })
            .catch((error) => {
                callback(error);
            });
    }

    /**
     * Get system info
     */
    getSysInfo(callback: UniFiControllerCallback<any>): void {
        this.makeRequest<any>(`/api/s/${encodeURIComponent(this.site)}/stat/sysinfo`)
            .then((data) => {
                callback(null, Array.isArray(data) ? data[0] : data);
            })
            .catch((error) => {
                callback(error);
            });
    }

    /**
     * Logout from UniFi controller
     */
    async logout(): Promise<void> {
        if (this.sessionCookie) {
            try {
                await fetch(`${this.baseUrl}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Cookie': this.sessionCookie,
                        'Accept': 'application/json'
                    }
                }).catch(() => {
                    // Ignore errors on logout
                });
            } catch {
                // Ignore errors
            }
        }
        this.sessionCookie = null;
        this.lastLoginAt = null;
    }
}

