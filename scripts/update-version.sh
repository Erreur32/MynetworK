#!/bin/bash

# Script pour mettre à jour la version dans tous les fichiers du projet
# Usage: ./scripts/update-version.sh [version]
# Si aucune version n'est fournie, affiche la version actuelle et vérifie git status

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

# Récupérer la version actuelle (portable: node > grep -oP > sed)
if command -v node &> /dev/null && [ -f "package.json" ]; then
    OLD_VERSION=$(node -p "try { require('./package.json').version } catch(e) { '' }" 2>/dev/null || echo "")
fi
if [ -z "$OLD_VERSION" ] && [ -f "package.json" ]; then
    OLD_VERSION=$(grep -oP '"version":\s*"\K[^"]+' package.json 2>/dev/null || echo "")
fi
if [ -z "$OLD_VERSION" ] && [ -f "package.json" ]; then
    OLD_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json 2>/dev/null | head -n 1)
fi

# Si aucun argument n'est fourni, afficher la version actuelle et vérifier git status
if [ -z "$1" ]; then
    echo -e "${CYAN}${BOLD}📦 Version actuelle du projet${NC}"
    echo ""
    if [ -n "$OLD_VERSION" ]; then
        echo -e "  ${BOLD}Version: ${GREEN}$OLD_VERSION${NC}"
    else
        echo -e "  ${YELLOW}⚠️  Impossible de trouver la version dans package.json${NC}"
    fi
    echo ""
    
    # Vérifier si git est disponible et si c'est un dépôt git
    if command -v git &> /dev/null && git rev-parse --git-dir > /dev/null 2>&1; then
        echo -e "${CYAN}${BOLD}🔍 Vérification de l'état Git...${NC}"
        echo ""
        
        # Vérifier s'il y a des modifications
        if [ -n "$(git status --porcelain)" ]; then
            echo -e "${YELLOW}⚠️  Des modifications ont été détectées:${NC}"
            echo ""
            git status --short
            echo ""
            
            # Calculer la prochaine version (incrémenter le patch)
            if [ -n "$OLD_VERSION" ]; then
                # Extraire les parties de la version (major.minor.patch)
                IFS='.' read -r -a VERSION_PARTS <<< "$OLD_VERSION"
                MAJOR="${VERSION_PARTS[0]:-0}"
                MINOR="${VERSION_PARTS[1]:-0}"
                PATCH="${VERSION_PARTS[2]:-0}"
                
                # Incrémenter le patch
                PATCH=$((PATCH + 1))
                NEW_VERSION="$MAJOR.$MINOR.$PATCH"
            else
                # Si la version n'est pas trouvée, utiliser 0.0.1
                NEW_VERSION="0.0.1"
            fi
            
            echo -e "${CYAN}${BOLD}💡 Préparation automatique du commit pour la version ${GREEN}$NEW_VERSION${NC}"
            echo ""
            read -p "$(echo -e ${GREEN}Voulez-vous continuer? [O/n]: ${NC})" -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                echo -e "${GREEN}✅ Préparation du commit pour la version ${CYAN}$NEW_VERSION${NC}"
            else
                echo -e "${YELLOW}❌ Opération annulée${NC}"
                exit 0
            fi
        else
            echo -e "${GREEN}✅ Aucune modification détectée${NC}"
            echo ""
            echo -e "${YELLOW}Usage: $0 <version>${NC}"
            echo -e "${YELLOW}Exemple: $0 0.4.1${NC}"
            exit 0
        fi
    else
        echo -e "${YELLOW}⚠️  Ce n'est pas un dépôt Git ou git n'est pas disponible${NC}"
        echo ""
        echo -e "${YELLOW}Usage: $0 <version>${NC}"
        echo -e "${YELLOW}Exemple: $0 0.4.1${NC}"
        exit 0
    fi
else
    NEW_VERSION="$1"
fi

# Si OLD_VERSION est vide ou invalide, utiliser "0.0.0" comme valeur par défaut
if [ -z "$OLD_VERSION" ] || [ "$OLD_VERSION" = "--help" ]; then
    echo -e "${YELLOW}⚠️  Version actuelle invalide ou introuvable dans package.json${NC}"
    echo -e "${YELLOW}   Utilisation de '0.0.0' comme version de départ${NC}"
    OLD_VERSION="0.0.0"
