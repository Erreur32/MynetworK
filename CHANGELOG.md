# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.


## [0.2.6] - 2025-12-28

### 🐛 Corrigé

**Exports Prometheus - Parsing des Valeurs**
- ✅ Correction de l'erreur `strconv.ParseFloat: parsing "[object": invalid syntax`
- ✅ Fonction utilitaire `toPrometheusNumber()` pour convertir toutes les valeurs en nombres valides
- ✅ Gestion correcte des objets (extraction automatique de `usage`, `percentage`, `value`)
- ✅ Protection contre les valeurs null, undefined, NaN et Infinity
- ✅ Conversion des booléens en 0 ou 1 pour Prometheus

**Exports Prometheus - Métriques Système**
- ✅ Correction de `mynetwork_cpu_usage` : utilisation de `sys.cpu.usage` au lieu de l'objet `sys.cpu`
- ✅ Correction de `mynetwork_memory_*` : utilisation de `toPrometheusNumber()` pour toutes les valeurs
- ✅ Gestion du `percentage` depuis l'API ou calcul automatique si manquant
- ✅ Correction de `mynetwork_disk_*` : gestion correcte de `mountpoint` vs `mount` et conversion des valeurs

**Exports Prometheus - Métriques Réseau et Plugins**
- ✅ Correction de toutes les métriques réseau (download/upload) avec conversion sécurisée
- ✅ Correction des métriques plugins (uptime, temperature, memory, cpu) avec extraction correcte des valeurs
- ✅ Correction des métriques scan réseau (totalIps, onlineIps, offlineIps, unknownIps)
- ✅ Protection de toutes les valeurs contre les objets non convertis

**Exports InfluxDB - Cohérence**
- ✅ Application des mêmes corrections pour les exports InfluxDB
- ✅ Conversion sécurisée de toutes les valeurs avec `toPrometheusNumber()`
- ✅ Arrondi correct des valeurs entières pour InfluxDB (`i` suffix)

### 🔧 Modifié

**Service Métriques - Architecture**
- 🔧 Ajout de la fonction utilitaire `toPrometheusNumber()` pour centraliser la conversion des valeurs
- 🔧 Extraction automatique des propriétés numériques depuis les objets (`usage`, `percentage`, `value`)
- 🔧 Gestion unifiée des cas limites (null, undefined, objets, NaN, Infinity)
- 🔧 Application cohérente de la conversion sur toutes les métriques (Prometheus et InfluxDB)

---

## [0.2.5] - 2025-12-28

### ✨ Ajouté

**Monitoring de Latence - Système Complet**
- 📊 Nouveau système de monitoring de latence inspiré de Lagident
- 🎯 Activation/désactivation du monitoring par IP depuis la page scanner
- 📈 Graphique scatter chart avec affichage des mesures de latence sur plusieurs jours
- 🎨 Graphique identique à Lagident : axes Latency/Loss/Temps, couleurs vert/orange/rouge selon la latence
- 📊 Statistiques affichées : Avg1h, Min, Max, Packet Loss %
- 🔄 Mesures automatiques toutes les 15 secondes pour les IPs surveillées
- 💾 Stockage des mesures avec valeurs décimales précises (REAL au lieu de INTEGER)

**Page Scanner - Colonnes Statistiques Latence**
- 📊 Nouvelles colonnes "Avg1h" et "Max" dans le tableau scanner
- 🎨 Couleurs dynamiques selon la valeur de latence (vert < 50ms, jaune/orange 50-150ms, rouge > 150ms)
- 📈 Affichage des valeurs avec 3 décimales pour précision maximale
- 🔘 Colonne "Monitoring" avec toggle pour activer/désactiver le suivi
- 📊 Icône graphique cliquable pour voir le graphique de latence si monitoring activé

**Graphique de Latence - Modal Complet**
- 🖼️ Modal plein écran avec graphique scatter chart haute qualité
- 📅 Affichage des données sur 90 jours avec tous les points
- 🎯 Format adaptatif de l'axe X selon la période (DD/MM HH:MM pour < 2 jours, DD/MM HHh pour 2-7 jours, DD/MM pour > 7 jours)
- 📊 Échelle Y dynamique avec algorithme identique à Lagident (démarre à 0, padding adaptatif)
- 🎨 Couleurs des points selon la latence (vert < 50ms, jaune 50-100ms, orange 100-150ms, rouge > 150ms)
- 📉 Représentation des pertes de paquets par lignes rouges sur l'axe Loss
- 🎨 Barre de légende avec dégradé de couleurs (LOW/HIGH)
- 📊 Fond sombre pour meilleur contraste visuel

**Page Scanner - Améliorations Visuelles**
- 🎨 Couleurs alternées pour les lignes paires/impaires du tableau (meilleure différenciation)
- 🖱️ Effet hover amélioré sur les lignes avec ombre et transition fluide
- 🎨 Colonne IP avec couleur personnalisée rgb(152, 181, 238) pour meilleure visibilité
- 📊 Barres statistiques agrandies (64px au lieu de 48px) pour remplir le cadre
- 🎨 Dégradé de transparence depuis le bas pour adoucir la couleur claire du haut (Total IPs)
- 📅 Période des barres augmentée à 48 heures (au lieu de 24h)
- 🔧 Tooltips repositionnés pour éviter qu'ils soient coupés sur les bords

