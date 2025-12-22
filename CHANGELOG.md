# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

## [0.1.13] - 2025-12-22

### ✨ Ajouté

**Plugin Scan Réseau - Détection de Vendor**
- 🏷️ Nouveau service de détection de fabricant (vendor) à partir des adresses MAC (OUI)
- 📦 Base de données locale OUI avec les fabricants courants (Apple, Samsung, TP-Link, etc.)
- 🌐 Fallback vers l'API macvendors.com si le vendor n'est pas dans la base locale
- 📊 Enrichissement automatique des résultats de scan avec le fabricant du matériel

**Plugin Scan Réseau - Scan Initial au Démarrage**
- 🚀 Lancement automatique d'un scan initial au démarrage du serveur si le scan automatique est activé
- ⚙️ Utilise la plage réseau par défaut configurée dans les paramètres
- 📝 Logs détaillés pour le suivi du scan initial

**Dashboard - Widget Scan Réseau**
- 📊 Affichage des mêmes informations que "Info Scans" dans la carte du dashboard
- 📅 Affichage du dernier scan avec type (Manuel/Auto, Full Scan/Refresh), date exacte et temps relatif
- 🔄 Affichage des scans auto activés (Full scan auto et Refresh auto) avec dates et temps relatifs
- 🎨 Format compact sur une seule ligne pour un affichage optimal

### 🔧 Modifié

**Plugin Scan Réseau - Détection MAC**
- 🔍 Amélioration de la détection MAC : utilisation de `ip neigh` et `arp-scan` en priorité (comme WatchYourLAN)
- 📋 Ordre de priorité : `ip neigh` → `arp-scan` → `arp` (fallback)
- 🐳 Support amélioré pour Docker avec détection automatique des outils disponibles

**Plugin Scan Réseau - Gestion du Ping**
- 🔧 Détection automatique de l'environnement (Docker vs npm) pour utiliser le bon chemin de ping
- 🐧 En mode npm : utilisation de `ping` via PATH système avec recherche automatique du chemin complet
- 🐳 En mode Docker : recherche dans `/bin/ping` et `/usr/bin/ping`
- ⚙️ Gestion améliorée des codes de sortie non-zéro (normaux pour ping en cas de perte de paquets)
- 📝 Logs d'erreur uniquement pour les vraies erreurs système (permissions, commande introuvable)

**Plugin Scan Réseau - Configuration Automatique**
- 🎯 Calcul correct du statut `enabled` : vérifie que le master switch ET au moins un sous-config sont activés
- 📊 Affichage du statut corrigé dans l'interface (plus de "désactivé" alors que les options sont activées)
- 🔄 Synchronisation automatique avec l'état du plugin "Scan Réseau" (pause si plugin désactivé)

**Plugin Scan Réseau - Affichage**
- 🎨 Affichage compact sur une seule ligne pour les scans auto (Auto Refresh (quick) 22/12/2025 15:10 Il y a 9min)
- 📱 Support du responsive avec `whitespace-nowrap` et `overflow-x-auto` pour petits écrans
- 🎯 Uniformisation de l'affichage entre la page Scan Réseau et le widget dashboard

**Configuration Serveur**
- 🔧 Port par défaut en mode npm : `3003` (défini explicitement dans package.json)
- 📝 Correction de l'affichage des ports dans les logs de démarrage

### 🐛 Corrigé

**API / Routes**
- ✅ Correction de l'erreur 404 pour `/api/network-scan/auto-status` (route définie avant `/:id` pour éviter les conflits)
- ✅ Suppression des routes dupliquées `/auto-status` dans `server/routes/network-scan.ts`
- ✅ Correction de l'ordre des routes Express (routes spécifiques avant routes paramétrées)

**Plugin Scan Réseau - Statut**
- ✅ Correction du calcul du statut `enabled` : vérifie maintenant correctement les sous-configs (fullScan et refresh)
- ✅ Correction de l'affichage "Scan automatique désactivé" alors que les options sont activées
- ✅ Ajout de logs de débogage pour tracer le calcul du statut

