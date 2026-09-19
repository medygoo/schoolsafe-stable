# DB-04B-R2 — Review bundle SQL critique

Statut : **READY FOR FINAL REVIEW**

Ce bundle est généré exclusivement depuis les fichiers du dépôt. Il ne prouve aucune application SQL et n'accède ni à PostgreSQL TEST, ni à Docker, ni au VPS, ni au Cloud.

## Contrôles statiques obligatoires

| Contrôle | Statut | Preuve |
|---|---|---|
| no auth.uid() | PASS | PostgreSQL transaction context only |
| no BYPASSRLS | PASS | all five SchoolSafe roles use NOBYPASSRLS |
| no application SUPERUSER | PASS | all application roles use NOSUPERUSER |
| no GRANT to PUBLIC | PASS | PUBLIC is revoked, never granted |
| no CREATE in public | PASS | SchoolSafe objects use protected schemas |
| SECURITY DEFINER search_path | PASS | 24 definers pin pg_catalog |
| P0 actor/school authority | PASS | P0 RPCs derive actor and school from iam.current_* context |
| canonical permissions | PASS | 60 permissions in unit 12 |
| canonical scopes | PASS | 7 scopes in unit 12 |
| permission-bound scopes | PASS | grant_scopes and exception_scopes replace global profile scopes |
| tenant composite foreign keys | PASS | every declared tenant-to-tenant FK includes school_id on both sides |
| assigned_classes AND assigned_subjects | PASS | one active exact class-subject assignment |
| no pedagogical class/subject OR | PASS | no OR in exact teacher assignment |
| explicit DENY priority | PASS | DENY guard precedes both ALLOW paths |
| no Supabase dependency | PASS | pure PostgreSQL baseline |
| operation-specific RLS | PASS | no business FOR ALL policy is created |
| non-recursive IAM RLS | PASS | IAM policies use the school setting while API entry points validate the full context |
| explicit API execute allowlist | PASS | every API function grant is signature-specific |
| no browser direct table access | PASS | schoolsafe_api executes allowlisted API functions only |

Catalogue : **60 permissions / 7 scopes**.

## 01_roles.sql

- SHA-256 : `10448f25fb7925391c66d872a11d13d2876667dddeaaa39e8ec785868c72e5fe`
- Lignes : 48

### Objets créés

- `role schoolsafe_owner (NOLOGIN)`
- `role schoolsafe_migrator (LOGIN)`
- `role schoolsafe_api (LOGIN)`
- `role schoolsafe_worker (LOGIN)`
- `role schoolsafe_auditor (NOLOGIN)`

### SECURITY DEFINER

- Aucun.

### GRANT

- `grant schoolsafe_owner to schoolsafe_migrator;`
- `grant schoolsafe_owner to schoolsafe_bootstrap;`
- `grant schoolsafe_migrator to schoolsafe_bootstrap;`

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- bootstrap session with CREATEROLE
- PostgreSQL 17.11

### Risques

- LOGIN roles remain unusable until out-of-Git SCRAM secrets are injected

## 05_iam.sql

- SHA-256 : `87fc9522b8b530e2c09858de46deaaf43570893472c2810b062f1ff044edf7d5`
- Lignes : 159

### Objets créés

- `table iam.users`
- `table iam.profiles`
- `table iam.devices`
- `table iam.roles`
- `table iam.permissions`
- `table iam.scopes`
- `table iam.profile_roles`
- `table iam.role_permission_grants`
- `table iam.permission_conditions`
- `table iam.profile_permission_exceptions`
- `table iam.grant_scopes`
- `table iam.exception_scopes`

### SECURITY DEFINER

- Aucun.

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- 01_roles.sql
- 02_schemas.sql
- 04_app_tables.sql for app.schools

### Risques

- every scope must remain attached to its exact grant or exception

## 07_constraints_indexes.sql

- SHA-256 : `7ffde1d41c06cbce867ea2f287fcb9223c0ecd76815c3f2afa8226672fc8ec89`
- Lignes : 424

### Objets créés

- Aucun.

### SECURITY DEFINER

- Aucun.

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- all table definitions from units 04-06

### Risques

- a missing composite school_id foreign key could make a cross-school relation representable

## 08_internal_functions.sql

- SHA-256 : `3d973f644a6a6de5eb59436f56b6f3a245b39499e306dafd9d877c79337bb0ef`
- Lignes : 866

### Objets créés

- `function iam.read_context_uuid`
- `function iam.current_user_id`
- `function iam.current_profile_id`
- `function iam.current_school_id`
- `function iam.current_request_id`
- `function iam.context_is_valid`
- `function api.set_request_context`
- `function iam.has_exact_teacher_assignment`
- `function iam.is_guardian_of`
- `function iam.condition_matches`
- `function iam.scope_matches`
- `function iam.grant_scopes_match`
- `function iam.exception_scopes_match`
- `function iam.has_explicit_deny`
- `function iam.can_access`
- `function iam.require_access`
- `function app.is_student_operational`
- `function audit.write_event`
- `function ops.record_schema_version`

### SECURITY DEFINER

