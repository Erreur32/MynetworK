# Guide de Mise à Jour en Production - Version 0.1.4

## 🚀 Procédure de Mise à Jour

### Sur la machine de production

Une fois que le build GitHub Actions est terminé (après 5-10 minutes), sur la machine de production :

```bash
# 1. Aller dans le répertoire du projet
cd /chemin/vers/mynetwork

# 2. Récupérer la nouvelle image depuis GitHub Container Registry
docker compose pull

# 3. Redémarrer le conteneur avec la nouvelle image
docker compose up -d
```

**Ou en une seule commande** :
```bash
docker compose pull && docker compose up -d
```

## ✅ Vérification après mise à jour

### 1. Vérifier que le conteneur tourne
```bash
docker ps | grep MynetworK
```

### 2. Vérifier les logs
```bash
docker logs -f MynetworK
```

Vous devriez voir :
```
║                             Version v0.1.4
```

### 3. Tester l'API
```bash
curl http://localhost:7505/api/health
```

Réponse attendue :
```json
{"status":"ok","timestamp":"..."}
```

### 4. Vérifier dans l'interface web
- Ouvrir le dashboard : `http://votre-serveur:7505`
- Vérifier que tout fonctionne normalement
- Vérifier la version affichée (devrait être 0.1.4)

## 📋 Commandes Complètes (Copier-Coller)

```bash
# Mise à jour complète
cd /chemin/vers/mynetwork
docker compose pull
docker compose up -d

# Vérification
docker ps | grep MynetworK
docker logs --tail 50 MynetworK
curl http://localhost:7505/api/health
```

## ⚠️ Notes Importantes

### 1. Données préservées
- ✅ **Base de données** : Les données sont dans le volume `./data` et sont **préservées**
- ✅ **Token Freebox** : Le token est dans `./data/freebox_token.json` et est **préservé**
- ✅ **Configuration** : Toutes les configurations sont **préservées**

### 2. Temps d'indisponibilité
- ⏱️ **Durée** : 10-30 secondes (le temps de télécharger l'image et redémarrer)
- 🔄 **Redémarrage automatique** : Le conteneur redémarre automatiquement avec `restart: unless-stopped`

### 3. Rollback (si problème)
Si vous devez revenir à une version précédente :

```bash
# Option 1 : Utiliser une version spécifique
# Modifier docker-compose.yml pour utiliser :
# image: ghcr.io/erreur32/mynetwork:0.1.3
docker compose pull
docker compose up -d

# Option 2 : Utiliser l'image locale si vous l'avez gardée
docker tag mynetwork:0.1.3 ghcr.io/erreur32/mynetwork:latest
docker compose up -d
```

## 🔍 Vérification du Build GitHub

Avant de mettre à jour, vérifiez que le build GitHub est terminé :

```bash
# Depuis votre machine de développement
npm run check:docker
```

Ou vérifier manuellement :
- GitHub Actions : https://github.com/Erreur32/MynetworK/actions
- Image Docker : https://github.com/Erreur32/MynetworK/pkgs/container/mynetwork

## 📝 Résumé

| Étape | Commande | Description |
|-------|----------|-------------|
| 1 | `docker compose pull` | Télécharge la nouvelle image `latest` |
| 2 | `docker compose up -d` | Redémarre le conteneur avec la nouvelle image |
| 3 | `docker logs -f MynetworK` | Vérifie les logs |
| 4 | `curl http://localhost:7505/api/health` | Teste l'API |

**C'est tout !** Les données sont préservées, le conteneur redémarre automatiquement.

