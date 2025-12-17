#!/bin/bash

# Script pour créer des tags Git pour les releases
# Usage: ./scripts/create-tags.sh

set -e

echo "🏷️  Création de tags Git pour les releases"
echo ""

# Tags à créer
TAGS=(
  "v0.0.1:🎉 Version 0.0.1 - Initial release"
  "v0.0.6:🚀 Version 0.0.6 - Current release"
)

for tag_info in "${TAGS[@]}"; do
  TAG=$(echo "$tag_info" | cut -d: -f1)
  MESSAGE=$(echo "$tag_info" | cut -d: -f2-)
  
  # Check if tag already exists
  if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "⚠️  Tag $TAG existe déjà, ignoré"
  else
    echo "📌 Création du tag $TAG..."
    git tag -a "$TAG" -m "$MESSAGE"
    echo "✅ Tag $TAG créé"
  fi
done

echo ""
echo "📤 Pour pousser les tags:"
echo "  git push origin --tags"
echo ""
echo "✅ Script terminé"

