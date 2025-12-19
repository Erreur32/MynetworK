# Variables d'Environnement - Guide Complet

**Date** : $(date)  
**Objectif** : Expliquer d'où viennent les variables d'environnement selon le mode d'exécution

---

## 🔍 D'où viennent les variables `${DASHBOARD_PORT:-3000}` dans Docker Compose ?

### Ordre de Priorité (Docker Compose)

Docker Compose lit les variables d'environnement dans cet ordre (du plus prioritaire au moins prioritaire) :

1. **Variables d'environnement du shell** (exportées avant la commande)
   ```bash
   export DASHBOARD_PORT=4000
   docker-compose -f docker-compose.dev.yml up
   ```

2. **Fichier `.env`** (à la racine du projet, à côté de `docker-compose.yml`)
   ```bash
   # Fichier .env
   DASHBOARD_PORT=4000
   SERVER_PORT=3004
   ```
   Docker Compose lit automatiquement ce fichier s'il existe.

3. **Flag `--env-file`** (fichier personnalisé)
   ```bash
   docker-compose -f docker-compose.dev.yml --env-file .env.local up
   ```

4. **Valeurs par défaut** dans `docker-compose.yml` (syntaxe `${VAR:-default}`)
   ```yaml
   ports:
     - "${DASHBOARD_PORT:-3000}:${DASHBOARD_PORT:-3000}"
   ```
   Si `DASHBOARD_PORT` n'est pas défini, utilise `3000` par défaut.

---

## 📋 Modes d'Exécution

### Mode 1 : `npm run dev` (Développement Local - SANS Docker)

**Commande** :
```bash
npm run dev
```

**Ce qui se passe** :
- Lance `concurrently "npm run dev:server" "npm run dev:client"`
- **Backend** : `npm run dev:server` → `tsx watch server/index.ts`
- **Frontend** : `npm run dev:client` → `vite`

**Variables d'environnement** :
- ✅ Lit automatiquement le fichier `.env` (via `dotenv/config` dans `server/index.ts`)
- ✅ Variables du shell (`export PORT=3003`)
- ✅ Valeurs par défaut dans le code

**Configuration utilisée** :
- ❌ **N'utilise PAS** `docker-compose.dev.yml`
- ✅ Utilise directement les fichiers de configuration :
  - `vite.config.ts` pour le frontend
  - `server/config.ts` pour le backend
  - Variables d'environnement du système

**Ports par défaut** :
- Frontend (Vite) : `5173` (défini dans `vite.config.ts`)
- Backend : `3003` (défini dans `server/config.ts`)

**Exemple de configuration** :
```bash
# Fichier .env (à la racine)
PORT=3003
SERVER_PORT=3003
VITE_PORT=5173
JWT_SECRET=dev_secret
```

---

### Mode 2 : `docker-compose -f docker-compose.dev.yml` (Développement avec Docker)

**Commande** :
```bash
docker-compose -f docker-compose.dev.yml up --build
```

**Ce qui se passe** :
- Lance un conteneur Docker avec hot reload
- Monte le code source dans le conteneur
- Exécute `npm run dev` **dans le conteneur**

**Variables d'environnement** :
- ✅ Variables définies dans `docker-compose.dev.yml` (section `environment:`)
- ✅ Variables du shell (exportées avant la commande)
- ✅ Fichier `.env` (si présent à la racine)
- ✅ Flag `--env-file` (si utilisé)

