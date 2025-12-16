# Architecture Système de Plugins - Analyse de Faisabilité

## 📋 Résumé Exécutif

**Projet** : MyscanR - Dashboard multi-sources avec système de plugins (Freebox, UniFi, Scan Réseau)

**Faisabilité** : ✅ **TRÈS FAISABLE**

Le projet actuel a déjà une architecture modulaire qui facilite cette transformation. La migration peut se faire progressivement sans casser l'existant.

---

## 🎯 Objectifs du Projet

1. **Conserver le plugin Freebox** (déjà fonctionnel)
2. **Ajouter un plugin UniFi** (nouveau)
3. **Ajouter un plugin Scan Réseau** (nouveau)
4. **Système d'authentification utilisateur** (multi-utilisateurs)
5. **Système de logs** (audit et historique)

---

## ✅ Analyse de Faisabilité

### Points Positifs

1. **Architecture déjà modulaire** : Le code est bien organisé avec séparation backend/frontend
2. **Service API isolé** : `freeboxApi.ts` peut facilement devenir un plugin
3. **Stores Zustand** : Facile à étendre pour gérer plusieurs sources
4. **TypeScript** : Typage fort facilite la refactorisation
5. **Docker** : Infrastructure déjà en place

### Défis à Résoudre

1. **Base de données** : Actuellement tout est en mémoire, il faut ajouter une DB pour :
   - Utilisateurs
   - Logs
   - Configuration des plugins
2. **Authentification** : Actuellement liée à Freebox, il faut un système indépendant
3. **Gestion multi-sources** : Interface pour activer/désactiver des plugins
4. **Normalisation des données** : Unifier les formats entre Freebox, UniFi, etc.

---

## 🏗️ Architecture Proposée

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend React                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Dashboard│  │ Settings │  │  Logs    │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
└───────┼─────────────┼─────────────┼─────────────────────┘
        │             │             │
        └─────────────┼─────────────┘
                     │
        ┌────────────▼────────────┐
        │   Backend Express       │
        │  ┌──────────────────┐  │
        │  │  Auth Service    │  │  ← Authentification utilisateurs
        │  │  (JWT/Sessions)  │  │
        │  └──────────────────┘  │
        │  ┌──────────────────┐  │
        │  │  Plugin Manager   │  │  ← Gestion des plugins
        │  └──────────────────┘  │
        │  ┌──────────────────┐  │
        │  │  Logging Service  │  │  ← Système de logs
        │  └──────────────────┘  │
        └────────────┬─────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼────┐  ┌───▼────┐  ┌───▼────┐
   │ Freebox │  │ UniFi  │  │  Scan  │
   │ Plugin  │  │ Plugin  │  │ Plugin │
   └────┬────┘  └───┬────┘  └───┬────┘
        │           │           │
   ┌────▼────┐  ┌───▼────┐  ┌───▼────┐
   │ Freebox │  │ UniFi  │  │ Network│
   │   API   │  │  API   │  │ Scanner│
   └─────────┘  └────────┘  └────────┘
