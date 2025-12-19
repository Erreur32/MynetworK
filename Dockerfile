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
RUN apk add --no-cache python3 make g++ wget

# data
RUN mkdir -p /app/data && chown -R node:node /app

USER node

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