**Configuration utilisée** :
- ✅ **Utilise** `docker-compose.dev.yml`
- ✅ Les variables sont passées au conteneur via la section `environment:`
- ✅ Le code dans le conteneur lit aussi `.env` (s'il est monté)

**Ports par défaut** :
- Frontend (Vite) : `3000` (mappé depuis le conteneur)
- Backend : `3003` (mappé depuis le conteneur)

**Exemple de configuration** :
```bash
# Fichier .env (optionnel, pour override)
DASHBOARD_PORT=3000
SERVER_PORT=3003
JWT_SECRET=dev_secret
```

---

## 🔄 Comparaison des Modes

| Aspect | `npm run dev` | `docker-compose -f docker-compose.dev.yml` |
|--------|---------------|--------------------------------------------|
| **Environnement** | Machine hôte (Node.js direct) | Conteneur Docker |
| **Configuration** | `vite.config.ts` + `server/config.ts` | `docker-compose.dev.yml` + configs |
| **Variables** | `.env` + shell + defaults | `.env` + shell + `docker-compose.dev.yml` |
| **Port Frontend** | `5173` (Vite default) | `3000` (défini dans docker-compose) |
| **Port Backend** | `3003` (config.ts default) | `3003` (défini dans docker-compose) |
| **Hot Reload** | ✅ Oui | ✅ Oui (via volume mount) |
| **Isolation** | ❌ Non (utilise node_modules local) | ✅ Oui (conteneur isolé) |

---

## 📝 Fichiers de Configuration

### 1. `.env` (Optionnel - à la racine)

Ce fichier est lu par :
- ✅ Docker Compose (automatiquement)
- ✅ `npm run dev` (via `dotenv/config` dans `server/index.ts`)
- ✅ Vite (si configuré, mais pas par défaut)

**Exemple** :
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

Définit les variables pour le conteneur Docker :
```yaml
environment:
  - PORT=${SERVER_PORT:-3003}
  - SERVER_PORT=${SERVER_PORT:-3003}
  - VITE_PORT=${DASHBOARD_PORT:-3000}
```

### 3. `vite.config.ts`

Configuration Vite (frontend) :
```typescript
port: parseInt(process.env.VITE_PORT || '5173', 10),
proxy: {
  '/api': {
    target: `http://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
  }
}
```

### 4. `server/config.ts`

Configuration backend :
```typescript
port: parseInt(
  process.env.PORT || 
  process.env.SERVER_PORT || 
  (process.env.NODE_ENV === 'production' ? '3000' : '3003'), 
  10
),
```

---

## 🎯 Réponses aux Questions

### Question 1 : D'où viennent `${DASHBOARD_PORT:-3000}` ?

**Réponse** : Docker Compose cherche la variable dans cet ordre :
1. Variable d'environnement du shell : `export DASHBOARD_PORT=4000`
2. Fichier `.env` à la racine : `DASHBOARD_PORT=4000`
3. Flag `--env-file` : `docker-compose --env-file .env.local`
4. Valeur par défaut : `3000` (dans `${DASHBOARD_PORT:-3000}`)

**Le fichier `.env` n'est pas obligatoire**, mais s'il existe, Docker Compose le lit automatiquement.

### Question 2 : `npm run dev` utilise-t-il `docker-compose.dev.yml` ?

**Réponse** : **NON** ❌

- `npm run dev` : Lance directement Node.js/Vite sur la machine hôte, **sans Docker**
- `docker-compose -f docker-compose.dev.yml` : Lance dans un conteneur Docker

**Ce sont deux modes différents** :
- **Mode local** (`npm run dev`) : Plus rapide, utilise les node_modules locaux
- **Mode Docker** (`docker-compose.dev.yml`) : Plus isolé, reproduit l'environnement de production

---

## 🔧 Exemples Pratiques

### Exemple 1 : Développement Local (`npm run dev`)

```bash
# 1. Créer un fichier .env (optionnel)
cat > .env << EOF
PORT=3003
SERVER_PORT=3003
VITE_PORT=5173
JWT_SECRET=dev_secret
EOF

# 2. Lancer en dev local
npm run dev

# Frontend : http://localhost:5173
# Backend : http://localhost:3003
```

### Exemple 2 : Développement Docker (`docker-compose.dev.yml`)

```bash
# 1. Créer un fichier .env (optionnel)
cat > .env << EOF
DASHBOARD_PORT=3000
SERVER_PORT=3003
JWT_SECRET=dev_secret
EOF

# 2. Lancer avec Docker
docker-compose -f docker-compose.dev.yml up --build

# Frontend : http://localhost:3000
# Backend : http://localhost:3003
```

### Exemple 3 : Override avec variables shell

```bash
# Override les ports via variables shell
DASHBOARD_PORT=4000 SERVER_PORT=3004 docker-compose -f docker-compose.dev.yml up

# Frontend : http://localhost:4000
# Backend : http://localhost:3004
```

---

## ⚠️ Points d'Attention

1. **Fichier `.env`** :
   - ✅ Lu automatiquement par Docker Compose
   - ✅ Lu automatiquement par `npm run dev` (via dotenv)
   - ⚠️ Ne doit **JAMAIS** être commité dans Git (ajouté dans `.gitignore`)

2. **Variables dans `docker-compose.dev.yml`** :
   - Les variables dans la section `environment:` sont passées **au conteneur**
   - Le conteneur peut aussi lire un `.env` monté en volume

3. **Ordre de priorité** :
   - Variables shell > `.env` > Valeurs par défaut
   - Dans `docker-compose.yml`, les variables `environment:` ont priorité sur celles du shell

---

## 📚 Références

- [Docker Compose - Environment Variables](https://docs.docker.com/compose/environment-variables/)
- [dotenv - npm](https://www.npmjs.com/package/dotenv)
- [Vite - Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

---

**Document généré automatiquement pour clarifier la gestion des variables d'environnement**

