/**
 * UniFi Controller API Service
 * 
 * Handles communication with UniFi Controller API (local) and Site Manager API (cloud)
 * Documentation: 
 * - Controller API: https://ubntwiki.com/products/software/unifi-controller/api
 * - Site Manager API: https://developer.ui.com/site-manager-api/gettingstarted/
 */

import { logger } from '../../utils/logger.js';

// Strip trailing '/' characters without using a regex (avoids SonarCloud S5852 ReDoS hotspot)
const stripTrailingSlashes = (s: string): string => {
    let end = s.length;
    while (end > 0 && s.codePointAt(end - 1) === 47 /* '/' */) end--;
    return end === s.length ? s : s.slice(0, end);
};

// Create HTTPS agent with disabled certificate verification for UniFi self-signed certificates
// This is considered acceptable here because communication is limited to the local UniFi
// controller or trusted Site Manager API endpoints. Using undici Agent instead of global
// NODE_TLS_REJECT_UNAUTHORIZED for better security
let insecureAgent: any = null;

// Lazy initialization of undici Agent to avoid import errors
const getInsecureAgent = (): any => {
    if (!insecureAgent) {
        try {
            // Dynamic import of undici (built-in in Node.js 18+)
            const { Agent } = require('undici');
            insecureAgent = new Agent({
                connect: {
                    rejectUnauthorized: false
                }
            });
        } catch (error) {
            // Fallback: if undici is not available, we'll use the global env var
            // This should not happen in Node.js 18+, but provides a fallback
            logger.warn('UniFi', 'undici not available, falling back to NODE_TLS_REJECT_UNAUTHORIZED');
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            insecureAgent = {}; // Dummy object to avoid null checks
        }
    }
    return insecureAgent;
};

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

export type UniFiApiMode = 'controller' | 'site-manager' | 'unifios';

export class UniFiApiService {
    private apiMode: UniFiApiMode = 'controller';
    private deploymentType: 'unifios' | 'controller' | 'cloud' | 'unknown' = 'unknown';
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
     * Controller (local) login coordination.
     *
     * UniFi enforces a login attempt rate limit (HTTP 429). When our backend
     * triggers multiple parallel API calls (e.g. dashboard stats via Promise.all),
     * we must avoid sending multiple simultaneous logins, otherwise UniFi may
     * temporarily block authentication attempts.
     */
    private controllerLoginInFlight: Promise<void> | null = null;
    private controllerLoginCooldownUntilMs: number | null = null;

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
    private csrfToken: string | null = null; // UniFiOS v2 POST requests require X-Csrf-Token
    private lastLoginAt: number | null = null;
    private readonly sessionTtlMs: number = 15 * 60 * 1000; // 15 minutes

    /**
     * Set UniFi controller connection details (local Controller API)
     * 
     * Note: For Site Manager (cloud), use setSiteManagerConnection() instead
     * or provide apiKey parameter for auto-detection
     */
    setConnection(url: string, username: string, password: string, site: string = 'default', apiKey?: string, forceDeploymentType?: 'auto' | 'unifios' | 'controller'): void {
        // Auto-detect Site Manager (cloud) if URL hostname is unifi.ui.com
        if (url && new URL(url).hostname === 'unifi.ui.com') {
            if (apiKey) {
                logger.debug('UniFi', 'Auto-detected Site Manager (cloud) - URL contains unifi.ui.com and API key provided');
                this.setSiteManagerConnection(apiKey);
                return;
            } else {
                logger.warn('UniFi', 'Site Manager URL detected but no API key provided. Use setSiteManagerConnection() with API key.');
            }
        }

        // Apply forced deployment type if provided (skips auto-detection)
        if (forceDeploymentType && forceDeploymentType !== 'auto') {
            this.deploymentType = forceDeploymentType;
            this.apiMode = forceDeploymentType === 'unifios' ? 'unifios' as UniFiApiMode : 'controller';
            logger.debug('UniFi', `Deployment type forced to: ${forceDeploymentType} (skipping auto-detection)`);
        } else {
            // Will be auto-detected during first login
            this.deploymentType = 'unknown';
            this.apiMode = 'controller';
        }

        this.url = url;
        this.username = username;
        this.password = password;
        this.site = site;
        this.apiKey = '';
        this.isAuthenticated = false;
        this.sessionCookie = null; this.csrfToken = null;
        this.lastLoginAt = null;
    }

    /**
     * Set UniFi Site Manager API connection (cloud API)
     * 
     * Note: Site Manager API requires an API key (not username/password).
     * Get your API key from: https://unifi.ui.com/api
     * The API key must be included in the 'X-API-Key' header for all requests.
     * 
     * This supports:
     * - UniFi Network App (cloud) via unifi.ui.com
     * - UniFiOS Gateway via cloud
     * 
     * Login via token/API key is fully functional - no username/password needed.
     */
    setSiteManagerConnection(apiKey: string): void {
        if (!apiKey || !apiKey.trim()) {
            logger.error('UniFi', 'setSiteManagerConnection called with empty or invalid API key');
            throw new Error('API key cannot be empty');
        }
        this.apiMode = 'site-manager';
        this.deploymentType = 'cloud';
        this.apiKey = apiKey.trim(); // Ensure trimmed
        this.url = ''; // Site Manager API does NOT use URL/username/password
        this.username = '';
        this.password = '';
        this.site = '';
        this.isAuthenticated = false;
        this.sessionCookie = null; this.csrfToken = null;
        this.lastLoginAt = null;
        logger.debug('UniFi', `Site Manager (cloud) connection configured (apiKeyLength: ${this.apiKey.length})`);
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
                    if (!this.apiKey || !this.apiKey.trim()) {
                        logger.error('UniFi', `Site Manager API key not set. apiKey type: ${typeof this.apiKey}, length: ${this.apiKey?.length || 0}`);
                        throw new Error('UniFi Site Manager API key not set or empty');
                    }
                    // For Site Manager, we mark as authenticated immediately
                    // The actual authentication will be verified on the first API call
                    this.isAuthenticated = true;
                    logger.debug('UniFi', `Site Manager API authenticated (apiKeyLength: ${this.apiKey.length})`);
                    return true;
                } else {
                    if (!this.url || !this.username || !this.password) {
                        throw new Error('UniFi connection details not set');
                    }

                    // Controller API (local) using HTTP + session cookie (curl-like)
                    await this.ensureControllerSession({ force: true });
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

        // Controller API (local) - perform a best-effort logout
        if (this.isAuthenticated && this.sessionCookie && this.url) {
            try {
                const baseUrl = stripTrailingSlashes(this.url);
                // Use appropriate logout endpoint based on deployment type
                const logoutUrl = this.deploymentType === 'unifios'
                    ? `${baseUrl}/api/auth/logout`
                    : `${baseUrl}/api/logout`;
                // Use insecure agent for UniFi self-signed certificates
                const agent = getInsecureAgent();
                const fetchOptions: RequestInit = {
                    method: 'POST',
                    headers: {
                        'Cookie': this.sessionCookie,
                        'Accept': 'application/json'
                    }
                };
                // Only add dispatcher if agent is available (undici)
                if (agent && agent.constructor && agent.constructor.name === 'Agent') {
                    (fetchOptions as any).dispatcher = agent;
                }
                await fetch(logoutUrl, fetchOptions).catch(() => {
                    // Ignore errors on logout, as the session may already be invalid
                });
            } catch (error) {
                logger.debug('UniFi', 'HTTP logout failed:', error);
            }
        }

        this.isAuthenticated = false;
        this.sessionCookie = null; this.csrfToken = null;
        this.lastLoginAt = null;
    }