**Plugin Scan Réseau - Ping**
- ✅ Correction du problème de ping en mode npm (détection correcte de l'environnement)
- ✅ Correction de la gestion des erreurs : ne log plus les échecs normaux de ping (hôte hors ligne)
- ✅ Amélioration de la détection des vraies erreurs système (permissions, commande introuvable)

**Interface Utilisateur**
- ✅ Correction de l'affichage du statut sur une seule ligne (suppression de `flex-wrap`)
- ✅ Correction de l'erreur JSX (balise `<span>` non fermée) dans NetworkScanPage.tsx


---

## [0.1.12]- 2025-12-22

### ✨ Ajouté

**Administration - Onglet Backup**
- 📦 Nouvel onglet "Backup" dans l'administration pour gérer les sauvegardes des équipements réseau
- 🔗 Bouton pour ouvrir la page de backup Freebox (`#Fbx.os.app.settings.app`) avec affichage de l'URL
- 🔗 Bouton pour ouvrir la page de backup UniFi Controller (`/manage/{site}/settings/system/backups`) avec affichage de l'URL
- 📝 Section d'information expliquant les limitations techniques et recommandant les sauvegardes manuelles
- 🔧 Fonction helper `getFreeboxBackupUrl()` pour construire l'URL de backup Freebox depuis la configuration

**Métriques Prometheus**
- 🔧 Port par défaut aligné avec Docker : `7505` en production (port exposé par Docker Compose)
- 🌐 Gestion intelligente de l'URL Prometheus :
  - Si URL publique (domaine) configurée : `https://domaine.com/api/metrics/prometheus` (sans port)
  - Sinon : `http://IP:7505/api/metrics/prometheus` (avec port Docker)
- 🔄 Migration automatique des anciens ports (9090, 3000) vers le nouveau port par défaut (7505)
- 📡 Récupération automatique de l'URL publique depuis les paramètres système

### 🔧 Modifié

**Métriques Prometheus**
- 🎯 Port par défaut en production changé de `3000` à `7505` (port Docker exposé)
- 🔄 Mise à jour automatique de l'URL Prometheus lors du changement de l'URL publique
- 📝 Amélioration de la logique de construction d'URL selon la configuration (domaine vs IP)

 
---

## [0.1.11] - 2025-12-21

### ✨ Ajouté

**Plugin Scan Réseau - Interface**
- 🔄 Rafraîchissement en temps réel de la liste des IPs pendant le scan (polling toutes les 2 secondes)
- 🎨 Animations dans le tableau : indicateur "Scan en cours..." dans l'en-tête avec icône animée
- 🎨 Animation pulse sur les lignes des IPs "online" pendant le scan pour indiquer l'activité
- 📋 Plage réseau par défaut : `192.168.1.0/24` pré-remplie (réseau local standard)
- 📖 Aide réseau/mask dans le modal : explication des notations CIDR, plages et masques réseau courants
- 🎨 Amélioration de la mise en page : plage IP sur la même ligne que la case à cocher "Auto-détection"
- 🔘 Bouton d'aide à côté du champ de plage IP pour accès rapide

**Docker / Scan Réseau**
- 📝 Documentation améliorée des options Docker pour le scan réseau (network_mode: host, privileged)
- 📝 Commentaires explicatifs sur les capacités réseau NET_RAW et NET_ADMIN
- 🔧 Correction de la configuration Docker : suppression de l'option problématique /proc/net mount

### 🔧 Modifié

**Plugin Scan Réseau**
- 🔄 Polling automatique pendant le scan et le rafraîchissement pour voir les résultats en temps réel
- 🎯 Auto-détection désactivée par défaut (plage manuelle préférée)
- 🎨 Interface utilisateur améliorée avec animations et indicateurs visuels

## [0.1.10] - 2025-12-21

### 🐛 Corrigé

**Plugin Scan Réseau**
- ✅ Correction de la détection automatique du réseau pour limiter à /24 (réseaux locaux standard)
- ✅ Correction de l'erreur "CIDR /16 would scan 65536 IPs" lors de l'auto-détection
- ✅ Amélioration de la gestion d'erreur avec messages plus détaillés et suggestions
- ✅ Ajout de logs pour diagnostiquer les problèmes de permissions réseau (NET_RAW, ping)

**API / Routes**
- ✅ Amélioration des messages d'erreur pour le scan réseau avec suggestions de correction
- ✅ Ajout de détails d'erreur en mode développement pour faciliter le débogage

## [0.1.9] - 2025-12-21

### ✨ Ajouté

**Docker / Scan Réseau**
- 🔧 Ajout des capacités réseau `NET_RAW` et `NET_ADMIN` dans docker-compose.yml pour permettre le scan réseau
- 📦 Ajout de `iputils-ping` et `iproute2` dans le Dockerfile pour les commandes ping et ip neigh
- 📝 Documentation de l'option alternative `network_mode: host` dans docker-compose.yml (si le mode bridge ne fonctionne pas)

### 🔧 Modifié

**Docker**
- 🔧 Configuration Docker mise à jour pour supporter le plugin Scan Réseau dans les conteneurs
- 📋 Ajout de commentaires explicatifs dans docker-compose.yml pour les capacités réseau

## [0.1.8] - 2025-12-21

### 🐛 Corrigé

**Docker / CI/CD**
- ✅ Correction du workflow GitHub Actions pour supprimer le tag Docker `0.1` indésirable lors du build/push
- ✅ Suppression du pattern `{{major}}.{{minor}}` dans le workflow docker-publish.yml qui générait des tags incomplets

**Scripts**
- ✅ Suppression du template vide dans le script `update-version.sh` (message de commit minimal si CHANGELOG vide)

## [0.1.7] - 2025-12-21

### ✨ Ajouté

**Plugin Scan Réseau**
- 🔍 Nouveau plugin "Scan Réseau" pour scanner le réseau local et découvrir les IPs
- 📊 Page dédiée avec tableau des résultats, filtres par statut (online/offline), et historique
- 🎯 Fonctionnalités de scan : scan complet, rafraîchissement des IPs existantes, scan automatique configurable
- 💾 Stockage en base de données SQLite avec historique des IPs (IP, MAC, hostname, statut, latence)
- 🎨 Widget dashboard avec statistiques (Total IPs, Online, Offline) et listes des IPs offline et pires latences
- 🔄 Badge footer pour accès rapide au plugin scan réseau
- ⚙️ Configuration dans l'onglet Administration > Plugins avec mini-carte de statut
- 📝 Édition inline du hostname dans le tableau des résultats
- 🎨 Affichage des latences en couleurs selon la gravité (vert <50ms, jaune 50-100ms, orange 100-200ms, rouge >200ms)
- 📋 Modal d'aide expliquant la différence entre "Scanner" et "Rafraîchir"

**Page UniFi - Améliorations**
- 🎨 Mini-cartes améliorées pour les points d'accès avec affichage des bandes, canaux, SSIDs et nombre de clients
- 📊 Affichage des SSIDs groupés par bande de fréquence (2.4GHz, 5GHz, 6GHz) dans les mini-cartes AP
- 🔢 Badge avec nombre de clients par bande de fréquence pour chaque AP
- 💡 Tooltips informatifs sur les mini-cartes AP (nom, IP, bandes, canaux, SSIDs, clients)
- 📈 Affichage de l'uptime, firmware, CPU et consommation électrique dans les mini-cartes AP et Switch
- 🏷️ Badges plus grands pour clients, APs et switches dans les mini-cartes de sites
- 🎨 Mini-cartes AP copiées dans l'onglet "Analyse" avec affichage en deux colonnes
- 📊 Section "Sites UniFi" ajoutée dans la carte UniFi du dashboard avec mini-cartes de sites
- 🔌 Informations détaillées des ports switches avec différenciation des couleurs (nom switch en cyan, IP en bleu)
- 📋 Affichage des canaux utilisés par chaque AP avec badges colorés par bande
- 🔄 Réorganisation de l'onglet "Vue d'ensemble" avec fusion de "Sites, APs & Switches"
- 📊 Réorganisation des onglets : "Clients" déplacé en deuxième position après "Vue d'ensemble"

**Dashboard**
- 📊 Carte "Scan Réseau" avec statistiques et listes des IPs offline et pires latences
- ⏱️ Affichage du dernier scan effectué dans le widget "État des plugins"
- 🎨 Carte UniFi Controller réorganisée : mini-carte site agrandie, suppression des doublons d'infos contrôleur
- 📊 Affichage des réseaux Wi-Fi (SSID) avec nombre de clients par SSID sur la même ligne que "Clients connectés"
- 🔌 Informations des canaux et bandes pour chaque AP dans la carte UniFi du dashboard
- 📋 Affichage conditionnel des tableaux AP/Switch uniquement dans l'onglet "Analyse" de la page UniFi

**Interface**
- 🏠 Logo du header cliquable pour retourner au dashboard principal
- 🎨 Uniformisation des hauteurs de tableaux et cellules entre "Bornes Wi-Fi" et "Switches" dans l'onglet Analyse
- 📊 Affichage de "Clients connectés" et "Total" sur la même ligne dans la carte UniFi
- 🎯 Suppression de la carte "Analyse trafic UniFi" du dashboard (conservée uniquement dans l'onglet Analyse)

### 🔧 Modifié

**Page UniFi**
- 🎨 Correction de la couleur de fond de l'onglet "Analyse" pour correspondre aux autres cartes UniFi
- 📊 Tableaux "Bornes Wi-Fi" et "Switches" affichés en deux colonnes dans l'onglet "Analyse"
- 🎨 Uniformisation des hauteurs de tableaux et cellules entre les tableaux UniFi Controller
- 🔄 Suppression des cartes AP et Switch de l'onglet "Overview" (fusion dans "Vue d'ensemble")
- 📋 Correction de la logique d'affichage de l'alerte "Mise à jour dispo" (vérification précise de `upgradable` et `upgrade_to_firmware`)
- 🎨 Amélioration de l'agencement interne des mini-cartes AP et Switch avec plusieurs colonnes
- 📊 Alignement des badges SSID par fréquence dans les mini-cartes AP
- 🔢 Déplacement du nombre d'utilisateurs sous chaque bande de fréquence dans les mini-cartes AP
- 🎨 Affichage des badges de bandes et canaux sur une seule ligne sur grand écran dans le tableau des APs

**Plugin Scan Réseau**
- 🎨 Suppression des fonds colorés de la carte "Scan Réseau" du dashboard (conservation uniquement des nombres colorés)
- 🔄 Correction des appels API pour inclure le préfixe `/api` et gérer correctement la structure `ApiResponse`
- 🐛 Correction de la boucle de chargement infinie pour les listes "IPs Offline" et "Top Pire Latence"
- 📊 Amélioration de l'affichage conditionnel des états de chargement et listes vides

**Footer**
- 🎨 Suppression des icônes "television", "telephone", "fichier", "vm" et "analytique" pour la page scan réseau (comme pour la page search)
- 🔄 Ajout des boutons "Recherche" et "Administration" dans le footer pour la page scan réseau
- 📝 Changement du texte du badge scan réseau de "Scan Réseau" à "IPs" dans le footer uniquement

**Administration**
- 🎨 Simplification de la carte plugin scan-réseau : suppression des boutons "check" et "options", conservation uniquement du switch on/off
- 📊 Alignement du switch à gauche dans la carte plugin scan-réseau

### 🐛 Corrigé

**Plugin Scan Réseau**
- ✅ Correction de l'erreur "Invalid token" lors du clic sur le bouton scan (utilisation de l'API client centralisée)
- ✅ Correction de l'erreur "Activity is not defined" dans MultiSourceWidget (ajout de l'import)
- ✅ Correction de l'affichage du hostname (utilisation correcte de `dns.reverse` et gestion des erreurs)
- ✅ Correction de la syntaxe dans NetworkScanPage.tsx (suppression du point-virgule en trop)
- ✅ Correction des appels API manquants du préfixe `/api` dans NetworkScanWidget
- ✅ Correction de la boucle de chargement infinie pour les listes "IPs Offline" et "Top Pire Latence" (gestion correcte des dépendances useEffect)

