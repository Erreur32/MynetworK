# 📦 Guide d'Installation - MyNetwork + Agent Système Hôte

**Date** : 2025-01-XX  
**Version** : 0.1.15+  
**Statut** : ⚠️ **À venir** - Ce guide décrit les méthodes d'installation qui seront disponibles après l'implémentation de l'agent.

---

## 📋 Vue d'Ensemble

Ce guide explique comment installer **MyNetwork** avec l'**Agent Système Hôte** sur une machine. L'agent permet à MyNetwork d'accéder aux métriques système réelles de la machine hôte (CPU, RAM, Disque, Réseau) même lorsqu'il s'exécute dans un conteneur Docker.

### 🎯 Pourquoi un Agent ?

En Docker, un conteneur est isolé de la machine hôte. L'agent s'exécute sur l'hôte et expose une API REST pour les métriques système, permettant à MyNetwork d'obtenir les vraies statistiques de la machine plutôt que celles du conteneur.

---

## 🔧 Prérequis

### Pour toutes les méthodes :
- **Docker** installé (pour MyNetwork)
- **Docker Compose** installé (méthodes 1 et 2)
- Port **7505** (ou autre) disponible pour MyNetwork
- Port **9999** disponible en localhost pour l'agent

### Pour la méthode 3 uniquement :
- **Node.js 18+** installé
- **npm** installé

---

## 📦 Méthode 1 : Installation Complète avec Docker Compose (Recommandée)

Cette méthode installe **MyNetwork ET l'agent** ensemble dans le même `docker-compose.yml`. C'est la méthode la plus simple et recommandée pour la plupart des cas.

### ✅ Avantages
- ✅ Installation en une seule commande
- ✅ Gestion simplifiée (un seul docker-compose)
- ✅ Dépendances automatiques entre services
- ✅ Configuration centralisée

### 📝 Étapes d'Installation

#### 1. Créer un répertoire de travail

```bash
mkdir -p ~/mynetwork
cd ~/mynetwork
```

#### 2. Créer le fichier `docker-compose.yml`

Copier le contenu du `docker-compose.yml` fourni qui inclut :
- Service `mynetwork` (application principale)
- Service `host-agent` (agent système hôte)

#### 3. Créer le fichier `.env` (optionnel mais recommandé)

```bash
cat > .env << EOF
# Port du dashboard
DASHBOARD_PORT=7505

# Secret JWT (OBLIGATOIRE - générer un secret fort)
JWT_SECRET=votre_secret_jwt_tres_securise_ici

# Configuration Freebox
FREEBOX_HOST=mafreebox.freebox.fr

# URL de l'agent (par défaut, fonctionne avec host.docker.internal)
HOST_AGENT_URL=http://host.docker.internal:9999

# Chemin de configuration
CONFIG_FILE_PATH=/app/config/mynetwork.conf
EOF
```

**⚠️ Important** : Générer un `JWT_SECRET` fort :
```bash
openssl rand -base64 32
```

#### 4. Créer le répertoire de données

```bash
mkdir -p data
```

#### 5. Lancer les services

```bash
docker-compose up -d
```

#### 6. Vérifier que tout fonctionne

```bash
# Vérifier les conteneurs
docker-compose ps

# Vérifier les logs MyNetwork
docker-compose logs mynetwork

# Vérifier les logs de l'agent
docker-compose logs host-agent

# Tester l'agent
curl http://127.0.0.1:9999/health

# Tester MyNetwork
curl http://localhost:7505/api/health
```

#### 7. Accéder à l'interface

Ouvrir dans le navigateur : `http://localhost:7505`

---

## 🔄 Méthode 2 : Installation Séparée (Agent Standalone)

Cette méthode installe l'agent **séparément** de MyNetwork. Utile si :
- MyNetwork est déjà installé
- Vous préférez gérer l'agent indépendamment
- Vous voulez mettre à jour l'agent sans redémarrer MyNetwork

### ✅ Avantages
- ✅ Agent indépendant et isolé
- ✅ Peut être mis à jour séparément
- ✅ Flexibilité de déploiement
- ✅ Peut servir plusieurs instances MyNetwork

### 📝 Étapes d'Installation

#### 1. Créer un répertoire pour l'agent

```bash
mkdir -p ~/mynetwork-agent
cd ~/mynetwork-agent
```

#### 2. Créer le fichier `docker-compose.agent.yml`

Copier le contenu de `host-agent/docker-compose.standalone.yml` :

```yaml
version: '3.8'

services:
  host-agent:
    image: ghcr.io/erreur32/mynetwork-host-agent:latest
    # OU build local:
    # build:
    #   context: ./host-agent
    #   dockerfile: Dockerfile
    container_name: mynetwork-host-agent
    restart: unless-stopped
    network_mode: host  # Accès direct au système
    environment:
      - PORT=9999
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:9999/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

#### 3. Lancer l'agent

```bash
docker-compose -f docker-compose.agent.yml up -d
```

#### 4. Vérifier l'agent

```bash
# Vérifier le conteneur
docker ps | grep host-agent

# Tester l'endpoint health
curl http://127.0.0.1:9999/health

