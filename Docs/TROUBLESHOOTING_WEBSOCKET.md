# Dépannage WebSocket - Erreurs de Proxy Vite

**Date** : $(date)  
**Objectif** : Résoudre les erreurs WebSocket "socket hang up" ou "ended by the other party"

---

## 🔍 Symptômes

Erreurs dans la console Vite :
```
[vite] ws proxy error:
Error: This socket has been ended by the other party
    at Socket.writeAfterFIN [as write] (node:net:575:14)
```

---

## ✅ Solutions

### 1. Vérifier que le backend est démarré

**Problème** : Le frontend essaie de se connecter au WebSocket avant que le backend soit prêt.

**Solution** :
```bash
# Vérifier que le backend écoute bien sur le port 3003
# Dans les logs du backend, vous devriez voir :
# Server running on http://0.0.0.0:3003
# WebSocket server initialized on /ws/connection
```

**Vérification** :
```bash
# Tester si le backend répond
curl http://localhost:3003/api/health

# Tester si le WebSocket est accessible (nécessite un client WebSocket)
# Le backend devrait loguer : "Client connected from: ..."
```

---

### 2. Vérifier les ports

**Problème** : Le proxy Vite pointe vers le mauvais port.

**Solution** :
1. Vérifier que `SERVER_PORT` ou `PORT` est défini dans `.env` :
   ```bash
   # Fichier .env
   SERVER_PORT=3003
   PORT=3003
   ```

2. Vérifier que le backend écoute bien sur le port 3003 :
   ```bash
   # Dans les logs du backend
   Server running on http://0.0.0.0:3003
   ```

3. Vérifier la configuration Vite dans `vite.config.ts` :
   ```typescript
   '/ws': {
     target: `ws://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
   }
   ```

---

### 3. Problème de timing (backend pas encore prêt)

**Problème** : Le frontend essaie de se connecter immédiatement au chargement, mais le backend n'est pas encore prêt.

**Solution** : C'est normal et géré automatiquement. Le frontend va réessayer de se connecter automatiquement (voir `useConnectionWebSocket.ts`).

**Vérification** :
- Attendez quelques secondes après le démarrage du backend
- Les erreurs devraient disparaître une fois le backend prêt
- Le frontend se reconnecte automatiquement toutes les 3 secondes si la connexion échoue

---

### 4. Vérifier les logs du backend

**Problème** : Le backend ne démarre pas correctement ou a des erreurs.

**Solution** :
```bash
# Vérifier les logs du backend
# Vous devriez voir :
# - "Server running on http://0.0.0.0:3003"
# - "WebSocket server initialized on /ws/connection"
# - "WebSocket server initialized on /ws/logs"
```

**Si le backend ne démarre pas** :
- Vérifier les erreurs dans les logs
- Vérifier que le port 3003 n'est pas déjà utilisé
- Vérifier les variables d'environnement

---

### 5. Vérifier la configuration WebSocket

**Problème** : Le proxy WebSocket n'est pas correctement configuré.

**Vérification dans `vite.config.ts`** :
```typescript
'/ws': {
  target: `ws://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
  ws: true,
  changeOrigin: true,
  secure: false,
}
```

**Vérification dans le frontend** (`src/hooks/useConnectionWebSocket.ts`) :
```typescript
const wsUrl = `${protocol}//${window.location.host}/ws/connection`;
// Devrait être : ws://localhost:5173/ws/connection (en dev)
// Le proxy Vite redirige vers : ws://localhost:3003/ws/connection
```

---

## 🔧 Commandes de Diagnostic

### Vérifier que le backend écoute
```bash
# Linux/Mac
netstat -an | grep 3003
# ou
lsof -i :3003

# Windows
netstat -an | findstr 3003
```

### Tester le WebSocket manuellement
```bash
# Installer wscat (client WebSocket)
npm install -g wscat

# Tester la connexion
wscat -c ws://localhost:3003/ws/connection
```

### Vérifier les variables d'environnement
```bash
# Afficher les variables utilisées par Vite
echo $SERVER_PORT
echo $PORT
echo $VITE_PORT
```

---

## ⚠️ Erreurs Normales (à ignorer)

Ces erreurs sont **normales** et peuvent être ignorées :
- `ECONNRESET` : Connexion réinitialisée (normal lors de la fermeture)
- `ECONNREFUSED` : Connexion refusée (backend pas encore prêt)
- `ended by the other party` : Socket fermée par l'autre partie (normal)

Ces erreurs sont maintenant **silencieusement ignorées** dans `vite.config.ts` pour éviter le spam dans les logs.

---

## 🐛 Erreurs à Investiger

Ces erreurs nécessitent une investigation :
- `EADDRINUSE` : Port déjà utilisé
- `ENOTFOUND` : Hostname introuvable
- Erreurs de certificat SSL/TLS
- Erreurs de timeout persistantes

---

## 📝 Checklist de Dépannage

- [ ] Le backend est démarré et écoute sur le port 3003
- [ ] Les logs du backend montrent "WebSocket server initialized"
- [ ] Le fichier `.env` contient `SERVER_PORT=3003` ou `PORT=3003`
- [ ] Le port 3003 n'est pas utilisé par un autre processus
- [ ] Le frontend peut accéder à `http://localhost:3003/api/health`
- [ ] Les erreurs disparaissent après quelques secondes (timing)

---

## 🔗 Liens Utiles

- Configuration WebSocket : `vite.config.ts`
- Hook WebSocket frontend : `src/hooks/useConnectionWebSocket.ts`
- Service WebSocket backend : `server/services/connectionWebSocket.ts`
- Configuration des ports : `Docs/CONFIGURATION_PORTS.md`

---

**Document généré automatiquement pour le dépannage WebSocket**