**Page UniFi**
- ✅ Correction de la logique d'affichage de l'alerte "Mise à jour dispo" (vérification précise de `upgradable === true` et `upgrade_to_firmware`)
- ✅ Correction de l'inversion des couleurs de fond et de texte dans l'onglet "Analyse"
- ✅ Correction de l'affichage des données de firmware, CPU et consommation pour les switches et APs

**Interface**
- ✅ Correction de l'affichage du dernier scan dans le widget "État des plugins" (affichage de "scan en attente..." si aucun scan)

### 📝 Documentation

- 📄 Consolidation de toute la documentation du plugin scan réseau dans `Doc_Dev/SCAN_RESEAU_COMPLETE.md`
- 📝 Mise à jour du script `update-version.sh` avec couleurs, création automatique du message de commit et commandes Git complètes



---

## [0.1.6] - 2025-01-XX

### ✨ Ajouté

**Page UniFi**
- 🔌 Nouvel onglet "Switch" avec tableau détaillé des ports des switches UniFi
- 📊 Colonnes du tableau Switch : SWITCH, IP, VITESSE, POE, PORT, ERREURS, NOM PORT
- 📈 Nouvel onglet "Analyse" dans la page UniFi avec carte PluginSummaryCard et widget NetworkEventsWidget
- 📋 Tableau "Top 3 des temps de client connecté" dans l'onglet Analyse
- 🔄 Réorganisation des onglets : regroupement de "Sites", "Points d'Accès" et "Switches" dans un seul onglet
- 🎨 Affichage en deux colonnes pour les tableaux dans l'onglet Analyse (grand écran)
- 📐 Alignement des colonnes entre tous les tableaux de l'onglet Analyse

