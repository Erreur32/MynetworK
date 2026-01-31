# ===========================================
# MynetworK - Node 22 Alpine (OPTIMIZED MULTI-STAGE)
# ===========================================

# ---------- Stage 1 : Build (avec outils de build) ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

# 🔴 Outils de build OBLIGATOIRES pour compiler better-sqlite3 et autres modules natifs
# Ces outils seront supprimés dans l'image finale
RUN apk add --no-cache python3 make g++

# Installer toutes les dépendances (y compris devDependencies) uniquement pour compiler les modules natifs
# Les devDependencies seront supprimées dans l'image finale (voir npm prune --production ci-dessous)
COPY package*.json ./
RUN npm ci

# Copier le code source et builder
COPY . .
RUN npm run build

# Préparer node_modules de production (sans devDependencies mais avec binaires compilés)
# On garde les binaires compilés de better-sqlite3 et on supprime seulement les devDependencies
# npm prune --production supprime les devDependencies mais garde les binaires compilés
RUN npm prune --production && npm cache clean --force


# ---------- Stage 2 : Runtime (image finale légère) ----------
FROM node:22-alpine

WORKDIR /app

# 🎯 Outils RUNTIME uniquement (pas d'outils de build)
# su-exec: nécessaire pour l'entrypoint script (switch root → node)
# iputils-ping: nécessaire pour le scan réseau (commande ping)
# iproute2: nécessaire pour le scan réseau (commande ip neigh pour détection MAC)
# samba-common: contient nmblookup pour NetBIOS/SMB hostname resolution
# curl: nécessaire pour télécharger la base vendors IEEE OUI depuis standards-oui.ieee.org (avec fallback plugins si échec)
# Note: getent n'est pas disponible dans Alpine (musl libc), on utilise la lecture directe de /etc/hosts
# Note: libpcap/libpcap-dev retirés car arp-scan est optionnel (fallback après ip neigh)
#       Si arp-scan est vraiment nécessaire, il faudra le compiler dans le stage build
# nmap: pour le scan de ports (option "Scanner les ports après chaque scan complet")
RUN apk add --no-cache su-exec iputils-ping iproute2 samba-common curl nmap

# Créer le répertoire data avec les bonnes permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Copier l'entrypoint script (nécessite su-exec)
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Entrypoint pour corriger les permissions au démarrage
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# 🎯 Copier node_modules compilés depuis le stage build (binaires natifs déjà compilés)
# Cela évite de recompiler better-sqlite3 dans l'image finale
# Les binaires sont compilés pour l'architecture cible dans le stage build
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Copier package.json pour référence (nécessaire pour certaines dépendances)
COPY --chown=node:node package*.json ./

# Frontend buildé
COPY --chown=node:node --from=builder /app/dist ./dist

# Backend TypeScript (exécuté par tsx)
COPY --chown=node:node --from=builder /app/server ./server
COPY --chown=node:node --from=builder /app/tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=3000
# FREEBOX_TOKEN_FILE and FREEBOX_HOST should be set at runtime via docker-compose or environment variables
# This avoids security warnings about sensitive data in Dockerfile

# Healthcheck avec wget (déjà présent dans Alpine de base)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
 CMD wget -q --spider http://127.0.0.1:${PORT}/api/health || exit 1

EXPOSE 3000

# TS runtime (tsx exécute les fichiers TypeScript directement)
CMD ["node_modules/.bin/tsx", "server/index.ts"]