# Tester les stats système
curl http://127.0.0.1:9999/stats/system

# Tester les stats réseau
curl http://127.0.0.1:9999/stats/network
```

#### 5. Configurer MyNetwork pour utiliser l'agent

Dans le répertoire où MyNetwork est installé, modifier le `.env` :

```bash
# Si MyNetwork utilise network_mode: bridge (défaut)
HOST_AGENT_URL=http://host.docker.internal:9999

# OU si MyNetwork utilise network_mode: host
HOST_AGENT_URL=http://127.0.0.1:9999
```

Puis redémarrer MyNetwork :

```bash
cd ~/mynetwork
docker-compose restart mynetwork
```

---

## 💻 Méthode 3 : Agent en Ligne de Commande (Sans Docker)

Cette méthode installe l'agent **directement sur la machine hôte** sans Docker. Utile si :
- Vous préférez ne pas utiliser Docker pour l'agent
- Vous voulez un contrôle total sur le processus
- Vous avez déjà Node.js installé

### ✅ Avantages
- ✅ Pas besoin de Docker pour l'agent
- ✅ Contrôle total sur le processus
- ✅ Performance native (pas de surcharge Docker)
- ✅ Facile à déboguer

### ⚠️ Inconvénients
- ⚠️ Nécessite Node.js installé sur l'hôte
- ⚠️ Gestion manuelle du processus (recommandé PM2)
- ⚠️ Pas de restart automatique sans gestionnaire de processus

### 📝 Étapes d'Installation

#### 1. Installer Node.js (si pas déjà installé)

**Sur Ubuntu/Debian :**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Sur CentOS/RHEL :**
```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

**Vérifier l'installation :**
```bash
node --version  # Doit être >= 18.0.0
npm --version
```

#### 2. Cloner ou télécharger le code de l'agent

**Option A : Si le code est dans le repo MyNetwork**
```bash
cd /chemin/vers/mynetwork/host-agent
```

**Option B : Télécharger depuis GitHub (si publié)**
```bash
git clone https://github.com/votre-repo/mynetwork.git
cd mynetwork/host-agent
```

#### 3. Installer les dépendances

```bash
npm install
```

#### 4. Lancer l'agent

**Mode développement (temporaire) :**
```bash
npm run dev
# OU
node index.js
```

**Mode production (avec PM2 recommandé) :**
```bash
# Installer PM2 globalement
npm install -g pm2

# Lancer l'agent avec PM2
pm2 start index.js --name mynetwork-host-agent

# Sauvegarder la configuration PM2
pm2 save

# Configurer PM2 pour démarrer au boot
pm2 startup
# Suivre les instructions affichées
```

#### 5. Vérifier l'agent

```bash
# Si avec PM2
pm2 status
pm2 logs mynetwork-host-agent

# Tester l'endpoint
curl http://127.0.0.1:9999/health
curl http://127.0.0.1:9999/stats/system
curl http://127.0.0.1:9999/stats/network
```

#### 6. Configurer MyNetwork

Dans le `.env` de MyNetwork :

```bash
HOST_AGENT_URL=http://127.0.0.1:9999
```

Puis redémarrer MyNetwork :

```bash
cd ~/mynetwork
docker-compose restart mynetwork
```

---

## 📊 Comparaison des Méthodes

| Critère | Méthode 1<br>(Compose intégré) | Méthode 2<br>(Agent standalone) | Méthode 3<br>(Node direct) |
|---------|-------------------------------|--------------------------------|---------------------------|
| **Simplicité** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Gestion** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Flexibilité** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Performance** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Recommandé pour** | La plupart des cas | Déploiements existants | Environnements sans Docker |

---

## 🔍 Vérification Post-Installation

### 1. Vérifier les conteneurs/services

**Méthode 1 ou 2 (Docker) :**
```bash
docker ps | grep mynetwork
docker ps | grep host-agent
```

**Méthode 3 (PM2) :**
```bash
pm2 status
pm2 logs mynetwork-host-agent
```

### 2. Tester l'agent

```bash
# Health check
curl http://127.0.0.1:9999/health
# Réponse attendue: {"status":"ok","timestamp":...}

# Stats système
curl http://127.0.0.1:9999/stats/system
# Réponse attendue: {"cpu":{...},"memory":{...},"disks":[...],...}

# Stats réseau
curl http://127.0.0.1:9999/stats/network
# Réponse attendue: {"rxBytes":...,"txBytes":...,"interfaces":...}
```

### 3. Vérifier MyNetwork

```bash
# Health check
curl http://localhost:7505/api/health

# Stats système (doit utiliser l'agent)
curl http://localhost:7505/api/system/server
```

### 4. Vérifier dans l'interface web

1. Ouvrir `http://localhost:7505`
2. Se connecter avec un compte admin
3. Aller dans **Dashboard** → Carte **"Serveur"**
4. Vérifier que les métriques s'affichent :
   - ✅ CPU (%)
   - ✅ Mémoire (total, utilisé, libre)
   - ✅ Disques (montages, espace)
   - ✅ Réseau (download/upload)
   - ✅ Hostname de l'hôte (pas du conteneur)
   - ✅ Uptime de l'hôte