**Widget Analyse rapide du trafic UniFi**
- 📊 Affichage conditionnel en deux colonnes (onglet Analyse) ou une colonne (dashboard)
- ⏱️ Nouveau tableau "Top 3 des temps de client connecté" avec formatage du temps (jours/heures)
- 📏 Colonne IP agrandie (28%) pour éviter la troncature sur petits écrans

**Carte PluginSummaryCard**
- 📊 Colonne "Speed" ajoutée au tableau des switches
- 📐 Alignement des colonnes IP (28%) dans tous les tableaux
- 📍 Informations "Clients connectés" et "Total" déplacées dans le corps de la carte (au lieu du header)

**Carte Système Serveur**
- ⏱️ Uptime ajouté en bas de la carte avec format jours/heures (si > 24h)

### 🔧 Modifié

**Page UniFi**
- 🔄 Suppression du bouton "Actualiser" du header
- 📊 Tableaux Wi‑Fi et Switches affichés en une seule colonne sur le dashboard (au lieu de deux)
- 📊 Tableaux "Top 5 upload" et "Top 5 download" affichés en deux colonnes dans l'onglet Analyse
- 📊 Tableaux "3 pires signaux Wi‑Fi" et "Top 3 temps de connexion" affichés en deux colonnes dans l'onglet Analyse
- 🎯 Amélioration de l'extraction des données des ports switches (détection vitesse depuis media, PoE amélioré)
- 🐛 Correction de la détection des switches (filtrage amélioré par type et modèle)
- 🐛 Ajout de logs de debug pour diagnostiquer les problèmes d'affichage des ports

