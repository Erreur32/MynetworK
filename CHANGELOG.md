# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.


## [0.6.0] - 2026-02-07

### ✨ Ajouté

**Docker - Build multi-arch (GHCR / Home Assistant 2026)**
- ✅ Workflow GitHub Actions : build et push pour `linux/amd64`, `linux/arm64`, `linux/arm/v7` (manifest list)
- ✅ Même tag d’image (`ghcr.io/.../mynetwork:0.6.0`) résolu automatiquement selon l’architecture (compatible Raspberry / HA add-on)
- ✅ Dockerfile : ARG `TARGETPLATFORM` / `BUILDPLATFORM`, stage builder et runtime en `FROM --platform=$TARGETPLATFORM` pour une image finale cohérente par arch
- ✅ Compilation des modules natifs (ex. better-sqlite3) pour l’arch cible (builder sur TARGETPLATFORM), plus de risque « wrong ELF class » sur ARM

### 🔧 Modifié

**Docker - Workflow**
- 🔧 `docker-publish.yml` : `platforms: linux/amd64,linux/arm64,linux/arm/v7` (QEMU + Buildx déjà en place)

**Docker - Dockerfile**
- 🔧 Stage builder : `FROM --platform=$TARGETPLATFORM` (au lieu de BUILDPLATFORM) pour compiler les natives pour la bonne arch
- 🔧 Stage runtime : `FROM --platform=$TARGETPLATFORM` + re-déclaration `ARG TARGETPLATFORM` avant le 2ᵉ stage

---

## [0.5.6] - 2026-02-07

### ✨ Ajouté

**UniFi - NAT / Gateway & Ports**
- ✅ Résumé gateway dans les stats système : `gatewaySummary` (IP, nom, modèle, WAN/LAN ports, `portCount`) et `natRulesCount`
- ✅ Extraction des ports WAN/LAN depuis `network_table` du gateway (quand exposé par l’API UniFi)
- ✅ Carte « Gateway & Ports » dans l’onglet NAT : blocs WAN (cyan) et LAN (emerald) avec liste des interfaces
- ✅ Colonne NAT (Info Système) enrichie : ports WAN avec IP/statut, ports LAN, nombre de règles NAT

**Freebox - Administration plugins**
- ✅ Avertissement dans la modale de configuration du plugin Freebox lorsque le plugin est désactivé : inviter à activer le plugin pour la découverte automatique

### 🔧 Modifié

**UniFi - Backend**
- 🔧 Correction TypeScript : `getNetworkConfig().catch()` retourne un objet avec `dhcpRange: undefined` pour garder un type cohérent
- 🔧 Récupération des règles NAT en parallèle dans `getStats()` (`getPortForwardingRules`) pour exposer le nombre et le résumé gateway

---

## [0.5.5] - 2026-02-04

### ✨ Ajouté

**Thème / Réglages - Animation "All"**
- ✅ Option pour choisir les animations incluses dans le cycle (cases à cocher par animation)
- ✅ Durée par animation étendue : de 5 s à 1 h (3600 s), affichage adapté (s / min / h)
- ✅ Paramètres "All" toujours affichés en réglages (réglages de transition, pas ceux de l'animation diffusée)

**Thème / Réglages - Opacité des blocs**
- ✅ Application de l'opacité au chargement de l'app (themeManager) : prise en compte sur toutes les pages (dashboard, réglages, etc.), pas seulement après passage par la page Réglages
- ✅ Chargement de l'opacité depuis l'API thème si disponible (cohérence multi-onglets / serveur)

### 🔧 Modifié

**Thème / Réglages - Organisation**
- 🔧 Personnalisation des couleurs du thème déplacée au-dessus de la section Animation
- 🔧 Titre clarifié : "Personnalisation des couleurs du thème" avec sous-texte explicite (interface, pas animation)

**Thème / Réglages - Animation "All"**
- 🔧 Suppression de l'option "Pause entre animations"
- 🔧 Vitesse d'animation globale masquée pour le mode "All" (chaque animation garde sa propre vitesse)
- 🔧 Durée par animation : relecture des paramètres à chaque tick (1 s) pour prise en compte immédiate du réglage

**Thème / Réglages - Options animation**
- 🔧 Paramètres affichés en grille multi-colonnes (1 / 2 / 3 colonnes selon écran)
- 🔧 Curseurs (sliders) plus fins, valeurs en gros avec unités (s, min, h, ms selon le paramètre)
- 🔧 Choix des animations (cycle "All") : chips et cases plus compacts

**Thème / Réglages - Bouton Réinitialiser**
- 🔧 Libellé raccourci : "Réinitialiser" (au lieu de "Réinitialiser cette animation")
- 🔧 Style ambre pour meilleure visibilité (bordure et fond ambre)

**App / Contexte animation**
- 🔧 Contexte des paramètres d'animation basé sur fullAnimationId (choix utilisateur) : en mode "All", les réglages affichés sont toujours ceux du défilement (durée, aléatoire, liste d'animations)

---
 

### ✨ Ajouté

**UniFi - Onglet NAT**
- ✅ Nouvel onglet "NAT" dans la page UniFi (placé après "Vue d'ensemble")
- ✅ Affichage de toutes les règles NAT/port forwarding configurées dans UniFi
- ✅ Détails des règles : nom, statut (Actif/Inactif), protocole, port destination, redirection (IP:port), source
- ✅ Filtre par statut : boutons "Tous" et "Actifs" pour filtrer les règles
- ✅ Compteur de règles : affiche "X règle(s) affichée(s) sur Y"
- ✅ Design cohérent avec les autres onglets UniFi (même style de cartes et badges)

**UniFi - API Backend NAT**
- ✅ Nouvelle méthode `getPortForwardingRules()` dans UniFiApiService pour récupérer les règles NAT depuis UniFi (`/api/s/<site>/rest/portforward`)
- ✅ Route API `GET /api/plugins/unifi/nat` pour exposer les règles NAT au frontend
- ✅ Normalisation des données : mapping des champs UniFi vers un format standardisé (id, name, enabled, protocol, dst_port, fwd_port, fwd_host, src, comment)

### 🔧 Modifié

**UniFi - Optimisation du Refresh NAT**
- 🔧 Séparation du chargement initial (`isInitialLoading`) et du refresh périodique (`isRefreshing`)
- 🔧 Polling conditionnel : le refresh ne s'active que quand l'onglet NAT est actif (`isActive`)
- 🔧 Indicateur de refresh discret : petite icône `RefreshCw` qui tourne dans le header (au lieu de recharger toute la page)
- 🔧 Suppression du scintillement : les refreshes périodiques sont silencieux et n'interrompent plus l'affichage
- 🔧 Chargement initial uniquement quand l'onglet devient actif (optimisation des performances)

---

## [0.5.3] - 2026-02-03

### ✨ Ajouté

