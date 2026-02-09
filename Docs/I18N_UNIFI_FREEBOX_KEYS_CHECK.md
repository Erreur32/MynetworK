# Vérification des clés i18n UniFi et Freebox

## Règles anti-doublons appliquées

- **Règle 1 (une clé par sens)** : Pas de `unifi.page.pluginNotConnected` ; on utilise `unifi.pluginNotConnected` (unifi.json) partout (carte + page). Idem pour les autres textes partagés.
- **Règle 2 (où placer)** : Cœur plugin = unifi.json / freebox.json (partagé carte + page). Spécifique page = unifiPage.json / freeboxPage.json (pageTitle, tabs, options, seeMore). Partagé app = common / network / system (ex. **Uptime** = `system.uptime` dans App.tsx, pas freebox.uptime).
- **Règle 3 (réutilisation avant création)** : Dans l’onglet NAT on utilise `network.status`, `network.connected`, `unifi.tableName` (au lieu de doublons status/nameLabel/connected dans unifiPage). Pas de clé unifi en doublon avec network/common/system.
- **Règle 4 (pas de duplication entre fichiers d’un même plugin)** : unifiPage.json et freeboxPage.json n’redéfinissent pas les clés de unifi.json / freebox.json. Merge i18n = `...frUnifi.unifi, ...frUnifiPage.unifi` (et idem freebox).

## 1. Clés utilisées dans le code et présentes dans les JSON

Toutes les clés `t('freebox.xxx')` et `t('unifi.xxx')` utilisées dans le projet existent bien dans `fr` et `en`.

### Freebox (utilisées)
- `freebox.state`, `freebox.page.options`, `freebox.page.seeMore`, `freebox.downloadRealtime`, `freebox.uploadRealtime`, `freebox.speedTest`, `freebox.page.speedTestApiMessage`, `freebox.page.period30d|7d|24h`, `freebox.page.wifi`, `freebox.page.local`
- `freebox.refreshSession`, `freebox.reconnect`, `freebox.checkApiConnection`, `freebox.systemState`, `freebox.sessionOk`, `freebox.sessionExpired`, `freebox.wifiStations`, `freebox.accessPointsCount`, `freebox.channel`, `freebox.devicesCount`, `freebox.load`, `freebox.temperature`, `freebox.fan`

### UniFi (utilisées)
- `unifi.pageTitle`, `unifi.tabs.*`, `unifi.pluginUnavailable`, `unifi.pluginNotInstalled`, `unifi.pluginNotConnected`, `unifi.pluginNotConnectedDescription`, `unifi.configureFromPlugins`
- `unifi.accessPointFallback`, `unifi.switchFallback`, `unifi.checkConfig`, `unifi.clients`, `unifi.aps`, `unifi.switches`, `unifi.clientsConnected`, `unifi.pointsAccess`, `unifi.accessPointLabel`, `unifi.accessPointIpLabel`, `unifi.bandSupported`, `unifi.tableName`, `unifi.activePorts`, `unifi.total`, `unifi.activeCount`, `unifi.nat`, `unifi.activeRules`

## 2. Clés existantes mais non utilisées (chaînes en dur à remplacer)

Dans **UniFiPage.tsx** et **PluginSummaryCard.tsx**, plusieurs chaînes sont encore en français/anglais au lieu d’utiliser des clés déjà présentes ou à ajouter.

### À brancher (clés déjà dans unifi.json)
- `unifi.natRules` → titre "Règles NAT"
- `unifi.noNatRuleConfigured` → "Aucune règle NAT configurée"
- `unifi.noRuleForFilter` → message filtre NAT
- `unifi.noWanInfo` → "Aucune info WAN..."
- `unifi.noLanInfo` → "Aucune info LAN"
- `unifi.statsAnalysis` → "Analyse des Stats Réseau"
- `unifi.systemStatsAnalysis` → "Analyse des Stats Système"
- `unifi.pointsAccess` → "Points d'Accès"
- `unifi.switches` → "Switches"
- `unifi.clients` → "Clients"
- `unifi.events` → "Événements UniFi"
- `unifi.traffic` → titre trafic

### Nouvelles clés à ajouter (unifi / unifiPage)

| Clé | FR | Usage |
|-----|----|--------|
| `sitesTitle` | Sites UniFi | Carte / section Sites |
| `siteFallback` | Site UniFi | Nom de site par défaut |
| `switchPortsTitle` | Ports des Switches UniFi | Carte onglet Switch |
| `trafficNetwork` | Trafic Réseau (UniFi) | Titre carte Trafic |
| `pluginInfo` | Informations du Plugin | Carte Debug |
| `configuration` | Configuration | Carte Debug |
| `rawStatsDebug` | Stats Brutes (pluginStats['unifi']) | Carte Debug |
| `deviceAnalysis` | Analyse des Devices | Carte Debug |
| `debugActions` | Actions de Debug | Carte Debug |
| `gatewayAndPorts` | Gateway & Ports | Carte onglet NAT |
| `natRulesLoading` | Chargement des règles NAT... | État chargement NAT |
| `natRulesLoadError` | Impossible de charger les règles NAT | Erreur |
| `natRulesFetchError` | Erreur lors du chargement des règles NAT | Erreur |
| `natRulesManagedByGateway` | Les règles NAT sont gérées par le gateway UniFi | Sous-texte vide |
| `rulesShownCount` | {{shown}} règle(s) affichée(s) sur {{total}} | Filtre NAT |
| `filterAll` | Tous | Filtre NAT (réutiliser unifi.filterAll) |
| `wan` | WAN | Onglet NAT |
| `lan` | LAN | Onglet NAT |
| `gatewayLabel` | Gateway : | Onglet NAT |
| `portCountEthernet` | {{count}} port(s) Ethernet | Onglet NAT |
| `debugInfo` | Debug Info : | Carte Debug |

**Réutilisation (pas de doublon)** : Statut = `network.status`, Nom : = `unifi.tableName` + " :", Connecté = `network.connected`.

### Freebox

| Clé | FR | Usage |
|-----|----|--------|
| `label` | Freebox | Libellé court dans PluginSummaryCard |

## 3. Fichiers à mettre à jour

- **Locales** : `unifiPage.json` (FR/EN) et `freebox.json` (FR/EN) avec les nouvelles clés.
- **UniFiPage.tsx** : remplacer toutes les chaînes listées ci-dessus par `t('unifi.xxx')` ou `t('unifiPage.xxx')` selon l’emplacement des clés.
- **PluginSummaryCard.tsx** : "Sites UniFi", "Site UniFi", "Freebox" → `t('unifi.sitesTitle')`, `t('unifi.siteFallback')`, `t('freebox.label')`.