**Formatage Uptime**
- ⏱️ Affichage des jours si uptime > 24h pour les cartes Freebox, UniFi et Système Serveur
- 📅 Format : "Xj Yh" si jours et heures, "Xj" si seulement jours, "Xh" si < 24h

**Interface**
- 📏 Colonne IP agrandie à 28% dans tous les tableaux de l'onglet Analyse
- 🎨 Suppression du troncage sur la colonne IP (whitespace-nowrap) pour affichage complet

### 🐛 Corrigé

**Page UniFi**
- ✅ Correction de l'onglet "Switch" qui n'était pas cliquable (suppression de la redirection automatique)
- ✅ Correction de l'affichage des ports switches (amélioration de l'extraction des données)

## [0.1.5] - 2025-01-XX

### 🐛 Corrigé

**Authentification**
- ✅ Correction du message d'erreur pour les mots de passe incorrects : affiche maintenant "Nom d'utilisateur ou mot de passe incorrect" au lieu de "Impossible de contacter le serveur"
- ✅ Amélioration de la détection des erreurs d'authentification dans le store utilisateur

**WebSocket**
- ✅ Suppression des erreurs WebSocket "Invalid frame header" en production (interception console.error)
- ✅ Limitation des tentatives de reconnexion WebSocket à 1 seule tentative en production pour éviter le spam console
- ✅ Désactivation automatique après 1 échec en production (le polling HTTP prend le relais)

