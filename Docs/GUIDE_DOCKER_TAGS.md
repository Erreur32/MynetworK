# Guide Docker Tags et Workflow GitHub Actions - MynetworK

Ce document explique comment gérer les tags Docker et le workflow de création d'images sur GitHub Container Registry (ghcr.io).

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Tags disponibles](#tags-disponibles)
- [Workflow de création d'images](#workflow-de-création-dimages)
- [Scénarios d'utilisation](#scénarios-dutilisation)
- [Configuration du workflow](#configuration-du-workflow)
- [Commandes pratiques](#commandes-pratiques)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Vue d'ensemble

MynetworK utilise **GitHub Actions** pour builder et publier automatiquement les images Docker sur **GitHub Container Registry** (`ghcr.io/erreur32/mynetwork`).

### Principe

- **Push sur `main`** → Build et push de l'image avec tag `latest`
- **Push sur `dev`** → Build et push de l'image avec tag `dev`
- **Création d'un tag Git** (ex: `v0.0.5`) → Build et push avec tag de version

---

## 🏷️ Tags disponibles

### Tags automatiques

Le workflow GitHub Actions crée automatiquement plusieurs tags selon le contexte :

| Tag | Description | Quand est-il créé ? |
|-----|-------------|---------------------|
| `latest` | Dernière version stable | Push sur `main` |
| `dev` | Version de développement | Push sur `dev` |
| `main` | Tag de branche | Push sur `main` |
| `v0.0.5` | Version spécifique | Création d'un tag Git `v0.0.5` |
| `0.0.5` | Version depuis package.json | Push sur `main` (si version dans package.json) |
| `0.0` | Version major.minor | Création d'un tag Git `v0.0.5` |

### Exemples d'images disponibles

```bash
# Image stable (dernière version sur main)
ghcr.io/erreur32/mynetwork:latest

# Image de développement (branche dev)
ghcr.io/erreur32/mynetwork:dev

# Version spécifique (tag Git v0.0.5)
ghcr.io/erreur32/mynetwork:v0.0.5

# Version depuis package.json
ghcr.io/erreur32/mynetwork:0.0.5

# Tag de branche
ghcr.io/erreur32/mynetwork:main
```

---

## 🔄 Workflow de création d'images

### Scénario 1 : Push sur `main` (Release stable)

```bash
# 1. Travailler sur dev
git checkout dev
# ... faire vos modifications ...
git add .
git commit -m "feat: nouvelle fonctionnalité"
git push origin dev

# 2. Merger dans main
git checkout main
git pull origin main
git merge dev
git push origin main

# 3. GitHub Actions se déclenche automatiquement
# → Build de l'image Docker
# → Push avec tags: latest, main, 0.0.5 (version package.json)
```

**Résultat** : Image disponible avec les tags `latest`, `main`, et la version depuis `package.json`.

### Scénario 2 : Push sur `dev` (Développement)

```bash
# Travailler sur dev
git checkout dev
# ... faire vos modifications ...
git add .
git commit -m "feat: work in progress"
git push origin dev

# GitHub Actions se déclenche automatiquement
# → Build de l'image Docker
# → Push avec tag: dev
```

**Résultat** : Image disponible avec le tag `dev`.

### Scénario 3 : Créer un tag de version (Release versionnée)

```bash
# 1. S'assurer que main est à jour
git checkout main
git pull origin main

# 2. Mettre à jour la version dans package.json
# (utiliser scripts/update-version.sh si disponible)
npm version 0.0.5  # ou modifier manuellement package.json

# 3. Commit la nouvelle version
git add package.json README.md  # et autres fichiers de version
git commit -m "chore: bump version to 0.0.5"
git push origin main

# 4. Créer un tag Git
git tag -a v0.0.5 -m "Version 0.0.5 - Release stable"
git push origin v0.0.5

# 5. GitHub Actions se déclenche automatiquement
# → Build de l'image Docker
# → Push avec tags: v0.0.5, 0.0.5, 0.0, latest
```

**Résultat** : Image disponible avec les tags `v0.0.5`, `0.0.5`, `0.0`, et `latest`.

---

## 📝 Scénarios d'utilisation

### Utiliser l'image `latest` (Production)

**docker-compose.yml** :

```yaml
services:
  mynetwork:
    image: ghcr.io/erreur32/mynetwork:latest
    container_name: mynetwork
    restart: unless-stopped
    ports:
      - "${DASHBOARD_PORT:-7505}:3000"
    # ... reste de la config
```

**Avantages** :
- ✅ Toujours la dernière version stable
- ✅ Mise à jour automatique avec `docker-compose pull`

**Inconvénients** :
- ⚠️ Peut changer sans préavis (si vous poussez sur main)
- ⚠️ Moins de contrôle sur la version exacte

### Utiliser l'image `dev` (Développement/Test)

**docker-compose.dev.yml** :

```yaml
services:
  mynetwork:
    image: ghcr.io/erreur32/mynetwork:dev
    container_name: mynetwork-dev
    restart: unless-stopped
    ports:
      - "${DASHBOARD_PORT:-7506}:3000"
    # ... reste de la config
```

**Avantages** :
- ✅ Test des nouvelles fonctionnalités avant release
- ✅ Séparé de la production

**Inconvénients** :
- ⚠️ Peut être instable (branche de développement)

### Utiliser une version spécifique (Production stable)

**docker-compose.yml** :

```yaml
services:
  mynetwork:
    image: ghcr.io/erreur32/mynetwork:v0.0.5
    container_name: mynetwork
    restart: unless-stopped
    ports:
      - "${DASHBOARD_PORT:-7505}:3000"
    # ... reste de la config
```

**Avantages** :
- ✅ Version fixe et stable
- ✅ Contrôle total sur la version
- ✅ Facilite le rollback si nécessaire

**Inconvénients** :
- ⚠️ Nécessite de mettre à jour manuellement le tag pour les nouvelles versions

### Recommandation

Pour la **production**, utilisez une **version spécifique** (`v0.0.5`) plutôt que `latest` pour éviter les surprises :

```yaml
image: ghcr.io/erreur32/mynetwork:v0.0.5  # ✅ Recommandé pour production
# image: ghcr.io/erreur32/mynetwork:latest  # ⚠️ À éviter en production
```

---

## ⚙️ Configuration du workflow

### Fichier `.github/workflows/docker-publish.yml`

Le workflow est configuré pour se déclencher sur :

1. **Push sur `main`** → Build avec tags `latest`, `main`, version
2. **Push sur `dev`** → Build avec tag `dev`
3. **Création d'un tag Git** (format `v*.*.*`) → Build avec tags de version

### Exemple de configuration

```yaml
name: Build & Push Docker Image

on:
  push:
    branches:
      - main
      - dev
    tags:
      - 'v*.*.*'  # Déclenche sur les tags v1.2.3, v0.0.5, etc.
  pull_request:
    branches:
      - main

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Extract version from package.json
        id: package-version
        run: |
          VERSION=$(node -p "require('./package.json').version")
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Set up QEMU (for multi-arch builds)
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=raw,value=dev,enable=${{ github.ref == 'refs/heads/dev' }}
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=${{ steps.package-version.outputs.version }},enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64
```

### Explication des tags dans le workflow

```yaml
tags: |
  # Tag 'latest' uniquement sur la branche par défaut (main)
  type=raw,value=latest,enable={{is_default_branch}}
  
  # Tag 'dev' uniquement sur la branche dev
  type=raw,value=dev,enable=${{ github.ref == 'refs/heads/dev' }}
  
  # Tag avec le nom de la branche (main, dev, etc.)
  type=ref,event=branch
  
  # Tag pour les pull requests
  type=ref,event=pr
  
  # Tags semver pour les versions (v0.0.5 → 0.0.5, 0.0)
  type=semver,pattern={{version}}
  type=semver,pattern={{major}}.{{minor}}
  
  # Tag avec la version depuis package.json (sur main uniquement)
  type=raw,value=${{ steps.package-version.outputs.version }},enable={{is_default_branch}}
```

---

## 🛠️ Commandes pratiques

### Pull une image spécifique

```bash
# Pull latest
docker pull ghcr.io/erreur32/mynetwork:latest

# Pull dev
docker pull ghcr.io/erreur32/mynetwork:dev

# Pull version spécifique
docker pull ghcr.io/erreur32/mynetwork:v0.0.5

# Pull version depuis package.json
docker pull ghcr.io/erreur32/mynetwork:0.0.5
```

### Lister les tags disponibles

```bash
# Via GitHub API (nécessite un token)
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/users/erreur32/packages/container/mynetwork/versions

# Via Docker (si l'image est publique)
docker search ghcr.io/erreur32/mynetwork
```

### Mettre à jour une image

```bash
# Mettre à jour latest
docker-compose pull
docker-compose up -d

# Mettre à jour une version spécifique
docker pull ghcr.io/erreur32/mynetwork:v0.0.5
docker-compose up -d
```

### Vérifier quelle version est utilisée

```bash
# Voir les tags d'une image locale
docker image inspect ghcr.io/erreur32/mynetwork:latest | grep -i tag

# Voir les labels de l'image
docker image inspect ghcr.io/erreur32/mynetwork:latest | grep -A 10 Labels
```

---

## 🔍 Vérifier le workflow

### Voir les workflows en cours

1. Aller sur GitHub : `https://github.com/erreur32/mynetwork/actions`
2. Vérifier que le workflow "Build & Push Docker Image" est en cours ou a réussi

### Voir les images publiées

1. Aller sur : `https://github.com/erreur32/mynetwork/pkgs/container/mynetwork`
2. Voir tous les tags disponibles

### Vérifier les logs du workflow

1. Cliquer sur un workflow dans l'onglet Actions
2. Voir les logs de chaque étape pour diagnostiquer les problèmes

---

## 🐛 Troubleshooting

### Le workflow ne se déclenche pas

**Problème** : Push sur `main` mais le workflow ne démarre pas.

**Solutions** :
- ✅ Vérifier que le fichier `.github/workflows/docker-publish.yml` existe
- ✅ Vérifier que vous poussez bien sur `main` (pas une autre branche)
- ✅ Vérifier l'onglet **Actions** pour voir les erreurs
- ✅ Vérifier que GitHub Actions est activé dans les paramètres du dépôt

### Erreur "permission denied" sur packages

**Problème** : Le workflow échoue avec une erreur de permission.

**Solutions** :
- ✅ Vérifier que `permissions: packages: write` est présent dans le job
- ✅ Vérifier que `GITHUB_TOKEN` est utilisé (pas un token custom)
- ✅ Vérifier que le dépôt a les permissions nécessaires

### Image non trouvée après build

**Problème** : Le workflow réussit mais l'image n'est pas disponible.

**Solutions** :
- ✅ Attendre quelques secondes (la propagation peut prendre du temps)
- ✅ Vérifier que le workflow a bien réussi (icône verte)
- ✅ Aller dans **Packages** du dépôt pour voir l'image
- ✅ Vérifier que l'image n'est pas privée (si vous essayez de la pull sans login)

### Tag manquant

**Problème** : Vous avez créé un tag Git mais l'image n'a pas le bon tag.

**Solutions** :
- ✅ Vérifier que le tag Git suit le format `v*.*.*` (ex: `v0.0.5`)
- ✅ Vérifier que vous avez bien poussé le tag : `git push origin v0.0.5`
- ✅ Vérifier les logs du workflow pour voir quels tags ont été créés

### Image privée non accessible

**Problème** : Impossible de pull l'image car elle est privée.

**Solutions** :
1. **Login à GitHub Container Registry** :
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   ```

2. **OU rendre l'image publique** :
   - Aller sur `https://github.com/erreur32/mynetwork/pkgs/container/mynetwork`
   - Cliquer sur **Package settings**
   - Scroll jusqu'à **Danger Zone** → **Change visibility** → **Public**

---

## 📚 Ressources

- [GitHub Container Registry Documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Metadata Action](https://github.com/docker/metadata-action)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Semantic Versioning](https://semver.org/)

---

## 💡 Bonnes pratiques

1. **Production** : Utilisez toujours une **version spécifique** (`v0.0.5`) plutôt que `latest`
2. **Développement** : Utilisez le tag `dev` pour tester les nouvelles fonctionnalités
3. **Tags Git** : Créez un tag Git à chaque release importante
4. **Version** : Maintenez `package.json` à jour avec la version actuelle
5. **Documentation** : Documentez les changements dans `CHANGELOG.md` à chaque release

---

**Note** : Ce workflow est optimisé pour GitHub. Pour Forgejo, voir [CI_FORGEJO_DOCKER.md](CI_FORGEJO_DOCKER.md).

