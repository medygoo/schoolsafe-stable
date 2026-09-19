# A5.1 — raccordement et cohérence des refus ciblés

## 19 septembre 2026 — dernière revue et condition de publication

Revue limitée au diff A5.1, au complément `school`/`none`, aux tests, à 08
et aux manifestes : aucun défaut bloquant restant identifié. Aucun autre code
produit modifié lors de cette revue. Rejoués : `node app/qa-a51-session.cjs`
**39/39 PASS**, `node --test scripts/check-migration-versions.test.mjs`
**2/2 PASS**, `git diff --check` **PASS**. Les résultats SQL et navigateur du
complément ci-dessous sont conservés ; ils ne sont pas présentés comme rejoués
pendant cette dernière revue. Les deux alertes statiques restent hors lot.

Le propriétaire autorise le commit local des seuls fichiers A5.1 (code, tests,
migration, manifestes et reprise), et conditionne le push à l'absence garantie
de déploiement automatique. Les mentions antérieures « aucun commit/push »
décrivent les mandats historiques et ne remplacent pas cette autorisation.

Vérification distante effective : `git ls-remote --heads origin main` retourne
`62df2b16ceca2e609c1789eba44afbe6fe278e19 refs/heads/main`, identique au commit
local de départ. Aucun changement distant ni intégration nécessaire, aucun
écrasement. La première tentative dans le bac à sable avait échoué :
`fatal: unable to access 'https://github.com/medygoo/schoolsafe-v.git/': Failed to connect to github.com:443 after 77 ms: Could not connect to server`.
La relance avec autorisation de l'outil a fourni le SHA ci-dessus.

**Push suspendu conformément au mandat.** `ops/deployment/README.md` décrit
Git → Coolify → Docker → VPS, sans preuve du paramétrage effectif des
déclencheurs. `.github` est absent localement et dans l'arbre de départ ;
cette absence n'exclut pas un webhook ou une application GitHub. Les commandes
en lecture seule suivantes échouent toutes deux avec le même message :

```text
gh api repos/medygoo/schoolsafe-v/actions/workflows --jq '.workflows | map({name,path,state})'
gh api repos/medygoo/schoolsafe-v/hooks --jq 'map({id,active,events})'

To get started with GitHub CLI, please run:  gh auth login
Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.
```

Aucune authentification ou intégration modifiée. Pas d'accès VPS ni de lecture
de secrets. Aucun hook Git local actif constaté ; cela permet le commit local
mais ne prouve rien sur les déclencheurs distants. La recherche de fichiers
dans `.github` et `.codex` avait retourné
`The system cannot find the file specified. (os error 2)` pour ces chemins.

Reprise Bolt : vérifier les réglages effectifs GitHub/Coolify par un accès de
lecture autorisé, puis recontrôler le distant avant tout push sans force.
Sans cette preuve, conserver le commit local et la suspension. Les deux alertes
préexistantes (deux occurrences `school.settings.manage` et 20 détections
inter-écoles) sont un lot séparé, sans désactivation des contrôles. L'éditeur
complet et la recette exhaustive A5 restent distincts. Aucune validation de
toute l'application ou de la production n'est revendiquée.

## Historique — complément avant autorisation du commit local

## 19 septembre 2026 — correction résiduelle après revue finale

Mandat limité au DENY `school`/`none` avec `target` renseigné. Codex, `main`,
HEAD inchangé `62df2b16ceca2e609c1789eba44afbe6fe278e19`. Les travaux locaux
précédents sont conservés. Le bilan initial ci-dessous reste historique : il
ne couvrait pas ce cas et sa clôture a été réouverte par la revue.

### Régression et changement limité

