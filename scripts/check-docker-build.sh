#!/bin/bash

# Script pour vérifier si le build Docker est terminé après un push Git
# Usage: ./scripts/check-docker-build.sh [branch]
# Par défaut: main

BRANCH=${1:-main}
REPO="Erreur32/MynetworK"
IMAGE="ghcr.io/erreur32/mynetwork"
TAG="latest"

echo "🔍 Vérification du build Docker pour $REPO (branche: $BRANCH)"
echo ""

# Vérifier le dernier workflow GitHub Actions
echo "📦 Vérification du workflow GitHub Actions..."
LATEST_RUN=$(curl -s -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/$REPO/actions/runs?branch=$BRANCH&per_page=1" | \
  jq -r '.workflow_runs[0]')

if [ "$LATEST_RUN" = "null" ] || [ -z "$LATEST_RUN" ]; then
  echo "❌ Aucun workflow trouvé pour la branche $BRANCH"
  exit 1
fi

STATUS=$(echo "$LATEST_RUN" | jq -r '.status')
CONCLUSION=$(echo "$LATEST_RUN" | jq -r '.conclusion // "in_progress"')
WORKFLOW_NAME=$(echo "$LATEST_RUN" | jq -r '.name')
CREATED_AT=$(echo "$LATEST_RUN" | jq -r '.created_at')
HTML_URL=$(echo "$LATEST_RUN" | jq -r '.html_url')

echo "  Workflow: $WORKFLOW_NAME"
echo "  Créé: $CREATED_AT"
echo "  Statut: $STATUS"
echo "  Conclusion: $CONCLUSION"
echo "  URL: $HTML_URL"
echo ""

if [ "$STATUS" = "completed" ]; then
  if [ "$CONCLUSION" = "success" ]; then
    echo "✅ Build terminé avec succès !"
    echo ""
    echo "🐳 Vérification de l'image Docker..."
    
    # Vérifier si l'image existe dans le registry
    IMAGE_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
      "https://ghcr.io/v2/erreur32/mynetwork/manifests/$TAG")
    
    if [ "$IMAGE_EXISTS" = "200" ]; then
      echo "✅ Image Docker disponible: $IMAGE:$TAG"
      echo ""
      echo "📥 Pour mettre à jour le conteneur local:"
      echo "   docker-compose pull"
      echo "   docker-compose up -d"
      exit 0
    else
      echo "⚠️  Build réussi mais image pas encore disponible dans le registry"
      echo "   (peut prendre quelques minutes supplémentaires)"
      exit 1
    fi
  else
    echo "❌ Build échoué: $CONCLUSION"
    echo "   Consultez les logs: $HTML_URL"
    exit 1
  fi
else
  echo "⏳ Build en cours... (statut: $STATUS)"
  echo "   Suivez la progression: $HTML_URL"
  exit 2
fi