---

## 🛠️ Dépannage

### L'agent ne démarre pas

**Vérifier les logs :**
```bash
# Docker
docker logs mynetwork-host-agent

# PM2
pm2 logs mynetwork-host-agent
```

**Vérifier le port :**
```bash
netstat -tuln | grep 9999
# OU
ss -tuln | grep 9999
```

**Vérifier les permissions :**
- L'agent doit pouvoir lire `/proc/net/dev`
- L'agent doit pouvoir lire `/proc/uptime`
- L'agent doit pouvoir exécuter `df -h`

### MyNetwork ne peut pas accéder à l'agent

**Vérifier l'URL de l'agent :**
```bash
# Dans le conteneur MyNetwork
docker exec -it mynetwork-container curl http://host.docker.internal:9999/health
# OU
docker exec -it mynetwork-container curl http://127.0.0.1:9999/health
```

**Si `host.docker.internal` ne fonctionne pas :**
- Utiliser `network_mode: host` dans le docker-compose de MyNetwork
- OU utiliser l'IP de l'hôte directement

**Vérifier la variable d'environnement :**
```bash
docker exec -it mynetwork-container env | grep HOST_AGENT_URL
```

### Les métriques système sont incorrectes

**Vérifier que l'agent retourne les bonnes données :**
```bash
curl http://127.0.0.1:9999/stats/system | jq
```

**Vérifier que MyNetwork utilise l'agent :**
- Regarder les logs MyNetwork pour voir si l'agent est appelé
- Vérifier qu'il n'y a pas de fallback sur le montage FS

### Fallback sur montage FS

Si l'agent n'est pas disponible, MyNetwork utilisera automatiquement le montage du système de fichiers (`/host`). Pour vérifier :

```bash
# Vérifier les logs MyNetwork
docker logs mynetwork | grep "Agent"
```

---

## 📝 Commandes Utiles

### Arrêter/Démarrer

**Méthode 1 (Compose intégré) :**
```bash
docker-compose stop
docker-compose start
docker-compose restart
```

**Méthode 2 (Agent standalone) :**
```bash
docker-compose -f docker-compose.agent.yml stop
docker-compose -f docker-compose.agent.yml start
docker-compose -f docker-compose.agent.yml restart
```

**Méthode 3 (PM2) :**
```bash
pm2 stop mynetwork-host-agent
pm2 start mynetwork-host-agent
pm2 restart mynetwork-host-agent
```

### Mise à jour

**Méthode 1 :**
```bash
docker-compose pull
docker-compose up -d
```

**Méthode 2 (Agent seul) :**
```bash
docker-compose -f docker-compose.agent.yml pull
docker-compose -f docker-compose.agent.yml up -d
```

**Méthode 3 :**
```bash
cd host-agent
git pull  # Si depuis Git
npm install
pm2 restart mynetwork-host-agent
```

### Désinstallation

**Méthode 1 :**
```bash
docker-compose down
docker-compose down -v  # Supprime aussi les volumes
```

**Méthode 2 :**
```bash
docker-compose -f docker-compose.agent.yml down
```

**Méthode 3 :**
```bash
pm2 delete mynetwork-host-agent
pm2 save
```

---

## 🔐 Sécurité

### L'agent écoute uniquement sur localhost

L'agent est configuré pour écouter uniquement sur `127.0.0.1:9999`, ce qui signifie qu'il n'est accessible que depuis la machine locale. C'est une mesure de sécurité importante.

### Si vous devez exposer l'agent sur le réseau

⚠️ **Non recommandé** sauf si nécessaire. Si vous devez le faire :

1. Modifier la configuration de l'agent pour écouter sur `0.0.0.0`
2. Ajouter un firewall pour limiter l'accès
3. Considérer l'ajout d'authentification

---

## 📚 Références

- [Documentation Docker](https://docs.docker.com/)
- [Documentation Docker Compose](https://docs.docker.com/compose/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Documentation MyNetwork](../README.md)
- [Guide Solutions Docker Stats](../Doc_Dev/DOCKER_SYSTEM_STATS_SOLUTIONS.md)

---

## ❓ Questions Fréquentes

### Puis-je utiliser plusieurs agents pour plusieurs instances MyNetwork ?

Oui, mais chaque agent doit écouter sur un port différent. Modifier le `PORT` dans la configuration de l'agent.

### L'agent fonctionne-t-il sur Windows ?

L'agent est conçu pour Linux (accès à `/proc/net/dev`, etc.). Sur Windows, il faudrait adapter le code pour utiliser les APIs Windows.

### Puis-je désactiver l'agent et utiliser uniquement le montage FS ?

Oui, si vous ne configurez pas `HOST_AGENT_URL` ou si l'agent n'est pas disponible, MyNetwork utilisera automatiquement le montage du système de fichiers comme fallback.

### L'agent consomme-t-il beaucoup de ressources ?

Non, l'agent est très léger (quelques MB de RAM, CPU négligeable). Il fait principalement des lectures de fichiers système.

---

**Note** : Ce guide sera mis à jour une fois l'implémentation de l'agent terminée.

