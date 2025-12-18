# ===========================================
# MynetworK - Node 22 Alpine - TS -> JS
# ===========================================

# ---------- Stage 1 : Build ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

# deps complètes
COPY package*.json ./
RUN npm ci

COPY . .

# build frontend + backend
RUN npm run build \
 && npx tsc --project tsconfig.json


# ---------- Stage 2 : Production ----------
FROM node:22-alpine

WORKDIR /app

# outils runtime nécessaires
RUN apk add --no-cache wget

# user non-root
RUN addgroup -S nodejs && adduser -S node -G nodejs

# data
RUN mkdir -p /app/data && chown -R node:node /app

USER node

# deps prod
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# frontend
COPY --chown=node:node --from=builder /app/dist ./dist

# backend JS
COPY --chown=node:node --from=builder /app/server ./server

ENV NODE_ENV=production
ENV PORT=3000
ENV FREEBOX_TOKEN_FILE=/app/data/freebox_token.json
ENV FREEBOX_HOST=mafreebox.freebox.fr

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
 CMD wget -q --spider http://127.0.0.1:${PORT}/api/health || exit 1

EXPOSE 3000

CMD ["node", "server/index.js"]
