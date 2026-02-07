# ===========================================
# MynetworK - Node 22 Alpine (OPTIMIZED MULTI-STAGE)
# ===========================================
# Multi-arch: Buildx sets TARGETPLATFORM (amd64/arm64/arm/v7) per build.
# Builder uses TARGETPLATFORM so native modules (e.g. better-sqlite3) are compiled for the target arch.
ARG TARGETPLATFORM
ARG BUILDPLATFORM

# ---------- Stage 1: Build (with build tools) ----------
FROM --platform=$TARGETPLATFORM node:22-alpine AS builder

WORKDIR /app

# Required build tools to compile better-sqlite3 and other native modules.
# These tools are not present in the final image.
RUN apk add --no-cache python3 make g++

# Install all dependencies (including devDependencies) only to compile native modules.
# devDependencies are removed in the final image (see npm prune --production below).
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Prepare production node_modules (no devDependencies but with compiled binaries).
# Keep compiled better-sqlite3 binaries and remove only devDependencies.
# npm prune --production removes devDependencies but keeps compiled binaries.
RUN npm prune --production && npm cache clean --force


# ---------- Stage 2: Runtime (slim final image) ----------
# Re-declare so this stage gets Buildx TARGETPLATFORM (global ARG is not available after first FROM)
ARG TARGETPLATFORM
# Use TARGETPLATFORM so the runtime base matches the built arch (required for HA / Raspberry)
FROM --platform=$TARGETPLATFORM node:22-alpine

WORKDIR /app

# Runtime tools only (no build tools).
# su-exec: required for entrypoint script (switch root → node).
# iputils-ping: required for network scan (ping command).
# iproute2: required for network scan (ip neigh for MAC detection).
# samba-common: provides nmblookup for NetBIOS/SMB hostname resolution.
# curl: required to download IEEE OUI vendor database from standards-oui.ieee.org (with plugin fallback on failure).
# Note: getent is not available on Alpine (musl libc); we use direct /etc/hosts reading.
# Note: libpcap/libpcap-dev removed as arp-scan is optional (fallback after ip neigh).
#       If arp-scan is needed, it must be compiled in the build stage.
# nmap: for port scanning (option "Scan ports after each full scan").
RUN apk add --no-cache su-exec iputils-ping iproute2 samba-common curl nmap

# Create data directory with correct permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Copy entrypoint script (requires su-exec)
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Entrypoint to fix permissions on startup
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Copy compiled node_modules from build stage (native binaries already compiled).
# Avoids recompiling better-sqlite3 in the final image.
# Binaries are compiled for the target architecture in the build stage.
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Copy package.json for reference (required by some dependencies)
COPY --chown=node:node package*.json ./

# Built frontend
COPY --chown=node:node --from=builder /app/dist ./dist

# Backend TypeScript (run by tsx)
COPY --chown=node:node --from=builder /app/server ./server
COPY --chown=node:node --from=builder /app/tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=3000
# FREEBOX_TOKEN_FILE and FREEBOX_HOST should be set at runtime via docker-compose or environment variables
# This avoids security warnings about sensitive data in Dockerfile

# Healthcheck with wget (already available in base Alpine)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
 CMD wget -q --spider http://127.0.0.1:${PORT}/api/health || exit 1

EXPOSE 3000

# TS runtime (tsx runs TypeScript files directly)
CMD ["node_modules/.bin/tsx", "server/index.ts"]
