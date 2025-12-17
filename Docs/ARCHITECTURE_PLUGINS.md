# Architecture des Plugins – MynetworK

Ce document décrit l'architecture du système de plugins de MynetworK, permettant d'intégrer différentes sources de données (Freebox, UniFi, etc.).

---

## 🎯 Vue d'ensemble

Le système de plugins permet d'ajouter dynamiquement des sources de données au dashboard. Chaque plugin :
- Hérite de `BasePlugin`
- Est géré par `PluginManager`
- Peut être activé/désactivé dynamiquement
- Ne fait **AUCUN** appel API si non activé

---

## 📁 Structure des Répertoires

```
server/plugins/
├── base/
│   ├── BasePlugin.ts          # Classe de base abstraite
│   └── PluginInterface.ts     # Interfaces TypeScript
├── freebox/
│   ├── FreeboxPlugin.ts       # Plugin Freebox
│   └── FreeboxApiService.ts   # Service API Freebox
├── unifi/
│   ├── UniFiPlugin.ts         # Plugin UniFi
│   └── UniFiApiService.ts     # Service API UniFi
└── GUIDE_PLUGINS.md           # Guide complet des plugins
```

---

## 🔌 Interface Plugin

### PluginInterface

Tous les plugins doivent implémenter l'interface `IPlugin` :

```typescript
interface IPlugin {
    getId(): string;
    getName(): string;
    getVersion(): string;
    initialize(config: PluginConfig): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    isEnabled(): boolean;
    getStats(): Promise<PluginStats>;
    testConnection(): Promise<boolean>;
    getRoutes?(): Router;  // Optionnel
}
```

### BasePlugin

La classe abstraite `BasePlugin` fournit l'implémentation de base :

```typescript
abstract class BasePlugin implements IPlugin {
    protected id: string;
    protected name: string;
    protected version: string;
    protected config: PluginConfig | null = null;
    
    // Méthodes communes implémentées
    getId(): string;
    getName(): string;
    getVersion(): string;
    initialize(config: PluginConfig): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    isEnabled(): boolean;
    
    // Méthodes à implémenter dans les plugins
    abstract getStats(): Promise<PluginStats>;
    abstract testConnection(): Promise<boolean>;
}
```

---

## 🏗️ Cycle de Vie d'un Plugin

1. **Initialisation** : `initialize(config)` - Configuration du plugin
2. **Démarrage** : `start()` - Connexion et authentification (si activé)
3. **Exécution** : Le plugin est actif et peut recevoir des requêtes
4. **Arrêt** : `stop()` - Déconnexion et nettoyage

### Règles Importantes

- ✅ Un plugin **désactivé** ne doit **jamais** faire d'appels API
- ✅ `start()` ne doit être appelé que si `enabled: true`
- ✅ Les erreurs doivent être gérées proprement (pas de crash du serveur)

---

## 📝 Création d'un Nouveau Plugin

### Étape 1 : Créer le répertoire

```bash
mkdir -p server/plugins/mon-plugin
```

### Étape 2 : Créer le service API (si nécessaire)

```typescript
// server/plugins/mon-plugin/MonApiService.ts
export class MonApiService {
    private baseUrl: string;
    
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }
    
    async getData(): Promise<any> {
        // Appels API
    }
}
```

### Étape 3 : Créer le plugin

```typescript
// server/plugins/mon-plugin/MonPlugin.ts
import { BasePlugin } from '../base/BasePlugin.js';
import type { PluginConfig, PluginStats } from '../base/PluginInterface.js';

export class MonPlugin extends BasePlugin {
    private apiService: MonApiService;
    
    constructor() {
        super('mon-plugin', 'Mon Plugin', '1.0.0');
    }
    
    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        const settings = config.settings;
        // Configuration du service API
        // ⚠️ Ne pas faire d'appels API ici !
    }
    
    async start(): Promise<void> {
        await super.start();
        if (!this.isEnabled()) {
            return; // Sécurité supplémentaire
        }
        // Connexion et authentification
    }
    
    async getStats(): Promise<PluginStats> {
        if (!this.isEnabled()) {
            return { connected: false, devices: 0 };
        }
        // Récupération des statistiques
    }
    
    async testConnection(): Promise<boolean> {
        if (!this.isEnabled()) {
            return false;
        }
        // Test de connexion
    }
}
```

### Étape 4 : Enregistrer le plugin

Dans `server/services/pluginManager.ts` :

```typescript
import { MonPlugin } from '../plugins/mon-plugin/MonPlugin.js';

// Dans la méthode d'initialisation
this.plugins.set('mon-plugin', new MonPlugin());
```

---

## 🔧 Configuration des Plugins

Les plugins sont configurés via la base de données SQLite (table `plugin_config`) :

```typescript
interface PluginConfig {
    id: string;                    // Identifiant unique
    enabled: boolean;               // Actif/inactif
    settings: Record<string, unknown>; // Paramètres spécifiques
}
```

### Exemple de configuration

```json
{
    "id": "freebox",
    "enabled": true,
    "settings": {
        "host": "mafreebox.freebox.fr",
        "appId": "fr.freebox.mynetwork",
        "appToken": "token_here"
    }
}
```

---

## 📊 Plugins Disponibles

### Freebox Plugin

- **ID** : `freebox`
- **Service** : `FreeboxApiService`
- **Fonctionnalités** : Gestion de la Freebox (WiFi, Switch, VPN, etc.)

### UniFi Plugin

- **ID** : `unifi`
- **Service** : `UniFiApiService`
- **Fonctionnalités** : Gestion du contrôleur UniFi (clients, devices, etc.)

---

## 🧪 Tests et Validation

### Test de connexion

Chaque plugin doit implémenter `testConnection()` pour vérifier la connectivité :

```typescript
async testConnection(): Promise<boolean> {
    try {
        // Test simple (ping, auth, etc.)
        return true;
    } catch (error) {
        return false;
    }
}
```

### Gestion des erreurs

- Les erreurs ne doivent **jamais** faire planter le serveur
- Utiliser des try/catch appropriés
- Logger les erreurs pour le debugging

---

## 📚 Ressources

- **Guide complet** : `server/plugins/GUIDE_PLUGINS.md`
- **Template** : `server/plugins/PLUGIN_TEMPLATE.md`
- **Interface** : `server/plugins/base/PluginInterface.ts`
- **Classe de base** : `server/plugins/base/BasePlugin.ts`

---

**Dernière mise à jour** : 2025-01-17

