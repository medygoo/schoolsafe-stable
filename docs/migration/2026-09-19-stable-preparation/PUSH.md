# Publication autorisée — develop/codex-base uniquement

Instruction du propriétaire du 19 septembre 2026 : publier les 772 fichiers
préparés comme base de développement dans `medygoo/schoolsafe-stable`, branche
`develop/codex-base`, vérifier le SHA distant et l'existence de la branche,
puis arrêter. Aucun push sur main, aucun déploiement ni accès au VPS.

Le dépôt distant était vide lors de la vérification précédant ce lot. La CLI
GitHub n'est pas authentifiée pour lire hooks/workflows ; ces échecs ne prouvent
pas l'absence d'automatisation. Respecter la condition de non-déploiement avant
l'action finale, sans modifier une protection ou extraire des credentials.

Commandes actives, depuis la copie (indexer seulement la liste validée ; conserver
les octets exacts avec une option Git par commande, aucune configuration globale) :

```powershell
node docs/migration/2026-09-19-stable-preparation/verify-stable.mjs
git -c core.autocrlf=false add --pathspec-from-file=docs/migration/2026-09-19-stable-preparation/final-files.txt
git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --cached --check
git commit -m 'chore: publish validated SchoolSafe development base'
git push --set-upstream origin HEAD:refs/heads/develop/codex-base
git rev-parse HEAD
git ls-remote origin refs/heads/develop/codex-base
```

Vérification du 19 septembre : index de 772 chemins, chacun identique octet par
octet à la sélection. Le contrôle de mise en forme avec CRLF reconnus retourne
2 : 33 alertes, toutes présentes aux mêmes lignes du commit source
`841d3efc54e7af62250b2980e450aa20ba5f2d40` (jsPDF, SafeAssistant, CSS dashboard,
SDK Supabase et ligne vide finale authnative/routes). Aucun nettoyage de ces
fichiers n'est inclus dans la publication. Ce contrôle n'est pas déclaré réussi.

Arrêter sur toute erreur non expliquée, divergence ou preuve de déploiement automatique.
Ne jamais utiliser de force push. Les défauts SQL et l'absence de build Docker
réel restent dans le handoff ; la publication ne valide pas la production.

## Historique remplacé — commandes de préparation, ne pas exécuter la cible main

La préparation actuelle n'autorise aucun push. La destination a répondu sans
référence à `git ls-remote https://github.com/medygoo/schoolsafe-stable.git HEAD refs/heads/main`
le 19/09/2026. Ce résultat n'est pas une preuve d'absence d'automatisation.

Avant une nouvelle autorisation de publication, vérifier en lecture les Actions,
webhooks, applications GitHub et le réglage effectif Coolify de ce **nouveau** dépôt.
L'absence de `.github/` ne suffit pas. Si l'absence de déploiement automatique
ne peut pas être garantie, arrêter avant push. Aucune désactivation de protection,
configuration globale Git, clé ou configuration fournisseur pour contourner ce point.

Préconditions : validation du manifeste final et de ses limites par le propriétaire,
preuve de non-déploiement, authentification Git disponible, destination toujours vide.
Le nom de branche prévu est `main`. Aucun historique `.git` de l'ancien dépôt ne
sera transféré ; il reste conservé dans sa source.

```powershell
Set-Location 'C:\Users\PC\Pictures\medygooschoolsafe-v\.migration-staging\schoolsafe-stable'
node docs/migration/2026-09-19-stable-preparation/verify-stable.mjs
if ($LASTEXITCODE -ne 0) { throw 'La copie ne correspond plus au manifeste.' }
git remote get-url origin
# Doit être exactement https://github.com/medygoo/schoolsafe-stable.git
$stableRemoteRefs = @(git ls-remote origin)
if ($LASTEXITCODE -ne 0) { throw 'Lecture distante impossible.' }
if ($stableRemoteRefs.Count -ne 0) { throw 'Destination non vide : revue requise, aucun écrasement.' }
git add --pathspec-from-file=docs/migration/2026-09-19-stable-preparation/final-files.txt
if ($LASTEXITCODE -ne 0) { throw 'Ajout de la sélection échoué.' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Diff à corriger.' }
git diff --cached --stat
# Revoir la liste indexée contre final-files.txt, puis seulement :
git commit -m 'chore: prepare SchoolSafe stable from validated source'
if ($LASTEXITCODE -ne 0) { throw 'Commit échoué.' }
$stableLocalSha = git rev-parse HEAD
git push --set-upstream origin main
if ($LASTEXITCODE -ne 0) { throw 'Push échoué : ne pas annoncer une publication.' }
$stableRemoteLine = git ls-remote origin refs/heads/main
if ($LASTEXITCODE -ne 0) { throw 'Vérification distante échouée.' }
$stableRemoteSha = ($stableRemoteLine -split '\s+')[0]
if ($stableRemoteSha -ne $stableLocalSha) { throw 'SHA local/distant différents.' }
Write-Output "main $stableRemoteSha"
```

Aucun `--force`, aucune migration SQL et aucun déploiement dans cette séquence.
Le build Docker réel et l'installation globale restent non qualifiés ; une
publication de sources ne vaut pas autorisation d'exploitation.
