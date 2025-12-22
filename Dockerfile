# ===========================================
# MynetworK - Node 22 Alpine (STABLE & SECURE)
# ===========================================

# ---------- Stage 1 : Build ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

# 🔴 OBLIGATOIRE pour better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# ---------- Stage 2 : Production ----------
FROM node:22-alpine

WORKDIR /app

# outils nécessaires pour modules natifs (COMME AVANT)
# su-exec is needed for the entrypoint script to switch from root to node user
# iputils-ping: Required for network scanning (ping command)
# iproute2: Required for network scanning (ip neigh command for MAC detection)
# arp-scan: Required for improved MAC address detection (like WatchYourLAN)
# Note: arp-scan needs to be built from source on Alpine, but we'll try to use it if available
# For now, we use ip neigh as primary method and arp-scan as optional enhancement
RUN apk add --no-cache python3 make g++ wget su-exec iputils-ping iproute2 libpcap-dev libpcap

# data
RUN mkdir -p /app/data && chown -R node:node /app

# Copy entrypoint script to fix permissions at runtime
# Script runs as root to fix permissions, then switches to node user
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Keep root user for entrypoint script (it will switch to node user)
# Use entrypoint script to fix permissions before starting the app
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# deps prod (COMME AVANT)
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# frontend
COPY --chown=node:node --from=builder /app/dist ./dist

# backend TS exécuté par tsx (COMME AVANT)
COPY --chown=node:node --from=builder /app/server ./server
COPY --chown=node:node --from=builder /app/tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=3000
# FREEBOX_TOKEN_FILE and FREEBOX_HOST should be set at runtime via docker-compose or environment variables
# This avoids security warnings about sensitive data in Dockerfile

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
 CMD wget -q --spider http://127.0.0.1:${PORT}/api/health || exit 1

EXPOSE 3000

# TS runtime (COMME AVANT)
CMD ["node_modules/.bin/tsx", "server/index.ts"]