```

### Structure des Répertoires Proposée

```
MyscanR/
├── src/                          # Frontend (inchangé)
│   ├── components/
│   ├── pages/
│   │   ├── DashboardPage.tsx    # Vue unifiée multi-sources
│   │   ├── PluginsPage.tsx      # Gestion des plugins
│   │   ├── UsersPage.tsx        # Gestion utilisateurs
│   │   └── LogsPage.tsx         # Visualisation logs
│   ├── stores/
│   │   ├── authStore.ts         # Auth utilisateurs (nouveau)
│   │   ├── pluginStore.ts       # Gestion plugins (nouveau)
│   │   ├── freeboxStore.ts      # Store Freebox (refactorisé)
│   │   ├── unifiStore.ts        # Store UniFi (nouveau)
│   │   └── scanStore.ts         # Store Scan (nouveau)
│   └── ...
│
├── server/
│   ├── plugins/                 # NOUVEAU : Système de plugins
│   │   ├── base/
│   │   │   ├── PluginInterface.ts
│   │   │   └── BasePlugin.ts
│   │   ├── freebox/
│   │   │   ├── FreeboxPlugin.ts
│   │   │   ├── FreeboxApiService.ts  # Déplacé depuis services/
│   │   │   └── routes.ts
│   │   ├── unifi/
│   │   │   ├── UniFiPlugin.ts
│   │   │   ├── UniFiApiService.ts
│   │   │   └── routes.ts
│   │   └── scan/
│   │       ├── ScanPlugin.ts
│   │       ├── NetworkScanner.ts
│   │       └── routes.ts
│   │
│   ├── services/
│   │   ├── authService.ts       # NOUVEAU : Auth JWT
│   │   ├── userService.ts       # NOUVEAU : Gestion users
│   │   ├── pluginManager.ts     # NOUVEAU : Gestion plugins
│   │   └── loggingService.ts    # NOUVEAU : Système de logs
│   │
│   ├── database/                # NOUVEAU : Base de données
│   │   ├── models/
│   │   │   ├── User.ts
│   │   │   ├── PluginConfig.ts
│   │   │   └── Log.ts
│   │   ├── migrations/
│   │   └── connection.ts
│   │
│   ├── routes/
│   │   ├── auth.ts              # Refactorisé : Auth users
│   │   ├── plugins.ts           # NOUVEAU : Gestion plugins
│   │   ├── users.ts             # NOUVEAU : CRUD users
│   │   └── logs.ts              # NOUVEAU : API logs
│   │
│   └── middleware/
│       ├── authMiddleware.ts    # NOUVEAU : Protection routes
│       └── loggingMiddleware.ts # NOUVEAU : Log automatique
│
└── docker-compose.yml            # Ajouter PostgreSQL/MySQL
```

---

## 🔌 Système de Plugins

### Interface de Plugin

Chaque plugin doit implémenter cette interface :

```typescript
// server/plugins/base/PluginInterface.ts

export interface PluginConfig {
  id: string;              // 'freebox', 'unifi', 'scan'
  name: string;            // Nom affiché
  enabled: boolean;         // Actif/inactif
  settings: Record<string, unknown>; // Configuration spécifique
}

export interface PluginStats {
  devices?: Device[];
  network?: NetworkStats;
  system?: SystemStats;
  // ... autres stats communes
}

export interface IPlugin {
  // Identification
  getId(): string;
  getName(): string;
  getVersion(): string;

  // Lifecycle
  initialize(config: PluginConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isEnabled(): boolean;

  // Fonctionnalités
  getStats(): Promise<PluginStats>;
  testConnection(): Promise<boolean>;
  
  // Routes Express (optionnel)
  getRoutes?(): Router;
}
```

### Exemple : Plugin Freebox (Refactorisé)

```typescript
// server/plugins/freebox/FreeboxPlugin.ts

import { BasePlugin } from '../base/BasePlugin';
import { FreeboxApiService } from './FreeboxApiService';
import type { PluginStats, IPlugin } from '../base/PluginInterface';

export class FreeboxPlugin extends BasePlugin implements IPlugin {
  private apiService: FreeboxApiService;

  constructor() {
    super('freebox', 'Freebox', '1.0.0');
    this.apiService = new FreeboxApiService();
  }

  async initialize(config: PluginConfig): Promise<void> {
    await super.initialize(config);
    const url = config.settings.url as string || 'https://mafreebox.freebox.fr';
    this.apiService.setBaseUrl(url);
  }

  async getStats(): Promise<PluginStats> {
    if (!this.isEnabled()) {
      throw new Error('Plugin not enabled');
    }

    const [devices, connection, system] = await Promise.all([
      this.apiService.getLanHosts('pub'),
      this.apiService.getConnectionStatus(),
      this.apiService.getSystemInfo()
    ]);

    return {
      devices: devices.result || [],
      network: {
        download: connection.result?.rate_down || 0,
        upload: connection.result?.rate_up || 0,
        // ...
      },
      system: {
        temperature: system.result?.temp_cpum || 0,
        uptime: system.result?.uptime_val || 0,
        // ...
      }
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.apiService.getSystemInfo();
      return result.success;
    } catch {
      return false;
    }
  }

