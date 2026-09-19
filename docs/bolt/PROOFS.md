# BOLT-1 — preuves du 19 septembre 2026

## Complément après validation de la branche expérimentale

Avant les seuls ajouts documentaires de cette reprise, les **734 SHA-256**
correspondent exactement à la sélection testée précédemment. Les preuves de
navigateur/serveur ci-dessous restent applicables ; elles ne sont pas présentées
comme réexécutées dans cette reprise. Neuf tests ciblés ont réellement été rejoués,
**9/9 PASS** :

```powershell
node --test scripts/runtime-assets.test.mjs scripts/check-migration-versions.test.mjs scripts/stable-packaging.test.mjs
```

Recherche des références aux **54 chemins retirés** dans les sources sélectionnées
app/serveur/shared/scripts/database/worker, avec recoupement des chemins relatifs :

- `app/assets/jaspe2d/v12/manifest.json:134` et `:184` conservent les clés logiques
  `images/chin2.png` et `references/paupières-fermées.png`. Elles résolvent vers les
  fichiers conservés `../originals/chin1.png` et `eyelids-closed.png`, aux mêmes
  empreintes. `app/modules/jaspe2d/live-companion.js:167` et
  `app/qa-bolt-cache.cjs:37` utilisent ces clés ; aucune URL supprimée requise.
- `app/assets/jaspe2d/assise-v1/prompts.json:4` décrit la provenance d'une planche ;
  la référence de maquette archivée n'est pas chargée par le moteur runtime.
- `scripts/check-migration-versions.mjs:60` désigne bien le générateur conservé
  `database/installation/generate-manifest.mjs`, pas celui retiré de l'archive.
- `scripts/scan-selection.mjs:20` et `scripts/stable-packaging.test.mjs:4` utilisent
  les ressources déplacées dans `scripts/`, présentes. Le nom `selection.mjs`
  trouvé dans `scan-selection.mjs` est un chevauchement textuel.
- Aucun retrait dans le code cartes, auth, ACCESS_LAW, `school_id`, le serveur,
  les SQL/migrations ou les tests actifs. Le rapprochement binaire précédent et
  les tests de résolution de tous les assets restent vérifiés.

`removed-files.md` et le présent fichier sont conservés. **Aucun correctif
CanvasGradient** : c'est la première tâche Bolt, conformément à la validation.

### Contrôle distant et limite de publication

La commande suivante échoue dans le sandbox, puis réussit avec l'accès réseau
autorisé, sans changement Git distant :

```powershell
$env:GIT_TERMINAL_PROMPT='0'
git ls-remote https://github.com/medygoo/schoolsafe-stable.git refs/heads/bolt/workspace refs/heads/develop/codex-base refs/heads/main
```

Erreur initiale exacte :

```text
fatal: unable to access 'https://github.com/medygoo/schoolsafe-stable.git/': Failed to connect to github.com:443 after 311 ms: Could not connect to server
```

Résultat de la lecture autorisée : `develop/codex-base` vaut toujours
`7d5cc89924319eb9c46d8a5a9cd0f3f729743834` ; aucune référence Bolt/main retournée.
La commande de réglages GitHub ci-dessous échoue dans et hors sandbox :

```powershell
gh api repos/medygoo/schoolsafe-stable --jq '{default_branch: .default_branch, has_pages: .has_pages, permissions: .permissions}'
```

```text
To get started with GitHub CLI, please run:  gh auth login
Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.
```

La tentative navigateur `cua.getBrowser({url:'https://github.com/medygoo/schoolsafe-stable/settings/hooks'})`
répond exactement `No browser is available`. Aucun workflow local n'est sélectionné,
mais cela ne prouve pas l'absence de hook/application distant. **Aucun push effectué**
faute de vérification du non-déploiement ; aucune protection ou configuration
modifiée, aucun credential extrait. Reprendre ce contrôle avant la publication.

## Preuves de la préparation précédente

Base : `7d5cc89924319eb9c46d8a5a9cd0f3f729743834`, 772 fichiers.
Essais locaux sous Windows/Node 24.19.0, Chromium Playwright déjà installé.
Pas d'installation, base réelle, R2 réel, fournisseur JASPE, Control distant ou VPS.
`SCHOOLSAFE_QA_ROOT` permet de servir la base stable inchangée avec le même
harnais. Le serveur de preuve écoute uniquement la boucle locale ; les appels
externes sont bloqués et `/config` est synthétique.

## Conservation indépendante des tests fonctionnels

Comparaison binaire avec la copie stable : 27/27 fichiers moteur JASPE,
4/4 SafeAssistant, 66/66 frontend/assets cartes, 120/120 `server/src`,
122/122 fichiers SQL/migrations et documentation de base, catalogue de permissions
1/1 et worker JASPE 4/4 inchangés. Les 126 fichiers de QA/tests existants demeurent.
Les 54 retraits correspondent aux SHA-256 du manifeste ; leurs originaux restent
dans la copie stable et le commit GitHub historique. Aucun fichier de carte retiré.

