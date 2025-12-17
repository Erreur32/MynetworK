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

## 🔒 Fonctionnalités de sécurité à implémenter

### Priorité HAUTE

- **🚦 Rate Limiting (Limitation de débit)**
  - Installer et configurer `express-rate-limit`
  - Implémenter des limites différentes par endpoint :
    - Login : 5 tentatives / 15 minutes (déjà protégé par brute force)
    - Endpoints de polling (stats, system) : 300+ requêtes / minute (pour éviter de bloquer les requêtes légitimes)
    - API générale : 150 requêtes / minute
    - Authentification : 20 requêtes / minute
  - Exclusion des utilisateurs authentifiés ou IPs internes (limites plus élevées)
  - Configuration ajustable depuis l'UI (onglet Sécurité)
  - Mode désactivable pour le développement
  - Stockage en mémoire (simple) ou Redis (production)
  - ⚠️ Important : Configurer des limites élevées pour ne pas bloquer les requêtes légitimes (polling toutes les 30s)

- **🔑 Politique de mot de passe avancée**
  - Longueur minimale configurable (8-16 caractères)
  - Exiger majuscules, minuscules, chiffres, caractères spéciaux
 

- **✅ Configuration de la durée de session via UI (TERMINÉ)**
  - ✅ Permettre de modifier `JWT_EXPIRES_IN` depuis l'interface
  - ✅ Stocker la configuration en base de données (table `app_config`)
  - ✅ Appliquer aux nouveaux tokens uniquement (les tokens existants conservent leur expiration)
  - ✅ Avertissement dans l'UI lors du changement
  - ✅ Validation du format (1-168 heures)
  - ✅ Conversion automatique en format JWT (jours si multiple de 24, sinon heures)

### Priorité MOYENNE

- **🔐 Exiger HTTPS (Middleware)**
  - Créer middleware `requireHttps.ts`
  - Vérifier `req.protocol === 'https'` ou header `X-Forwarded-Proto`
  - Rediriger ou retourner erreur si HTTP
  - Optionnel : généralement géré par nginx/reverse proxy

- **📧 Notifications de sécurité avancées**
  - Configuration email (SMTP) pour notifications critiques
  - Webhooks pour intégrations externes
  - Notifications in-app pour les admins
  - Préférences de notification par utilisateur

- **🔄 Rotation des tokens JWT**
  - Invalider tous les tokens existants (déconnexion forcée)
  - Régénérer le secret JWT via UI (nécessite re-login de tous les utilisateurs)
  - Rotation automatique périodique (optionnel, avancé)
  - Table `invalidated_tokens` ou compteur de version

### Priorité BASSE / OPTIONNEL

- **🌐 Liste blanche d'IP (Whitelist)**
  - Middleware `ipWhitelist.ts`
  - Restreindre l'accès à certaines IPs uniquement
  - Configuration en DB ou fichier de config
  - Utile pour les déploiements internes/privés

- **🔐 Authentification à deux facteurs (2FA)**
  - TOTP (Time-based One-Time Password) via app (Google Authenticator, Authy)
  - QR code pour l'activation
  - Codes de récupération
  - Activation/désactivation par utilisateur
  - Package `speakeasy` ou `otplib`
  - UI complexe à développer

- **📊 Dashboard de sécurité avancé**
  - Visualisation graphique des tentatives échouées
  - Carte des IPs bloquées
  - Alertes sur activités suspectes
  - Statistiques en temps réel
  - Export des rapports d'audit (déjà partiellement implémenté)