### ✨ Ajouté

**Interface Utilisateur**
- 👥 Ajout du menu "Utilisateurs" dans le header pour les administrateurs
- 👤 Menu utilisateur ajouté dans le header de la page Administration
- 🎨 Avatar utilisateur agrandi dans le header (32px → 40px)
- 📏 Icônes du menu utilisateur agrandies (16px → 20px) pour une meilleure visibilité

### 🔧 Modifié

**Frontend**
- `src/components/ui/UserMenu.tsx` :
  - Ajout du bouton "Utilisateurs" visible uniquement pour les admins
  - Avatar agrandi (w-8 h-8 → w-10 h-10)
  - Icônes agrandies (size={16} → size={20})
- `src/components/layout/Header.tsx` :
  - Ajout de la prop `onUsersClick` pour la navigation vers la page utilisateurs
- `src/pages/SettingsPage.tsx` :
  - Ajout du composant UserMenu dans le header en mode administration
  - Import de UserMenu depuis '../components/ui'
- `src/App.tsx` :
  - Ajout du handler `handleUsersClick` pour naviguer vers la page utilisateurs
  - Passage des props nécessaires à SettingsPage et Header
- `src/stores/userAuthStore.ts` :
  - Amélioration de la détection des erreurs d'authentification
  - Vérification améliorée des codes d'erreur API (UNAUTHORIZED, INVALID_CREDENTIALS)
- `src/hooks/useConnectionWebSocket.ts` :
  - Limitation à 1 tentative de reconnexion en production (au lieu de 3)
  - Désactivation automatique après 1 échec en production
- `src/main.tsx` :
  - Interception de console.error en production pour supprimer les erreurs WebSocket natives

## [0.1.4] - 2025-01-XX

### 🐛 Corrigé

**WebSocket & Performance**
- ✅ Désactivation automatique du WebSocket en dev Docker pour éviter les erreurs "Invalid frame header"
- ✅ Fallback automatique vers polling HTTP toutes les 1 seconde si WebSocket désactivé
- ✅ Correction du graphique Freebox : retour aux courbes lisses au lieu de lignes carrées
- ✅ Optimisation des re-renders avec useMemo pour éviter les recalculs inutiles

**Interface Utilisateur**
- ✅ Amélioration de l'UI du champ URL publique : label au-dessus, input full-width
- ✅ Suppression du texte explicatif redondant dans les settings

**Build & Optimisation**
- ✅ Intégration Tailwind CSS via PostCSS (suppression du CDN en production)
- ✅ Code splitting avec React.lazy() pour réduire la taille des chunks
- ✅ Configuration manualChunks pour séparer les dépendances (Recharts, Lucide, Zustand)
- ✅ Réduction de la taille du chunk principal de ~1.3MB à ~686KB

### ✨ Ajouté

**Configuration**
- 📦 Installation de Tailwind CSS, PostCSS et Autoprefixer comme devDependencies
- ⚙️ Configuration `tailwind.config.js` et `postcss.config.js`
- 🔧 Configuration `vite.config.ts` avec code splitting optimisé

**WebSocket**
- 🔄 Ajustement des intervalles de polling WebSocket alignés avec keep-alive Freebox :
  - Connection status : 500ms → 1 seconde
  - System status : 5s → 10 secondes
- 🛡️ Vérification de session Freebox avant chaque fetch WebSocket
- ⏱️ Délais augmentés pour éviter les erreurs de frames (1s pour polling, 5s pour ping)

### 🔧 Modifié

