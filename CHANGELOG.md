# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

## [0.0.6] - 2025-12-16

### 🐛 Corrigé

### 🔧 Modifié

### 📝 Documentation

---

## [0.0.5] - 2025-12-16

### 🐛 Corrigé

### 🔧 Modifié

### 📝 Documentation

---

## [0.0.4] - 2025-12-16

### 🐛 Corrigé

**Interface Utilisateur**
- ✅ Correction du bouton "Tester" dans le modal de configuration qui soumettait le formulaire et rafraîchissait la page
- ✅ Ajout du support du prop `type` au composant Button pour éviter la soumission accidentelle

**Plugin UniFi**
- ✅ Amélioration du test de connexion pour vérifier la récupération effective des données (devices/sites)
- ✅ Le test vérifie maintenant que les données sont accessibles, pas seulement la connexion
- ✅ Messages d'erreur plus informatifs pour faciliter le diagnostic

### 🔧 Modifié

**Backend**
- `server/plugins/unifi/UniFiApiService.ts` - Test de connexion amélioré pour vérifier la récupération des données
- `server/routes/plugins.ts` - Messages d'erreur plus détaillés pour le test de connexion

**Frontend**
- `src/components/ui/Button.tsx` - Ajout du support du prop `type` pour éviter la soumission du formulaire
- `src/components/modals/PluginConfigModal.tsx` - Utilisation de `type="button"` pour le bouton "Tester"

**Configuration**
- `package.json` - Version incrémentée à 0.0.4

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.0.4
- `README.md` - Mise à jour de la version

---

## [0.0.3] - 2025-12-16

### 🐛 Corrigé

**Plugin UniFi**
- ✅ Suppression complète du wrapper UniFiControllerWrapper qui causait des erreurs 400
- ✅ Retour à l'implémentation HTTP native uniquement (plus de dépendances vulnérables)
- ✅ Reproduction du pattern node-unifi pour les stats WAN via `/api/s/<site>/stat/dashboard`
- ✅ Amélioration de la gestion des erreurs et reconnexion automatique
- ✅ Correction de l'encodage du nom de site avec caractères spéciaux (ex: "☠ UniFi Netwok 32")

**Système Serveur**
- ✅ Correction de la détection des disques hôtes dans Docker (utilisation de chroot)
- ✅ Amélioration de la détection de la version Docker
- ✅ Correction de la détection du hostname hôte (filtrage des IDs de conteneur)

**Interface Utilisateur**
- ✅ Ajout d'un indicateur visuel d'erreur sur la carte plugin du dashboard principal
- ✅ Amélioration de l'affichage du résultat du test de connexion (message clair avec icône)
- ✅ Ajout de la version de l'application dans le header (v0.0.3)

**Sécurité**
- ✅ Suppression de `node-unifi` et de toutes ses dépendances vulnérables (request, form-data, tough-cookie)
- ✅ Remplacement par une implémentation HTTP native sécurisée
- ✅ Correction des vulnérabilités npm audit (0 vulnérabilités)

### 🔧 Modifié

**Backend**
- `server/plugins/unifi/UniFiApiService.ts` - Suppression du wrapper, utilisation HTTP native uniquement
- `server/routes/systemServer.ts` - Amélioration de la détection des disques et Docker version
- `server/routes/plugins.ts` - Amélioration du retour du test de connexion avec message détaillé

**Frontend**
- `src/components/widgets/PluginSummaryCard.tsx` - Ajout d'un bandeau d'alerte pour plugins non connectés
- `src/pages/PluginsPage.tsx` - Amélioration de l'affichage du résultat du test
- `src/components/layout/Header.tsx` - Ajout de la version de l'application
- `src/stores/pluginStore.ts` - Amélioration du retour du test de connexion avec message

**Configuration**
- `package.json` - Version incrémentée à 0.0.3
- `docker-compose.yml` - Configuration des volumes pour accès aux infos système hôte

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.0.3
- `README.md` - Mise à jour de la version

---

## [2.0.0-dev] - 2025-12-13

### 🎉 Ajouté - Système de Plugins Multi-Sources

#### Backend

**Base de Données**
- Ajout de SQLite pour la persistance des données
- Modèles : User, Log, PluginConfig
- Tables : users, logs, plugin_configs, user_plugin_permissions
- Initialisation automatique au démarrage

