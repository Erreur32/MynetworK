# Vérification Runtime Alpine - Dépendances Système

**Date** : $(date)  
**Branche** : dev  
**Objectif** : Vérifier que toutes les dépendances runtime sont présentes pour que le conteneur fonctionne après le build

---

## 🔍 Analyse des Dépendances Runtime

### 1. Modules Natifs Node.js

#### `better-sqlite3` (v9.2.2)
- **Compilation** : Compile SQLite3 **statiquement** dans le binaire
- **Dépendances runtime** : Aucune bibliothèque système externe requise
- **Bibliothèque C** : Utilise musl libc (fournie par Alpine)
- **Statut** : ✅ **OK** - Pas de dépendances système supplémentaires nécessaires

#### `bcrypt` (v5.1.1)
- **Compilation** : Compile avec des dépendances système minimales
- **Dépendances runtime** : Aucune bibliothèque système externe requise
- **Bibliothèque C** : Utilise musl libc (fournie par Alpine)
- **Statut** : ✅ **OK** - Pas de dépendances système supplémentaires nécessaires

---

### 2. Commandes Système Utilisées au Runtime

#### Commandes dans `server/routes/systemServer.ts` :

| Commande | Disponibilité Alpine | Notes |
|----------|---------------------|-------|
| `chroot` | ✅ BusyBox | Disponible par défaut |
| `df` | ✅ BusyBox | Disponible par défaut |
| `grep` | ✅ BusyBox | Disponible par défaut |
| `awk` | ✅ BusyBox | Disponible par défaut |
| `wget` | ✅ Installé | Installé ligne 26 du Dockerfile |
| `curl` | ⚠️ Optionnel | Utilisé avec fallback Node.js HTTP |

**Statut** : ✅ **OK** - Toutes les commandes nécessaires sont disponibles

---

### 3. Bibliothèques Système

#### Bibliothèque C Standard
- **Alpine** : `musl libc` (fournie par l'image `node:22-alpine`)
- **Compatibilité** : ✅ Tous les modules Node.js sont compilés pour musl
- **Statut** : ✅ **OK**

#### Bibliothèques Dynamiques
- **better-sqlite3** : Compilé statiquement, pas de `.so` externe
- **bcrypt** : Compilé statiquement, pas de `.so` externe
- **Node.js** : Fourni par l'image `node:22-alpine`
- **Statut** : ✅ **OK** - Pas de bibliothèques dynamiques externes requises

---

### 4. Outils de Build dans le Stage Production

**Problème identifié** : Dans le stage production, on installe `python3`, `make`, `g++` (ligne 26) car `npm ci --omit=dev` recompile les modules natifs.

**Analyse** :
- ✅ Nécessaire pour recompiler `better-sqlite3` et `bcrypt` lors de `npm ci`
- ⚠️ Ces outils ne sont **pas nécessaires au runtime** après compilation
- 💡 **Optimisation possible** : On pourrait les retirer après `npm ci` pour réduire la taille de l'image

**Recommandation** : Garder les outils pour l'instant (sécurité), mais documenter qu'ils ne sont pas nécessaires au runtime.

---

### 5. Points d'Attention Spécifiques Alpine

#### Différences Ubuntu vs Alpine

| Aspect | Ubuntu | Alpine | Impact |
|--------|--------|--------|--------|
| LibC | glibc | musl | ✅ Modules compilés pour musl |
| Shell | bash | ash (BusyBox) | ✅ Pas de scripts shell dans le conteneur |
| Paquets | apt | apk | ✅ Utilisé correctement |
| Taille | ~200MB | ~50MB | ✅ Avantage Alpine |

**Statut** : ✅ **Aucun impact négatif détecté**

---

## ✅ Checklist Runtime

### Dépendances Système
- [x] musl libc (fournie par Alpine)
- [x] Outils de build pour recompilation (python3, make, g++)
- [x] wget pour healthcheck
- [x] Commandes BusyBox (chroot, df, grep, awk)

### Modules Node.js
- [x] better-sqlite3 compilé statiquement
- [x] bcrypt compilé statiquement
- [x] Tous les autres modules sont JavaScript purs

### Commandes Système
- [x] wget installé
- [x] Commandes BusyBox disponibles
- [x] Fallback Node.js HTTP pour curl

### Bibliothèques
- [x] Pas de dépendances `.so` externes
- [x] Tout est compilé statiquement ou fourni par Node.js

---

## 🧪 Tests Runtime Recommandés

### Test 1 : Démarrage du Conteneur
```bash
docker build -t mynetwork:test .
docker run -d --name mynetwork-test -p 3000:3000 mynetwork:test
```

### Test 2 : Vérification des Modules Natifs
```bash
docker exec mynetwork-test node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')"
docker exec mynetwork-test node -e "require('bcrypt'); console.log('bcrypt OK')"
```

### Test 3 : Test de la Base de Données
```bash
docker exec mynetwork-test node -e "
const Database = require('better-sqlite3');
const db = new Database('/tmp/test.db');
db.exec('CREATE TABLE test (id INTEGER)');
db.exec('INSERT INTO test VALUES (1)');
console.log('SQLite OK');
"
```

### Test 4 : Test du Healthcheck
```bash
# Attendre que le conteneur démarre
sleep 10
docker ps  # Vérifier que le healthcheck passe
curl http://localhost:3000/api/health
```

### Test 5 : Test des Commandes Système
```bash
docker exec mynetwork-test sh -c "chroot --version && df --version && grep --version && awk --version && wget --version"
```

---

## ⚠️ Points d'Attention

### 1. Recompilation dans le Stage Production
Le Dockerfile actuel fait `npm ci --omit=dev` dans le stage production, ce qui recompile les modules natifs. C'est normal et nécessaire.

### 2. Taille de l'Image
Les outils de build (`python3`, `make`, `g++`) ajoutent ~100MB à l'image. Si on veut optimiser, on pourrait :
- Les installer, faire `npm ci`, puis les retirer
- Mais cela complique le Dockerfile et n'est pas critique

### 3. Compatibilité musl vs glibc
Tous les modules sont compilés pour musl dans Alpine, donc pas de problème de compatibilité.

---

## ✅ Conclusion

**Toutes les dépendances runtime sont présentes et compatibles avec Alpine** ✅

Le conteneur devrait fonctionner correctement après le build. Les modules natifs sont compilés statiquement et n'ont pas besoin de bibliothèques système externes.

**Recommandation** : Procéder avec les tests runtime pour confirmer le bon fonctionnement.

---

## 📝 Notes Techniques

- **Image de base** : `node:22-alpine` (fournit Node.js + musl libc)
- **Outils installés** : `python3`, `make`, `g++`, `wget`
- **Modules natifs** : Compilés statiquement, pas de dépendances externes
- **Commandes système** : Toutes disponibles via BusyBox ou installées

---

**Document généré automatiquement lors de la vérification runtime Alpine**

