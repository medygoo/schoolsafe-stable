# DB-04B-R2 — tenant-safe Access_Law baseline review

Statut : **READY FOR FINAL REVIEW — RIEN N'A ÉTÉ APPLIQUÉ**.

## Corrections préparées

- `iam.scope_assignments` n'est plus créé ni utilisé comme portée globale de profil.
- `iam.grant_scopes` borne chaque portée à un grant rôle-permission précis.
- `iam.exception_scopes` borne chaque portée à une exception individuelle précise.
- Les conditions de grant restent dans `iam.permission_conditions`; les conditions d'exception restent directement attachées à `iam.profile_permission_exceptions`.
- `assigned_portal` lit uniquement la cible portée par le grant/exception en cours et confirme que le portail appartient à l'école active.
- Les droits pédagogiques à portée enseignant exigent `assigned_classes` **ET** `assigned_subjects` sur la même affectation active.
- Le `DENY` explicite correspondant à la ressource est évalué avant tout chemin `ALLOW`.

## Intégrité multi-écoles

- Chaque table tenant-aware possédant `id` expose une clé candidate `UNIQUE (school_id, id)`.
- Les 101 relations tenant-vers-tenant déclarées utilisent une FK composite avec `school_id` côté enfant et parent.
- Les suppressions `SET NULL` ne rendent nul que l'identifiant référent et conservent le `school_id` obligatoire.
- Le test rollback-only contient quatre refus physiques indépendants : étudiant A → classe B, tuteur A → étudiant B, affectation A → matière B, paiement A → frais B.

## RLS et ACL

- Toutes les tables tenant-aware conservent `ENABLE ROW LEVEL SECURITY` et `FORCE ROW LEVEL SECURITY`.
- Aucune policy métier `FOR ALL` n'est créée : SELECT, INSERT, UPDATE et DELETE sont séparés.
- Les journaux append-only (`student_enrollment_events`, `security_events`, `fee_control_scans`, `audit.events`, `indicator_snapshots`) n'ont aucune policy UPDATE/DELETE.
- `schoolsafe_api` ne reçoit aucun droit direct sur les tables.
- L'ancien grant global sur toutes les fonctions `api` est remplacé par une allowlist explicite de dix signatures (contexte, contrôle d'accès et huit RPC P0).
- `13_verification.sql` échoue sur toute policy `FOR ALL`, FK tenant simple, clé candidate manquante ou fonction API exécutable hors allowlist.

## Contrôles statiques

- 22/22 tests Node : PASS.
- 60 permissions canoniques : PASS.
- 7 scopes canoniques : PASS.
- aucune référence `auth.uid()` : PASS.
- aucun rôle applicatif `BYPASSRLS`/`SUPERUSER` : PASS.
- aucun `GRANT ... TO PUBLIC` : PASS.
- aucun `CREATE` SchoolSafe dans `public` : PASS.
- 24 fonctions `SECURITY DEFINER`, toutes avec `search_path=pg_catalog` : PASS.
- affectation enseignant classe **ET** matière, aucun OR : PASS.
- bundle de revue R2 et manifestes SHA-256 régénérés : PASS.

Le test SQL sémantique n'a pas été exécuté : conformément au périmètre DB-04B-R2, aucune connexion PostgreSQL TEST, commande Docker/VPS, opération Cloud ou donnée réelle n'a été utilisée.

## Verdict

**DB-04B-R2 READY FOR FINAL REVIEW**
