# MynetworK - Multi-Source Network Dashboard

<div align="center">

<img src="src/icons/logo_mynetwork.svg" alt="MynetworK" width="96" height="96" />

![MynetworK](https://img.shields.io/badge/MynetworK-0.1.12-blue?style=for-the-badge)
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

**MynetworK** est un dashboard unifié permettant de gérer et surveiller plusieurs sources de données réseau local via:

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
    container_name: MynetworK
    restart: unless-stopped

    ports:
      - "${DASHBOARD_PORT:-7505}:3000"

    environment:
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production-please-use-strong-secret}
      # IMPORTANT : Ne JAMAIS utiliser la valeur par défaut en production !
      #
      # Pour générer un secret sécurisé (minimum 32 caractères) :
      #   Linux/Mac:   openssl rand -base64 32
      #   PowerShell:  [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

      - CONFIG_FILE_PATH=${CONFIG_FILE_PATH:-/app/config/mynetwork.conf}
      #  Host root path used to read real host metrics when running in Docker
      #  The corresponding filesystem mount is configured in the volumes section below.
      - HOST_ROOT_PATH=${HOST_ROOT_PATH:-/host}
        
      - FREEBOX_HOST=${FREEBOX_HOST:-mafreebox.freebox.fr}
      - FREEBOX_TOKEN_FILE=/app/data/freebox_token.json      
      # PUBLIC_URL: Optionnel - URL publique d'accès au dashboard
      # - Nécessaire uniquement si vous utilisez nginx (reverse proxy)
      # - Sans nginx, l'application fonctionne sans cette variable
      # - Décommentez et configurez si vous utilisez nginx :
      # - PUBLIC_URL=${PUBLIC_URL:-http://domaine.com}


    volumes:
      #  Mount external configuration database and token file
      - ./data:/app/data
      - /:/host:ro
      #  Mount host filesystem (read-only) to access real host metrics
      - /proc:/host/proc:ro
      #  Mount host filesystem (read-only) to access real host metrics
      - /sys:/host/sys:ro
      #  Mount Docker socket to enable Docker version detection
      - /var/run/docker.sock:/var/run/docker.sock:ro

    # Network capabilities required for network scanning (ping, arp)
    # NET_RAW: Required to send ICMP packets (ping) - allows non-root user to use ping
    # NET_ADMIN: Required for some network operations and ARP table access
    cap_add:
      - NET_RAW
      - NET_ADMIN

    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

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