**Dashboard - Widget Scanner**
- 🎨 Style unifié avec la page scanner pour "Dernier Scan" et "Prochains scans"
- 🏷️ Badges "Complet" et "Rapide" alignés avec la page principale
- 📐 Format identique pour cohérence visuelle

### 🔧 Modifié

**Scanner Réseau - Parsing de Latence**
- 🔧 Parsing amélioré pour conserver les valeurs décimales (parseFloat au lieu de parseInt)
- 📊 Support des valeurs décimales pour Windows et Linux
- 💾 Stockage des latences avec décimales dans la base de données (REAL au lieu de INTEGER)
- ✅ Correction pour inclure les latences de 0ms comme valeurs valides

**Base de Données - Schéma Latence**
- 💾 Table `latency_measurements` avec colonne `latency` en REAL pour valeurs décimales
- 💾 Table `network_scans` avec colonne `ping_latency` en REAL pour valeurs décimales
- 🔄 Migration automatique lors de la création des tables

**Graphique de Latence - Affichage**
- 📊 Affichage des valeurs avec 3 décimales dans le tooltip et les statistiques
- 🎯 Échelle Y adaptative avec algorithme identique à Lagident
- 📅 Format de l'axe X adaptatif selon la période affichée
- 🎨 Fond du graphique plus sombre (#0f0f0f) pour meilleur contraste

**Page Scanner - Tableau**
- 🎨 Couleurs de fond alternées : lignes paires (#111111), lignes impaires (#0e1013a3)
- 🖱️ Hover uniforme sur toutes les lignes avec fond #1d1d1d
- 📐 Transitions fluides pour tous les effets visuels

### 🐛 Corrigé

**Monitoring de Latence - Valeurs à 0ms**
- ✅ Correction du problème où toutes les valeurs affichaient 0ms dans le graphique
- ✅ Conversion explicite des valeurs avec Number() lors de l'enregistrement
- ✅ Affichage correct des valeurs décimales dans le graphique

**Scanner Réseau - Latence Manquante**
- ✅ Correction pour que les équipements Linux et Windows aient leur latence enregistrée
- ✅ Condition modifiée pour inclure les latences de 0ms (latency >= 0 au lieu de latency > 0)
- ✅ Parsing amélioré pour détecter les latences très faibles (< 1ms)

**TypeScript - Typage**
- ✅ Ajout de l'interface NetworkScanResponse pour typer la réponse API
- ✅ Correction de l'erreur "Property 'hostname' does not exist on type 'unknown'"

**Tooltips - Positionnement**
- ✅ Repositionnement des tooltips pour éviter qu'ils soient coupés sur les bords
- ✅ Alignement à gauche pour la première barre, à droite pour la dernière

---

## [0.2.4] - 2025-12-27

### ✨ Ajouté

**Page Scan Réseau - Protection contre les Scans Multiples**
- 🛡️ Protection côté serveur pour empêcher les scans simultanés
- 🔒 Vérification de l'état du scan avant d'en démarrer un nouveau
- ⚠️ Messages d'erreur clairs si un scan est déjà en cours
- 🚫 Protection côté client contre les clics multiples rapides

**Page Scan Réseau - Ajout Manuel d'IP**
- ➕ Nouvelle fonctionnalité pour ajouter manuellement une IP à scanner
- 📝 Modal avec champs IP, MAC (optionnel) et hostname (optionnel)
- 🔍 Scan immédiat de l'IP ajoutée avec détection MAC et hostname
- 💾 Enregistrement dans la base de données avec source "manual"

### 🔧 Modifié

**Page Scan Réseau - Affichage des Prochains Scans**
- 🎨 Amélioration du visuel des prochains scans (Full Scan et Refresh)
- 🏷️ Badges colorés pour distinguer "Complet" (violet) et "Rapide" (bleu)
- 📐 Alignement parfait des badges entre les différents types de scans
- 📝 Texte simplifié : "Full Scan" et "Refresh" au lieu de "Prochain Full Scan"
- 🎯 Badges positionnés avant le temps pour meilleure lisibilité

**Scanner Réseau - Détection Windows Améliorée**
- 🪟 Amélioration de la détection des machines Windows
- ⚡ Correction du parsing des latences très faibles (< 1ms)
- 🔍 Détection améliorée des pings Linux vers Windows avec indicateurs `icmp_seq=`
- ✅ Acceptation des latences de 0ms comme pings réussis

### 🐛 Corrigé

**Scanner Réseau - Détection Windows**
- ✅ Correction du problème où les PC Windows n'étaient pas détectés lors des scans
- ✅ Correction du parsing de latence qui excluait les valeurs de 0ms
- ✅ Amélioration de la détection des pings réussis même avec latence très faible

**Scanner Réseau - Scans Multiples**
- ✅ Correction du problème où plusieurs scans pouvaient se lancer simultanément
- ✅ Protection contre les scans multiples côté serveur et client
- ✅ Prévention des conflits entre scans manuels et automatiques

---

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
