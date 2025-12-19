# 📚 README Développement – MynetworK

Guide de développement pour MynetworK.

---

## 🚀 Installation

### Prérequis

- Node.js 20.x ou 22.x
- npm (ou yarn/pnpm)
- Docker + Docker Compose (optionnel, pour tester la stack complète)

### Installation

```bash
git clone <url-du-repo>
cd MynetworK

npm install
cp .env.example .env   # si présent
```

### Variables d'environnement

**Fichier `.env` (optionnel, créé à la racine du projet)**

Variables minimales pour le développement (voir `DOCUMENTATION_STOCKAGE.md` pour plus de détails) :

**Pour `npm run dev` (développement local)** :
```bash
PORT=3003              # Port du backend
SERVER_PORT=3003       # Port du backend (alias)
VITE_PORT=5173         # Port du frontend Vite
JWT_SECRET=dev_secret_change_me
FREEBOX_HOST=mafreebox.freebox.fr
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
```

**Pour `docker-compose -f docker-compose.dev.yml` (développement Docker)** :
```bash
DASHBOARD_PORT=3000    # Port du frontend (mappé depuis le conteneur)
SERVER_PORT=3003       # Port du backend (mappé depuis le conteneur)
JWT_SECRET=dev_secret_change_me
FREEBOX_HOST=mafreebox.freebox.fr
```

> ⚠️ **Important** : Le fichier `.env` ne doit **JAMAIS** être commité dans Git (déjà dans `.gitignore`).  
> Pour plus de détails sur les variables d'environnement, voir `Docs/VARIABLES_ENVIRONNEMENT.md`.

---

## 🏃 Lancer en Développement

### Méthode 1 : Développement Local (SANS Docker) - Recommandé

**Option A : Une seule commande (tout ensemble)**
```bash
npm run dev
```
Cette commande lance automatiquement le backend ET le frontend en parallèle dans un seul terminal.

**Option B : Deux terminaux séparés (plus de contrôle)**
```bash
# Terminal 1 - Backend
npm run dev:server   # backend sur http://localhost:3003

# Terminal 2 - Frontend  
npm run dev:client   # frontend sur http://localhost:5173
```

**Ports par défaut** :
- Frontend (Vite) : `http://localhost:5173`
- Backend API : `http://localhost:3003`
- Le proxy Vite redirige automatiquement `/api/*` vers le backend

**Variables d'environnement** :
- Créez un fichier `.env` à la racine (optionnel) :
  ```bash
  PORT=3003
  SERVER_PORT=3003
  VITE_PORT=5173
  JWT_SECRET=dev_secret_change_me
  FREEBOX_HOST=mafreebox.freebox.fr
  ```
- Le fichier `.env` est lu automatiquement par le backend (via `dotenv/config`)

---

### Méthode 2 : Développement avec Docker (Optionnel)

Pour tester dans un environnement isolé similaire à la production :

```bash
docker-compose -f docker-compose.dev.yml up --build
```

**Ports par défaut** :
- Frontend (Vite) : `http://localhost:3000`
- Backend API : `http://localhost:3003`

**Variables d'environnement** :
- Créez un fichier `.env` à la racine (optionnel) :
  ```bash
  DASHBOARD_PORT=3000
  SERVER_PORT=3003
  JWT_SECRET=dev_secret_change_me
  FREEBOX_HOST=mafreebox.freebox.fr
  ```
- Docker Compose lit automatiquement le fichier `.env`

**Note** : Le mode Docker monte le code source en volume, donc le hot reload fonctionne aussi.

---

### Quelle méthode choisir ?

| Critère | `npm run dev` (Local) | Docker Dev |
|---------|----------------------|------------|
| **Vitesse de démarrage** | ⚡ Plus rapide | 🐢 Plus lent |
| **Isolation** | ❌ Utilise node_modules local | ✅ Environnement isolé |
| **Simplicité** | ✅ Plus simple | ⚠️ Nécessite Docker |
| **Recommandé pour** | Développement quotidien | Tests d'intégration, debug Docker |

**Recommandation** : Utilisez `npm run dev` pour le développement quotidien, et Docker dev uniquement pour tester des problèmes spécifiques à Docker.

---

## 🏗️ Architecture

### Frontend (`src/`)

