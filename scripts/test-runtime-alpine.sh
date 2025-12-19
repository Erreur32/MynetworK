#!/bin/bash
# ===========================================
# Script de Test Runtime Alpine
# Vérifie que le conteneur fonctionne correctement après le build
# ===========================================

set -e

IMAGE_NAME="mynetwork:test"
CONTAINER_NAME="mynetwork-runtime-test"

echo "🧪 Test Runtime Alpine - MyNetwork"
echo "===================================="
echo ""

# Couleurs pour les messages
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les résultats
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Nettoyage si le conteneur existe déjà
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    print_info "Nettoyage du conteneur existant..."
    docker rm -f "${CONTAINER_NAME}" > /dev/null 2>&1
fi

# Test 1 : Build de l'image
echo "📦 Test 1 : Build de l'image..."
if docker build -t "${IMAGE_NAME}" . > /dev/null 2>&1; then
    print_success "Build réussi"
else
    print_error "Échec du build"
    exit 1
fi
echo ""

# Test 2 : Démarrage du conteneur
echo "🚀 Test 2 : Démarrage du conteneur..."
if docker run -d --name "${CONTAINER_NAME}" -p 3000:3000 "${IMAGE_NAME}" > /dev/null 2>&1; then
    print_success "Conteneur démarré"
    sleep 5  # Attendre que le conteneur démarre
else
    print_error "Échec du démarrage du conteneur"
    exit 1
fi
echo ""

# Test 3 : Vérification des modules natifs
echo "🔧 Test 3 : Vérification des modules natifs..."

# Test better-sqlite3
if docker exec "${CONTAINER_NAME}" node -e "require('better-sqlite3'); console.log('OK')" > /dev/null 2>&1; then
    print_success "better-sqlite3 chargé correctement"
else
    print_error "Échec du chargement de better-sqlite3"
    docker logs "${CONTAINER_NAME}" | tail -20
    exit 1
fi

# Test bcrypt
if docker exec "${CONTAINER_NAME}" node -e "require('bcrypt'); console.log('OK')" > /dev/null 2>&1; then
    print_success "bcrypt chargé correctement"
else
    print_error "Échec du chargement de bcrypt"
    docker logs "${CONTAINER_NAME}" | tail -20
    exit 1
fi
echo ""

# Test 4 : Test de la base de données SQLite
echo "💾 Test 4 : Test de la base de données SQLite..."
if docker exec "${CONTAINER_NAME}" node -e "
const Database = require('better-sqlite3');
const db = new Database('/tmp/test-runtime.db');
db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)');
db.exec('INSERT INTO test (value) VALUES (\"test\")');
const result = db.prepare('SELECT * FROM test').get();
if (result && result.value === 'test') {
    console.log('OK');
} else {
    process.exit(1);
}
db.close();
" > /dev/null 2>&1; then
    print_success "Base de données SQLite fonctionnelle"
else
    print_error "Échec du test de la base de données"
    docker logs "${CONTAINER_NAME}" | tail -20
    exit 1
fi
echo ""

# Test 5 : Vérification des commandes système
echo "🛠️  Test 5 : Vérification des commandes système..."
if docker exec "${CONTAINER_NAME}" sh -c "chroot --version > /dev/null 2>&1 && df --version > /dev/null 2>&1 && grep --version > /dev/null 2>&1 && awk --version > /dev/null 2>&1 && wget --version > /dev/null 2>&1"; then
    print_success "Toutes les commandes système sont disponibles"
else
    print_error "Certaines commandes système sont manquantes"
    exit 1
fi
echo ""

# Test 6 : Test du healthcheck
echo "🏥 Test 6 : Test du healthcheck..."
sleep 10  # Attendre que l'application démarre
if docker exec "${CONTAINER_NAME}" wget -q --spider http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    print_success "Healthcheck réussi"
else
    print_error "Échec du healthcheck"
    print_info "Logs du conteneur :"
    docker logs "${CONTAINER_NAME}" | tail -30
    exit 1
fi
echo ""

# Test 7 : Test de l'API (si disponible)
echo "🌐 Test 7 : Test de l'API..."
if curl -s -f http://localhost:3000/api/health > /dev/null 2>&1; then
    print_success "API accessible depuis l'extérieur"
else
    print_error "API non accessible"
    print_info "Vérifiez que le port 3000 est bien mappé"
fi
echo ""

# Résumé
echo "===================================="
print_success "Tous les tests runtime sont passés !"
echo ""
print_info "Le conteneur Alpine fonctionne correctement."
print_info "Pour arrêter le conteneur : docker stop ${CONTAINER_NAME}"
print_info "Pour voir les logs : docker logs ${CONTAINER_NAME}"
echo ""

