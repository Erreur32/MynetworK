# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.


## [0.2.3] - 2025-12-24

### ✨ Ajouté

**Recherche Exacte IP - Agrégation Complète des Données**
- 🔍 Nouvelle route API `/api/search/ip-details/:ip` pour agrégation des données depuis Scanner, Freebox et UniFi
- 📊 Affichage unifié de toutes les informations IP dans une seule carte sans redondance
- 🎯 Détection automatique des recherches IP exactes avec affichage dédié

**Recherche Exacte IP - Informations UniFi Détaillées**
- 📡 Affichage complet des informations client UniFi (AP connecté, switch, ports)
- 📶 Affichage de la bande passante (upload/download) avec formatage automatique
- 📻 Affichage du SSID avec badge stylé et icône WiFi
- 📊 Affichage de la force du signal (RSSI) avec barre de progression colorée et qualité
- 🔌 Affichage des ports switch pour les clients filaires avec badge stylé
- 🎯 Détection automatique WiFi/Filaire basée sur les champs disponibles (SSID, AP, ports)

**Recherche Exacte IP - Informations Freebox**
- 🏠 Affichage des informations DHCP (réservation statique ou DHCP dynamique)
- 🔀 Affichage des règles de port forwarding avec détails complets (ports WAN/LAN, protocole, statut)
- 📋 Badge visuel pour distinguer les réservations DHCP des allocations dynamiques