**Authentification Utilisateur**
- Système d'authentification JWT avec bcrypt
- Gestion des rôles (admin, user, viewer)
- Routes CRUD pour les utilisateurs (`/api/users/*`)
- Création automatique d'un utilisateur admin par défaut

**Système de Logs**
- Logging automatique de toutes les actions authentifiées
- Routes de consultation des logs (`/api/logs/*`)
- Filtres par utilisateur, plugin, action, niveau, période
- Nettoyage automatique des vieux logs

**Système de Plugins**
- Architecture modulaire avec interface commune (`IPlugin`)
- Plugin Manager pour gérer tous les plugins
- Plugin Freebox (refactorisé depuis freeboxApi)
- Plugin UniFi (nouveau)
- Routes de gestion des plugins (`/api/plugins/*`)

#### Frontend

**Stores Zustand**
- `userAuthStore` - Authentification utilisateur (JWT)
- `pluginStore` - Gestion des plugins

**Pages**
- `PluginsPage` - Gestion des plugins
- `UsersPage` - Gestion des utilisateurs (admin)
- `LogsPage` - Visualisation des logs (admin)

**Composants**
- `UserLoginModal` - Modal de connexion utilisateur

**Client API**
- `src/api/client.ts` - Support JWT avec import dynamique pour éviter les dépendances circulaires

**Intégration App.tsx**
- Double authentification : utilisateur JWT (requis) + Freebox (optionnel)
- Modal de connexion utilisateur au démarrage
- Nouvelles pages intégrées : Plugins, Users, Logs
- Footer mis à jour avec filtrage admin
- Polling conditionnel (nécessite utilisateur ET Freebox pour les données Freebox)
- Helper `renderPageWithFooter` pour éviter la duplication

**Documentation**
- `MODIFICATIONS_APP_TSX.md` - Documentation complète des modifications App.tsx
- `ROLLBACK_GUIDE.md` - Guide de retour en arrière

**Client API**
- Support du token JWT dans les requêtes
- Compatibilité avec l'authentification Freebox existante
- Import dynamique pour éviter les dépendances circulaires

**Intégration App.tsx**
- Double authentification : utilisateur JWT (requis) + Freebox (optionnel)
- Modal de connexion utilisateur au démarrage (`UserLoginModal`)
- Nouvelles pages intégrées dans le routing : Plugins, Users, Logs
- Footer mis à jour avec filtrage admin (onglets cachés pour non-admin)
- Polling conditionnel (nécessite utilisateur ET Freebox pour les données Freebox)
- Helper `renderPageWithFooter` pour éviter la duplication de code

#### Documentation

- `ARCHITECTURE_PLUGINS.md` - Architecture détaillée du système de plugins
- `GUIDE_DEVELOPPEMENT.md` - Guide de développement pour débutants
- `GUIDE_TEST_BACKEND.md` - Guide de test du backend
- `MIGRATION_GUIDE.md` - Guide de migration
- `IMPLEMENTATION_STATUS.md` - Statut d'implémentation
- `PROGRESSION_PROJET.md` - Suivi de la progression du projet
- `MODIFICATIONS_APP_TSX.md` - Documentation détaillée des modifications App.tsx
- `ROLLBACK_GUIDE.md` - Guide de retour en arrière

### 🔄 Modifié

**Backend**
- `server/index.ts` - Initialisation DB + plugins au démarrage
- `server/config.ts` - Port par défaut changé à 3002 (maintenant 3003)
- `server/services/freeboxApi.ts` - Export de la classe pour utilisation dans plugin
- `src/api/client.ts` - Support du token JWT avec import dynamique

**Frontend**
- `src/App.tsx` - Intégration complète du système d'auth utilisateur + nouvelles pages
- `src/components/layout/Footer.tsx` - Nouvelles pages + filtrage admin + prop userRole

**Structure**
- Réorganisation : `server/plugins/` pour les plugins
- Nouveau répertoire : `server/database/` pour la DB
- Nouveau répertoire : `server/middleware/` pour les middlewares

### 🔧 Technique

**Dépendances Ajoutées**
- `better-sqlite3` - Base de données SQLite
- `jsonwebtoken` - Authentification JWT
- `bcrypt` - Hash des mots de passe
- `node-unifi` - Client API UniFi

**Configuration**
- Support des variables d'environnement via `.env`
- Port configurable via `PORT` ou `SERVER_PORT`
- JWT secret configurable via `JWT_SECRET`