**Dashboard - Récapitulatif Réseau Séparé**
- ✅ Création de deux widgets distincts : `NetworkSummaryDashboardWidget` (dashboard principal) et `NetworkSummaryFreeboxWidget` (page Freebox)
- ✅ Widget dashboard : affiche UniFi + DHCP UniFi détaillé (statut, clients connectés, plage IP, gateway) + Freebox si présent
- ✅ Widget Freebox : affiche uniquement les informations Freebox (pas d'UniFi)
- ✅ Section DHCP UniFi détaillée dans le widget dashboard avec plage IP et nombre de clients

**UniFi - InfoSystème Enrichi**
- ✅ Ajout des informations DHCP UniFi dans InfoSystème : statut (Actif/Inactif), plage IP, IP utilisées (clients)
- ✅ Ajout des informations NAT UniFi dans InfoSystème : statut (Actif/Inactif), Gateway IP, nom du gateway
- ✅ Réorganisation de InfoSystème en 4 colonnes pour une meilleure compacité : Système, DHCP, NAT, Controller

**UniFi - API Backend DHCP**
- ✅ Extension de `getNetworkConfig()` dans UniFiApiService pour récupérer la plage DHCP (`dhcpd_start` et `dhcpd_stop`)
- ✅ Exposition de `dhcpRange` dans les stats système du plugin UniFi
- ✅ Transmission de la plage DHCP au frontend via l'API `/api/dashboard/network-summary`

### 🔧 Modifié

**Dashboard - Récapitulatif Réseau**
- 🔧 Suppression du doublon "Gestionnaire d'IPs Réseau (UniFi)" dans le widget dashboard (les informations DHCP UniFi sont maintenant uniquement dans la section dédiée)
- 🔧 Correction du doublon de plage IP dans le widget Freebox (affichage unique de la plage IP)

**UniFi - Interface Mobile**
- 🔧 Amélioration de l'intégration des badges de statut (Connexion, Site, Données) pour mobile
- 🔧 Header responsive : passage en colonne sur mobile (`flex-col sm:flex-row`)
- 🔧 Badges optimisés : texte réduit (`text-[10px] sm:text-xs`), icônes plus petites, espacements réduits
- 🔧 Séparateurs "•" masqués sur mobile pour plus de compacité
- 🔧 URL du controller tronquée (hostname uniquement sur mobile)
- 🔧 Titre et URL avec `truncate` pour éviter les débordements

**UniFi - InfoSystème**
- 🔧 Réorganisation en grille 2x2 colonnes pour meilleure utilisation de l'espace
- 🔧 Réduction des tailles de police pour les valeurs (`text-xs` pour certaines informations)
- 🔧 URL du controller avec hostname uniquement pour économiser l'espace

---

## [0.5.2] - 2026-02-03

### ✨ Ajouté

**Scanner Réseau - Système de Blacklist IPs**
- ✅ Nouveau service `ipBlacklistService.ts` pour gérer la blacklist des IPs bannies
- ✅ Routes API blacklist : `GET /api/network-scan/blacklist`, `POST /api/network-scan/blacklist/add`, `DELETE /api/network-scan/blacklist/:ip`
- ✅ Bouton "Bannir" (icône orange ShieldX) dans la colonne Actions de la page Scanner pour bannir une IP
- ✅ Les IPs bannies sont exclues de tous les scans futurs et supprimées de la base de données
- ✅ Stockage de la blacklist dans `AppConfigRepository` avec la clé `network_scan_blacklist`

**Scanner Réseau - Rescan avec Ports**
- ✅ Nouvelle méthode `rescanSingleIpWithPorts()` pour rescanner une IP unique en mode complet
- ✅ Route API `POST /api/network-scan/:id/rescan` pour rescanner une IP avec scan de ports
- ✅ Bouton "Rescanner" (icône jaune RefreshCw) dans la colonne Actions de la page Scanner
- ✅ Bouton "Rescanner" dans la page de Recherche (résultats groupés et IP unique)
- ✅ Le rescan effectue : ping + détection MAC + hostname + vendor + scan de ports (nmap)

**Page de Recherche - Rescan IP**
- ✅ Bouton "Rescanner" dans la colonne Actions du tableau de résultats groupés
- ✅ Bouton "Rescanner" dans la section de détails d'une IP unique
- ✅ Rafraîchissement automatique des résultats après le rescan pour afficher les ports mis à jour

### 🔧 Modifié

**Scanner Réseau - Respect du Range Configuré**
- 🔧 Fonction `refreshExistingIps()` : filtrage par range configuré avant de scanner les IPs existantes
- 🔧 Fonction `parseIpRange()` : exclusion automatique des IPs Docker de la liste générée
- 🔧 Fonction `scanNetwork()` : exclusion des IPs Docker et bannies avant le scan
- 🔧 Fonction `scanSingleIp()` : vérification et exclusion des IPs Docker et bannies
- 🔧 Route `/api/network-scan/history` : filtrage automatique par range configuré, exclusion Docker et blacklist
- 🔧 Ajout de fonctions utilitaires : `isIpInRange()`, `isDockerIp()`, `getConfiguredRange()`

**Scanner Réseau - Exclusion des IPs Docker**
- 🔧 Détection automatique des IPs Docker : ranges 172.17.0.0/16 à 172.31.255.255 et 10.10.0.0/16
- 🔧 Exclusion des IPs Docker dans tous les scans (scan complet, refresh, scan unique)
- 🔧 Les IPs Docker n'apparaissent plus dans l'affichage des résultats

**Page de Recherche - Nettoyage URL**
- 🔧 Suppression automatique du paramètre `s` de l'URL lors de la navigation hors de la page de recherche
- 🔧 Nettoyage dans `App.tsx` via `useEffect` qui surveille les changements de page
- 🔧 Nettoyage dans `SearchPage.tsx` via wrapper `handleBack` et cleanup `useEffect`

### 🐛 Corrigé

**Scanner Réseau - Problèmes d'Affichage**
- 🐛 Correction : les IPs Docker (10.10.1.x, 172.17-31.x.x) n'apparaissent plus même si elles ne sont pas dans le range configuré
- 🐛 Correction : le refresh scannait toutes les IPs de la base sans respecter le range configuré (192.168.32.0/24)
- 🐛 Correction : les IPs hors du range configuré apparaissaient dans les résultats de recherche

---

## [0.5.1] - 2026-01-23

### ✨ Ajouté

**Page de Recherche - Historique**
- ✅ Bouton "Effacer tout" dans le modal d'historique de recherche pour supprimer tout l'historique d'un clic
- ✅ Bouton visible uniquement si l'historique n'est pas vide

### 🔧 Modifié

**Page de Recherche - Interface**
- 🔧 Suppression du div vide au-dessus du champ de recherche
- 🔧 Ajustement de la hauteur des cadres recherche et filtres pour qu'ils soient égaux (utilisation de `items-stretch` et `flex-1`)
- 🔧 Amélioration du composant `Card` : le header n'est plus affiché si le titre est vide, éliminant l'espacement inutile

**Page Scanner - Colonne Status**
- 🔧 Renommage de la colonne "Ports" en "Status"
- 🔧 Affichage uniquement de l'icône (suppression du texte "Online"/"Offline")
- 🔧 Réduction de la largeur de la colonne (w-16, padding réduit)
- 🔧 Ajout de tooltips informatifs sur les icônes : "Online - Appareil en ligne", "Offline - Appareil hors ligne", "Unknown - Statut inconnu"
- 🔧 Centrage de l'icône dans la cellule

**Animations - Particle Waves**
- 🔧 Correction du bug des points fixes au centre de l'écran : les particules trop proches de la caméra sont maintenant filtrées au lieu d'être projetées au centre

---

## [0.5.0] - 2026-02-01

### ✨ Ajouté

**Gestion des Thèmes - Sélection d'Animation Améliorée**
- ✅ Nouvelle section "Sélection de l'animation" avec grille multi-colonnes (2/3/4/5/6 colonnes selon la taille d'écran)
- ✅ Option "NON" en première position pour désactiver facilement les animations
- ✅ Affichage du nom de l'animation sélectionnée dans le preview de chaque thème
- ✅ Cartes cliquables pour chaque animation avec indicateur visuel de sélection (check jaune/rouge)
- ✅ Style distinct pour l'option "NON" (bordure rouge au lieu de jaune)

**Gestion des Thèmes - Réorganisation de l'Interface**
- ✅ Section "Opacité des blocs" déplacée en première position (avant la sélection des thèmes)
- ✅ Opacité fonctionne indépendamment de l'état de l'animation (même si animation désactivée)
- ✅ Réorganisation logique : Opacité → Thèmes → Animations → Paramètres

### 🔧 Modifié

**Gestion des Thèmes - Menu de Sélection d'Animation**
- 🔧 Menu de sélection d'animation modernisé : menu déroulant centré à l'écran au lieu d'un simple select
- 🔧 Menu scrollable avec toutes les animations visibles sans icônes (texte uniquement)
- 🔧 Largeur optimisée (500px) avec max-width responsive pour petits écrans
- 🔧 Boutons d'animation dans la grille : padding horizontal réduit (px-1.5) pour boutons plus compacts
- 🔧 Texte optimisé avec `leading-tight` pour meilleure utilisation de l'espace

**Gestion des Thèmes - Simplification de l'Interface**
- 🔧 Suppression de la section redondante "Arrière-plan animé" avec toggle d'activation
- 🔧 L'activation/désactivation se fait maintenant uniquement via l'option "NON" dans la grille d'animations
- 🔧 Section "Vitesse d'animation" et "Paramètres d'animation" affichées uniquement si animation activée

### 🗑️ Supprimé

**Thème Media Background**
- 🗑️ Suppression complète du thème "Media Background" (animation.99.media-background)
- 🗑️ Retrait du composant `MediaBackgroundCanvas` et de toutes ses dépendances
- 🗑️ Nettoyage des références dans `ThemeSection.tsx`, `AnimatedBackground.tsx`, `useBackgroundAnimation.ts` et `useAnimationParameters.ts`

---

## [0.4.8] - 2026-02-01

### ✨ Ajouté

**Dashboard - Récapitulatif Réseau**
- ✅ Nouvelle route **GET /api/dashboard/network-summary** : agrégation Freebox (LAN, DMZ, DHCP, NAT) + UniFi (gateway, DHCP, clients)
- ✅ Affichage du widget Récapitulatif Réseau dès qu’un plugin Freebox **ou** UniFi est actif (au lieu de Freebox seul)
- ✅ Détection du rôle réseau : **Freebox**, **UniFi (Cloud Gateway)** ou **UniFi (via DMZ Freebox)** selon mode Freebox (bridge/routeur), DMZ et présence du gateway UniFi
- ✅ Passerelle et sous-réseau adaptés au setup (Freebox ou UniFi selon qui gère le réseau)
- ✅ Section **Freebox** : mode (Routeur/Bridge), IP, DMZ (actif/inactif + IP cible)
- ✅ Section **UniFi Gateway** : IP et nom du gateway (UGW, UDM, UCG)
- ✅ Liste **DHCP** : statut Actif/Inactif par source (Freebox, UniFi) avec détail (plage ou nombre de clients)
- ✅ **Règles NAT Freebox** : liste des redirections (commentaire, proto/port → IP:port), indicateur activé/désactivé
- ✅ **Gestionnaire d’IPs Réseau (Freebox)** : IPv4 libres/utilisées, utilisation % (quand le réseau est géré par Freebox et DHCP actif)
- ✅ **Gestionnaire d’IPs Réseau (UniFi)** : DHCP UniFi actif, nombre d’IP utilisées (clients) — affiché dès qu’un gateway UniFi + DHCP actif + comptage clients sont disponibles (indépendamment du rôle)

**UniFi - Vérification DHCP**
- ✅ **getNetworkConfig()** dans UniFiApiService : appel à `/api/s/<site>/rest/networkconf` pour lire `dhcpd_enabled` sur le réseau LAN
- ✅ Exposition de **dhcpEnabled** dans les stats système du plugin UniFi (dashboard et récap réseau)

### 🔧 Modifié

**Page Recherche - Colonne AP/Switch**
- 🔧 Backend (searchService) : déduction de **is_wireless** / **is_wired** à partir de `ap_name` ou `sw_name` lorsque les flags sont absents sur les clients UniFi
- 🔧 Frontend (SearchPage) : affichage du libellé AP/Switch dès qu’on a **ap_name** ou **sw_name**, même sans les flags is_wired/is_wireless (évite "--" pour les appareils comme Echo M5Stack)

**Dashboard**
- 🔧 Récapitulatif Réseau : source de données unique via `/api/dashboard/network-summary` (remplace les appels directs Freebox LAN/DHCP)

### 🐛 Corrigé

- 🐛 Colonne AP/Switch vide ("--") pour certains clients UniFi lorsque l’API ne renvoie pas is_wired/is_wireless : utilisation de ap_name/sw_name pour déduire le type et afficher WiFi/Filaire

---

## [0.4.7] - 2026-02-01

### ✨ Ajouté

**Page Recherche**
- ✅ Bouton **Historique** dans la section Filtres : ouvre un modal avec l’historique des recherches (requête, options exact/étendu, case, actif)
- ✅ Persistance de l’historique dans localStorage (sans doublon), sélection d’une entrée pour relancer la recherche avec les mêmes options
- ✅ Badges **Recherches fréquentes** : affichage des 5 termes les plus recherchés sous la barre de recherche (cliquables)
- ✅ **Schéma de connexion UniFi** : bloc [ Appareil ] —trait—> [ Équipement | Port N ] avec trait WiFi (ondes) ou Filaire (câble + petits ovales), ports numérotés 1–8 avec le port connecté mis en avant
- ✅ Couleurs par catégorie de ports : **Système** (orange/ambre), **Docker** (indigo, ports 2375/2376), reste (cyan) — page Recherche et tooltip Scan Réseau
- ✅ Catégorie **Docker** dans les ports (préparation détection)

### 🔧 Modifié

**Page Recherche**
- 🔧 Suppression du bloc de sélection des plugins sous la barre de recherche (recherche sur tous les plugins actifs)
- 🔧 Infos mode strict/étendu déplacées dans le champ de recherche : placeholder et ligne d’aide sous l’input (« Strict : 1 IP ou 1 MAC uniquement — activer Étendu pour plus d’infos »)
- 🔧 **Badge Filaire** coloré (bleu) à la place du badge WiFi grisé quand pas de WiFi ou pas de RSSI valide ; plus de badge WiFi gris
- 🔧 Inversion des couleurs UniFi/Freebox en mode recherche étendue (tableau des résultats)
- 🔧 Panneau Ports ouverts en pleine largeur, boutons en flex-wrap pour ne plus être coupés
- 🔧 Ports détail : affichage plein page par catégorie (sans tooltip), comme le scan
- 🔧 Loupe de la barre de recherche recentrée (wrapper pour centrage par rapport au champ uniquement)

**Scripts version**
- 🔧 `bump-version.js` : mise à jour des plugins serveur (Freebox, UniFi, Scan Réseau) en plus de package.json, version.ts, main.tsx, README, Header
- 🔧 Plugins serveur synchronisés à la version 0.4.7

### 🐛 Corrigé

- 🐛 Badge connexion : si pas WiFi ou RSSI invalide, affichage « Filaire » (bleu) au lieu du badge WiFi grisé

---

## [0.4.6] - 2026-02-01

### 🔧 Modifié

- 🔧 Mise à jour de version (package.json, src/constants/version.ts, plugins serveur) pour invalidation du cache navigateur
- 🔧 Synchronisation des versions dans tous les fichiers du projet

---

## [0.4.5] - 2026-01-31

### ✨ Ajouté

**Scan Réseau - Scan de ports (nmap)**
- ✅ Option "Scanner les ports ouverts après chaque scan complet" dans la config du scan auto (section Scan complet)
- ✅ Exécution en arrière-plan après chaque **Full scan** lorsque l’option est activée (Quick scan non concerné)
- ✅ Scan nmap (TCP, plage 1-10000) sur les IP **online** issues du scan, résultats stockés dans `additionalInfo` (openPorts, lastPortScan)
- ✅ Colonne **"Ports ouverts"** dans le tableau Scan Réseau : liste des ports (ex. 22, 80, 443), ou "En cours...", "En attente", "Aucun", "Non scanné"
- ✅ Indicateur dans l’en-tête de la colonne : icône de progression + compteur (current/total) quand le scan de ports est actif
- ✅ API **GET /api/network-scan/port-scan-progress** pour la progression du scan de ports
- ✅ Polling de la progression côté frontend (pendant et après le full scan) pour mettre à jour l’affichage en temps réel
- ✅ Dockerfile : ajout de **nmap** dans l’image runtime pour le scan de ports

**Page Search - Ports machine**
- ✅ Carte **"Ports ouverts (machine)"** dans la fiche détail d’une IP (recherche par IP exacte)
- ✅ Affichage de la liste des ports ouverts (scanner/nmap), date du dernier scan, ou "Aucun port ouvert" / "Non scanné"

### 🔧 Modifié

**Scan Réseau - Configuration unifiée**
- 🔧 Config unifiée étendue : `fullScan.portScanEnabled` (booléen) pour activer/désactiver le scan de ports après full scan
- 🔧 Route **POST /api/network-scan/unified-config** et **GET /api/network-scan/auto-status** : prise en charge de `portScanEnabled`

**Plugin UniFi - Priorité Controller / Site Manager**
- 🔧 Auto-détection : priorité au mode **Controller** si URL/username/password sont présents ; passage en Site Manager uniquement si URL unifi.ui.com + API key valide, ou si seule une API key est fournie
- 🔧 Nettoyage des paramètres de test (route test) : en mode controller, suppression de `apiKey` des settings de test pour éviter un basculement incorrect vers Site Manager (correction Docker vs npm dev)

### 🐛 Corrigé

**Plugin UniFi - Validation en Docker**
- 🐛 Correction du cas où le plugin fonctionnait en `npm run dev` mais échouait en Docker avec "Site Manager API error: 401" : la config Controller n’est plus écrasée par une API key résiduelle lors du test ou de l’initialisation

---

## [0.4.4] - 2026-01-25

### ✨ Ajouté

**Plugin UniFi - Affichage du Type de Déploiement**
- ✅ Badge "Type:" affiché sur la carte du plugin UniFi quand connecté
- ✅ Détection et affichage automatique du type de déploiement :
  - "Site Manager (Cloud)" pour l'API cloud
  - "UniFiOS Gateway" pour les gateways UniFiOS (UDM Pro, UCG, etc.)
  - "Network Controller" pour les contrôleurs classiques
- ✅ Affichage conditionnel uniquement quand le plugin est connecté
- ✅ Couleurs distinctes selon le type de déploiement (indigo, purple, blue)

**Plugin UniFi - Détection Automatique Améliorée**
- ✅ Détection automatique UniFiOS vs Classic Controller lors du login
- ✅ Réutilisation intelligente du cookie de session pour éviter les doubles login
- ✅ Support complet de la documentation officielle UniFi API
- ✅ Détection automatique du mode Site Manager (cloud) si API key fournie

### 🔧 Modifié

**Plugin UniFi - Gestion des Erreurs Améliorée**
- 🔧 Messages d'erreur détaillés pour les erreurs réseau (ECONNREFUSED, timeout, SSL)
- 🔧 Détection spécifique de l'erreur 429 (Too Many Requests) avec indication de retry
- 🔧 Messages d'erreur en français avec suggestions contextuelles
- 🔧 Parsing amélioré des réponses d'erreur pour éviter "[object Object]"
- 🔧 Nettoyage automatique des messages d'erreur dupliqués
- 🔧 Messages d'erreur spécifiques selon le type de déploiement (UniFiOS vs Controller)

**Plugin UniFi - Modal de Configuration**
- 🔧 Désactivation du refresh automatique pendant l'édition du modal
- 🔧 Protection du formulaire contre la réinitialisation pendant l'édition
- 🔧 Boutons "Tester" et "Sauvegarder" mutuellement exclusifs (pas d'actions simultanées)
- 🔧 Tooltips explicatifs sur les boutons pour guider l'utilisateur
- 🔧 Le test ne fait plus de refresh qui casse le formulaire
- 🔧 La sauvegarde teste avec la configuration sauvegardée (pas le formulaire)

**Plugin UniFi - Protection Contre les Tests Inutiles**
- 🔧 Vérification du statut de connexion avant de faire un test
- 🔧 Si le plugin est déjà connecté avec les mêmes settings, retourne le statut sans test
- 🔧 Évite les tests qui déclenchent des erreurs 429 ou cassent la connexion active
- 🔧 Messages d'erreur clairs si le plugin est activé mais non connecté
- 🔧 Protection contre les tests répétés qui cassent le plugin

**WebSocket - Support des Accès Distants**
- 🔧 Détection automatique des accès via IP (pas localhost) en mode dev
- 🔧 Connexion directe au backend (port 3668) pour les accès distants, contournant le proxy Vite
- 🔧 Correction de l'erreur "Invalid frame header" pour les accès via IP
- 🔧 Gestion améliorée des erreurs WebSocket avec messages informatifs

### 🐛 Corrigé

**Plugin UniFi - Bouton de Test**
- 🐛 Correction du problème où le bouton "Tester" cassait le plugin après configuration
- 🐛 Le plugin ne se casse plus lors de tests répétés avec la même configuration
- 🐛 Le test ne réinitialise plus le formulaire pendant l'édition
- 🐛 Correction de l'affichage "[object Object]" dans les messages d'erreur
- 🐛 Correction des messages d'erreur dupliqués ("Verify URL... Verify URL...")

**Plugin UniFi - Détection de Déploiement**
- 🐛 Correction de la détection UniFiOS qui ne réutilisait pas le cookie de session
- 🐛 Amélioration de la gestion des erreurs réseau pendant la détection
- 🐛 Messages d'erreur plus clairs pour les problèmes de connexion (port 443 vs 8443)

**WebSocket - Connexions en Boucle**
- 🐛 Correction de l'erreur "Invalid frame header" qui causait des reconnexions infinies
- 🐛 Détection correcte du mode d'accès (Docker dev vs npm dev) pour le WebSocket

---

## [0.4.3] - 2026-01-24

### ✨ Ajouté

**Plugin UniFi - Gestion des Erreurs 429 (Rate Limiting)**
- ✅ Système de retry avec backoff exponentiel pour les erreurs 429 (Too Many Requests)
- ✅ Respect automatique du header Retry-After si présent dans la réponse
- ✅ Délai d'attente progressif : 1 min, 2 min, 4 min (max 15 min)
- ✅ Maximum de 3 tentatives avec gestion intelligente des erreurs
- ✅ Réinitialisation automatique des compteurs après succès
- ✅ Évite les tentatives trop fréquentes qui déclenchent des erreurs 429

### 🔧 Modifié

**Plugin UniFi - Amélioration du Bouton "Tester"**
- 🔧 Restauration garantie de la configuration originale même en cas d'erreur
- 🔧 Évite la réinitialisation inutile si les paramètres de test sont identiques à la config actuelle
- 🔧 Vérification du statut réel de connexion avant de retourner un succès
- 🔧 Démarrage automatique du plugin après un test réussi si nécessaire
- 🔧 Le plugin ne peut plus être laissé dans un état cassé après un test
- 🔧 Logs de débogage pour tracer les problèmes de restauration

**Plugin UniFi - Cohérence du Statut de Connexion**
- 🔧 Le message "Test de connexion réussi" n'apparaît que si le plugin est réellement connecté
- 🔧 Le statut dans l'interface reflète toujours l'état réel de connexion
- 🔧 Le plugin ne passe plus en orange "Non connecté" après un test réussi
- 🔧 Vérification de la session active avant de relancer un login inutile

**WebSocket - Détection Automatique du Port Backend**
- 🔧 Détection automatique du port backend en mode dev (3668 pour Docker, 3003 pour npm)
- 🔧 Support de la variable d'environnement VITE_SERVER_PORT pour forcer le port
- 🔧 Messages d'erreur améliorés pour aider au débogage
- 🔧 Évite les erreurs de connexion WebSocket en mode développement

### 🐛 Corrigé

**Plugin UniFi - Test de Connexion**
- 🐛 Correction du problème où le test cassait le plugin après une configuration réussie
- 🐛 Correction de l'incohérence entre le message de succès et le statut réel du plugin
- 🐛 Le plugin reste fonctionnel même après plusieurs tests consécutifs

---

## [0.4.2] - 2026-01-23

### ✨ Ajouté

**Freebox - Backup Complet de Configuration**
- ✅ Nouvelle section "Backup complet Freebox" dans l'onglet Backup
- ✅ Export complet de toutes les configurations Freebox dans un seul fichier JSON
- ✅ Import de backup avec restauration automatique des configurations
- ✅ Interface avec boutons Export/Import côte à côte
- ✅ Contenu du backup inclut :
  - Redirections de port WAN (Pare-feu)
  - Baux DHCP statiques
  - Configuration WiFi complète (full, config, BSS)
  - Configuration LAN (mode réseau, IP, hostnames)
  - Configuration de connexion (ping, WOL, adblock, accès distant)
  - Configurations DynDNS (OVH, DynDNS, No-IP)
- ✅ Avertissement de sécurité avant import
- ✅ Validation du format de backup avant import
- ✅ Affichage des résultats d'import (succès/erreurs)

**Dashboard - Widget Récapitulatif Réseau**
- ✅ Ajout du widget "Récapitulatif Réseau" sur le dashboard principal
- ✅ Placement au-dessus du widget "Système Serveur" dans la colonne de gauche
- ✅ Affichage conditionnel uniquement si le plugin Freebox est actif et connecté
- ✅ Affichage des informations réseau essentielles directement sur le dashboard



### 🔧 Modifié

**Freebox - Réorganisation de l'Onglet Réseau**
- 🔧 Séparation des catégories en blocs distincts pour une meilleure organisation
- 🔧 Section "Options réseau" simplifiée avec uniquement :
  - Réponse au ping
  - Wake on LAN
  - Blocage de publicités
- 🔧 Nouvelles sections séparées créées :
  - **Mode réseau** : Choix du mode (Server/Bridge) et adresse IP du Freebox Server
  - **Nom d'hôte** : Nom du Freebox Server, Nom DNS, Nom mDNS, Nom NetBIOS
  - **Nom de domaine** : Affichage du domaine personnalisé et certificat TLS
  - **DNS Dynamique** : Configuration complète DynDNS avec fournisseurs multiples
- 🔧 Section "Accès distant" déplacée en dernière position dans l'onglet Réseau
- 🔧 Amélioration de la lisibilité et de la navigation dans les paramètres réseau

**Freebox - Informations Freebox**
- 🔧 Section "Informations Freebox" (token) déplacée de l'onglet Réseau vers l'onglet Sécurité
- 🔧 Placement en première position dans l'onglet Sécurité pour un accès rapide

---

## [0.4.1] - 2026-01-21

### ✨ Ajouté

**Freebox - Filtrage MAC WiFi**
- ✅ Ajout de la section "Filtrage MAC" dans les paramètres WiFi Freebox
- ✅ Toggle pour activer/désactiver le filtrage MAC
- ✅ Sélecteur de mode : Liste blanche ou Liste noire
- ✅ Gestion de la liste des adresses MAC avec ajout/suppression
- ✅ Validation du format MAC (XX:XX:XX:XX:XX:XX ou XX-XX-XX-XX-XX-XX)
- ✅ Ajout d'adresses MAC via champ de saisie (bouton ou touche Enter)
- ✅ Route API PUT `/api/wifi/mac-filter` pour sauvegarder la configuration
- ✅ Méthode `setWifiMacFilter()` dans le service Freebox API

**Scripts - Mise à jour de Version Automatique**
- ✅ Affichage de la version actuelle par défaut si aucun argument n'est fourni
- ✅ Détection automatique des modifications Git avec `git status`
- ✅ Préparation automatique du commit si des modifications sont détectées
- ✅ Ajout automatique des fichiers au staging area pour le commit
- ✅ Gestion des versions invalides (comme `--help`) avec valeur par défaut

### 🔧 Modifié

**Scripts - update-version.sh**
- 🔧 Amélioration de la logique de détection des modifications Git
- 🔧 Préparation automatique du commit avec confirmation utilisateur
- 🔧 Affichage amélioré du statut Git et des fichiers modifiés
- 🔧 Gestion des cas où la version existe déjà dans le CHANGELOG

---

## [0.4.0] - 2026-01-13

### ✨ Ajouté

**Recherche - Support des Paramètres d'URL**
- ✅ Support du paramètre `?s=IP` dans l'URL pour rechercher directement une IP
- ✅ Navigation automatique vers la page de recherche si le paramètre `s` est présent dans l'URL
- ✅ Synchronisation bidirectionnelle entre l'URL et l'état de recherche
- ✅ Support des boutons précédent/suivant du navigateur pour la navigation
- ✅ Liens depuis la page scan réseau vers la recherche avec paramètre d'URL (au lieu de sessionStorage)
- ✅ URLs partageables : `192.168.1.150:5173/?s=192.168.1.41` ouvre directement la recherche

**Ping - Mode Strict et Étendu**
- ✅ Mode strict par défaut : ping d'une seule IP exacte quand le ping est activé
- ✅ Mode étendu activable : permet de pinger des ranges d'IP (CIDR et plages)
- ✅ Support des formats de range : `192.168.1.0/24`, `192.168.1.1-254`, `192.168.1.1-192.168.1.254`
- ✅ Parsing côté client des ranges IP avec génération automatique de la liste d'IPs
- ✅ Fast ping : utilisation de `count=1` pour vérification rapide UP/DOWN

**Ping - Interface Utilisateur**
- ✅ Affichage "UP" ou "DOWN" en gros sous la barre de recherche
- ✅ Affichage de la latence en millisecondes dans le tableau de résultats
- ✅ Affichage de la latence dans la carte Latence des détails IP
- ✅ Détails d'erreur affichés uniquement si le ping est DOWN
- ✅ Masquage automatique du bouton "Rechercher" quand le ping est activé
- ✅ Touche Enter pour valider les pings au lieu de lancer une recherche quand ping est actif
- ✅ Aide contextuelle affichée quand le ping est activé avec explications du mode strict/étendu

**Ping - Documentation**
- ✅ Mise à jour du modal d'aide avec explications du mode strict et étendu
- ✅ Exemples de formats de ranges supportés dans la documentation
- ✅ Explications des différences entre mode strict (1 IP) et mode étendu (ranges)

### 🔧 Modifié

**Recherche - Navigation**
- 🔧 Lecture du paramètre `s` depuis l'URL en priorité (au lieu de sessionStorage)
- 🔧 Mise à jour automatique de l'URL lors des recherches
- 🔧 NetworkScanPage utilise maintenant l'URL au lieu de sessionStorage pour les liens vers la recherche

**Ping - Comportement**
- 🔧 Activation du ping force le mode strict (exactMatch=true) par défaut
- 🔧 Le mode étendu peut être activé même quand le ping est actif (pour permettre les ranges)
- 🔧 Ping rapide avec count=1 mais latence toujours stockée pour affichage dans les résultats

**Interface Utilisateur - Ping**
- 🔧 Bouton "Rechercher" masqué conditionnellement quand pingEnabled est true
- 🔧 Comportement de la touche Enter adaptatif selon l'état du ping
- 🔧 Affichage contextuel de l'aide ping avec informations selon le mode actif

### 🐛 Corrigé

**Ping - Affichage**
- ✅ Correction de l'affichage "undefinedms" : vérification de l'existence de la latence avant affichage
- ✅ Affichage de "UP" si la latence n'est pas disponible mais que le ping est réussi
- ✅ Gestion correcte des cas où time est undefined dans les résultats de ping

---

## [0.] - 2026-01-13

---

## [0.3.9] - 2025-01-02

### 🐛 Corrigé

**Erreur de Compilation - Double Déclaration de Variable**
- 🐛 Correction de la double déclaration de `routePath` dans `getHostMachineIP()` (ligne 405)
- 🐛 Déplacement de la déclaration de `routePath` au niveau de la fonction pour éviter les conflits de scope
- 🐛 Résolution de l'erreur `The symbol "routePath" has already been declared` au démarrage Docker

**Affichage du Port dans les Logs Docker**
- 🐛 Ajout de la variable d'environnement `DASHBOARD_PORT` dans les fichiers docker-compose
- 🐛 Le port affiché dans les logs correspond maintenant au port défini dans docker-compose
- 🐛 Synchronisation du port par défaut entre `docker-compose.yml` et `server/index.ts` (7555)
- 🐛 Correction de l'affichage du port dans les logs au démarrage

**Fichiers Modifiés**
- `server/index.ts` : Correction de la double déclaration et synchronisation du port par défaut
- `docker-compose.yml` : Ajout de `DASHBOARD_PORT` dans la section `environment`
- `docker-compose.local.yml` : Ajout de `DASHBOARD_PORT` dans la section `environment`
- `docker-compose.dev.yml` : Variable déjà présente, vérification effectuée

### 🔧 Modifié

**Noms de Conteneurs Docker**
- 🔧 Ajout de `container_name` explicite dans tous les fichiers docker-compose
- 🔧 Conteneurs nommés de manière fixe et prévisible :
  - `mynetwork` pour la production (`docker-compose.yml`)
  - `mynetwork-local` pour le build local (`docker-compose.local.yml`)
  - `mynetwork-dev` pour le mode développement (`docker-compose.dev.yml`)
- 🔧 Plus de noms générés automatiquement comme `mynetwork-mynetwork-1`

**Configuration Docker**
- 🔧 Ajout de la variable `HOST_IP` optionnelle dans `docker-compose.yml` pour forcer l'IP de la machine hôte
- 🔧 Documentation améliorée pour la configuration du port et de l'IP dans les logs

**Fichiers Modifiés**
- `docker-compose.yml` : Ajout de `container_name` et `HOST_IP` optionnel
- `docker-compose.local.yml` : Ajout de `container_name`
- `docker-compose.dev.yml` : Ajout de `container_name`

---

## [0.3.8] - 2025-01-02

### 🔒 Sécurité

**Agents HTTPS Personnalisés pour Freebox et UniFi**
- 🔒 Remplacement de `NODE_TLS_REJECT_UNAUTHORIZED = '0'` global par des agents HTTPS sélectifs
- 🔒 Utilisation d'agents `undici` personnalisés avec `rejectUnauthorized: false` uniquement pour Freebox/UniFi
- 🔒 Plus de désactivation globale de la vérification TLS - sécurité améliorée
- 🔒 Fallback automatique vers variable d'environnement si `undici` n'est pas disponible
- 🔒 Suppression de l'avertissement TLS au démarrage Docker

**Fichiers Modifiés**
- `server/services/freeboxApi.ts` : Agent HTTPS personnalisé pour toutes les requêtes Freebox
- `server/plugins/freebox/FreeboxApiService.ts` : Agent HTTPS personnalisé pour le plugin Freebox
- `server/plugins/unifi/UniFiApiService.ts` : Agent HTTPS personnalisé pour le plugin UniFi

### 🔧 Modifié

**Détection IP Machine Hôte dans Docker**
- 🔧 Amélioration de `getHostMachineIP()` dans `server/index.ts` pour lire l'IP réelle depuis `/host/proc/net/route`
- 🔧 Parsing du fichier de routage pour trouver l'interface par défaut et son gateway
- 🔧 Conversion du gateway Docker (hex) en adresse IP lisible
- 🔧 Fallback vers gateway Docker si l'IP réelle n'est pas trouvée
- 🔧 Priorité donnée à la variable d'environnement `HOST_IP` (la plus fiable)
- 🔧 Affichage de l'IP de la machine hôte au lieu de l'IP Docker interne (172.18.0.2) dans les logs

**Nettoyage du Code**
- 🔧 Suppression du code de suppression d'avertissement TLS dans `server/index.ts` (lignes 1-35)
- 🔧 Code plus propre et maintenable sans interception d'avertissements

### 🐛 Corrigé

**Avertissement StorageType.persistent en Production**
- 🐛 Suppression de l'avertissement déprécié `StorageType.persistent is deprecated` en production Docker
- 🐛 Interception de `console.warn` pour filtrer uniquement cet avertissement spécifique
- 🐛 Conservation de tous les autres avertissements pour le debugging
- 🐛 Console du navigateur plus propre en production

**Fichiers Modifiés**
- `src/main.tsx` : Ajout de la suppression conditionnelle de l'avertissement StorageType.persistent

### 📝 Documentation

**Amélioration de la Documentation**
- 📝 Commentaires détaillés expliquant l'utilisation des agents HTTPS personnalisés
- 📝 Explication de la logique de fallback pour la compatibilité
- 📝 Documentation de la détection IP hôte dans Docker

---

## [0.3.7] - 2025-01-02

### 🔧 Modifié

**Affichage des Disques dans SystemServerWidget**
- 🔧 Remplacement des chemins système (`/etc/resolv.conf`, `/etc/hostname`, `/etc/hosts`) par des noms génériques ("Disque 1", "Disque 2", etc.)
- 🔧 Affichage du nom réel du disque si disponible (ex: `/dev/sda1` → `sda1`)
- 🔧 Amélioration de la lisibilité et de la cohérence de l'affichage

**Nettoyage des Logs Console**
- 🔧 Suppression des logs de debug dans `LatencyMonitoringModal` (Raw measurements, Total measurements, Sample latencies, Chart data)
- 🔧 Suppression des logs de debug dans `NetworkScanPage` (onDataChanged, Local state cleared, All data refreshed)
- 🔧 Conservation uniquement des logs d'erreur essentiels pour le debugging

### ♿ Accessibilité

**Amélioration de l'Accessibilité des Formulaires**
- ♿ Ajout d'attributs `id` et `name` à tous les champs de formulaire manquants
- ♿ Association correcte des labels avec `htmlFor` pour tous les champs
- ♿ Corrections dans les modaux suivants :
  - `UserLoginModal` : champs username et password
  - `PluginConfigModal` : tous les champs de configuration (api-mode, api-key, unifi-url, unifi-username, unifi-password, unifi-site)
  - `NetworkScanConfigModal` : checkboxes et selects (auto-scan-enabled, full-scan-enabled, refresh-enabled, intervals, default-range)
  - `LoginModal` : champs local-ip et freebox-url
  - `CreateVmModal` : champ vm-name
  - `NetworkScanPage` : champ de recherche, select de filtre, select résultats par page, champs d'édition hostname, modal d'ajout IP

**Conformité aux Standards Web**
- ♿ Tous les champs de formulaire ont maintenant des attributs `id` et `name`
- ♿ Tous les labels sont correctement associés avec `htmlFor`
- ♿ Amélioration de l'autocomplétion du navigateur
- ♿ Meilleure compatibilité avec les lecteurs d'écran

## [0.3.6] - 2025-01-01

### ⚡ Optimisé

**Chargement de l'Onglet Plugins**
- ✅ Temps de chargement réduit de plusieurs secondes à < 500ms
- ✅ Retrait des tests de connexion systématiques au chargement de `/api/plugins`
- ✅ Retrait des appels `getPluginStats()` pour firmware/version au chargement
- ✅ Vérification légère du statut de connexion sans appels API lourds
- ✅ Cache intelligent de 30 secondes pour éviter les rechargements inutiles
- ✅ Réduction drastique des appels API : 1 appel au lieu de 6+ appels au chargement

**Route `/api/plugins`**
- ✅ Retour uniquement des informations de base depuis la DB et le plugin
- ✅ Vérification légère du statut de connexion :
  - Freebox : utilise `freeboxApi.isLoggedIn()` (vérification synchrone, pas d'appel API)
  - UniFi : utilise `unifiPlugin.apiService.isLoggedIn()` (vérification d'état interne)
  - Scanner réseau : toujours connecté si activé (pas de connexion externe)
- ✅ Validation simple de la structure des données retournées
- ✅ Filtrage automatique des plugins invalides avec warnings

**Composant PluginsManagementSection**
- ✅ Chargement unique au montage (pas de rechargements multiples)
- ✅ Retrait des `fetchPlugins()` redondants après chaque action mineure
- ✅ Optimisation des `useEffect` pour éviter les appels multiples
- ✅ Vérification conditionnelle de l'authentification Freebox (uniquement si nécessaire)

**Store pluginStore**
- ✅ Cache avec timestamp (`lastFetchTime`)
- ✅ Durée du cache : 30 secondes
- ✅ Paramètre `force` pour forcer le refresh si nécessaire
- ✅ Validation des données reçues (structure, types)
- ✅ Filtrage des plugins invalides avec warnings console

### 🔧 Modifié

**Route `/api/plugins` - Architecture**
- 🔧 Retrait des appels `testPluginConnection()` systématiques pour chaque plugin activé
- 🔧 Retrait des appels `getPluginStats()` pour récupérer firmware/version
- 🔧 Utilisation de méthodes légères pour vérifier le statut de connexion
- 🔧 Validation de la structure des données avant retour

**PluginsManagementSection - Gestion des Appels**
- 🔧 `useEffect` avec dépendances vides pour charger une seule fois au montage
- 🔧 Retrait de `fetchPlugins()` après `handleToggle` (déjà géré par `updatePluginConfig`)
- 🔧 Retrait de `fetchPlugins()` après login Freebox (non nécessaire)
- 🔧 Conservation uniquement après test de connexion et fermeture de config (avec `force: true`)
- 🔧 Optimisation du `useEffect` pour Freebox auth (vérification conditionnelle)

**pluginStore - Cache et Validation**
- 🔧 Ajout du paramètre `force?: boolean` à `fetchPlugins()`
- 🔧 Vérification du cache avant chaque appel API
- 🔧 Validation de la structure de réponse (vérification que c'est un tableau)
- 🔧 Validation de chaque plugin (id, name, enabled, version)
- 🔧 Filtrage automatique des plugins invalides

### 📝 Documentation

**Optimisation Performance**
- 📝 Commentaires détaillés expliquant les optimisations dans le code
- 📝 Explication de la logique de cache et de validation

---

## [0.3.6] - 2025-12-30

### 🐛 Corrigé

**Route `/api/network-scan/database-size-estimate` - Erreur 404**
- ✅ Correction de l'erreur 404 sur l'endpoint `/api/network-scan/database-size-estimate`
- ✅ Déplacement de la route avant la route dynamique `/:id` pour éviter les conflits de routage
- ✅ La route est maintenant correctement accessible depuis l'interface de maintenance

**Affichage "Rapide" au lieu de "Full" pour Full Scan**
- ✅ Correction de l'affichage du type de scan dans le widget dashboard et la page scan
- ✅ Le badge "Full Scan" affiche maintenant toujours "Complet" au lieu de "Rapide"
- ✅ Le dernier scan de type "full" affiche correctement "Complet" dans les deux interfaces

### ✨ Ajouté

**Badge Plage IP**
- ✅ Ajout d'un badge cyan affichant la plage IP scannée dans le widget dashboard
- ✅ Ajout d'un badge cyan affichant la plage IP scannée dans la page scan réseau
- ✅ Badge affiché dans le dernier scan et dans les prochains scans automatiques
- ✅ Badge également disponible dans la colonne de gauche sous "Base vendors" avec label "Réseau:"

**Tri pour Toutes les Colonnes**
- ✅ Ajout du tri pour les colonnes "Avg1h", "Max" et "Monitoring" dans le tableau des scans
- ✅ Tri côté client utilisant les données déjà chargées (`latencyStats` et `monitoringStatus`)
- ✅ Indicateurs visuels (flèches) pour toutes les colonnes triables
- ✅ La colonne "Actions" reste non triable comme prévu

### 🔧 Modifié

**Réorganisation Section "Info Scans"**
- 🔧 Le "Dernier Scan" est maintenant affiché sous les sections "Full Scan" et "Refresh"
- 🔧 Ajout d'une bordure supérieure pour séparer visuellement le dernier scan
- 🔧 Meilleure organisation visuelle de l'information

**Positionnement Badge Réseau**
- 🔧 Badge réseau retiré de la ligne "Full Scan" dans la colonne de gauche
- 🔧 Badge réseau déplacé dans la colonne de gauche sous "Base vendors" avec label "Réseau:"
- 🔧 Badge réseau déplacé après le temps dans le widget dashboard (après "Dans Xh (HH:MM)")
- 🔧 Alignement des labels "Base vendors:", "Réseau:" et "Scan auto:" avec largeur fixe pour cohérence visuelle

**Widget Dashboard - Scan Réseau**
- 🔧 Réorganisation de l'ordre des éléments dans la ligne "Full Scan"
- 🔧 Ordre final : "Full Scan" → "Complet" → "Dans Xh (HH:MM)" → Badge réseau

---

## [0.3.4] - 2025-12-30

### 🐛 Corrigé

**Freebox Revolution - Appels Simultanés Multiples**
- ✅ Implémentation d'un système de verrous par endpoint pour éviter les appels simultanés multiples au même endpoint
- ✅ Si un appel à `/lan/browser/pub/` est déjà en cours, les autres appels réutilisent la même promesse au lieu d'en créer une nouvelle
- ✅ Élimination des appels parallèles multiples depuis `/api/lan`, `/api/wifi`, et `FreeboxPlugin.getStats()`
- ✅ Réduction drastique des erreurs `AbortError` causées par la surcharge de la Freebox Revolution

**Freebox Revolution - Timeouts Insuffisants**
- ✅ Augmentation des timeouts pour Revolution : 45s pour endpoints lents (au lieu de 30s)
- ✅ Augmentation des timeouts pour Revolution : 25s pour autres endpoints (au lieu de 20s)
- ✅ Endpoints lents identifiés : `/lan/browser/pub/`, `/dhcp/dynamic_lease/`, `/dhcp/static_lease/`, `/fw/redir/`
- ✅ Les autres modèles Freebox conservent leurs timeouts par défaut (10s)

**Freebox Revolution - Pas de Retry sur Timeouts**
- ✅ Implémentation d'un système de retry automatique avec backoff exponentiel pour Revolution
- ✅ Retry uniquement sur erreurs `AbortError` (timeout) et uniquement pour Revolution sur endpoints lents
- ✅ Maximum 2 tentatives supplémentaires (3 appels au total) pour éviter de surcharger la Freebox
- ✅ Délais de retry : 1s puis 2s (backoff exponentiel)

### ✨ Ajouté

**Système de Verrous par Endpoint**
- ✅ Nouvelle méthode `requestWithLock()` pour éviter les appels simultanés multiples au même endpoint
- ✅ Map `endpointLocks` pour stocker les promesses en cours par endpoint
- ✅ Réutilisation automatique de la promesse existante si un appel est déjà en cours
- ✅ Libération automatique du verrou après résolution de la promesse (succès ou échec)

**Détection des Endpoints Lents**
- ✅ Nouvelle méthode `isSlowEndpoint()` pour identifier les endpoints problématiques sur Revolution
- ✅ Liste des endpoints lents : `/dhcp/dynamic_lease/`, `/dhcp/static_lease/`, `/fw/redir/`, `/lan/browser/pub/`
- ✅ Utilisée pour appliquer des timeouts et retries spécifiques uniquement où nécessaire

**Retry avec Backoff Exponentiel**
- ✅ Nouvelle méthode `requestWithRetry()` pour retenter automatiquement les timeouts sur Revolution
- ✅ Backoff exponentiel : délais de 1s puis 2s entre les tentatives
- ✅ Activation uniquement pour Revolution et uniquement sur endpoints lents
- ✅ Détection automatique des erreurs `AbortError` pour déclencher le retry

### 🔧 Modifié

**FreeboxApiService - Architecture des Requêtes**
- 🔧 Toutes les méthodes publiques utilisent maintenant `requestWithLock()` au lieu de `request()` directement
- 🔧 `requestWithLock()` appelle `requestWithRetry()` en interne pour gérer les retries
- 🔧 `requestWithRetry()` appelle `request()` en interne avec gestion des retries
- 🔧 Les méthodes d'authentification (`register`, `login`, `logout`, `getChallenge`) continuent d'utiliser `request()` directement (pas de lock nécessaire)

**FreeboxApiService - Timeouts Adaptatifs**
- 🔧 `getTimeoutForEndpoint()` retourne maintenant 45s pour endpoints lents sur Revolution (au lieu de 30s)
- 🔧 `getTimeoutForEndpoint()` retourne maintenant 25s pour autres endpoints sur Revolution (au lieu de 20s)
- 🔧 Utilisation de `isSlowEndpoint()` pour identifier les endpoints nécessitant des timeouts plus longs
- 🔧 Les autres modèles Freebox conservent le timeout par défaut (10s)

**Gestion des Erreurs AbortError**
- 🔧 `request()` ajoute maintenant un flag `_isAbortError` dans la réponse d'erreur pour faciliter la détection
- 🔧 `requestWithRetry()` détecte les `AbortError` via le flag ou via le message d'erreur
- 🔧 Retry automatique uniquement si conditions remplies (Revolution + endpoint lent + AbortError)

---

## [0.3.3] - 2025-12-30

### 🐛 Corrigé

**Freebox Plugin - WebSocket au Démarrage**
- ✅ Le WebSocket Freebox ne démarre plus si le plugin est désactivé
- ✅ Vérification de l'état du plugin avant chaque tentative de connexion WebSocket
- ✅ Arrêt automatique des tentatives de reconnexion si le plugin est désactivé
- ✅ Réduction des logs Freebox inutiles quand le plugin est désactivé

**UniFi Plugin - Appels API Inutiles**
- ✅ Le plugin UniFi ne fait plus d'appels API si désactivé
- ✅ Vérification de `isEnabled()` dans `stop()` avant d'appeler `logout()`
- ✅ Protection contre les appels API inutiles même lors de la réinitialisation du plugin

**Freebox Revolution - Appels Simultanés**
- ✅ Protection renforcée contre les appels simultanés multiples aux mêmes endpoints
- ✅ Réduction des erreurs `AbortError` grâce à une meilleure gestion des requêtes parallèles

### ✨ Ajouté

**Optimisation Détection MAC - Cache des Stats Plugins**
- ✅ Cache des stats Freebox/UniFi pendant le scan pour éviter les appels répétés à `getStats()`
- ✅ Un seul appel à `getStats()` par plugin au début du scan au lieu d'un par IP
- ✅ Amélioration significative des performances de scan avec Freebox/UniFi activés
- ✅ Cache automatiquement invalidé à la fin du scan pour libérer la mémoire

**Documentation Options "Écraser"**
- ✅ Descriptions détaillées des options "Écraser les hostnames existants" et "Écraser les vendors existants"
- ✅ Recommandations d'utilisation ajoutées pour guider les utilisateurs
- ✅ Notes explicatives sur le comportement avec les vendors vides/invalides

### 🔧 Modifié

**NetworkScanService - Cache des Stats Plugins**
- 🔧 Ajout de `cachedFreeboxStats`, `cachedUniFiStats`, `cacheTimestamp` pour le cache
- 🔧 Méthode `initializePluginStatsCache()` pour charger les stats une seule fois au début du scan
- 🔧 Méthode `invalidatePluginStatsCache()` pour nettoyer le cache après le scan
- 🔧 `getMacFromFreebox()` et `getMacFromUniFi()` utilisent maintenant le cache au lieu d'appeler `getStats()` à chaque fois
- 🔧 Fallback automatique vers `getStats()` si le cache expire ou n'est pas disponible

**FreeboxNativeWebSocket - Vérification Plugin**
- 🔧 Vérification de l'état du plugin Freebox avant de démarrer le WebSocket
- 🔧 Vérification dans `start()`, `connect()`, `scheduleReconnect()`, et `onLogin()`
- 🔧 Arrêt automatique si le plugin est désactivé pendant une reconnexion

**Routes Auth - WebSocket Conditionnel**
- 🔧 `freeboxNativeWebSocket.onLogin()` appelé uniquement si le plugin Freebox est activé
- 🔧 Évite les tentatives de connexion WebSocket inutiles

**SettingsPage - Documentation Améliorée**
- 🔧 Descriptions plus détaillées des options "Écraser" avec explications claires
- 🔧 Recommandations et notes importantes ajoutées pour chaque option

---

## [0.3.2] - 2025-12-30

### 🐛 Corrigé

**Détection MAC dans Docker - Plugins en Priorité**
- ✅ Réorganisation de `getMacAddress()` pour utiliser les plugins activés (Freebox, UniFi) EN PREMIER selon la configuration de priorité
- ✅ Les méthodes système (ARP, `/proc/net/arp`) sont utilisées comme fallback si les plugins échouent ou ne sont pas activés
- ✅ Garantie que les méthodes système fonctionnent correctement même sans plugins (essentiel pour Docker)
- ✅ Correction du problème où certaines IPs n'avaient aucune MAC détectée dans Docker avec seulement le plugin Scanner activé

**Détection MAC - Support UniFi**
- ✅ Ajout de la méthode `getMacFromUniFi()` pour récupérer les MAC depuis le plugin UniFi
- ✅ Recherche dans `unifiPlugin.getStats().devices` par IP
- ✅ Validation du format MAC avant retour

**Détection Vendor - Fonctionnement sans Plugins**
- ✅ Garantie que la détection de vendor fonctionne même sans plugins grâce à la base de données Wireshark/OUI
- ✅ `getVendorWithSource()` utilise déjà le plugin "scanner" dans la priorité par défaut
- ✅ La plupart des MAC adresses peuvent être identifiées via la base de données OUI même sans plugins

### ✨ Ajouté

**Détection MAC - Méthode UniFi**
- ✅ Nouvelle méthode `getMacFromUniFi(ip: string)` dans `NetworkScanService`
- ✅ Support complet de la détection MAC depuis UniFi Controller
- ✅ Recherche par IP dans les devices UniFi (access points, switches, clients)

### 🔧 Modifié

**NetworkScanService - Ordre de Détection MAC**
- 🔧 `getMacAddress()` réorganisé pour essayer les plugins activés en premier selon la priorité configurée
- 🔧 Si aucun plugin n'est activé OU si tous les plugins échouent, utilisation des méthodes système
- 🔧 Les méthodes système restent disponibles et fonctionnent même sans plugins
- 🔧 Logs améliorés pour indiquer quelle méthode (plugin ou système) a réussi/échoué

**NetworkScanService - Logs de Diagnostic**
- 🔧 Logs détaillés ajoutés pour chaque tentative de détection MAC
- 🔧 Logs indiquant les raisons d'échec (plugin non activé, pas de données, erreur réseau, etc.)
- 🔧 Logs du résultat final (MAC trouvée ou non, source utilisée)
- 🔧 Logs de débogage dans `getMacFromFreebox()` et `getMacFromUniFi()`

**Refresh Existing IPs**
- 🔧 `refreshExistingIps()` utilise automatiquement la nouvelle logique de détection MAC via `getMacAddress()`
- 🔧 Les MAC détectées lors du refresh sont correctement sauvegardées

---

## [0.3.1] - 2025-12-30

### 🐛 Corrigé

**Freebox Revolution - Appels Répétés et Timeouts**
- ✅ Protection contre les appels simultanés multiples à `getStats()` pour éviter la surcharge
- ✅ Si un appel est déjà en cours, réutilisation de la même promesse au lieu de créer un nouveau
- ✅ Réduction des erreurs `AbortError` grâce aux timeouts adaptatifs par endpoint
- ✅ Endpoints lents (`/dhcp/dynamic_lease/`, `/dhcp/static_lease/`, `/fw/redir/`, `/lan/browser/pub/`) : timeout de 30s sur Revolution
- ✅ Autres endpoints : timeout de 20s sur Revolution (au lieu de 10s pour les autres modèles)

**Freebox Revolution - Détection WiFi BSS**
- ✅ Amélioration de la détection SSID avec vérification de plus de champs (`ssid`, `name`, `config.ssid`, `id`, `bssid`)
- ✅ Logs de débogage ajoutés pour diagnostiquer les problèmes de détection WiFi
- ✅ Log du contenu complet du premier BSS si aucun réseau n'est trouvé
- ✅ Meilleure gestion des cas où le SSID est dans un champ non standard

### 🔧 Modifié

**FreeboxPlugin - Protection Concurrente**
- 🔧 Ajout de `isGettingStats` et `statsPromise` pour protéger contre les appels simultanés
- 🔧 Refactorisation de `getStats()` avec méthode interne `_getStatsInternal()`
- 🔧 Réutilisation de la promesse en cours si un appel est déjà actif

**FreeboxApiService - Timeouts Adaptatifs**
- 🔧 Nouvelle fonction `getTimeoutForEndpoint()` pour timeouts adaptatifs par endpoint
- 🔧 Timeout de 30s pour endpoints lents sur Revolution uniquement
- 🔧 Timeout de 20s pour autres endpoints sur Revolution
- 🔧 Timeout de 10s inchangé pour tous les autres modèles (Pop, Ultra, Delta)

**FreeboxPlugin - Requêtes Parallèles Groupées**
- 🔧 Requêtes organisées en 3 groupes séquentiels au lieu de toutes en parallèle
- 🔧 Groupe 1 : endpoints rapides (connection, system)
- 🔧 Groupe 2 : endpoints DHCP (config, leases)
- 🔧 Groupe 3 : endpoints réseau (LAN browser, port forwarding, WiFi)
- 🔧 Évite de surcharger la Freebox Revolution avec trop de requêtes simultanées

---

## [0.3.0] - 2025-12-29

### 🐛 Corrigé

**Scan Réseau - Erreur 504 Gateway Timeout**
- ✅ Correction de l'erreur 504 lors des scans longs (>60 secondes)
- ✅ Le scan est maintenant asynchrone : démarre immédiatement sans bloquer la requête HTTP
- ✅ Plus de timeout HTTP : le scan continue en arrière-plan pendant que le frontend suit le progrès
- ✅ Résolution définitive du problème de timeout sur les scans de grandes plages réseau

### ✨ Ajouté

**Scan Réseau - Architecture Asynchrone**
- ✅ Route POST `/api/network-scan/scan` retourne immédiatement avec statut "scan démarré"
- ✅ Stockage des résultats finaux dans `NetworkScanService` pour récupération via polling
- ✅ Endpoint GET `/api/network-scan/progress` retourne les résultats finaux une fois le scan terminé
- ✅ Frontend adapté pour gérer la réponse asynchrone et récupérer automatiquement les résultats
- ✅ Meilleure expérience utilisateur : suivi du progrès en temps réel sans erreurs

**Service Scan Réseau - Gestion des Résultats**
- ✅ Ajout du champ `lastScanResult` pour stocker les résultats finaux du scan
- ✅ Méthode `getLastScanResult()` pour récupérer les résultats après completion
- ✅ Nettoyage automatique des résultats lors du démarrage d'un nouveau scan

### 🔧 Modifié

**Route POST `/api/network-scan/scan`**
- 🔧 Scan démarré en arrière-plan avec `Promise.then()` au lieu d'attendre la completion
- 🔧 Gestion des erreurs asynchrones avec logs détaillés
- 🔧 Retour immédiat avec statut "started" pour éviter les timeouts HTTP

**Route GET `/api/network-scan/progress`**
- 🔧 Retourne le progrès si scan en cours (`status: 'in_progress'`)
- 🔧 Retourne les résultats finaux si scan terminé (`status: 'completed'`)
- 🔧 Format unifié pour le progrès et les résultats finaux

**Frontend - NetworkScanPage.tsx**
- 🔧 `handleScan()` adapté pour gérer la réponse "scan démarré"
- 🔧 Polling mis à jour pour détecter automatiquement la completion et récupérer les résultats
- 🔧 Gestion du format legacy (sans champ `status`) pour compatibilité

---

## [0.2.9] - 2025-12-29

---

## [0.2.8] - 2025-12-29

### 🐛 Corrigé

**Scan Réseau - Gestion des IPs Offline**
- ✅ Correction : Les nouvelles IPs offline jamais découvertes ne sont plus créées dans la base de données
- ✅ Seules les IPs qui répondent au ping sont ajoutées (comportement original restauré)
- ✅ Les IPs existantes qui passent de "online" à "offline" sont correctement mises à jour
- ✅ Évite la pollution de la base de données et les scans trop lents

**Scan Réseau - Erreur Compilation**
- ✅ Correction de l'erreur : `The symbol "isFirstAttempt" has already been declared`
- ✅ Suppression de la déclaration dupliquée dans la détection MAC

**Freebox Revolution - Timeouts API**
- ✅ Correction spécifique pour Freebox Revolution uniquement (ne touche pas Pop, Ultra, Delta)
- ✅ Timeout API augmenté à 20 secondes pour Revolution (au lieu de 10s)
- ✅ Les autres modèles Freebox conservent le timeout de 10 secondes (inchangé)
- ✅ Méthode `isRevolutionModel()` pour détecter uniquement la Revolution
- ✅ Résout les erreurs `AbortError` sur les endpoints `/dhcp/dynamic_lease/`, `/fw/redir/`, `/lan/browser/pub/`

**Timeout HTTP Serveur**
- ✅ Timeout HTTP augmenté de 2 minutes à 5 minutes pour les scans réseau longs
- ✅ Évite les erreurs 504 Gateway Timeout sur les scans de grandes plages

**Docker Local - Configuration**
- ✅ Correction du port par défaut affiché pour docker-compose.local.yml (3000 au lieu de 3666)
- ✅ Ajout du support de la variable d'environnement `HOST_IP` pour spécifier l'IP de l'hôte
- ✅ Documentation ajoutée dans docker-compose.local.yml pour configurer HOST_IP

### ✨ Ajouté

**Interface Utilisateur - Affichage Durée Scan**
- ✅ Affichage de la durée du scan dans les résultats avec format lisible
- ✅ Format adaptatif : "1m 23s" si >= 60s, "45.2s" sinon
- ✅ Durée affichée pour les scans "full" et "refresh"
- ✅ Fonction utilitaire `formatDuration()` pour formatage cohérent

**Documentation - Troubleshooting Réseau Lent**
- ✅ Guide complet dans `Doc_Dev/TROUBLESHOOTING_MAC_DETECTION.md`
- ✅ Documentation des 7 problèmes potentiels sur réseau lent
- ✅ Valeurs actuelles documentées pour tous les timeouts et paramètres
- ✅ Recommandations de configuration pour réseau très lent (>50ms latence)
- ✅ Commandes de diagnostic pour identifier les problèmes

### 🔧 Modifié

**Service Scan Réseau - Traitement des Résultats**
- 🔧 Amélioration du traitement des promesses rejetées avec gestion explicite
- 🔧 Séparation claire entre IPs online, offline et erreurs
- 🔧 Logs améliorés pour le débogage des problèmes de scan
- 🔧 Meilleure robustesse face aux erreurs réseau

**Service Freebox API - Timeout Adaptatif**
- 🔧 Détection automatique du modèle Freebox (Revolution vs autres)
- 🔧 Timeout adaptatif selon le modèle détecté
- 🔧 Logs de débogage pour identifier le modèle et le timeout utilisé

**Configuration Docker Local**
- 🔧 Support de la variable d'environnement `HOST_IP` pour spécifier l'IP de l'hôte
- 🔧 Port par défaut corrigé pour correspondre au mapping docker-compose.local.yml

---
## [0.2.7] - 2025-12-29

### 🐛 Corrigé

**Scan Réseau - IPs Manquantes (Bug Critique)**
- ✅ Correction du problème "une IP sur deux" manquante lors des scans
- ✅ Gestion correcte des promesses rejetées (timeouts/erreurs de ping)
- ✅ Les promesses rejetées sont maintenant capturées et traitées comme IPs offline
- ✅ Sauvegarde des nouvelles IPs offline dans la base de données
- ✅ Toutes les IPs scannées apparaissent maintenant dans les résultats, même si elles sont offline
- ✅ Logs de débogage ajoutés pour identifier les problèmes de ping

**Scan Réseau - Déclaration Variable Dupliquée**
- ✅ Correction de l'erreur de compilation : `The symbol "isFirstAttempt" has already been declared`
- ✅ Suppression de la déclaration dupliquée dans la détection MAC

### ✨ Ajouté

**Interface Utilisateur - Affichage Durée Scan**
- ✅ Affichage de la durée du scan dans les résultats (format lisible : "1m 23s" ou "45.2s")
- ✅ Fonction utilitaire `formatDuration()` pour formater la durée de manière cohérente
- ✅ Durée affichée pour les scans "full" et "refresh"
- ✅ Format adaptatif : minutes + secondes si >= 60s, secondes avec décimales sinon

**Documentation - Troubleshooting Réseau Lent**
- ✅ Guide complet dans `Doc_Dev/TROUBLESHOOTING_MAC_DETECTION.md`
- ✅ Documentation des 7 problèmes potentiels sur réseau lent
- ✅ Valeurs actuelles documentées pour tous les timeouts et paramètres de concurrence
- ✅ Recommandations de configuration pour réseau très lent (>50ms latence)
- ✅ Commandes de diagnostic pour identifier les problèmes de latence
- ✅ Instructions pour ajuster les timeouts et la concurrence selon le réseau

### 🔧 Modifié

**Service Scan Réseau - Traitement des Résultats**
- 🔧 Amélioration du traitement des résultats de ping avec gestion explicite des promesses rejetées
- 🔧 Séparation claire entre IPs online, offline et erreurs
- 🔧 Meilleure gestion des nouvelles IPs offline pour qu'elles apparaissent dans les résultats
- 🔧 Logs améliorés pour le débogage des problèmes de scan

---

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