Les seules modifications runtime sont l'URL d'un doublon PNG dans le manifeste
JASPE et la version du cache Service Worker. Le test statique vérifie cette
nouvelle version. Scanner/harnais de preuve déplacés/adaptés pour ne plus dépendre
des artefacts de préparation retirés. Aucun contrôle de permission affaibli.

## Résultats réellement obtenus

| Contrôle | Avant retraits | Après retraits | Portée de la preuve |
| --- | --- | --- | --- |
| Tests Node regroupés, commande ci-dessous | 19/19 PASS | 21/21 PASS avec les deux nouveaux tests assets | Packaging, intégrité manifestes, cartes statiques, présentation/gestes JASPE |
| Cinq fichiers Vitest serveur | 25/25 PASS | 25/25 PASS | Droits cartes/JASPE/Control et ZIP ; adaptateurs synthétiques |
| Typage serveur `tsc --noEmit` | Non rejoué avant | PASS | Compilation des types, aucun service externe |
| Cinq QA navigateur JASPE | PASS | PASS | Dashboard, voix avec substituts Web Speech, assise, debout, cadrage hanches |
| Cache Service Worker et assets | Sans objet | PASS | Ancien cache évacué, 75 entrées de manifestes téléchargées et SHA-256 vérifiés ; 33 clés v12 conservées |
| Auth 1440/390 | Preuve historique conservée | PASS | Formulaires et canvas JASPE affichés, sans connexion réelle |
| Rendu cartes/QR dans le studio | PASS | PASS | Badge et PVC recto/verso, deux QR par carte, 60 images chargées |
| Export PNG dans le studio | ÉCHEC, quatre faces | Même ÉCHEC, quatre faces | Aucune validation d'export HD ; assertion maintenue en échec |
| Contrats responsive/physique/SafeAssistant | Physique PASS | Tous PASS | Contrôles statiques ciblés |
| Session A5.1 et refus ciblés | Non rejoués avant | 39/39 et 13 assertions PASS | Substituts DOM/storage ; pas de PostgreSQL nouveau |
| Manifestes migrations | PASS dans tests | PASS, 12 ensembles / 43 unités | Intégrité ; inventaire 46, installation globale non exécutable |

Captures de connexion et cartes observées localement, hors branche pour ne pas
alourdir l'import. Le rendu des cartes conserve des chevauchements visibles ;
la qualité d'impression n'est pas certifiée. Les assertions de PNG restent
strictes : aucun échec transformé en succès.

## Commandes reproductibles

Depuis la racine de la copie Bolt, avec les dépendances et Chromium disponibles :

```powershell
node --test scripts/stable-packaging.test.mjs scripts/check-migration-versions.test.mjs database/cards/v1/tests/cards-static.test.mjs app/qa-jaspe-presentation-controller.test.mjs app/qa-jaspe-continuous-gesture.test.mjs scripts/runtime-assets.test.mjs
node scripts/qa-bolt-runtime.mjs app/qa-jaspe-dashboard.cjs app/qa-jaspe-voice.cjs app/qa-jaspe-seated.cjs app/qa-jaspe-standing.cjs app/qa-jaspe-hip-layout.cjs app/qa-bolt-cache.cjs
node scripts/qa-stable-auth.mjs
node scripts/qa-bolt-runtime.mjs app/qa-bolt-cards.cjs
node app/qa-responsive-visual-system.cjs
node app/qa-jaspe-physical-contract.cjs
node app/qa-safe-assistant-access.cjs
node app/qa-a51-session.cjs
node app/qa-a51-targeted-denies.cjs
node scripts/check-migration-versions.mjs
node scripts/scan-selection.mjs
```

Avant retraits, le groupe Node ne
comprenait pas encore `runtime-assets.test.mjs` (ses deux tests ont ensuite passé
aussi sur la base). Les QA JASPE sont les scripts existants non modifiés.

Depuis `server/`, commande Vitest exécutée avec les dépendances serveur existantes :

```powershell
node node_modules/vitest/vitest.mjs run tests/cards-batch-preservation.test.ts tests/cards.test.ts tests/cardsnative-access.test.ts tests/control-authority.test.ts tests/jaspenative.test.ts
node ../../../node_modules/typescript/bin/tsc --noEmit --project tsconfig.json
```

Le chemin TypeScript ci-dessus est celui de l'espace de travail local ; utiliser
le TypeScript installé pour le projet dans un autre checkout. Une jonction locale
vers les dépendances serveur déjà installées a servi aux tests ; elle n'entre
pas dans la sélection. Le nouveau test ZIP utilise le vrai service et le vrai ZIP,
décompresse ses deux PNG et son manifeste, vérifie empreintes et namespace école,
mais remplace pool PostgreSQL/R2/Control/fetch. Cela ne prouve pas leur intégration.

Comparaison du PNG effectuée avec le même harnais sur la base puis la copie Bolt :

