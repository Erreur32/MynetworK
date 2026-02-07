# Environment Variables - Complete Guide

This document explains where environment variables come from depending on the run mode.

**📖 [Lire en français](VARIABLES_ENVIRONNEMENT.fr.md)**

---

## 🔍 Where do `${DASHBOARD_PORT:-3000}` come from in Docker Compose?

### Priority order (Docker Compose)

Docker Compose reads environment variables in this order (highest to lowest priority):

1. **Shell environment variables** (exported before the command)
   ```bash
   export DASHBOARD_PORT=4000
   docker-compose -f docker-compose.dev.yml up
   ```

2. **`.env` file** (at project root, next to `docker-compose.yml`)
   ```bash
   # .env file
   DASHBOARD_PORT=4000
   SERVER_PORT=3004
   ```
   Docker Compose reads this file automatically if it exists.

3. **`--env-file` flag** (custom file)
   ```bash
   docker-compose -f docker-compose.dev.yml --env-file .env.local up
   ```

4. **Default values** in `docker-compose.yml` (syntax `${VAR:-default}`)
   ```yaml
   ports:
     - "${DASHBOARD_PORT:-3000}:${DASHBOARD_PORT:-3000}"
   ```
   If `DASHBOARD_PORT` is not set, `3000` is used.

---

## 📋 Run modes

### Mode 1: `npm run dev` (local development, no Docker)

**Command**:
```bash
npm run dev
```

**What happens**:
- Runs `concurrently "npm run dev:server" "npm run dev:client"`
- **Backend**: `npm run dev:server` → `tsx watch server/index.ts`
- **Frontend**: `npm run dev:client` → `vite`

**Environment variables**:
- ✅ Reads `.env` automatically (via `dotenv/config` in `server/index.ts`)
- ✅ Shell variables (e.g. `export PORT=3003`)
- ✅ Defaults in code

**Configuration used**:
- ❌ Does **not** use `docker-compose.dev.yml`
- ✅ Uses config files directly:
  - `vite.config.ts` for the frontend
  - `server/config.ts` for the backend
  - System environment variables

**Default ports**:
- Frontend (Vite): `5173` (in `vite.config.ts`)
- Backend: `3003` (in `server/config.ts`)

**Example configuration**:
```bash
# .env (at project root)
PORT=3003
SERVER_PORT=3003
VITE_PORT=5173
JWT_SECRET=dev_secret
```

---

### Mode 2: `docker-compose -f docker-compose.dev.yml` (development with Docker)

**Command**:
```bash
docker-compose -f docker-compose.dev.yml up --build
```

**What happens**:
- Starts a Docker container with hot reload
- Mounts source code into the container
- Runs `npm run dev` **inside the container**

**Environment variables**:
- ✅ Variables defined in `docker-compose.dev.yml` (`environment:` section)
- ✅ Shell variables (exported before the command)
- ✅ `.env` file (if present at root)
- ✅ `--env-file` (if used)

**Configuration used**:
- ✅ Uses `docker-compose.dev.yml`
- ✅ Variables are passed to the container via `environment:`
- ✅ Code in the container can also read `.env` if it is mounted

**Default ports**:
- Frontend (Vite): `3000` (mapped from container)
- Backend: `3003` (mapped from container)

**Example configuration**:
```bash
# .env (optional, for overrides)
DASHBOARD_PORT=3000
SERVER_PORT=3003
JWT_SECRET=dev_secret
```

---

## 🔄 Mode comparison

| Aspect | `npm run dev` | `docker-compose -f docker-compose.dev.yml` |
|--------|---------------|--------------------------------------------|
| **Environment** | Host (Node.js directly) | Docker container |
| **Configuration** | `vite.config.ts` + `server/config.ts` | `docker-compose.dev.yml` + configs |
| **Variables** | `.env` + shell + defaults | `.env` + shell + `docker-compose.dev.yml` |
| **Frontend port** | `5173` (Vite default) | `3000` (in docker-compose) |
| **Backend port** | `3003` (config.ts default) | `3003` (in docker-compose) |
| **Hot reload** | ✅ Yes | ✅ Yes (via volume mount) |
| **Isolation** | ❌ No (uses local node_modules) | ✅ Yes (isolated container) |

