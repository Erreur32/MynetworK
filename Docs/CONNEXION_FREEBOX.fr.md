# Logique de Connexion Freebox et Gestion des Sessions

Ce document explique comment fonctionne le système de connexion Freebox, pourquoi certaines stats s'affichent sans authentification, et pourquoi le comportement diffère entre le mode développement (npm) et la production (Docker).

**📖 [Read in English](CONNEXION_FREEBOX.md)**

---

## 🔐 Système de Session Freebox

### Architecture

Le système de session Freebox fonctionne en deux étapes :

1. **Enregistrement de l'application** (`app_token`)
   - Une seule fois, via `/api/auth/register`
   - Stocké dans `data/freebox_token.json`
   - Persiste entre les redémarrages

2. **Ouverture de session** (`session_token`)
   - À chaque connexion, via `/api/auth/login`
   - Stocké en mémoire uniquement
   - Expire après inactivité (environ 5-10 minutes selon la Freebox)

### Flux de Connexion

```
1. Plugin.start() appelé
   ↓
2. Vérification si app_token existe (isRegistered())
   ↓
3. Vérification si session valide (checkSession())
   ↓
4. Si session invalide → login() pour obtenir nouveau session_token
   ↓
5. Démarrage du keep-alive (toutes les 2 minutes)
```

---

## 🔄 Keep-Alive (Maintien de Session)

### Fonctionnement

Le mécanisme de keep-alive a été ajouté pour maintenir la session active automatiquement :

- **Intervalle** : Vérification toutes les 2 minutes
- **Action** : 
  - Si session valide → requête légère (`getSystemInfo()`) pour maintenir la session
  - Si session expirée → reconnexion automatique (`login()`)

### Code

```typescript
// server/plugins/freebox/FreeboxPlugin.ts
private startKeepAlive(): void {
    this.keepAliveInterval = setInterval(async () => {
        const isLoggedIn = await this.apiService.checkSession();
        if (!isLoggedIn) {
            await this.apiService.login(); // Reconnexion automatique
        } else {
            await this.apiService.getSystemInfo(); // Maintien de session
        }
    }, 2 * 60 * 1000); // 2 minutes
}
```

---

## 📊 Récupération des Stats

### Méthode `getStats()`

La méthode `getStats()` dans `FreeboxPlugin` :

1. **Vérifie la session** avant chaque récupération
2. **Reconnecte automatiquement** si la session a expiré
3. **Utilise `Promise.allSettled`** pour récupérer toutes les stats en parallèle

```typescript
// Check if logged in, try to reconnect if needed
const isLoggedIn = await this.apiService.checkSession();
if (!isLoggedIn) {
    try {
        await this.apiService.login(); // Reconnexion automatique
    } catch (error) {
        throw new Error(`Freebox plugin not connected: ${error.message}`);
    }
}

// Fetch data from Freebox API in parallel
const [
    devicesResult,
    connectionResult,
    systemResult,
    dhcpConfigResult,
    dhcpLeasesResult,
    dhcpStaticLeasesResult,
    portForwardResult
] = await Promise.allSettled([...]);
```

### Pourquoi certaines stats s'affichent sans session ?

**Réponse** : Elles ne s'affichent **pas vraiment** sans session. Voici ce qui se passe :

1. **Quand vous cliquez sur "Auth"** :
   - Le bouton appelle `/api/auth/login` qui reconnecte la session
   - Le plugin démarre le keep-alive
   - Les stats sont récupérées avec succès

2. **Quand la session expire** :
   - Le keep-alive devrait la renouveler automatiquement
   - Mais si le plugin n'est pas démarré, le keep-alive ne fonctionne pas
   - Les stats peuvent encore s'afficher si elles sont mises en cache côté frontend

3. **Stats DHCP et Redirections** :
   - Ces stats nécessitent **toutes** une session active
   - Si elles s'affichent sans session, c'est probablement :
     - Des données en cache côté frontend
     - Ou une session qui vient d'expirer mais les données sont encore en mémoire

---

## 🐛 Différence Dev vs Production

### Mode Développement (npm run dev)

**Problème** : Le plugin peut ne pas être démarré automatiquement au démarrage du serveur.

**Pourquoi** :
- Le plugin n'est démarré que si `enabled: true` dans la base de données
- En dev, la base de données peut être vide ou le plugin désactivé
- Le keep-alive ne démarre que si `plugin.start()` est appelé
- **Si le plugin n'est pas activé dans la DB, le keep-alive ne démarre jamais automatiquement**

**Comportement actuel** :
- ✅ Cliquer sur "Auth" reconnecte la session et démarre le keep-alive
- ❌ Mais si le plugin n'est pas activé dans la DB, le keep-alive s'arrête si le serveur redémarre
- ❌ La session expire après ~5-10 minutes sans keep-alive

**C'est normal** : Oui, c'est le comportement attendu si le plugin n'est pas activé dans la base de données.

**Solution** :
1. **Activer le plugin** dans la page Plugins (Settings → Plugins)
2. Redémarrer le serveur dev
3. Le plugin démarrera automatiquement avec le keep-alive

### Mode Production (Docker)

**Pourquoi ça marche mieux** :
- La base de données est persistante (volume Docker)
- Le plugin est probablement activé (`enabled: true`)
- Au démarrage du conteneur, `initializeAllPlugins()` démarre automatiquement les plugins activés
- Le keep-alive fonctionne dès le démarrage

---

## 🔍 Diagnostic

### Vérifier si le plugin est démarré

```bash
# Vérifier les logs backend
# Vous devriez voir :
[FreeboxPlugin] Starting session keep-alive (checking every 2 minutes)
```

### Vérifier si la session est active

```bash
# Dans les logs, chercher :
[FreeboxPlugin] Session expired, renewing...
[FreeboxPlugin] Session renewed successfully
```

### Vérifier l'état du plugin

```bash
# Appel API
GET /api/plugins/freebox
# Vérifier : enabled, connectionStatus
```

---

## 🛠️ Solutions

### Solution 1 : S'assurer que le plugin est activé en dev

1. Aller dans la page Plugins
2. Activer le plugin Freebox
3. Redémarrer le serveur dev
4. Le plugin devrait démarrer automatiquement avec le keep-alive

### Solution 2 : Améliorer le keep-alive pour qu'il démarre même si le plugin n'est pas démarré

**Option A** : Démarrer le keep-alive dans `getStats()` si la session est valide

**Option B** : Démarrer le keep-alive dès qu'une première connexion réussit

### Solution 3 : Reconnexion automatique dans `getStats()`

Actuellement, `getStats()` reconnecte déjà automatiquement, mais le keep-alive ne démarre pas si le plugin n'est pas démarré.

---

## 📝 Recommandations

1. **En développement** : Toujours activer le plugin dans la page Plugins pour que le keep-alive fonctionne
2. **En production** : Le plugin devrait être activé par défaut dans la base de données
3. **Amélioration future** : Démarrer le keep-alive automatiquement dès qu'une session est établie, même si le plugin n'est pas formellement "démarré"

---

## 🔗 Références

- `server/plugins/freebox/FreeboxPlugin.ts` : Logique principale du plugin
- `server/plugins/freebox/FreeboxApiService.ts` : Service API Freebox
- `server/services/pluginManager.ts` : Gestionnaire de plugins
- `server/routes/auth.ts` : Routes d'authentification Freebox