Avant de corriger le produit, ajout d'une matrice **2 sources (rôle/exception)
× 2 portées (school/none) × 2 cibles (nulle/UUID de l'école)** :

- `node app/qa-a51-session.cjs` : **35 PASS / 4 FAIL**. Erreur exacte des
  quatre cibles renseignées : `General scope must remain a DENY even with a target`.
- `node scripts/qa-a51-live.mjs --sql-only` sur la base synthétique 519 :
  **32 PASS / 4 FAIL**. Le moteur SQL refusait déjà les deux élèves ; seule la
  projection échouait : `General DENY with target must remove descriptive ALLOW/scopes`,
  `true !== false`, puis `AssertionError [ERR_ASSERTION]: A5.1 SQL regression failures`.
- Les quatre cas à cible nulle passaient avant le correctif. Ces résultats
  isolent le défaut signalé en revue, sans nouvel audit général.

`app/modules/core/access.js:161` ne fait plus de `rule.target` une raison
d'exclure `school`/`none` des refus généraux. L'unité locale
`database/projections/v1/08_session_denial_contract.sql:61` ne requiert plus
`d.target_id is null`. C'est la sémantique existante de
`iam.scope_matches` (`database/baseline/v1/08_internal_functions.sql:289–292`).
La cible reste dans la donnée projetée ; conditions, dates, contexte école et
conjonction classe/matière sont conservés. Aucun moteur d'autorisation SQL
ni aucune migration historique modifiés.

Fichiers de cette seule reprise : helper et unité 08 ci-dessus ;
`app/qa-a51-session.cjs` ; `scripts/qa-a51-live.mjs` ;
`database/projections/v1/manifest.json` et `manifest.sha256`, régénérés par
`node database/projections/v1/scripts/generate-manifest.mjs` ; cette preuve,
`docs/CURRENT_HANDOFF.md` et le plan actif. Les autres changements locaux A5.1
préexistants n'ont pas été réécrits.

### Vérifications effectivement rejouées

Même base isolée **schoolsafe_access_test_519**, PostgreSQL 17.11 sur
**127.0.0.1:55432**, uniquement données synthétiques. Vérification préalable :
zéro école et zéro identité. Application explicite de **08 uniquement** avec
`psql -X -w -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55432 -U schoolsafe_bootstrap -d schoolsafe_access_test_519 -f database/projections/v1/08_session_denial_contract.sql`.
Le runner A2 qui réapplique 05 n'a pas été relancé.
Après nettoyage : **zéro école, zéro identité**, marqueur de 08 présent et
ancienne restriction `and d.target_id is null` absente de la fonction installée.
API, navigateur et aperçu de recette fermés ; PostgreSQL préexistant laissé intact.

| Commande / parcours | Résultat réel de la reprise |
| --- | --- |
| `node app/qa-a51-session.cjs` | **39/39 PASS** ; huit cas nouveaux, validation des cibles conservées, conditions/dates et conjonction de même origine ; une autre origine ne neutralise pas le DENY général |
| `node app/qa-a51-targeted-denies.cjs` | **13 assertions PASS** |
| `node scripts/test-session-validity-postgres.mjs` | **47/47 PASS A5.0**, sous 08 corrigée |
| `node --import tsx scripts/qa-a51-live.mjs` | **36/36 scénarios SQL PASS**, puis parcours réel HTTP/session/interface **PASS** |
| `node --test scripts/check-migration-versions.test.mjs` | **2/2 PASS**, 12 ensembles / 43 unités, sommes de contrôle régénérées |
| `node --check scripts/qa-a51-live.mjs` et `node --check app/modules/core/access.js` | **PASS** |
| `git diff --check` | **PASS** ; HEAD inchangé |

Les huit nouveaux scénarios SQL vérifient le refus moteur, la suppression des
ALLOW/portées descriptives et la conservation source/portée/cible. Chacun
vérifie aussi les conditions `academic_year_active` vraie/fausse puis les
refus futurs, expirés et révoqués. Les scénarios antérieurs rejoués couvrent
les portées contextuelles, la conjonction enseignant, l'absence d'ALLOW et
l'isolation de deux écoles. Réapplication transactionnelle de 08 : empreintes
des dix tables de fixtures inchangées avant/après.

Le navigateur réel (Chrome installé, 1440×1000) refait connexion, actualisation,
restauration, cible refusée, autre école et contournement de l'interface. Il
exécute ensuite les **huit combinaisons** avec SQL et HTTP natifs : HTTP 403,
égalité des règles HTTP/session après actualisation, permission refusée et
branche école absente ; puis révocation, HTTP 200, permission et branche
restaurées. Les seuls bootstrap substitués sont les deux cas historiques de
réponse ancienne/invalide, eux aussi PASS. Aucun rouge HTTP/UI n'est revendiqué
pour cette reprise : le rouge a été constaté par les tests frontend et SQL.

### Limites et suite

A2/A3, suites unitaires serveur/TypeScript, QA console mobile avec API substituée
et recette complète des sept écrans métier **non rejoués dans cette reprise**.
Leurs preuves antérieures ne sont pas présentées comme nouvelles. Aucun test
de production, déploiement ou mise à jour PWA déployée.

Les deux contrôles statiques préexistants restent **hors lot, non désactivés et
non rejoués**. La revue précédente avait comparé leurs règles, catalogue et
diagnostics au commit initial : deux occurrences `school.settings.manage`,
vingt détections sans `school_id`, identiques. Cette reprise reconfirme par
comparaison à ce commit que tests, catalogue et sept fichiers signalés sont
inchangés, tout comme 05/07, le moteur SQL, le service HTTP et les runners A2/A5.0.

Correctif résiduel terminé localement. Prochaine étape : revue finale de ce
complément et de ses preuves avant toute décision de livraison. L'éditeur
complet des exceptions/conditions individuelles, les cibles multiples dans
l'éditeur et la recette exhaustive A5 restent des travaux séparés à planifier.
Aucun commit, push, déploiement, VPS ou base réelle d'école dans cette reprise.

## Historique conservé — preuve initiale avant correction résiduelle

Preuve locale du 19 septembre 2026. Codex, branche `main`, départ
`62df2b16ceca2e609c1789eba44afbe6fe278e19`. Correctif écrit dans le dépôt après
vérification effective de l'écriture. Aucun commit, push, déploiement, accès VPS
ou base d'école. Aucun changement de fournisseur, de configuration système ou
d'installation. Les décisions Docker + Coolify et la séparation Control restent
inchangées. Ce document ne valide ni A5 complet ni la production.

## Contrat et fichiers

Le bootstrap décrit les capacités de navigation dans l'école active. Chaque
opération reste autorisée par le serveur et ACCESS_LAW. Un DENY ciblé ou
conditionnel conserve la permission ALLOW et ses portées descriptives ; un DENY
inconditionnel général applicable retire cette permission dans cette école.

- `database/projections/v1/08_session_denial_contract.sql` : nouvelle unité
  additive. Conserve les projections positives face aux refus ciblés/conditionnels,
  borne les dates par l'intersection rôle/grant/portée ou exception/portée et
  corrige l'alias inexistant `es.profile_id` de 07 par `e.profile_id`. Aucun DDL
  de table, aucune réécriture des unités historiques 05/07.
- `database/projections/v1/scripts/generate-manifest.mjs`, `manifest.json`,
  `manifest.sha256` : ajout final de 08 et génération par le mécanisme existant.
  `scripts/check-migration-versions.test.mjs` : total actuel 12 ensembles / 43
  unités, incluant DeviceHub déjà présent avant le lot.
- `app/app.js` : `applyBootstrap` conserve la structure des refus. Champ absent :
  ancien protocole, refus plats conservés ; `[]` : tableau vide explicite ;
  données invalides : session effacée et erreur 401. La console se ferme aussi
  lors de cette invalidation locale, sans supprimer ses contrôles de concurrence.
- `app/modules/core/access.js` : réutilise les helpers existants, valide leur
  entrée et les aligne sur les huit portées et huit codes de condition SQL.
  `school`/`none` sont généraux dans le contexte actif. Le couple enseignant
  `assigned_classes` ET `assigned_subjects` reste contextuel même si le même
  grant contient `school`. Les conditions sont transmises, jamais réévaluées
  dans un second moteur frontend. Dates futures/expirées exclues des refus
  courants. Sans ALLOW, aucun accès ; refus ancien inexpliqué conservé.
- `app/modules/parent/parent-portal-demo.js`,
  `app/modules/pedagogy/palmares-module.js`,
  `app/modules/school/{school-module,academic-structure-demo,student-dossier-demo,student-card-preparation-demo,student-lifecycle-demo}.js` :
  sept contrôles locaux délèguent d'abord `explicitDeny` au moteur central ; le
  repli prudent subsiste si le moteur manque. Contrôles serveur inchangés.
- `app/qa-a51-session.cjs`, `app/qa-a51-targeted-denies.cjs`,
  `server/tests/sessionnative.test.ts`, `scripts/qa-a51-live.mjs` : régressions
  persistées et preuves distinctes des couches.
- `app/sw.js`, `app/qa-responsive-visual-system.cjs` : version de cache A5.1 et
  assertion associée, pour charger les modules corrigés lors d'une mise à jour.
- `docs/CURRENT_HANDOFF.md`, plan actif et présente preuve : reprise datée,
  limites et consignes obsolètes explicites ; historique conservé.

## Chemin effectivement lu

Références dans l'arbre final, sans prétendre recréer un service déjà présent :

| Couche | Chemins / lignes lus | Conclusion |
| --- | --- | --- |
| Autorité SQL | `database/baseline/v1/08_internal_functions.sql:267–568` ; `09_api_rpc.sql:6–28` | Portées canoniques, conjonction enseignant et contexte école ; inchangés |
| Projection | `database/projections/v1/08_session_denial_contract.sql:1–120` | ALLOW séparé des refus généraux ; `deniedRules` détaillé |
| Service | `server/src/sessionnative/service.ts:7–49` ; `routes.ts:18–28` | Type déjà existant, JSON DB transmis tel quel sous contexte authentifié |
| Client | `app/modules/authnative/auth-native.js:16–33,57–58` | JSON intact après HTTP avec cookie |
| Compte | `app/app.js:173–216,400–405` | Conservation après connexion, actualisation et restauration ; copie vers l'utilisateur courant |
| Moteur UI | `app/modules/core/access.js:125–192,254–261` | Validation et distinction global/contextuel ; ALLOW requis |
| Contrôles locaux | Parent `:191`, Palmares `:63`, School `:123`, Structure `:35`, Dossier `:32`, Carte `:13`, Lifecycle `:39` dans les fichiers listés ci-dessus | Plus de veto plat avant le moteur central |
| Invalidation UI | `app/app.js:3189–3202` | Fermeture de la console après projection invalide ; garde de révision conservée |

## Régressions observées avant correction

1. `node app/qa-a51-session.cjs` : **22 échecs / 31 cas** avant changement
   applicatif. Perte du champ à la connexion/actualisation, données invalides
   acceptées, `school`/`none` mal classés, sept veto locaux trop larges.
2. `node scripts/qa-a51-live.mjs --sql-only --allow-old-projection` sur 07 :
   **13 échecs**, `column es.profile_id does not exist`. Sur 08 préparatoire
   avec uniquement l'alias réparé : **4 échecs / 13** — ALLOW/scopes effacés
   par le refus ciblé, condition vraie et fausse, fin de portée absente.
3. `node --import tsx scripts/qa-a51-live.mjs` : après les premiers correctifs,
   `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
   true !== false` (ancienne ligne 183) : console visible après réponse invalide.
   Correction de l'invalidation locale, puis parcours complet PASS.

## Résultats réels finaux

Base **nouvelle et exclusivement synthétique** `schoolsafe_access_test_519`,
PostgreSQL 17.11 sur **127.0.0.1:55432**, compte de test
`schoolsafe_bootstrap`. Aucune donnée d'école réelle. Le serveur PostgreSQL
était déjà lancé ; il n'a pas été arrêté ni sa protection modifiée.
Contrôle après nettoyage : **0 école, 0 identité**, projection finale 08
confirmée. L'API et le navigateur de recette sont fermés.

| Vérification | Résultat / nature de la preuve |
| --- | --- |
| `node app/qa-a51-session.cjs` | **31/31 PASS**, fonctions réelles avec substituts DOM/stockage |
| `node app/qa-a51-targeted-denies.cjs` | **13 assertions PASS**, objets synthétiques canoniques |
| `scripts/test-access-postgres.mjs` | Installation initiale de 26 unités et preuves A2/A3 **PASS** ; runner historique intact |
| `node scripts/test-session-validity-postgres.mjs` | **47/47 PASS A5.0**, SQL réel sous projection 08 |
| `node scripts/qa-a51-live.mjs --sql-only` | **28/28 PASS A5.1**, SQL réel + réapplication 08 sans changement des dix tables de fixtures contrôlées |
| `node --import tsx scripts/qa-a51-live.mjs` | **PASS SQL → HTTP → connexion → compte → navigation/console**, Chrome réel, API native réelle et PostgreSQL réel |
| Tests serveur `sessionnative`, `auth-session`, `native-access-contract` | **3 fichiers / 11 tests PASS**, substituts SQL/auth explicitement distincts de la recette réelle |
| `npm.cmd run typecheck` | **PASS** |
| `node --test scripts/check-migration-versions.test.mjs` | **2/2 PASS**, sommes de contrôle cohérentes, 12 ensembles / 43 unités |
| QA console native existante | **PASS**, API substituée : mobile, droits, reprise, réponse tardive, expiration, changement d'école, zéro écriture métier |
| `node app/qa-safe-assistant-access.cjs` ; `node app/qa-responsive-visual-system.cjs` | **PASS**, contrats source |

Les 28 cas SQL couvrent `school`, `none`, `own`, `own_children`,
`assigned_classes`, `assigned_subjects`, `assigned_portal`,
`assigned_fee_classes` ; DENY de rôle et d'exception ; condition
`academic_year_active` satisfaite/non satisfaite ; refus futurs/expirés/révoqués ;
absence d'ALLOW ; absence d'héritage entre écoles ; ALLOW indépendant dans
l'école B malgré le DENY général de l'école A. A5.0 complète les états/dates
des affectations de rôles et des rattachements.

Le navigateur vérifie l'égalité des règles HTTP et du compte après connexion
et actualisation, l'affichage/masquage de la branche école, une action permise
HTTP 200, la cible interdite HTTP 403, le profil d'une autre école HTTP 404,
les conditions vraie/fausse, une interface périmée contournée mais refusée
par le serveur, la révocation et le rechargement. **Seuls les deux cas de
réponse ancienne/invalide substituent le bootstrap** ; ils vérifient le
repli prudent et la fermeture effective. Les sept contrôles locaux sont
couverts par tests de fonctions ; chaque écran métier n'a pas fait l'objet
d'un parcours navigateur distinct.

## Reproduction et ordre des migrations

Sur une nouvelle base locale vide explicitement désignée, installer les unités
avec le runner A2 existant. **Il réapplique 05 après le manifeste.** Appliquer
ensuite explicitement `database/projections/v1/08_session_denial_contract.sql`
avec `psql -X -w -v ON_ERROR_STOP=1 -f ...` sur cette base uniquement. Exécuter
A5.0, puis A5.1. Ne pas relancer A2 après 08 pour une preuve A5.1.

La recette A5.1 exige le marqueur `A51_CURRENT_PROJECTION` dans la fonction
installée, puis ne rejoue que 08 dans la transaction de preuve annulée. Le
paramètre `--allow-old-projection` a servi exclusivement à la reproduction
rouge ; ne pas l'utiliser pour la validation finale.

Pour la recette réalisée : `SCHOOLSAFE_ACCESS_TEST_URL` désigne
`postgresql://schoolsafe_bootstrap@127.0.0.1:55432/schoolsafe_access_test_519`.
Lancer `node app/server.mjs --port 4176 --host 127.0.0.1`, puis
`node --import tsx scripts/qa-a51-live.mjs`. Le script refuse toute école déjà
présente, compare le module servi au fichier local, crée une identité
synthétique à mot de passe éphémère non affiché, démarre l'API sur 8787 (échec
si occupé), ferme API/navigateur et nettoie uniquement ses fixtures. Chrome
installé est utilisé, aucun téléchargement de navigateur. Le test de console
historique a également été lancé avec `chromium.launch` configuré pour le
canal `chrome` dans ce seul processus, sans modifier son fichier.