fi

echo -e "${CYAN}${BOLD}🔄 Mise à jour de la version de ${YELLOW}$OLD_VERSION${CYAN} vers ${GREEN}$NEW_VERSION${NC}..."

# 1. package.json
echo -e "${BLUE}  📝 Mise à jour de package.json...${NC}"
sed -i "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# 2. src/constants/version.ts (fichier de constantes centralisé)
echo -e "${BLUE}  📝 Mise à jour de src/constants/version.ts...${NC}"
sed -i "s/export const APP_VERSION = '$OLD_VERSION';/export const APP_VERSION = '$NEW_VERSION';/" src/constants/version.ts

# 2b. src/main.tsx (logs console)
echo -e "${BLUE}  📝 Mise à jour de src/main.tsx (logs console)...${NC}"
# Use perl for more reliable regex matching (works on both GNU and BSD sed)
if command -v perl &> /dev/null; then
    perl -i -pe "s/const APP_VERSION = '[0-9]+\.[0-9]+\.[0-9]+';/const APP_VERSION = '$NEW_VERSION';/" src/main.tsx
else
    # Fallback to sed with extended regex (GNU sed)
    sed -i -E "s/const APP_VERSION = '[0-9]+\.[0-9]+\.[0-9]+';/const APP_VERSION = '$NEW_VERSION';/" src/main.tsx 2>/dev/null || \
    # Fallback to basic sed (BSD sed)
    sed -i '' "s/const APP_VERSION = '[^']*';/const APP_VERSION = '$NEW_VERSION';/" src/main.tsx
fi

# 2c. Versions des plugins (Freebox, UniFi, Scan Réseau)
echo -e "${BLUE}  📝 Mise à jour des versions des plugins...${NC}"
# Use perl for more reliable regex matching
if command -v perl &> /dev/null; then
    perl -i -pe "s/super\('freebox', 'Freebox', '[0-9]+\.[0-9]+\.[0-9]+'\);/super('freebox', 'Freebox', '$NEW_VERSION');/" server/plugins/freebox/FreeboxPlugin.ts
    perl -i -pe "s/super\('unifi', 'UniFi Controller', '[0-9]+\.[0-9]+\.[0-9]+'\);/super('unifi', 'UniFi Controller', '$NEW_VERSION');/" server/plugins/unifi/UniFiPlugin.ts
    perl -i -pe "s/super\('scan-reseau', 'Scan Réseau', '[0-9]+\.[0-9]+\.[0-9]+'\);/super('scan-reseau', 'Scan Réseau', '$NEW_VERSION');/" server/plugins/scan-reseau/ScanReseauPlugin.ts
else
    # Fallback to sed with extended regex (GNU sed)
    sed -i -E "s/super\('freebox', 'Freebox', '[0-9]+\.[0-9]+\.[0-9]+'\);/super('freebox', 'Freebox', '$NEW_VERSION');/" server/plugins/freebox/FreeboxPlugin.ts 2>/dev/null || \
    sed -i '' "s/super('freebox', 'Freebox', '[^']*');/super('freebox', 'Freebox', '$NEW_VERSION');/" server/plugins/freebox/FreeboxPlugin.ts
    sed -i -E "s/super\('unifi', 'UniFi Controller', '[0-9]+\.[0-9]+\.[0-9]+'\);/super('unifi', 'UniFi Controller', '$NEW_VERSION');/" server/plugins/unifi/UniFiPlugin.ts 2>/dev/null || \
    sed -i '' "s/super('unifi', 'UniFi Controller', '[^']*');/super('unifi', 'UniFi Controller', '$NEW_VERSION');/" server/plugins/unifi/UniFiPlugin.ts
    sed -i -E "s/super\('scan-reseau', 'Scan Réseau', '[0-9]+\.[0-9]+\.[0-9]+'\);/super('scan-reseau', 'Scan Réseau', '$NEW_VERSION');/" server/plugins/scan-reseau/ScanReseauPlugin.ts 2>/dev/null || \
    sed -i '' "s/super('scan-reseau', 'Scan Réseau', '[^']*');/super('scan-reseau', 'Scan Réseau', '$NEW_VERSION');/" server/plugins/scan-reseau/ScanReseauPlugin.ts