- `src/api/` : Client HTTP, appels vers l'API backend
- `src/components/` : Composants React réutilisables
  - `layout/` : Header, Footer
  - `modals/` : Modales (login, config plugins, etc.)
  - `ui/` : Composants UI réutilisables
  - `widgets/` : Widgets du dashboard
- `src/pages/` : Pages principales (Dashboard, Plugins, Users, Logs, etc.)
- `src/stores/` : Zustand (auth utilisateur, plugins, etc.)
- `src/styles/themes.css` : Thèmes CSS (dark, glass, modern)

### Backend (`server/`)

- `server/index.ts` : Point d'entrée Express
- `server/routes/` : Routes API (`users.ts`, `plugins.ts`, `logs.ts`, etc.)
- `server/services/` :
  - `authService.ts` : JWT + auth
  - `pluginManager.ts` : Gestion des plugins
  - `loggingService.ts` : Logs applicatifs
- `server/plugins/` :
  - `base/` : Interface/classe de base des plugins
  - `freebox/` : Plugin Freebox
  - `unifi/` : Plugin UniFi
- `server/database/` :
  - `connection.ts` : Connexion SQLite
  - `models/` : `User`, `Log`, `PluginConfig`, etc.

### Données & Config

- `data/dashboard.db` : Base SQLite (dev/prod Docker)
- `config/mynetwork.conf` : Fichier de config externe (optionnel)

---

## 🧰 Scripts Utiles

Les scripts shell sont regroupés dans `scripts/` (développement local uniquement) :

### Scripts UniFi

- `scripts/unifi.sh` : Toolbox UniFi complète
- `scripts/unifi_token.sh` : Génération de token UniFi API
- `scripts/unifi_token_interactif.sh` : Mode interactif
- `scripts/unifi_script.sh` : Test simple de connexion
- `scripts/unitfi_test.sh` : Tests complets de l'API UniFi

### Scripts Backend & Docker

- `scripts/test-backend.sh` : Test manuel de l'API backend
- `scripts/test-docker-access.sh` : Test d'accès à l'image Docker sur GHCR
- `scripts/check-docker-build.sh` : Vérification du build Docker

### Scripts Utilitaires

- `scripts/create-tags.sh` : Création de tags Git
- `scripts/update-version.sh` : Mise à jour de la version

> ⚠️ **Ces scripts peuvent contenir des credentials de dev** : ne jamais y mettre de secrets de production.  
> Utiliser `.env.local` ou le mode interactif pour les secrets.

---

## 📖 Documentation

### Documentation Publique (`Docs/`)

- `Docs/DOCUMENTATION.md` : **Index** de la doc
- `Docs/ARCHITECTURE_PLUGINS.md` : Détails sur le système de plugins
- `Docs/DOCUMENTATION_STOCKAGE.md` : Stockage (DB, `.conf`, Docker volumes)
- `Docs/GUIDE_DEVELOPPEMENT.md` : Guide complet de développement
- `Docs/GUIDE_DOCKER_TAGS.md` : Gestion des tags Docker

### Documentation Interne (`Doc_Dev/`)

- `Doc_Dev/README-DEV.md` : Point d'entrée pour les développeurs
- `Doc_Dev/ROADMAP.md` : Roadmap interne
- `Doc_Dev/AUDIT_ET_AMELIORATIONS.md` : Audit technique
- `Doc_Dev/CI_GIT_WORKFLOW.md` : Git workflow + CI GitHub/Docker

---

## 🔁 Workflow Git & CI

Pour le détail complet, voir `Doc_Dev/CI_GIT_WORKFLOW.md`.

Résumé rapide :
- Branches : `main` (stable), `dev` (intégration), `feature/...`, `fix/...`
- Conventions de commit : **Conventional Commits** (`feat(...)`, `fix(...)`, etc.)
- Releases : bump version → merge `dev` → `main` → tag `vX.Y.Z` → GitHub Actions

---

## 🧪 Check-list Dev avant commit

- TypeScript OK (pas d'erreurs de compilation)
- Lint de base OK
- Pas de logs `console.log`/`console.error` oubliés
- Pas de secrets/URL sensibles ajoutés en dur
- Docs mises à jour si :
  - nouvelle route API
  - nouveau plugin
  - changement de comportement visible

---

**Bon développement ! 🚀**

