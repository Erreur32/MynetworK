# Guide : Tester en Docker Dev en Local

## 📋 Vue d'ensemble

Ce guide explique comment lancer la version **Docker dev** en local pour tester le comportement en environnement Docker tout en gardant le hot reload.

---

## 🚀 Lancement Rapide

### Prérequis

- Docker et Docker Compose installés
- Ports disponibles : `3000` (frontend) et `3003` (backend)

### Commande de base

```bash
docker compose -f docker-compose.dev.yml up --build
```

### Avec variables d'environnement personnalisées

```bash
# Via fichier .env
docker compose -f docker-compose.dev.yml --env-file .env up --build

# Via variables d'environnement système
DASHBOARD_PORT=3000 SERVER_PORT=3003 docker compose -f docker-compose.dev.yml up --build
```

---

## 🔧 Configuration

### Ports par défaut

- **Frontend (Vite)** : `3000` (variable `DASHBOARD_PORT`)
- **Backend (API)** : `3003` (variable `SERVER_PORT`)

### Variables d'environnement

Les variables peuvent être définies via :

1. **Fichier `.env`** (recommandé) :
   ```bash
   DASHBOARD_PORT=3000
   SERVER_PORT=3003
   FREEBOX_HOST=mafreebox.freebox.fr
   JWT_SECRET=votre_secret_genere
   ```

2. **Variables système** :
   ```bash
   export DASHBOARD_PORT=3000
   export SERVER_PORT=3003
   docker compose -f docker-compose.dev.yml up --build
   ```

3. **Ligne de commande** :
   ```bash
   DASHBOARD_PORT=3000 SERVER_PORT=3003 docker compose -f docker-compose.dev.yml up --build
   ```

### Variables importantes

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DASHBOARD_PORT` | Port du serveur Vite (frontend) | `3000` |
| `SERVER_PORT` | Port de l'API backend | `3003` |
| `FREEBOX_HOST` | URL de la Freebox | `mafreebox.freebox.fr` |
| `JWT_SECRET` | Secret pour signer les tokens JWT | `dev_secret_change_in_production` |

⚠️ **Sécurité** : Ne jamais utiliser le `JWT_SECRET` par défaut en production !

---

## 📦 Volumes Docker

### Volumes montés

1. **Code source** : `.` → `/app`
   - Permet le hot reload
   - Les modifications sont immédiatement visibles

2. **node_modules** : `/app/node_modules`
   - Préservé dans le conteneur
   - Évite les conflits avec les node_modules de l'hôte

3. **Données persistantes** : `mynetwork_data_dev`
   - Base de données SQLite : `/app/data/dashboard.db`
   - Token Freebox : `/app/data/freebox_token.json`
   - Persiste entre les redémarrages du conteneur

4. **Docker socket** : `/var/run/docker.sock`
   - Permet d'accéder aux stats Docker depuis le conteneur
   - Lecture seule (`:ro`)

---

## 🔄 Hot Reload

### Fonctionnement

Le mode dev Docker utilise le hot reload :

- **Frontend** : Vite surveille les changements dans `src/`
- **Backend** : `tsx watch` surveille les changements dans `server/`
- Les modifications sont automatiquement recompilées et rechargées

### Vérifier le hot reload

1. Modifier un fichier dans `src/` ou `server/`
2. Observer les logs Docker :
   ```
   [vite] hmr update /src/components/...
   [tsx] watching /app/server/...
   ```
3. Le navigateur devrait se rafraîchir automatiquement

---

## 🐛 Dépannage

### Le conteneur ne démarre pas

```bash
# Vérifier les logs
docker logs Mynetwork-dev

# Vérifier les ports disponibles
netstat -an | grep -E "3000|3003"