**✅ Recommandation :** Utilisez le **[Fichier .env](#configuration-sécurisée-de-jwt_secret)** (fichier `.env` à la racine) qui fonctionne automatiquement sans configuration supplémentaire. Docker Compose lit le fichier `.env` et injecte `JWT_SECRET` dans `process.env.JWT_SECRET`.

> 💡 **Plus d'informations :** Consultez la section [🔒 Configuration sécurisée de JWT_SECRET](#configuration-sécurisée-de-jwt_secret) ci-dessous pour toutes les méthodes de configuration, les bonnes pratiques de sécurité et la vérification.

Le dashboard sera accessible sur :
- **http://localhost:7505** - depuis la machine hôte
- **http://IP_DU_SERVEUR:7505** - depuis un autre appareil du réseau

<details>
<summary><strong>⚙️ Configuration Avancées</strong></summary>
 

### Optionnel: Fichier de configuration externe (`.conf`)

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
<details id="configuration-sécurisée-de-jwt_secret">
<summary><strong>🔒 Configuration sécurisée de JWT_SECRET</strong></summary>

**⚠️ CRITIQUE : Sécurité** - Le secret JWT par défaut (`change-me-in-production-please-use-strong-secret`) est utilisé **uniquement pour le développement**. En production, vous **DEVEZ** définir une variable d'environnement `JWT_SECRET` avec une valeur unique et sécurisée.

#### 🔐 Pourquoi c'est important ?

Le `JWT_SECRET` est utilisé pour signer et vérifier les tokens d'authentification JWT. Si un secret faible ou par défaut est utilisé, un attaquant pourrait :
- **Forger des tokens JWT valides** et se faire passer pour n'importe quel utilisateur
- **Accéder à votre système sans authentification** (accès admin complet)
- **Compromettre la sécurité de tous les utilisateurs** et leurs données
- **Modifier les permissions** et accéder à des fonctionnalités restreintes

#### 📍 Où le secret est utilisé dans l'application ?

Le `JWT_SECRET` est chargé au démarrage du serveur dans `server/services/authService.ts` :
- Il est lu depuis la variable d'environnement `process.env.JWT_SECRET`
- Si non défini, la valeur par défaut `change-me-in-production-please-use-strong-secret` est utilisée
- L'application vérifie au démarrage si le secret par défaut est utilisé et affiche un avertissement dans les logs
- Le secret est utilisé pour signer les tokens lors de la connexion et vérifier leur validité lors des requêtes authentifiées

#### 🎯 Méthodes de configuration (par ordre de préférence)

##### 1. **Fichier `.env` (Recommandé pour la production)** {#1-fichier-env-recommandé-pour-la-production}

Docker Compose lit automatiquement le fichier `.env` à la racine du projet.

**Étapes :**

1. **Générer un secret sécurisé** (minimum 32 caractères) :

   ```bash
   # Linux/Mac :
   openssl rand -base64 32
   
   # Windows PowerShell :
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   ```

2. **Créer un fichier `.env`** à la racine du projet :

   ```bash
   # .env
   JWT_SECRET=votre_secret_genere_ici_minimum_32_caracteres
   
   # Autres variables optionnelles
   DASHBOARD_PORT=7505
   FREEBOX_HOST=mafreebox.freebox.fr
   PUBLIC_URL=https://mynetwork.example.com
   ```

3. **Sécuriser le fichier `.env`** :

   ```bash
   # Linux/Mac : Restreindre les permissions (lecture seule pour le propriétaire)
   chmod 600 .env

   ```

4. **Démarrer avec Docker Compose** :

   ```bash
   docker-compose up -d
   ```

   Docker Compose lira automatiquement le fichier `.env` et injectera `JWT_SECRET` dans le conteneur.

##### 2. **Fichier `.env` avec `--env-file` (Alternative)**

Si vous préférez utiliser un fichier avec un nom différent :

```bash
# Créer un fichier .env.production
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env.production

# Utiliser --env-file lors du démarrage
docker-compose --env-file .env.production up -d
```

**✅ Recommandation :** Utilisez la **[méthode 1](#1-fichier-env-recommandé-pour-la-production)** (fichier `.env` à la racine) qui fonctionne automatiquement sans configuration supplémentaire. Docker Compose lit le fichier `.env` et injecte `JWT_SECRET` dans `process.env.JWT_SECRET`.

#### ✅ Vérification de la configuration

Après le démarrage, vérifiez que le secret personnalisé est utilisé :

```bash
# Vérifier les logs pour les avertissements
docker-compose logs | grep -i "jwt\|secret"

# Si vous voyez un avertissement comme :
# "⚠️ Using default JWT secret. Please set JWT_SECRET environment variable in production!"
# Cela signifie que JWT_SECRET n'a pas été correctement configuré.
```

**Vérification dans l'interface web :**

1. Connectez-vous au dashboard
2. Allez dans **Administration > Sécurité**
3. Vérifiez la section "Configuration JWT" - elle indiquera si le secret par défaut est utilisé

#### 🛡️ Bonnes pratiques de sécurité

1. **Longueur minimale** : Utilisez un secret d'au moins **32 caractères** (recommandé : 64 caractères)
2. **Complexité** : Utilisez des caractères aléatoires (pas de mots de passe prévisibles)
3. **Unicité** : Chaque instance de production doit avoir son propre secret unique
4. **Stockage sécurisé** :
   - ✅ Fichier `.env` avec permissions restreintes (`chmod 600`)
   - ✅ Ajouter `.env` au `.gitignore` (ne jamais commiter le secret)
   - ✅ Utiliser un gestionnaire de secrets (HashiCorp Vault, AWS Secrets Manager, etc.) pour les déploiements critiques
5. **Rotation** : Changez le secret régulièrement (tous les 6-12 mois) ou en cas de compromission suspectée
6. **Séparation dev/prod** : Utilisez des secrets différents pour le développement et la production
7. **Backup sécurisé** : Si vous sauvegardez le secret, stockez-le dans un endroit sécurisé et chiffré

#### 🔄 Rotation du secret JWT

Si vous devez changer le secret JWT :

1. **Générer un nouveau secret** :
   ```bash
   openssl rand -base64 32
   ```

2. **Mettre à jour le fichier `.env`** :
   ```bash
   JWT_SECRET=nouveau_secret_genere
   ```

3. **Redémarrer le conteneur** :
   ```bash
   docker-compose restart
   ```

4. **⚠️ Important** : Tous les utilisateurs devront se reconnecter car leurs tokens existants seront invalidés.

#### 📝 Exemple de fichier `.env` complet

```bash
# .env - Configuration sécurisée pour la production
 
# Secret JWT (généré avec : openssl rand -base64 32)
JWT_SECRET=aB3xK9mP2vQ7wR5tY8uI0oP1aS6dF4gH7jK2lM9nB0vC3xZ6qW8eR1tY3uI5oP7aS9dF2gH4jK6lM8nB0vC2xZ4

# Port du dashboard (optionnel, défaut: 7505)
DASHBOARD_PORT=7505

# Host Freebox (optionnel, défaut: mafreebox.freebox.fr)
FREEBOX_HOST=mafreebox.freebox.fr

# URL publique (optionnel, pour reverse proxy)
PUBLIC_URL=https://mynetwork.example.com
```

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
