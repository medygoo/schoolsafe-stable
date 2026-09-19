# Commandes en échec et limites d'outillage — 19/09/2026

Les messages ci-dessous sont conservés sans secrets. Un échec initial n'est pas
remplacé par un résultat supposé. Les alertes métier existantes n'ont pas été masquées.

- `git ls-remote origin refs/heads/main`, code 1 dans le sandbox :
  `fatal: unable to access 'https://github.com/medygoo/schoolsafe-v.git/': Failed to connect to github.com:443 after 151 ms: Could not connect to server`
  Relance autorisée en lecture seule : PASS, distant `62df2b16ceca2e609c1789eba44afbe6fe278e19`.
- `Get-Command docker,psql,python,exiftool -ErrorAction SilentlyContinue | Select-Object Name,Source` :
  code 1 ; seul docker.exe trouvé, aucun autre texte d'erreur.
- `docker version --format '{{.Client.Version}} {{if .Server}}{{.Server.Version}}{{end}}'` :
  `WARNING: Error loading config file: open C:\Users\PC\.docker\config.json: Access is denied.`
  puis `failed to connect to the docker API at npipe:////./pipe/docker_engine; check if the path is correct and if the daemon is running: open //./pipe/docker_engine: The system cannot find the file specified.`
  Relance autorisée, code 1, client 29.7.2 :
  `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`
  Aucune lecture du contenu de configuration, aucun démarrage/changement système.
- `rg -n 'login-kid|authImage|authImages' app/app.js app/sw.js app/modules app/qa*` :
  `rg: app/qa*: The filename, directory name, or volume label syntax is incorrect. (os error 123)`
  Recherche rejouée sur `app` avec des globs `--glob` valides.
- `& "$env:TEMP/schoolsafe-access-a2-pg/pgsql/bin/pg_isready.exe" -h 127.0.0.1 -p 55432 -d schoolsafe_access_test_519 -U schoolsafe_bootstrap` :
  `The term 'C:\Users\PC\AppData\Local\Temp/schoolsafe-access-a2-pg/pgsql/bin/pg_isready.exe' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.`
  Binaire absent ; connexion explicite via pg ensuite réussie sur le seul loopback de test.
- `rg -n '^\\|commit;|begin;' database/baseline/v1/*.sql --glob '*.sql'` :
  `rg: database/baseline/v1/*.sql: IO error for operation on database/baseline/v1/*.sql: The filename, directory name, or volume label syntax is incorrect. (os error 123)`
  Inspection ensuite faite sur les répertoires avec `--glob '*.sql'`.
- `rg -n 'auth-media|auth-image' app/styles/login-companion.css app/styles.css app/styles --glob '*.css'` :
  `rg: app/styles/login-companion.css: The system cannot find the file specified. (os error 2)`
  Chemin réel trouvé : `app/styles/modules/entree-visuel.css`, qui masque déjà auth-media.
- `node --test app/qa-session-denials.test.mjs` :
  `Could not find 'app/qa-session-denials.test.mjs'`
  Fichiers réels localisés ; `node app/qa-a51-session.cjs` (39/39) et
  `node app/qa-a51-targeted-denies.cjs` (13 assertions) ensuite PASS.
- `node --test scripts/stable-packaging.test.mjs` avant corrections : 3 échecs.
  `The input did not match the regular expression /WORKDIR \/app\/server/.`
  `shared/ is a runtime dependency`
  `ENOENT: no such file or directory, open 'C:\Users\PC\Pictures\medygooschoolsafe-v\database\installation\manifest.json'`
- `node database/installation/generate-manifest.mjs` première génération :
  `AssertionError [ERR_ASSERTION]: SQL missing from installation inventory`
  Diff : `database/auth/v1/03_auth_reset.sql` absent. Enregistré comme non qualifié,
  sans l'exécuter ni modifier son historique. Les deux tests dépendants ont alors
  également échoué pour cette absence ; génération et suites ensuite PASS.