fi

# 3. README.md (badge)
echo -e "${BLUE}  📝 Mise à jour de README.md...${NC}"
sed -i "s/MynetworK-$OLD_VERSION/MynetworK-$NEW_VERSION/g" README.md

# 4. CHANGELOG.md (ajout de la nouvelle entrée en haut)
echo -e "${BLUE}  📝 Mise à jour de CHANGELOG.md...${NC}"
# Obtenir la date actuelle au format YYYY-MM-DD
CURRENT_DATE=$(date +%Y-%m-%d)

# Vérifier si la version existe déjà dans le CHANGELOG
if grep -q "^## \[$NEW_VERSION\]" CHANGELOG.md 2>/dev/null; then
    echo -e "${YELLOW}  ⚠️  La version $NEW_VERSION existe déjà dans CHANGELOG.md${NC}"
    echo -e "${YELLOW}  ℹ️  Mise à jour de la date uniquement...${NC}"
    # Mettre à jour la date si nécessaire
    sed -i "s/^## \[$NEW_VERSION\] - .*/## [$NEW_VERSION] - $CURRENT_DATE/" CHANGELOG.md
else
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
fi

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
echo -e "  ${BLUE}- src/main.tsx (logs console)${NC}"
echo -e "  ${BLUE}- server/plugins/freebox/FreeboxPlugin.ts${NC}"
echo -e "  ${BLUE}- server/plugins/unifi/UniFiPlugin.ts${NC}"
echo -e "  ${BLUE}- server/plugins/scan-reseau/ScanReseauPlugin.ts${NC}"
echo -e "  ${BLUE}- README.md${NC}"
echo -e "  ${BLUE}- CHANGELOG.md${NC}"
echo -e "  ${BLUE}- $COMMIT_MESSAGE_FILE${NC}"
echo ""
echo -e "${YELLOW}📝 Message de commit créé dans: ${MAGENTA}$COMMIT_MESSAGE_FILE${NC}"
echo ""

# Si le script a été lancé sans argument et a détecté des modifications, proposer de préparer le commit
if [ -z "$1" ] && command -v git &> /dev/null && git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${GREEN}${BOLD}🚀 Préparation du commit automatique...${NC}"
    echo ""
    
    # Ajouter tous les fichiers modifiés
    echo -e "${BLUE}📦 Ajout des fichiers modifiés...${NC}"
    git add -A
    
    # Afficher le statut
    echo ""
    echo -e "${CYAN}${BOLD}📊 Statut Git:${NC}"
    git status --short
    echo ""
    
    echo -e "${GREEN}✅ Fichiers ajoutés au staging area${NC}"
    echo ""
    echo -e "${YELLOW}💡 Pour finaliser le commit, exécutez:${NC}"
    echo -e "${CYAN}git commit -F $COMMIT_MESSAGE_FILE${NC}"
    echo ""
    echo -e "${YELLOW}💡 Pour créer le tag et pousser:${NC}"
    echo -e "${CYAN}git tag -a v$NEW_VERSION -m \"Version $NEW_VERSION\"${NC}"
    echo -e "${CYAN}git push origin main && git push origin v$NEW_VERSION${NC}"
    echo ""
else
    echo -e "${GREEN}${BOLD}🚀 Commandes Git à exécuter:${NC}"
    echo ""
    echo -e "${CYAN}${BOLD}Option 1 - Avec fichier de message:${NC}"
    echo -e "${CYAN}git add -A && git commit -F $COMMIT_MESSAGE_FILE && git tag -a v$NEW_VERSION -m \"Version $NEW_VERSION\" && git push origin main && git push origin v$NEW_VERSION${NC}"
    echo ""
    echo -e "${CYAN}${BOLD}Option 2 - Avec message inline:${NC}"
    COMMIT_MESSAGE_INLINE=$(head -n 1 "$COMMIT_MESSAGE_FILE" 2>/dev/null || echo "feat: Version $NEW_VERSION - Mise à jour")
    echo -e "${CYAN}git add -A && git commit -m \"$COMMIT_MESSAGE_INLINE\" && git tag -a v$NEW_VERSION -m \"Version $NEW_VERSION\" && git push origin main && git push origin v$NEW_VERSION${NC}"
    echo ""
fi
