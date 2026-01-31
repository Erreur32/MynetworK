#!/usr/bin/env node

/**
 * Script pour incrémenter automatiquement la version (sans suffixe -dev)
 * Usage: node scripts/bump-version.js [patch|minor|major]
 * Par défaut: patch (0.0.3 -> 0.0.4)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const versionType = process.argv[2] || 'patch';

function incrementVersion(version, type) {
  // Version sans suffixe (ex: "0.0.3")
  const parts = version.split('.').map(Number);
  
  if (parts.length !== 3) {
    throw new Error(`Version format invalide: ${version} (attendu: X.Y.Z)`);
  }
  
  let [major, minor, patch] = parts;
  
  switch (type) {
    case 'major':
      major++;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor++;
      patch = 0;
      break;
    case 'patch':
    default:
      patch++;
      break;
  }
  
  return `${major}.${minor}.${patch}`;
}

// Read package.json
const packagePath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
const currentVersion = packageJson.version;
const newVersion = incrementVersion(currentVersion, versionType);

// Update package.json
packageJson.version = newVersion;
writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

// Update src/constants/version.ts
const versionTsPath = join(rootDir, 'src/constants/version.ts');
let versionTsContent = readFileSync(versionTsPath, 'utf-8');
versionTsContent = versionTsContent.replace(
  /export const APP_VERSION = '\d+\.\d+\.\d+';/,
  `export const APP_VERSION = '${newVersion}';`
);
writeFileSync(versionTsPath, versionTsContent);

// Update src/main.tsx (logs console)
const mainTsxPath = join(rootDir, 'src/main.tsx');
let mainTsxContent = readFileSync(mainTsxPath, 'utf-8');
mainTsxContent = mainTsxContent.replace(
  /const APP_VERSION = '\d+\.\d+\.\d+';/,
  `const APP_VERSION = '${newVersion}';`
);
writeFileSync(mainTsxPath, mainTsxContent);

// Update README.md
const readmePath = join(rootDir, 'README.md');
let readmeContent = readFileSync(readmePath, 'utf-8');
readmeContent = readmeContent.replace(
  /MynetworK-\d+\.\d+\.\d+(-dev)?/g,
  `MynetworK-${newVersion}`
);
writeFileSync(readmePath, readmeContent);

// Update Header.tsx (si version en dur présente)
const headerPath = join(rootDir, 'src/components/layout/Header.tsx');
let headerContent = readFileSync(headerPath, 'utf-8');
headerContent = headerContent.replace(
  /v\d+\.\d+\.\d+(-dev)?/g,
  `v${newVersion}`
);
writeFileSync(headerPath, headerContent);

// Update server plugins (Freebox, UniFi, Scan Réseau) : super('id', 'Name', 'X.Y.Z')
const pluginPaths = [
  'server/plugins/freebox/FreeboxPlugin.ts',
  'server/plugins/unifi/UniFiPlugin.ts',
  'server/plugins/scan-reseau/ScanReseauPlugin.ts'
];
const versionInPluginRegex = /(super\([^)]*',\s*')\d+\.\d+\.\d+('\))/;
for (const relPath of pluginPaths) {
  const pluginPath = join(rootDir, relPath);
  let pluginContent = readFileSync(pluginPath, 'utf-8');
  pluginContent = pluginContent.replace(versionInPluginRegex, `$1${newVersion}$2`);
  writeFileSync(pluginPath, pluginContent);
}

console.log(`✅ Version incrémentée: ${currentVersion} -> ${newVersion}`);
console.log(`✅ package.json mis à jour`);
console.log(`✅ src/constants/version.ts mis à jour`);
console.log(`✅ src/main.tsx mis à jour`);
console.log(`✅ README.md mis à jour`);
console.log(`✅ Header.tsx mis à jour`);
console.log(`✅ Plugins serveur (Freebox, UniFi, Scan Réseau) mis à jour`);
console.log(`📝 N'oubliez pas de mettre à jour CHANGELOG.md avec les changements !`);

