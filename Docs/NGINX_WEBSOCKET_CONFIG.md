# Nginx Configuration for WebSocket

**📖 [Lire en français](NGINX_WEBSOCKET_CONFIG.fr.md)**

---

## Problem

When using nginx as a reverse proxy in production, WebSockets may fail with:
```
WebSocket connection to 'wss://domain.com/ws/connection' failed: Invalid frame header
```

## Solution

Nginx must be configured to handle WebSocket upgrade. Add this configuration inside your `location` block:

```nginx
location / {
    proxy_pass http://localhost:7505;
    proxy_http_version 1.1;
    
    # WebSocket headers
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # WebSocket timeouts (important)
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}

# Dedicated WebSocket location
location /ws/ {
    proxy_pass http://localhost:7505;
    proxy_http_version 1.1;
    
    # Upgrade WebSocket
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # Standard headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Long timeouts for WebSocket
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_connect_timeout 60s;
}
```

## Complete example configuration

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name mwk.myoueb.fr;

    # HTTPS redirect
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mwk.myoueb.fr;

    # SSL certificates
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # WebSocket configuration
    location / {
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

    # WebSocket-specific
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
        proxy_connect_timeout 60s;
    }
}
```

## Verification

1. Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`
2. Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Test the WebSocket connection from the browser

## Important notes

- The `Upgrade` and `Connection` headers are **required** for WebSocket
- Long timeouts (86400s = 24h) keep WebSocket connections open
- Port `7505` is your `DASHBOARD_PORT` in `docker-compose.yml`

