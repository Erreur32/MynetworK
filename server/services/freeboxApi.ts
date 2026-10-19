import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Agent } from 'undici';
import {config, API_ENDPOINTS} from '../config.js';
import { logger } from '../utils/logger.js';
import { recordUpstream } from '../utils/upstreamCallStats.js';
import { insecureAgent } from '../utils/insecureAgent.js';

// Export the class for use in plugins
export { FreeboxApiService };

const getInsecureAgent = (): Agent => insecureAgent;

interface TokenData {
    appToken: string;
    trackId?: number;
    status?: string;
}

interface SessionData {
    sessionToken: string;
    challenge: string;
    permissions: Record<string, boolean>;
}

interface FreeboxApiResponse<T = unknown> {
    success: boolean;
    result?: T;
    error_code?: string;
    msg?: string;
}

interface VersionInfo {
    api_version?: string;
    box_model?: string;
    box_model_name?: string;
    device_name?: string;
    uid?: string;
}

class FreeboxApiService {
    private baseUrl: string;
    private appToken: string | null = null;
    private sessionToken: string | null = null;
    private challenge: string | null = null;
    private permissions: Record<string, boolean> = {};
    private versionInfo: VersionInfo | null = null;
    // In-flight GET requests, shared by concurrent callers of the same endpoint
    private endpointLocks: Map<string, Promise<FreeboxApiResponse>> = new Map();
    // Short-lived GET answers (see getCacheTtl), dropped on any write to the same path prefix
    private getCache: Map<string, { expires: number; value: FreeboxApiResponse }> = new Map();
    // Bumped on every invalidation: a GET started before a write must not fill the cache
    private cacheGeneration = 0;
    // RRD answers keyed by rounded window (see getRrdData)
    private rrdCache: Map<string, { expires: number; value: Promise<FreeboxApiResponse> }> = new Map();
    // Shared in-flight auth calls: concurrent callers never open two sessions at once
    private loginPromise: Promise<SessionData> | null = null;
    private sessionCheckPromise: Promise<boolean> | null = null;
    private lastRenewFailure = 0;
    // api_version is static for a given box: fetched once, reset on box/URL change, login or reboot
    private apiVersionPromise: Promise<FreeboxApiResponse> | null = null;
    private apiVersionCached = false;

    // GET cache TTLs by path prefix, first match wins; endpoints not listed are never cached
    private static readonly GET_CACHE_TTLS: Array<[string, number]> = [
        ['/vm/disk/', 0],            // disk task polling must always reach the box
        ['/wifi/wps/', 0],
        ['/wifi/temp_disable/', 0],
        ['/wifi/', 10_000],
        ['/dhcp/', 10_000],
        ['/lan/browser/', 5_000],
        ['/lan/config/', 30_000],
        ['/fw/redir/', 30_000],
        ['/fw/dmz/', 30_000],
        ['/downloads/', 2_000],
        ['/vm/', 5_000],
    ];
    // POST endpoints that only read data: they never invalidate the GET cache
    private static readonly READ_ONLY_POSTS = new Set<string>([API_ENDPOINTS.RRD, API_ENDPOINTS.VM_DISK_INFO]);
    private static readonly SESSION_ERRORS = new Set(['auth_required', 'invalid_session']);
    private static readonly RENEW_BACKOFF_MS = 30_000;

    constructor() {
        this.baseUrl = config.freebox.url;
        this.loadToken();
    }

    // Allowed hostnames for Freebox API (prevents SSRF via setBaseUrl)
    private static readonly ALLOWED_HOSTS = [
        'mafreebox.freebox.fr',
        /^192\.168\.\d{1,3}\.\d{1,3}$/,  // Local network
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
        /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
    ];

    // Set the base URL (for switching between mafreebox.freebox.fr and local IP)
    setBaseUrl(url: string) {
        // Validate URL to prevent SSRF: only allow Freebox-related hosts
        const parsed = new URL(url);
        const isAllowed = FreeboxApiService.ALLOWED_HOSTS.some(h =>
            typeof h === 'string' ? parsed.hostname === h : h.test(parsed.hostname)
        );
        if (!isAllowed) {
            throw new Error(`Blocked: ${parsed.hostname} is not an allowed Freebox host`);
        }
        const baseUrl = `${parsed.protocol}//${parsed.host}`;
        if (baseUrl !== this.baseUrl) {
            // Another box may answer at the new URL: drop everything learnt from the old one
            this.versionInfo = null;
            this.apiVersionCached = false;
            this.invalidateCache();
        }
        this.baseUrl = baseUrl;
    }

    // Get current base URL
    getBaseUrl(): string {
        return this.baseUrl;
    }

    // Get token file path (handles both relative and absolute paths)
    private getTokenPath(): string {
        const tokenFile = config.freebox.tokenFile;
        
        // config.freebox.tokenFile should already be an absolute path from config.ts
        // But if it's relative, resolve it properly
        if (path.isAbsolute(tokenFile)) {
            return tokenFile;
        }
        
        // If relative, resolve from project root (where package.json is)
        // This handles cases where process.cwd() might not be the project root
        let projectRoot = process.cwd();
        let currentDir = process.cwd();
        const maxDepth = 10;
        let depth = 0;
        
        // Find project root by looking for package.json
        while (depth < maxDepth && currentDir !== path.dirname(currentDir)) {
            if (fs.existsSync(path.join(currentDir, 'package.json'))) {
                projectRoot = currentDir;
                break;
            }
            currentDir = path.dirname(currentDir);
            depth++;
        }
        
        const resolvedPath = path.resolve(projectRoot, tokenFile);
        return resolvedPath;
    }