  getRoutes(): Router {
    const router = Router();
    // Routes spécifiques Freebox
    router.get('/devices', asyncHandler(async (_req, res) => {
      const result = await this.apiService.getLanHosts('pub');
      res.json(result);
    }));
    // ... autres routes
    return router;
  }
}
```

### Exemple : Plugin UniFi (Nouveau)

```typescript
// server/plugins/unifi/UniFiPlugin.ts

import { BasePlugin } from '../base/BasePlugin';
import { UniFiApiService } from './UniFiApiService';

export class UniFiPlugin extends BasePlugin implements IPlugin {
  private apiService: UniFiApiService;

  constructor() {
    super('unifi', 'UniFi Controller', '1.0.0');
    this.apiService = new UniFiApiService();
  }

  async initialize(config: PluginConfig): Promise<void> {
    await super.initialize(config);
    const { url, username, password, site } = config.settings;
    await this.apiService.login(
      url as string,
      username as string,
      password as string,
      site as string
    );
  }

  async getStats(): Promise<PluginStats> {
    const [devices, stats] = await Promise.all([
      this.apiService.getDevices(),
      this.apiService.getNetworkStats()
    ]);

    return {
      devices: devices.map(d => ({
        id: d._id,
        name: d.name,
        ip: d.ip,
        mac: d.mac,
        // ... mapping UniFi → format commun
      })),
      network: {
        download: stats.wan?.rx_bytes || 0,
        upload: stats.wan?.tx_bytes || 0,
      }
    };
  }

  async testConnection(): Promise<boolean> {
    return this.apiService.isAuthenticated();
  }
}
```

### Plugin Manager

```typescript
// server/services/pluginManager.ts

import { FreeboxPlugin } from '../plugins/freebox/FreeboxPlugin';
import { UniFiPlugin } from '../plugins/unifi/UniFiPlugin';
import { ScanPlugin } from '../plugins/scan/ScanPlugin';
import type { IPlugin, PluginStats } from '../plugins/base/PluginInterface';

export class PluginManager {
  private plugins: Map<string, IPlugin> = new Map();

  constructor() {
    // Enregistrer les plugins disponibles
    this.registerPlugin(new FreeboxPlugin());
    this.registerPlugin(new UniFiPlugin());
    this.registerPlugin(new ScanPlugin());
  }

  registerPlugin(plugin: IPlugin): void {
    this.plugins.set(plugin.getId(), plugin);
  }

  async initializePlugin(pluginId: string, config: PluginConfig): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }
    await plugin.initialize(config);
    if (config.enabled) {
      await plugin.start();
    }
  }

  async getStats(pluginId?: string): Promise<PluginStats | Record<string, PluginStats>> {
    if (pluginId) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin || !plugin.isEnabled()) {
        throw new Error(`Plugin ${pluginId} not enabled`);
      }
      return await plugin.getStats();
    }

    // Récupérer les stats de tous les plugins actifs
    const allStats: Record<string, PluginStats> = {};
    for (const [id, plugin] of this.plugins) {
      if (plugin.isEnabled()) {
        try {
          allStats[id] = await plugin.getStats();
        } catch (error) {
          console.error(`Error getting stats for plugin ${id}:`, error);
        }
      }
    }
    return allStats;
  }

  getPlugin(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const pluginManager = new PluginManager();
```

---

## 👤 Système d'Authentification Utilisateur

### Base de Données

**Option 1 : SQLite** (simple, pas de serveur séparé)
**Option 2 : PostgreSQL** (recommandé pour production)
**Option 3 : MySQL/MariaDB**

### Modèle Utilisateur

```typescript
// server/database/models/User.ts

export interface User {
  id: number;
  username: string;
  email: string;
  passwordHash: string;  // bcrypt
  role: 'admin' | 'user' | 'viewer';
  createdAt: Date;
  lastLogin?: Date;
  enabled: boolean;
}

// Permissions par plugin
export interface UserPluginPermissions {
  userId: number;
  pluginId: string;
  canView: boolean;
  canEdit: boolean;
}
```

### Service d'Authentification

```typescript
// server/services/authService.ts

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User } from '../database/models/User';

