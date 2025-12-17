# 📦 Documentation Stockage – MynetworK

Ce document décrit comment et où sont stockées les données dans MynetworK.

---

## 🎯 Vue d'ensemble

MynetworK utilise deux types de stockage :
1. **Base de données SQLite** : Données applicatives (utilisateurs, plugins, logs, settings)
2. **Fichier de configuration** : Configuration externe optionnelle (`config/mynetwork.conf`)

---

## 💾 Base de Données SQLite

### Emplacement

#### Mode Développement (npm)

**Fichier** : `./data/dashboard.db` (dans le répertoire du projet)

**Variable d'environnement** (optionnel) :
```env
DATABASE_PATH=./data/dashboard.db
```

⚠️ **Ce fichier est UNIQUEMENT pour le développement local.**

#### Mode Production (Docker)

**Dans le conteneur** : `/app/data/dashboard.db`

**Volume Docker** : `mynetwork_data` (volume nommé, isolé)

**Configuration** (`docker-compose.yml`) :
```yaml
volumes:
  - mynetwork_data:/app/data  # Volume isolé
```

⚠️ **La base de données Docker est COMPLÈTEMENT SÉPARÉE de `./data/dashboard.db`**

---

## 📊 Structure de la Base de Données

### Table `users`

Stockage des utilisateurs et authentification :

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,  -- Hash bcrypt
    email TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Table `plugin_config`

Configuration des plugins :

```sql
CREATE TABLE IF NOT EXISTS plugin_config (
    id TEXT PRIMARY KEY,           -- Plugin ID (ex: 'freebox', 'unifi')
    enabled INTEGER DEFAULT 0,     -- 0 = disabled, 1 = enabled
    settings TEXT,                 -- JSON string
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Table `app_config`

Configuration de l'application (settings) :

```sql
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,           -- Clé unique (ex: 'metrics_config')
    value TEXT NOT NULL,             -- Valeur en JSON (string)
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

### Table `logs`

Logs applicatifs :

```sql
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,            -- 'info', 'warn', 'error'
    message TEXT NOT NULL,
    source TEXT,                     -- 'system', 'plugin:freebox', etc.
    metadata TEXT,                   -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

---

## ⚙️ Fichier de Configuration Externe

### Emplacement

**Fichier** : `config/mynetwork.conf` (optionnel)

**Format** : JSON ou propriétés (selon l'implémentation)

### Utilisation

Le fichier `.conf` est utilisé pour :
- Configuration des plugins (si non stockée en DB)
- Paramètres système
- Override de variables d'environnement

⚠️ **Le fichier `.conf` est ignoré par Git** (voir `.gitignore`)

### Exemple

```json
{
  "plugins": {
    "freebox": {
      "host": "mafreebox.freebox.fr",
      "appId": "fr.freebox.mynetwork"
    }
  },
  "system": {
    "port": 3003,
    "logLevel": "info"
  }
}
```

---

## 🔒 Sécurité et Git

### Fichiers Ignorés par Git

Les fichiers suivants sont dans `.gitignore` et ne seront **jamais** commités :

- `data/dashboard.db` : Base de données (données sensibles)
- `config/mynetwork.conf` : Configuration (tokens, secrets)
- `.env.local` : Variables d'environnement locales
- `.freebox_token*` : Tokens Freebox

### Pourquoi ?

- ❌ Contient des données sensibles (mots de passe hashés, tokens, configs)
- ❌ Spécifique à chaque environnement (dev, prod, chaque développeur)
- ❌ Peut être volumineux
- ✅ Chaque développeur a sa propre base de données locale
- ✅ En production Docker, la base est dans un volume isolé

---

## 🔄 Synchronisation

### Pas de Synchronisation Automatique

Les settings de l'app dans `app_config` :
- ✅ Sont sauvegardées directement dans la base de données
- ❌ Ne sont **PAS** exportées vers le fichier `.conf`
- ❌ Ne sont **PAS** synchronisées avec un fichier externe

### Export Manuel (si nécessaire)

Pour exporter les settings :

1. **Via SQLite** :
   ```bash
   sqlite3 data/dashboard.db "SELECT key, value FROM app_config" > app_settings_backup.txt
   ```

2. **Via l'API** :
   ```bash
   curl http://localhost:3003/api/metrics/config > metrics_config_backup.json
   ```

---

## 🚫 Pas d'Interférence entre Dev et Prod

### Mode Dev (npm run dev:server)

**Base de données** : `./data/dashboard.db` (fichier local)
- ✅ Votre propre base de données locale
- ✅ Uniquement pour le développement
- ✅ Ne partage PAS avec Docker/production
- ✅ Ne sera PAS dans Git (ignoré)

### Mode Production (Docker)

**Base de données** : Volume Docker `mynetwork_data` (isolé)
- ✅ Base de données complètement séparée
- ✅ Volume Docker isolé du système de fichiers local
- ✅ Aucune interférence avec votre dev local
- ✅ Pas dans le répertoire du projet (géré par Docker)

### Résumé

| Mode | Emplacement | Type | Isolation |
|------|-------------|------|-----------|
| **Dev (npm)** | `./data/dashboard.db` | Fichier local | ✅ Séparé |
| **Prod (Docker)** | Volume `mynetwork_data` | Volume Docker | ✅ Séparé |

---

## 🛠️ Commandes Utiles

### Voir toutes les settings

```bash
sqlite3 data/dashboard.db "SELECT * FROM app_config;"
```

### Voir une setting spécifique

```bash
sqlite3 data/dashboard.db "SELECT value FROM app_config WHERE key = 'metrics_config';"
```

### Sauvegarder la base de données

```bash
cp data/dashboard.db data/dashboard.db.backup
```

### Localiser le volume Docker (prod)

```bash
docker volume inspect mynetwork_data
```

---

## 📍 Résumé

| Question | Réponse |
|----------|---------|
| **Où sont stockées les settings ?** | Base de données SQLite |
| **Fichier exact ?** | `./data/dashboard.db` (dev) ou volume Docker (prod) |
| **Table ?** | `app_config` |
| **Format ?** | Clé-valeur (JSON pour les valeurs) |
| **Fichier `.conf` ?** | ❌ Non, uniquement pour les plugins (optionnel) |
| **Synchronisation ?** | ❌ Non, stockage direct en DB |
| **Dans Git ?** | ❌ **NON, ignoré par `.gitignore`** |
| **Interfère avec prod ?** | ❌ **NON, Docker utilise un volume isolé** |
| **Partagé entre devs ?** | ❌ **NON, chaque dev a sa propre base** |

---

**Dernière mise à jour** : 2025-01-17