**Recherche Exacte IP - Design Moderne**
- 🎨 Affichage en grille responsive multi-colonnes (1/2/3 colonnes selon la taille d'écran)
- 💳 Cartes individuelles pour chaque type d'information avec effets hover
- 🎯 Design moderne avec bordures, ombres et transitions fluides
- 📱 Responsive design optimisé pour mobile, tablette et desktop

**Affichage de la Latence - Couleurs Dynamiques**
- 🎨 Couleurs automatiques selon la valeur de latence (< 10ms: vert, 10-30ms: vert clair, 30-50ms: jaune, 50-100ms: orange, > 100ms: rouge)
- 📊 Application des couleurs dans tous les affichages de latence (ping, scanner, résultats)
- 🎯 Fonctions utilitaires `getLatencyColor()` et `getLatencyBgColor()` pour cohérence visuelle

### 🔧 Modifié

**Recherche Exacte IP - Normalisation des Données**
- 🔄 Normalisation du SSID depuis plusieurs champs possibles (`ssid`, `essid`, `wifi_ssid`, `wlan_ssid`)
- 📶 Normalisation du signal RSSI depuis plusieurs sources (`rssi`, `signal`, `signal_strength`, `noise`)
- 🔀 Conversion automatique des valeurs positives en RSSI négatif si nécessaire
- 🎯 Détection améliorée du type de connexion (WiFi/Filaire) avec priorité au SSID

**API Recherche - Récupération UniFi**
- 🔍 Recherche améliorée des clients UniFi dans plusieurs sources (devices array, clients array, plugin stats)
- 📊 Logs de debug détaillés pour diagnostiquer les problèmes de récupération
- 🔄 Tentative de récupération depuis le plugin directement si non trouvé dans les stats

**Interface Utilisateur - Badges**
- 🏷️ Badge SSID avec icône WiFi et largeur adaptée au texte (`w-fit`)
- 🔌 Badge Port avec icône Cable pour les connexions filaires
- 🎨 Badges colorés pour le type de connexion (WiFi orange, Filaire gris)

### 🐛 Corrigé

**Recherche Exacte IP - Données UniFi**
- ✅ Correction de la récupération des clients UniFi depuis `devices` array avec `type === 'client'`
- ✅ Correction de l'affichage du SSID et du signal qui étaient vides
- ✅ Amélioration de la détection automatique WiFi/Filaire pour les clients avec `is_wired: false` et `is_wireless: false`
- ✅ Normalisation correcte du RSSI depuis le champ `signal` si `rssi` est positif ou manquant

**Syntaxe & Erreurs**
- ✅ Correction de l'erreur de syntaxe dans `server/routes/search.ts` (accolades manquantes)
- ✅ Correction de l'erreur JSX dans `SearchPage.tsx` (balises div non fermées)
- ✅ Correction de l'erreur `getLatencyColor is not defined` (fonctions utilitaires correctement définies)

**API Routes - Structure**
- ✅ Correction de la structure des blocs try-catch dans la route `/api/search/ip-details/:ip`
- ✅ Fermeture correcte de tous les blocs conditionnels et boucles

---

## [0.2.2] - 2025-12-23

### ✨ Ajouté

**Plugin Scan Réseau - Sauvegarde des Préférences Utilisateur**
- 💾 Sauvegarde automatique des préférences dans localStorage (filtre de statut, tri, nombre de résultats)
- 🔄 Restauration automatique des préférences au chargement de la page
- 📊 Persistance des choix utilisateur entre les sessions (filtre, colonne de tri, ordre de tri, pagination)

**Gestion du Thème - Chargement Automatique**
- 🎨 Chargement automatique des couleurs personnalisées après authentification utilisateur
- ⚡ Application immédiate des couleurs sans rechargement de page
- 🔄 Import dynamique de `initTheme()` pour éviter les dépendances circulaires

**Plugin Scan Réseau - Améliorations UI**
- 🔍 Barre de recherche agrandie et stylée avec placeholder descriptif
- 📏 Largeur minimale de 300px et maximale de 500px pour la barre de recherche
- 🎨 Effets visuels améliorés : bordure épaisse, coins arrondis, icône agrandie, bouton d'effacement
- 📍 Barre de recherche déplacée sur la même ligne que les menus de filtre
- 🎯 Alignement parfait de la hauteur avec les autres éléments de contrôle

### 🔧 Modifié

**Plugin Scan Réseau - Comportement par Défaut**
- 🔄 Filtre de statut par défaut changé de `'all'` à `'online'` pour afficher uniquement les IPs en ligne
- 📊 Tableau affiche par défaut uniquement les équipements actifs au démarrage

**Plugin Scan Réseau - Gestion de la Progression**
- 🔄 Réinitialisation correcte de `currentScanProgress` à `null` après la fin des scans
- 📊 Progression également initialisée et mise à jour pour les opérations de refresh
- ✅ Correction du problème de progression bloquée à 100% après la fin d'un scan

**Plugin Scan Réseau - Scheduler**
- 🚫 Désactivation du scan automatique au démarrage Docker pour éviter les scans inattendus
- 🔄 Statut `running` du scheduler basé sur la progression réelle du scan (via `getScanProgress()`)
- ✅ Correction de l'affichage de l'icône "Auto Full Scan" qui restait affichée après redémarrage

**Gestion du Thème - Optimisation**
- 🔒 Vérification de l'authentification avant l'appel API pour éviter les erreurs 401 au démarrage
- 🎨 Chargement conditionnel des couleurs personnalisées uniquement si un token JWT est présent
- ⚡ Amélioration des performances en évitant les appels API inutiles

**API Routes - Typage TypeScript**
- 📝 Ajout d'interfaces TypeScript pour les réponses API de purge (`PurgeResponse`, `PurgeAllResponse`, `ClearAllResponse`)
- 📝 Ajout d'interface `DatabaseStatsResponse` pour les statistiques de base de données
- ✅ Correction des erreurs TypeScript `Property 'deleted' does not exist on type 'unknown'`

**Interface Utilisateur - Tableau**
- 🔧 Correction de l'erreur d'hydratation React pour `<colgroup>` (suppression des espaces blancs)
- 📐 Toutes les balises `<col>` sur une seule ligne pour respecter les règles HTML strictes de React

### 🐛 Corrigé

**Authentification & Thème**
- ✅ Correction de l'erreur 401 au démarrage lors du chargement du thème (`/api/settings/theme`)
- ✅ Vérification du token JWT avant l'appel API pour éviter les erreurs non authentifiées
- ✅ Chargement automatique des couleurs personnalisées après connexion utilisateur

**Plugin Scan Réseau - Progression**
- ✅ Correction de la progression bloquée à 100% après la fin d'un scan
- ✅ Réinitialisation correcte de `currentScanProgress` après `scanNetwork()` et `refreshExistingIps()`
- ✅ Mise à jour de la progression pendant les opérations de refresh

**Plugin Scan Réseau - Scheduler**
- ✅ Correction du statut `running` qui restait `true` même après la fin d'un scan
- ✅ Vérification de la progression réelle via `networkScanService.getScanProgress()` au lieu du statut du cron
- ✅ Correction de l'icône "Auto Full Scan" qui s'affichait incorrectement après redémarrage Docker

**TypeScript - Typage API**
- ✅ Correction de `Property 'deleted' does not exist on type 'unknown'` dans `SettingsPage.tsx`
- ✅ Ajout de typage explicite pour toutes les réponses API de purge et statistiques
- ✅ Interfaces TypeScript complètes pour `PurgeResponse`, `PurgeAllResponse`, `DatabaseStatsResponse`, `ClearAllResponse`

**React - Hydratation**
- ✅ Correction de l'erreur d'hydratation pour `<colgroup>` : suppression des nœuds texte (espaces)
- ✅ Toutes les balises `<col>` sur une seule ligne sans espaces pour respecter les règles HTML strictes

---

## [0.2.1] - 2025-12-23