---

## 📝 Configuration files

### 1. `.env` (optional, at root)

This file is read by:
- ✅ Docker Compose (automatically)
- ✅ `npm run dev` (via `dotenv/config` in `server/index.ts`)
- ✅ Vite (if configured; not by default)

**Example**:
```bash
# .env
PORT=3003
SERVER_PORT=3003
VITE_PORT=5173
DASHBOARD_PORT=3000
JWT_SECRET=dev_secret_change_me
FREEBOX_HOST=mafreebox.freebox.fr
```

### 2. `docker-compose.dev.yml`

Defines variables for the Docker container:
```yaml
environment:
  - PORT=${SERVER_PORT:-3003}
  - SERVER_PORT=${SERVER_PORT:-3003}
  - VITE_PORT=${DASHBOARD_PORT:-3000}
```

### 3. `vite.config.ts`

Vite (frontend) configuration:
```typescript
port: parseInt(process.env.VITE_PORT || '5173', 10),
proxy: {
  '/api': {
    target: `http://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
  }
}
```

### 4. `server/config.ts`

Backend configuration:
```typescript
port: parseInt(
  process.env.PORT || 
  process.env.SERVER_PORT || 
  (process.env.NODE_ENV === 'production' ? '3000' : '3003'), 
  10
),
```

---

## 🎯 FAQ

### Q1: Where do `${DASHBOARD_PORT:-3000}` come from?

**Answer**: Docker Compose looks up the variable in this order:
1. Shell: `export DASHBOARD_PORT=4000`
2. Root `.env`: `DASHBOARD_PORT=4000`
3. `--env-file`: `docker-compose --env-file .env.local`
4. Default: `3000` in `${DASHBOARD_PORT:-3000}`

The `.env` file is **optional**; if it exists, Docker Compose reads it automatically.

### Q2: Does `npm run dev` use `docker-compose.dev.yml`?

**Answer**: **No** ❌

- `npm run dev`: Runs Node.js/Vite on the host **without Docker**
- `docker-compose -f docker-compose.dev.yml`: Runs inside a Docker container

These are two different modes:
- **Local** (`npm run dev`): Faster, uses local node_modules
- **Docker** (`docker-compose.dev.yml`): Isolated, mirrors production

---

## 🔧 Practical examples

### Example 1: Local development (`npm run dev`)

```bash
# 1. Create .env (optional)
cat > .env << EOF
PORT=3003
SERVER_PORT=3003
VITE_PORT=5173
JWT_SECRET=dev_secret
EOF

# 2. Run dev locally
npm run dev

# Frontend: http://localhost:5173
# Backend: http://localhost:3003
```

### Example 2: Docker development (`docker-compose.dev.yml`)

```bash
# 1. Create .env (optional)
cat > .env << EOF
DASHBOARD_PORT=3000
SERVER_PORT=3003
JWT_SECRET=dev_secret
EOF

# 2. Run with Docker
docker-compose -f docker-compose.dev.yml up --build

# Frontend: http://localhost:3000
# Backend: http://localhost:3003
```

### Example 3: Override with shell variables

```bash
# Override ports via shell
DASHBOARD_PORT=4000 SERVER_PORT=3004 docker-compose -f docker-compose.dev.yml up

# Frontend: http://localhost:4000
# Backend: http://localhost:3004
```

---

## ⚠️ Important notes

1. **`.env` file**:
   - ✅ Read automatically by Docker Compose
   - ✅ Read automatically by `npm run dev` (via dotenv)
   - ⚠️ Must **never** be committed to Git (add to `.gitignore`)

2. **Variables in `docker-compose.dev.yml`**:
   - Variables in the `environment:` section are passed **into the container**
   - The container can also read a mounted `.env`

3. **Priority order**:
   - Shell > `.env` > defaults
   - In `docker-compose.yml`, `environment:` values take precedence over shell

---

## 📚 References

- [Docker Compose - Environment Variables](https://docs.docker.com/compose/environment-variables/)
- [dotenv - npm](https://www.npmjs.com/package/dotenv)
- [Vite - Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

---

*This document clarifies how environment variables are handled.*
