# Commit Message - Version 0.2.0

## 🎉 Release 0.2.0 - Plugin Scanner & Améliorations Vendors

### ✨ Nouvelles Fonctionnalités

**Base Vendors Wireshark Complète**
- Intégration complète de la base de données Wireshark `manuf` pour la détection des vendors
- Téléchargement automatique depuis GitHub/GitLab avec fallback vers GitLab
- Sauvegarde locale du fichier `manuf.txt` pour utilisation hors ligne
- Fallback vers les plugins actifs (Freebox/UniFi) si le téléchargement échoue
- Base de vendors par défaut avec ~80 fabricants courants en dernier recours
- Validation robuste du fichier téléchargé (taille, contenu, détection HTML)
- Messages améliorés indiquant la source (téléchargé vs chargé depuis local)
- Option de mise à jour automatique désactivée par défaut
- Bouton "Mettre à jour maintenant" pour forcer une mise à jour manuelle

**Système de Priorité pour Vendors**
- Configuration de la priorité des sources de vendors (Freebox, UniFi, Scanner)
- Interface avec drag & drop pour réorganiser l'ordre
- Détection toujours tentée si une adresse MAC est disponible
- Écrasement automatique des vendors vides indépendamment du paramètre "écraser existants"
- Logs détaillés pour chaque étape de détection

**Améliorations UI/UX**
- Modal de configuration refactorisé : layout simplifié
- Bouton unique "Enregistrer toutes les modifications"
- Système d'avertissement des modifications non sauvegardées
- Suppression du badge "Scanner" (par défaut si pas de badge = scanner)
- Suppression de la double confirmation pour la mise à jour des vendors

**Console Browser - Logs Améliorés**
- Affichage stylisé au démarrage (nom, version, fichier principal)
- Affichage unique des plugins chargés avec badges colorés
- Prévention des logs répétés lors de la navigation

### 🔧 Améliorations

**Détection Vendors**
- Utilisation de la MAC existante si `getMacAddress()` retourne `null`
- Détection toujours tentée pour toutes les IPs avec MAC disponible
- Unification de la logique entre `scanNetwork()` et `refreshExistingIps()`
- Logs améliorés : logs `[VENDOR]` en DEBUG, logs principaux en INFO

**Performance Frontend**
- Optimisations React : `useMemo` et `useCallback`
- Debounce de 300ms sur la barre de recherche
- Polling optimisé : intervalles réduits pendant les scans actifs
- Réduction des violations de performance dans la console

**Base Vendors Wireshark**
- `updateDatabase()` retourne la source et le nombre de vendors
- Validation améliorée : taille, HTML, entrées OUI
- Parsing amélioré : support des délimiteurs multiples
- `loadDefaultVendors()` : méthode pour charger ~80 vendors courants
- `getVendorsFromPlugins()` : méthode pour collecter depuis Freebox/UniFi
- `initialize()` : logique renforcée pour garantir que la base n'est jamais vide

### 🐛 Corrections

**Détection Vendors**
- Correction de la logique qui empêchait la détection si MAC existait sans vendor
- Correction de l'écrasement des vendors vides
- Correction du compteur `vendorsFound` dans `refreshExistingIps()`
- Correction de l'initialisation : vérification de la base Wireshark au début de chaque scan

**Interface Utilisateur**
- Correction de l'erreur JSX : balise `</div>` manquante
- Correction de l'ordre des routes API pour éviter les 404
- Correction de l'erreur `require is not defined` (remplacement par `import()` dynamique)
- Correction de l'erreur `Cannot access 'fetchHistory' before initialization`

**Performance**
- Réduction des violations de performance dans la console browser
- Optimisation du polling pour éviter les appels simultanés
- Réduction des re-renders inutiles

### 📝 Fichiers Modifiés

**Backend**
- `server/services/wiresharkVendorService.ts` - Service complet pour la base vendors Wireshark
- `server/services/networkScanService.ts` - Amélioration de la détection des vendors
- `server/routes/network-scan.ts` - Routes API améliorées avec retour de la source
- `server/database/dbConfig.ts` - Correction `require` → `import()` dynamique

**Frontend**
- `src/components/modals/NetworkScanConfigModal.tsx` - Refactoring complet du modal
- `src/pages/NetworkScanPage.tsx` - Optimisations performance et détection vendors
- `src/pages/SettingsPage.tsx` - Messages améliorés pour la mise à jour vendors
- `src/main.tsx` - Logs stylisés au démarrage
- `src/stores/pluginStore.ts` - Logs uniques des plugins au démarrage

### 🔄 Migration

Aucune migration nécessaire. La base vendors Wireshark sera automatiquement initialisée au premier démarrage ou lors de la première mise à jour.

### 📚 Documentation

- `CHANGELOG.md` - Ajout de la version 0.2.0
- `README.md` - Mise à jour de la version à 0.2.0

---

**Version:** 0.2.0  
**Date:** 2025-12-23  
**Type:** Feature Release

