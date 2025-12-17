# Template pour nouveaux plugins

Ce document décrit les bonnes pratiques pour créer un nouveau plugin dans MynetwoK.

## Structure de base

Tous les plugins doivent :
1. **Hériter de `BasePlugin`**
2. **Être désactivés par défaut** (`enabled: false`)
3. **Ne faire aucun appel API si non activé et non configuré**

## Exemple de plugin

```typescript
import { BasePlugin } from '../base/BasePlugin.js';
import type { PluginConfig, PluginStats, Device } from '../base/PluginInterface.js';

export class MonPlugin extends BasePlugin {
    private apiService: MonApiService;

    constructor() {
        super('mon-plugin', 'Mon Plugin', '1.0.0');
        this.apiService = new MonApiService();
    }

    async initialize(config: PluginConfig): Promise<void> {
        await super.initialize(config);
        
        // Configuration du service API uniquement si nécessaire
        const settings = config.settings;
        // Ne pas faire d'appels API ici !
    }

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
        } catch (error) {
            console.error('[MonPlugin] Connection failed:', error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        // Nettoyer les connexions
        if (this.apiService.isConnected()) {
            await this.apiService.disconnect();
        }
        await super.stop();
    }

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
            const data = await this.apiService.getData();
            
            // Normaliser les données
            return {
                devices: data.devices || [],
                network: data.network || {},
                system: data.system || {}
            };
        } catch (error) {
            console.error('[MonPlugin] Failed to get stats:', error);
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        // Ne pas tester si le plugin n'est pas activé
        if (!this.isEnabled()) {
            return false;
        }
        
        // Ne pas tester si pas de configuration
        if (!this.config) {
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

## Règles importantes

### 1. Désactivation par défaut
- Le plugin doit être créé avec `enabled: false` dans la base de données
- Le `PluginManager` gère cela automatiquement

### 2. Aucun appel API si non activé
- Dans `start()` : vérifier `isEnabled()` avant tout appel API
- Dans `getStats()` : vérifier `isEnabled()` et la configuration
- Dans `testConnection()` : retourner `false` si non activé

### 3. Gestion des erreurs
- Ne pas lancer d'erreur si le plugin n'est pas activé (juste retourner)
- Logger les erreurs avec le préfixe `[PluginName]`
- Fournir des messages d'erreur clairs

### 4. Configuration
- Vérifier que tous les paramètres requis sont présents avant de se connecter
- Ne pas faire d'appels API dans `initialize()`
- Stocker la configuration dans `this.config` (propriété protégée de `BasePlugin`)

## Enregistrement du plugin

Dans `server/services/pluginManager.ts` :

```typescript
constructor() {
    // Enregistrer tous les plugins disponibles
    this.registerPlugin(new FreeboxPlugin());
    this.registerPlugin(new UniFiPlugin());
    this.registerPlugin(new MonPlugin()); // Nouveau plugin
}
```

## Configuration par défaut

Le `PluginManager` crée automatiquement une configuration par défaut avec :
- `enabled: false`
- `settings: {}`

Aucune action supplémentaire n'est nécessaire.

