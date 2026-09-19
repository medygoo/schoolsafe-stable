# SchoolSafe PostgreSQL VPS baseline v1

Status: **DB-04B-R2 review only — not applied**.

This directory defines a new PostgreSQL 17.11 baseline for an empty
`schoolsafe_test` database. It is not a replay of the historical Supabase
migrations and it never imports Cloud data. The `auth` schema is deliberately
empty and reserved for a separately approved authentication migration.

## Ordered units

1. `01_roles.sql` — isolated SQL roles; every application role is `NOBYPASSRLS`.
2. `02_schemas.sql` — `app`, `iam`, `audit`, `ops`, `api`, quarantine and reserved auth schemas.
3. `03_extensions.sql` — PostgreSQL 17.11 contract and protected `pg_stat_statements` installation, blocked unless it is preloaded.
4. `04_app_tables.sql` — from-zero tenant business model.
5. `05_iam.sql` — users, profiles, roles, grants/exceptions and permission-bound scope rows.
6. `06_audit_ops.sql` — append-only audit and operational metadata.
7. `07_constraints_indexes.sql` — tenant-qualified candidate keys, composite cross-school integrity and lookup indexes.
8. `08_internal_functions.sql` — transaction context and Access_Law evaluation.
9. `09_api_rpc.sql` — backend-only API surface and eight hardened P0 RPCs.
10. `10_triggers.sql` — invariants, timestamps and access-change audit.
11. `11_rls_acl.sql` — forced per-operation RLS and explicit API function ACL allowlist.
12. `12_seed_permissions.sql` — exactly 60 canonical permissions and seven scopes.
13. `13_verification.sql` — fail-closed structural verification.

`manifest.json` is the machine-readable order and `manifest.sha256` is the
standard SHA-256 checklist. Regenerate both deterministically with:

```powershell
node database/baseline/v1/scripts/generate-manifest.mjs
```

## Review checks (safe during DB-04B)

These checks read repository files only:

```powershell
node --test database/baseline/v1/tests/*.test.mjs
git diff --no-index -- NUL database/baseline/v1
```

The SQL semantic test is intentionally not executed during DB-04B. It creates
synthetic `.invalid` identities for School A, School B and School C inside one
transaction and ends with `ROLLBACK`. It verifies default DENY, explicit DENY
priority, exact active teacher class-and-subject assignment, `own_children`,
RLS reads, incoherent contexts, cross-school RPC refusal and four independent
physical FK refusals (student/class, guardian/student, assignment/subject and
payment/fee).

Access_Law scopes are never profile-global. `iam.grant_scopes` binds scope rows
to one exact role-permission grant and `iam.exception_scopes` binds them to one
exact individual exception. `assigned_classes` and `assigned_subjects` must both
match the same active class-subject assignment. `assigned_portal` evaluates only
the portal target attached to the grant/exception currently being checked.

## Candidate manual TEST execution (later approval only)

`scripts/run-from-zero-test.sh` is a DB-04C candidate, not an authorization to
execute. It refuses any container/database other than the approved TEST names,
requires an explicit confirmation token, verifies that port 5432 is unpublished,
checks the isolated Docker network and refuses a non-empty SchoolSafe schema.
It also refuses execution before unit 01 unless `pg_stat_statements` is
preloaded, query IDs are enabled and the extension files are available.
It applies the units twice for idempotence, records immutable checksums and runs
the rollback-only semantic test.

No password is embedded or printed. The command uses the container's local Unix
socket and the existing TEST bootstrap role. It must only be run manually after
review from a root-authorized VPS terminal:

```bash
export SCHOOLSAFE_PG_CONTAINER=schoolsafe-postgres-test
export SCHOOLSAFE_DB_NAME=schoolsafe_test
export SCHOOLSAFE_BOOTSTRAP_ROLE=schoolsafe_bootstrap
export SCHOOLSAFE_BASELINE_APPLY_CONFIRM=APPLY_SCHOOLSAFE_TEST_FROM_ZERO
bash database/baseline/v1/scripts/run-from-zero-test.sh
```

No PROD path, Cloud connection, public PostgreSQL port, DNS/firewall/Coolify
mutation, or real business seed exists in this baseline package.

The container correction and role-secret designs are review-only documents in
`review/CONTAINER_TEST_RECREATION.md` and `review/SECRETS_APPLICATION.md`.
