#!/bin/bash

# Script pour créer les tags Git v0.0.1 et v0.0.6

echo "🏷️  Création des tags Git..."

# Créer le tag v0.0.1
echo "📌 Création du tag v0.0.1..."
git tag -a v0.0.1 -m "🎉 Version 0.0.1 - Initial release

✨ First stable release of MynetworK Dashboard
- 🎨 Modern React dashboard with TypeScript
- 🔌 Plugin system (Freebox, UniFi)
- 🔐 JWT authentication
- 🐳 Docker ready
- 📊 Multi-source network monitoring"

# Créer le tag v0.0.6
echo "📌 Création du tag v0.0.6..."
git tag -a v0.0.6 -m "🚀 Version 0.0.6 - Current release

✨ Latest stable release
- 🎨 Modern React dashboard with TypeScript
- 🔌 Plugin system (Freebox, UniFi)
- 🔐 JWT authentication
- 🐳 Docker ready
- 📊 Multi-source network monitoring
- 🔒 Enhanced security (protected sensitive files)
- 📚 Complete documentation"

# Afficher les tags créés
echo ""
echo "✅ Tags créés avec succès :"
git tag -l "v0.0.*"

echo ""
echo "📤 Pour pousser les tags vers GitHub :"
echo "   git push origin v0.0.1"
echo "   git push origin v0.0.6"
echo ""
echo "   OU pousser tous les tags :"
echo "   git push origin --tags"

