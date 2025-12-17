## Tâches futures (techniques)

- **✅ Mettre à jour Node.js vers une version LTS (TERMINÉ)**  
  - ~~Actuellement : Node.js v21.7.3 (version impaire, non-LTS)~~  
  - ✅ **Résolu** : Node.js v22.21.1 installé via nvm  
  - ✅ nvm v0.40.3 installé et configuré dans `.bashrc`  
  - ✅ Fichier `.nvmrc` créé avec `22`  
  - ✅ `nvm use` fonctionne automatiquement dans le répertoire MynetworK  
  - ✅ **Vérifié** : Plus de warnings `EBADENGINE` avec Node.js v22.21.1  
  - ✅ **Packages dépréciés** : Warnings acceptés (dépendances transitives uniquement, pas de vulnérabilités)  
    - Pas d'overrides forcés (pour éviter les erreurs ETARGET)  
    - Suivre les mises à jour des dépendances dans une future passe de maintenance

- **Optimiser le bundle frontend avec du code splitting (lazy loading React)**  
  - Identifier les pages les plus lourdes dans `src/pages` (ex: `AnalyticsPage`, `VmsPage`, `UnifiedDashboardPage`).  
  - Remplacer les imports directs par `React.lazy()` + `Suspense` pour charger ces pages à la demande.  
  - Vérifier l'impact sur le temps de chargement initial et sur les warnings Vite concernant la taille des chunks (> 500 kB).  
  - Adapter au besoin la configuration `vite.config.ts` (chunking manuel) si certains bundles restent trop volumineux.


