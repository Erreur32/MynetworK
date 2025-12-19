# Guide : Lancer Docker Dev et Prod en Parallèle

**Date** : $(date)  
**Objectif** : Expliquer comment lancer Docker dev et prod simultanément sans conflit

---

## ⚠️ Problème

Par défaut, `docker compose up` peut arrêter les conteneurs existants s'ils partagent des ressources (ports, volumes, etc.).

Si vous lancez :
```bash
docker compose -f docker-compose.dev.yml up
```

Cela peut arrêter votre Docker prod qui tourne avec :
```bash
docker compose up -d
```

---

## ✅ Solution : Utiliser un Nom de Projet Différent

Docker Compose utilise un **nom de projet** pour isoler les environnements. Par défaut, le nom de projet est le nom du répertoire.

### Commande Recommandée

Pour lancer Docker dev **sans affecter** Docker prod :

```bash
# Mode dev (avec nom de projet explicite)
docker compose -f docker-compose.dev.yml -p mynetwork-dev up --build

# Ou en mode détaché (background)
docker compose -f docker-compose.dev.yml -p mynetwork-dev up -d --build
```

Pour lancer Docker prod :

```bash
# Mode prod (nom de projet par défaut ou explicite)
docker compose -p mynetwork-prod up -d
```

---

## 🔍 Vérification

### Voir tous les conteneurs en cours

```bash
docker ps
```

Vous devriez voir :
- `MynetworK` (prod) - port 7505
- `Mynetwork-dev` (dev) - ports 3000 et 3003

### Voir les projets Docker Compose

```bash
docker compose ls
```

---

## 📋 Commandes Utiles

### Arrêter uniquement Docker dev

```bash
docker compose -f docker-compose.dev.yml -p mynetwork-dev down
```

### Arrêter uniquement Docker prod

```bash
docker compose -p mynetwork-prod down
```

### Voir les logs de dev

```bash
docker compose -f docker-compose.dev.yml -p mynetwork-dev logs -f
```

### Voir les logs de prod

```bash
docker compose -p mynetwork-prod logs -f
```

---

## 🎯 Résumé

| Environnement | Commande | Ports | Nom du projet |
|---------------|----------|-------|---------------|
| **Dev** | `docker compose -f docker-compose.dev.yml -p mynetwork-dev up` | 3000, 3003 | `mynetwork-dev` |
| **Prod** | `docker compose -p mynetwork-prod up -d` | 7505 | `mynetwork-prod` |

---

## 💡 Pourquoi ça fonctionne ?

L'option `-p` (ou `--project-name`) crée un **namespace isolé** pour chaque projet Docker Compose :

- Les conteneurs ont des noms différents (déjà configurés dans les fichiers)
- Les réseaux Docker sont isolés par projet
- Les volumes peuvent être partagés ou isolés selon la configuration

Cela permet de lancer les deux environnements **simultanément** sans conflit.

---

## ⚠️ Note sur les Volumes

Les deux environnements utilisent des volumes différents :
- **Dev** : `./data` (montage local)
- **Prod** : `mynetwork_data` (volume Docker nommé)

Ils ne se chevauchent donc **pas**.