**Backend**
- `server/services/connectionWebSocket.ts` :
  - Intervalles de polling ajustés (1s connection, 10s system)
  - Vérification de session avant chaque fetch
  - Délais augmentés pour stabilisation (1s polling, 5s ping)
  - Gestion d'erreurs améliorée avec validation de taille des messages
  - Logs améliorés pour le débogage

**Frontend**
- `src/App.tsx` :
  - Désactivation WebSocket en dev Docker (détection automatique)
  - Code splitting avec React.lazy() pour toutes les pages
  - Optimisation avec useMemo pour isDockerDev
  - Suspense avec PageLoader pour les pages lazy-loaded
- `src/hooks/useConnectionWebSocket.ts` :
  - Détection automatique du mode Docker dev
  - Connexion directe au backend (port 3668) en dev Docker
  - Backoff exponentiel pour les reconnexions
  - Flag isConnectingRef pour éviter les connexions multiples
- `src/pages/SettingsPage.tsx` :
  - UI améliorée pour le champ URL publique (label au-dessus, input full-width)
  - Suppression du texte explicatif redondant
- `src/components/widgets/BarChart.tsx` :
  - Retour aux courbes lisses (quadratic Bezier) pour le graphique Freebox
- `vite.config.ts` :
  - Configuration manualChunks pour code splitting
  - Séparation des dépendances (vendor-charts, vendor-icons, vendor-state)
  - chunkSizeWarningLimit augmenté à 600KB
- `index.html` :
  - Suppression du CDN Tailwind CSS
- `src/index.css` :
  - Ajout des directives Tailwind (@tailwind base, components, utilities)
- `src/main.tsx` :
  - Import de index.css pour inclure Tailwind

**Configuration**
- `package.json` : Ajout de tailwindcss, postcss, autoprefixer en devDependencies
- `tailwind.config.js` : Nouveau fichier de configuration Tailwind
- `postcss.config.js` : Nouveau fichier de configuration PostCSS

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.1.4

---

## [0.1.3] - 2025-01-XX

### 🐛 Corrigé

**Authentification & Connexion**
- ✅ Amélioration des messages d'erreur de connexion : affichage de "Nom d'utilisateur ou mot de passe incorrect" au lieu de "Impossible de contacter le serveur"
- ✅ Suppression du message des identifiants par défaut sur la page de login
- ✅ Correction de l'authentification UniFi en production : amélioration de la validation des URLs et des identifiants
- ✅ Correction des erreurs WebSocket "Invalid frame header" et "Disconnected: 1006" en mode développement (suppression des warnings)

**Interface Utilisateur**
- ✅ Correction de l'affichage des ports dans les logs Docker dev (affichage des ports hôte au lieu des ports conteneur)
- ✅ Correction du warning Recharts "width(-1) and height(-1)" en définissant des dimensions fixes pour les conteneurs
- ✅ Correction des clés React dupliquées dans l'historique des connexions

**Graphiques**
- ✅ Correction des graphiques en temps réel Freebox : passage des courbes lisses aux lignes linéaires pour plus de clarté
- ✅ Désactivation des animations pour les graphiques en temps réel (mode live)
- ✅ Extension de la durée des graphiques live de 1 minute à 5 minutes (300 points)

### ✨ Ajouté

