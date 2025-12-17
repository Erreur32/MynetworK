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

Variables minimales (voir `DOCUMENTATION_STOCKAGE.md`) :
- `PORT` (backend, ex : 3003)
- `DASHBOARD_PORT` (port exposé par Docker)
- `JWT_SECRET` (minimum 32 caractères en prod)
- `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_PASSWORD`

---

## 🏃 Lancer en Développement

```bash
# Backend + frontend ensemble
npm run dev

# OU séparément
npm run dev:server   # backend sur http://localhost:3003
npm run dev:client   # frontend sur http://localhost:5173
```

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

