# Guide Complet des Plugins MynetworK

Ce guide explique comment créer, développer et maintenir des plugins pour MynetworK. Il est conçu pour être suivi par les IA et les développeurs.

## Table des matières

1. [Architecture des plugins](#architecture-des-plugins)
2. [Création d'un nouveau plugin](#création-dun-nouveau-plugin)
3. [Règles obligatoires](#règles-obligatoires)
4. [Structure d'un plugin](#structure-dun-plugin)
5. [Interface PluginInterface](#interface-plugininterface)
6. [Gestion du cycle de vie](#gestion-du-cycle-de-vie)
7. [Gestion des erreurs](#gestion-des-erreurs)
8. [Configuration et paramètres](#configuration-et-paramètres)
9. [Tests et validation](#tests-et-validation)
10. [Exemples complets](#exemples-complets)

---

## Architecture des plugins

### Système de plugins

MynetworK utilise un système de plugins modulaire où chaque plugin :
- Hérite de `BasePlugin`
- Est géré par `PluginManager`
- Est stocké dans `server/plugins/[plugin-id]/`
- Peut être activé/désactivé dynamiquement
- Ne fait **AUCUN** appel API si non activé

### Structure des répertoires

```
server/plugins/
├── base/
│   ├── BasePlugin.ts          # Classe de base abstraite
│   └── PluginInterface.ts     # Interfaces TypeScript
├── freebox/
│   ├── FreeboxPlugin.ts       # Plugin Freebox
│   └── FreeboxApiService.ts    # Service API Freebox
├── unifi/
│   ├── UniFiPlugin.ts         # Plugin UniFi
│   └── UniFiApiService.ts     # Service API UniFi
└── GUIDE_PLUGINS.md           # Ce guide
```

---

## Création d'un nouveau plugin

### Étape 1 : Créer le répertoire

```bash
mkdir -p server/plugins/[plugin-id]
```

Exemple : `server/plugins/scan-reseau/`

### Étape 2 : Créer le service API (optionnel)

Si le plugin nécessite des appels API externes, créer un service dédié :

```typescript
// server/plugins/scan-reseau/ScanReseauApiService.ts
export class ScanReseauApiService {
    private config: any;
    
    constructor() {
        // Initialisation sans appel API
    }
    
    setConfig(config: any): void {
        this.config = config;
    }
    
    async scan(): Promise<any> {
        // Appels API uniquement ici
    }
}
```

### Étape 3 : Créer le plugin

```typescript
// server/plugins/scan-reseau/ScanReseauPlugin.ts
import { BasePlugin } from '../base/BasePlugin.js';
import type { PluginConfig, PluginStats } from '../base/PluginInterface.js';

export class ScanReseauPlugin extends BasePlugin {
    private apiService: ScanReseauApiService;

    constructor() {
        super('scan-reseau', 'Scan Réseau', '1.0.0');
        this.apiService = new ScanReseauApiService();
    }

    // Implémenter les méthodes requises...
}
```

### Étape 4 : Enregistrer le plugin

Dans `server/services/pluginManager.ts` :

```typescript
import { ScanReseauPlugin } from '../plugins/scan-reseau/ScanReseauPlugin.js';

constructor() {
    this.registerPlugin(new FreeboxPlugin());
    this.registerPlugin(new UniFiPlugin());
    this.registerPlugin(new ScanReseauPlugin()); // Nouveau plugin
}
```

---

## Règles obligatoires

### ⚠️ RÈGLE 1 : Désactivation par défaut

**TOUS les plugins doivent être désactivés par défaut.**

- Le `PluginManager` crée automatiquement `enabled: false` dans la base de données
- Ne jamais forcer l'activation au démarrage
- L'utilisateur doit activer manuellement via l'interface

### ⚠️ RÈGLE 2 : Aucun appel API si non activé

**NE JAMAIS faire d'appels API si le plugin n'est pas activé.**

Vérifications obligatoires dans :
- `start()` : Vérifier `isEnabled()` avant tout appel API
- `getStats()` : Vérifier `isEnabled()` et la configuration
- `testConnection()` : Retourner `false` si non activé

### ⚠️ RÈGLE 3 : Configuration requise

**Vérifier que tous les paramètres requis sont présents avant de se connecter.**

```typescript
if (!requiredParam1 || !requiredParam2) {
    console.log('[Plugin] Required parameters not configured, skipping connection');
    return; // Ne pas lancer d'erreur, juste retourner
}
```

### ⚠️ RÈGLE 4 : Pas d'appels API dans initialize()

**La méthode `initialize()` ne doit JAMAIS faire d'appels API.**

Elle sert uniquement à :
- Stocker la configuration
- Initialiser les services
- Préparer les structures de données

---

## Structure d'un plugin

### Template complet

```typescript
import { BasePlugin } from '../base/BasePlugin.js';
import type { PluginConfig, PluginStats, Device } from '../base/PluginInterface.js';

export class MonPlugin extends BasePlugin {
    private apiService: MonApiService;

    constructor() {
        super('mon-plugin', 'Mon Plugin', '1.0.0');
        this.apiService = new MonApiService();
    }

    /**
     * Initialisation du plugin
     * NE PAS faire d'appels API ici !
     */
    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        
        const settings = config.settings;
        
        // Configuration du service uniquement
        if (settings?.url) {
            this.apiService.setUrl(settings.url as string);
        }
    }

    /**
     * Démarrage du plugin
     * Vérifications obligatoires avant tout appel API
     */
    async start(): Promise<void> {
        // BasePlugin.start() vérifie déjà si le plugin est activé
        await super.start();
        
        // Double vérification : ne pas continuer si non activé
        if (!this.isEnabled()) {
            console.log('[MonPlugin] Plugin is not enabled, skipping connection');
            return;
        }
        
        // Vérifier la configuration
        if (!this.config) {
            console.log('[MonPlugin] No configuration available, skipping connection');
            return;
        }
        
        const settings = this.config.settings;
        
        // Vérifier que tous les paramètres requis sont présents
        const requiredParam1 = settings?.param1 as string;
        const requiredParam2 = settings?.param2 as string;
        
        if (!requiredParam1 || !requiredParam2) {
            console.log('[MonPlugin] Required parameters not configured, skipping connection');
            return;
        }
        
        // Maintenant seulement, faire l'appel API
        try {
            await this.apiService.connect(requiredParam1, requiredParam2);
            console.log('[MonPlugin] Connected successfully');
        } catch (error) {
            console.error('[MonPlugin] Connection failed:', error);
            throw error;
        }
    }

    /**
     * Arrêt du plugin
     */
    async stop(): Promise<void> {
        // Nettoyer les connexions
        if (this.apiService.isConnected()) {
            try {
                await this.apiService.disconnect();
            } catch (error) {
                console.error('[MonPlugin] Error during disconnect:', error);
            }
        }
        await super.stop();
    }

    /**
     * Récupération des statistiques
     * Vérifications obligatoires avant tout appel API
     */
    async getStats(): Promise<PluginStats> {
        // Vérifier que le plugin est activé
        if (!this.isEnabled()) {
            throw new Error('MonPlugin is not enabled');
        }

        // Vérifier la configuration
        if (!this.config) {
            throw new Error('MonPlugin is not configured');
        }

        // Vérifier la connexion, reconnecter si nécessaire
        if (!this.apiService.isConnected()) {
            try {
                await this.start();
            } catch (error) {
                throw new Error(`MonPlugin not connected: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        try {
            // Faire les appels API
            const [devicesData, networkData, systemData] = await Promise.allSettled([
                this.apiService.getDevices(),
                this.apiService.getNetworkStats(),
                this.apiService.getSystemInfo()
            ]);

            // Normaliser les données
            const devices: Device[] = [];
            if (devicesData.status === 'fulfilled' && devicesData.value) {
                devices.push(...devicesData.value.map((d: any) => ({
                    id: d.id || '',
                    name: d.name || 'Unknown',
                    ip: d.ip,
                    mac: d.mac,
                    type: d.type || 'unknown',
                    active: d.active !== false,
                    lastSeen: d.lastSeen ? new Date(d.lastSeen) : undefined
                })));
            }

            return {
                devices,
                network: networkData.status === 'fulfilled' ? networkData.value : {},
                system: systemData.status === 'fulfilled' ? systemData.value : {}
            };
        } catch (error) {
            console.error('[MonPlugin] Failed to get stats:', error);
            throw error;
        }
    }

    /**
     * Test de connexion
     * Retourner false si non activé ou non configuré
     */
    async testConnection(): Promise<boolean> {
        // Ne pas tester si le plugin n'est pas activé
        if (!this.isEnabled()) {
            return false;
        }
        
        // Ne pas tester si pas de configuration
        if (!this.config) {
            return false;
        }
        
        // Vérifier les paramètres requis
        const settings = this.config.settings;
        const requiredParam1 = settings?.param1 as string;
        const requiredParam2 = settings?.param2 as string;
        
        if (!requiredParam1 || !requiredParam2) {
            return false;
        }
        
        try {
            return await this.apiService.testConnection();
        } catch {
            return false;
        }
    }
}
```

---

## Interface PluginInterface

### PluginConfig

```typescript
interface PluginConfig {
    id: string;                    // ID unique du plugin
    enabled: boolean;              // État d'activation
    settings: Record<string, unknown>; // Paramètres de configuration
}
```

### PluginStats

```typescript
interface PluginStats {
    devices?: Device[];            // Liste des appareils
    network?: {                    // Statistiques réseau
        download?: number;
        upload?: number;
        [key: string]: unknown;
    };
    system?: {                     // Statistiques système
        temperature?: number;
        uptime?: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;        // Champs additionnels
}
```

### Device

```typescript
interface Device {
    id: string;                    // ID unique
    name: string;                  // Nom de l'appareil
    ip?: string;                   // Adresse IP
    mac?: string;                  // Adresse MAC
    type?: string;                 // Type d'appareil
    active?: boolean;              // État actif/inactif
    lastSeen?: Date;              // Dernière fois vu
    [key: string]: unknown;        // Champs additionnels
}
```

---

## Gestion du cycle de vie

### Ordre d'exécution

1. **Enregistrement** : Le plugin est enregistré dans `PluginManager`
2. **Initialisation** : `initialize(config)` est appelé avec la config de la DB
3. **Démarrage** : `start()` est appelé **SEULEMENT** si `enabled: true`
4. **Utilisation** : `getStats()` peut être appelé pour récupérer les données
5. **Arrêt** : `stop()` est appelé lors de la désactivation

### Flux de démarrage

```
PluginManager.initializePlugin()
    ↓
plugin.initialize(config)  ← Pas d'appels API ici
    ↓
if (config.enabled) {
    plugin.start()  ← Vérifications + appels API ici
}
```

### Flux de récupération des stats

```
getStats()
    ↓
Vérifier isEnabled()  ← Obligatoire
    ↓
Vérifier config  ← Obligatoire
    ↓
Vérifier connexion  ← Si nécessaire, reconnecter
    ↓
Appels API  ← Ici seulement
    ↓
Normaliser les données
    ↓
Retourner PluginStats
```

---

## Gestion des erreurs

### Principes

1. **Ne pas lancer d'erreur si non activé** : Juste retourner silencieusement
2. **Logger toutes les erreurs** : Avec le préfixe `[PluginName]`
3. **Messages d'erreur clairs** : Expliquer ce qui a échoué
4. **Gérer les erreurs réseau** : Utiliser `Promise.allSettled()` pour les appels parallèles

### Exemples

```typescript
// ✅ BON : Retour silencieux si non activé
if (!this.isEnabled()) {
    console.log('[Plugin] Not enabled, skipping');
    return;
}

// ❌ MAUVAIS : Lancer une erreur
if (!this.isEnabled()) {
    throw new Error('Plugin not enabled'); // Ne pas faire ça !
}

// ✅ BON : Logger l'erreur avec préfixe
try {
    await this.apiService.connect();
} catch (error) {
    console.error('[MonPlugin] Connection failed:', error);
    throw error;
}

// ✅ BON : Gérer les erreurs avec Promise.allSettled
const [result1, result2] = await Promise.allSettled([
    this.apiService.getData1(),
    this.apiService.getData2()
]);

if (result1.status === 'rejected') {
    console.error('[MonPlugin] Failed to get data1:', result1.reason);
}
```

---

## Configuration et paramètres

### Stockage de la configuration

La configuration est stockée dans la base de données SQLite :
- Table : `plugin_configs`
- Champs : `plugin_id`, `enabled`, `settings` (JSON)

### Accès à la configuration

```typescript
// Dans le plugin
const settings = this.config?.settings;
const param1 = settings?.param1 as string;
const param2 = settings?.param2 as number;
```

### Configuration par défaut

Le `PluginManager` crée automatiquement :
```typescript
{
    pluginId: 'mon-plugin',
    enabled: false,  // Toujours false par défaut
    settings: {}     // Vide par défaut
}
```

### Validation des paramètres

```typescript
// Vérifier les paramètres requis
const requiredParams = ['url', 'username', 'password'];
const missingParams = requiredParams.filter(param => !settings?.[param]);

if (missingParams.length > 0) {
    console.log(`[MonPlugin] Missing required parameters: ${missingParams.join(', ')}`);
    return; // Ne pas lancer d'erreur, juste retourner
}
```

---

## Tests et validation

### Test de connexion

La méthode `testConnection()` doit :
1. Vérifier que le plugin est activé
2. Vérifier que la configuration est présente
3. Vérifier que les paramètres requis sont présents
4. Tester la connexion sans modifier l'état
5. Retourner `true` si OK, `false` sinon

```typescript
async testConnection(): Promise<boolean> {
    if (!this.isEnabled() || !this.config) {
        return false;
    }
    
    const settings = this.config.settings;
    if (!settings?.url || !settings?.username) {
        return false;
    }
    
    try {
        return await this.apiService.testConnection();
    } catch {
        return false;
    }
}
```

### Validation des données

```typescript
// Normaliser et valider les données avant de les retourner
const devices: Device[] = rawDevices
    .filter(d => d.id && d.name)  // Filtrer les données invalides
    .map(d => ({
        id: d.id || '',
        name: d.name || 'Unknown',
        // ...
    }));
```

---

## Exemples complets

### Exemple 1 : Plugin simple (sans API externe)

```typescript
export class SimplePlugin extends BasePlugin {
    private data: any[] = [];

    constructor() {
        super('simple', 'Simple Plugin', '1.0.0');
    }

    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        // Initialiser les structures de données
        this.data = [];
    }

    async start(): Promise<void> {
        await super.start();
        if (!this.isEnabled()) return;
        
        // Traitement local uniquement
        this.data = this.processLocalData();
    }

    async getStats(): Promise<PluginStats> {
        if (!this.isEnabled()) {
            throw new Error('SimplePlugin is not enabled');
        }
        
        return {
            devices: this.data.map(d => ({
                id: d.id,
                name: d.name,
                active: true
            }))
        };
    }

    async testConnection(): Promise<boolean> {
        return this.isEnabled();
    }
}
```

### Exemple 2 : Plugin avec API REST

```typescript
export class RestApiPlugin extends BasePlugin {
    private apiService: RestApiService;

    constructor() {
        super('rest-api', 'REST API Plugin', '1.0.0');
        this.apiService = new RestApiService();
    }

    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        const settings = config.settings;
        if (settings?.baseUrl) {
            this.apiService.setBaseUrl(settings.baseUrl as string);
        }
    }

    async start(): Promise<void> {
        await super.start();
        if (!this.isEnabled()) return;
        if (!this.config) return;
        
        const settings = this.config.settings;
        const apiKey = settings?.apiKey as string;
        
        if (!apiKey) {
            console.log('[RestApiPlugin] API key not configured');
            return;
        }
        
        try {
            await this.apiService.authenticate(apiKey);
        } catch (error) {
            console.error('[RestApiPlugin] Authentication failed:', error);
            throw error;
        }
    }

    async getStats(): Promise<PluginStats> {
        if (!this.isEnabled() || !this.config) {
            throw new Error('RestApiPlugin is not enabled or configured');
        }
        
        if (!this.apiService.isAuthenticated()) {
            await this.start();
        }
        
        const data = await this.apiService.fetchData();
        
        return {
            devices: data.devices || [],
            network: data.network || {}
        };
    }

    async testConnection(): Promise<boolean> {
        if (!this.isEnabled() || !this.config) return false;
        
        const settings = this.config.settings;
        if (!settings?.apiKey) return false;
        
        try {
            return await this.apiService.testConnection();
        } catch {
            return false;
        }
    }
}
```

---

## Checklist de création

Avant de considérer un plugin comme terminé, vérifier :

- [ ] Le plugin hérite de `BasePlugin`
- [ ] Le plugin est enregistré dans `PluginManager`
- [ ] `enabled: false` par défaut
- [ ] Aucun appel API dans `initialize()`
- [ ] Vérification `isEnabled()` dans `start()`
- [ ] Vérification `isEnabled()` dans `getStats()`
- [ ] Vérification de la configuration avant les appels API
- [ ] Gestion des erreurs avec logs préfixés
- [ ] `testConnection()` retourne `false` si non activé
- [ ] Normalisation des données dans `getStats()`
- [ ] Documentation du plugin (commentaires)

---

## Notes importantes pour les IA

### ⚠️ Règles absolues

1. **NE JAMAIS** faire d'appels API si `enabled: false`
2. **NE JAMAIS** faire d'appels API dans `initialize()`
3. **TOUJOURS** vérifier `isEnabled()` avant tout appel API
4. **TOUJOURS** vérifier la configuration avant de se connecter
5. **TOUJOURS** logger les erreurs avec le préfixe `[PluginName]`

### 🔍 Points de vérification

Lors de la création ou modification d'un plugin, vérifier :
- Le plugin est-il désactivé par défaut ?
- Y a-t-il des appels API dans `initialize()` ?
- Y a-t-il des vérifications dans `start()` ?
- Y a-t-il des vérifications dans `getStats()` ?
- Les erreurs sont-elles loggées avec préfixe ?

### 📝 Format des logs

```typescript
// ✅ BON
console.log('[MonPlugin] Plugin initialized');
console.error('[MonPlugin] Connection failed:', error);

// ❌ MAUVAIS
console.log('Plugin initialized');  // Pas de préfixe
console.error(error);  // Pas de contexte
```

---

## Support et questions

Pour toute question sur le développement de plugins :
1. Consulter ce guide
2. Examiner les plugins existants (Freebox, UniFi)
3. Vérifier `BasePlugin.ts` pour les méthodes disponibles
4. Vérifier `PluginInterface.ts` pour les types

---

**Dernière mise à jour** : 2025-01-14  
**Version** : 1.0.0