**Configuration**
- 🌐 Ajout de la configuration du domaine (PUBLIC_URL) via l'interface d'administration
- 📝 Nouvelle section "Configuration réseau" dans Administration > Général
- 💾 Stockage de la configuration du domaine dans la base de données (priorité sur les variables d'environnement)
- 🔄 Utilisation automatique du domaine configuré pour les URLs WebSocket et les logs

**Documentation**
- 📚 Guide de configuration Nginx pour les WebSockets (`Docs/NGINX_WEBSOCKET_CONFIG.md`)
- 📚 Guide de dépannage pour l'environnement Docker production (`TROUBLESHOOTING_PROD.md`)
- 📚 Documentation des configurations de ports pour tous les modes (`Docs/CONFIGURATION_PORTS_MODES.md`)

**Plugins**
- 🔧 Bouton "Test" toujours disponible même si le plugin est désactivé (permet de tester la configuration avant activation)
- 🔍 Amélioration des messages d'erreur pour le plugin UniFi avec détails de la réponse HTTP

### 🔧 Modifié

**Backend**
- `server/config.ts` : Ajout de `getPublicUrl()` qui lit depuis la DB en priorité, puis les variables d'environnement
- `server/index.ts` : 
  - Affichage du domaine configuré dans les logs de production (au lieu de l'IP par défaut)
  - Priorité : Domaine configuré > IP machine hôte > IP conteneur > localhost
  - Correction des ports affichés dans les logs Docker dev (utilisation des ports hôte)
- `server/routes/system.ts` : Ajout des endpoints `/api/system/config` (GET/POST) pour gérer la configuration générale
- `server/database/models/AppConfig.ts` : Nouveau modèle pour stocker la configuration générale (public_url)
- `server/services/authService.ts` : Amélioration des messages d'erreur pour les identifiants incorrects
- `server/routes/users.ts` : Gestion des erreurs d'authentification avec messages génériques pour éviter l'énumération d'utilisateurs
- `server/plugins/unifi/UniFiApiService.ts` : 
  - Amélioration de la validation des URLs et du trimming des identifiants
  - Messages d'erreur plus détaillés pour les erreurs 400/401/403
- `server/plugins/unifi/UniFiPlugin.ts` : Ajout du trimming des paramètres de configuration

**Frontend**
- `src/pages/SettingsPage.tsx` : Ajout de la section "Configuration réseau" avec champ pour PUBLIC_URL
- `src/components/modals/UserLoginModal.tsx` : Suppression du message des identifiants par défaut
- `src/stores/userAuthStore.ts` : Amélioration des messages d'erreur de connexion
- `src/api/client.ts` : 
  - Retour du code d'erreur `UNAUTHORIZED` pour les réponses 401
  - Amélioration de la gestion des erreurs de connexion
- `src/components/PluginsManagementSection.tsx` : Bouton "Test" toujours visible même si le plugin est désactivé
- `src/components/modals/PluginConfigModal.tsx` : Envoi des paramètres de test directement sans sauvegarde préalable
- `src/components/widgets/BarChart.tsx` : Passage des courbes lisses aux lignes linéaires pour les graphiques Freebox
- `src/components/widgets/BandwidthHistoryWidget.tsx` : 
  - Désactivation des animations pour le mode live
  - Extension de la durée à 5 minutes (300 points)
  - Correction des dimensions du conteneur pour éviter les warnings Recharts
- `src/hooks/useConnectionWebSocket.ts` : 
  - Suppression des warnings WebSocket en mode développement
  - Extension de l'historique à 300 points (5 minutes)
  - Ajout d'un mécanisme de fallback par polling si WebSocket échoue
- `src/stores/connectionStore.ts` : Extension de l'historique à 300 points (5 minutes)
- `vite.config.ts` : 
  - Correction du proxy pour Docker dev (utilisation des ports conteneur)
  - Configuration du HMR pour utiliser le port hôte en Docker dev

**Docker**
- `docker-compose.yml` : Nettoyage des commentaires superflus et des variables d'environnement redondantes
- `docker-compose.dev.yml` : Configuration des ports hôte (3666 pour frontend, 3668 pour backend)

**Configuration**
- `src/constants/version.ts` : Version mise à jour à 0.1.3
- `package.json` : Version mise à jour à 0.1.3
- `README.md` : Badge de version mis à jour à 0.1.3

### 🔒 Sécurité

**Authentification**
- ✅ Messages d'erreur génériques pour éviter l'énumération d'utilisateurs
- ✅ Validation stricte des URLs dans la configuration du domaine

### 📝 Documentation

- `CHANGELOG.md` - Ajout de la version 0.1.3
- `Docs/NGINX_WEBSOCKET_CONFIG.md` - Guide de configuration Nginx pour WebSockets
- `TROUBLESHOOTING_PROD.md` - Guide de dépannage Docker production
- `Docs/CONFIGURATION_PORTS_MODES.md` - Documentation des ports pour tous les modes

---

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

