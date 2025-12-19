# Configuration des Ports - Dev vs Prod

**Date** : $(date)  
**Objectif** : Documenter la configuration des ports pour éviter les conflits entre dev et prod

---

## 📋 Configuration des Ports

### Production (Docker)

| Service | Port Conteneur | Port Hôte (par défaut) | Variable d'environnement |
|---------|---------------|------------------------|-------------------------|
| Backend API | 3000 | 7505 | `DASHBOARD_PORT` (mappe vers 3000) |
| Frontend | Intégré dans le backend | - | - |

**Fichiers concernés** :
- `docker-compose.yml` : Port mapping `${DASHBOARD_PORT:-7505}:3000`
- `Dockerfile` : `ENV PORT=3000` et `EXPOSE 3000`

**Utilisation** :
```bash
docker-compose up -d
# Accès : http://localhost:7505
```

---

### Développement (Docker)

| Service | Port Conteneur | Port Hôte (par défaut) | Variable d'environnement |
|---------|---------------|------------------------|-------------------------|
| Frontend (Vite) | 3000 | 3000 | `DASHBOARD_PORT` ou `VITE_PORT` |
| Backend API | 3003 | 3003 | `SERVER_PORT` ou `PORT` |

**Fichiers concernés** :
- `docker-compose.dev.yml` : 
  - Frontend : `${DASHBOARD_PORT:-3000}:${DASHBOARD_PORT:-3000}`
  - Backend : `${SERVER_PORT:-3003}:${SERVER_PORT:-3003}`
- `Dockerfile.dev` : `EXPOSE 5173 3003`
- `vite.config.ts` : Proxy vers `SERVER_PORT || PORT || '3003'`
- `server/config.ts` : Port par défaut 3003 en dev

**Utilisation** :
```bash
docker-compose -f docker-compose.dev.yml up --build
# Frontend : http://localhost:3000
# Backend API : http://localhost:3003
```

---

## 🔧 Variables d'Environnement

### Production

```bash
# Port d'accès au dashboard (mappé vers 3000 dans le conteneur)
DASHBOARD_PORT=7505

# Port interne du backend (toujours 3000 en prod)
PORT=3000
```

### Développement

```bash
# Port du serveur Vite (frontend)
DASHBOARD_PORT=3000
VITE_PORT=3000

# Port du backend API
SERVER_PORT=3003
PORT=3003
```

---

## ✅ Vérification de la Configuration

### Production

1. **Backend écoute sur** : `0.0.0.0:3000` (dans le conteneur)
2. **Mapping hôte** : `7505 → 3000`
3. **Accès** : `http://localhost:7505`

### Développement

1. **Frontend (Vite) écoute sur** : `0.0.0.0:3000` (dans le conteneur)
2. **Backend écoute sur** : `0.0.0.0:3003` (dans le conteneur)
3. **Proxy Vite** : `/api` → `http://localhost:3003`
4. **Mapping hôte** : 
   - Frontend : `3000 → 3000`
   - Backend : `3003 → 3003`
5. **Accès** : `http://localhost:3000` (frontend avec proxy vers backend)

---

## 🐛 Résolution de Problèmes

### Erreur "socket hang up" dans Vite

**Symptôme** :
```
[vite] http proxy error: /api/plugins/stats/all
Error: socket hang up
```

**Causes possibles** :
1. Le backend n'est pas démarré ou n'écoute pas sur le bon port
2. Le proxy Vite pointe vers le mauvais port
3. Le mapping de port Docker est incorrect

**Solutions** :
1. Vérifier que `SERVER_PORT=3003` est défini dans `docker-compose.dev.yml`
2. Vérifier que le backend démarre bien sur le port 3003
3. Vérifier les logs : `docker logs Mynetwork-dev`
4. Tester le backend directement : `curl http://localhost:3003/api/health`

### Conflit de ports

**Symptôme** : Impossible de démarrer le conteneur, port déjà utilisé

**Solutions** :
1. Changer les ports dans `docker-compose.dev.yml` :
   ```yaml
   ports:
     - "3001:3000"  # Frontend sur port 3001
     - "3004:3003"  # Backend sur port 3004
   ```
2. Définir les variables d'environnement :
   ```bash
   DASHBOARD_PORT=3001 SERVER_PORT=3004 docker-compose -f docker-compose.dev.yml up
   ```

---

## 📝 Notes Techniques

### Pourquoi des ports différents ?

- **Production** : Port 3000 dans le conteneur, mappé sur 7505 pour éviter les conflits
- **Développement** : 
  - Frontend sur 3000 (standard Vite)
  - Backend sur 3003 (pour éviter le conflit avec la prod sur 3000)
  - Permet d'avoir prod (7505) et dev (3000) en même temps

### Proxy Vite

Le proxy Vite dans `vite.config.ts` redirige :
- `/api/*` → `http://localhost:${SERVER_PORT || PORT || '3003'}`
- `/ws/*` → `ws://localhost:${SERVER_PORT || PORT || '3003'}`

Dans Docker, `localhost` fait référence au conteneur lui-même, donc le proxy fonctionne correctement car Vite et le backend sont dans le même conteneur.

---

## 🔄 Historique des Changements

- **2024-XX-XX** : Correction du mapping de port backend dans `docker-compose.dev.yml` (3001 → 3003)
- **2024-XX-XX** : Correction des ports EXPOSE dans `Dockerfile.dev` (3000 → 3003)
- **2024-XX-XX** : Ajout de `SERVER_PORT` dans les variables d'environnement Docker dev

---

**Document généré automatiquement lors de la correction de la configuration des ports**

