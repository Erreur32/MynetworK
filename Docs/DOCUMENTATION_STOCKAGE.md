# Documentation - Stockage des Données MyscanR

## 📊 Où sont stockées les données ?

### 1. **Statistiques (Stats)**

**Réponse : Les stats ne sont PAS stockées en base de données.**

- Les statistiques sont récupérées **en temps réel** via les méthodes `getStats()` des plugins
- Elles sont calculées à la demande et retournées directement via l'API
- Aucune table de stats n'existe dans la base de données
- Les stats sont temporaires et ne persistent pas entre les redémarrages

**Exemples de stats :**
- Stats système (CPU, RAM, Disque, Réseau) : récupérées depuis le système d'exploitation
- Stats Freebox : récupérées via l'API Freebox en temps réel
- Stats UniFi : récupérées via l'API UniFi Controller/Site Manager en temps réel

**Avantages :**
- Données toujours à jour
- Pas de stockage inutile
- Pas de synchronisation nécessaire

**Inconvénients :**
- Pas d'historique des stats
- Nécessite une connexion active aux APIs externes

---

### 2. **Configurations des Plugins**

**Réponse : Les configurations sont stockées dans la base de données SQLite.**

**Emplacement :**
- **Fichier de base de données :** `data/dashboard.db`
- **Table :** `plugin_configs`
- **Structure :**
  ```sql
  CREATE TABLE plugin_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      settings TEXT NOT NULL DEFAULT '{}',  -- JSON string
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(plugin_id)
  )
  ```

**Exemples de configurations stockées :**
- **Freebox :** Token d'authentification (dans un fichier séparé `.freebox_token`)
- **UniFi :** URL, username, password, site, apiMode, apiKey
- **Scan Réseau :** (à venir)

**Accès :**
- Via l'API : `GET /api/plugins/:id` retourne la configuration
- Via la base de données : directement dans `plugin_configs.settings` (format JSON)

---

### 3. **Configuration de l'Application**

**Réponse : Actuellement, tout est en base de données. Pas de fichier `.conf` externe.**

**Stockage actuel :**
- **Utilisateurs :** Table `users` dans `data/dashboard.db`
- **Configurations plugins :** Table `plugin_configs` dans `data/dashboard.db`
- **Logs :** Table `logs` dans `data/dashboard.db`
- **Permissions :** Table `user_plugin_permissions` dans `data/dashboard.db`

**Emplacement du fichier de base de données :**
- **Variable d'environnement :** `DATABASE_PATH` (optionnel)
- **Par défaut :** `data/dashboard.db` (dans le répertoire du projet)
- **Dans Docker :** Monté dans le volume `mynetwork_data` → `/app/data/dashboard.db`

---

### 4. **Fichier `.conf` Externe avec Docker**

**Réponse : Actuellement NON, mais c'est possible à implémenter.**

**Situation actuelle :**
- Toutes les configurations sont dans la base de données SQLite
- Pas de fichier `.conf` externe
- Le volume Docker monte uniquement `data/` pour la persistance

**Pour rendre la config accessible en fichier `.conf` externe :**

1. **Option 1 : Exporter depuis la base de données**
   - Créer un endpoint API : `GET /api/config/export`
   - Générer un fichier `.conf` depuis les données de la base
   - Permettre le montage du fichier dans Docker

2. **Option 2 : Fichier de configuration principal**
- Créer un fichier `config.conf` ou `mynetwork.conf`
   - Lire ce fichier au démarrage
   - Synchroniser avec la base de données
   - Monter ce fichier dans Docker : `./config/mynetwork.conf:/app/config/mynetwork.conf`

3. **Option 3 : Variables d'environnement**
   - Utiliser des variables d'environnement dans `docker-compose.yml`
   - Plus simple mais moins flexible

**Exemple de structure Docker pour fichier `.conf` :**
```yaml
volumes:
  - ./config/mynetwork.conf:/app/config/mynetwork.conf:ro  # Lecture seule
  - mynetwork_data:/app/data  # Base de données
```

---

## 📁 Structure des Fichiers

```
MyscanR/
├── data/
│   ├── dashboard.db          # Base de données SQLite (toutes les configs)
│   └── .freebox_token        # Token Freebox (fichier séparé)
├── config/                    # (À créer si besoin)
│   └── mynetwork.conf          # Fichier de config externe (optionnel)
└── ...
```

**Dans Docker :**
```
/app/
├── data/
│   ├── dashboard.db          # Volume persistant
│   └── .freebox_token        # Volume persistant
└── config/                   # (Si monté)
    └── mynetwork.conf          # Volume monté depuis l'hôte
```

---

## 🔧 Recommandations