    // Load app_token from file
    private loadToken() {
        const tokenPath = this.getTokenPath();
        logger.debug('FreeboxAPI', `Token file path: ${tokenPath}`);
        logger.debug('FreeboxAPI', `File exists: ${fs.existsSync(tokenPath)}`);

        if (fs.existsSync(tokenPath)) {
            try {
                const fileContent = fs.readFileSync(tokenPath, 'utf-8');
                logger.debug('FreeboxAPI', `File content length: ${fileContent.length} bytes`);
                const data = JSON.parse(fileContent) as TokenData;
                this.appToken = data.appToken;
                logger.debug('FreeboxAPI', 'Loaded app_token from file');
            } catch (error) {
                logger.warn('FreeboxAPI', 'Failed to load token file:', error);
            }
        } else {
            logger.debug('FreeboxAPI', 'No token file found - registration required');
            // List directory to help debug
            const dir = path.dirname(tokenPath);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                logger.debug('FreeboxAPI', `Files in ${dir}:`, files);
            } else {
                logger.debug('FreeboxAPI', `Directory ${dir} does not exist`);
            }
        }
    }

    // Reload token from file (useful after Docker restart or file changes)
    reloadToken(): void {
        logger.debug('FreeboxAPI', 'Reloading token from file...');
        this.loadToken();
    }

    // Get app token (for display purposes only - read-only access)
    getAppToken(): string | null {
        // If token is not loaded in memory, try to load it from file
        if (!this.appToken) {
            this.loadToken();
        }
        return this.appToken;
    }

    // Save app_token to file
    private saveToken(appToken: string) {
        const tokenPath = this.getTokenPath();
        // Ensure directory exists (for Docker volumes)
        const tokenDir = path.dirname(tokenPath);
        if (!fs.existsSync(tokenDir)) {
            fs.mkdirSync(tokenDir, {recursive: true});
        }
        fs.writeFileSync(tokenPath, JSON.stringify({appToken}, null, 2), 'utf-8');
        this.appToken = appToken;
        logger.debug('FreeboxAPI', `Saved app_token to ${tokenPath}`);
    }

    // Reset/delete app_token (for re-registration when token is invalid)
    resetToken(): void {
        const tokenPath = this.getTokenPath();
        if (fs.existsSync(tokenPath)) {
            fs.unlinkSync(tokenPath);
            logger.info('FreeboxAPI', `Deleted token file: ${tokenPath}`);
        }
        this.appToken = null;
        this.sessionToken = null;
        this.challenge = null;
        this.permissions = {};
        this.invalidateCache();
        logger.info('FreeboxAPI', 'Token reset - re-registration required');
    }

    // Build full API URL — reconstructs URL from trusted base to prevent SSRF
    private buildUrl(endpoint: string, apiVersion = config.freebox.apiVersion): string {
        // Parse the trusted base URL and rebuild with the API path
        const base = new URL(this.baseUrl);
        // Sanitize endpoint: strip path traversal, ensure it starts with /
        const safeEndpoint = endpoint.replaceAll('..', '').replace(/^\/+/, '/');
        // Reconstruct URL from trusted origin components only (not from user input)
        return `${base.protocol}//${base.host}/api/${apiVersion}${safeEndpoint}`;
    }

    // Make HTTP request to Freebox
    private async request<T>(
        method: string,
        endpoint: string,
        body?: unknown,
        authenticated = true
    ): Promise<FreeboxApiResponse<T>> {
        const url = this.buildUrl(endpoint);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (authenticated && this.sessionToken) {
            headers['X-Fbx-App-Auth'] = this.sessionToken;
        }

        const options: RequestInit = {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        };

        // Check if model is Revolution - if so, use longer timeout (ONLY for Revolution)
        const isRevolution = this.isRevolutionModel();
        const timeoutValue = this.getTimeoutForEndpoint(endpoint, isRevolution);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutValue);

            // Use insecure agent for Freebox self-signed certificates
            const agent = getInsecureAgent();
            const fetchOptions: RequestInit = {
                ...options,
                signal: controller.signal
            };
            // Only add dispatcher if agent is available (undici)
            if (agent && agent.constructor && agent.constructor.name === 'Agent') {
                (fetchOptions as any).dispatcher = agent;
            }
            recordUpstream('freebox', `${method} ${endpoint}`, 'call');
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeout);
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                logger.error('FreeboxAPI', `Non-JSON response: ${method} ${url}`, text.substring(0, 200));
                return {
                    success: false,
                    error_code: 'invalid_response',
                    msg: `API returned non-JSON response (${response.status})`
                };
            }

            const data = await response.json() as FreeboxApiResponse<T>;
            return data;
        } catch (error) {
            const isAbortError = error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'));
            logger.error('FreeboxAPI', `Request failed: ${method} ${url}`, error);
            // Return error response instead of throwing
            return {
                success: false,
                error_code: 'request_failed',
                msg: error instanceof Error ? error.message : 'Request failed',
                // Store error type for retry logic
                _isAbortError: isAbortError
            } as FreeboxApiResponse<T> & { _isAbortError?: boolean };
        }
    }

    // TTL of the GET cache for an endpoint, 0 = never cached
    private getCacheTtl(endpoint: string): number {
        if (endpoint === API_ENDPOINTS.CONNECTION) return 900; // below the 1s live polling period
        if (endpoint === API_ENDPOINTS.SYSTEM) return 5_000;
        const match = FreeboxApiService.GET_CACHE_TTLS.find(([prefix]) => endpoint.startsWith(prefix));
        return match ? match[1] : 0;
    }

    // Callers may mutate what they get: always hand out a copy of cached data
    private readCache<T>(endpoint: string): FreeboxApiResponse<T> | null {
        const entry = this.getCache.get(endpoint);
        if (!entry) return null;
        if (entry.expires <= Date.now() || !this.sessionToken) {
            this.getCache.delete(endpoint);
            return null;
        }
        return structuredClone(entry.value) as FreeboxApiResponse<T>;
    }

    private writeCache(endpoint: string, response: FreeboxApiResponse, generation: number): void {
        const ttl = this.getCacheTtl(endpoint);
        // Errors and auth endpoints are never cached; a write since the request started makes it stale
        if (ttl <= 0 || !response.success || endpoint.startsWith('/login') || generation !== this.cacheGeneration) return;
        this.getCache.set(endpoint, { expires: Date.now() + ttl, value: structuredClone(response) });
    }

    /**
     * Drop cached and in-flight GET answers under a path prefix (all of them when omitted),
     * so the next read after a write reaches the box
     */
    invalidateCache(prefix?: string): void {
        this.cacheGeneration++;
        for (const key of this.getCache.keys()) {
            if (!prefix || key.startsWith(prefix)) this.getCache.delete(key);
        }
        for (const key of this.endpointLocks.keys()) {
            if (!prefix || key.startsWith(`GET:${prefix}`)) this.endpointLocks.delete(key);
        }
        if (!prefix || prefix === API_ENDPOINTS.RRD) this.rrdCache.clear();
    }

    // Counter bumped by every write or cache reset, lets aggregating callers drop their own caches
    getWriteGeneration(): number {
        return this.cacheGeneration;
    }

    // First path segment of an endpoint ('/wifi/bss/x' -> '/wifi/'), the scope invalidated by a write
    private resourcePrefix(endpoint: string): string {
        return `/${endpoint.split('/')[1] ?? ''}/`;
    }

    /**
     * Make HTTP request, sharing in-flight and short-lived cached answers for GET only.
     * Non-GET calls are never merged (each body gets its own answer) and invalidate the
     * cache of their path prefix once done.
     *
     * @param method HTTP method
     * @param endpoint API endpoint path
     * @param body Request body (optional)
     * @param authenticated Whether to include authentication token
     * @returns Promise resolving to API response
     */
    private async requestWithLock<T>(
        method: string,
        endpoint: string,
        body?: unknown,
        authenticated = true
    ): Promise<FreeboxApiResponse<T>> {
        if (method !== 'GET') {
            try {
                return await this.requestWithRetry<T>(method, endpoint, body, authenticated);
            } finally {
                if (!FreeboxApiService.READ_ONLY_POSTS.has(endpoint)) {
                    this.invalidateCache(this.resourcePrefix(endpoint));
                }
            }
        }

        const cached = this.readCache<T>(endpoint);
        if (cached) {
            recordUpstream('freebox', `GET ${endpoint}`, 'cache');
            return cached;
        }

        const lockKey = `GET:${endpoint}`;
        const existingLock = this.endpointLocks.get(lockKey);
        if (existingLock !== undefined) {
            recordUpstream('freebox', `GET ${endpoint}`, 'shared');
            // Reuse the in-flight request, with a private copy for this caller
            return existingLock.then((response) => structuredClone(response)) as Promise<FreeboxApiResponse<T>>;
        }

        // Create promise with retry for Revolution slow endpoints
        const generation = this.cacheGeneration;
        const promise: Promise<FreeboxApiResponse<T>> = this.requestWithRetry<T>(method, endpoint, body, authenticated)
            .then((response) => {
                if (authenticated) this.writeCache(endpoint, response, generation);
                return response;
            })
            .finally(() => {
                // Release the lock unless an invalidation already replaced it
                if (this.endpointLocks.get(lockKey) === promise) this.endpointLocks.delete(lockKey);
            });

        this.endpointLocks.set(lockKey, promise);
        return promise;
    }

    /**
     * Send an authenticated request; when the box reports an expired session, renew it
     * once (shared by all concurrent callers) and replay the request. A request rejected
     * for auth was not executed, so replaying a write is safe.
     */
    private async requestWithSession<T>(
        method: string,
        endpoint: string,
        body?: unknown,
        authenticated = true
    ): Promise<FreeboxApiResponse<T>> {
        const usedToken = this.sessionToken;
        const response = await this.request<T>(method, endpoint, body, authenticated);
        // Only renew a session that existed: no auto-login when nobody logged in
        if (!authenticated || response.success || !usedToken || !FreeboxApiService.SESSION_ERRORS.has(response.error_code ?? '')) {
            return response;
        }
        // Another caller may already have renewed the session meanwhile
        if (this.sessionToken === usedToken && !(await this.renewSession())) {
            return response;
        }
        return this.request<T>(method, endpoint, body, authenticated);
    }

    // Failures back off, so a revoked app token does not cost a login per request
    private async renewSession(): Promise<boolean> {
        if (!this.appToken || Date.now() - this.lastRenewFailure < FreeboxApiService.RENEW_BACKOFF_MS) {
            this.sessionToken = null;
            return false;
        }
        try {
            logger.info('FreeboxAPI', 'Session expired, renewing...');
            await this.login();
            return true;
        } catch (error) {
            this.lastRenewFailure = Date.now();
            this.sessionToken = null;
            this.invalidateCache();
            logger.warn('FreeboxAPI', 'Session renewal failed:', error instanceof Error ? error.message : error);
            return false;
        }
    }

    /**
     * Make HTTP request with retry and exponential backoff for Revolution slow endpoints
     * Only retries on AbortError (timeout) and only for Revolution model on slow endpoints.
     * GET only: a timed-out write may still have been applied by the box.
     *
     * @param method HTTP method
     * @param endpoint API endpoint path
     * @param body Request body (optional)
     * @param authenticated Whether to include authentication token
     * @param maxRetries Maximum number of retry attempts (default: 2)
     * @returns Promise resolving to API response
     */
    private async requestWithRetry<T>(
        method: string,
        endpoint: string,
        body?: unknown,
        authenticated = true,
        maxRetries = 2
    ): Promise<FreeboxApiResponse<T>> {
        const isRevolution = this.isRevolutionModel();
        const isSlowEndpoint = this.isSlowEndpoint(endpoint);
        
        // Retry only idempotent reads, Revolution model and slow endpoints
        const shouldRetry = method === 'GET' && isRevolution && isSlowEndpoint && maxRetries > 0;

        const response = await this.requestWithSession<T>(method, endpoint, body, authenticated);
        
        // Check if request failed and should be retried
        if (!response.success && shouldRetry && maxRetries > 0) {
            const responseWithError = response as FreeboxApiResponse<T> & { _isAbortError?: boolean };
            const isAbortError = responseWithError._isAbortError || 
                                (response.error_code === 'request_failed' && 
                                 response.msg && 
                                 (response.msg.includes('aborted') || response.msg.includes('AbortError')));
            
            if (isAbortError) {
                // Timeout - retry with exponential backoff
                const delay = Math.pow(2, maxRetries - 1) * 1000; // 1s, 2s
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.requestWithRetry(method, endpoint, body, authenticated, maxRetries - 1);
            }
        }
        
        return response;
    }

    // HMAC-SHA1 password computation
    private computePassword(challenge: string): string {
        if (!this.appToken) {
            throw new Error('No app_token available');
        }
        return crypto.createHmac('sha1', this.appToken).update(challenge).digest('hex');
    }

    // ==================== AUTH ====================

    // Step 1: Register app (requires physical validation on Freebox)
    async register(): Promise<{ trackId: number; appToken: string }> {
        const response = await this.request<{ app_token: string; track_id: number }>(
            'POST',
            API_ENDPOINTS.LOGIN_AUTHORIZE,
            {
                app_id: config.freebox.appId,
                app_name: config.freebox.appName,
                app_version: config.freebox.appVersion,
                device_name: config.freebox.deviceName
            },
            false
        );

        if (!response.success || !response.result) {
            throw new Error(response.msg || 'Registration failed');
        }

        // Save app_token immediately
        this.saveToken(response.result.app_token);

        return {
            trackId: response.result.track_id,
            appToken: response.result.app_token
        };
    }

    // Step 2: Check registration status
    async checkRegistrationStatus(trackId: number): Promise<{
        status: 'unknown' | 'pending' | 'timeout' | 'granted' | 'denied';
        challenge?: string;
    }> {
        const response = await this.request<{
            status: 'unknown' | 'pending' | 'timeout' | 'granted' | 'denied';
            challenge?: string;
        }>('GET', `${API_ENDPOINTS.LOGIN_AUTHORIZE}${trackId}`, undefined, false);

        if (!response.success || !response.result) {
            throw new Error(response.msg || 'Failed to check registration status');
        }

        if (response.result.challenge) {
            this.challenge = response.result.challenge;
        }

        return response.result;
    }

    // Step 3: Get challenge (for login)
    async getChallenge(): Promise<string> {
        const response = await this.request<{
            logged_in: boolean;
            challenge: string;
        }>('GET', API_ENDPOINTS.LOGIN, undefined, false);

        if (!response.success || !response.result) {
            throw new Error(response.msg || 'Failed to get challenge');
        }

        this.challenge = response.result.challenge;
        return this.challenge;
    }

    // Step 4: Open session (concurrent callers share the same login)
    async login(): Promise<SessionData> {
        this.loginPromise ??= this.doLogin().finally(() => {
            this.loginPromise = null;
        });
        return this.loginPromise;
    }

    private async doLogin(): Promise<SessionData> {
        if (!this.appToken) {
            logger.error('FreeboxAPI', 'Login failed: No app_token available. Please register first.');
            throw new Error('No app_token available. Please register first.');
        }

        logger.debug('FreeboxAPI', 'Starting login process...');
        logger.debug('FreeboxAPI', 'Base URL:', this.baseUrl);

        // Get fresh challenge
        try {
        await this.getChallenge();
        } catch (error) {
            logger.error('FreeboxAPI', 'Failed to get challenge:', error);
            throw new Error(`Failed to get challenge: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        if (!this.challenge) {
            logger.error('FreeboxAPI', 'Login failed: No challenge available after getChallenge()');
            throw new Error('No challenge available');
        }

        const password = this.computePassword(this.challenge);

        logger.debug('FreeboxAPI', 'Sending login request...');
        const response = await this.request<{
            session_token: string;
            challenge: string;
            permissions: Record<string, boolean>;
        }>(
            'POST',
            API_ENDPOINTS.LOGIN_SESSION,
            {
                app_id: config.freebox.appId,
                app_version: config.freebox.appVersion,
                password
            },
            false
        );

        if (!response.success || !response.result) {
            const errorMsg = response.msg || response.error_code || 'Login failed';
            logger.error('FreeboxAPI', 'Login failed:', errorMsg);
            logger.error('FreeboxAPI', 'Response:', JSON.stringify(response, null, 2));
            throw new Error(errorMsg);
        }

        this.sessionToken = response.result.session_token;
        this.challenge = response.result.challenge;
        this.permissions = response.result.permissions;
        this.lastRenewFailure = 0;
        // A new session often follows a box reboot (maybe a firmware update): refresh api_version lazily
        this.apiVersionCached = false;

        logger.info('FreeboxAPI', 'Login successful');
        logger.debug('FreeboxAPI', 'Session token received, permissions:', Object.keys(this.permissions).length);

        return {
            sessionToken: this.sessionToken,
            challenge: this.challenge,
            permissions: this.permissions
        };
    }

    // Logout
    async logout(): Promise<void> {
        if (this.sessionToken) {
            await this.request('POST', API_ENDPOINTS.LOGIN_LOGOUT, undefined, true);
            this.sessionToken = null;
            this.invalidateCache();
            logger.debug('FreeboxAPI', 'Logged out');
        }
    }

    // Check if session is valid (concurrent callers share the same check)
    async checkSession(): Promise<boolean> {
        // If we don't have a session token, we're definitely not logged in
        if (!this.sessionToken) {
            return false;
        }
        this.sessionCheckPromise ??= this.doCheckSession().finally(() => {
            this.sessionCheckPromise = null;
        });
        return this.sessionCheckPromise;
    }

    private async doCheckSession(): Promise<boolean> {
        // A login may replace the token while this check runs: only clear the token that was checked
        const usedToken = this.sessionToken;
        const clearSession = () => { if (this.sessionToken === usedToken) this.sessionToken = null; };
        try {
            // Use authenticated request to check session status
            // The /login/ endpoint returns logged_in status when called with session token
            const response = await this.request<{ logged_in: boolean }>('GET', API_ENDPOINTS.LOGIN, undefined, true);
            if (!response.success) {
                logger.debug('FreeboxAPI', 'checkSession failed:', response.msg || response.error_code);
                // If authentication fails, clear the session token
                if (response.error_code === 'invalid_session' || response.msg?.includes('session')) {
                    clearSession();
                }
                return false;
            }
            const isLoggedIn = response.result?.logged_in === true;
            if (!isLoggedIn) {
                // Session expired, clear token
                clearSession();
            }
            return isLoggedIn;
        } catch (error) {
            logger.error('FreeboxAPI', 'checkSession error:', error);
            // On error, assume session is invalid
            clearSession();
            return false;
        }
    }

    // Check if registered
    isRegistered(): boolean {
        return this.appToken !== null;
    }

    // Check if logged in
    isLoggedIn(): boolean {
        return this.sessionToken !== null;
    }

    // Get session token (for WebSocket authentication)
    getSessionToken(): string | null {
        return this.sessionToken;
    }

    // Get permissions
    getPermissions(): Record<string, boolean> {
        return this.permissions;
    }

    // ==================== SYSTEM ====================

    // Get API version info (no auth required) - includes box model name.
    // Static data: fetched once, then served from memory (copy, callers may mutate it)
    async getApiVersion(): Promise<FreeboxApiResponse> {
        if (this.apiVersionCached && this.versionInfo) {
            recordUpstream('freebox', `GET ${API_ENDPOINTS.API_VERSION}`, 'cache');
            return {success: true, result: {...this.versionInfo}};
        }
        if (this.apiVersionPromise) recordUpstream('freebox', `GET ${API_ENDPOINTS.API_VERSION}`, 'shared');
        this.apiVersionPromise ??= this.fetchApiVersion().finally(() => {
            this.apiVersionPromise = null;
        });
        const response = await this.apiVersionPromise;
        return response.success ? {success: true, result: {...(response.result as object)}} : response;
    }

    private async fetchApiVersion(): Promise<FreeboxApiResponse> {
        const baseUrl = this.baseUrl;
        const url = `${baseUrl}${API_ENDPOINTS.API_VERSION}`;
        recordUpstream('freebox', `GET ${API_ENDPOINTS.API_VERSION}`, 'call');
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), config.freebox.requestTimeout);
            // Use insecure agent for Freebox self-signed certificates
            const agent = getInsecureAgent();
            const fetchOptions: RequestInit = {
                signal: controller.signal
            };
            // Only add dispatcher if agent is available (undici)
            if (agent && agent.constructor && agent.constructor.name === 'Agent') {
                (fetchOptions as any).dispatcher = agent;
            }
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeout);
            const data = await response.json();
            // Cache version info for later use (unless the base URL changed meanwhile)
            if (baseUrl === this.baseUrl) {
                this.versionInfo = data as VersionInfo;
                this.apiVersionCached = response.ok;
            }
            // api_version endpoint returns data directly, not wrapped in {success, result}
            return {success: true, result: data};
        } catch (error) {
            logger.error('FreeboxAPI', 'Failed to get API version:', error);
            return {success: false, msg: 'Failed to get API version'};
        }
    }

    // Get cached version info (call getApiVersion first to populate)
    getVersionInfo(): VersionInfo | null {
        return this.versionInfo;
    }

    /**
     * Check if an endpoint is known to be slow on Revolution
     * 
     * @param endpoint API endpoint path
     * @returns True if endpoint is slow, false otherwise
     */
    private isSlowEndpoint(endpoint: string): boolean {
        const slowEndpoints = [
            '/dhcp/dynamic_lease/',
            '/dhcp/static_lease/',
            '/fw/redir/',
            '/lan/browser/pub/'
        ];
        return slowEndpoints.some(slow => endpoint.includes(slow));
    }

    /**
     * Get timeout value for a specific endpoint based on model and endpoint characteristics
     * Some endpoints are slower on Revolution and need longer timeouts
     * 
     * @param endpoint API endpoint path
     * @param isRevolution Whether the Freebox model is Revolution
     * @returns Timeout value in milliseconds
     */
    private getTimeoutForEndpoint(endpoint: string, isRevolution: boolean): number {
        if (!isRevolution) {
            return config.freebox.requestTimeout; // 10s par défaut pour les autres modèles
        }
        
        // Endpoints lents sur Revolution : 45s (augmenté de 30s)
        if (this.isSlowEndpoint(endpoint)) {
            return 45000; // 45s pour endpoints lents sur Revolution
        }
        
        return 25000; // 25s pour autres endpoints sur Revolution (augmenté de 20s)
    }

    /**
     * Check if the detected Freebox model is Revolution
     * Returns true ONLY for Revolution, false for all other models (Pop, Ultra, Delta, etc.)
     * This allows applying Revolution-specific fixes without affecting other models
     */
    private isRevolutionModel(): boolean {
        if (!this.versionInfo) {
            return false;
        }
        const modelName = (this.versionInfo.box_model_name || this.versionInfo.box_model || '').toLowerCase();
        // Only return true for Revolution - all other models (Pop, Ultra, Delta) return false
        return modelName.includes('revolution') || modelName.includes('v6') || modelName.includes('fbxgw1');
    }

    async getSystemInfo(): Promise<FreeboxApiResponse> {
        const result = await this.requestWithLock('GET', API_ENDPOINTS.SYSTEM);
        // console.log('[FreeboxAPI] System info result:', JSON.stringify(result, null, 2));
        return result;
    }

    async reboot(): Promise<FreeboxApiResponse> {
        logger.info('FreeboxAPI', 'Attempting reboot...');
        const result = await this.request('POST', API_ENDPOINTS.SYSTEM_REBOOT);
        // Everything cached describes the box before the reboot
        this.invalidateCache();
        this.apiVersionCached = false;
        logger.debug('FreeboxAPI', 'Reboot result:', {
            success: result.success,
            error_code: result.error_code,
            msg: result.msg
        });

        if (!result.success) {
            logger.error('FreeboxAPI', `Reboot failed: ${result.msg || result.error_code}`);
        } else {
            logger.info('FreeboxAPI', 'Reboot command sent successfully');
        }

        return result;
    }

    // ==================== CONNECTION ====================

    async getConnectionStatus(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.CONNECTION);
    }

    async getConnectionConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.CONNECTION_CONFIG);
    }

    async updateConnectionConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.CONNECTION_CONFIG, data);
    }

    async getIpv6Config(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.CONNECTION_IPV6);
    }

    async updateIpv6Config(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.CONNECTION_IPV6, data);
    }

    // ==================== DynDNS ====================

    async getDdnsConfig(provider: 'ovh' | 'dyndns' | 'noip'): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.CONNECTION_DDNS}${provider}/`);
    }

    async updateDdnsConfig(provider: 'ovh' | 'dyndns' | 'noip', data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.CONNECTION_DDNS}${provider}/`, data);
    }

    async getDdnsStatus(provider: 'ovh' | 'dyndns' | 'noip'): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.CONNECTION_DDNS}${provider}/status/`);
    }

    async getFtthInfo(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.CONNECTION_FTTH);
    }

    async getConnectionLogs(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.CONNECTION_LOGS);
    }

    // ==================== RRD (Monitoring) ====================

    async getRrdData(
        db: 'net' | 'temp' | 'dsl' | 'switch',
        dateStart?: number,
        dateEnd?: number,
        fields?: string[]
    ): Promise<FreeboxApiResponse> {
        const body: Record<string, unknown> = {db};
        if (dateStart) body.date_start = dateStart;
        if (dateEnd) body.date_end = dateEnd;
        if (fields) body.fields = fields;

        // Charts re-request the same sliding window every few seconds: share one answer per
        // window rounded to a step, kept for a TTL that grows with the range
        const nowMs = Date.now();
        const range = dateStart ? (dateEnd ?? Math.floor(nowMs / 1000)) - dateStart : 0;
        const ttlSec = range <= 3600 ? 30 : range <= 6 * 3600 ? 120 : range <= 86400 ? 300 : 900;
        const bucket = (t?: number) => (t ? Math.floor(t / ttlSec) : '');
        const key = `${db}:${bucket(dateStart)}:${bucket(dateEnd)}:${fields?.join(',') ?? ''}`;

        for (const [k, entry] of this.rrdCache) {
            if (entry.expires <= nowMs) this.rrdCache.delete(k);
        }
        let entry = this.rrdCache.get(key);
        if (entry) {
            recordUpstream('freebox', `POST ${API_ENDPOINTS.RRD}`, 'cache');
        } else {
            const value = this.requestWithLock('POST', API_ENDPOINTS.RRD, body);
            entry = { expires: nowMs + ttlSec * 1000, value };
            this.rrdCache.set(key, entry);
            // Never keep a failed answer
            const dropIfCurrent = () => {
                if (this.rrdCache.get(key)?.value === value) this.rrdCache.delete(key);
            };
            void value.then((response) => { if (!response.success) dropIfCurrent(); }, dropIfCurrent);
        }
        return structuredClone(await entry.value);
    }

    // ==================== WIFI ====================

    async getWifiConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.WIFI_CONFIG);
    }

    async setWifiConfig(enabled: boolean): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.WIFI_CONFIG, {enabled});
    }

    async getWifiAps(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.WIFI_AP);
    }

    async getWifiApStations(apId: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.WIFI_AP}${apId}/stations/`);
    }

    async getWifiBss(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.WIFI_BSS);
    }

    async updateWifiBss(bssId: string, params: { enabled: boolean }): Promise<FreeboxApiResponse> {
        // API expects: { config: { enabled: true/false } }
        return this.requestWithLock('PUT', `${API_ENDPOINTS.WIFI_BSS}${bssId}`, {config: params});
    }

    // Freebox OS has no global station list: gather the stations of every access point
    async getWifiStations(): Promise<FreeboxApiResponse> {
        const aps = await this.getWifiAps();
        if (!aps.success || !Array.isArray(aps.result)) return aps;
        const stations: unknown[] = [];
        for (const ap of aps.result as Array<{ id: number }>) {
            const r = await this.getWifiApStations(ap.id);
            if (r.success && Array.isArray(r.result)) stations.push(...r.result.map((st) => ({ ...(st as object), ap_id: ap.id })));
        }
        return { success: true, result: stations };
    }

    async getWifiMacFilter(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.WIFI_MAC_FILTER);
    }

    async setWifiMacFilter(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.WIFI_MAC_FILTER, data);
    }

    async getWifiPlanning(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.WIFI_PLANNING);
    }

    async updateWifiPlanning(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.WIFI_PLANNING, data);
    }

    async getWpsStatus(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', '/wifi/wps/sessions/');
    }

    async startWps(): Promise<FreeboxApiResponse> {
        // WPS session start - POST to create a new WPS session
        // bss_id 0 = main 2.4GHz, 1 = 5GHz, etc.
        return this.requestWithLock('POST', '/wifi/wps/sessions/', {bss_id: 0});
    }

    async stopWps(): Promise<FreeboxApiResponse> {
        // WPS session stop - DELETE current session
        return this.requestWithLock('DELETE', '/wifi/wps/sessions/');
    }

    // WiFi Temporary Disable (v13.0+)
    async getWifiTempDisableStatus(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', '/wifi/temp_disable/');
    }

    async setWifiTempDisable(duration: number): Promise<FreeboxApiResponse> {
        // Duration in seconds (0 to cancel)
        return this.requestWithLock('POST', '/wifi/temp_disable/', { duration });
    }

    async cancelWifiTempDisable(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', '/wifi/temp_disable/');
    }

    // WiFi Custom Key / Guest Network (v14.0+)
    async getWifiCustomKeyConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', '/wifi/custom_key/config/');
    }

    async updateWifiCustomKeyConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', '/wifi/custom_key/config/', data);
    }

    async getWifiCustomKeys(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', '/wifi/custom_key/');
    }

    async createWifiCustomKey(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', '/wifi/custom_key/', data);
    }

    async deleteWifiCustomKey(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `/wifi/custom_key/${id}`);
    }

    // WiFi MLO - Multi Link Operation (v14.0+ - WiFi 7)
    async getWifiMloConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', '/wifi/mlo/config/');
    }

    async updateWifiMloConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', '/wifi/mlo/config/', data);
    }

    // ==================== LAN ====================

    async getLanConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.LAN_CONFIG);
    }

    async updateLanConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.LAN_CONFIG, data);
    }

    async getLanBrowserInterfaces(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.LAN_BROWSER);
    }

    async getLanHosts(interfaceName: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.LAN_BROWSER.replace('interfaces/', '')}${interfaceName}/`);
    }

    async wakeOnLan(interfaceName: string, mac: string, password?: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', `${API_ENDPOINTS.LAN_WOL}${interfaceName}/`, {mac, password});
    }

    // ==================== DHCP ====================

    async getDhcpConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.DHCP_CONFIG);
    }

    async updateDhcpConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.DHCP_CONFIG, data);
    }

    async getDhcpLeases(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.DHCP_DYNAMIC_LEASES);
    }

    async getDhcpStaticLeases(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.DHCP_STATIC_LEASES);
    }

    async getDhcpStaticLease(id: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.DHCP_STATIC_LEASES}${id}`);
    }

    async addDhcpStaticLease(mac: string, ip: string, comment?: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.DHCP_STATIC_LEASES, {mac, ip, comment: comment || ''});
    }

    async updateDhcpStaticLease(id: string, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.DHCP_STATIC_LEASES}${id}`, data);
    }

    async deleteDhcpStaticLease(id: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.DHCP_STATIC_LEASES}${id}`);
    }

    // ==================== DOWNLOADS ====================

    async getDownloads(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.DOWNLOADS);
    }

    async getDownload(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.DOWNLOADS}${id}`);
    }

    async getDownloadTrackers(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.DOWNLOADS}${id}/trackers`);
    }

    async getDownloadPeers(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.DOWNLOADS}${id}/peers`);
    }

    async getDownloadFiles(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.DOWNLOADS}${id}/files`);
    }

    async updateDownloadFile(taskId: number, fileId: string, priority: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.DOWNLOADS}${taskId}/files/${fileId}`, { priority });
    }

    async getDownloadPieces(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.DOWNLOADS}${id}/pieces`);
    }

    async getDownloadBlacklist(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.DOWNLOADS}${id}/blacklist`);
    }

    async emptyDownloadBlacklist(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.DOWNLOADS}${id}/blacklist/empty`);
    }

    async getDownloadLog(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.DOWNLOADS}${id}/log`);
    }

    async updateDownload(id: number, data: { status?: string; io_priority?: string }): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.DOWNLOADS}${id}`, data);
    }

    async deleteDownload(id: number, deleteFiles = false): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.DOWNLOADS}${id}?delete_files=${deleteFiles}`);
    }

    async addDownload(downloadUrl: string, downloadDir?: string): Promise<FreeboxApiResponse> {
        // The Freebox API requires application/x-www-form-urlencoded for downloads/add
        const url = this.buildUrl(API_ENDPOINTS.DOWNLOADS_ADD);
        recordUpstream('freebox', `POST ${API_ENDPOINTS.DOWNLOADS_ADD}`, 'call');
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        if (this.sessionToken) {
            headers['X-Fbx-App-Auth'] = this.sessionToken;
        }

        const params = new URLSearchParams();
        params.append('download_url', downloadUrl);
        if (downloadDir) {
            params.append('download_dir', downloadDir);
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), config.freebox.requestTimeout);

            // Use insecure agent for Freebox self-signed certificates
            const agent = getInsecureAgent();
            const fetchOptions: RequestInit = {
                method: 'POST',
                headers,
                body: params.toString(),
                signal: controller.signal
            };
            // Only add dispatcher if agent is available (undici)
            if (agent && agent.constructor && agent.constructor.name === 'Agent') {
                (fetchOptions as any).dispatcher = agent;
            }
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeout);

            const data = await response.json() as FreeboxApiResponse;
            this.invalidateCache(API_ENDPOINTS.DOWNLOADS);
            return data;
        } catch (error) {
            logger.error('FreeboxAPI', 'addDownload error:', error);
            return { success: false, error_code: 'request_failed', msg: String(error) };
        }
    }

    async addDownloadFromFile(fileBuffer: Buffer, filename: string, downloadDir?: string): Promise<FreeboxApiResponse> {
        // The Freebox API requires multipart/form-data for file uploads
        // We'll build the multipart body manually since form-data + fetch has issues
        const boundary = '----FreeboxFormBoundary' + crypto.randomUUID().replaceAll('-', '');

        let body = '';

        // Add the torrent file
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="download_file"; filename="${filename}"\r\n`;
        body += `Content-Type: application/x-bittorrent\r\n\r\n`;

        // Convert body prefix to buffer, append file, then add suffix
        const bodyPrefix = Buffer.from(body, 'utf-8');

        let bodySuffix = '\r\n';

        // Add optional download directory (must be base64 encoded path)
        if (downloadDir) {
            bodySuffix += `--${boundary}\r\n`;
            bodySuffix += `Content-Disposition: form-data; name="download_dir"\r\n\r\n`;
            bodySuffix += `${downloadDir}\r\n`;
        }

        bodySuffix += `--${boundary}--\r\n`;
        const bodySuffixBuffer = Buffer.from(bodySuffix, 'utf-8');

        // Combine all parts
        const fullBody = Buffer.concat([bodyPrefix, fileBuffer, bodySuffixBuffer]);

        const url = this.buildUrl(API_ENDPOINTS.DOWNLOADS_ADD);
        recordUpstream('freebox', `POST ${API_ENDPOINTS.DOWNLOADS_ADD}`, 'call');
        const headers: Record<string, string> = {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': fullBody.length.toString()
        };

        if (this.sessionToken) {
            headers['X-Fbx-App-Auth'] = this.sessionToken;
        }

        logger.debug('FreeboxAPI', 'addDownloadFromFile URL:', url);
        logger.debug('FreeboxAPI', 'addDownloadFromFile headers:', headers);

        try {
            // Use insecure agent for Freebox self-signed certificates
            const agent = getInsecureAgent();
            const fetchOptions: RequestInit = {
                method: 'POST',
                headers,
                body: fullBody
            };
            // Only add dispatcher if agent is available (undici)
            if (agent && agent.constructor && agent.constructor.name === 'Agent') {
                (fetchOptions as any).dispatcher = agent;
            }
            const response = await fetch(url, fetchOptions);

            const rawText = await response.text();
            logger.debug('FreeboxAPI', 'addDownloadFromFile response status:', response.status);
            logger.debug('FreeboxAPI', 'addDownloadFromFile raw response:', rawText.substring(0, 500));

            // Find the start of the JSON object
            const jsonStart = rawText.indexOf('{');
            if (jsonStart === -1) {
                return { success: false, error_code: 'INVALID_RESPONSE', msg: `No JSON found in response: ${rawText.substring(0, 100)}` };
            }

            const jsonText = rawText.substring(jsonStart);
            const data = JSON.parse(jsonText) as FreeboxApiResponse;
            this.invalidateCache(API_ENDPOINTS.DOWNLOADS);
            return data;
        } catch (error) {
            logger.error('FreeboxAPI', 'addDownloadFromFile error:', error);
            return { success: false, error_code: 'FETCH_ERROR', msg: String(error) };
        }
    }

    async getDownloadStats(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.DOWNLOADS_STATS);
    }

    async getDownloadConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.DOWNLOADS_CONFIG);
    }

    async updateDownloadConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.DOWNLOADS_CONFIG, data);
    }

    // ==================== FILE SYSTEM ====================

    async listFiles(path: string): Promise<FreeboxApiResponse> {
        // For root path, call /fs/ls/ without encoded path
        if (path === '/' || path === '') {
            return this.requestWithLock('GET', API_ENDPOINTS.FS_LIST);
        }
        // Path is already base64 encoded (as returned by the Freebox API)
        // Don't re-encode it, use it directly
        return this.requestWithLock('GET', `${API_ENDPOINTS.FS_LIST}${path}`);
    }

    async getFileInfo(path: string): Promise<FreeboxApiResponse> {
        // Path is already base64 encoded (as returned by the Freebox API)
        return this.requestWithLock('GET', `${API_ENDPOINTS.FS_INFO}${path}`);
    }

    async createDirectory(parent: string, dirname: string): Promise<FreeboxApiResponse> {
        // Parent path should be base64 encoded
        // If parent is '/' (root), we need to encode it
        const encodedParent = (parent === '/' || parent === '')
            ? Buffer.from('/').toString('base64')
            : parent;
        return this.requestWithLock('POST', API_ENDPOINTS.FS_MKDIR, { parent: encodedParent, dirname });
    }

    async renameFile(src: string, dst: string): Promise<FreeboxApiResponse> {
        // Src path is already base64 encoded, dst is the new name in clear text (no path)
        return this.requestWithLock('POST', API_ENDPOINTS.FS_RENAME, {src, dst});
    }

    async removeFiles(files: string[]): Promise<FreeboxApiResponse> {
        // Files paths are already base64 encoded
        return this.requestWithLock('POST', API_ENDPOINTS.FS_REMOVE, {files});
    }

    async copyFiles(files: string[], dst: string, mode: string = 'overwrite'): Promise<FreeboxApiResponse> {
        // Files and dst paths are already base64 encoded
        return this.requestWithLock('POST', API_ENDPOINTS.FS_COPY, {files, dst, mode});
    }

    async moveFiles(files: string[], dst: string, mode: string = 'overwrite'): Promise<FreeboxApiResponse> {
        // Files and dst paths are already base64 encoded
        return this.requestWithLock('POST', API_ENDPOINTS.FS_MOVE, {files, dst, mode});
    }

    // ==================== STORAGE ====================

    async getDisks(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.STORAGE_DISK);
    }

    async getStorageInfo(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.STORAGE_CONFIG);
    }

    // ==================== CALLS ====================

    async getCallLog(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.CALL_LOG);
    }

    async markCallsAsRead(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.CALL_LOG_MARK_READ);
    }

    async deleteAllCalls(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.CALL_LOG_DELETE);
    }

    async deleteCall(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.CALL_LOG}${id}`);
    }

    // ==================== CONTACTS ====================

    async getContacts(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.CONTACTS);
    }

    async getContact(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.CONTACTS}${id}`);
    }

    async createContact(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.CONTACTS, data);
    }

    async updateContact(id: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.CONTACTS}${id}`, data);
    }

    async deleteContact(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.CONTACTS}${id}`);
    }

    // ==================== TV / PVR ====================

    async getTvChannels(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.TV_CHANNELS);
    }

    async getTvBouquets(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.TV_BOUQUETS);
    }

    async getEpgByTime(timestamp: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.TV_EPG_BY_TIME}${timestamp}`);
    }

    async getPvrConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.PVR_CONFIG);
    }

    async updatePvrConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.PVR_CONFIG, data);
    }

    async getPvrProgrammed(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.PVR_PROGRAMMED);
    }

    async createPvrProgrammed(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.PVR_PROGRAMMED, data);
    }

    async deletePvrProgrammed(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.PVR_PROGRAMMED}${id}`);
    }

    async getPvrFinished(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.PVR_FINISHED);
    }

    async deletePvrFinished(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.PVR_FINISHED}${id}`);
    }

    // ==================== PARENTAL / PROFILES ====================

    async getProfiles(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.PROFILE);
    }

    async getProfile(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.PROFILE}${id}`);
    }

    async createProfile(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.PROFILE, data);
    }

    async updateProfile(id: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.PROFILE}${id}`, data);
    }

    async deleteProfile(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.PROFILE}${id}`);
    }

    async getNetworkControl(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.PROFILE_NETWORK_CONTROL);
    }

    async getNetworkControlForProfile(profileId: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.PROFILE_NETWORK_CONTROL}${profileId}`);
    }

    async updateNetworkControlForProfile(profileId: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.PROFILE_NETWORK_CONTROL}${profileId}`, data);
    }

    // Network Control Rules
    async getNetworkControlRules(profileId: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.PROFILE_NETWORK_CONTROL}${profileId}/rules`);
    }

    async getNetworkControlRule(profileId: number, ruleId: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.PROFILE_NETWORK_CONTROL}${profileId}/rules/${ruleId}`);
    }

    async createNetworkControlRule(profileId: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', `${API_ENDPOINTS.PROFILE_NETWORK_CONTROL}${profileId}/rules/`, data);
    }

    async updateNetworkControlRule(profileId: number, ruleId: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.PROFILE_NETWORK_CONTROL}${profileId}/rules/${ruleId}`, data);
    }

    async deleteNetworkControlRule(profileId: number, ruleId: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.PROFILE_NETWORK_CONTROL}${profileId}/rules/${ruleId}`);
    }

    async getParentalConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.PARENTAL_CONFIG);
    }

    async updateParentalConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.PARENTAL_CONFIG, data);
    }

    async getParentalFilters(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.PARENTAL_FILTER);
    }

    async getParentalFilter(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.PARENTAL_FILTER}${id}`);
    }

    async createParentalFilter(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.PARENTAL_FILTER, data);
    }

    async updateParentalFilter(id: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.PARENTAL_FILTER}${id}`, data);
    }

    async deleteParentalFilter(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.PARENTAL_FILTER}${id}`);
    }

    async getParentalFilterPlanning(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.PARENTAL_FILTER}${id}/planning`);
    }

    async updateParentalFilterPlanning(id: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.PARENTAL_FILTER}${id}/planning`, data);
    }

    // ==================== VPN SERVER ====================

    // Get list of all VPN servers (openvpn_routed, openvpn_bridge, pptp)
    async getVpnServers(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', '/vpn/');
    }

    // Get specific VPN server by ID
    async getVpnServer(serverId: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `/vpn/${serverId}`);
    }

    // Get VPN server config by ID
    async getVpnServerConfig(serverId?: string): Promise<FreeboxApiResponse> {
        if (serverId) {
            return this.requestWithLock('GET', `/vpn/${serverId}/config/`);
        }
        // Legacy: return list of servers
        return this.requestWithLock('GET', '/vpn/');
    }

    // Update VPN server config by ID
    async updateVpnServerConfig(serverId: string, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `/vpn/${serverId}/config/`, data);
    }

    // Start VPN server
    async startVpnServer(serverId: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `/vpn/${serverId}`, {state: 'started'});
    }

    // Stop VPN server
    async stopVpnServer(serverId: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `/vpn/${serverId}`, {state: 'stopped'});
    }

    async getVpnUsers(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.VPN_SERVER_USERS);
    }

    async createVpnUser(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.VPN_SERVER_USERS, data);
    }

    async deleteVpnUser(login: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.VPN_SERVER_USERS}${login}`);
    }

    async getVpnConnections(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.VPN_SERVER_CONNECTIONS);
    }

    // ==================== VPN CLIENT ====================

    async getVpnClientConfigs(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.VPN_CLIENT_CONFIGS);
    }

    async getVpnClientStatus(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.VPN_CLIENT_STATUS);
    }

    // ==================== NAT / PORT FORWARDING ====================

    async getPortForwardingRules(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.NAT_PORT_FORWARDING);
    }

    async createPortForwardingRule(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.NAT_PORT_FORWARDING, data);
    }

    async updatePortForwardingRule(id: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.NAT_PORT_FORWARDING}${id}`, data);
    }

    async deletePortForwardingRule(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.NAT_PORT_FORWARDING}${id}`);
    }

    async getDmzConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.NAT_DMZCONFIG);
    }

    async updateDmzConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.NAT_DMZCONFIG, data);
    }

    // ==================== FTP ====================

    async getFtpConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.FTP_CONFIG);
    }

    async updateFtpConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.FTP_CONFIG, data);
    }

    // ==================== SWITCH / PORTS ====================

    async getSwitchStatus(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.SWITCH_STATUS);
    }

    async getSwitchPorts(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.SWITCH_PORT);
    }

    // ==================== LCD ====================

    async getLcdConfig(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.LCD_CONFIG);
    }

    async updateLcdConfig(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', API_ENDPOINTS.LCD_CONFIG, data);
    }

    // ==================== FREEPLUGS ====================

    async getFreeplugs(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.FREEPLUG);
    }

    // ==================== VM ====================

    async getVms(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.VM);
    }

    async getVm(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `${API_ENDPOINTS.VM}${id}`);
    }

    async createVm(data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', API_ENDPOINTS.VM, data);
    }

    async updateVm(id: number, data: unknown): Promise<FreeboxApiResponse> {
        return this.requestWithLock('PUT', `${API_ENDPOINTS.VM}${id}`, data);
    }

    async deleteVm(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `${API_ENDPOINTS.VM}${id}`);
    }

    async startVm(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', `${API_ENDPOINTS.VM}${id}/start`);
    }

    async stopVm(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', `${API_ENDPOINTS.VM}${id}/stop`);
    }

    async restartVm(id: number): Promise<FreeboxApiResponse> {
        return this.requestWithLock('POST', `${API_ENDPOINTS.VM}${id}/restart`);
    }

    async getVmDistros(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.VM_DISTROS);
    }

    async getVmInfo(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.VM_INFO);
    }

    // Disk image size lookup is an asynchronous task: start it, then poll /vm/disk/task/{id}
    async getVmDiskInfo(diskPath: string, diskType?: string): Promise<FreeboxApiResponse> {
        const started = await this.requestWithLock<{ id?: number }>('POST', API_ENDPOINTS.VM_DISK_INFO, { disk_path: diskPath, disk_type: diskType });
        const taskId = started.result?.id;
        if (!started.success || typeof taskId !== 'number') return started;
        for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 300));
            const task = await this.requestWithLock<{ state?: string; result?: unknown }>('GET', `${API_ENDPOINTS.VM_DISK_TASK}${taskId}`);
            if (!task.success) return task;
            if (task.result?.state === 'done') return { success: true, result: task.result.result ?? task.result };
            if (task.result?.state === 'failed') return { success: false, error_code: 'task_failed' };
        }
        return { success: false, error_code: 'task_timeout' };
    }

    // ==================== NOTIFICATIONS ====================

    async getNotifications(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', API_ENDPOINTS.NOTIFICATIONS);
    }

    // ==================== FILE SHARING ====================

    async getShareLinks(): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', '/share_link/');
    }

    async getShareLink(token: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('GET', `/share_link/${token}`);
    }

    async createShareLink(path: string, expire?: number): Promise<FreeboxApiResponse> {
        const body: { path: string; expire?: number; fullurl: string } = {
            path,
            fullurl: ''
        };
        if (expire) {
            body.expire = expire;
        }
        return this.requestWithLock('POST', '/share_link/', body);
    }

    async deleteShareLink(token: string): Promise<FreeboxApiResponse> {
        return this.requestWithLock('DELETE', `/share_link/${token}`);
    }
}

// Singleton instance
export const freeboxApi = new FreeboxApiService();