## Limites et erreurs d'outillage

- Contrôles larges lancés par
  `node --test scripts/check-migration-versions.test.mjs scripts/permission-contract.test.mjs scripts/cross-school-static.test.mjs` :
  **4 PASS / 2 FAIL**. `permission-contract` signale exactement
  `database/devicehub/v1/02_devicehub_rpc.sql:38 school.settings.manage` et
  `database/devicehub/v1/02_devicehub_rpc.sql:202 school.settings.manage`.
  `cross-school-static` échoue avec `requêtes métier sans school_id :` sur
  20 détections dans Cards lifecycle, DeviceHub attendance et les quatre unités
  Family. Ces sept fichiers sont comparés à `git show HEAD:<chemin>` et
  **identiques à HEAD**. Pas de correction hors lot, pas de qualification
  hâtive en faux positifs, pas de déclaration « CI complète verte ».
- `node --import tsx scripts/qa-a51-live.mjs` dans le bac à sable :
  `SystemError [ERR_SYSTEM_ERROR]: A system error occurred: uv_os_get_passwd returned ENOMEM (not enough memory)`.
  Relance avec autorisation de l'outil, sans modifier les protections du poste.
- Première recette complète, nettoyage :
  `update or delete on table "identities" violates foreign key constraint "credentials_identity_id_fkey" on table "credentials"`.
  Nettoyage corrigé dans le runner, réparation limitée aux deux écoles
  synthétiques connues de la base 519, puis relances nettoyées avec succès.
