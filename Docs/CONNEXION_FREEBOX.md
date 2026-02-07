# Freebox Connection Logic and Session Management

This document explains how the Freebox connection system works, why some stats appear without authentication, and why behaviour differs between development (npm) and production (Docker).

**📖 [Lire en français](CONNEXION_FREEBOX.fr.md)**

---

## 🔐 Freebox Session System

### Architecture

The Freebox session system works in two steps:

1. **Application registration** (`app_token`)
   - Done once, via `/api/auth/register`
   - Stored in `data/freebox_token.json`
   - Persists across restarts

2. **Session opening** (`session_token`)
   - On each connection, via `/api/auth/login`
   - Stored in memory only
   - Expires after inactivity (about 5–10 minutes depending on the Freebox)

### Connection flow

```
1. Plugin.start() called
   ↓
2. Check if app_token exists (isRegistered())
   ↓
3. Check if session is valid (checkSession())
   ↓
4. If session invalid → login() to get new session_token
   ↓
5. Start keep-alive (every 2 minutes)
```

---

## 🔄 Keep-Alive (Session Maintenance)

### How it works

The keep-alive mechanism was added to keep the session active automatically:

- **Interval**: Check every 2 minutes
- **Action**:
  - If session valid → light request (`getSystemInfo()`) to keep the session
  - If session expired → automatic reconnection (`login()`)

### Code

```typescript
// server/plugins/freebox/FreeboxPlugin.ts
private startKeepAlive(): void {
    this.keepAliveInterval = setInterval(async () => {
        const isLoggedIn = await this.apiService.checkSession();
        if (!isLoggedIn) {
            await this.apiService.login(); // Automatic reconnection
        } else {
            await this.apiService.getSystemInfo(); // Session keep-alive
        }
    }, 2 * 60 * 1000); // 2 minutes
}
```

---

## 📊 Stats Retrieval

### `getStats()` method

The `getStats()` method in `FreeboxPlugin`:

1. **Checks the session** before each retrieval
2. **Reconnects automatically** if the session has expired
3. **Uses `Promise.allSettled`** to fetch all stats in parallel

```typescript
// Check if logged in, try to reconnect if needed
const isLoggedIn = await this.apiService.checkSession();
if (!isLoggedIn) {
    try {
        await this.apiService.login(); // Automatic reconnection
    } catch (error) {
        throw new Error(`Freebox plugin not connected: ${error.message}`);
    }
}

// Fetch data from Freebox API in parallel
const [
    devicesResult,
    connectionResult,
    systemResult,
    dhcpConfigResult,
    dhcpLeasesResult,
    dhcpStaticLeasesResult,
    portForwardResult
] = await Promise.allSettled([...]);
```

### Why do some stats show without a session?

**Answer**: They do **not** actually show without a session. What happens:

1. **When you click "Auth"**:
   - The button calls `/api/auth/login`, which reconnects the session
   - The plugin starts keep-alive
   - Stats are then fetched successfully

2. **When the session expires**:
   - Keep-alive should renew it automatically
   - If the plugin is not started, keep-alive does not run
   - Stats may still appear if they are cached on the frontend

3. **DHCP and port-forwarding stats**:
   - These stats **all** require an active session
   - If they appear without a session, it is likely:
     - Cached data on the frontend, or
     - A session that just expired but data is still in memory

---

## 🐛 Dev vs Production Difference

### Development mode (npm run dev)

**Issue**: The plugin may not start automatically when the server starts.

**Why**:
- The plugin is only started if `enabled: true` in the database
- In dev, the database may be empty or the plugin disabled
- Keep-alive only starts when `plugin.start()` is called
- **If the plugin is not enabled in the DB, keep-alive never starts automatically**

**Current behaviour**:
- ✅ Clicking "Auth" reconnects the session and starts keep-alive
- ❌ If the plugin is not enabled in the DB, keep-alive stops when the server restarts
- ❌ The session expires after ~5–10 minutes without keep-alive

**Is this normal?** Yes, it is expected when the plugin is not enabled in the database.

**Solution**:
1. **Enable the plugin** on the Plugins page (Settings → Plugins)
2. Restart the dev server
3. The plugin will start automatically with keep-alive

### Production mode (Docker)

**Why it works better**:
- The database is persistent (Docker volume)
- The plugin is usually enabled (`enabled: true`)
- On container start, `initializeAllPlugins()` starts all enabled plugins
- Keep-alive runs from startup

---

## 🔍 Diagnostics

### Check if the plugin is started

```bash
# Check backend logs
# You should see:
[FreeboxPlugin] Starting session keep-alive (checking every 2 minutes)
```

### Check if the session is active

```bash
# In the logs, look for:
[FreeboxPlugin] Session expired, renewing...
[FreeboxPlugin] Session renewed successfully
```

### Check plugin state

```bash
# API call
GET /api/plugins/freebox
# Check: enabled, connectionStatus
```

---

## 🛠️ Solutions

### Solution 1: Ensure the plugin is enabled in dev

1. Go to the Plugins page
2. Enable the Freebox plugin
3. Restart the dev server
4. The plugin should start automatically with keep-alive

### Solution 2: Improve keep-alive so it starts even when the plugin is not started

**Option A**: Start keep-alive in `getStats()` when the session is valid

**Option B**: Start keep-alive as soon as a first connection succeeds

### Solution 3: Automatic reconnection in `getStats()`

Currently `getStats()` already reconnects automatically, but keep-alive does not start if the plugin is not started.

---

## 📝 Recommendations

1. **In development**: Always enable the plugin on the Plugins page so keep-alive works
2. **In production**: The plugin should be enabled by default in the database
3. **Future improvement**: Start keep-alive automatically as soon as a session is established, even if the plugin is not formally "started"

---

## 🔗 References

- `server/plugins/freebox/FreeboxPlugin.ts`: Main plugin logic
- `server/plugins/freebox/FreeboxApiService.ts`: Freebox API service
- `server/services/pluginManager.ts`: Plugin manager
- `server/routes/auth.ts`: Freebox auth routes
