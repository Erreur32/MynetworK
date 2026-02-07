# MynetworK - Multi-Source Network Dashboard

<div align="center">

<img src="src/icons/logo_mynetwork.svg" alt="MynetworK" width="96" height="96" />

![MynetworK](https://img.shields.io/badge/MynetworK---help-111827?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-DEVELOPMENT-374151?style=for-the-badge)
![Docker](https://img.shields.io/badge/Docker-Ready-1f2937?style=for-the-badge&logo=docker&logoColor=38bdf8)
[![Docker Image](https://img.shields.io/badge/GHCR-ghcr.io%2Ferreur32%2Fmynetwork-1f2937?style=for-the-badge&logo=docker&logoColor=38bdf8)](https://github.com/erreur32/mynetwork/pkgs/container/mynetwork)
[![Build](https://img.shields.io/github/actions/workflow/status/Erreur32/MynetworK/docker-publish.yml?style=for-the-badge&logo=github&logoColor=white&label=Build&color=111827)](https://github.com/Erreur32/MynetworK/actions/workflows/docker-publish.yml)
![React](https://img.shields.io/badge/React-19-111827?style=for-the-badge&logo=react&logoColor=38bdf8)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-111827?style=for-the-badge&logo=typescript&logoColor=60a5fa)
![License](https://img.shields.io/badge/License-MIT-111827?style=for-the-badge&color=111827&labelColor=111827&logoColor=white)

[![GHCR](https://img.shields.io/badge/GHCR-mynetwork-0ea5e9?style=for-the-badge&logo=docker&logoColor=white)](https://github.com/Erreur32/MynetworK/pkgs/container/mynetwork)

<h1 align="center">MynetworK</h1>
<p align="center">
  Unified Freebox + UniFi management + Network Scanner.
</p>

**📖 [Read in French (Lire en français)](README.fr.md)**



<p align="center">
  <sub>Powered by</sub><br/>
  <img src="img-capture/free-sas.png" alt="Freebox" height="32" />
  &nbsp;&nbsp;
  <img src="img-capture/ubiquiti-networks.svg" alt="Ubiquiti Unifi" height="32" />
</p>

**A multi-source network dashboard to manage Freebox, UniFi  and  Network Scanner**

[Installation](#installation) | [Features](#-main-features) | [Configuration](#configuration) | [Documentation](#-documentation)

</div>

---


## Overview

**MynetworK** is a unified dashboard to manage and monitor multiple local network data sources:

- **Freebox** - Full management of your Freebox (Ultra, Delta, Pop)
- **UniFi Controller** - Monitor and manage your UniFi infrastructure
- **Network Scan** - Device discovery and analysis with automatic vendor detection

<details>
<summary>Click to view screenshot</summary>

![Capture MyNetwork Scan](https://github.com/Erreur32/MynetworK/blob/main/img-capture/mynetwork_scan.png?raw=true)

</details>


### ✨ Main features

- 🔐 **User authentication** - JWT system with role management (admin, user, viewer)
- 🔌 **Plugin system** - Modular architecture to easily add new data sources
- 📊 **Unified dashboard** - Centralized view of all plugin data
- 📝 **Full logging** - Traceability of all actions with advanced filters
- 👥 **User management** - Administration interface to manage access
- 🐳 **Docker ready** - Simplified deployment with Docker Compose
- 🌐 **Internationalization (i18n)** - English (default) and French; language switcher in header. See [Docs/INTERNATIONALIZATION.md](Docs/INTERNATIONALIZATION.md).

## Installation

### Prerequisites

- Docker and Docker Compose
- Local network access to Freebox/UniFi

### docker-compose.yml

```yaml
services:
  mynetwork:
    image: ghcr.io/erreur32/mynetwork:latest
    restart: unless-stopped

    ports:
      # Dashboard external port (default: 7505)
      - "${DASHBOARD_PORT:-7505}:3000"

    environment:
      # Required secret (no fallback in production)
      JWT_SECRET: ${JWT_SECRET}

      # Configuration
      CONFIG_FILE_PATH: ${CONFIG_FILE_PATH:-/app/config/mynetwork.conf}
      FREEBOX_HOST: ${FREEBOX_HOST:-mafreebox.freebox.fr}
      FREEBOX_TOKEN_FILE: /app/data/freebox_token.json

      # Host metrics access
      HOST_ROOT_PATH: ${HOST_ROOT_PATH:-/host}

      # PUBLIC_URL (optional, only with reverse proxy)
      # PUBLIC_URL: https://dashboard.example.com

    volumes:
      # Persistent data (Freebox token, local DB, etc.)
      - ./data:/app/data

      # System metrics access (read-only)
      - /:/host:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro

      # Docker access (read-only)
      - /var/run/docker.sock:/var/run/docker.sock:ro

    # Network capabilities required for scan (ping / ARP)
    cap_add:
      - NET_RAW
      - NET_ADMIN

    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

```

**Launch:**

```bash
# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Update image
docker-compose pull
docker-compose up -d
```

**Recommendation:** Use the **[.env file](#secure-jwt_secret-configuration)** (`.env` at project root); Docker Compose reads it automatically and injects `JWT_SECRET` into the container.

> For more details, see the [Secure JWT_SECRET configuration](#secure-jwt_secret-configuration) section for all configuration methods, security best practices and verification.

The dashboard will be available at:
- **http://localhost:7505** - from the host machine
- **http://SERVER_IP:7505** - from another device on the network

<details>
<summary><strong>Advanced configuration</strong></summary>

### Optional: External configuration file (`.conf`)

You can use an external `.conf` file for configuration:

1. **Create the config file:**
   ```bash
   cp config/mynetwork.conf.example config/mynetwork.conf
   # Edit config/mynetwork.conf to your needs
   ```

2. **Mount the file in Docker:**  
   Uncomment the line in `docker-compose.yml`:
   ```yaml
   volumes:
     - mynetwork_data:/app/data
     - ./config/mynetwork.conf:/app/config/mynetwork.conf:ro
   ```

3. **Automatic sync:**
   - On startup, if the `.conf` file exists → import into the database
   - If the file does not exist → export current configuration

4. **API endpoints:**
   - `GET /api/config/export` - Export current configuration
   - `POST /api/config/import` - Import from file
   - `GET /api/config/file` - Check file status
   - `POST /api/config/sync` - Manual sync

#### Nginx (reverse proxy)

If you use **nginx** as a reverse proxy in front of MynetworK, set `PUBLIC_URL` to the public URL (via nginx), not the Docker container URL.

**Case 1: Without nginx (direct access)**  
No `PUBLIC_URL` needed. The app works on the mapped port (e.g. `http://YOUR_IP:7505`).

**Case 2: With nginx (reverse proxy)**

1. **Nginx config:** See `Docs/nginx.example.conf` for a full example.
2. **docker-compose.yml:**
   ```yaml
   environment:
     - PUBLIC_URL=http://mynetwork.example.com
     # Or with HTTPS:
     # - PUBLIC_URL=https://mynetwork.example.com
   ```
3. **Minimal nginx example:**
   ```nginx
   server {
       listen 80;
       server_name mynetwork.example.com;
       location / {
           proxy_pass http://192.168.1.150:7505;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
4. **Benefits of nginx:** SSL/HTTPS (e.g. Let's Encrypt), multiple services on one server, caching, clean URLs.

See `Docs/nginx.example.conf` for a complete HTTP/HTTPS setup.

</details>

<details id="secure-jwt_secret-configuration">
<summary><strong>Secure JWT_SECRET configuration</strong></summary>

**Critical – Security:** The default JWT secret (`change-me-in-production-please-use-strong-secret`) is for **development only**. In production you **must** set the `JWT_SECRET` environment variable to a unique, strong value.

#### Why it matters

`JWT_SECRET` is used to sign and verify JWT authentication tokens. A weak or default secret allows an attacker to:
- Forge valid JWTs and impersonate any user
- Access the system without authentication (full admin access)
- Compromise all users and their data
- Change permissions and access restricted features

#### Where it is used

`JWT_SECRET` is loaded at server startup in `server/services/authService.ts` from `process.env.JWT_SECRET`. If unset, the default value is used and a warning is logged. The secret is used to sign tokens on login and verify them on authenticated requests.

#### Configuration methods (recommended order)

##### 1. **`.env` file (recommended for production)**

Docker Compose automatically reads `.env` at project root.

1. **Generate a strong secret** (at least 32 characters):
   ```bash
   # Linux/macOS:
   openssl rand -base64 32
   
   # Windows PowerShell:
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   ```

2. **Create a `.env` file** at project root:
   ```bash
   # .env
   JWT_SECRET=your_generated_secret_here_minimum_32_chars
   
   DASHBOARD_PORT=7505
   FREEBOX_HOST=mafreebox.freebox.fr
   PUBLIC_URL=https://mynetwork.example.com
   ```

3. **Restrict permissions:**
   ```bash
   chmod 600 .env
   ```

4. **Start with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

##### 2. **`.env` with `--env-file`**

```bash
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env.production
docker-compose --env-file .env.production up -d
```

#### Verification

After startup, check that a custom secret is in use:

```bash
docker-compose logs | grep -i "jwt\|secret"
```

If you see a warning like: *"Using default JWT secret. Please set JWT_SECRET..."*, then `JWT_SECRET` was not set correctly.

**In the web UI:** Administration → Security → JWT configuration section shows whether the default secret is used.

#### Security best practices

1. **Length:** At least **32 characters** (64 recommended)
2. **Random:** Use random data, not predictable passwords
3. **Unique:** Each production instance should have its own secret
4. **Storage:** Restrict `.env` permissions (`chmod 600`), add `.env` to `.gitignore`, use a secrets manager for critical deployments
5. **Rotation:** Change the secret periodically (e.g. every 6–12 months) or if compromise is suspected
6. **Dev vs prod:** Use different secrets for development and production

#### JWT secret rotation

1. Generate a new secret: `openssl rand -base64 32`
2. Update `.env`: `JWT_SECRET=new_secret`
3. Restart: `docker-compose restart`
4. All users will need to log in again (existing tokens are invalidated).

#### Example `.env`

```bash
# .env – Production

JWT_SECRET=your_openssl_generated_secret_here

DASHBOARD_PORT=7505
FREEBOX_HOST=mafreebox.freebox.fr
PUBLIC_URL=https://mynetwork.example.com
```

</details>


## First login

1. Open the dashboard (http://localhost:7505 or your server IP).
2. Log in with default credentials:
   - **Username:** `admin`
   - **Password:** `admin123`
3. **Change the password immediately after first login.**
4. Configure your plugins in the **Plugins** page.

<details>
<summary><strong>Features</strong></summary>

### Main dashboard
- **Multi-source statistics** - Unified view of all plugin data
- **Real-time charts** - Throughput, connections, stats
- **Network overview** - Global state of your infrastructure

### Plugin management
- **Centralized configuration** - UI to configure each plugin
- **Enable/disable** - Fine-grained control of each data source
- **Connection status** - Check each plugin’s state

### Freebox (plugin)
- **Full dashboard** - All Freebox features (WiFi, LAN, Downloads, VMs, TV, Phone)
- **Compatibility** - Ultra, Delta, Pop
- **Native API** - Official Freebox OS API

### UniFi Controller (plugin)
- **Network monitoring** - AP stats, clients, traffic
- **Multi-site** - Multiple UniFi sites
- **Real-time data** - Automatic stats updates
- **Dual API** - Local Controller (node-unifi) and Site Manager API (cloud)
- **Stats badges** - System stats in header (throughput, uptime, devices)

### Network Scan (plugin)
- **Auto discovery** - Full local network scan (IPs, MAC, hostnames)
- **Vendor detection** - Automatic manufacturer identification (Wireshark DB, Freebox/UniFi, or external API)
- **Scheduled scans** - Periodic full scan and refresh
- **History** - Device evolution over time with charts
- **Wireshark vendor DB** - Full integration with Wireshark `manuf` and auto-update
- **Priority system** - Hostname/vendor detection order (Freebox, UniFi, Scanner)
- **Modern UI** - Interactive table with sort, filters, search and inline hostname editing

### User management (admin)
- **Full CRUD** - Create, edit, delete users
- **Roles** - Permissions (admin, user, viewer)
- **Security** - Passwords hashed with bcrypt

### Activity logs (admin)
- **Full traceability** - All actions logged
- **Advanced filters** - By user, plugin, action, level, period
- **Export** - Log export (planned)

</details>

<details>
<summary><strong>Architecture</strong></summary>

MynetworK uses a modular architecture:
- **React frontend** (TypeScript) - Modern UI
- **Express backend** (TypeScript) - REST API and WebSocket
- **SQLite database** - Configuration and data storage
- **Plugin system** - Extensible architecture for new data sources

See [DEV/ARCHITECTURE_PLUGINS.md](DEV/ARCHITECTURE_PLUGINS.md) for details.

</details>

<details>
<summary><strong>Documentation</strong></summary>

### For users
- **[CHANGELOG.md](CHANGELOG.md)** - Change log and new features

### For developers
See **[DEV/README-DEV.md](DEV/README-DEV.md)** for development documentation.

**Main docs:**
- **[DEV/DOCUMENTATION.md](DEV/DOCUMENTATION.md)** - Documentation index
- **[DEV/GUIDE_DEVELOPPEMENT.md](DEV/GUIDE_DEVELOPPEMENT.md)** - Developer guide
- **[DEV/ARCHITECTURE_PLUGINS.md](DEV/ARCHITECTURE_PLUGINS.md)** - Plugin architecture

**Docs folder ([Docs/](Docs/)):** Setup and production guides (UniFi, Freebox, env vars, Nginx, troubleshooting, reset). Key docs have **English** and **French** versions (see [Docs/README.md](Docs/README.md)).

</details>

## Security

- **JWT authentication** - Secure tokens with expiration
- **Password hashing** - bcrypt with salt rounds
- **Auth middleware** - Protection of sensitive routes
- **Action logging** - Full traceability
- **Role-based access** - Granular permissions

## Contributing

Contributions are welcome.

### Guidelines

- Follow existing code style (4 spaces, camelCase, comments in English)
- Add TypeScript types for new code
- Test changes before submitting
- Document new features
- Follow project rule files

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgments

### Original project

This project is heavily inspired by **Freebox OS Ultra Dashboard** by [HGHugo](https://github.com/HGHugo/FreeboxOS-Ultra-Dashboard). Many thanks to the original author for the work that served as a base for MynetworK.

**Original project:** [FreeboxOS-Ultra-Dashboard](https://github.com/HGHugo/FreeboxOS-Ultra-Dashboard)

### Others

- [Free](https://www.free.fr) for the Freebox and its open API
- [Freebox SDK](https://dev.freebox.fr) for API documentation
- [Ubiquiti](https://www.ui.com) for UniFi
- The open-source community for the libraries used

---

<div align="center">

**Made with ❤️ for multi-source network management**

**MynetworK - Multi-Source Network Dashboard**

</div>