- Relance intermédiaire : `locator.click: Timeout 15000ms exceeded.` sur
  `#permissionsNav` invisible après rechargement. La recette ouvre maintenant
  l'espace restauré avant le clic ; aucun changement produit pour ce point.
- `git --no-optional-locks -c core.fsmonitor=false status --short` :
  `warning: unable to access 'C:\Users\PC/.config/git/ignore': Permission denied`.
  Aucun contournement par `core.excludesFile=NUL` ni configuration globale.
- Des lectures sur chemins supposés ont échoué puis ont été reprises sur les
  chemins constatés : `rg` sur `database/base/v1`, `database/iam/v1`
  (`The system cannot find the path specified. (os error 3)`),
  `database/projections/v1/01_read_access.sql`, `database/schema.sql`,
  `database/baseline/v1/05_iam_catalog.sql`, `app/qa-native-account.cjs`
  (`The system cannot find the file specified. (os error 2)`) ;
  `rg ... database/baseline/v1/10*` (`The filename, directory name, or volume label syntax is incorrect. (os error 123)`) ;
  `Get-Content -LiteralPath app/modules/core/auth-native.js -Encoding utf8`
  (`Cannot find path 'app/modules/core/auth-native.js' because it does not exist.`).

L'éditeur d'exceptions, la recette exhaustive de toutes les conditions métier,
la mise à jour PWA en situation déployée et la validation de production restent
hors preuve. L'horloge du navigateur ne fait que filtrer les métadonnées ; le
serveur décide toujours. Un nouveau code de condition/portée nécessite une
mise à jour du contrat frontend : une projection inconnue est refusée.

## Reprise exacte

Lot A5.1 ciblé terminé localement, sans publication. Relire le diff et cette
preuve ; réserver séparément le traitement des deux contrôles statiques
préexistants avant toute recette globale ou livraison. Ne pas reconstruire
`deniedRules`, ne pas lancer l'éditeur complet ni une ancienne reprise visuelle
dans ce lot. Toute publication attend une nouvelle instruction du propriétaire.