    /**
     * Check if authenticated
     */
    isLoggedIn(): boolean {
        if (this.apiMode === 'site-manager') {
            const hasApiKey = this.apiKey && this.apiKey.trim().length > 0;
            const isAuth = this.isAuthenticated && hasApiKey;
            if (!isAuth && this.apiMode === 'site-manager') {
                logger.debug('UniFi', `Site Manager not logged in: isAuthenticated=${this.isAuthenticated}, hasApiKey=${hasApiKey}, apiKeyLength=${this.apiKey?.length || 0}`);
            }
            return isAuth;
        }
        // For controller mode, we only rely on our in-memory session state
        return this.isAuthenticated && !!this.sessionCookie;
    }

    /**
     * Make request to Site Manager API
     */
    private async siteManagerRequest<T>(endpoint: string): Promise<T> {
        if (!this.apiKey || !this.apiKey.trim()) {
            logger.error('UniFi', 'Site Manager API key is not set or empty');
            throw new Error('API key not set');
        }

        logger.debug('UniFi', `Site Manager API request to ${endpoint} (apiKeyLength: ${this.apiKey.length})`);

        // Use insecure agent for UniFi self-signed certificates (only for local controller, not Site Manager)
        // Site Manager API uses valid certificates, but we use the same agent for consistency
        const agent = getInsecureAgent();
        const fetchOptions: RequestInit = {
            headers: {
                'X-API-Key': this.apiKey.trim(), // Official UniFi Site Manager API uses 'X-API-Key' (case-sensitive)
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };
        // Only add dispatcher if agent is available (undici)
        if (agent && agent.constructor && agent.constructor.name === 'Agent') {
            (fetchOptions as any).dispatcher = agent;
        }
        const response = await fetch(`${this.siteManagerBaseUrl}${endpoint}`, fetchOptions);

        if (!response.ok) {
            if (response.status === 401) {
                // Try to get more details from response
                let errorDetails = '';
                try {
                    const errorBody = await response.text();
                    if (errorBody) {
                        try {
                            const errorJson = JSON.parse(errorBody);
                            errorDetails = errorJson.msg || errorJson.message || errorJson.error || '';
                        } catch {
                            errorDetails = errorBody.substring(0, 200);
                        }
                    }
                } catch {
                    // Ignore errors when reading response body
                }
                const details = errorDetails ? ` - ${errorDetails}` : '';
                logger.error('UniFi', `Site Manager API authentication failed (401). apiKeyLength: ${this.apiKey.length}${details}`);
                throw new Error(`Site Manager API authentication failed (401 Unauthorized): Invalid or expired API key${details}. Verify your API key is correct and has not expired. Get a new key from https://unifi.ui.com/api`);
            } else if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
            }
            throw new Error(`Site Manager API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.data || data;
    }

    /**
     * Detect the type of UniFi deployment (UniFiOS Gateway vs Classic Controller)
     */
    private async detectDeploymentType(): Promise<'unifios' | 'controller'> {
        if (!this.url || !this.username || !this.password) {
            throw new Error('UniFi connection details not set');
        }

        const baseUrl = stripTrailingSlashes(this.url.trim());
        
        // Try UniFiOS login endpoint first
        try {
            const unifiosLoginUrl = `${baseUrl}/api/auth/login`;
            logger.debug('UniFi', `Attempting UniFiOS detection: ${unifiosLoginUrl}`);
            
            const agent = getInsecureAgent();
            const fetchOptions: RequestInit = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    username: this.username.trim(),
                    password: this.password
                })
            };
            if (agent && agent.constructor && agent.constructor.name === 'Agent') {
                (fetchOptions as any).dispatcher = agent;
            }
            
            let response: Response;
            try {
                response = await fetch(unifiosLoginUrl, fetchOptions);
            } catch (fetchError: any) {
                // Network error during detection - log but don't throw, fall back to classic controller
                const errorMessage = fetchError.message || String(fetchError);
                const cause = fetchError.cause;
                const errorCode = cause?.code || '';
                
                if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
                    logger.debug('UniFi', `UniFiOS detection failed: Connection refused to ${unifiosLoginUrl}. Will try classic controller endpoint.`);
                } else if (errorCode === 'ENOTFOUND' || errorMessage.includes('ENOTFOUND')) {
                    logger.debug('UniFi', `UniFiOS detection failed: Host not found for ${baseUrl}. Will try classic controller endpoint.`);
                } else {
                    logger.debug('UniFi', `UniFiOS detection failed: ${errorMessage}. Will try classic controller endpoint.`);
                }
                // Fall through to classic controller detection
                return 'controller';
            }
            
            if (response.ok) {
                const setCookie = response.headers.get('set-cookie');
                if (setCookie) {
                    logger.debug('UniFi', 'Detected UniFiOS Gateway (UDM Pro, UCG, etc.)');
                    return 'unifios';
                }
            } else {
                // Log the error for debugging
                try {
                    const errorText = await response.text();
                    logger.debug('UniFi', `UniFiOS detection failed: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
                } catch {
                    logger.debug('UniFi', `UniFiOS detection failed: ${response.status} ${response.statusText}`);
                }
            }
        } catch (error: any) {
            logger.debug('UniFi', `UniFiOS endpoint failed: ${error.message || error}`);
        }

