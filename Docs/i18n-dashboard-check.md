# Vérification i18n Dashboard – Clés manquantes / doublons

**Date:** 2025-02-07

## Périmètre

- Fichiers : `src/locales/fr/dashboard.json`, `src/locales/en/dashboard.json`
- Composants concernés : `App.tsx`, `UnifiedDashboardPage.tsx`, `MultiSourceWidget`, `PluginSummaryCard`, `BandwidthHistoryWidget`, `NetworkSummaryDashboardWidget`, `SystemServerWidget`, `NetworkScanWidget` (ce dernier utilise `networkScan.widget.*`, pas `dashboard`)

## Résultat

### Clés manquantes

**Aucune.** Toutes les clés `dashboard.*` utilisées dans le code existent dans les deux fichiers (FR et EN) :

- **Racine dashboard** : `filter`, `planning`, `wps`, `active`, `offline`, `showAllDevices`, `reduceList`, `noWifiConfigured`, `downloads`, `create`, `virtualMachines`, `noDiskDetected`, `connectDiskForVms`, `vmsNotAvailable`, `vmsNotSupported`, `noVmConfigured`, `createVmToStart`, `noMatchingEvents`, `noRecentEvents`, `noPluginConfigured`, `configurePluginInSettings`
- **dashboard.pluginsState** : `title`, `activeCount`, `noPlugin`, `noPluginHint`, `freeboxPermissionTitle`, `freeboxPermissionDesc`, `freeboxPermissionLink`, `goToAdmin`, `firmware`, `version`, `statusActive`, `statusOk`, `statusUnavailable`, `configRequired`, `disabled`, `apiVersion`, `firmwareBox`, `firmwarePlayer`, `apiMode`, `firmwareVersion`, `lastScan`, `scanPending`, `justNow`, `agoMins`, `agoHours`, `agoDays`, `source`, `time`, `statsUnavailable`
- **dashboard.bandwidth** : `title`, `period`, `realtime`, `scale`, `scaleRealtime`, `scaleHistory`, `live`, `auth`, `refreshHistory`, `reconnectFreebox`, `collectingData`, `chartWillFill`

### Doublons

**Aucun doublon** dans `dashboard.json` (chaque clé n’apparaît qu’une fois).

**Recouvrement sémantique (volontaire)** :
- `dashboard.pluginsState.lastScan` / `justNow` / `agoMins` etc. : utilisés dans **MultiSourceWidget** pour la ligne du plugin scanner (état des plugins).
- `networkScan.time.justNow` / `minutesAgo` etc. : utilisés dans **NetworkScanWidget** et **NetworkScanPage** pour les dates/heures de scan.  
  → Contexte différent (carte « État des plugins » vs widget/page Scanner), pas de fusion à faire.

### Symétrie FR / EN

Les structures de `dashboard` en FR et EN sont identiques (mêmes clés, mêmes chemins). Aucune clé manquante d’un côté ou de l’autre.

### Clés mortes

**Aucune.** Toutes les clés présentes dans `dashboard.json` sont référencées dans le code (App, UnifiedDashboardPage, MultiSourceWidget, PluginSummaryCard, BandwidthHistoryWidget).

## Conclusion

Aucune correction nécessaire : pas de clé manquante, pas de doublon, pas de clé morte. Les fichiers dashboard FR/EN sont cohérents avec l’usage actuel du dashboard.
