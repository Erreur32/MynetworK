# Full Docker Production Reset

Procedure to start from a clean state in Docker production.

**📖 [Lire en français](RESET_DOCKER_PROD.fr.md)**

---

## 🔄 Procedure to start from scratch

### 1. Stop and remove the container

```bash
docker compose down
```

### 2. Remove the volume (erases all data)

⚠️ **WARNING**: This command removes **ALL** data:
- SQLite database (`dashboard.db`)
- Freebox token (`freebox_token.json`)
- All saved configuration

```bash
docker compose down -v
```

Or to remove only the specific volume:

```bash
docker volume rm mynetwork_data
```

### 3. Pull the latest image from the registry

```bash
docker compose pull
```

### 4. Check configuration

Ensure you have an `.env` file (optional but recommended):

```bash
# Create .env with your variables
cat > .env << EOF
DASHBOARD_PORT=7505
FREEBOX_HOST=mafreebox.freebox.fr
JWT_SECRET=$(openssl rand -base64 32)
EOF
```

**Important:** Generate a new, secure `JWT_SECRET` for production!

### 5. Start Docker again

```bash
docker compose up -d
```

### 6. Check logs

```bash
docker logs -f MynetworK
```

---

## 📋 Full command set (copy-paste)

```bash
# 1. Stop and remove everything
docker compose down -v

# 2. Pull latest image
docker compose pull

# 3. (Optional) Create/edit .env
nano .env  # or your preferred editor

# 4. Start
docker compose up -d

# 5. View logs
docker logs -f MynetworK
```

---

## 🔍 Post-restart checks

### Verify the container is running

```bash
docker ps | grep MynetworK
```

### Verify volumes

```bash
docker volume ls | grep mynetwork
```

### Verify dashboard access

```bash
curl http://localhost:7505/api/health
```

---

## ⚠️ Important notes

1. **JWT_SECRET**: After a reset, all users must log in again (previous JWT tokens will be invalid).

2. **Freebox token**: You will need to reconfigure Freebox authentication (create a new app_token).

3. **Database**: All data (users, plugins, configuration) will be lost.

4. **Backup**: To save data before wiping:
   ```bash
   # Backup the volume
   docker run --rm -v mynetwork_data:/data -v $(pwd):/backup alpine tar czf /backup/mynetwork_backup_$(date +%Y%m%d_%H%M%S).tar.gz /data
   ```
