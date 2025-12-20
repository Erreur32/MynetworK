# Guide de Validation avant Commit - Version 0.1.4

## ✅ Checklist de Validation

### 1. Tests Locaux (Docker Dev) ✅
Vous avez déjà testé avec :
```bash
docker compose -f docker-compose.dev.yml -p mynetwork-dev up -d
```
**Status** : ✅ Fait

### 2. Test du Build de Production Local

Avant de push sur GitHub, testez le build de production localement :

```bash
# Build de l'image de production
docker build -t mynetwork:0.1.4 .

# Test du conteneur de production
docker run -d --name mynetwork-prod-test -p 7505:3000 \
  -e JWT_SECRET=test_secret_minimum_32_characters_long \
  -e FREEBOX_HOST=mafreebox.freebox.fr \
  mynetwork:0.1.4

# Attendre que le conteneur démarre (10-15 secondes)
sleep 15

# Vérifier les logs
docker logs mynetwork-prod-test

# Tester l'API
curl http://localhost:7505/api/health

# Nettoyer
docker stop mynetwork-prod-test
docker rm mynetwork-prod-test
```

### 3. Vérification des Fichiers de Version

Vérifiez que tous les fichiers sont à jour :
- ✅ `package.json` : version `0.1.4`
- ✅ `src/constants/version.ts` : version `0.1.4`
- ✅ `CHANGELOG.md` : section `0.1.4` ajoutée
- ✅ `README.md` : badge version `0.1.4`
- ✅ `commit-message.txt` : message de commit prêt

### 4. Vérification du Build Frontend

Testez le build frontend localement :
```bash
npm install
npm run build
```

Vérifiez que :
- ✅ Pas d'erreurs de build
- ✅ Le dossier `dist/` est créé
- ✅ Les chunks sont bien séparés (vendor-*.js, index-*.js)
- ✅ Le CSS Tailwind est compilé (index-*.css)

### 5. Vérification Git

Vérifiez les fichiers modifiés :
```bash
git status
```

Assurez-vous que :
- ✅ Tous les fichiers de version sont modifiés
- ✅ Pas de fichiers sensibles (tokens, passwords)
- ✅ `commit-message.txt` est à jour

## 🚀 Processus de Commit et Push

### Étape 1 : Commit
```bash
git add .
git commit -F commit-message.txt
```

### Étape 2 : Push vers GitHub
```bash
git push origin main
```

### Étape 3 : Vérification du Build GitHub

Après le push, le workflow GitHub Actions va :
1. ✅ Détecter le push sur `main`
2. ✅ Extraire la version depuis `package.json` (0.1.4)
3. ✅ Builder l'image Docker
4. ✅ Créer les tags : `latest`, `0.1.4`, `0.1`
5. ✅ Pousser vers `ghcr.io/erreur32/mynetwork`

**Vérification** :
```bash
# Attendre 5-10 minutes après le push
npm run check:docker
```

Ou vérifier manuellement :
- GitHub Actions : https://github.com/Erreur32/MynetworK/actions
- Image Docker : https://github.com/Erreur32/MynetworK/pkgs/container/mynetwork

## 📋 Workflow GitHub Actions - Analyse

Le workflow actuel :
- ✅ Build automatique sur push vers `main`
- ✅ Build automatique sur création de tag `v*.*.*`
- ✅ Extraction de la version depuis `package.json`
- ✅ Tags multiples : `latest`, `0.1.4`, `0.1`
- ✅ Cache Docker pour accélérer les builds
- ✅ Platform : `linux/amd64` uniquement

**Recommandations** :
- ✅ Le workflow est correct et suit les bonnes pratiques
- ✅ Pas besoin de modifications pour cette version

## ⚠️ Points d'Attention

1. **Version dans package.json** : Doit être `0.1.4` avant le push
2. **Build local** : Tester le build Docker localement avant de push
3. **Tests** : Vérifier que l'application fonctionne en dev Docker (déjà fait ✅)
4. **Dépendances** : `npm install` doit fonctionner sans erreurs
5. **Build frontend** : `npm run build` doit fonctionner sans erreurs

## ✅ Validation Finale

Avant de push, vérifiez :
- [ ] Build Docker local réussi
- [ ] Build frontend local réussi (`npm run build`)
- [ ] Tous les fichiers de version mis à jour
- [ ] `commit-message.txt` prêt
- [ ] Pas de fichiers sensibles dans le commit
- [ ] Tests en dev Docker OK (déjà fait ✅)

Une fois tout validé, vous pouvez push et le workflow GitHub Actions s'occupera du reste !