### Pour avoir un fichier `.conf` externe :

1. **Créer un endpoint d'export/import**
   - `GET /api/config/export` → Génère `mynetwork.conf`
   - `POST /api/config/import` → Lit `mynetwork.conf` et met à jour la DB

2. **Créer un service de synchronisation**
   - Au démarrage : Lire `config/mynetwork.conf` si présent
   - Synchroniser avec la base de données
   - Permettre l'export manuel

3. **Format du fichier `.conf` proposé :**
   ```ini
   [app]
   timezone=Europe/Paris
   language=fr
   theme=dark

   [plugin.freebox]
   enabled=true

   [plugin.unifi]
   enabled=true
   url=https://192.168.1.206:8443
   username=admin
   site=default
   apiMode=controller

   [users]
   default_admin_username=admin
   default_admin_password=admin123
   ```

---

## 📝 Résumé

| Type de données | Stockage | Emplacement | Persistant |
|----------------|----------|-------------|------------|
| **Stats** | Mémoire (temps réel) | Non stocké | ❌ Non |
| **Config plugins** | Base de données | `data/dashboard.db` → `plugin_configs` | ✅ Oui |
| **Utilisateurs** | Base de données | `data/dashboard.db` → `users` | ✅ Oui |
| **Logs** | Base de données | `data/dashboard.db` → `logs` | ✅ Oui |
| **Token Freebox** | Fichier | `data/.freebox_token` | ✅ Oui |
| **Config app** | Base de données | `data/dashboard.db` → `app_config` | ✅ Oui |
| **Config métriques** | Base de données | `data/dashboard.db` → `app_config` | ✅ Oui |
| **Fichier .conf** | ✅ Implémenté | `config/mynetwork.conf` | ✅ Oui (si monté) |

---

## 🐳 Docker - Volumes

**Volume actuel :**
```yaml
volumes:
  - mynetwork_data:/app/data
```

**Pour ajouter un fichier `.conf` externe :**
```yaml
volumes:
  - mynetwork_data:/app/data
  - ./config/mynetwork.conf:/app/config/mynetwork.conf:ro
```

**Accès depuis l'hôte :**
- Base de données : `docker volume inspect mynetwork_data` → Localiser le volume
- Fichier .conf : `./config/mynetwork.conf` (si monté)

---

**Note :** Un fichier `.conf` externe est maintenant implémenté ! Voir la section ci-dessous.

---

## ✅ Implémentation du Fichier `.conf` Externe

### Fonctionnalités Implémentées

1. **Export de configuration** : `GET /api/config/export`
   - Génère un fichier `.conf` au format INI depuis la base de données
   - Option `?write=true` pour écrire directement dans le fichier

2. **Import de configuration** : `POST /api/config/import`
   - Lit un fichier `.conf` et met à jour la base de données
   - Accepte le contenu directement dans le body ou un chemin de fichier

3. **Synchronisation automatique** : Au démarrage du serveur
   - Si le fichier `.conf` existe → Import dans la base de données
   - Si le fichier n'existe pas → Export de la configuration actuelle

4. **Montage Docker** : Support pour monter un fichier `.conf` externe
   - Décommentez la ligne dans `docker-compose.yml` :
     ```yaml
     - ./config/mynetwork.conf:/app/config/mynetwork.conf:ro
     ```

### Format du Fichier `.conf`

Format INI standard :
```ini
[app]
timezone=Europe/Paris
language=fr
theme=dark

[plugin.freebox]
enabled=true

[plugin.unifi]
enabled=true
url=https://192.168.1.206:8443
username=admin
password=your_password
site=default
apiMode=controller
```

### Emplacement du Fichier

- **Variable d'environnement :** `CONFIG_FILE_PATH` (optionnel)
- **Par défaut :** `config/mynetwork.conf` (dans le répertoire du projet)
- **Dans Docker :** `/app/config/mynetwork.conf`

### Exemple d'Utilisation

1. **Exporter la configuration actuelle :**
   ```bash
   curl -X GET "http://localhost:3003/api/config/export?write=true" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. **Importer depuis un fichier :**
   ```bash
   curl -X POST "http://localhost:3003/api/config/import" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "[app]\ntimezone=Europe/Paris\n..."}'
   ```

3. **Vérifier le statut du fichier :**
   ```bash
   curl -X GET "http://localhost:3003/api/config/file" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

### Synchronisation au Démarrage

Le serveur synchronise automatiquement la configuration au démarrage :
- Si `config/mynetwork.conf` existe → Import dans la DB
- Sinon → Export de la DB vers le fichier

**Note :** Les mots de passe et clés API sont masqués dans l'export pour des raisons de sécurité.

