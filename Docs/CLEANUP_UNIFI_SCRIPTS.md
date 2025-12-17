# Réorganisation des scripts UniFi (dossier `scripts/`)

Ce document explique la réorganisation des scripts de debug/outil UniFi qui étaient auparavant à la racine du projet.

## Contexte

Historiquement, plusieurs scripts shell UniFi étaient placés directement à la racine du dépôt :

- `unifi.sh`
- `unifi_script.sh`
- `unifi_token.sh`
- `unifi_token_interactif.sh`
- `unitfi_test.sh`

Ces scripts sont utilisés uniquement pour le **développement local**, le **debug** et les **tests manuels** de l’API UniFi. Ils ne sont **pas appelés** par le backend Node/TypeScript ni par le frontend React, et ne sont **pas intégrés** au flux de production (Docker).

## Objectif du changement

L’objectif de cette réorganisation est :

- de **nettoyer la racine du projet** pour la rendre plus lisible ;
- de **regrouper les outils de développement** dans un dossier dédié (`scripts/`) ;
- de rendre plus explicite le fait que ces scripts sont **optionnels** et **réservés aux développeurs**.

## Changements effectués

Les fichiers suivants ont été **déplacés** de la racine vers le dossier `scripts/` :

- `unifi.sh` → `scripts/unifi.sh`
- `unifi_script.sh` → `scripts/unifi_script.sh`
- `unifi_token.sh` → `scripts/unifi_token.sh`
- `unifi_token_interactif.sh` → `scripts/unifi_token_interactif.sh`
- `unitfi_test.sh` → `scripts/unitfi_test.sh`

Aucun contenu fonctionnel n’a été modifié dans ces scripts lors du déplacement.

La documentation de développement a également été mise à jour :

- la section **“Scripts Shell”** de `Docs/README-DEV.md` pointe désormais vers les chemins `scripts/...` ;
- la note précise toujours que ces scripts ne sont **pas utilisés en production** et peuvent contenir des **credentials en dur** pour le debug local.

## Impact fonctionnel

- **Aucun impact** sur l’application en production (backend, frontend, Docker) :
  - aucun de ces scripts n’est appelé par le code TypeScript/Node ;
  - ils ne sont pas inclus dans l’image Docker.
- Les développeurs qui les utilisaient devront simplement les lancer depuis le nouveau chemin :

```bash
cd /chemin/vers/mynetwork
chmod +x scripts/unifi.sh
./scripts/unifi.sh clients
```

ou, par exemple :

```bash
./scripts/unifi_token_interactif.sh
./scripts/unitfi_test.sh
```

## Résumé

- Les scripts UniFi de debug ont été **déplacés** dans `scripts/` pour clarifier la structure du projet.
- La documentation a été mise à jour pour refléter ces nouveaux emplacements.
- Il n’y a **aucun changement de logique métier** ni d’intégration côté application ; il s’agit uniquement d’un **nettoyage structurel** et d’une meilleure organisation des outils de développement.


