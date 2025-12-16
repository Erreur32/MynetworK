## Tâches futures (techniques)

- **Optimiser le bundle frontend avec du code splitting (lazy loading React)**  
  - Identifier les pages les plus lourdes dans `src/pages` (ex: `AnalyticsPage`, `VmsPage`, `UnifiedDashboardPage`).  
  - Remplacer les imports directs par `React.lazy()` + `Suspense` pour charger ces pages à la demande.  
  - Vérifier l'impact sur le temps de chargement initial et sur les warnings Vite concernant la taille des chunks (> 500 kB).  
  - Adapter au besoin la configuration `vite.config.ts` (chunking manuel) si certains bundles restent trop volumineux.


