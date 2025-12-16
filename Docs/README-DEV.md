# Documentation Développement - MynetworK

Ce dossier contient toute la documentation technique et de développement pour **MynetworK**.

---

## 🚀 Installation en Mode Développement

### Prérequis

- **Node.js 20.x ou 22.x** (recommandé)
- **npm** ou **yarn**
- Accès au réseau local pour Freebox/UniFi

### Installation Locale

```bash
# Cloner le dépôt GitHub
git clone https://github.com/erreur32/mynetwork.git
cd mynetwork

# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev
```

**URLs de développement** :
- **Frontend** : http://localhost:5173 (Vite HMR)
- **Backend API** : http://localhost:3003

### Build Local avec Docker (Développement)

Pour builder l'image Docker localement, utilisez `docker-compose.local.yml` :

```bash
# Build et lancer
docker-compose -f docker-compose.local.yml up -d --build
```

Voir `docker-compose.local.yml` pour plus de détails.

---

## 🛠️ Mode Développement

### Scripts Disponibles

```bash
npm run dev              # Développement (frontend + backend)
npm run dev:client       # Frontend uniquement
npm run dev:server       # Backend uniquement
npm run build            # Build production
npm start                # Production
```

### Configuration en Développement

Créez un fichier `.env` à la racine du projet :

```env
# Ports
PORT=3003
DASHBOARD_PORT=7505

# JWT Secret (changez en production !)
JWT_SECRET=votre_secret_jwt_tres_securise

# Freebox (optionnel)
FREEBOX_HOST=mafreebox.freebox.fr

# Configuration file (optionnel)
CONFIG_FILE_PATH=./config/mynetwork.conf
```

**Note** : En mode développement, la base de données est stockée dans `./data/dashboard.db` (local, pas dans Git).

---

## 📡 Structure des Routes API

| Route | Description | Auth |
|-------|-------------|------|
| `/api/health` | Health check | Non |
| `/api/users/login` | Connexion utilisateur | Non |
| `/api/users/me` | Informations utilisateur | Oui |
| `/api/users` | Liste des utilisateurs | Admin |
| `/api/plugins` | Liste des plugins | Oui |
| `/api/plugins/:id/stats` | Statistiques d'un plugin | Oui |
| `/api/logs` | Consultation des logs | Admin |
| `/api/config/export` | Exporter la configuration | Admin |
| `/api/config/import` | Importer la configuration | Admin |
| `/api/metrics/config` | Configuration métriques | Admin |
| `/api/system/server` | Informations système serveur | Oui |

---