# Arrêter et redémarrer
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up --build
```

### Les modifications ne sont pas prises en compte

1. Vérifier que le volume est bien monté :
   ```bash
   docker exec Mynetwork-dev ls -la /app/src
   ```

2. Vérifier les logs de hot reload :
   ```bash
   docker logs -f Mynetwork-dev
   ```

3. Redémarrer le conteneur :
   ```bash
   docker compose -f docker-compose.dev.yml restart
   ```

### Erreur de port déjà utilisé

```bash
# Changer les ports
DASHBOARD_PORT=3001 SERVER_PORT=3004 docker compose -f docker-compose.dev.yml up --build
```

### Erreur de permissions (Docker socket)

```bash
# Vérifier les permissions du socket Docker
ls -la /var/run/docker.sock

# Si nécessaire, ajouter l'utilisateur au groupe docker
sudo usermod -aG docker $USER
# Puis se déconnecter/reconnecter
```

### Base de données vide ou corrompue

```bash
# Supprimer le volume de données
docker compose -f docker-compose.dev.yml down -v

# Redémarrer (une nouvelle DB sera créée)
docker compose -f docker-compose.dev.yml up --build
```

---

## 📊 Accès à l'application

### URLs

- **Frontend** : http://localhost:3000 (ou port défini dans `DASHBOARD_PORT`)
- **Backend API** : http://localhost:3003/api (ou port défini dans `SERVER_PORT`)

### Compte par défaut

- **Username** : `admin`
- **Password** : `admin` (à changer en production !)

---

## 🔍 Commandes utiles

### Voir les logs en temps réel

```bash
docker logs -f Mynetwork-dev
```

### Accéder au shell du conteneur

```bash
docker exec -it Mynetwork-dev sh
```

### Arrêter le conteneur

```bash
docker compose -f docker-compose.dev.yml down
```

### Arrêter et supprimer les volumes

```bash
docker compose -f docker-compose.dev.yml down -v
```

### Rebuild sans cache

```bash
docker compose -f docker-compose.dev.yml build --no-cache
docker compose -f docker-compose.dev.yml up
```

### Vérifier l'état du conteneur

```bash
docker ps | grep Mynetwork-dev
docker inspect Mynetwork-dev
```

---

## 📝 Différences avec `npm run dev`

| Aspect | `npm run dev` | Docker Dev |
|--------|---------------|------------|
| **Environnement** | Machine hôte | Conteneur Alpine |
| **Hot reload** | ✅ Oui | ✅ Oui |
| **Isolation** | ❌ Non | ✅ Oui |
| **Base de données** | `./data/dashboard.db` | Volume Docker |
| **Ports** | 3000 (frontend), 3003 (backend) | Configurables |
| **Docker socket** | Accès direct | Monté dans le conteneur |
| **Performance** | Plus rapide | Légèrement plus lent |

---

## 🎯 Cas d'usage

### Quand utiliser Docker Dev ?

1. **Tester le comportement en Docker** avant de déployer en production
2. **Reproduire un bug** spécifique à l'environnement Docker
3. **Tester l'isolation** des dépendances
4. **Valider la configuration** des volumes et ports

### Quand utiliser `npm run dev` ?

1. **Développement quotidien** (plus rapide)
2. **Débogage** (accès direct aux outils de dev)
3. **Tests unitaires** (plus simple sans Docker)

---

## 🔗 Références

- `docker-compose.dev.yml` : Configuration Docker Compose pour le dev
- `Dockerfile.dev` : Dockerfile pour le mode développement
- `Docs/README-DEV.md` : Guide de développement général
- `Docs/VARIABLES_ENVIRONNEMENT.md` : Documentation des variables d'environnement
- `Docs/CONFIGURATION_PORTS.md` : Configuration des ports

---

## ⚠️ Notes importantes

1. **Base de données** : La base de données Docker dev est séparée de celle de `npm run dev`
2. **Token Freebox** : Le token est partagé entre les deux modes (même fichier `data/freebox_token.json`)
3. **Performance** : Docker dev est légèrement plus lent que `npm run dev` à cause de la virtualisation
4. **Ports** : Assurez-vous que les ports ne sont pas déjà utilisés par une autre instance

