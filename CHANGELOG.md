# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.


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
