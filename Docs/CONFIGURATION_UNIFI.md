# Configuration UniFi Controller pour MynetworK

Ce guide vous explique comment configurer le plugin UniFi dans MynetworK pour accéder à votre contrôleur UniFi local.

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Création d'un utilisateur local UniFi (IMPORTANT)](#création-dun-utilisateur-local-unifi-important)
3. [Configuration du plugin dans MynetworK](#configuration-du-plugin-dans-mynetwork)
4. [Test de connexion](#test-de-connexion)
5. [Dépannage](#dépannage)

---

## Prérequis

Avant de commencer, assurez-vous d'avoir :

- ✅ Un contrôleur UniFi accessible sur votre réseau local
- ✅ Les droits administrateur sur le contrôleur UniFi
- ✅ L'URL complète du contrôleur (ex: `https://192.168.1.100:8443`)
- ✅ Le nom du site UniFi (généralement `default`)

---

## Création d'un utilisateur local UniFi (IMPORTANT)

### ⚠️ Pourquoi utiliser un utilisateur local ?

**Il est fortement recommandé d'utiliser un compte utilisateur LOCAL plutôt qu'un compte cloud UniFi** pour les raisons suivantes :

- ✅ **Pas de 2FA (Authentification à deux facteurs)** : Les comptes cloud peuvent nécessiter une authentification à deux facteurs qui bloque l'accès API
- ✅ **Plus fiable** : Les comptes locaux fonctionnent directement avec l'API du contrôleur sans dépendre des services cloud
- ✅ **Meilleure sécurité** : Vous gardez le contrôle total sur les identifiants sans dépendre d'un service externe
- ✅ **Compatibilité** : L'API locale est plus stable et mieux documentée

### 📝 Étapes pour créer un utilisateur local

1. **Accédez à votre contrôleur UniFi**
   - Ouvrez votre navigateur et connectez-vous à l'interface web du contrôleur
   - URL typique : `https://192.168.1.XXX:8443` ou `https://unifi.example.com:8443`

2. **Accédez aux paramètres d'administration**
   - Cliquez sur l'icône **Paramètres** (⚙️) en bas à gauche
   - Dans le menu de gauche, sélectionnez **Administration**

3. **Créez un nouvel utilisateur**
   - Cliquez sur l'onglet **Administrateurs** (ou **Users** selon la version)
   - Cliquez sur le bouton **+ Ajouter un administrateur** (ou **+ Add Administrator**)

4. **Configurez l'utilisateur**
   - **Nom d'utilisateur** : Choisissez un nom simple (ex: `mynetwork`, `api-user`, `dashboard`)
   - **Email** : Optionnel, mais recommandé pour les notifications
   - **Mot de passe** : Créez un mot de passe fort et sécurisé
   - **Rôle** : Sélectionnez **Administrateur complet** (ou **Super Admin** selon la version)
   - **Type de compte** : ⚠️ **IMPORTANT** : Assurez-vous que le type est **Local** (pas **Cloud** ou **SSO**)
   - **Authentification à deux facteurs** : Désactivez-la pour cet utilisateur (ou configurez-la si nécessaire)

5. **Vérifiez les permissions**
   - Assurez-vous que l'utilisateur a les permissions suivantes :
     - ✅ Lecture des appareils (devices)
     - ✅ Lecture des clients
     - ✅ Lecture des réseaux Wi‑Fi (WLANS)
     - ✅ Lecture des statistiques
   - Avec le rôle **Administrateur complet**, toutes ces permissions sont généralement incluses

6. **Sauvegardez et testez**
   - Cliquez sur **Ajouter** (ou **Save**)
   - Testez la connexion avec ces identifiants depuis l'interface web du contrôleur pour vérifier qu'ils fonctionnent

### 🔒 Bonnes pratiques de sécurité

- Utilisez un mot de passe fort et unique pour cet utilisateur
- Ne partagez pas ces identifiants avec d'autres applications
- Révoquez cet utilisateur si vous ne l'utilisez plus
- Considérez créer un utilisateur dédié uniquement pour MynetworK (principe du moindre privilège)

---

## Configuration du plugin dans MynetworK

### 1. Accéder à la configuration

1. Connectez-vous à MynetworK
2. Cliquez sur l'icône **Paramètres** (⚙️) dans le header
3. Dans le menu de gauche, sélectionnez **Administration**
4. Cliquez sur l'onglet **Plugins**
5. Trouvez la carte **UniFi Controller** dans la liste
6. Cliquez sur l'icône **Paramètres** (⚙️) sur la carte UniFi

### 2. Remplir le formulaire de configuration

Le modal de configuration s'ouvre. Remplissez les champs suivants :

#### Mode de connexion

Sélectionnez **Controller Local (URL/User/Pass)** pour utiliser un contrôleur local.

> 💡 **Note** : Le mode **Site Manager API** est disponible pour les utilisateurs de UniFi Cloud, mais nécessite une clé API. Ce guide se concentre sur le mode Controller Local.

#### URL du Contrôleur UniFi

- **Format** : `https://IP_OU_DOMAINE:PORT`
- **Exemples** :
  - `https://192.168.1.100:8443`
  - `https://unifi.example.com:8443`
  - `https://192.168.1.50:8443`

⚠️ **Important** :
- Incluez toujours le protocole (`https://`)
- Incluez toujours le port (généralement `8443` pour HTTPS)
- Utilisez l'adresse IP ou le nom de domaine complet du contrôleur

#### Nom d'utilisateur

- Entrez le nom d'utilisateur de l'utilisateur local créé précédemment
- Exemple : `mynetwork`, `api-user`, `admin`

#### Mot de passe

- Entrez le mot de passe de l'utilisateur local
- Vous pouvez cliquer sur l'icône 👁️ pour afficher/masquer le mot de passe

#### Site UniFi

- **Valeur par défaut** : `default`
- Si vous avez plusieurs sites configurés dans votre contrôleur, entrez le nom exact du site
- Pour trouver le nom de votre site :
  1. Connectez-vous à l'interface web du contrôleur
  2. Le nom du site s'affiche généralement en haut à gauche de l'interface
  3. Ou allez dans **Paramètres** → **Sites** pour voir la liste des sites

### 3. Tester la connexion

Avant de sauvegarder, **testez toujours la connexion** :

1. Cliquez sur le bouton **Tester la connexion** (icône 🔄)
2. Attendez quelques secondes
3. Si le test réussit :
   - ✅ Un message vert "Test de connexion réussi" s'affiche
   - Vous pouvez maintenant sauvegarder la configuration
4. Si le test échoue :
   - ❌ Un message rouge avec les détails de l'erreur s'affiche
   - Consultez la section [Dépannage](#dépannage) ci-dessous

### 4. Sauvegarder la configuration

1. Si le test de connexion a réussi, cliquez sur **Sauvegarder**
2. Le modal se ferme automatiquement
3. La carte UniFi dans la liste des plugins devrait maintenant afficher **Connecté** (badge vert)
4. Vous pouvez maintenant activer le plugin en basculant le switch **Actif**

---

## Test de connexion

### Vérifier le statut de connexion

Après avoir configuré le plugin, vous pouvez vérifier le statut de connexion :

1. **Dans la liste des plugins** :
   - Badge vert **Connecté** : Le plugin est correctement configuré et connecté
   - Badge jaune **Non connecté** : Le plugin est activé mais la connexion a échoué
   - Badge gris **Désactivé** : Le plugin n'est pas activé

2. **Sur la page UniFi** :
   - Si le plugin est connecté, vous pouvez accéder à la page UniFi depuis le dashboard
   - Les données des appareils, clients et réseaux Wi‑Fi devraient s'afficher

### Tester manuellement la connexion

Vous pouvez retester la connexion à tout moment :

1. Allez dans **Paramètres** → **Administration** → **Plugins**
2. Cliquez sur l'icône **🔄 Tester** sur la carte UniFi
3. Le statut de connexion sera mis à jour

---

## Dépannage

### ❌ Erreur : "Login failed" ou "Connexion échouée"

**Causes possibles :**

1. **Identifiants incorrects**
   - ✅ Vérifiez le nom d'utilisateur et le mot de passe
   - ✅ Testez la connexion depuis l'interface web du contrôleur avec les mêmes identifiants

2. **Utilisateur cloud au lieu de local**
   - ✅ Vérifiez que l'utilisateur est bien de type **Local** dans les paramètres du contrôleur
   - ✅ Créez un nouvel utilisateur local si nécessaire

3. **2FA activée**
   - ✅ Désactivez l'authentification à deux facteurs pour cet utilisateur
   - ✅ Ou créez un nouvel utilisateur sans 2FA

4. **URL incorrecte**
   - ✅ Vérifiez que l'URL inclut `https://` et le port `:8443`
   - ✅ Testez l'URL dans votre navigateur pour vérifier qu'elle est accessible

### ❌ Erreur : "Network error" ou "Impossible de contacter le serveur"

**Causes possibles :**

1. **Contrôleur inaccessible**
   - ✅ Vérifiez que le contrôleur est démarré et accessible
   - ✅ Testez l'URL dans votre navigateur
   - ✅ Vérifiez les règles de pare-feu si MynetworK est dans Docker

2. **Problème de réseau**
   - ✅ Si MynetworK est dans Docker, vérifiez que le conteneur peut accéder au réseau local
   - ✅ Vérifiez que le contrôleur et MynetworK sont sur le même réseau

3. **Certificat SSL auto-signé**
   - ✅ Si vous utilisez un certificat auto-signé, cela peut causer des problèmes
   - ✅ Considérez utiliser un certificat valide ou configurer le contrôleur pour accepter les certificats auto-signés

### ❌ Erreur : "Site not found" ou "Site invalide"

**Causes possibles :**

1. **Nom de site incorrect**
   - ✅ Vérifiez le nom exact du site dans l'interface web du contrôleur
   - ✅ Le nom est sensible à la casse (majuscules/minuscules)
   - ✅ Par défaut, utilisez `default` si vous n'êtes pas sûr

2. **Site supprimé**
   - ✅ Vérifiez que le site existe toujours dans le contrôleur
   - ✅ Créez un nouveau site si nécessaire

### ❌ Erreur : "Permission denied" ou "Accès refusé"

**Causes possibles :**

1. **Permissions insuffisantes**
   - ✅ Vérifiez que l'utilisateur a le rôle **Administrateur complet**
   - ✅ Vérifiez les permissions dans les paramètres du contrôleur

2. **Utilisateur restreint**
   - ✅ Si vous utilisez un utilisateur avec des permissions limitées, certaines fonctionnalités peuvent ne pas fonctionner
   - ✅ Créez un utilisateur avec des permissions complètes

### ❌ Le plugin affiche "Non connecté" même après configuration

**Solutions :**

1. **Vérifiez les logs**
   - Consultez les logs du serveur MynetworK pour voir les erreurs détaillées
   - Les logs peuvent indiquer la cause exacte du problème

2. **Réessayez la connexion**
   - Cliquez sur **Tester la connexion** à nouveau
   - Parfois, un simple retest résout les problèmes temporaires

3. **Vérifiez la configuration**
   - Ouvrez à nouveau le modal de configuration
   - Vérifiez que tous les champs sont correctement remplis
   - Sauvegardez à nouveau la configuration

4. **Redémarrez le plugin**
   - Désactivez le plugin (switch **Actif**)
   - Attendez quelques secondes
   - Réactivez le plugin

### 🔍 Vérifications supplémentaires

Si les problèmes persistent, vérifiez :

- ✅ **Version du contrôleur UniFi** : Certaines versions peuvent avoir des problèmes de compatibilité
- ✅ **Version de MynetworK** : Assurez-vous d'utiliser une version récente
- ✅ **Logs du contrôleur** : Consultez les logs du contrôleur UniFi pour voir s'il y a des erreurs côté serveur
- ✅ **Connectivité réseau** : Utilisez `ping` ou `curl` pour tester la connectivité entre MynetworK et le contrôleur

---

## 📚 Ressources supplémentaires

### Documentation officielle UniFi

- [UniFi Controller API Documentation](https://help.ui.com/hc/en-us/articles/30076656117655-Getting-Started-with-the-Official-UniFi-API)
- [UniFi Network Application](https://help.ui.com/hc/en-us/categories/360000024273-UniFi-Network-Application)

### Support

Si vous rencontrez toujours des problèmes après avoir suivi ce guide :

1. Consultez les logs du serveur MynetworK
2. Vérifiez la documentation du projet sur GitHub
3. Créez une issue sur le dépôt GitHub avec les détails de votre problème

---

## ✅ Checklist de configuration

Avant de considérer la configuration terminée, vérifiez :

- [ ] Un utilisateur local a été créé dans le contrôleur UniFi
- [ ] L'utilisateur a le rôle Administrateur complet
- [ ] L'utilisateur est de type Local (pas Cloud)
- [ ] La 2FA est désactivée pour cet utilisateur (ou configurée correctement)
- [ ] L'URL du contrôleur est correcte (avec `https://` et le port)
- [ ] Le nom d'utilisateur et le mot de passe sont corrects
- [ ] Le nom du site est correct (ou `default`)
- [ ] Le test de connexion réussit
- [ ] La configuration est sauvegardée
- [ ] Le plugin est activé
- [ ] Le statut affiche "Connecté"
- [ ] Les données UniFi s'affichent sur la page UniFi

---

**Dernière mise à jour** : Version 0.1.12

