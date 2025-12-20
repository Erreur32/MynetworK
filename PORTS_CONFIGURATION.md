# Configuration des Ports - MynetworK

## 📋 Résumé des Ports par Environnement

### 🛠️ Développement NPM (`npm run dev`)

| Service | Port Hôte | Port Conteneur | Variable d'environnement | Fichier de config |
|---------|-----------|---------------|--------------------------|-------------------|
| **Frontend (Vite)** | `5173` | - | `VITE_PORT` | `vite.config.ts` |
| **Backend (API)** | `3003` | - | `SERVER_PORT` ou `PORT` | `server/config.ts` |

**Commandes :**
```bash
npm run dev                    # Démarre frontend (5173) + backend (3003)
npm run dev:client            # Frontend uniquement (5173)
npm run dev:server            # Backend uniquement (3003)
```

**Accès :**
- Frontend : `http://localhost:5173` ou `http://192.168.1.150:5173`
- Backend API : `http://localhost:3003`
- Le proxy Vite redirige `/api/*` vers `http://localhost:3003`

---

### 🐳 Développement Docker (`docker-compose.dev.yml`)

| Service | Port Hôte | Port Conteneur | Variable d'environnement | Fichier de config |
|---------|-----------|---------------|--------------------------|-------------------|
| **Frontend (Vite)** | `3000` | `3000` | `DASHBOARD_PORT` ou `VITE_PORT` | `docker-compose.dev.yml` |
| **Backend (API)** | `3003` | `3003` | `SERVER_PORT` ou `PORT` | `docker-compose.dev.yml` |

**Commandes :**
```bash
docker-compose -f docker-compose.dev.yml up --build
# Ou avec un nom de projet différent pour éviter les conflits :
docker-compose -f docker-compose.dev.yml -p mynetwork-dev up --build
```

**Accès :**
- Frontend : `http://localhost:3000` ou `http://192.168.1.150:3000`
- Backend API : `http://localhost:3003`
- Le proxy Vite redirige `/api/*` vers `http://localhost:3003` (dans le conteneur)

**⚠️ PROBLÈME ACTUEL :** Le port 3000 est utilisé pour le frontend Docker dev, ce qui peut entrer en conflit avec d'autres services.

---

### 🚀 Production Docker (`docker-compose.yml`)

| Service | Port Hôte | Port Conteneur | Variable d'environnement | Fichier de config |
|---------|-----------|---------------|--------------------------|-------------------|
| **Application complète** | `7505` | `3000` | `DASHBOARD_PORT` | `docker-compose.yml` |

**Commandes :**
```bash
docker-compose up -d
# Ou avec un port personnalisé :
DASHBOARD_PORT=8080 docker-compose up -d
```

**Accès :**
- Application : `http://localhost:7505` ou `http://192.168.1.150:7505`
- Le backend sert aussi le frontend (build statique)

---

### 🏗️ Production Docker Local Build (`docker-compose.local.yml`)

| Service | Port Hôte | Port Conteneur | Variable d'environnement | Fichier de config |
|---------|-----------|---------------|--------------------------|-------------------|
| **Application complète** | `7505` | `3000` | `DASHBOARD_PORT` | `docker-compose.local.yml` |

**Commandes :**
```bash
docker-compose -f docker-compose.local.yml up -d --build
```

**Accès :**
- Application : `http://localhost:7505` ou `http://192.168.1.150:7505`

---

## ⚠️ Problèmes Identifiés

### Conflit de Ports Potentiel

Le **Docker dev** utilise le port **3000** pour le frontend, ce qui peut entrer en conflit avec :
- D'autres services web
- Des applications qui utilisent le port 3000 par défaut
- La production si elle est configurée sur le port 3000

### Recommandation

Pour éviter les conflits, il est recommandé d'utiliser des ports différents pour le dev :

| Environnement | Frontend | Backend | Statut |
|---------------|----------|---------|--------|
| **NPM Dev** | `5173` ✅ | `3003` ✅ | OK - Pas de conflit |
| **Docker Dev** | `3000` ⚠️ | `3003` ✅ | ⚠️ Port 3000 peut entrer en conflit |
| **Production** | `7505` ✅ | `3000` (interne) ✅ | OK - Pas de conflit |

---

## 🔧 Solutions Proposées

### Option 1 : Changer le port Docker Dev Frontend (Recommandé)

Modifier `docker-compose.dev.yml` pour utiliser un port différent :

```yaml
ports:
  - "${DASHBOARD_PORT:-5174}:${DASHBOARD_PORT:-5174}"  # Frontend sur 5174 au lieu de 3000
  - "${SERVER_PORT:-3003}:${SERVER_PORT:-3003}"        # Backend reste sur 3003
```

**Avantages :**
- Pas de conflit avec le port 3000
- Cohérent avec npm dev (5173) - juste un port différent
- Facile à changer via variable d'environnement

### Option 2 : Utiliser des ports complètement différents

```yaml
ports:
  - "${DASHBOARD_PORT:-5174}:5174"  # Frontend
  - "${SERVER_PORT:-3004}:3004"     # Backend (3004 au lieu de 3003)
```

**Avantages :**
- Aucun conflit possible
- Ports clairement identifiés comme dev

---

## 📝 Configuration Actuelle dans les Fichiers

### `vite.config.ts`
```typescript
server: {
  port: parseInt(process.env.VITE_PORT || '5173', 10),  // Frontend npm dev
  proxy: {
    '/api': {
      target: `http://127.0.0.1:${process.env.SERVER_PORT || '3003'}`,  // Backend
    }
  }
}
```

### `server/config.ts`
```typescript
port: parseInt(
  process.env.PORT || 
  process.env.SERVER_PORT || 
  (process.env.NODE_ENV === 'production' ? '3000' : '3003'),  // 3003 en dev, 3000 en prod
  10
)
```

### `docker-compose.dev.yml`
```yaml
ports:
  - "${DASHBOARD_PORT:-3000}:${DASHBOARD_PORT:-3000}"  # Frontend
  - "${SERVER_PORT:-3003}:${SERVER_PORT:-3003}"        # Backend
```

### `docker-compose.yml` (Production)
```yaml
ports:
  - "${DASHBOARD_PORT:-7505}:3000"  # Port hôte 7505 → port conteneur 3000
```

---

## ✅ Recommandation Finale

Pour éviter tous les conflits, utiliser :

| Environnement | Frontend | Backend |
|---------------|----------|---------|
| **NPM Dev** | `5173` | `3003` |
| **Docker Dev** | `5174` | `3003` |
| **Production** | `7505` | `3000` (interne) |

Cela garantit qu'aucun port n'est partagé entre les environnements.