- `iam.context_is_valid — search_path pg_catalog: PASS`
- `api.set_request_context — search_path pg_catalog: PASS`
- `iam.has_exact_teacher_assignment — search_path pg_catalog: PASS`
- `iam.is_guardian_of — search_path pg_catalog: PASS`
- `iam.condition_matches — search_path pg_catalog: PASS`
- `iam.scope_matches — search_path pg_catalog: PASS`
- `iam.grant_scopes_match — search_path pg_catalog: PASS`
- `iam.exception_scopes_match — search_path pg_catalog: PASS`
- `iam.has_explicit_deny — search_path pg_catalog: PASS`
- `iam.can_access — search_path pg_catalog: PASS`
- `iam.require_access — search_path pg_catalog: PASS`
- `app.is_student_operational — search_path pg_catalog: PASS`
- `audit.write_event — search_path pg_catalog: PASS`
- `ops.record_schema_version — search_path pg_catalog: PASS`

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- 04_app_tables.sql
- 05_iam.sql
- 06_audit_ops.sql
- 07_constraints_indexes.sql

### Risques

- authorization correctness depends on complete transaction-local backend context

## 09_api_rpc.sql

- SHA-256 : `97bf44e8a68c3961ffe4ca12488a797c9e883a5e7a8bdabc9f04c17f1112212b`
- Lignes : 809

### Objets créés

- `function api.check_access`
- `function api.deactivate_other_academic_years`
- `function api.next_document_number`
- `function api.ensure_receipt_number`
- `function api.record_payment`
- `function api.cancel_payment`
- `function api.increment_card_print_count`
- `function api.create_student_draft`
- `function api.compensate_student_draft_creation`

### SECURITY DEFINER

- `api.check_access — search_path pg_catalog: PASS`
- `api.deactivate_other_academic_years — search_path pg_catalog: PASS`
- `api.next_document_number — search_path pg_catalog: PASS`
- `api.ensure_receipt_number — search_path pg_catalog: PASS`
- `api.record_payment — search_path pg_catalog: PASS`
- `api.cancel_payment — search_path pg_catalog: PASS`
- `api.increment_card_print_count — search_path pg_catalog: PASS`
- `api.create_student_draft — search_path pg_catalog: PASS`
- `api.compensate_student_draft_creation — search_path pg_catalog: PASS`

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- 08_internal_functions.sql
- canonical permissions later seeded by unit 12

### Risques

- eight mutating P0 RPCs require semantic execution tests before any production use

## 10_triggers.sql

- SHA-256 : `fe6f06833f25d51401dfef3328f060ee934b734b0b11562827e6ad97c192f2dd`
- Lignes : 450

### Objets créés

- `function ops.set_updated_at`
- `function app.guard_same_school_reference`
- `function app.validate_student_enrollment`
- `function app.project_active_enrollment_class`
- `function app.require_operational_student`
- `function audit.capture_access_change`
- `function audit.prevent_event_mutation`

### SECURITY DEFINER

- `audit.capture_access_change — search_path pg_catalog: PASS`

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- tenant composite constraints from unit 07
- audit.write_event from unit 08

### Risques

- access configuration changes must remain fully audited

## 11_rls_acl.sql

- SHA-256 : `59aba8c2ba98dc5480d0de048968896baf3bd93b5c0036a7640c25e09c7f7a05`
- Lignes : 307

### Objets créés

- `function iam.install_owner_policies`
- `policy audit_events_owner_select`
- `policy audit_events_owner_insert`
- `policy audit_events_auditor_tenant`
- `policy system_events_worker_select`
- `policy system_events_worker_update`
- `policy notifications_worker_select`
- `policy notifications_worker_update`

### SECURITY DEFINER

- Aucun.

### GRANT

- `grant usage on schema api to schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;`
- `grant execute on function api.set_request_context(uuid, uuid, uuid, uuid) to schoolsafe_api;`
- `grant execute on function api.check_access(text, uuid, uuid, uuid, uuid, uuid, jsonb) to schoolsafe_api;`
- `grant execute on function api.deactivate_other_academic_years(uuid) to schoolsafe_api;`
- `grant execute on function api.next_document_number(text, text) to schoolsafe_api;`
- `grant execute on function api.ensure_receipt_number(uuid) to schoolsafe_api;`
- `grant execute on function api.record_payment(uuid, numeric, text, timestamptz, text, text, jsonb) to schoolsafe_api;`
- `grant execute on function api.cancel_payment(uuid, text, integer) to schoolsafe_api;`
- `grant execute on function api.increment_card_print_count(uuid) to schoolsafe_api;`
- `grant execute on function api.create_student_draft(text, text, text, text, date, text, uuid, uuid, date, text, uuid, text, text, text, text, text) to schoolsafe_api;`
- `grant execute on function api.compensate_student_draft_creation(uuid) to schoolsafe_api;`
- `grant execute on function api.set_request_context(uuid, uuid, uuid, uuid) to schoolsafe_worker, schoolsafe_auditor;`
- `grant usage on schema iam to schoolsafe_worker, schoolsafe_auditor;`
- `grant execute on function iam.current_school_id() to schoolsafe_worker, schoolsafe_auditor;`
- `grant execute on function iam.context_is_valid() to schoolsafe_worker, schoolsafe_auditor;`
- `grant usage on schema ops to schoolsafe_worker;`
- `grant select, update on ops.system_events, ops.notifications to schoolsafe_worker;`
- `grant usage on schema audit to schoolsafe_auditor;`
- `grant select on audit.events to schoolsafe_auditor;`
- `grant usage on schema ops to schoolsafe_migrator;`
- `grant select, insert on ops.schema_versions to schoolsafe_migrator;`
- `grant execute on function ops.record_schema_version(smallint, text, text, text, text) to schoolsafe_migrator;`