export class AuthService {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'change-me-in-production';
  }

  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const user = await this.findUserByUsername(username);
    if (!user || !user.enabled) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    // Mettre à jour lastLogin
    await this.updateLastLogin(user.id);

    // Générer JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      this.jwtSecret,
      { expiresIn: '7d' }
    );

    return { token, user };
  }

  async verifyToken(token: string): Promise<{ userId: number; username: string; role: string }> {
    try {
      return jwt.verify(token, this.jwtSecret) as { userId: number; username: string; role: string };
    } catch {
      throw new Error('Invalid token');
    }
  }

  // ... autres méthodes
}
```

### Middleware d'Authentification

```typescript
// server/middleware/authMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    role: string;
  };
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const decoded = await authService.verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};
```

---

## 📝 Système de Logs

### Modèle de Log

```typescript
// server/database/models/Log.ts

export interface Log {
  id: number;
  userId?: number;           // Utilisateur qui a fait l'action
  username?: string;         // Pour affichage même si user supprimé
  pluginId?: string;         // Plugin concerné
  action: string;            // 'login', 'plugin.enable', 'device.delete', etc.
  resource: string;          // 'user', 'plugin', 'device', etc.
  resourceId?: string;       // ID de la ressource
  details?: Record<string, unknown>; // Détails supplémentaires
  ipAddress?: string;        // IP de l'utilisateur
  userAgent?: string;        // Navigateur
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
}
```

### Service de Logging

```typescript
// server/services/loggingService.ts

import { Log } from '../database/models/Log';

export class LoggingService {
  async log(params: {
    userId?: number;
    username?: string;
    pluginId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    level?: 'info' | 'warning' | 'error';
  }): Promise<void> {
    const log: Omit<Log, 'id' | 'timestamp'> = {
      ...params,
      level: params.level || 'info',
    };

    // Sauvegarder en base de données
    await this.saveLog(log);

    // Optionnel : Écrire aussi dans un fichier
    console.log(`[${log.level.toUpperCase()}] ${log.action} on ${log.resource}`, log);
  }