```powershell
$env:SCHOOLSAFE_QA_ROOT='C:/Users/PC/Pictures/medygooschoolsafe-v/.migration-staging/schoolsafe-stable'
node scripts/qa-bolt-runtime.mjs app/qa-bolt-cards.cjs
Remove-Item Env:SCHOOLSAFE_QA_ROOT
node scripts/qa-bolt-runtime.mjs app/qa-bolt-cards.cjs
```

Les deux exécutions retournent 1, rendu/QR PASS et quatre captures en échec :

```text
page.evaluate: TypeError: Failed to execute 'addColorStop' on 'CanvasGradient': The provided double value is non-finite.
AssertionError [ERR_ASSERTION]: HD PNG export must work; failures are not waived by packaging QA
```

Même résultat pour `#ss-br`, `#ss-bv`, `#ss-cr`, `#ss-cv`, dans le studio
de l'application après ouverture de son espace de démonstration. Les mêmes erreurs
avaient été obtenues auparavant dans un conteneur de test isolé. Le code renderer,
CSS, images et bibliothèque de capture sont identiques entre les deux copies.
Le défaut est donc reproduit sur la base et n'est pas corrigé dans l'allègement.

## Limites conservées

- Aucun import réel Bolt ni mesure de sa stabilité ; l'historique Git n'est pas réduit.
- Aucun nouveau parcours SQL → HTTP réel. Les preuves A2/A5.0/A5.1 historiques
  sont conservées sans être présentées comme réexécutées.
- Installation bloquée : `02_student_list.sql` 42P13, setup natif 42501/RLS profiles ;
  rôles/provisioning/school_id et statut d'inscription à qualifier ; auth reset non qualifié.
- Deux contrôles statiques préexistants hors lot : DeviceHub, deux permissions ;
  isolation Cards/DeviceHub/Family, 20 détections. Conservés, non masqués, non rejoués ici.
- Aucun Docker réel, déploiement, R2/Control réel, voix/fournisseur JASPE réel,
  données d'enfant réelles ou validation globale de l'application.
- Scan final : 734 fichiers (595 textuels, 139 binaires), aucun motif sensible,
  aucun candidat de littéral ou métadonnée à examiner ; 18 littéraux historiques
  revus reconnus par empreinte. Contrôle par chemins/motifs seulement, valeurs
  jamais affichées ; les 14 exclusions de la base restent appliquées.

## Incidents d'outillage et de préparation des tests

Le contrôle final ad hoc de présence physique a retourné `Error: Excluded file present`
sur la commande PowerShell `@' ... '@ | node`, à l'assertion exacte
`if(exclusions.length)throw new Error('Excluded file present');`.
La vérification des chemins seuls identifie `debug.log`, apparu localement pendant
les QA. Son contenu n'a pas été lu. Il est ignoré par Git et absent de `files.txt` ;
le contrôle pertinent pour la publication vérifie les 14 exclusions contre la
sélection et les fichiers suivis. Aucun journal local n'est ajouté au lot.

Ces erreurs ne sont pas des résultats applicatifs. Leurs corrections ont porté
sur les chemins ou le nouveau harnais, sans modifier le produit :

```text
rg -n 'assets/|manifest|\.png|\.webp|\.webm|\.jpg' app/modules/jaspe2d app/modules/safe app/modules/cartes app/sw.js app/index.html scripts/qa-stable-auth.mjs
rg: app/modules/cartes: The system cannot find the file specified. (os error 2)

rg -n 'test\(|it\(|render|png|zip|manifest|qr|chromium|port|output|base' app/qa*card* app/modules/cards/card-renderer.js app/modules/cards/cards-module.js server/tests/cards* scripts -g '*card*' -g 'qa-jaspe*.cjs'
rg: app/qa*card*: The filename, directory name, or volume label syntax is incorrect. (os error 123)
rg: server/tests/cards*: The filename, directory name, or volume label syntax is incorrect. (os error 123)

rg -n 'zip|manifest|batch' server/src/cardsnative/routes.ts server/src/cardsnative/batch* server/src -g '*.ts'
rg: server/src/cardsnative/batch*: The filename, directory name, or volume label syntax is incorrect. (os error 123)

node ../../../node_modules/vitest/vitest.mjs run tests/cards-batch-preservation.test.ts tests/cards.test.ts tests/cardsnative-access.test.ts tests/control-authority.test.ts tests/jaspenative.test.ts
Error: Cannot find module 'C:\Users\PC\Pictures\medygooschoolsafe-v\node_modules\vitest\vitest.mjs'
code: MODULE_NOT_FOUND

git status --short
warning: unable to access 'C:\Users\PC/.config/git/ignore': Permission denied
```

Le Git local est appelé avec `-c safe.directory=` limité au worktree. La restriction
du fichier ignore n'a pas été masquée ; aucune configuration globale ni protection
du poste changée. Les premières versions des nouveaux tests avaient aussi un
champ erroné `p.v` au lieu de `p.value` (`page.evaluate: Event`) et un décompte
attendu de 32 au lieu des 33 poses réelles (`33 !== 32`). Corrigés dans les tests.
