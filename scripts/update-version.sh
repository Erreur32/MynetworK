#!/bin/bash

# Script pour mettre à jour la version dans tous les fichiers du projet
# Usage: ./scripts/update-version.sh 0.0.4

set -e

# Couleurs pour la sortie
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Vérifier qu'un argument version est fourni
if [ -z "$1" ]; then
    echo -e "${RED}❌ Erreur: Veuillez fournir une version (ex: 0.0.4)${NC}"
    echo -e "${YELLOW}Usage: $0 <version>${NC}"
    exit 1
fi

NEW_VERSION="$1"
OLD_VERSION=$(grep -oP '"version":\s*"\K[^"]+' package.json)

if [ -z "$OLD_VERSION" ]; then
    echo -e "${RED}❌ Erreur: Impossible de trouver la version actuelle dans package.json${NC}"
    exit 1
fi

echo -e "${CYAN}${BOLD}🔄 Mise à jour de la version de ${YELLOW}$OLD_VERSION${CYAN} vers ${GREEN}$NEW_VERSION${NC}..."

# 1. package.json
echo -e "${BLUE}  📝 Mise à jour de package.json...${NC}"
sed -i "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# 2. src/constants/version.ts (fichier de constantes centralisé)
echo -e "${BLUE}  📝 Mise à jour de src/constants/version.ts...${NC}"
sed -i "s/export const APP_VERSION = '$OLD_VERSION';/export const APP_VERSION = '$NEW_VERSION';/" src/constants/version.ts

# 3. README.md (badge)
echo -e "${BLUE}  📝 Mise à jour de README.md...${NC}"
sed -i "s/MynetworK-$OLD_VERSION/MynetworK-$NEW_VERSION/g" README.md

# 4. CHANGELOG.md (ajout de la nouvelle entrée en haut)
echo -e "${BLUE}  📝 Mise à jour de CHANGELOG.md...${NC}"
# Obtenir la date actuelle au format YYYY-MM-DD
CURRENT_DATE=$(date +%Y-%m-%d)

# Créer un fichier temporaire avec la nouvelle entrée (sans template vide)
TEMP_CHANGELOG=$(mktemp)
cat > "$TEMP_CHANGELOG" << EOF
## [$NEW_VERSION] - $CURRENT_DATE

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

# Créer le message de commit basé sur le format de commit-message.txt
COMMIT_MESSAGE_FILE="commit-message.txt"

# Extraire le contenu du CHANGELOG pour cette version
# Utiliser awk pour extraire entre la version actuelle et la suivante ou ---
CHANGELOG_CONTENT=$(awk -v version="$NEW_VERSION" '
    /^## \[/ { 
        if (found) exit
        if ($0 ~ "^## \\[" version "\\]") { found=1; next }
    }
    found && /^## \[/ { exit }
    found && /^---$/ { exit }
    found { print }
' CHANGELOG.md 2>/dev/null || echo "")

# Si le CHANGELOG contient du contenu, créer le message formaté
if [ -n "$CHANGELOG_CONTENT" ] && echo "$CHANGELOG_CONTENT" | grep -qE "^###|^\-"; then
    # Formater les sections avec les emojis appropriés (format commit-message.txt)
    FORMATTED_CONTENT=$(echo "$CHANGELOG_CONTENT" | \
        sed 's/^### 🐛 Corrigé/🐛 Corrigé/' | \
        sed 's/^### 🔧 Modifié/🔧 Modifié/' | \
        sed 's/^### 📝 Documentation/📝 Documentation/' | \
        sed 's/^### ✨ Ajouté/✨ Ajouté/' | \
        sed 's/^### 🐛/🐛 Corrigé/' | \
        sed 's/^### 🔧/🔧 Modifié/' | \
        sed 's/^### 📝/📝 Documentation/' | \
        sed 's/^### ✨/✨ Ajouté/')
    
    cat > "$COMMIT_MESSAGE_FILE" << EOF
feat: Version $NEW_VERSION - Mise à jour

$FORMATTED_CONTENT
EOF
else
    # Message minimal si le CHANGELOG est vide
    cat > "$COMMIT_MESSAGE_FILE" << EOF
feat: Version $NEW_VERSION - Mise à jour
EOF
fi

# Corriger les permissions des fichiers modifiés
echo -e "${BLUE}  🔐 Correction des permissions...${NC}"
if command -v chown &> /dev/null; then
    # Détection automatique du chemin du projet à partir de l'emplacement du script
    PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    if [ -d "$PROJECT_ROOT" ]; then
        if chown debian32:debian32 "$PROJECT_ROOT" -Rf 2>/dev/null; then
            echo -e "${GREEN}  ✅ Permissions corrigées pour ${CYAN}$PROJECT_ROOT${NC}"
            echo -e "${GREEN}${BOLD}  ✓ Commande chown exécutée avec succès${NC}"
            echo -e "${GREEN}     Propriétaire: ${CYAN}debian32:debian32${NC}"
            echo -e "${GREEN}     Chemin: ${CYAN}$PROJECT_ROOT${NC}"
        else
            echo -e "${YELLOW}  ⚠️  Impossible d'exécuter chown (peut nécessiter les droits sudo)${NC}"
            echo -e "${YELLOW}     Exécutez manuellement: ${CYAN}sudo chown debian32:debian32 $PROJECT_ROOT -Rf${NC}"
        fi
    else
        echo -e "${RED}  ❌ Répertoire du projet introuvable: ${CYAN}$PROJECT_ROOT${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠️  Commande chown non disponible${NC}"
fi

echo -e "${GREEN}${BOLD}✅ Version mise à jour avec succès de ${YELLOW}$OLD_VERSION${GREEN} vers ${CYAN}$NEW_VERSION${NC}"
echo ""
echo -e "${CYAN}${BOLD}📋 Fichiers modifiés:${NC}"
echo -e "  ${BLUE}- package.json${NC}"
echo -e "  ${BLUE}- src/constants/version.ts${NC}"
echo -e "  ${BLUE}- README.md${NC}"
echo -e "  ${BLUE}- CHANGELOG.md${NC}"
echo -e "  ${BLUE}- $COMMIT_MESSAGE_FILE${NC}"
echo ""
echo -e "${YELLOW}📝 Message de commit créé dans: ${MAGENTA}$COMMIT_MESSAGE_FILE${NC}"
echo ""
 
echo -e "${GREEN}${BOLD}🚀 Commandes Git à exécuter:${NC}"
echo ""
echo -e "${CYAN}${BOLD}Option 1 - Avec fichier de message:${NC}"
echo -e "${CYAN}git add -A && git commit -F $COMMIT_MESSAGE_FILE && git tag -a v$NEW_VERSION -m \"Version $NEW_VERSION\" && git push origin main && git push origin v$NEW_VERSION${NC}"
echo ""
echo -e "${CYAN}${BOLD}Option 2 - Avec message inline:${NC}"
COMMIT_MESSAGE_INLINE=$(head -n 1 "$COMMIT_MESSAGE_FILE" 2>/dev/null || echo "feat: Version $NEW_VERSION - Mise à jour")
echo -e "${CYAN}git add -A && git commit -m \"$COMMIT_MESSAGE_INLINE\" && git tag -a v$NEW_VERSION -m \"Version $NEW_VERSION\" && git push origin main && git push origin v$NEW_VERSION${NC}"
echo ""
 
