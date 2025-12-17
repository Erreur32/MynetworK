#!/bin/bash

# Script pour tester l'accès à l'image Docker sur GHCR
# DEV ONLY - Ce script teste l'accès public à l'image Docker

set -e

REPO="Erreur32/MynetworK"
IMAGE="ghcr.io/erreur32/mynetwork"
TAG="latest"

echo "🐳 Test d'accès à l'image Docker sur GHCR"
echo "Image: $IMAGE:$TAG"
echo ""

# Test 1: GitHub REST API
echo "=== Test 1: GitHub REST API ==="
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  "https://api.github.com/users/erreur32/packages/container/mynetwork/versions")

HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed 's/HTTP_CODE:[0-9]*$//')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ API GitHub accessible"
  echo "$BODY" | jq '.[0] | {id, name, created_at}' 2>/dev/null || echo "$BODY"
else
  echo "⚠️  HTTP $HTTP_CODE"
  echo "$BODY"
fi
echo ""

# Test 2: Docker Registry API
echo "=== Test 2: Docker Registry API ==="
REGISTRY_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  "https://ghcr.io/v2/erreur32/mynetwork/manifests/$TAG")

REGISTRY_HTTP_CODE=$(echo "$REGISTRY_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
REGISTRY_BODY=$(echo "$REGISTRY_RESPONSE" | sed 's/HTTP_CODE:[0-9]*$//')

if [ "$REGISTRY_HTTP_CODE" = "200" ]; then
  echo "✅ Image disponible dans le registry"
  echo "$REGISTRY_BODY" | jq '{schemaVersion, mediaType}' 2>/dev/null || echo "Image trouvée"
else
  echo "⚠️  HTTP $REGISTRY_HTTP_CODE"
  echo "$REGISTRY_BODY"
fi
echo ""

# Test 3: Docker pull (if docker is available)
if command -v docker &> /dev/null; then
  echo "=== Test 3: Docker Pull (dry-run) ==="
  echo "Pour tester le pull réel, exécutez:"
  echo "  docker pull $IMAGE:$TAG"
else
  echo "=== Test 3: Docker non disponible ==="
  echo "Docker n'est pas installé, impossible de tester le pull"
fi
echo ""

echo "✅ Tests terminés"

