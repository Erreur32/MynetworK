# Guide de Développement - MynetwoK

## 📋 Table des matières

1. [Vue d'ensemble du projet](#vue-densemble-du-projet)
2. [Architecture](#architecture)
3. [Processus de développement d'une nouvelle fonctionnalité](#processus-de-développement-dune-nouvelle-fonctionnalité)
4. [Outils nécessaires](#outils-nécessaires)
5. [Exemple pratique : Ajouter une nouvelle fonctionnalité](#exemple-pratique--ajouter-une-nouvelle-fonctionnalité)
6. [Bonnes pratiques](#bonnes-pratiques)

---

## Vue d'ensemble du projet

**MynetwoK** est un **dashboard multi-sources** pour gérer Freebox, UniFi et vos réseaux. Il est construit avec :

- **Frontend** : React 19 + TypeScript + Vite + Tailwind CSS
- **Backend** : Express 5 + Node.js + TypeScript
- **State Management** : Zustand
- **API** : Freebox OS API (v14/v15)
- **Déploiement** : Docker

### Structure du projet

```
MynetwoK/
├── src/                    # Frontend React
│   ├── api/               # Client API (appelle le backend)
│   ├── components/        # Composants React réutilisables
│   │   ├── layout/       # Header, Footer
│   │   ├── modals/       # Modales (WiFi, VPN, etc.)
│   │   ├── ui/           # Composants UI (Button, Card, etc.)
│   │   └── widgets/      # Widgets du dashboard
│   ├── hooks/            # Hooks React personnalisés
│   ├── pages/            # Pages principales
│   ├── stores/           # State management (Zustand)
│   ├── types/            # Types TypeScript
│   └── utils/            # Utilitaires
│
├── server/                # Backend Express
│   ├── routes/           # Routes API (endpoints)
│   ├── services/         # Services métier
│   │   ├── freeboxApi.ts # Client API Freebox
│   │   └── ...
│   ├── middleware/       # Middlewares Express
│   └── types/            # Types backend
│
├── docker-compose.yml     # Configuration Docker
└── Dockerfile            # Build Docker
```

---

## Architecture

### Flux de données

```
┌─────────────┐
│   Browser   │
│  (React)    │
└──────┬──────┘
       │ HTTP/WebSocket
       │
┌──────▼──────────┐
│  Backend Express │
│  (server/)      │
└──────┬──────────┘
       │ HTTPS
       │
┌──────▼──────────┐
│  Freebox API    │
│  (mafreebox...) │
└─────────────────┘
```

### Comment ça fonctionne ?

1. **Frontend (React)** : L'utilisateur interagit avec l'interface
2. **Client API** (`src/api/client.ts`) : Envoie des requêtes HTTP au backend
3. **Backend Express** (`server/`) : Reçoit les requêtes et les transforme
4. **Service Freebox API** (`server/services/freeboxApi.ts`) : Communique avec la Freebox
5. **Freebox** : Retourne les données via son API

---

## Processus de développement d'une nouvelle fonctionnalité

### Étape 1 : Identifier l'endpoint Freebox API

Consultez la [documentation Freebox API](https://dev.freebox.fr/sdk/os/) pour trouver l'endpoint correspondant à votre fonctionnalité.

**Exemple** : Pour gérer les ports du switch, l'endpoint est `/switch/port/`

### Étape 2 : Ajouter la méthode dans `freeboxApi.ts`

Ouvrez `server/services/freeboxApi.ts` et ajoutez une nouvelle méthode :

```typescript
// Exemple : Récupérer le statut des ports du switch
async getSwitchPorts(): Promise<FreeboxApiResponse<SwitchPort[]>> {
    return this.request<SwitchPort[]>('GET', API_ENDPOINTS.SWITCH_PORT);
}
```

### Étape 3 : Créer la route backend

Créez ou modifiez un fichier dans `server/routes/` :

```typescript
// server/routes/switch.ts
import { Router } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/switch/ports - Get switch ports status
router.get('/ports', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getSwitchPorts();
  res.json(result);
}));

export default router;
```

### Étape 4 : Enregistrer la route dans `server/index.ts`

```typescript
import switchRoutes from './routes/switch.js';

// Dans la section des routes
app.use('/api/switch', switchRoutes);
```

### Étape 5 : Ajouter la constante dans `src/utils/constants.ts`

```typescript
export const API_ROUTES = {
  // ... autres routes
  SWITCH_PORTS: '/api/switch/ports',
} as const;
```

### Étape 6 : Créer le store Zustand (state management)

Créez `src/stores/switchStore.ts` :

```typescript
import { create } from 'zustand';
import { api } from '../api/client';
import { API_ROUTES } from '../utils/constants';

interface SwitchState {
  ports: SwitchPort[];
  isLoading: boolean;
  error: string | null;
  fetchPorts: () => Promise<void>;
}

export const useSwitchStore = create<SwitchState>((set) => ({
  ports: [],
  isLoading: false,
  error: null,

  fetchPorts: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<SwitchPort[]>(API_ROUTES.SWITCH_PORTS);
      if (response.success && response.result) {
        set({ ports: response.result, isLoading: false });
      } else {
        set({ error: response.error?.message || 'Erreur', isLoading: false });
      }
    } catch (error) {
      set({ error: 'Erreur réseau', isLoading: false });
    }
  },
}));
```

### Étape 7 : Créer le composant React

Créez `src/components/widgets/SwitchPanel.tsx` :

```typescript
import React from 'react';
import { useSwitchStore } from '../../stores/switchStore';

export const SwitchPanel: React.FC = () => {
  const { ports, isLoading, fetchPorts } = useSwitchStore();

  React.useEffect(() => {
    fetchPorts();
  }, [fetchPorts]);

  if (isLoading) {
    return <div>Chargement...</div>;
  }

  return (
    <div>
      {ports.map((port) => (
        <div key={port.id}>
          Port {port.id}: {port.status}
        </div>
      ))}
    </div>
  );
};
```

### Étape 8 : Ajouter le widget au dashboard

Dans `src/App.tsx`, importez et utilisez votre composant :

```typescript
import { SwitchPanel } from './components/widgets';

// Dans le JSX du dashboard
<Card title="Ports Switch">
  <SwitchPanel />
</Card>
```

### Étape 9 : Ajouter les types TypeScript

Créez ou modifiez `src/types/api.ts` :

```typescript
export interface SwitchPort {
  id: number;
  status: 'up' | 'down';
  speed?: number;
  // ... autres propriétés
}
```

---

## Outils nécessaires

### 1. **Node.js** (version 20+)

Installez Node.js depuis [nodejs.org](https://nodejs.org/)

### 2. **npm** (gestionnaire de paquets)

Inclus avec Node.js

### 3. **Docker** (optionnel mais recommandé)

Pour tester dans un environnement similaire à la production :
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (Windows/Mac)
- [Docker Engine](https://docs.docker.com/engine/install/) (Linux)

### 4. **Éditeur de code**

Recommandé : **Visual Studio Code** avec extensions :
- ESLint
- Prettier
- TypeScript
- Tailwind CSS IntelliSense

### 5. **Outils de développement**

- **Chrome DevTools** : Pour déboguer le frontend
- **Postman** ou **curl** : Pour tester les API
- **Git** : Pour versionner votre code

---

## Exemple pratique : Ajouter une nouvelle fonctionnalité

### Cas d'usage : Ajouter la gestion des ports du switch

#### 1. Vérifier l'endpoint Freebox

D'après la documentation Freebox, l'endpoint est `/switch/port/`

#### 2. Ajouter dans `server/config.ts`

```typescript
export const API_ENDPOINTS = {
  // ... autres endpoints
  SWITCH_PORT: '/switch/port/',
};
```

#### 3. Ajouter la méthode dans `server/services/freeboxApi.ts`

```typescript
async getSwitchPorts(): Promise<FreeboxApiResponse<SwitchPort[]>> {
    return this.request<SwitchPort[]>('GET', API_ENDPOINTS.SWITCH_PORT);
}

async updateSwitchPort(portId: number, config: Partial<SwitchPort>): Promise<FreeboxApiResponse<SwitchPort>> {
    return this.request<SwitchPort>('PUT', `${API_ENDPOINTS.SWITCH_PORT}${portId}`, config);
}
```

#### 4. Créer `server/routes/switch.ts`

```typescript
import { Router } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/ports', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getSwitchPorts();
  res.json(result);
}));

router.put('/ports/:id', asyncHandler(async (req, res) => {
  const portId = parseInt(req.params.id, 10);
  const result = await freeboxApi.updateSwitchPort(portId, req.body);
  res.json(result);
}));

export default router;
```

#### 5. Enregistrer dans `server/index.ts`

```typescript
import switchRoutes from './routes/switch.js';

app.use('/api/switch', switchRoutes);
```

#### 6. Ajouter les constantes dans `src/utils/constants.ts`

```typescript
export const API_ROUTES = {
  // ... autres routes
  SWITCH_PORTS: '/api/switch/ports',
} as const;
```

#### 7. Créer le store `src/stores/switchStore.ts`

```typescript
import { create } from 'zustand';
import { api } from '../api/client';
import { API_ROUTES } from '../utils/constants';
import type { SwitchPort } from '../types/api';

interface SwitchState {
  ports: SwitchPort[];
  isLoading: boolean;
  error: string | null;
  fetchPorts: () => Promise<void>;
  updatePort: (portId: number, config: Partial<SwitchPort>) => Promise<boolean>;
}

export const useSwitchStore = create<SwitchState>((set, get) => ({
  ports: [],
  isLoading: false,
  error: null,

  fetchPorts: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<SwitchPort[]>(API_ROUTES.SWITCH_PORTS);
      if (response.success && response.result) {
        set({ ports: response.result, isLoading: false });
      } else {
        set({ error: response.error?.message || 'Erreur', isLoading: false });
      }
    } catch (error) {
      set({ error: 'Erreur réseau', isLoading: false });
    }
  },

  updatePort: async (portId: number, config: Partial<SwitchPort>) => {
    try {
      const response = await api.put<SwitchPort>(`${API_ROUTES.SWITCH_PORTS}/${portId}`, config);
      if (response.success) {
        // Rafraîchir la liste
        await get().fetchPorts();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
}));
```

#### 8. Créer le composant `src/components/widgets/SwitchPanel.tsx`

```typescript
import React from 'react';
import { useSwitchStore } from '../../stores/switchStore';
import { Card } from './Card';
import { Toggle } from '../ui/Toggle';

export const SwitchPanel: React.FC = () => {
  const { ports, isLoading, fetchPorts, updatePort } = useSwitchStore();

  React.useEffect(() => {
    fetchPorts();
  }, [fetchPorts]);

  const handleToggle = async (portId: number, enabled: boolean) => {
    await updatePort(portId, { enabled });
  };

  if (isLoading) {
    return <div className="text-center text-gray-500 py-4">Chargement...</div>;
  }

  return (
    <div className="space-y-2">
      {ports.map((port) => (
        <div key={port.id} className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded">
          <span className="text-sm">Port {port.id}</span>
          <Toggle
            checked={port.enabled}
            onChange={(checked) => handleToggle(port.id, checked)}
          />
        </div>
      ))}
    </div>
  );
};
```

#### 9. Ajouter au dashboard dans `src/App.tsx`

```typescript
import { SwitchPanel } from './components/widgets';

// Dans le JSX
<Card title="Ports Switch">
  <SwitchPanel />
</Card>
```

#### 10. Ajouter les types dans `src/types/api.ts`

```typescript
export interface SwitchPort {
  id: number;
  enabled: boolean;
  status: 'up' | 'down';
  speed?: number;
  duplex?: 'half' | 'full';
}
```

---

## Bonnes pratiques

### 1. **Gestion des erreurs**

Toujours gérer les erreurs dans vos appels API :

```typescript
try {
  const response = await api.get('/api/endpoint');
  if (response.success) {
    // Traiter le succès
  } else {
    // Afficher l'erreur à l'utilisateur
    console.error(response.error);
  }
} catch (error) {
  // Erreur réseau
  console.error('Erreur réseau:', error);
}
```

### 2. **Types TypeScript**

Toujours définir les types pour vos données :

```typescript
// ✅ Bon
interface MyData {
  id: number;
  name: string;
}

// ❌ Mauvais
const data: any = await api.get('/api/endpoint');
```

### 3. **Nommage des fichiers**

- **Composants** : PascalCase (`SwitchPanel.tsx`)
- **Stores** : camelCase avec suffixe `Store` (`switchStore.ts`)
- **Routes** : camelCase (`switch.ts`)
- **Types** : PascalCase (`SwitchPort`)

### 4. **Commentaires**

Tous les commentaires doivent être en **anglais** et détaillés :

```typescript
/**
 * Fetches the list of switch ports from the Freebox API.
 * Updates the store with the retrieved data or sets an error state.
 * 
 * @returns Promise that resolves when the fetch is complete
 */
fetchPorts: async () => {
  // Implementation
}
```

### 5. **Indentation**

Utiliser **4 espaces** (pas de tabulations) :

```typescript
// ✅ Bon (4 espaces)
function myFunction() {
    const data = 'test';
}

// ❌ Mauvais (tabulations)
function myFunction() {
	const data = 'test';
}
```

### 6. **Polling (rafraîchissement automatique)**

Pour les données qui changent souvent, utiliser le hook `usePolling` :

```typescript
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS } from '../utils/constants';

usePolling(fetchPorts, {
  enabled: isLoggedIn,
  interval: POLLING_INTERVALS.devices // 10000ms
});
```

### 7. **Tests en développement**

Utiliser le mode développement avec hot-reload :

```bash
# Mode développement (sans Docker)
npm run dev

# Mode développement (avec Docker)
docker compose -f docker-compose.dev.yml up --build
```

### 8. **Documentation de l'API Freebox**

Consultez toujours la [documentation officielle](https://dev.freebox.fr/sdk/os/) avant d'implémenter une fonctionnalité.

---

## Commandes utiles

### Développement

```bash
# Installer les dépendances
npm install

# Lancer en mode développement (frontend + backend)
npm run dev

# Build pour production
npm run build

# Lancer en production
npm start
```

### Docker

```bash
# Lancer en production
docker-compose up -d

# Lancer en développement (avec hot-reload)
docker compose -f docker-compose.dev.yml up --build

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

### Debug

```bash
# Voir les logs du backend
npm run dev:server

# Voir les logs du frontend
npm run dev:client

# Tester une route API avec curl
curl http://localhost:3001/api/switch/ports
```

---

## Ressources

- [Documentation Freebox API](https://dev.freebox.fr/sdk/os/)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)

---

## Questions fréquentes

### Comment tester une nouvelle route API ?

Utilisez `curl` ou Postman :

```bash
curl http://localhost:3001/api/switch/ports
```

### Comment déboguer le frontend ?

1. Ouvrez Chrome DevTools (F12)
2. Allez dans l'onglet "Console"
3. Les erreurs et logs apparaîtront ici

### Comment déboguer le backend ?

Les logs apparaissent dans le terminal où vous avez lancé `npm run dev:server`

### Mon changement ne s'affiche pas ?

1. Vérifiez que le serveur de développement est lancé
2. Vérifiez la console du navigateur pour les erreurs
3. Videz le cache du navigateur (Ctrl+Shift+R)

### Comment ajouter une nouvelle page ?

1. Créez `src/pages/MaPage.tsx`
2. Ajoutez la route dans `src/App.tsx`
3. Ajoutez le bouton de navigation dans `src/components/layout/Footer.tsx`

---

**Bon développement ! 🚀**

