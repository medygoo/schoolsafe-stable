# SCHOOLSAFE_DIRECT_VPS_REPORT

Mise a jour : 20 septembre 2026. Cible : prodeli-hub-01 / 179.198.195.15.
Reprise limitee au code SchoolSafe : les validations d'infrastructure anterieures
ci-dessous sont conservees, sans nouvel audit ni reinstallation.

## Infrastructure et architecture conservees

- Ubuntu 24.04.4 LTS, Docker Engine 29.7.2, Compose 5.5.0, Caddy 2.11.4.
- Coolify et Easypanel absents, Swarm inactive. Docker et Caddy activent au boot.
- Projet Compose schoolsafe : /opt/schoolsafe, schoolsafe-db preparee et vide,
  reseau schoolsafe-net, volume schoolsafe_pgdata. Application NON DEPLOYEE.
- Projet schoolsafe-control : /opt/schoolsafe-control, control-db + control-app,
  reseau control-net, volume control_pgdata. Aucun credential DB croise.
- PostgreSQL 17.11-bookworm pour les deux bases. Aucun port 5432 publie.
- Control publie uniquement 127.0.0.1:10000 ; aucun port 8787 actuellement.
- UFW : entree refusee par defaut, SSH 22/TCP, Caddy 80/TCP et 443/TCP+UDP.
- Caddy est l'unique entree HTTP/HTTPS publique.
- URL Control : https://control.179-198-195-15.sslip.io/
- URL SchoolSafe temporaire reservee : schoolsafe.179-198-195-15.sslip.io ;
  aucun service SchoolSafe principal n'est annonce comme accessible.

## Control ? preuves anterieures conservees

Depot medygoo/schoolsafe-control-, production.
SHA deploye et source auditee : cb4257d7d70b6662f8106d9f6241751610e07258.
Node 22.23.2, npm ci/typecheck/build PASS, 9 tests PASS, HTTP/HTTPS PASS et TLS
public valide. Tables : instances, card_print_requests, admin_sessions,
card_print_batches, devices. Role control_app sans SUPERUSER ni BYPASSRLS.
Aucune nouvelle modification ni repetition des tests du service Control deploye.

## SchoolSafe ? acces, branche et correction

- Depot medygoo/schoolsafe-stable, production clonee au SHA
  7d5cc89924319eb9c46d8a5a9cd0f3f729743834 avec la Deploy Key read-only validee.
- /opt/schoolsafe/repo conserve propre sur production ; aucun push depuis VPS.
- Workspace : C:/tmp/schoolsafe-installation-20260920/repo.
- Branche locale : codex/schoolsafe-installation-v2.
- Commit d'implementation qualifie : ee57304883d2d370aaa17ea53bfecffa27f1a8d3.
- PR : NON OUVERTE ; authentification GitHub operateur indisponible.
- SQL v1 et SHA historiques intacts, 6 remplacements explicites en v2.
- Corrections : student_list/draft, setup atomique ecole/admin, admin scope school_id,
  reset atomique avec expiration et revocation sessions, signature finance,
  privileges/schema Device Hub, FORCE RLS des tables post-baseline.
- Installateur scripts/install-school-db.mjs : URL/base explicites, check/dry-run,
  SHA256/ordre, refus d'une base non prevue, transaction atomique, ledger prive,
  aucun DROP DATABASE automatique. Rejeu identique sans mutation.
- Six roles crees/configures par SQL versionne : schoolsafe_owner, migrator, api,
  worker, auditor, auth. Aucun role SchoolSafe superuser/BYPASSRLS ; aucun acces
  direct aux tables metier pour schoolsafe_api ou schoolsafe_auth.

## Preuves de qualification locales

| Controle | Resultat |
|---|---|
| npm ci | PASS |
| Manifests historiques | PASS : 12 ensembles / 43 unites |
| --require-installable | PASS, exit 0 : plan v2 / 48 unites |
| Typecheck | PASS |
| Tests applicatifs | PASS : 59 fichiers / 363 tests |
| Permission checks | PASS : 3 tests, catalogue canonique |
| Tests installateur | PASS : 4 tests de cible, dry-run, checksum et transactions |
| Installation from-zero | PASS : PostgreSQL 17.11, 48 unites, DB locale jetable |
| Echec tardif / rollback | PASS : aucune installation partielle |
| Rejeu identique | PASS : no-op |
| RLS PostgreSQL reel | PASS : 6 suites |
| Scenarios setup/auth/student/device | PASS : 44, deux ecoles synthetiques |
| Contrat HMAC cross-repo | PASS : 3 vecteurs contre le code Control reel |
| Docker Linux build | PASS : image de qualification seule, aucun conteneur app lance |
| SQL historiques inchanges | PASS |
| Scan des fichiers modifies | PASS : credentials generes et patterns de cles/tokens absents |

Cluster local neuf 17.11, ecoute 127.0.0.1:55439, aucune DB de production utilisee.
Preuve finale : schoolsafe_test_from_zero_v2_08, journal from-zero-final.log.
Les fixtures sont synthetiques. Les tests RLS couvrent notamment school_id,
parents/own_children, paires classe/matiere, affectation de roles et refus sans
contexte. Les tests v2 couvrent setup, sessions, expiration/rejeu/reset concurrent,
appareils A/B, mauvais mapping, desactivation, cles composites et roles SQL.

