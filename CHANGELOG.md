# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

## [0.1.2] - 2025-12-19

### 🐛 Corrigé

**Build & Docker**
- ✅ Correction des warnings CSS lors du build (sélecteurs invalides avec crochets échappés remplacés par des sélecteurs d'attribut CSS valides)
- ✅ Correction du warning Docker de sécurité concernant `FREEBOX_TOKEN_FILE` dans le Dockerfile (déplacé vers variables d'environnement runtime)
- ✅ Correction du problème de permissions SQLite dans Docker (ajout d'un script d'entrée pour corriger les permissions du volume au démarrage)
- ✅ Amélioration de la détection automatique du chemin du token Freebox en production Docker

**Logs**
- ✅ Suppression des logs de debug FreeboxPlugin (BSS items) qui polluaient les logs Docker

### ✨ Ajouté

**Page UniFi - Améliorations**
- 📡 Ajout de l'affichage des bandes WiFi (2.4GHz, 5GHz, 6GHz) sur les cartes UniFi :
  - Dans la carte UniFi du dashboard (colonne "Bandes" dans le tableau des APs)
  - Dans l'onglet "Points d'accès" de la page UniFi (badges colorés cyan)
- 🔍 Ajout d'un filtre wired/wireless dans l'onglet Clients UniFi :
  - Filtre par défaut : uniquement les clients sans fil (wireless)
  - Options : "Sans fil", "Filaire", "Tous"
  - Filtre combinable avec le filtre de statut (actif/inactif)

**Styles & Thèmes**
- 🎨 Restauration des couleurs colorées pour toutes les cartes UniFi :
  - Dégradés bleu/cyan caractéristiques d'UniFi selon le thème
  - Effets glass et backdrop-blur pour les thèmes modernes
  - Bordures colorées avec teinte bleue/cyan

### 🔧 Modifié

**Docker**
- `Dockerfile` :
  - Ajout de `su-exec` pour le script d'entrée
  - Ajout du script `docker-entrypoint.sh` pour corriger les permissions au démarrage
  - Retrait de `FREEBOX_TOKEN_FILE` et `FREEBOX_HOST` du Dockerfile (déplacés vers variables d'environnement)
- `docker-entrypoint.sh` : Nouveau script d'entrée qui corrige automatiquement les permissions de `/app/data` au démarrage

**Backend**
- `server/config.ts` : Amélioration de la détection automatique du chemin du token en production Docker (détection du répertoire `/app`)
- `server/plugins/freebox/FreeboxPlugin.ts` : Suppression des logs de debug BSS

**Frontend**
- `src/styles/themes.css` : 
  - Remplacement de tous les sélecteurs CSS invalides (`.bg-\[#1a1a1a\]`) par des sélecteurs d'attribut valides (`[class*="bg-[#1a1a1a]"]`)
  - Ajout de dégradés colorés pour les cartes UniFi selon chaque thème
- `src/components/widgets/PluginSummaryCard.tsx` :
  - Ajout de la colonne "Bandes" dans le tableau des APs UniFi
  - Fonction `getUnifiBands()` pour extraire les bandes depuis `radio_table`
- `src/pages/UniFiPage.tsx` :
  - Ajout du filtre wired/wireless dans l'onglet Clients
  - Ajout de l'affichage des bandes dans l'onglet "Points d'accès"
  - Filtre par défaut : wireless uniquement

**Configuration**
- `src/constants/version.ts` : Version mise à jour à 0.1.2

### 🔒 Sécurité

**Docker**
- ✅ Retrait des variables d'environnement sensibles du Dockerfile (conformité aux bonnes pratiques Docker)
- ✅ Les variables sont maintenant définies uniquement au runtime via docker-compose ou variables d'environnement

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.1.2

---

## [0.1.1] - 2025-12-18

### 🐛 Corrigé

**Plugin Freebox - Persistance de Session**
- ✅ Correction de la perte de session Freebox après redémarrage Docker en mode développement
- ✅ Correction du chemin du token Freebox en mode `npm run dev` (recherche automatique de `package.json` pour trouver la racine du projet)
- ✅ Unification de l'instance `FreeboxApiService` : le plugin utilise maintenant le singleton `freeboxApi` partagé avec les routes API, garantissant la cohérence de la session
- ✅ Amélioration de la restauration automatique de session au démarrage du plugin

**Interface Utilisateur**
- ✅ Correction de l'affichage conditionnel : le graphique de bande passante Freebox et les données DHCP/NAT ne s'affichent que si le plugin est authentifié et connecté
- ✅ Correction du message "Configuration requise" qui apparaissait incorrectement en mode `npm run dev`

### ✨ Ajouté

**Interface Utilisateur - Tooltips**
- 🏷️ Ajout d'un badge ovale coloré affichant le nom du plugin dans les tooltips des badges de température (CPU, HDD, Fan) du header
- 🎨 Couleurs automatiques selon le plugin :
  - **Freebox** : Rouge atténué (couleur du logo Freebox)
  - **UniFi** : Bleu (couleur Ubiquiti/UniFi)
- 📍 Le badge apparaît en haut du tooltip, au-dessus du titre de la section

**Carte Plugin Freebox**
- 📊 Réorganisation de l'affichage DHCP et NAT en deux colonnes côte à côte
- 🔄 Renommage de "Redirections de port" en "NAT" pour plus de clarté
- 🎯 Amélioration de la lisibilité avec un layout en grille à deux colonnes

### 🔧 Modifié

**Backend - Gestion des Tokens**
- `server/config.ts` : Amélioration de la résolution du chemin du token en mode développement avec recherche automatique de la racine du projet via `package.json`
- `server/services/freeboxApi.ts` : Amélioration de la méthode `getTokenPath()` pour gérer correctement les chemins relatifs et absolus
- `server/plugins/freebox/FreeboxPlugin.ts` : 
  - Utilisation du singleton `freeboxApi` au lieu d'une instance séparée pour garantir le partage de la session
  - Ajout du rechargement du token au démarrage pour gérer les redémarrages Docker
  - Simplification de la logique de login pour correspondre au comportement du bouton "Auth"

**Frontend - Header**
- `src/components/layout/Header.tsx` : 
  - Ajout du composant Tooltip avec support du nom du plugin
  - Badge ovale coloré pour identifier la source des données
  - Application des couleurs selon le plugin (rouge pour Freebox, bleu pour UniFi)

**Frontend - Carte Plugin**
- `src/components/widgets/PluginSummaryCard.tsx` : 
  - Réorganisation de DHCP et NAT en deux colonnes avec `grid grid-cols-2`
  - Renommage "Redirections de port" → "NAT"
  - Amélioration de la structure conditionnelle pour n'afficher que si le plugin est actif

**Frontend - Dashboard**
- `src/pages/UnifiedDashboardPage.tsx` : Amélioration de la condition d'affichage du graphique de bande passante (uniquement si Freebox est configuré ET connecté)

### 🔒 Sécurité

**Vérifications Effectuées**
- ✅ Aucun token ou mot de passe en clair dans le code source
- ✅ Tous les tokens Freebox sont stockés dans des fichiers ignorés par Git (`.gitignore`)
- ✅ Les mots de passe utilisateurs sont hashés avec bcrypt
- ✅ Les secrets JWT sont gérés via variables d'environnement
- ✅ Les fichiers de configuration sensibles sont dans `.gitignore`

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.1.1
- `Docs/CONNEXION_FREEBOX.md` - Documentation existante sur la gestion des sessions Freebox

---

## [0.1.0] - 2025-12-17

### 🐛 Corrigé

### 🔧 Modifié

### 📝 Documentation

---

## [0.0.9] - 2025-12-17

### 🐛 Corrigé

### 🔧 Modifié

### 📝 Documentation

---

## [0.0.8] - 2025-12-17

### 🐛 Corrigé

### 🔧 Modifié

### 📝 Documentation

---

## [0.0.8] - 2025-12-16

### ✨ Ajouté

**Thème Modern**
- 🎨 Thème Modern amélioré avec dégradé mauve/bleu élégant
- ✨ Effets glass modernes avec backdrop-blur pour les cartes
- 🌈 Dégradé de fond fixe pour l'application (thème Modern)
- 🎯 Couleurs ajoutées aux icônes des sections admin
- 👁️ Exemples visuels pour chaque couleur dans l'éditeur de thème
- 📐 Champs couleur réduits avec bordures fines

**Interface Administration**
- 🎨 Section thème réorganisée de manière professionnelle
- 🎴 Cartes de prévisualisation avec effets glass élégants
- 🎨 Couleurs cohérentes entre onglets et sections

### 🔧 Modifié

**Thème Modern**
- Réduction de l'intensité du rose dans les dégradés (plus sobre)
- Amélioration des effets de lumière et reflets glass
- Optimisation des couleurs pour meilleure lisibilité
- Uniformisation des couleurs dans l'interface admin

**Fichiers modifiés**
- `src/components/ThemeSection.tsx` - Amélioration du thème Modern avec dégradés et effets glass
- `src/styles/themes.css` - Ajout du dégradé de fond fixe et effets glass pour le thème Modern
- `src/pages/SettingsPage.tsx` - Ajout de couleurs aux icônes des sections admin

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.0.8
- `commit-message.txt` - Message de commit pour la version 0.0.8

---

## [0.0.7] - 2025-12-16

### ✨ Ajouté

**Gestion des Utilisateurs**
- 👤 Gestion complète des utilisateurs dans l'administration
- 🖼️ Support de l'avatar utilisateur (upload Base64)
- 📧 Validation du format email côté client
- 🔑 Affichage/masquage du mot de passe avec icônes
- ✏️ Modification du nom d'utilisateur
- 📍 Affichage de la dernière connexion et IP

**Interface Administration**
- 📊 Section "Info" avec détails du projet, GitHub et auteur
- 🎨 Amélioration des couleurs des onglets admin (debug, info)
- 📦 Cartes plugins plus compactes avec informations détaillées (versions API, firmware)
- 🎯 Déplacement de la gestion des utilisateurs dans l'onglet Général

**Header Administration**
- ⏰ Affichage de la date et heure (style Freebox Revolution)
- 📌 Affichage de la version de l'application
- 🗑️ Suppression du bouton "Actualiser" redondant

### 🔧 Modifié

**Backend**
- `server/database/models/User.ts` - Support avatar, lastLoginIp, username modifiable
- `server/routes/users.ts` - Gestion de l'avatar et IP de connexion
- `server/services/authService.ts` - Enregistrement de l'IP lors de la connexion
- `server/config.ts` - Séparation des tokens Freebox dev/prod (.freebox_token-dev)

**Frontend**
- `src/pages/SettingsPage.tsx` - Amélioration du profil utilisateur et gestion des utilisateurs
- `src/components/ui/UserMenu.tsx` - Affichage de l'avatar dans le menu
- `src/components/PluginsManagementSection.tsx` - Cartes plugins améliorées

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.0.7

---

## [0.0.6] - 2025-12-16

### ✨ Ajouté

**Système de Logs**
- 📋 Affichage des logs de l'application dans l'onglet Debug
- 🔄 Système de polling pour les logs en temps réel (remplace WebSocket)
- 🏷️ Filtres par niveau de log avec badges (Tous, Error, Warn, Info, Debug, Verbose)
- 🧹 Bouton pour effacer les logs
- ⚙️ Option d'activation des logs de debug dans l'administration

**Vérification des Mises à Jour**
- 🔍 Système de vérification des versions Docker disponibles
- ⚙️ Option d'activation/désactivation dans l'administration
- 🔄 Support de l'API GitHub (REST, GraphQL, Tags)
- 📦 Support du GitHub Container Registry (ghcr.io)

### 🔧 Modifié

**Backend**
- `server/utils/logger.ts` - Intégration avec logBuffer pour stockage en mémoire
- `server/utils/logBuffer.ts` - Nouveau système de buffer de logs rotatif
- `server/routes/debug.ts` - Endpoints pour récupérer et effacer les logs
- `server/routes/updates.ts` - Système de vérification des mises à jour amélioré

**Frontend**
- `src/pages/SettingsPage.tsx` - Section de logs avec polling et filtres
- `src/stores/updateStore.ts` - Store pour la gestion des mises à jour

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.0.6

---

## [0.0.5] - 2025-12-16

### ✨ Ajouté

**Docker & CI/CD**
- 🐳 Configuration Docker complète avec Dockerfile optimisé
- 🔄 Workflow GitHub Actions pour build et publication automatique
- 📦 Publication sur GitHub Container Registry (ghcr.io)
- 🐙 Badge GitHub Actions dans le README
- 📚 Documentation nginx avec exemples de configuration

**Configuration**
- 🌐 Support de PUBLIC_URL pour accès direct ou via proxy nginx
- 📝 Fichier nginx.example.conf avec configurations HTTP/HTTPS
- 📋 Logs Docker affichent l'URL exacte du frontend

### 🔧 Modifié

**Backend**
- `server/index.ts` - Amélioration des logs de démarrage avec URL frontend
- Configuration du port par défaut (3000 pour cohérence Docker)

**Frontend**
- `src/components/widgets/SystemServerWidget.tsx` - Correction des imports BarChart et Activity

**Configuration**
- `docker-compose.yml` - Commentaires pour cas avec/sans nginx
- `.github/workflows/docker-publish.yml` - Workflow CI/CD complet

### 📝 Documentation

- `README.md` - Section nginx ajoutée avec exemples
- `Docs/nginx.example.conf` - Configuration nginx complète
- `CHANGELOG.md` - Ajout de la version 0.0.5

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

