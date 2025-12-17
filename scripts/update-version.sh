#!/bin/bash

# Script pour mettre à jour la version dans tous les fichiers du projet
# Usage: ./scripts/update-version.sh 0.0.4

set -e

# Vérifier qu'un argument version est fourni
if [ -z "$1" ]; then
    echo "❌ Erreur: Veuillez fournir une version (ex: 0.0.4)"
    echo "Usage: $0 <version>"
    exit 1
fi

NEW_VERSION="$1"
OLD_VERSION=$(grep -oP '"version":\s*"\K[^"]+' package.json)

if [ -z "$OLD_VERSION" ]; then
    echo "❌ Erreur: Impossible de trouver la version actuelle dans package.json"
    exit 1
fi

echo "🔄 Mise à jour de la version de $OLD_VERSION vers $NEW_VERSION..."

# 1. package.json
echo "  📝 Mise à jour de package.json..."
sed -i "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# 2. src/constants/version.ts (fichier de constantes centralisé)
echo "  📝 Mise à jour de src/constants/version.ts..."
sed -i "s/export const APP_VERSION = '$OLD_VERSION';/export const APP_VERSION = '$NEW_VERSION';/" src/constants/version.ts

# 3. README.md (badge)
echo "  📝 Mise à jour de README.md..."
sed -i "s/MynetworK-$OLD_VERSION/MynetworK-$NEW_VERSION/g" README.md

# 4. CHANGELOG.md (ajout de la nouvelle entrée en haut)
echo "  📝 Mise à jour de CHANGELOG.md..."
# Obtenir la date actuelle au format YYYY-MM-DD
CURRENT_DATE=$(date +%Y-%m-%d)

# Créer un fichier temporaire avec la nouvelle entrée
TEMP_CHANGELOG=$(mktemp)
cat > "$TEMP_CHANGELOG" << EOF
## [$NEW_VERSION] - $CURRENT_DATE

### 🐛 Corrigé

### 🔧 Modifié

### 📝 Documentation

---

EOF

# Créer un fichier temporaire pour le nouveau CHANGELOG
TEMP_OUTPUT=$(mktemp)

# Trouver la ligne où insérer (première ligne commençant par "## [")
FIRST_VERSION_LINE=$(grep -n "^## \[" CHANGELOG.md | head -n 1 | cut -d: -f1)

if [ -n "$FIRST_VERSION_LINE" ]; then
  # Insérer la nouvelle entrée avant la première ligne de version
  # Lire les lignes avant, insérer le nouveau contenu, puis le reste
  head -n $((FIRST_VERSION_LINE - 1)) CHANGELOG.md > "$TEMP_OUTPUT"
  cat "$TEMP_CHANGELOG" >> "$TEMP_OUTPUT"
  tail -n +$FIRST_VERSION_LINE CHANGELOG.md >> "$TEMP_OUTPUT"
else
  # Si aucune ligne "## [" trouvée, ajouter à la fin
  cat CHANGELOG.md > "$TEMP_OUTPUT"
  echo "" >> "$TEMP_OUTPUT"
  cat "$TEMP_CHANGELOG" >> "$TEMP_OUTPUT"
fi

# Remplacer le fichier original
mv "$TEMP_OUTPUT" CHANGELOG.md

# Nettoyer les fichiers temporaires
rm -f "$TEMP_CHANGELOG"

echo "✅ Version mise à jour avec succès de $OLD_VERSION vers $NEW_VERSION"
echo ""
echo "📋 Fichiers modifiés:"
echo "  - package.json"
echo "  - src/constants/version.ts"
echo "  - README.md"
echo "  - CHANGELOG.md"
echo ""
echo "ℹ️  Note: Les fichiers Header.tsx et SettingsPage.tsx utilisent maintenant"
echo "   la constante APP_VERSION depuis src/constants/version.ts"
echo ""
echo "⚠️  N'oubliez pas de:"
echo "  1. Vérifier le contenu de CHANGELOG.md et compléter les sections"
echo "  2. Faire un commit: git add -A && git commit -m \"chore: bump version to $NEW_VERSION\""