### ⚠️ Breaking Changes

Aucun breaking change. Toutes les routes Freebox existantes fonctionnent toujours.

### 📝 Notes

- L'authentification Freebox (existante) et l'authentification utilisateur (nouvelle) coexistent
- Le plugin Freebox peut être utilisé via le système de plugins ou directement via les routes existantes
- Migration progressive possible sans casser l'existant

---

## [2.0.0-dev] - 2025-12-14

### 🎨 Ajouté - Améliorations Frontend

**Système d'Export/Import de Configuration**
- Service `configService.ts` pour gérer l'export/import de configuration
- Format INI pour le fichier `.conf` externe
- Endpoints API :
  - `GET /api/config/export` - Exporter la configuration actuelle
  - `POST /api/config/import` - Importer depuis un fichier
  - `GET /api/config/file` - Vérifier le statut du fichier
  - `POST /api/config/sync` - Synchroniser manuellement
- Synchronisation automatique au démarrage :
  - Si `config/mynetwork.conf` existe → Import dans la base de données
  - Sinon → Export de la configuration actuelle
- Support Docker : montage du fichier `.conf` externe
- Documentation : `DOCUMENTATION_STOCKAGE.md` mis à jour
- Fichier exemple : `config/mynetwork.conf.example`

### 🎨 Ajouté - Améliorations Frontend (suite)

**Dashboard Principal**
- ✅ **Widgets système serveur** - Affichage CPU, RAM, Disque, Docker avec trafic réseau intégré
- ✅ **Plugin Summary Cards** - Cartes de résumé pour Freebox et UniFi avec stats
- ✅ **Navigation améliorée** - Boutons d'accès rapide aux plugins actifs dans le footer

**Page Plugins**
- ✅ **Infos Freebox détaillées** - Affichage du statut de connexion, modèle et API utilisée
- ✅ **Modal de connexion automatique** - Ouverture automatique du modal Freebox lors de l'activation

**Page UniFi**
- ✅ **Badges de stats système** - Affichage des stats UniFi dans le header (débit, uptime, devices)
- ✅ **Onglets fonctionnels** - Points d'accès et clients avec filtres améliorés
- ✅ **Informations du controller** - Affichage IP, port, utilisateur, site, mode API

**Header**
- ✅ **Badges de stats UniFi** - Remplacement de "UniFi Stats (à venir)" par des badges réels
- ✅ **Support multi-plugins** - Affichage conditionnel selon le plugin actif

**Footer**
- ✅ **Boutons plugins cross-page** - Accès aux plugins actifs depuis n'importe quelle page
- ✅ **Navigation améliorée** - Boutons Freebox/UniFi visibles sur dashboard et pages de plugins

### 🔧 Modifié

**Frontend**
- `src/App.tsx` - Ajout de `pluginStats` dans `usePluginStore`, passage des stats UniFi au Header
- `src/components/layout/Header.tsx` - Badges de stats UniFi au lieu de "à venir"
- `src/components/layout/Footer.tsx` - Boutons plugins accessibles depuis toutes les pages
- `src/pages/PluginsPage.tsx` - Affichage des infos Freebox (connexion, modèle, API)
- `src/pages/UniFiPage.tsx` - Filtres améliorés pour devices/clients, messages de débogage
- `src/components/widgets/SystemServerWidget.tsx` - Intégration du trafic réseau dans le même widget
- `src/pages/UnifiedDashboardPage.tsx` - Retrait du widget réseau séparé (intégré dans SystemServerWidget)

**Backend**
- `server/plugins/unifi/UniFiPlugin.ts` - Amélioration de la normalisation des devices (détection des APs)
- `server/plugins/unifi/UniFiApiService.ts` - Logs de débogage pour le diagnostic

### 🐛 Corrigé

- ✅ Correction de l'import en double `CheckCircle` dans `PluginsPage.tsx`
- ✅ Correction de l'affichage de la page UniFi (ajout de `pluginStats` dans App.tsx)
- ✅ Amélioration des filtres pour reconnaître les types UniFi (`uap`, `uap-ac`, etc.)

---

## [1.0.5-beta] - Version précédente

### Fonctionnalités
- Dashboard Freebox complet
- Gestion WiFi, LAN, Downloads, VMs, TV, Phone
- WebSocket pour données en temps réel
- Support Freebox Ultra, Delta, Pop

