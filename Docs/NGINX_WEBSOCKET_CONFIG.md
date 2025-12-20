# Configuration Nginx pour WebSocket

## Problème

En production avec nginx comme reverse proxy, les WebSockets peuvent échouer avec l'erreur :
```
WebSocket connection to 'wss://domain.com/ws/connection' failed: Invalid frame header
```

## Solution

Nginx doit être configuré pour gérer l'upgrade WebSocket. Ajoutez cette configuration dans votre bloc `location` :

```nginx
location / {
    proxy_pass http://localhost:7505;
    proxy_http_version 1.1;
    
    # Headers pour WebSocket
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeouts pour WebSocket (important)
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}

# Configuration spécifique pour les WebSockets
location /ws/ {
    proxy_pass http://localhost:7505;
    proxy_http_version 1.1;
    
    # Upgrade WebSocket
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # Headers standards
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeouts longs pour WebSocket
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_connect_timeout 60s;
}
```

## Configuration complète exemple

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name mwk.myoueb.fr;

    # Redirection HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mwk.myoueb.fr;

    # Certificats SSL
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Configuration WebSocket
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

    # WebSocket spécifique
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

## Vérification

1. Rechargez nginx : `sudo nginx -t && sudo systemctl reload nginx`
2. Vérifiez les logs nginx : `sudo tail -f /var/log/nginx/error.log`
3. Testez la connexion WebSocket depuis le navigateur

## Notes importantes

- Les headers `Upgrade` et `Connection` sont **essentiels** pour WebSocket
- Les timeouts longs (86400s = 24h) permettent aux WebSockets de rester ouverts
- Le port `7505` correspond à `DASHBOARD_PORT` dans votre `docker-compose.yml`