- `node --test --test-name-pattern='workspace lock' scripts/stable-packaging.test.mjs` avant correction du verrou Docker :
  `The input did not match the regular expression /COPY package.json package-lock.json \.\//.`
  Le verrou racine cohérent est désormais utilisé ; test PASS.
- `node docs/migration/2026-09-19-stable-preparation/scan-selection.mjs` première passe :
  code 1, `findings: []`, 18 `credential-literal-review`, `metadataCandidates: []`.
  Contextes revus sans afficher les valeurs ; justifications et empreintes bornées
  dans `scan-reviewed-literals.json`. Nouvelle passe : zéro candidat non résolu.
- `node scripts/check-migration-versions.mjs --require-installable` : code 1 **attendu** :
  `INSTALLATION_BLOCKED: 02_student_list.sql and 01_setup_native.sql require additive fixes; 03_auth_reset.sql requires separate qualification.`
- Les sondes SQL attendent et vérifient leurs erreurs :
  `42P13 input parameters after one with a default value must also have defaults`
  et `42501 new row violates row-level security policy for table "profiles"`.
  Le runner de preuve termine avec code 0 car ces blocages attendus sont reproduits.
- Git signale encore par moments :
  `warning: unable to access 'C:\Users\PC/.config/git/ignore': Permission denied`
  Aucune protection ni configuration globale modifiée ; aucun `core.excludesFile=NUL`.
  `git diff --check` passe, avec avertissements habituels LF → CRLF.

Gitleaks était indisponible lors de l'arbitrage précédent ; aucune installation
ni nouvelle exécution de Gitleaks n'est revendiquée. Le scan actuel est celui
fourni dans ce dossier, sur la sélection exacte, sans affichage de valeurs.

La première invocation de
`node docs/migration/2026-09-19-stable-preparation/verify-stable.mjs .migration-staging/schoolsafe-stable`
a été lancée avant la fin du processus de copie :
`ENOENT: no such file or directory, open 'C:\Users\PC\Pictures\medygooschoolsafe-v\.migration-staging\schoolsafe-stable\docs\migration\2026-09-19-stable-preparation\final-files.json'`.
Attente de la fin réelle (code 0), puis relance PASS : 772 fichiers, 14 exclus,
607 textes et 165 binaires scannés ; aucun candidat non résolu.

## Publication develop/codex-base — 19 septembre 2026

- Commande initiale : git diff --cached --check ; code 1, diagnostics « trailing whitespace. » sur CRLF.
- Contrôle avec CRLF reconnus : git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --cached --check ; code 2.
  32 diagnostics « trailing whitespace. » et « server/src/authnative/routes.ts:173: new blank line at EOF. ».
  Les 33 lignes sont identiques au commit source 841d3efc54e7af62250b2980e450aa20ba5f2d40.
  Aucun nettoyage applicatif, aucune alerte masquée.
- git status --short --branch --untracked-files=no, échec également après élévation :
  fatal: detected dubious ownership in repository at 'C:/Users/PC/Pictures/medygooschoolsafe-v/.migration-staging/schoolsafe-stable'
  Propriétaire LOMS/CodexSandboxOffline ; compte courant LOMS/PC.
  Lecture réussie après demande d’autorisation avec -c safe.directory limité au chemin exact.
  Aucune configuration globale Git ni permission Windows modifiée.
- Commandes gh api repos/medygoo/schoolsafe-stable/hooks et gh api repos/medygoo/schoolsafe-stable/actions/workflows : code 1.
  Erreur exacte pour chacune :
  To get started with GitHub CLI, please run:  gh auth login
  Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.
  Ces échecs ne prouvent pas l’absence de déclencheur ; confirmation du propriétaire requise avant push.
- Script documentaire Node via here-string PowerShell : Error: Stop anchor missing.
  Arrêt avant toute écriture ; patch ciblé appliqué ensuite.