**Image Docker disponible :**
- **Registry** : `ghcr.io/erreur32/mynetwork`
- **Tags disponibles** : `latest`, `main`, `2.0.0-dev` (et autres versions)
- **Lien direct** : [https://github.com/erreur32/mynetwork/pkgs/container/mynetwork](https://github.com/erreur32/mynetwork/pkgs/container/mynetwork)

**Pull direct de l'image :**

```bash
# Si le dépôt est privé, login d'abord
docker login ghcr.io -u erreur32

# Pull l'image latest
docker pull ghcr.io/erreur32/mynetwork:latest

# Ou une version spécifique
docker pull ghcr.io/erreur32/mynetwork:2.0.0-dev
```


---

## 🏗️ Architecture Détaillée

```
MynetworK/
├── src/                          # Frontend React
│   ├── api/                      # Client API
│   ├── components/
│   │   ├── layout/               # Header, Footer
│   │   ├── modals/               # Modals (Login, Configuration)
│   │   ├── ui/                   # Composants réutilisables
│   │   └── widgets/              # Widgets du dashboard
│   ├── pages/                    # Pages (Dashboard, Plugins, Users, Logs)
│   ├── stores/                   # State management (Zustand)
│   └── utils/                    # Utilitaires
│
├── server/                       # Backend Express
│   ├── database/                 # Base de données SQLite
│   │   ├── connection.ts         # Connexion DB
│   │   └── models/               # Modèles (User, Log, PluginConfig)
│   ├── plugins/                  # Système de plugins
│   │   ├── base/                 # Interface et classe de base
│   │   ├── freebox/              # Plugin Freebox
│   │   └── unifi/                # Plugin UniFi
│   ├── middleware/               # Middlewares (auth, logging)
│   ├── routes/                   # Routes API
│   │   ├── users.ts              # Authentification utilisateur
│   │   ├── plugins.ts            # Gestion des plugins
│   │   └── logs.ts               # Consultation des logs
│   ├── services/                 # Services métier
│   │   ├── authService.ts        # Authentification JWT
│   │   ├── loggingService.ts     # Logging
│   │   └── pluginManager.ts      # Gestionnaire de plugins
│   └── config.ts                 # Configuration
│
├── data/                         # Données persistantes (dev uniquement)
│   └── dashboard.db              # Base de données SQLite
│
├── docker-compose.yml            # Configuration Docker (production)
├── docker-compose.local.yml      # Configuration Docker (dev)
└── package.json
```

### Système de Plugins

MynetworK utilise une architecture modulaire basée sur des plugins. Chaque plugin implémente l'interface `IPlugin` :

```typescript
interface IPlugin {
  id: string;
  name: string;
  version: string;
  initialize(settings: any): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStats(): Promise<any>;
}
```

Pour créer un nouveau plugin, voir [ARCHITECTURE_PLUGINS.md](ARCHITECTURE_PLUGINS.md).

---

## 📚 Documentation Principale

### Guides Essentiels
- **[DOCUMENTATION.md](DOCUMENTATION.md)** - Index complet de la documentation
- **[GUIDE_DEVELOPPEMENT.md](GUIDE_DEVELOPPEMENT.md)** - Guide pour développeurs
- **[ARCHITECTURE_PLUGINS.md](ARCHITECTURE_PLUGINS.md)** - Architecture détaillée du système de plugins
- **[GUIDE_TEST_BACKEND.md](GUIDE_TEST_BACKEND.md)** - Guide de test du backend
- **[GUIDE_TEST_UI.md](GUIDE_TEST_UI.md)** - Guide de test de l'interface

### CI/CD et Déploiement
- **[CI_GITHUB_DOCKER.md](CI_GITHUB_DOCKER.md)** - Configuration GitHub Actions et Docker
- **[CI_FORGEJO_DOCKER.md](CI_FORGEJO_DOCKER.md)** - Configuration Forgejo (alternative)

### Guides Spécifiques
- **[GUIDE_PORTS.md](GUIDE_PORTS.md)** - Configuration des ports
- **[GUIDE_MIGRATION_CONSTRUCTION.md](GUIDE_MIGRATION_CONSTRUCTION.md)** - Guide de migration
- **[DOCUMENTATION_STOCKAGE.md](DOCUMENTATION_STOCKAGE.md)** - Documentation sur le stockage
- **[GUIDE_GIT_WORKFLOW.md](GUIDE_GIT_WORKFLOW.md)** - Workflow Git, tags, branches et releases

### Progression et Planification
- **[ROADMAP.md](ROADMAP.md)** - Feuille de route et prochaines étapes
- **[PROGRESSION_PROJET.md](PROGRESSION_PROJET.md)** - État actuel et progression

## 📝 Documents de Référence (Historique)

### CI/CD avec GitHub Actions

L'image Docker est automatiquement buildée et publiée sur **GitHub Container Registry** (`ghcr.io`) à chaque `push` sur `main`.

- **Workflow** : `.github/workflows/docker-publish.yml`
- **Registry** : `ghcr.io/erreur32/mynetwork`
- **Tags disponibles** : `latest`, `main`, `2.0.0-dev` (et autres versions)
- **Lien** : [https://github.com/erreur32/mynetwork/pkgs/container/mynetwork](https://github.com/erreur32/mynetwork/pkgs/container/mynetwork)
- **Documentation** : Voir [DEV/CI_GITHUB_DOCKER.md](DEV/CI_GITHUB_DOCKER.md) pour les détails complets

**Pull de l'image :**

```bash
docker pull ghcr.io/erreur32/mynetwork:latest
```

### Variables d'environnement

#### Mode Développement (npm)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `3003` | Port du serveur backend |
| `SERVER_PORT` | `3003` | Port du serveur backend (alias) |
| `VITE_PORT` | `5173` | Port du frontend Vite |
| `JWT_SECRET` | - | Secret JWT (optionnel en dev) |
| `DATABASE_PATH` | `./data/dashboard.db` | Chemin de la base de données |
| `CONFIG_FILE_PATH` | `./config/mynetwork.conf` | Chemin du fichier de config |
| `DEFAULT_ADMIN_USERNAME` | `admin` | Username admin par défaut |
| `DEFAULT_ADMIN_PASSWORD` | `admin123` | Password admin par défaut |

#### Mode Production (Docker)

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DASHBOARD_PORT` | `7505` | Port d'accès au dashboard (hôte) |
| `PORT` | `3000` | Port du serveur backend (conteneur) |
| `JWT_SECRET` | (généré) | Secret JWT (changez en production !) |
| `FREEBOX_HOST` | `mafreebox.freebox.fr` | Hostname Freebox |
| `PUBLIC_URL` | - | URL publique d'accès (pour nginx, etc.) |
| `HOST_ROOT_PATH` | `/host` | Chemin du système de fichiers hôte monté |
| `CONFIG_FILE_PATH` | `/app/config/mynetwork.conf` | Chemin du fichier de config |


Les fichiers suivants sont conservés pour référence historique mais peuvent être obsolètes :

- `VALIDATIONS_FINALES.md` - Validations finales (implémenté, conservé pour référence)
- `AUDIT_ET_AMELIORATIONS.md` - Audit et améliorations
- `SYNTHESE_PROJET.md` - Synthèse du projet
- `ROLLBACK_GUIDE.md` - Guide de rollback

### Notes de Développement
- `Aide` - Notes de commandes UniFi
- `Aide_screen` - Notes de développement
- `Aide_token` - Exemples de tokens et authentification
- `Aide_Unifi` - Notes spécifiques UniFi

**Note** : Les fichiers de planification/validation déjà implémentés ont été supprimés. Voir [CLEANUP_DOCS.md](CLEANUP_DOCS.md) pour les détails.

## 🛠️ Outils de Développement

### Scripts Shell (à la racine du projet)

Les scripts `.sh` à la racine sont des **outils de développement/debug** et ne sont **pas utilisés** par l'application en production :

- **`test-backend.sh`** : Script de test automatisé du backend API (voir [GUIDE_TEST_BACKEND.md](GUIDE_TEST_BACKEND.md))
- **`unifi.sh`** : Toolbox CLI UniFi (clients, switches, wifi, recherche, export)
- **`unifi_script.sh`** : Outil API UniFi avec gestion de session/cookie
- **`unifi_token.sh`** : Génération de token UniFi
- **`unifi_token_interactif.sh`** : Version interactive du générateur de token
- **`unitfi_test.sh`** : Test complet de l'API UniFi
- **`scripts/update-version.sh`** : Script pour mettre à jour la version dans tous les fichiers

**Note** : Ces scripts contiennent des credentials en dur et sont destinés uniquement au développement local. Ils ne sont **pas inclus** dans l'image Docker.

### Scripts NPM

```bash
npm run dev              # Développement (frontend + backend)
npm run dev:client       # Frontend uniquement (Vite)
npm run dev:server       # Backend uniquement (tsx watch)
npm run build            # Build production
npm start                # Production
npm run preview          # Preview du build production
```

### Ports en Développement

| Service | Port | Variable d'Environnement |
|---------|------|-------------------------|
| Frontend (Vite) | `5173` | `VITE_PORT` |
| Backend (Express) | `3003` | `PORT` ou `SERVER_PORT` |

Voir [GUIDE_PORTS.md](GUIDE_PORTS.md) pour plus de détails.

## 📂 Structure

```
DEV/
├── README-DEV.md               # Ce fichier
├── DOCUMENTATION.md             # Index principal
├── GUIDE_DEVELOPPEMENT.md       # Guide développeur
├── ARCHITECTURE_PLUGINS.md     # Architecture plugins
├── CI_GITHUB_DOCKER.md         # CI/CD GitHub
├── CI_FORGEJO_DOCKER.md        # CI/CD Forgejo
└── [autres fichiers de référence]
```

**Note** : Le dossier `Doc_Dev/` est privé et contient des tokens et documents internes. Il est ignoré par Git (voir `.gitignore`).
