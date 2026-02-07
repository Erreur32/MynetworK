# Production Docker Troubleshooting

This document covers common production Docker issues and how to fix them.

**📖 [Lire en français](TROUBLESHOOTING_PROD.fr.md)**

---

## 🔴 Issue 1: WebSocket "Invalid frame header"

### Symptom
```
WebSocket connection to 'wss://domain.com/ws/connection' failed: Invalid frame header
[WS Client] Disconnected: 1006
```

### Cause
Nginx is not configured to handle WebSocket upgrade.

### Solution
See the full guide: [Docs/NGINX_WEBSOCKET_CONFIG.md](NGINX_WEBSOCKET_CONFIG.md)

**Minimal nginx config:**
```nginx
location /ws/ {
    proxy_pass http://localhost:7505;
    proxy_http_version 1.1;
    
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

**After changing config:**
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔴 Issue 2: UniFi not working in production

### Diagnostics

**1. Check server logs:**
```bash
docker logs MynetworK | grep -i unifi
```

**2. Check network connectivity from the container:**
```bash
docker exec MynetworK wget -O- https://your-unifi-controller:8443
# or
docker exec MynetworK curl -k https://your-unifi-controller:8443
```

**3. Check UniFi configuration:**
- Controller URL (must be reachable from the container)
- Credentials (username/password)
- Site name

### Possible causes

#### 1. Docker network issue
The container cannot reach the UniFi controller.

**Solution:** Verify the UniFi controller is reachable from the host:
```bash
# From the host
curl -k https://your-unifi-controller:8443
```

If it works from the host but not from the container, it is a Docker network issue.

#### 2. SSL/TLS issue
SSL errors in the logs.

**Solution:** Try `http://` instead of `https://` if the controller allows it.

#### 3. Different config in dev vs prod
Configuration is in `./data/dashboard.db`, which may be mounted differently.

**Check:**
```bash
# Ensure UniFi config is in prod DB
docker exec MynetworK ls -la /app/data/
```

#### 4. UniFi controller behind a firewall
The controller blocks connections from the Docker container.

**Solution:** Allow the Docker host IP in the controller firewall.

### Diagnostic commands

```bash
# 1. UniFi logs
docker logs MynetworK 2>&1 | grep -i unifi

# 2. Test connectivity from container
docker exec MynetworK wget --no-check-certificate -O- https://your-controller:8443

# 3. Check config in DB
docker exec MynetworK cat /app/data/dashboard.db | strings | grep -i unifi

# 4. Check environment variables
docker exec MynetworK env | grep -i unifi
```

---

## 🔍 Dev vs prod differences

| Aspect | Docker dev | Docker prod |
|--------|------------|-------------|
| **Network** | Direct host network access | Docker bridge (may be isolated) |
| **Volumes** | `./data` (local mount) | `./data` (local mount) |
| **Source code** | Mounted (hot reload) | Copied into image |
| **Node modules** | Preserved in container | Installed in image |

### Impact on UniFi

In **Docker prod**, the container may be on an isolated Docker network and cannot reach the local UniFi controller.

**Solution:** Use `network_mode: host` in `docker-compose.yml` (if the controller is on the same network):

```yaml
services:
  mynetwork:
    # ...
    network_mode: host  # Direct host network access
```

**⚠️ Note:** With `network_mode: host`, port mapping is ignored. The app will listen directly on port 3000 on the host.

---

## ✅ Verification checklist

- [ ] Nginx configured for WebSocket (see [NGINX_WEBSOCKET_CONFIG.md](NGINX_WEBSOCKET_CONFIG.md))
- [ ] UniFi logs checked: `docker logs MynetworK | grep -i unifi`
- [ ] UniFi controller reachable from host
- [ ] UniFi controller reachable from container: `docker exec MynetworK wget ...`
- [ ] UniFi configuration correct in admin UI
- [ ] UniFi connection test run from the UI