        // If UniFiOS failed, assume classic controller
        logger.debug('UniFi', 'Detected Classic UniFi Controller');
        return 'controller';
    }

    /**
     * Perform a raw login to the UniFi controller using HTTP + JSON body,
     * mimicking the working curl sequence provided by the user.
     * 
     * This method:
     * - Detects deployment type (UniFiOS vs Classic Controller)
     * - Sends POST /api/auth/login (UniFiOS) or POST /api/login (Classic) with { username, password }
     * - Extracts the Set-Cookie header
     * - Stores the cookie and login timestamp for reuse
     */
    private async rawControllerLogin(): Promise<void> {
        if (!this.url || !this.username || !this.password) {
            throw new Error('UniFi connection details not set');
        }

        // Validate and clean URL
        let baseUrl = this.url.trim();
        // Remove trailing slashes
        baseUrl = stripTrailingSlashes(baseUrl);
        // Ensure URL has protocol
        if (!baseUrl.match(/^https?:\/\//)) {
            throw new Error(`Invalid UniFi URL format: "${baseUrl}". URL must start with http:// or https://`);
        }

        // Detect deployment type if not already detected (skip if forced)
        if (this.deploymentType === 'unknown') {
            this.deploymentType = await this.detectDeploymentType();
            if (this.deploymentType === 'unifios') {
                this.apiMode = 'unifios' as UniFiApiMode;
            }
        }

        // Use appropriate login endpoint based on deployment type
        const loginUrl = this.deploymentType === 'unifios' 
            ? `${baseUrl}/api/auth/login`
            : `${baseUrl}/api/login`;
        
        logger.debug('UniFi', `Login URL: ${loginUrl} (deployment: ${this.deploymentType})`);

        // Validate credentials are not empty
        if (!this.username.trim() || !this.password.trim()) {
            throw new Error('Username and password cannot be empty');
        }

        // Prepare login payload
        const loginPayload = {
            username: this.username.trim(),
            password: this.password
        };

        logger.debug('UniFi', `Attempting login to controller at: ${baseUrl}`);

        // Use insecure agent for UniFi self-signed certificates
        const agent = getInsecureAgent();
        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(loginPayload)
        };
        // Only add dispatcher if agent is available (undici)
        if (agent && agent.constructor && agent.constructor.name === 'Agent') {
            (fetchOptions as any).dispatcher = agent;
        }
        
        let response: Response;
        try {
            response = await fetch(loginUrl, fetchOptions);
        } catch (fetchError: any) {
            // Fetch failed - this is a network/connection error, not an HTTP error
            const errorMessage = fetchError.message || String(fetchError);
            const cause = fetchError.cause;
            const errorCode = cause?.code || '';
            const errorAddress = cause?.address || '';
            const errorPort = cause?.port || '';
            
            logger.error('UniFi', `Fetch failed for login URL ${loginUrl}:`, fetchError);
            
            // Provide more helpful error messages based on common issues (English for API consistency / i18n)
            if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
                const portHint = errorPort === 443
                    ? ' Port 443 is used by default. UniFi controllers usually use port 8443. Ensure the URL includes the correct port (e.g. https://192.168.32.206:8443).'
                    : errorPort
                        ? ` Port ${errorPort} is not reachable.`
                        : '';
                throw new Error(`Unable to connect to UniFi controller at ${baseUrl}${portHint} Check that the URL is correct, the controller is reachable, and the port is correct (usually 8443 for HTTPS). Error: ${errorMessage}`);
            } else if (errorCode === 'ENOTFOUND' || errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
                throw new Error(`Unable to resolve hostname for ${baseUrl}. Check that the URL is correct and the controller is reachable. Error: ${errorMessage}`);
            } else if (errorMessage.includes('certificate') || errorMessage.includes('SSL') || errorMessage.includes('TLS')) {
                throw new Error(`SSL/TLS certificate error when connecting to ${baseUrl}. The controller may use a self-signed certificate. Error: ${errorMessage}`);
            } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
                throw new Error(`Connection timeout to UniFi controller at ${baseUrl}. Check that the controller is running and reachable. Error: ${errorMessage}`);
            } else {
                throw new Error(`Network error connecting to UniFi controller at ${baseUrl}: ${errorMessage}. Check the URL, network connectivity, and that the controller is running.`);
            }
        }

        if (!response.ok) {
            // Try to get more details from the response body
            let errorDetails = '';
            try {
                const errorBody = await response.text();
                if (errorBody) {
                    try {
                        const errorJson = JSON.parse(errorBody);
                        // Handle different error response formats
                        if (typeof errorJson === 'string') {
                            errorDetails = errorJson;
                        } else if (typeof errorJson === 'object' && errorJson !== null) {
                            // Try common error message fields
                            errorDetails = errorJson.msg || errorJson.message || errorJson.error || errorJson.reason || '';
                            // If still empty, try to stringify the object (but limit length)
                            if (!errorDetails && Object.keys(errorJson).length > 0) {
                                errorDetails = JSON.stringify(errorJson).substring(0, 200);
                            }
                        } else {
                            errorDetails = String(errorJson);
                        }
                    } catch {
                        // If JSON parsing fails, use the raw text
                        errorDetails = errorBody.substring(0, 200); // Limit length
                    }
                }
            } catch {
                // Ignore errors when reading response body
            }

            const statusText = response.statusText || 'Unknown error';
            const details = errorDetails ? ` - ${errorDetails}` : '';
            
            if (response.status === 400) {
                const deploymentHint = this.deploymentType === 'unifios' 
                    ? ' For UniFiOS Gateway, ensure you are using a local admin account (not a cloud account with MFA).'
                    : ' For Classic Controller, verify the URL format and credentials.';
                throw new Error(`UniFi login failed (400 Bad Request): Invalid credentials or malformed request${details}.${deploymentHint}`);
            } else if (response.status === 401) {
                const deploymentHint = this.deploymentType === 'unifios'
                    ? ' For UniFiOS Gateway, ensure you are using a local admin account. Cloud accounts with MFA are not supported.'
                    : ' Verify username and password are correct.';
                throw new Error(`UniFi login failed (401 Unauthorized): Invalid username or password${details}.${deploymentHint}`);
            } else if (response.status === 403) {
                throw new Error(`UniFi login failed (403 Forbidden): Access denied${details}. Verify the account has admin permissions and is not blocked.`);
            } else if (response.status === 429) {
                // Rate limiting - too many login attempts
                const retryAfterHeader = response.headers.get('Retry-After') || response.headers.get('retry-after');
                const retryAfterSeconds = retryAfterHeader ? Number.parseInt(String(retryAfterHeader), 10) : NaN;
                const backoffSeconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 120;
                this.controllerLoginCooldownUntilMs = Date.now() + (backoffSeconds * 1000);
                // Ensure we don't keep "thinking" we're authenticated during the cooldown.
                this.isAuthenticated = false;
                this.sessionCookie = null; this.csrfToken = null;
                this.lastLoginAt = null;
                const retryHint = retryAfterHeader ? ` Wait ${retryAfterHeader} seconds before retrying.` : ' Wait a few minutes before retrying.';
                throw new Error(`UniFi login failed (429 Too Many Requests): You've reached the login attempt limit.${retryHint}${details}`);
            } else if (response.status === 404) {
                const deploymentHint = this.deploymentType === 'unifios'
                    ? ' The /api/auth/login endpoint was not found. Verify you are connecting to a UniFiOS Gateway (UDM Pro, UCG, etc.) and the URL is correct.'
                    : ' The /api/login endpoint was not found. Verify the URL is correct and points to a UniFi Controller.';
                throw new Error(`UniFi login failed (404 Not Found): Endpoint not found${details}. ${deploymentHint}`);
            } else {
                throw new Error(`UniFi login failed: ${response.status} ${statusText}${details}. Check the controller/gateway is accessible and the URL is correct.`);
            }
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
        this.controllerLoginCooldownUntilMs = null;

        // Capture CSRF token for UniFiOS v2 POST requests
        const csrfToken = response.headers.get('x-csrf-token') || response.headers.get('X-Csrf-Token');
        if (csrfToken) {
            this.csrfToken = csrfToken;
            logger.debug('UniFi', 'Captured CSRF token for v2 API');
        }

        // Session stored successfully (logged at verbose level if needed)
    }

    private getControllerLoginCooldownRemainingMs(nowMs: number): number {
        if (!this.controllerLoginCooldownUntilMs) return 0;
        return Math.max(0, this.controllerLoginCooldownUntilMs - nowMs);
    }

    /**
     * Ensure we have a usable controller session cookie, without stampeding UniFi login.
     */
    private async ensureControllerSession(options?: { force?: boolean }): Promise<void> {
        if (this.apiMode === 'site-manager') {
            // Site Manager uses API key, no cookie session required.
            return;
        }

        const now = Date.now();
        const remainingCooldownMs = this.getControllerLoginCooldownRemainingMs(now);
        if (remainingCooldownMs > 0) {
            const waitSeconds = Math.ceil(remainingCooldownMs / 1000);
            throw new Error(
                `UniFi login is temporarily rate-limited (429). Waiting for cooldown: ${waitSeconds}s before next login attempt.`
            );
        }

        const force = options?.force === true;
        const hasValidSession =
            !!this.sessionCookie &&
            !!this.lastLoginAt &&
            (now - this.lastLoginAt) <= this.sessionTtlMs;

        if (!force && hasValidSession) {
            return;
        }

        // Singleflight: if a login is already running, await it.
        if (this.controllerLoginInFlight) {
            await this.controllerLoginInFlight;
            return;
        }

        this.controllerLoginInFlight = (async () => {
            try {
                await this.rawControllerLogin();
                this.isAuthenticated = true;
            } finally {
                this.controllerLoginInFlight = null;
            }
        })();

        await this.controllerLoginInFlight;
    }

    /**
     * Get the API base path based on deployment type
     * UniFiOS Gateway requires /proxy/network prefix for all API endpoints
     */
    private getApiBasePath(): string {
        if (this.deploymentType === 'unifios') {
            return '/proxy/network';
        }
        return '';
    }

    /**
     * Perform a GET request to the UniFi controller API using the stored session cookie.
     * This method:
     * - Ensures the session is valid (refreshes it if expired)
     * - Adds /proxy/network prefix for UniFiOS Gateway
     * - Sends the Cookie header
     * - Handles 401/403 by retrying once after re-login
     * - Normalizes the JSON response, returning either data.data or data
     */
    private async controllerRequest<T>(path: string): Promise<T> {
        if (!this.url) {
            throw new Error('UniFi controller URL not set');
        }

        // Refresh session if missing or expired (singleflight + cooldown-aware)
        await this.ensureControllerSession();

        const baseUrl = stripTrailingSlashes(this.url);
        const apiBase = this.getApiBasePath();
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const url = `${baseUrl}${apiBase}${normalizedPath}`;
        
        logger.debug('UniFi', `API Request: ${url} (deployment: ${this.deploymentType})`);

        const doRequest = async (): Promise<T> => {
            // Use insecure agent for UniFi self-signed certificates
            const agent = getInsecureAgent();
            const fetchOptions: RequestInit = {
                method: 'GET',
                headers: {
                    'Cookie': this.sessionCookie as string,
                    'Accept': 'application/json'
                }
            };
            // Only add dispatcher if agent is available (undici)
            if (agent && agent.constructor && agent.constructor.name === 'Agent') {
                (fetchOptions as any).dispatcher = agent;
            }
            let response: Response;
            try {
                response = await fetch(url, fetchOptions);
            } catch (fetchError: any) {
                // Fetch failed - this is a network/connection error, not an HTTP error
                const errorMessage = fetchError.message || String(fetchError);
                logger.error('UniFi', `Fetch failed for ${url}:`, fetchError);
                
                // Provide more helpful error messages based on common issues
                if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
                    throw new Error(`Cannot connect to UniFi controller at ${baseUrl}. Verify the URL is correct and the controller is accessible. Error: ${errorMessage}`);
                } else if (errorMessage.includes('certificate') || errorMessage.includes('SSL') || errorMessage.includes('TLS')) {
                    throw new Error(`SSL/TLS certificate error connecting to ${baseUrl}. The controller may use a self-signed certificate. Error: ${errorMessage}`);
                } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
                    throw new Error(`Connection timeout to UniFi controller at ${baseUrl}. Verify the controller is running and accessible. Error: ${errorMessage}`);
                } else {
                    throw new Error(`Network error connecting to UniFi controller at ${baseUrl}: ${errorMessage}. Verify the URL, network connectivity, and that the controller is running.`);
                }
            }

            if (response.status === 401 || response.status === 403) {
                throw new Error(`UNIFI_SESSION_EXPIRED_${response.status}`);
            }

            if (!response.ok) {
                // Try to get error details from response body
                let errorDetails = '';
                try {
                    const errorBody = await response.text();
                    if (errorBody) {
                        try {
                            const errorJson = JSON.parse(errorBody);
                            errorDetails = errorJson.msg || errorJson.message || errorJson.error || '';
                        } catch {
                            errorDetails = errorBody.substring(0, 200);
                        }
                    }
                } catch {
                    // Ignore errors when reading response body
                }
                const details = errorDetails ? ` - ${errorDetails}` : '';
                throw new Error(`UniFi controller API error: ${response.status} ${response.statusText} (${normalizedPath})${details}`);
            }

            let json: any;
            try {
                json = await response.json();
            } catch (parseError) {
                throw new Error(`Invalid JSON response from UniFi controller at ${normalizedPath}. The endpoint may not exist or the controller version may be incompatible.`);
            }
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
                this.sessionCookie = null; this.csrfToken = null;
                this.isAuthenticated = false;
                try {
                    await this.ensureControllerSession({ force: true });
                    return await doRequest();
                } catch (retryError) {
                    // If retry also fails, throw the original error with context
                    throw new Error(`Session expired and re-authentication failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
                }
            }
            // Re-throw network/connection errors as-is (they already have helpful messages)
            throw error;
        }
    }

    /**
     * POST request to the UniFi controller API (same auth/session as controllerRequest).
     */
    private async controllerPost<T>(path: string, body: unknown): Promise<T> {
        if (!this.url) throw new Error('UniFi controller URL not set');
        await this.ensureControllerSession();
        const baseUrl = stripTrailingSlashes(this.url);
        const apiBase = this.getApiBasePath();
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        const url = `${baseUrl}${apiBase}${normalizedPath}`;
        logger.debug('UniFi', `API POST: ${url}`);
        const agent = getInsecureAgent();
        const headers: Record<string, string> = {
            'Cookie': this.sessionCookie as string,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (this.csrfToken) headers['X-Csrf-Token'] = this.csrfToken;
        const opts: RequestInit = {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        };
        if (agent?.constructor?.name === 'Agent') (opts as any).dispatcher = agent;
        const response = await fetch(url, opts);
        if (response.status === 401 || response.status === 403) {
            // Re-auth once and retry
            this.sessionCookie = null; this.csrfToken = null; this.isAuthenticated = false;
            await this.ensureControllerSession({ force: true });
            const r2 = await fetch(url, opts);
            if (!r2.ok) throw new Error(`UniFi POST ${r2.status} (${normalizedPath})`);
            const j2: any = await r2.json();
            return (j2.data ?? j2) as T;
        }
        if (!response.ok) throw new Error(`UniFi POST ${response.status} (${normalizedPath})`);
        const json: any = await response.json();
        return (json.data ?? json) as T;
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
                                last_seen: d.last_seen ? Math.floor(new Date(d.last_seen).getTime() / 1000) : undefined,
                                // Firmware information
                                firmware_version: d.version || d.fw || d.firmware_version,
                                version: d.version || d.fw,
                                firmware: d.version || d.fw,
                                // Port information (for switches)
                                port_table: d.port_table,
                                eth_port_table: d.eth_port_table,
                                ports: d.ports,
                                port_overrides: d.port_overrides,
                                num_port: d.num_port,
                                // CPU and system info
                                cpu_usage: d.cpu_usage || d.cpu?.usage,
                                cpu: d.cpu,
                                proc_usage: d.proc_usage,
                                // Power information
                                power: d.power,
                                watt: d.watt,
                                poe_power: d.poe_power,
                                // Radio information (for APs)
                                radio_table: d.radio_table,
                                radio_ng: d.radio_ng,
                                radio_na: d.radio_na,
                                radio_2g: d.radio_2g,
                                radio_5g: d.radio_5g,
                                radio_6g: d.radio_6g,
                                // Additional device info
                                active: d.state === 'connected',
                                // Include all other fields
                                ...d
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
                    // Firmware information
                    firmware_version: d.version || d.fw || d.firmware_version,
                    version: d.version || d.fw,
                    firmware: d.version || d.fw,
                    // Port information (for switches)
                    port_table: d.port_table,
                    eth_port_table: d.eth_port_table,
                    ports: d.ports,
                    port_overrides: d.port_overrides,
                    num_port: d.num_port,
                    // CPU and system info
                    cpu_usage: d.cpu_usage || d.cpu?.usage,
                    cpu: d.cpu,
                    proc_usage: d.proc_usage,
                    // Power information
                    power: d.power,
                    watt: d.watt,
                    poe_power: d.poe_power,
                    // Radio information (for APs)
                    radio_table: d.radio_table,
                    radio_ng: d.radio_ng,
                    radio_na: d.radio_na,
                    radio_2g: d.radio_2g,
                    radio_5g: d.radio_5g,
                    radio_6g: d.radio_6g,
                    // Additional device info
                    active: d.state === 1 || d.state === 'connected',
                    // Include all other fields
                    ...d
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
     * Get network config (LAN networks) to check if DHCP is enabled (dhcpd_enabled).
     * Used for dashboard "Gestionnaire d'IPs" when UniFi manages the network.
     * Also retrieves DHCP range (dhcpd_start, dhcpd_stop) if available.
     */
    async getNetworkConfig(): Promise<{ dhcpEnabled: boolean; dhcpRange?: string }> {
        try {
            await this.ensureLoggedIn();
            const encodedSite = encodeURIComponent(this.site);
            const list = await this.controllerRequest<any[]>(`/api/s/${encodedSite}/rest/networkconf`);
            if (!Array.isArray(list) || list.length === 0) {
                return { dhcpEnabled: false };
            }
            const lan = list.find((n: any) => (n.purpose === 'corporate' || n.purpose === 'vlan only' || !n.purpose) && n.dhcpd_enabled !== undefined)
                ?? list[0];
            const dhcpEnabled = lan?.dhcpd_enabled === true;
            let dhcpRange: string | undefined;
            if (dhcpEnabled && lan?.dhcpd_start && lan?.dhcpd_stop) {
                dhcpRange = `${lan.dhcpd_start} - ${lan.dhcpd_stop}`;
            }
            return { dhcpEnabled, dhcpRange };
        } catch (error) {
            logger.debug('UniFi', 'Failed to get network config (dhcpd_enabled):', error);
            return { dhcpEnabled: false };
        }
    }

    /**
     * Get port forwarding rules (NAT rules) from UniFi gateway
     * Returns array of port forwarding rules configured in UniFi
     */
    async getPortForwardingRules(): Promise<Array<{
        id: string;
        name?: string;
        enabled: boolean;
        protocol: string;
        dst_port?: string;
        fwd_port?: string;
        fwd_host?: string;
        src?: string;
        comment?: string;
    }>> {
        try {
            await this.ensureLoggedIn();
            const encodedSite = encodeURIComponent(this.site);
            // UniFi uses /api/s/<site>/rest/portforward for port forwarding rules
            const rules = await this.controllerRequest<any[]>(`/api/s/${encodedSite}/rest/portforward`);
            if (!Array.isArray(rules)) {
                return [];
            }
            return rules.map((r: any) => ({
                id: r._id || r.id || '',
                name: r.name || r.comment || '',
                enabled: r.enabled !== false,
                protocol: r.proto || r.protocol || 'tcp',
                dst_port: r.dst_port || r.dstPort || '',
                fwd_port: r.fwd_port || r.fwdPort || '',
                fwd_host: r.fwd_host || r.fwdHost || r.fwd_ip || r.fwdIp || '',
                src: r.src || r.source || '',
                comment: r.comment || r.name || ''
            }));
        } catch (error) {
            logger.debug('UniFi', 'Failed to get port forwarding rules:', error);
            return [];
        }
    }

    /**
     * Get WAN bandwidth report from the UniFi controller's built-in RRD-style stats.
     * Uses /api/s/<site>/stat/report/5minutes.site for ranges up to 24h,
     * and /api/s/<site>/stat/report/hourly.site for longer ranges.
     * Returns array of { time, download, upload } in KB/s.
     */
    async getBandwidthReport(rangeSeconds: number): Promise<Array<{ time: string; timestamp: number; download: number; upload: number }>> {
        await this.ensureLoggedIn();

        if (this.apiMode === 'site-manager') {
            // Site Manager API doesn't support stat/report — return empty
            return [];
        }

        const encodedSite = encodeURIComponent(this.site);
        const now = Date.now();
        const start = now - rangeSeconds * 1000;

        // Use 5-minute granularity for ≤24h, hourly for longer
        const interval = rangeSeconds <= 86400 ? '5minutes' : 'hourly';
        const path = `/api/s/${encodedSite}/stat/report/${interval}.site`;

        try {
            const data = await this.controllerPost<any[]>(path, {
                attrs: ['wan-tx_bytes', 'wan-rx_bytes'],
                start: start,
                end: now,
            });

            if (!Array.isArray(data) || data.length === 0) return [];

            // UniFi stat/report returns average bytes per bucket (not cumulative).
            // No timestamp field — buckets are ordered chronologically, each covering bucketSec.
            const bucketSec = rangeSeconds <= 86400 ? 300 : 3600;
            const showSeconds = rangeSeconds <= 3600;
            const result: Array<{ time: string; timestamp: number; download: number; upload: number }> = [];

            for (let i = 0; i < data.length; i++) {
                const entry = data[i];
                // Compute timestamp from start + bucket index
                const ts = start + i * bucketSec * 1000;
                // Values are average bytes per bucket period — convert to KB/s
                const dlKBs = Math.max(0, Math.round((entry['wan-rx_bytes'] || 0) / bucketSec / 1024));
                const ulKBs = Math.max(0, Math.round((entry['wan-tx_bytes'] || 0) / bucketSec / 1024));

                const d = new Date(ts);
                const time = d.toLocaleTimeString('fr-FR', {
                    hour: '2-digit', minute: '2-digit', ...(showSeconds ? { second: '2-digit' } : {})
                });

                result.push({ time, timestamp: ts, download: dlKBs, upload: ulKBs });
            }
            return result;
        } catch (error) {
            logger.debug('UniFi', `getBandwidthReport(${interval}) failed:`, error);
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
                try {
                    const loggedIn = await this.login();
                    if (!loggedIn) {
                        const errorMsg = 'Login failed. Verify URL, username, and password';
                        logger.debug('UniFi', `Test connection failed: ${errorMsg}`);
                        throw new Error(errorMsg);
                    }
                } catch (loginError: any) {
                    // Re-throw the exact error message (it already contains helpful details)
                    // This preserves specific error messages like 429 Too Many Requests
                    if (loginError.message) {
                        // Clean up any "[object Object]" strings in the error message
                        let cleanMessage = loginError.message.replace(/\[object Object\]/g, '').trim();
                        // Remove duplicate deployment hints
                        cleanMessage = cleanMessage.replace(/Verify URL, username, and password are correct\.\s{0,10}Verify URL, username, and password are correct\./g, 'Verify URL, username, and password are correct.');
                        // Remove duplicate "Verify URL, username, and password" at the end
                        cleanMessage = cleanMessage.replace(/\s{0,10}Verify URL, username, and password\.?\s{0,10}$/g, '');
                        
                        // If it's a rate limit error, preserve the full message with retry info
                        if (cleanMessage.includes('429') || cleanMessage.includes('Too Many Requests')) {
                            throw new Error(cleanMessage); // Keep the exact error message with retry hint
                        }
                        // For other errors, add deployment hints if not already present
                        const deploymentType = this.getDeploymentType();
                        if (!cleanMessage.includes('For UniFiOS') && !cleanMessage.includes('For Classic') && !cleanMessage.includes('Verify URL, username, and password are correct')) {
                            const deploymentHint = deploymentType === 'unifios'
                                ? ' For UniFiOS Gateway, ensure you are using a local admin account (not a cloud account with MFA).'
                                : ' Verify URL, username, and password are correct.';
                            throw new Error(`${cleanMessage}${deploymentHint}`);
                        }
                        // If message already has hints, just clean it
                        throw new Error(cleanMessage);
                    }
                    throw loginError;
                }

                // Verify we can retrieve data from the site
                try {
                    const encodedSite = encodeURIComponent(this.site);
                    logger.debug('UniFi', `Testing data retrieval from site: ${this.site} (encoded: ${encodedSite})`);
                    const devices = await this.controllerRequest<any[]>(`/api/s/${encodedSite}/stat/device`);
                    if (!Array.isArray(devices)) {
                        const errorMsg = `Could not retrieve devices from site "${this.site}". Invalid response format. The site name may be incorrect. Available sites can be checked in UniFi Network settings.`;
                        logger.debug('UniFi', `Test connection failed: ${errorMsg}`);
                        await this.logout();
                        throw new Error(errorMsg);
                    }
                    logger.debug('UniFi', `Test connection successful: Found ${devices.length} device(s) on site "${this.site}"`);
                    await this.logout();
                    return true;
                } catch (dataError) {
                    const deploymentType = this.getDeploymentType();
                    let errorMsg: string;
                    
                    if (dataError instanceof Error) {
                        // Check if it's a network/connection error (already has helpful message)
                        if (dataError.message.includes('Cannot connect') || 
                            dataError.message.includes('Network error') ||
                            dataError.message.includes('SSL/TLS') ||
                            dataError.message.includes('timeout')) {
                            errorMsg = dataError.message;
                        } else if (dataError.message.includes('404') || dataError.message.includes('Not Found')) {
                            errorMsg = `Site "${this.site}" not found. Verify the site name is correct. For UniFiOS Gateway, the default site is usually "default". Check available sites in UniFi Network settings.`;
                        } else if (dataError.message.includes('Invalid JSON') || dataError.message.includes('endpoint may not exist')) {
                            const deploymentHint = deploymentType === 'unifios'
                                ? ' For UniFiOS Gateway, ensure you are using the correct API path (/proxy/network/api/...).'
                                : ' Verify the controller version supports this endpoint.';
                            errorMsg = `Could not retrieve data from site "${this.site}": ${dataError.message}.${deploymentHint}`;
                        } else {
                            errorMsg = `Could not retrieve data from site "${this.site}": ${dataError.message}`;
                        }
                    } else {
                        errorMsg = `Could not retrieve data from site "${this.site}". Unknown error occurred.`;
                    }
                    
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

    /**
     * Get deployment type (unifios, controller, cloud, unknown)
     */
    getDeploymentType(): 'unifios' | 'controller' | 'cloud' | 'unknown' {
        if (this.apiMode === 'site-manager') {
            return 'cloud';
        }
        return this.deploymentType;
    }

    // ── Threat cache ──────────────────────────────────────────────────────────
    // Cache threats per range bucket (3600/86400/604800) for 5 minutes to avoid
    // hammering the UniFi controller on every tab open / refresh.
    private _threatCache: Map<number, { ts: number; data: any }> = new Map();
    private readonly THREAT_CACHE_TTL = 5 * 60 * 1000; // 5 min

    /**
     * Get threat flow insights from UniFi IDS/IPS.
     *
     * Tries multiple endpoints in order:
     *  1. UniFiOS v2 API: GET /v2/api/site/{site}/insights/flows  (UDM/CloudGateway)
     *  2. stat/ips/event with within / start-end / no filter
     *  3. stat/ips (alternate path)
     *  4. stat/alarm (IPS-tagged alarms)
     *  5. stat/event (IPS-tagged events)
     *
     * Results are cached for 5 min per range bucket.
     */
    async getFlowInsights(rangeSeconds: number = 86400): Promise<{
        available: boolean;
        source: string;
        summary: { total: number; low: number; suspicious: number; concerning: number };
        topPolicies: Array<{ name: string; count: number }>;
        topClients: Array<{ mac: string; name?: string; ip?: string; count: number }>;
        topRegions: Array<{ country: string; count: number }>;
        recentFlows: Array<{
            timestamp: number;
            action: string;
            threatLevel: string;
            policy: string;
            srcIp?: string;
            dstIp?: string;
            clientMac?: string;
            clientName?: string;
            country?: string;
            proto?: string;
            service?: string;
            direction?: string;
            signature?: string;
            dstPort?: number;
            srcPort?: number;
            flowCount?: number;
        }>;
    }> {
        await this.ensureLoggedIn();

        // ── Cache check ───────────────────────────────────────────────────────
        const cached = this._threatCache.get(rangeSeconds);
        if (cached && Date.now() - cached.ts < this.THREAT_CACHE_TTL) {
            logger.debug('UniFi', `getFlowInsights(${rangeSeconds}s) — serving from cache (age ${Math.round((Date.now() - cached.ts) / 1000)}s)`);
            return cached.data;
        }

        const encodedSite = encodeURIComponent(this.site);
        const endMs = Date.now();
        const startMs = endMs - rangeSeconds * 1000;

        // Helper: normalize raw response to array regardless of wrapper format.
        // controllerRequest already extracts json.data, but some v2 endpoints
        // return { data: [...], count: N } or just [...].
        const toArray = (raw: any): any[] => {
            if (Array.isArray(raw)) return raw;
            if (raw && Array.isArray(raw.data)) return raw.data;
            if (raw && Array.isArray(raw.flows)) return raw.flows;
            if (raw && Array.isArray(raw.items)) return raw.items;
            return [];
        };

        const withinHours = Math.ceil(rangeSeconds / 3600);
        const startSec = Math.floor(startMs / 1000);
        const endSec = Math.floor(endMs / 1000);

        // Track attempts for debug output
        const tried: string[] = [];
        let ipsEndpointReachable = false;
        let bestEmptySource = 'none';

        const cache = (result: any) => {
            this._threatCache.set(rangeSeconds, { ts: Date.now(), data: result });
            return result;
        };

        // ── Attempt 0: UniFiOS v2 — POST traffic-flows (real IPS/threat data) ──
        // The UniFi Network web app uses POST /v2/api/site/{site}/traffic-flows
        // with a JSON body to fetch firewall/IPS flow data.
        // controllerRequest auto-adds /proxy/network for unifios.
        // Supports pagination: pageNumber + pageSize, response includes count field.
        if (this.deploymentType === 'unifios') {
            const trafficFlowPath = `/v2/api/site/${encodedSite}/traffic-flows`;
            tried.push('v2:traffic-flows');
            try {
                const PAGE_SIZE = 500;
                // Scale safety cap with range: short ranges need less, 30d may have a lot
                const MAX_ENTRIES = rangeSeconds <= 86400 ? 5000
                    : rangeSeconds <= 604800 ? 10000
                    : 20000;
                const allEvents: any[] = [];
                let pageNumber = 0;
                let totalCount = Infinity; // Will be set from first response

                // Paginate through all results
                while (allEvents.length < MAX_ENTRIES) {
                    const body = {
                        risk: [], action: ['blocked'], direction: [], protocol: [],
                        policy: [], policy_type: [], service: [],
                        source_host: [], source_mac: [], source_ip: [], source_port: [],
                        source_network_id: [], source_domain: [], source_zone_id: [], source_region: [],
                        destination_host: [], destination_mac: [], destination_ip: [], destination_port: [],
                        destination_network_id: [], destination_domain: [], destination_zone_id: [], destination_region: [],
                        in_network_id: [], out_network_id: [], next_ai_query: [], except_for: [],
                        timestampFrom: startMs,
                        timestampTo: endMs,
                        pageNumber,
                        search_text: '',
                        pageSize: PAGE_SIZE,
                        skip_count: pageNumber > 0, // Only need count on first page
                    };
                    const raw = await this.controllerPost<any>(trafficFlowPath, body);

                    // Extract total count from first response (raw.count or raw.totalCount)
                    if (pageNumber === 0) {
                        totalCount = raw?.count ?? raw?.totalCount ?? raw?.total ?? Infinity;
                    }

                    const events = toArray(raw);
                    if (events.length === 0) break; // No more results
                    allEvents.push(...events);

                    logger.debug('UniFi', `v2 traffic-flows page ${pageNumber} → ${events.length} entries (${allEvents.length}/${totalCount})`);

                    // Stop if we got all entries or this page was not full
                    if (allEvents.length >= totalCount || events.length < PAGE_SIZE) break;
                    pageNumber++;
                }

                logger.info('UniFi', `v2 traffic-flows → ${allEvents.length} entries (${pageNumber + 1} page(s))`);

                if (allEvents.length > 0) return cache(this._aggregateFlows(allEvents, 'v2-traffic-flows', rangeSeconds));
                ipsEndpointReachable = true;
                bestEmptySource = 'v2-traffic-flows-empty';
            } catch (err) {
                const msg = (err as Error).message;
                logger[msg.includes('404') ? 'debug' : 'info']('UniFi', `v2 traffic-flows ERROR: ${msg.substring(0, 100)}`);
            }

            // ── Also try other v2 GET endpoints ──────────────────────────────
            const v2GetPaths = [
                `/v2/api/site/${encodedSite}/intrusion-prevention/events?start=${startMs}&end=${endMs}&limit=1000`,
                `/v2/api/site/${encodedSite}/insights/flows?start=${startMs}&end=${endMs}&limit=1000`,
            ];
            if (!ipsEndpointReachable) {
                for (const path of v2GetPaths) {
                    const label = path.split('?')[0].split('/').slice(-2).join('/');
                    tried.push(`v2:${label}`);
                    try {
                        const raw = await this.controllerRequest<any>(path);
                        const events = toArray(raw);
                        logger.debug('UniFi', `v2 ${label} → ${events.length} events`);
                        if (events.length > 0) return cache(this._aggregateFlows(events, `v2-${label.replace('/', '-')}`, rangeSeconds));
                        ipsEndpointReachable = true;
                        bestEmptySource = `v2-${label}-empty`;
                        break;
                    } catch (err) {
                        logger.debug('UniFi', `v2 ${label} 404/error`);
                    }
                }
            }
        }

        // ── Attempt 1: stat/ips/event — primary IPS endpoint (all controllers) ─
        // On UniFiOS, controllerRequest auto-adds /proxy/network.
        // Try three param variants: within (hours), start/end (unix sec), no filter.
        const ipsEventVariants = [
            `/api/s/${encodedSite}/stat/ips/event?within=${withinHours}&_limit=1000`,
            `/api/s/${encodedSite}/stat/ips/event?start=${startSec}&end=${endSec}&_limit=1000`,
            `/api/s/${encodedSite}/stat/ips/event?_limit=500`,
        ];
        for (const url of ipsEventVariants) {
            tried.push(`ips/event:${url.split('?')[1]}`);
            try {
                const raw = await this.controllerRequest<any>(url);
                const events = toArray(raw);
                // Log raw type + sample to catch format mismatches
                logger.debug('UniFi', `stat/ips/event [${url.split('?')[1]}] → ${events.length} entries`);
                ipsEndpointReachable = true;
                if (events.length > 0) return cache(this._aggregateFlows(events, 'ips-event', rangeSeconds));
                bestEmptySource = 'ips-event-empty';
            } catch (err) {
                logger.debug('UniFi', `stat/ips/event [${url.split('?')[1]}] error: ${(err as Error).message}`);
            }
        }

        // ── Attempt 2: stat/ips — shorter path (some firmware versions) ──────
        if (!ipsEndpointReachable) {
            const ipsVariants = [
                `/api/s/${encodedSite}/stat/ips?within=${withinHours}&_limit=1000`,
                `/api/s/${encodedSite}/stat/ips?start=${startSec}&end=${endSec}&_limit=1000`,
                `/api/s/${encodedSite}/stat/ips?_limit=500`,
            ];
            for (const url of ipsVariants) {
                tried.push(`stat/ips:${url.split('?')[1]}`);
                try {
                    const raw = await this.controllerRequest<any>(url);
                    const events = toArray(raw);
                    logger.debug('UniFi', `stat/ips [${url.split('?')[1]}] → ${events.length} entries`);
                    ipsEndpointReachable = true;
                    if (events.length > 0) return cache(this._aggregateFlows(events, 'ips', rangeSeconds));
                    bestEmptySource = 'ips-empty';
                } catch (err) {
                    logger.debug('UniFi', `stat/ips [${url.split('?')[1]}] → ${(err as Error).message}`);
                }
            }
        }

        // ── Attempt 3: stat/alarm filtered to IPS subsystem ──────────────────
        tried.push('stat/alarm');
        try {
            const raw = await this.controllerRequest<any>(
                `/api/s/${encodedSite}/stat/alarm?_limit=1000&archived=false`
            );
            const list = toArray(raw);
            const ipsAlarms = list.filter((e: any) =>
                (e.subsystem || '') === 'ips' ||
                (e.key || '').startsWith('EVT_IPS') ||
                (e.key || '').startsWith('EVT_AD')
            );
            logger.debug('UniFi', `stat/alarm → ${list.length} total, ${ipsAlarms.length} IPS alarms`);
            if (ipsAlarms.length > 0) return cache(this._aggregateFlows(ipsAlarms, 'alarm', rangeSeconds));
            if (list.length > 0) {
                ipsEndpointReachable = true;
                if (bestEmptySource === 'none') bestEmptySource = 'alarm-no-ips';
            }
        } catch (err) {
            logger.debug('UniFi', `stat/alarm → ${(err as Error).message}`);
        }

        // ── Attempt 4: stat/event filtered to IPS keys ───────────────────────
        // Try several paths/param combos — on UniFiOS `within` causes 404
        tried.push('stat/event');
        let statEventRaw: any = null;
        for (const evtUrl of [
            `/api/s/${encodedSite}/stat/event?_limit=1000`,
            `/api/s/${encodedSite}/stat/events?_limit=1000`,
        ]) {
            try {
                statEventRaw = await this.controllerRequest<any>(evtUrl);
                logger.debug('UniFi', `stat/event hit on: ${evtUrl.split('?')[0].split('/').pop()}`);
                break;
            } catch (err) {
                logger.debug('UniFi', `${evtUrl} → ${(err as Error).message.substring(0, 60)}`);
            }
        }
        try {
            const raw = statEventRaw;
            const events = toArray(raw);
            const allKeys = [...new Set(events.map((e: any) => e.key).filter(Boolean))].slice(0, 15);
            const ipsEvents = events.filter((e: any) =>
                (e.key || '').startsWith('EVT_IPS') ||
                (e.key || '').startsWith('EVT_AD') ||
                (e.subsystem || '') === 'ids' ||
                (e.subsystem || '') === 'ips' ||
                (e.subsystem || '') === 'threat'
            );
            logger.debug('UniFi', `stat/event → ${events.length} total, ${ipsEvents.length} IPS`);
            if (ipsEvents.length > 0) return cache(this._aggregateFlows(ipsEvents, 'events', rangeSeconds));
            if (events.length > 0) {
                ipsEndpointReachable = true;
                if (bestEmptySource === 'none') bestEmptySource = `events-no-ips(${events.length}evts)`;
            }
        } catch (err) {
            // Upgrade to info so we see the error even in production logs
            logger.debug('UniFi', `stat/event error: ${(err as Error).message}`);
        }

        // ── All endpoints checked ─────────────────────────────────────────────
        logger.debug('UniFi', `getFlowInsights done — tried: [${tried.join(', ')}] reachable=${ipsEndpointReachable} source=${bestEmptySource}`);

        const result = ipsEndpointReachable
            ? { available: true, source: bestEmptySource, summary: { total: 0, low: 0, suspicious: 0, concerning: 0 }, topPolicies: [], topClients: [], topRegions: [], recentFlows: [] }
            : { available: false, source: `none(tried:${tried.join('|')})`, summary: { total: 0, low: 0, suspicious: 0, concerning: 0 }, topPolicies: [], topClients: [], topRegions: [], recentFlows: [] };

        return cache(result);
    }

    /**
     * Normalize raw flow/event/threat entries into the common structure.
     */
    private _aggregateFlows(raw: any[], source: string, rangeSeconds: number = 86400): ReturnType<UniFiApiService['getFlowInsights']> extends Promise<infer T> ? T : never {
        // Scale recentFlows limit: short ranges keep less, longer ranges keep more
        const RECENT_FLOWS_LIMIT = rangeSeconds <= 3600 ? 200
            : rangeSeconds <= 86400 ? 500
            : rangeSeconds <= 604800 ? 1000
            : 2000;
        const policyMap = new Map<string, number>();
        const clientMap = new Map<string, { mac: string; name?: string; ip?: string; count: number }>();
        const regionMap = new Map<string, number>();

        let low = 0; let suspicious = 0; let concerning = 0;

        const recentFlows: any[] = [];

        for (const item of raw) {
            // ── Detect format: v2 traffic-flows vs classic IPS events ─────────
            const isV2 = !!(item.source && typeof item.source === 'object' && 'ip' in item.source);

            // ── Threat level ──────────────────────────────────────────────────
            // v2: risk = "low" | "medium" | "high" | "critical" (string)
            // classic: threat_level, severity, level
            const rawLevel = (item.risk || item.threat_level || item.threatLevel || item.severity || item.level || '').toString().toUpperCase();
            let threatLevel = 'LOW';
            if (rawLevel === 'HIGH' || rawLevel === 'CRITICAL' || rawLevel.includes('CONCERN') || rawLevel === '3') {
                threatLevel = 'CONCERNING'; concerning++;
            } else if (rawLevel === 'MEDIUM' || rawLevel.includes('SUSPIC') || rawLevel === '2') {
                threatLevel = 'SUSPICIOUS'; suspicious++;
            } else {
                threatLevel = 'LOW'; low++;
            }

            // ── Policy / rule name ────────────────────────────────────────────
            // v2: policies[].name (array of objects), ips.signature (detailed)
            // classic: policy string, rule_name, catname, key
            const policy = isV2
                ? (item.policies?.[0]?.name || item.ips?.signature || item.ips?.category_name || 'Unknown')
                : ((Array.isArray(item.policy) ? item.policy[0] : item.policy)
                    || item.rule_name || item.rule || item.catname || item.signature || item.msg || item.key || 'Unknown');
            policyMap.set(policy, (policyMap.get(policy) || 0) + 1);

            // ── Affected client (destination = internal target being attacked) ─
            // v2: destination.mac, destination.client_name, destination.ip
            // classic: client_mac, src_ip (the source that triggered IPS)
            const mac = isV2
                ? (item.destination?.mac || '')
                : (item.client_mac || item.clientMac || item.src_mac || '');
            const name = isV2
                ? (item.destination?.client_name || item.destination?.host_name || '')
                : (item.client_name || item.clientName || item.src_name || '');
            const clientIp = isV2
                ? (item.destination?.ip || '')
                : (item.src_ip || item.srcIp || item.client_ip || '');
            if (mac || clientIp) {
                const key = mac || clientIp;
                const existing = clientMap.get(key);
                if (existing) {
                    existing.count++;
                    if (!existing.name && name) existing.name = name;
                } else {
                    clientMap.set(key, { mac, name: name || undefined, ip: clientIp || undefined, count: 1 });
                }
            }

            // ── Attacker source IP & region ───────────────────────────────────
            // v2: source.ip, source.region
            // classic: src_ip, country, src_country
            const srcIp = isV2
                ? (item.source?.ip || '')
                : (item.src_ip || item.srcIp || item.client_ip || '');
            const country = isV2
                ? (item.source?.region || '')
                : (item.country || item.src_country || item.dst_country || item.geo_country || '');
            if (country) regionMap.set(country, (regionMap.get(country) || 0) + 1);

            // ── Timestamp ─────────────────────────────────────────────────────
            // v2: flow_start_time or time (ms); classic: timestamp (s or ms)
            const tsRaw = item.flow_start_time ?? item.time ?? item.timestamp ?? item.datetime;
            const timestamp = tsRaw != null ? (tsRaw > 1e12 ? tsRaw / 1000 : tsRaw) : Date.now() / 1000;

            // ── Service / direction / signature / ports / flow count ─────────
            const service = isV2
                ? (item.service || item.ips?.category_name || '')
                : (item.catname || item.category || item.app_proto || '');
            const direction = isV2
                ? (item.direction || '')
                : (item.direction || item.flow_direction || '');
            const signature = isV2
                ? (item.ips?.signature || item.policies?.[0]?.description || '')
                : (item.inner_alert_signature || item.signature || item.msg || '');
            const dstPort = isV2
                ? (item.destination?.port ?? item.dest_port ?? undefined)
                : (item.dest_port ?? item.dst_port ?? item.dstPort ?? undefined);
            const srcPort = isV2
                ? (item.source?.port ?? item.src_port ?? undefined)
                : (item.src_port ?? item.srcPort ?? undefined);
            const flowCount = item.flow_count ?? item.flowCount ?? item.count ?? 1;

            // ── Recent flow entry ─────────────────────────────────────────────
            if (recentFlows.length < RECENT_FLOWS_LIMIT) {
                recentFlows.push({
                    timestamp,
                    action: typeof item.action === 'string' ? item.action.toUpperCase() : (item.blocked ? 'BLOCK' : 'DETECT'),
                    threatLevel,
                    policy,
                    srcIp,
                    dstIp: isV2 ? (item.destination?.ip || '') : (item.dst_ip || item.dstIp || item.server_ip || ''),
                    clientMac: mac || undefined,
                    clientName: name || undefined,
                    country: country || undefined,
                    proto: item.protocol || item.proto || '',
                    service: service || undefined,
                    direction: direction || undefined,
                    signature: signature || undefined,
                    dstPort: typeof dstPort === 'number' ? dstPort : (dstPort ? parseInt(dstPort, 10) || undefined : undefined),
                    srcPort: typeof srcPort === 'number' ? srcPort : (srcPort ? parseInt(srcPort, 10) || undefined : undefined),
                    flowCount: typeof flowCount === 'number' ? flowCount : 1,
                });
            }
        }

        const topPolicies = [...policyMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        const topClients = [...clientMap.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const topRegions = [...regionMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([country, count]) => ({ country, count }));

        return {
            available: true,
            source,
            summary: { total: raw.length, low, suspicious, concerning },
            topPolicies,
            topClients,
            topRegions,
            recentFlows: recentFlows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        };
    }
}