### REVOKE

- `revoke all on all tables in schema app from public;`
- `revoke all on all tables in schema iam from public;`
- `revoke all on all tables in schema audit from public;`
- `revoke all on ops.schema_versions, ops.system_events, ops.notification_templates, ops.notifications, ops.data_retention_policies, ops.document_number_sequences, ops.indicator_snapshots from public;`
- `revoke all on all sequences in schema app from public;`
- `revoke all on all sequences in schema iam from public;`
- `revoke all on all sequences in schema audit from public;`
- `revoke all on all sequences in schema ops from public;`
- `revoke all on all tables in schema app from schoolsafe_api;`
- `revoke all on all tables in schema iam from schoolsafe_api;`
- `revoke all on all tables in schema audit from schoolsafe_api;`
- `revoke all on ops.schema_versions, ops.system_events, ops.notification_templates, ops.notifications, ops.data_retention_policies, ops.document_number_sequences, ops.indicator_snapshots from schoolsafe_api;`
- `revoke all on all sequences in schema app from schoolsafe_api;`
- `revoke all on all sequences in schema iam from schoolsafe_api;`
- `revoke all on all sequences in schema audit from schoolsafe_api;`
- `revoke all on all sequences in schema ops from schoolsafe_api;`
- `revoke execute on all functions in schema app from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;`
- `revoke execute on all functions in schema iam from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;`
- `revoke execute on all functions in schema audit from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;`
- `revoke execute on function ops.record_schema_version(smallint, text, text, text, text) from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;`
- `revoke execute on all functions in schema api from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;`

### ENABLE/FORCE RLS

- `ENABLE + FORCE RLS on every tenant-aware app table`
- `ENABLE + FORCE RLS on tenant-aware iam tables`
- `ENABLE + FORCE RLS on audit.events`
- `ENABLE + FORCE RLS on tenant-aware ops tables`
- `operation-specific SELECT/INSERT/UPDATE/DELETE policies`
- `no UPDATE/DELETE policies for append-only ledgers`

### Dépendances

- all tables from units 04-06
- functions from units 08-10
- 03_extensions.sql ACL lockdown

### Risques

- a missed tenant-aware table or runtime grant would create a data-isolation failure

## 12_seed_permissions.sql

- SHA-256 : `8a347abde67b8efb91625346f0177be36445dd331f3c5450b40c945c252c79d2`
- Lignes : 108

### Objets créés

- `60 canonical permission rows`
- `7 canonical scope rows`

### SECURITY DEFINER

- Aucun.

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- 05_iam.sql
- 07_constraints_indexes.sql

### Risques

- catalog drift is fatal: the unit asserts exactly 60 permissions and seven scopes

## 13_verification.sql

- SHA-256 : `96c70087aaf4621da480868a66576e5eefe7a960a21c9802c650e4aacd46b209`
- Lignes : 393

### Objets créés

- Aucun.

### SECURITY DEFINER

- Aucun.

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- units 01-12
- pg_stat_statements preloaded and installed by unit 03

### Risques

- structural verification does not replace the rollback-only semantic Access_Law test

## tests/from-zero-access-law.test.sql

- SHA-256 : `f53b98a1379ad5391324d14ada4eb1ac840b1b1988bb5c3dabd7112ff433c28c`
- Lignes : 451

### Objets créés

- `temporary pg_temp.assert_true function`
- `rollback-only School A/B/C identities, roles, grants, classes, subjects and children`
- `function pg_temp.assert_true`

### SECURITY DEFINER

- Aucun.

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- fully applied disposable TEST baseline
- synthetic School A/B/C fixtures

### Risques

- SQL is intentionally executable only later and must end in ROLLBACK

## scripts/run-from-zero-test.sh

- SHA-256 : `5b65735c23edd1e5bc44de577d9c3fc6173a7cc2a170e881880d5776c9f07dfb`
- Lignes : 173

### Objets créés

- `none directly; orchestrates the 13 reviewed SQL units`

### SECURITY DEFINER

- Aucun.

### GRANT

- Aucun.

### REVOKE

- Aucun.

### ENABLE/FORCE RLS

- Aucun.

### Dépendances

- root-authorized Docker CLI
- empty schoolsafe_test
- reviewed manifest.sha256

### Risques

- future apply mutates TEST; explicit confirmation and empty-target gates are mandatory
