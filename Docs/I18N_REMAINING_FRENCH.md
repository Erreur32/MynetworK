# French strings still to translate (i18n)

This document lists **remaining French text** in `src/` that should be replaced with `t('key')` for full internationalization. The keys already exist in `src/locales/en.json` and `fr.json` for most of these; for new strings, add the key to both locale files then use `t('namespace.key')` in the component.

## Done in this pass

- **App.tsx**: noDownloadMatching, noDownload, freebox titles (state, downloadRealtime, uploadRealtime, speedTest)
- **Header.tsx**: globalSearch, newVersionAvailable
- **PluginConfigModal.tsx**: connectionSuccess, connectionTestError, saveConfigError, saveError, connectionSettings, enableForDiscovery, apiKeyPlaceholder, configureViaSettings, saveAndTest, pleaseWaitTest, testInProgress, testButton, theme.saving, common.save, pluginConnected
- **ThemeSection.tsx**: theme.none, theme.delete, interfaceTheme, blockOpacity, successBadge, resetAnimationDefaults
- **UnifiedDashboardPage.tsx**: noPluginConfigured, configurePluginInSettings
- **NetworkSummary***: common.enabled, common.disabled
- **SystemServerWidget.tsx**: system.serverSystem, common.loading, system.download, system.upload

## Remaining by file

### SearchPage.tsx
- Error messages: `Erreur lors du ping`, `Connexion interrompue`, `Erreur`, `Erreur lors du rescan`, `Erreur lors de la recherche`, `Recherche annulée.`
- UI: `Recherche...`, `Rechercher`, `Recherches fréquentes :`, `Recherche en cours...`, `Aucun résultat trouvé pour "..."`, `La recherche fonctionne uniquement...`, `Aucun résultat ne correspond aux filtres`, `Aucun port ouvert`, `Non scanné`, `Connexion UniFi`, `Aucun DHCP réglé pour cette IP`
- Keys: search.*, common.notScanned, network.connectionUnifi

### NetworkScanPage.tsx
- Alerts: all `Erreur lors de...` messages, `Êtes-vous sûr de vouloir bannir l'IP...`
- UI: `Scan Réseau`, `Aucun scan effectué`, `Non chargée`, `Réseau:`, `Chargement...`, placeholder search, `Aucun résultat`, `Rechercher ... dans la page de recherche`
- Titles: `Choisir le type de rafraîchissement`, `Scan complet du réseau...`, `Dernière vue`
- Keys: networkScan.*, common.loading, search.searchInPage

### NetworkScanConfigModal.tsx
- All error messages (config.updateError, config.saveError, config.resetError, etc.)
- UI: `Configuration Scan Réseau`, `Paramètres des scans automatiques`, `Fermer`, `Chargement...`, `Réseau local standard`, `Aide réseau`
- Keys: config.*, common.close, common.loading, network.localStandard, networkScan.networkHelp

### UniFiPage.tsx (many strings)
- Cards: `Plugin UniFi non disponible`, `Plugin UniFi non connecté`, `Non configuré`, `Connexion`, `Alertes Réseau`, `Trafic Réseau (UniFi)`, `Analyse des Stats Réseau`, `Analyse des Stats Système`, `Règles NAT`, `Événements UniFi`
- Empty states: `Aucune alerte active détectée.`, `Aucun site détecté`, `Aucun point d'accès détecté`, `Aucune donnée disponible`, `Aucun switch détecté`, `Aucun client détecté`, `Aucun client avec débit mesurable...`, `Aucun trafic client mesurable...`, `Aucune donnée de trafic disponible`, `Aucun événement n'a été détecté...`, `Aucune règle NAT configurée`, etc.
- Labels: `Connexion:`, `Oui`/`Non`, `Mise à jour disponible`, `Mises à jour disponibles`, placeholder `Rechercher par nom, IP...`
- Keys: unifi.* (all already in locales)

### SettingsPage.tsx, ExporterSection.tsx, SecuritySection.tsx
- Many section titles and labels in French (e.g. `Rétention des données de scan`, `Configuration réseau`, `Sécurité réseau`, `Contrôle parental`, etc.). Add keys under `settings.*` or a new namespace and replace.

### Other components
- **MultiSourceWidget.tsx**: `État des plugins` → e.g. `plugins.state` or `dashboard.pluginStatus`
- **PluginSummaryCard.tsx**: `Descendant en temps réel`, `Montant en temps réel` → freebox.downloadRealtime, freebox.uploadRealtime
- **UserMenu.tsx**: comment `Utilisateurs (Admin only)` → can stay as code comment in English
- **Modals** (LoginModal, WifiSettingsModal, CreateVmModal, etc.): any remaining French labels and messages

## How to proceed

1. In each file, add `import { useTranslation } from 'react-i18next';` and `const { t } = useTranslation();`.
2. Replace each French string with `t('namespace.key')` using the keys in `en.json`/`fr.json`.
3. For any new phrase, add the key to both `src/locales/en.json` and `src/locales/fr.json`, then use `t('namespace.key')`.
