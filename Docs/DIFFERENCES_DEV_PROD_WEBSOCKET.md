# Différences WebSocket - Dev vs Prod

**Date** : $(date)  
**Objectif** : Expliquer pourquoi l'erreur WebSocket n'apparaît qu'en dev, pas en prod

---

## 🔍 Architecture en Développement (DEV)

### Configuration

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Frontend      │         │   Vite Dev       │         │   Backend       │
│   (Browser)     │────────▶│   Server         │────────▶│   Express       │
│   :5173         │         │   (Proxy)        │         │   :3003         │
└─────────────────┘         └──────────────────┘         └─────────────────┘
     │                              │                            │
     │                              │                            │
     └──────────────────────────────┴────────────────────────────┘
                    WebSocket via Proxy Vite
```

**Flux WebSocket en DEV** :
1. Frontend se connecte à : `ws://localhost:5173/ws/connection`
2. Vite proxy intercepte `/ws/*` et redirige vers : `ws://localhost:3003/ws/connection`
3. **Problème potentiel** : Si le backend n'est pas prêt, le proxy Vite génère une erreur

**Code concerné** :
- `vite.config.ts` : Configuration du proxy WebSocket
- `src/hooks/useConnectionWebSocket.ts` : Le frontend se connecte via le proxy

---

## ✅ Architecture en Production (PROD)

### Configuration

```
┌─────────────────┐                                    ┌─────────────────┐
│   Frontend      │                                    │   Backend       │
│   (Browser)     │───────────────────────────────────▶│   Express       │
│                 │                                    │   :3000         │
└─────────────────┘                                    └─────────────────┘
     │                                                         │
     │                                                         │
     └─────────────────────────────────────────────────────────┘
              WebSocket Direct (pas de proxy)
```

**Flux WebSocket en PROD** :
1. Frontend se connecte directement à : `ws://localhost:3000/ws/connection`
2. **Pas de proxy** : Connexion directe au serveur Express
3. **Pas d'erreur de proxy** : Le serveur Express gère directement les WebSocket

**Code concerné** :
- `server/index.ts` : Le serveur Express sert les fichiers statiques ET gère les WebSocket
- `src/hooks/useConnectionWebSocket.ts` : Le frontend se connecte directement au même serveur

---

## 📊 Comparaison

| Aspect | DEV | PROD |
|--------|-----|------|
| **Frontend** | Vite dev server (port 5173) | Servi par Express (port 3000) |
| **Backend** | Express (port 3003) | Express (port 3000) |
| **WebSocket** | Via proxy Vite (`/ws` → `ws://localhost:3003`) | Direct (`ws://localhost:3000/ws/connection`) |
| **Proxy** | ✅ Oui (Vite) | ❌ Non |
| **Erreur proxy** | ⚠️ Possible si backend pas prêt | ✅ Impossible (pas de proxy) |
| **Complexité** | Plus complexe (2 serveurs) | Plus simple (1 serveur) |

---

## 🐛 Pourquoi l'erreur en DEV ?

### Cause

L'erreur `This socket has been ended by the other party` apparaît en DEV car :

1. **Le frontend démarre avant le backend** :
   - Vite démarre rapidement (quelques secondes)
   - Le backend peut prendre plus de temps (compilation TypeScript, initialisation DB, etc.)
   - Le frontend essaie de se connecter au WebSocket via le proxy Vite
   - Le proxy Vite essaie de se connecter au backend qui n'est pas encore prêt
   - **Erreur** : `ECONNREFUSED` ou `ended by the other party`

2. **Le proxy Vite est un intermédiaire** :
   - En DEV, il y a 2 serveurs (Vite + Express)
   - Le proxy peut échouer si le backend n'est pas prêt
   - En PROD, il n'y a qu'un seul serveur (Express)

### Solution

L'erreur est maintenant **silencieusement ignorée** dans `vite.config.ts` car :
- C'est normal que le backend ne soit pas prêt immédiatement
- Le frontend réessaie automatiquement de se connecter (voir `useConnectionWebSocket.ts`)
- Après quelques secondes, le backend est prêt et la connexion fonctionne

---

## ✅ Pourquoi pas d'erreur en PROD ?

### Raisons

1. **Pas de proxy** :
   - Le frontend se connecte directement au serveur Express
   - Pas d'intermédiaire qui peut échouer

2. **Même serveur** :
   - Frontend et backend sont sur le même serveur (Express)
   - Le serveur est déjà démarré quand le frontend charge
   - Pas de problème de timing

3. **Connexion directe** :
   - `ws://localhost:3000/ws/connection` → Connexion directe
   - Pas de proxy qui peut générer des erreurs

---

## 🔧 Code Pertinent

### DEV - Proxy Vite (`vite.config.ts`)

```typescript
'/ws': {
  target: `ws://localhost:${process.env.SERVER_PORT || process.env.PORT || '3003'}`,
  ws: true,
  changeOrigin: true,
  // Gestion d'erreur pour ignorer les erreurs normales
}
```

### PROD - Serveur Express (`server/index.ts`)

```typescript
// Le serveur Express gère directement les WebSocket
const server = http.createServer(app);
connectionWebSocket.init(server);
logsWebSocket.init(server);

// Le frontend se connecte directement au même serveur
// ws://localhost:3000/ws/connection (pas de proxy)
```

### Frontend (`src/hooks/useConnectionWebSocket.ts`)

```typescript
// En DEV : ws://localhost:5173/ws/connection (via proxy Vite)
// En PROD : ws://localhost:3000/ws/connection (direct)
const wsUrl = `${protocol}//${window.location.host}/ws/connection`;
```

---

## 📝 Conclusion

**En DEV** :
- ⚠️ Erreur possible : Proxy Vite peut échouer si backend pas prêt
- ✅ Solution : Erreur silencieusement ignorée, reconnexion automatique

**En PROD** :
- ✅ Pas d'erreur : Pas de proxy, connexion directe
- ✅ Plus simple : Un seul serveur, pas de problème de timing

**L'erreur que vous voyez en DEV est normale et n'apparaîtra pas en production** ✅

---

**Document généré automatiquement pour expliquer les différences DEV/PROD**

