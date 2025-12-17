#!/bin/bash
# Script de test pour vérifier l'accès à l'image Docker sur GitHub Container Registry

echo "=========================================="
echo "Test d'accès à l'image Docker"
echo "Image: ghcr.io/erreur32/mynetwork"
echo "=========================================="
echo ""

# Couleurs pour l'affichage
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}1. Test de l'API GitHub REST (packages/container/versions)${NC}"
echo "URL: https://api.github.com/users/erreur32/packages/container/mynetwork/versions"
echo ""
response1=$(curl -s -w "\nHTTP_CODE:%{http_code}" "https://api.github.com/users/erreur32/packages/container/mynetwork/versions")
http_code1=$(echo "$response1" | grep "HTTP_CODE" | cut -d: -f2)
body1=$(echo "$response1" | sed '/HTTP_CODE/d')

if [ "$http_code1" = "200" ]; then
    echo -e "${GREEN}✓ Succès (HTTP $http_code1)${NC}"
    echo "Réponse (premiers 500 caractères):"
    echo "$body1" | head -c 500
    echo ""
    echo ""
else
    echo -e "${RED}✗ Échec (HTTP $http_code1)${NC}"
    echo "Réponse:"
    echo "$body1"
    echo ""
fi

echo ""
echo -e "${YELLOW}2. Test de l'API Docker Registry (tags/list)${NC}"
echo "URL: https://ghcr.io/v2/erreur32/mynetwork/tags/list"
echo ""
response2=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -H "Accept: application/json" \
    -H "User-Agent: MynetworK-UpdateChecker/1.0" \
    "https://ghcr.io/v2/erreur32/mynetwork/tags/list")
http_code2=$(echo "$response2" | grep "HTTP_CODE" | cut -d: -f2)
body2=$(echo "$response2" | sed '/HTTP_CODE/d')

if [ "$http_code2" = "200" ]; then
    echo -e "${GREEN}✓ Succès (HTTP $http_code2)${NC}"
    echo "Réponse complète:"
    echo "$body2" | jq '.' 2>/dev/null || echo "$body2"
    echo ""
    
    # Extraire les tags
    tags=$(echo "$body2" | jq -r '.tags[]?' 2>/dev/null)
    if [ -n "$tags" ]; then
        echo "Tags trouvés:"
        echo "$tags" | while read tag; do
            echo "  - $tag"
        done
    else
        echo -e "${RED}✗ Aucun tag trouvé dans la réponse${NC}"
    fi
else
    echo -e "${RED}✗ Échec (HTTP $http_code2)${NC}"
    echo "Réponse:"
    echo "$body2"
    echo ""
fi

echo ""
echo -e "${YELLOW}3. Test avec authentification GitHub (si token disponible)${NC}"
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Token GitHub trouvé, test avec authentification..."
    response3=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/users/erreur32/packages/container/mynetwork/versions")
    http_code3=$(echo "$response3" | grep "HTTP_CODE" | cut -d: -f2)
    body3=$(echo "$response3" | sed '/HTTP_CODE/d')
    
    if [ "$http_code3" = "200" ]; then
        echo -e "${GREEN}✓ Succès avec authentification (HTTP $http_code3)${NC}"
        echo "$body3" | jq '.' 2>/dev/null | head -20 || echo "$body3" | head -20
    else
        echo -e "${RED}✗ Échec avec authentification (HTTP $http_code3)${NC}"
        echo "$body3"
    fi
else
    echo "Variable GITHUB_TOKEN non définie, test sans authentification uniquement"
fi

echo ""
echo -e "${YELLOW}4. Test Docker pull (vérification de l'accès à l'image)${NC}"
echo "Test: docker pull ghcr.io/erreur32/mynetwork:0.0.7"
echo ""
if command -v docker &> /dev/null; then
    docker pull ghcr.io/erreur32/mynetwork:0.0.7 2>&1 | head -10
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo -e "${GREEN}✓ Image accessible via Docker${NC}"
    else
        echo -e "${RED}✗ Image non accessible via Docker${NC}"
    fi
else
    echo "Docker non installé ou non accessible"
fi

echo ""
echo -e "${YELLOW}5. Test Docker manifest (liste des tags disponibles)${NC}"
if command -v docker &> /dev/null; then
    echo "Récupération du manifest..."
    docker manifest inspect ghcr.io/erreur32/mynetwork:latest 2>&1 | head -20
else
    echo "Docker non installé ou non accessible"
fi

echo ""
echo "=========================================="
echo "Tests terminés"
echo "=========================================="