  async getLogs(filters: {
    userId?: number;
    pluginId?: string;
    action?: string;
    level?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<Log[]> {
    // Requête SQL avec filtres
    // ...
  }

  private async saveLog(log: Omit<Log, 'id' | 'timestamp'>): Promise<void> {
    // Insertion en base de données
    // ...
  }
}
```

### Middleware de Logging Automatique

```typescript
// server/middleware/loggingMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import { loggingService } from '../services/loggingService';
import type { AuthenticatedRequest } from './authMiddleware';

export const autoLog = (
  action: string,
  resource: string,
  getResourceId?: (req: Request) => string | undefined
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Intercepter la réponse
    const originalSend = res.json;
    res.json = function (body) {
      // Logger après la réponse
      if (res.statusCode < 400) {
        loggingService.log({
          userId: req.user?.userId,
          username: req.user?.username,
          action,
          resource,
          resourceId: getResourceId?.(req),
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          level: res.statusCode >= 400 ? 'error' : 'info',
        });
      }
      return originalSend.call(this, body);
    };
    next();
  };
};
```

---

## 🔄 Plan de Migration Progressif

### Phase 1 : Infrastructure (Semaine 1-2)

1. ✅ Ajouter base de données (PostgreSQL/SQLite)
2. ✅ Créer modèles User, Log, PluginConfig
3. ✅ Implémenter AuthService avec JWT
4. ✅ Créer middleware d'authentification
5. ✅ Migrer routes existantes vers système auth

### Phase 2 : Système de Plugins (Semaine 3-4)

1. ✅ Créer interface IPlugin
2. ✅ Créer BasePlugin
3. ✅ Refactoriser FreeboxApiService en FreeboxPlugin
4. ✅ Créer PluginManager
5. ✅ Adapter routes pour utiliser PluginManager

### Phase 3 : Plugin UniFi (Semaine 5-6)

1. ✅ Créer UniFiApiService (client API UniFi)
2. ✅ Créer UniFiPlugin
3. ✅ Ajouter routes UniFi
4. ✅ Créer store UniFi côté frontend
5. ✅ Ajouter widgets UniFi au dashboard

### Phase 4 : Plugin Scan Réseau (Semaine 7-8)

1. ✅ Implémenter NetworkScanner (nmap, arp-scan, etc.)
2. ✅ Créer ScanPlugin
3. ✅ Ajouter routes scan
4. ✅ Créer store scan côté frontend
5. ✅ Ajouter widgets scan au dashboard

### Phase 5 : Système de Logs (Semaine 9-10)

1. ✅ Implémenter LoggingService
2. ✅ Ajouter middleware de logging automatique
3. ✅ Créer page de visualisation des logs
4. ✅ Ajouter filtres et recherche

### Phase 6 : Interface Utilisateur (Semaine 11-12)

1. ✅ Page de gestion des plugins
2. ✅ Page de gestion des utilisateurs
3. ✅ Page de visualisation des logs
4. ✅ Dashboard unifié multi-sources
5. ✅ Tests et polish

---

## 🛠️ Technologies à Ajouter

### Backend

```json
{
  "dependencies": {
    // Base de données
    "pg": "^8.11.0",              // PostgreSQL
    "sqlite3": "^5.1.6",          // SQLite (alternative)
    "typeorm": "^0.3.17",         // ORM (optionnel)
    "prisma": "^5.0.0",           // ORM moderne (recommandé)
    
    // Authentification
    "jsonwebtoken": "^9.0.0",     // JWT
    "bcrypt": "^5.1.0",           // Hash passwords
    
    // UniFi
    "node-unifi": "^1.3.0",       // Client UniFi API
    
    // Scan réseau
    "node-nmap": "^4.0.0",        // Nmap wrapper
    "arp": "^0.0.2",              // ARP scan
    
    // Utilitaires
    "winston": "^3.10.0",         // Logging avancé
    "dotenv": "^16.3.0"           // Variables d'environnement
  }
}
```

### Frontend

```json
{
  "dependencies": {
    // Gestion d'état (déjà présent)
    "zustand": "^5.0.9",
    
    // UI (déjà présent)
    "lucide-react": "^0.555.0",
    
    // Nouveau : Tables pour logs
    "@tanstack/react-table": "^8.10.0",
    
    // Nouveau : Formulaires
    "react-hook-form": "^7.47.0"
  }
}
```

---

## 📊 Exemple d'Utilisation

### Configuration d'un Plugin

```typescript
// Route : POST /api/plugins/:pluginId/config
{
  "enabled": true,
  "settings": {
    "url": "https://unifi.example.com",
    "username": "admin",
    "password": "***",
    "site": "default"
  }
}
```

### Récupération des Stats Unifiées

```typescript
// Route : GET /api/stats
// Retourne les stats de tous les plugins actifs
{
  "success": true,
  "result": {
    "freebox": {
      "devices": [...],
      "network": { "download": 1000000, "upload": 500000 },
      "system": { "temperature": 45, "uptime": 86400 }
    },
    "unifi": {
      "devices": [...],
      "network": { "download": 2000000, "upload": 1000000 }
    },
    "scan": {
      "devices": [...],
      "network": { "totalDevices": 25 }
    }
  }
}
```

### Dashboard Unifié

Le frontend peut maintenant afficher :
- **Vue globale** : Tous les appareils de tous les plugins
- **Vue par plugin** : Filtrer par source (Freebox, UniFi, Scan)
- **Comparaison** : Voir les différences entre sources
- **Statistiques agrégées** : Bande passante totale, nombre d'appareils, etc.

---

## ✅ Conclusion

### Faisabilité : **TRÈS ÉLEVÉE** ✅

**Pourquoi c'est faisable :**

1. ✅ Architecture déjà modulaire
2. ✅ Code bien organisé et typé
3. ✅ Technologies modernes et extensibles
4. ✅ Migration progressive possible
5. ✅ Pas besoin de tout réécrire

**Points d'attention :**

1. ⚠️ Ajouter une base de données (mais c'est standard)
2. ⚠️ Refactoriser l'auth Freebox (mais le code est isolé)
3. ⚠️ Normaliser les formats de données (mais c'est gérable)

**Recommandation :**

Commencer par la **Phase 1** (Infrastructure) pour poser les bases, puis migrer progressivement. Le plugin Freebox existant peut continuer à fonctionner pendant la migration.

---

## 🚀 Prochaines Étapes

1. **Valider cette architecture** avec vous
2. **Choisir la base de données** (PostgreSQL recommandé)
3. **Créer un plan détaillé** pour la Phase 1
4. **Commencer l'implémentation** étape par étape

**Souhaitez-vous que je commence par implémenter une partie spécifique ?**

