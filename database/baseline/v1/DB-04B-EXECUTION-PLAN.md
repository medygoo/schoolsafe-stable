# DB-04B — plan exact de revue et d'exécution future

## État de ce lot

La baseline est **préparée hors ligne et non appliquée**. DB-04B ne se connecte
ni au VPS, ni à Supabase Cloud. Aucune base, aucun rôle et aucun conteneur ne
sont modifiés par ce lot.

## Contrat cible verrouillé

- Cible future unique : conteneur `schoolsafe-postgres-test`, base vide
  `schoolsafe_test`, PostgreSQL `17.11`.
- Réseau : `schoolsafe-test-internal`; aucun mapping du port `5432`.
- Schémas : `app`, `iam`, `audit`, `ops`, `api`, `legacy_cloud` et `auth`.
- `auth` reste vide : le fournisseur et la migration Auth sont hors baseline.
- Identité runtime : quatre paramètres transactionnels, installés par le
  backend après authentification vérifiée :
  `schoolsafe.user_id`, `schoolsafe.profile_id`, `schoolsafe.school_id`,
  `schoolsafe.request_id`.
- Aucun rôle applicatif `BYPASSRLS`; RLS forcée sur les tables tenant-aware.
- Le rôle backend n'a aucun privilège direct sur les tables : fonctions `api`
  seulement.
- Catalogue figé : 60 permissions et sept scopes canoniques.
- Enseignant : une affectation active exacte `(classe, matière)` est exigée ;
  une classe seule ou une matière seule ne suffit pas.
- Un `DENY` actif de rôle ou d'exception est évalué avant tout `ALLOW`.
- Les huit RPC P0 dérivent l'acteur et l'école du contexte transactionnel.

## Diff fonctionnel préparé

| Unité | Contenu | Contrôle d'idempotence |
|---|---|---|
| 01 | cinq rôles SQL isolés | création conditionnelle + `ALTER ROLE` déterministe |
| 02 | sept schémas et privilèges par défaut | `IF NOT EXISTS`, révocations répétables |
| 03 | contrat PostgreSQL 17.11 + extension `pg_stat_statements` protégée | garde préchargement + `CREATE EXTENSION IF NOT EXISTS` |
| 04 | modèle métier from-zero | `CREATE TABLE IF NOT EXISTS` |
| 05 | IAM / Access_Law | `CREATE TABLE IF NOT EXISTS` |
| 06 | audit append-only / opérations | `CREATE TABLE IF NOT EXISTS` |
| 07 | contraintes et index | contrôle `pg_constraint` + index conditionnels |
| 08 | contexte et fonctions internes | `CREATE OR REPLACE FUNCTION` |
| 09 | surface API et huit RPC P0 | `CREATE OR REPLACE FUNCTION` |
| 10 | triggers d'intégrité et d'audit | fonctions remplacées, triggers recréés |
| 11 | RLS forcée et ACL minimales | policies recréées, grants déterministes |
| 12 | 60 permissions / sept scopes | upsert canonique + assertions de cardinalité |
| 13 | assertions finales fail-closed | vérification pure |

Chaque fichier SQL est transactionnel (`ON_ERROR_STOP`, `BEGIN`, `COMMIT`). Le
manifeste ordonné associe un SHA-256 à chaque unité. `ops.schema_versions`
refuse qu'un même numéro d'unité soit réenregistré avec un checksum différent.

## Séquence future proposée — non autorisée par DB-04B

1. Revalider le nom du conteneur, la base, PostgreSQL 17.11, le réseau isolé et
   l'absence de publication de `5432`.
2. Refuser avant l'unité 01 si `pg_stat_statements` n'est pas préchargé, si
   `compute_query_id` n'est ni `auto` ni `on`, ou si l'extension est absente de
   l'image.
3. Refuser l'exécution si un des sept schémas SchoolSafe existe déjà.
4. Vérifier les 13 checksums avec `sha256sum --check --strict`.
5. Appliquer 01 à 08 ; enregistrer leurs versions/checksums.
6. Appliquer 09 à 12 et enregistrer chaque version/checksum.
7. Appliquer 13 avec 12 versions présentes, enregistrer 13, puis réappliquer 13.
8. Réappliquer les 13 unités et leurs versions pour prouver l'idempotence.
9. Exécuter le test Access_Law avec données synthétiques `.invalid` dans une
   transaction intégralement annulée par `ROLLBACK`.
10. Vérifier les 13 lignes de `ops.schema_versions` et conserver la sortie
   d'exécution hors Git, sans secret.

Cette séquence est codifiée dans `scripts/run-from-zero-test.sh`. Elle nécessite
le jeton explicite `APPLY_SCHOOLSAFE_TEST_FROM_ZERO` et ne contient aucune voie
PROD. Elle ne doit être lancée qu'après un nouveau GO d'application.

## Tests de revue disponibles maintenant

- `tests/static-contract.test.mjs` : ordre, contexte PostgreSQL, interdits
  Supabase, rôles, 60/7, huit RPC P0, règle enseignant ET, RLS/ACL, checksums.
- `tests/from-zero-access-law.test.sql` : School A/B/C, default DENY,
  combinaison exacte classe-matière, scénarios OR refusés, DENY prioritaire,
  enfant lié/non lié, RLS de lecture, contexte incohérent et RPC cross-school.
  Ce test n'est pas exécuté pendant DB-04B.

## Risques et traitement

| Risque | Traitement avant application |
|---|---|
| Version ou cible incorrecte | préflight bloquant, noms exacts et version `170011` |
| Base non vide | refus dès qu'un schéma SchoolSafe existe |
| Dérive des fichiers | manifeste SHA-256 et registre immuable |
| Contournement RLS | rôles `NOBYPASSRLS`, `FORCE ROW LEVEL SECURITY`, API sans tables |
| Usurpation acteur/école | contexte complet validé contre utilisateur/profil actifs |
| Fuite inter-école | clés d'école, triggers de cohérence, policies tenant |
| Enseignant autorisé par un OR | affectation exacte classe **et** matière, tests négatifs |
| Échec à mi-parcours | transaction par unité ; ne pas reprendre sur une base partielle, recréer une base TEST vide sous autorisation distincte |
| Migration historique | aucune migration Cloud rejouée ; `legacy_cloud` reste vide |

## Rollback futur

La baseline étant réservée à une base TEST from-zero sans donnée métier, le
rollback prévu en cas d'échec est la destruction/recréation **manuelle et
séparément autorisée** de la base TEST uniquement. Le runner ne supprime rien et
refuse une reprise sur une base partielle. Aucun rollback PROD n'existe dans ce
lot.

## Hors périmètre conservé

- Supabase Cloud, import historique et réconciliation des identifiants.
- PostgreSQL PROD, secrets runtime et fournisseur Auth.
- DNS, firewall, Coolify, sauvegardes réelles et restauration réelle.
- Backend applicatif, frontend, JASPE, données métier et branche `main`.