Build effectue dans un contexte de test distinct, cree depuis le SHA de base
identique et l'archive des modifications locales. Aucun code de production edite.
Image : schoolsafe-installation-v2:qualification.
Digest obtenu : sha256:14d00f150a2e9c0235101c00311c52025162724cc315abdcda19bed8982f91b8.
La tentative initiale via Docker SSH a echoue au transfert du contexte ; le build
local au daemon sur le contexte de test a ensuite termine avec exit 0.

## HMAC, licence et Device Hub

- HMAC HTTP canonique : x-schoolsafe-instance/timestamp/signature, SHA256 sur
  methode, chemin avec query, UNIX secondes et JSON compact. Fenetre 300 secondes.
- Client licence aligne ; verification Ed25519 et school_id conservee. Absence
  de cle publique => routes metier fermees. Aucune cle privee creee pour SchoolSafe.
- Liaison machine deterministe en DB : instance + UUID appareil + ecole + principal
  scope explicitement autorise hors ligne. Jamais premiere/derniere ecole.
- Le client ne peut pas imposer school_id. Revocation et cles inter-ecoles testees.
- Control reste incomplet pour la recette metier : endpoint /api/license/state
  absent, validation HMAC moins stricte, registre instance/ecoles autorisees et
  livraison sortante des evenements Device Hub restant a qualifier/implementer.
- Les mappings staff ne sont pas qualifies et sont refuses. Aucun flux licence
  de production ni livraison Control vers SchoolSafe n'est declare valide.

## GitHub et deploiement

CI preparee dans .github/workflows/ci.yml : npm ci, npm run ci, vrai PostgreSQL
17.11 jetable/RLS/rollback, comparaison Control et Docker build. Declencheurs PR
vers production ou manuel. Aucun secret production utilise en CI.
Workflow deploy-manual.yml : workflow_dispatch uniquement, variable d'activation
absente, environnement production et SHA explicite. Aucun deploiement automatique.
Les checks GitHub ne sont PAS encore executes, faute de publication.
Scripts VPS restreints et schoolsafe-deploy conserves ; approved-production-sha
SchoolSafe reste absent. Aucune connexion production donnee a ERNEST.
Aucun merge, aucune installation SQL dans la vraie base, aucun deploiement app.

## Secrets, sauvegardes et ERNEST

- Secrets production uniquement dans leurs emplacements proteges existants ;
  .env root 600. Aucun mot de passe, token, URL secrete ou cle privee dans Git/rapport.
- Credentials du cluster de test hors Git, dans un dossier operateur a ACL restreinte.
- Backups pg_dump distincts et restauration PostgreSQL jetable : PASS anterieur.
  Copie hors VPS verifiee sur le poste operateur ; tests non recommences.
- R2 non configure, planification/retention distante restant a etablir. Prefixes
  futurs distincts schoolsafe/postgres/ et schoolsafe-control/postgres/.
- Redemarrage reel VPS et persistance : PASS anterieur, pas de nouveau reboot.
- ERNEST/Contabo 185.207.250.178 non contacte ni modifie dans cette reprise.

## Action humaine unique pour publier

Sur le poste Codex, executer gh auth login --hostname github.com --git-protocol
https --web avec un compte autorise en ecriture sur medygoo/schoolsafe-stable.
Ne pas transmettre de token dans la conversation. La Deploy Key VPS reste read-only.
Apres authentification : pousser uniquement la branche Codex, ouvrir la PR vers
production, observer la CI et s'arreter. Aucun merge/deploiement autorise.

| COMPOSANT | ETAT | PREUVE | BLOQUANT |
|---|---|---|---|
| Docker / Compose / Caddy | OK conserve | Validations anterieures et reboot | Non |
| Coolify / Easypanel | Absents | Audit anterieur | Non |
| Control technique | PASS conserve | SHA, 9 tests, 5 tables, HTTPS | Non pour cette reprise SQL |
| SchoolSafe SQL v2 | PASS local | 48 unites, rollback, 6 suites RLS, 44 scenarios | Revue/merge requis |
| SchoolSafe tests / build | PASS | 363 tests, permissions, typecheck, Docker | CI GitHub a executer |
| Isolation / roles | PASS sur cas qualifies | RLS, deux ecoles, no SUPERUSER/BYPASSRLS | Pas de qualification metier exhaustive |
| HMAC HTTP | Format aligne | 3 vecteurs cross-repo | Durcissement Control restant |
| Licence / livraison Device Hub | Incomplet cote Control | Audit source au SHA indique | Oui avant recette metier complete |
| Branche / PR | Commit local, PR absente | SHA d'implementation ci-dessus | Authentification GitHub operateur |
| SchoolSafe production | NON DEPLOYEE | Aucune operation de deploiement effectuee | Ordre humain requis |
| Backups | Restore PASS, copie hors VPS | Preuves anterieures | R2 automatique restant |
| ERNEST | Inchange | Aucune intervention Contabo | Worker hors reprise actuelle |
