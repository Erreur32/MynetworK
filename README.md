# MynetworK - Multi-Source Network Dashboard

<div align="center">

<img src="src/icons/logo_mynetwork.svg" alt="MynetworK" width="96" height="96" />

![MynetworK](https://img.shields.io/badge/MynetworK-0.1.4-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-DEVELOPMENT-orange?style=for-the-badge)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?style=for-the-badge&logo=docker)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io%2Ferreur32%2Fmynetwork-blue?logo=docker)](https://github.com/erreur32/mynetwork/pkgs/container/mynetwork)
[![Build and Publish Docker Image](https://github.com/Erreur32/MynetworK/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/Erreur32/MynetworK/actions/workflows/docker-publish.yml)
![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**Un dashboard multi-sources moderne pour gérer Freebox, UniFi et vos réseaux**

[Installation](#installation) | [Fonctionnalités](#fonctionnalités) | [Configuration](#configuration) | [Documentation](#-documentation)

</div>

---

> **Version DEV** - Ce projet est en cours de développement actif. Des bugs peuvent être présents et certaines fonctionnalités peuvent ne pas fonctionner comme prévu.

## 🎯 Vue d'ensemble

**MynetworK** est un dashboard unifié permettant de gérer et surveiller plusieurs sources de données réseau via un système de plugins modulaire :

- **Freebox** - Gestion complète de votre Freebox (Ultra, Delta, Pop)
- **UniFi Controller** - Surveillance et gestion de votre infrastructure UniFi
- **Scan Réseau** - Détection et analyse des appareils réseau (à venir)

### ✨ Caractéristiques principales

- 🔐 **Authentification utilisateur** - Système JWT avec gestion des rôles (admin, user, viewer)
- 🔌 **Système de plugins** - Architecture modulaire pour ajouter facilement de nouvelles sources
- 📊 **Dashboard unifié** - Visualisation centralisée des données de tous les plugins
- 📝 **Logging complet** - Traçabilité de toutes les actions avec filtres avancés
- 👥 **Gestion des utilisateurs** - Interface d'administration pour gérer les accès
- 🐳 **Docker Ready** - Déploiement simplifié avec Docker Compose

## 🚀 Installation

### Prérequis

- Docker et Docker Compose
- Accès au réseau local pour Freebox/UniFi

### docker-compose.yml

```yaml
services:
  mynetwork:
    image: ghcr.io/erreur32/mynetwork:latest
    container_name: mynetwork
    restart: unless-stopped

    # Port mapping: host:container
    ports:
      - "${DASHBOARD_PORT:-7505}:3000"

    # Environment configuration
    environment:
      - NODE_ENV=production
      - PORT=3000
      # PUBLIC_URL: Optionnel - URL publique d'accès au dashboard
      # - Nécessaire uniquement si vous utilisez nginx (reverse proxy)
      # - Sans nginx, l'application fonctionne sans cette variable
      # - PUBLIC_URL=${PUBLIC_URL:-http://domaine.com}
      - FREEBOX_HOST=${FREEBOX_HOST:-mafreebox.freebox.fr}
      - FREEBOX_TOKEN_FILE=/app/data/freebox_token.json
      # ⚠️ SECURITE : Définissez JWT_SECRET via variable d'environnement
      # Ne jamais utiliser la valeur par défaut en production !
      # Voir section "Configuration sécurisée de JWT_SECRET" ci-dessous pour les exemples
      - JWT_SECRET=${JWT_SECRET:-change_me_in_production}
      # Optional: External config file path
      - CONFIG_FILE_PATH=${CONFIG_FILE_PATH:-/app/config/mynetwork.conf}
      # Host root path used to read real host metrics when running in Docker
      - HOST_ROOT_PATH=${HOST_ROOT_PATH:-/host}

    # Persistent storage for Freebox API token, database, and config
    volumes:
      - mynetwork_data:/app/data
      # Optional: Mount external configuration file
      # - ./config/mynetwork.conf:/app/config/mynetwork.conf:ro
      # Mount the host root filesystem read-only for system information
      - /:/host:ro
      # Mount /proc and /sys from host to access host system information
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      # Mount Docker socket to enable Docker version detection
      - /var/run/docker.sock:/var/run/docker.sock:ro

    # Network mode options:
    # Option 1: Bridge mode (default) - uses port mapping
    # Option 2: Host mode - direct network access (uncomment below)
    # network_mode: host

    # Health check
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

    # Resource limits (optional)
    # deploy:
    #   resources:
    #     limits:
    #       cpus: '0.5'
    #       memory: 512M
    #     reservations:
    #       cpus: '0.1'
    #       memory: 256M

# Named volume for persistent token storage, database, and config
volumes:
  mynetwork_data:
    name: mynetwork_data
```

**Lancement :**

```bash
# Lancer avec Docker Compose
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down

# Mettre à jour l'image
docker-compose pull
docker-compose up -d
```

Le dashboard sera accessible sur :
- **http://localhost:7505** - depuis la machine hôte
- **http://IP_DU_SERVEUR:7505** - depuis un autre appareil du réseau

<details>
<summary><strong>⚙️ Configuration Avancées</strong></summary>

#### Variables d'environnement

Pour la configuration Docker, voir la section [Variables d'environnement Docker](#variables-denvironnement-docker) ci-dessous.

Pour la configuration en mode développement, voir [DEV/README-DEV.md](DEV/README-DEV.md).

#### Fichier de configuration externe (`.conf`)

Vous pouvez utiliser un fichier `.conf` externe pour gérer la configuration :

1. **Créer le fichier de configuration :**
   ```bash
   cp config/mynetwork.conf.example config/mynetwork.conf
   # Éditez config/mynetwork.conf selon vos besoins
   ```

2. **Monter le fichier dans Docker :**
   Décommentez la ligne dans `docker-compose.yml` :
   ```yaml
   volumes:
     - mynetwork_data:/app/data
     - ./config/mynetwork.conf:/app/config/mynetwork.conf:ro
   ```

3. **Synchronisation automatique :**
   - Au démarrage, si le fichier `.conf` existe → Import dans la base de données
   - Si le fichier n'existe pas → Export de la configuration actuelle

4. **API Endpoints :**
   - `GET /api/config/export` - Exporter la configuration actuelle
   - `POST /api/config/import` - Importer depuis un fichier
   - `GET /api/config/file` - Vérifier le statut du fichier
   - `POST /api/config/sync` - Synchroniser manuellement

#### Configuration nginx (Reverse Proxy)

Si vous utilisez **nginx** comme reverse proxy devant MynetworK, vous devez configurer `PUBLIC_URL` pour pointer vers l'URL publique (via nginx) plutôt que directement vers le conteneur Docker.

**Cas 1 : Sans nginx (accès direct)**

Aucune configuration `PUBLIC_URL` nécessaire. L'application fonctionne directement sur le port mappé (ex: `http://VOTRE_IP:7505`).

**Cas 2 : Avec nginx (reverse proxy)**

1. **Configuration nginx** : Voir le fichier `Docs/nginx.example.conf` pour un exemple complet.

2. **Configuration docker-compose.yml** :
   ```yaml
   environment:
     # URL publique via nginx (HTTP)
     - PUBLIC_URL=http://mynetwork.example.com
     
     # OU avec HTTPS
     # - PUBLIC_URL=https://mynetwork.example.com
   ```

3. **Exemple de configuration nginx minimale** :
   ```nginx
   server {
       listen 80;
       server_name mynetwork.example.com;
       
       location / {
           proxy_pass http://192.168.1.150:7505;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

4. **Avantages d'utiliser nginx** :
   - SSL/HTTPS facile (Let's Encrypt)
   - Gestion de plusieurs services sur le même serveur
   - Cache et compression
   - URLs propres (sans port)

**Note** : Le fichier `Docs/nginx.example.conf` contient une configuration complète avec support HTTP et HTTPS.

</details>



## 📋 Première connexion

1. Accédez au dashboard (http://localhost:7505 ou votre IP)
2. Connectez-vous avec les identifiants par défaut :
   - **Username** : `admin`
   - **Password** : `admin123`
3. ⚠️ **Changez le mot de passe immédiatement après la première connexion !**
4. Configurez vos plugins dans la page **Plugins**

<details>
<summary><strong>🎨 Fonctionnalités</strong></summary>

### Dashboard Principal
- **Statistiques multi-sources** - Visualisation unifiée des données de tous les plugins
- **Graphiques en temps réel** - Débits, connexions, statistiques
- **Vue d'ensemble réseau** - État global de votre infrastructure

### Gestion des Plugins
- **Configuration centralisée** - Interface pour configurer chaque plugin
- **Activation/Désactivation** - Contrôle fin de chaque source de données
- **Statut de connexion** - Vérification de l'état de chaque plugin

### Freebox (Plugin)
- **Dashboard complet** - Toutes les fonctionnalités Freebox (WiFi, LAN, Downloads, VMs, TV, Phone)
- **Compatibilité** - Ultra, Delta, Pop
- **API native** - Utilisation de l'API officielle Freebox OS

### UniFi Controller (Plugin)
- **Surveillance réseau** - Statistiques des points d'accès, clients, trafic
- **Gestion des sites** - Support multi-sites UniFi
- **Données en temps réel** - Mise à jour automatique des statistiques
- **Support dual API** - Controller Local (node-unifi) et Site Manager API (cloud)
- **Badges de stats** - Affichage des stats système dans le header (débit, uptime, devices)

### Gestion des Utilisateurs (Admin)
- **CRUD complet** - Création, modification, suppression d'utilisateurs
- **Gestion des rôles** - Attribution des permissions (admin, user, viewer)
- **Sécurité** - Mots de passe hashés avec bcrypt

### Logs d'Activité (Admin)
- **Traçabilité complète** - Toutes les actions sont enregistrées
- **Filtres avancés** - Par utilisateur, plugin, action, niveau, période
- **Export** - Possibilité d'exporter les logs (à venir)

</details>


## 🔌 Système de Plugins

MynetworK utilise une architecture modulaire basée sur des plugins pour permettre l'ajout facile de nouvelles sources de données.

### Plugins disponibles

- **Freebox** - Intégration complète avec l'API Freebox OS
- **UniFi Controller** - Surveillance et gestion UniFi
- **Scan Réseau** - Scanner réseau (à venir)

Pour créer un nouveau plugin ou comprendre l'architecture, voir [DEV/ARCHITECTURE_PLUGINS.md](DEV/ARCHITECTURE_PLUGINS.md).


<details>
<summary><strong>🏗️ Architecture</strong></summary>

MynetworK utilise une architecture modulaire avec :
- **Frontend React** (TypeScript) - Interface utilisateur moderne
- **Backend Express** (TypeScript) - API REST et WebSocket
- **Base de données SQLite** - Stockage des configurations et données
- **Système de plugins** - Architecture extensible pour ajouter de nouvelles sources

Pour plus de détails sur l'architecture, voir [DEV/ARCHITECTURE_PLUGINS.md](DEV/ARCHITECTURE_PLUGINS.md).

</details>



<details>
<summary><strong>📚 Documentation</strong></summary>

### Pour les Utilisateurs

- **[CHANGELOG.md](CHANGELOG.md)** - Journal des changements et nouvelles fonctionnalités

### Pour les Développeurs

Consultez **[DEV/README-DEV.md](DEV/README-DEV.md)** pour toute la documentation de développement.

**Documentation principale** :
- **[DEV/DOCUMENTATION.md](DEV/DOCUMENTATION.md)** - Index complet de la documentation
- **[DEV/GUIDE_DEVELOPPEMENT.md](DEV/GUIDE_DEVELOPPEMENT.md)** - Guide pour développeurs
- **[DEV/ARCHITECTURE_PLUGINS.md](DEV/ARCHITECTURE_PLUGINS.md)** - Architecture détaillée du système de plugins

</details>

## 🔒 Sécurité

- **Authentification JWT** - Tokens sécurisés avec expiration
- **Hash des mots de passe** - bcrypt avec salt rounds
- **Middleware d'authentification** - Protection des routes sensibles
- **Logging des actions** - Traçabilité complète
- **Gestion des rôles** - Permissions granulaires

## 🐳 Docker

### Variables d'environnement Docker

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DASHBOARD_PORT` | `7505` | Port d'accès au dashboard |
| `PORT` | `3000` | Port du serveur backend (dans le conteneur) |
| `JWT_SECRET` | (généré) | Secret JWT (changez en production !) |
| `FREEBOX_HOST` | `mafreebox.freebox.fr` | Hostname Freebox |
| `PUBLIC_URL` | - | URL publique d'accès (pour nginx, etc.) |
| `HOST_ROOT_PATH` | `/host` | Chemin du système de fichiers hôte monté |

<details>
<summary><strong>🔒 Configuration sécurisée de JWT_SECRET</strong></summary>

**⚠️ IMPORTANT : Sécurité** - Le secret JWT par défaut est utilisé uniquement pour le développement. En production, vous **DEVEZ** définir une variable d'environnement `JWT_SECRET` avec une valeur unique et sécurisée.

#### Pourquoi c'est important ?

Le `JWT_SECRET` est utilisé pour signer et vérifier les tokens d'authentification. Si un secret faible ou par défaut est utilisé, un attaquant pourrait :
- Forger des tokens JWT valides
- Accéder à votre système sans authentification
- Compromettre la sécurité de tous les utilisateurs

#### Méthode 1 : Utiliser un fichier `.env` (Recommandé)

Créez un fichier `.env` à la racine du projet :

```bash
# Générer un secret sécurisé (minimum 32 caractères)
# Sur Linux/Mac :
openssl rand -base64 32

# Sur Windows PowerShell :
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Ajoutez dans votre fichier .env :
JWT_SECRET=votre_secret_genere_aleatoirement_ici_minimum_32_caracteres
```

Ensuite, lancez Docker Compose avec le fichier `.env` :

```bash
docker-compose --env-file .env up -d
```

#### Méthode 2 : Définir directement dans la ligne de commande

```bash
# Générer un secret (voir commandes ci-dessus)
# Puis lancer avec :
JWT_SECRET=votre_secret_genere_aleatoirement docker-compose up -d
```

#### Méthode 3 : Utiliser les variables d'environnement système

```bash
# Sur Linux/Mac :
export JWT_SECRET=$(openssl rand -base64 32)
docker-compose up -d

# Sur Windows PowerShell :
$env:JWT_SECRET = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
docker-compose up -d
```

#### Exemple complet avec docker-compose.yml

```yaml
services:
  mynetwork:
    image: ghcr.io/erreur32/mynetwork:latest
    environment:
      # ⚠️ SECURITE : Définissez JWT_SECRET via variable d'environnement
      # Ne jamais utiliser la valeur par défaut en production !
      # Exemple de génération : openssl rand -base64 32
      - JWT_SECRET=${JWT_SECRET:-change_me_in_production}
```

**Note** : Le fichier `.env` ne doit **JAMAIS** être commité dans Git. Assurez-vous qu'il est dans votre `.gitignore`.

#### Vérification

Après le démarrage, vérifiez les logs pour confirmer que le secret personnalisé est utilisé :

```bash
docker-compose logs | grep -i "jwt\|secret"
```

Si vous voyez un avertissement concernant le secret par défaut, cela signifie que `JWT_SECRET` n'a pas été correctement configuré.

</details>

### Commandes Docker utiles

```bash
# Voir les logs
docker-compose logs -f

# Redémarrer
docker-compose restart

# Arrêter
docker-compose down

# Mettre à jour
docker-compose pull
docker-compose up -d
```

## 🤝 Contribution

Les contributions sont les bienvenues !

### Guidelines

- Respectez le style de code existant (4 espaces, camelCase, commentaires en anglais)
- Ajoutez des types TypeScript pour tout nouveau code
- Testez vos modifications avant de soumettre
- Documentez les nouvelles fonctionnalités
- Suivez les règles définies dans les fichiers de règles du projet

## 📝 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 🙏 Remerciements

### Projet Original

Ce projet s'inspire fortement du projet **Freebox OS Ultra Dashboard** créé par [HGHugo](https://github.com/HGHugo/FreeboxOS-Ultra-Dashboard). Nous remercions chaleureusement l'auteur original pour son excellent travail qui a servi de base et d'inspiration pour MynetworK.

**Projet original** : [FreeboxOS-Ultra-Dashboard](https://github.com/HGHugo/FreeboxOS-Ultra-Dashboard)

### Autres Remerciements

- [Free](https://www.free.fr) pour la Freebox et son API ouverte
- [Freebox SDK](https://dev.freebox.fr) pour la documentation API
- [Ubiquiti](https://www.ui.com) pour UniFi
- La communauté open source pour les excellentes bibliothèques utilisées

---

<div align="center">

**Fait avec ❤️ pour la gestion multi-sources de réseaux**

**MynetworK - Multi-Source Network Dashboard**

</div>
