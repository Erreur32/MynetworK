#!/usr/bin/env node

/**
 * Script pour vérifier si le build Docker est terminé après un push Git
 * Usage: npm run check:docker [branch]
 * Par défaut: main
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const branch = process.argv[2] || 'main';
const repo = 'Erreur32/mynetwork';
const image = 'ghcr.io/erreur32/mynetwork';
const tag = 'latest';

console.log(`🔍 Vérification du build Docker pour ${repo} (branche: ${branch})\n`);

// Vérifier le dernier workflow GitHub Actions
console.log('📦 Vérification du workflow GitHub Actions...');

try {
  const headers = {
    'Accept': 'application/vnd.github.v3+json'
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs?branch=${branch}&per_page=1`, {
    headers
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('GitHub API error: 404 Not Found (repo privé ou GitHub Actions désactivé, ajoutez un token GITHUB_TOKEN si nécessaire)');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.workflow_runs || data.workflow_runs.length === 0) {
    console.error(`❌ Aucun workflow trouvé pour la branche ${branch}`);
    process.exit(1);
  }

  const latestRun = data.workflow_runs[0];
  const status = latestRun.status;
  const conclusion = latestRun.conclusion || 'in_progress';
  const workflowName = latestRun.name;
  const createdAt = latestRun.created_at;
  const htmlUrl = latestRun.html_url;

  console.log(`  Workflow: ${workflowName}`);
  console.log(`  Créé: ${createdAt}`);
  console.log(`  Statut: ${status}`);
  console.log(`  Conclusion: ${conclusion}`);
  console.log(`  URL: ${htmlUrl}\n`);

  if (status === 'completed') {
    if (conclusion === 'success') {
      console.log('✅ Build terminé avec succès !\n');
      console.log('🐳 Vérification de l\'image Docker...');

      // Vérifier si l'image existe dans le registry
      try {
        const imageResponse = await fetch(`https://ghcr.io/v2/erreur32/mynetwork/manifests/${tag}`, {
          method: 'HEAD'
        });

        if (imageResponse.ok) {
          console.log(`✅ Image Docker disponible: ${image}:${tag}\n`);
          console.log('📥 Pour mettre à jour le conteneur local:');
          console.log('   docker-compose pull');
          console.log('   docker-compose up -d');
          process.exit(0);
        } else {
          console.log('⚠️  Build réussi mais image pas encore disponible dans le registry');
          console.log('   (peut prendre quelques minutes supplémentaires)');
          process.exit(1);
        }
      } catch (error) {
        console.log('⚠️  Build réussi mais image pas encore disponible dans le registry');
        console.log('   (peut prendre quelques minutes supplémentaires)');
        process.exit(1);
      }
    } else {
      console.error(`❌ Build échoué: ${conclusion}`);
      console.log(`   Consultez les logs: ${htmlUrl}`);
      process.exit(1);
    }
  } else {
    console.log(`⏳ Build en cours... (statut: ${status})`);
    console.log(`   Suivez la progression: ${htmlUrl}`);
    process.exit(2);
  }
} catch (error) {
  console.error(`❌ Erreur lors de la vérification: ${error.message}`);
  process.exit(1);
}

