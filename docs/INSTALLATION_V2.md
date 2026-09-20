# SchoolSafe installation v2

Base: production 7d5cc89924319eb9c46d8a5a9cd0f3f729743834. Changes are local to
codex/schoolsafe-installation-v2. Production SchoolSafe remains undeployed.

## Immutable history and installation plan

Every existing SQL file and v1 manifest is preserved. The executable v2 plan
accounts for every versioned SQL unit, verifies normalized SHA256 checksums and
orders active units according to their version manifests. Six historical units
are explicitly superseded, with original checksums retained:

| Historical unit | Replacement and reason |
|---|---|
| projections/v1/02_student_list.sql | v2: legal PostgreSQL signature, draft enrollment, per-student access and bounded stable pagination |
| setup/v1/01_setup_native.sql | v2: one-use offline authorization, atomic school/admin, canonical school-scoped admin role and FORCE RLS |
| auth/v1/03_auth_reset.sql | v2: atomic random recovery hash, expiry/rate limit, one-use reset and session revocation |
| finance/v1/02_finance_full.sql | v2: remove an illegal default before required function arguments; preserve argument positions |
| devicehub/v1/01_devicehub_core.sql | v2: bootstrap schema ownership without runtime CREATE privileges |
| devicehub/v1/02_devicehub_rpc.sql | v2: canonical permissions, tenant checks, generated external identifiers, serialized event retries |

The final v2 security unit forces RLS on post-baseline business tables, removes
runtime table access, verifies six roles, and configures distinct role passwords.
No SchoolSafe role has SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE or REPLICATION.
No grants from schoolsafe_api/auth to owner or migrator. Runtime reprovisioning
remains revoked by access/v1/04. Two v2 fixtures adapt earlier bootstrap/replay
tests to this later rule; the original SQL tests remain intact.

## Explicit installer

Supply DATABASE_URL from a secure environment, using the bootstrap administrator
and an explicitly intended database named schoolsafe (production, only after
human approval) or schoolsafe_test_* (disposable). Never place this URL in Git,
logs, command arguments, CI production secrets or reports.

Commands:

```sh
node scripts/check-migration-versions.mjs --require-installable
node scripts/install-school-db.mjs --database schoolsafe_test_ci --dry-run
node scripts/install-school-db.mjs --database schoolsafe_test_ci --check
node scripts/install-school-db.mjs --database schoolsafe_test_ci --apply
```

Apply also requires SCHOOLSAFE_API_PASSWORD, SCHOOLSAFE_AUTH_PASSWORD,
SCHOOLSAFE_WORKER_PASSWORD and SCHOOLSAFE_MIGRATOR_PASSWORD, each distinct and
at least 32 characters, supplied securely. Role DDL belongs to versioned SQL.
PostgreSQL must report 170011, preload pg_stat_statements and enable
compute_query_id=auto/on. Docker image: postgres:17.11-bookworm.

The installer does not create or drop databases. It rejects mismatched names,
unmanaged schemas and existing public relations, and verifies all manifests
before connecting. A transaction and advisory lock cover all units. The private
ops.installation_units ledger records order, checksums and plan digest. Identical
replay is a no-op; a different installed plan requires a separate reviewed
upgrade. Any failure stops and rolls back; query arguments and credentials are
not logged. Password rotation is not an automatic reinstall operation.

## Setup and recovery

An offline schoolsafe_migrator session issues ops.authorize_school_setup with
a SHA256 of a strong SETUP_TOKEN (60..86400 second TTL). Supply the raw token
only to the secured setup service/browser and runtime SETUP_TOKEN environment.
The auth RPC stages immutable school data, then commits school, canonical admin,
identity, credentials and token consumption atomically. It resumes across server
restarts using the token-bound database record, never first/latest school.
No application receives migrator credentials.

Recovery uses the existing Brevo adapter when BREVO_API_KEY, BREVO_SENDER_EMAIL
and a trusted HTTPS AUTH_RECOVERY_URL are configured. Without delivery no token
is issued. Only SHA256 is stored; the raw random token is delivered by email.
The public response is generic, including delivery failures. Reset consumes the
token once, retires other requests and revokes existing sessions. Synthetic
mail tests do not send external email.

## Machine contract and audit of Control

Control source audited at cb4257d7d70b6662f8106d9f6241751610e07258. The canonical
contract is x-schoolsafe-instance / x-schoolsafe-timestamp / x-schoolsafe-signature,
HMAC-SHA256 of METHOD + newline + path including query + newline + UNIX seconds
+ newline + compact JSON. Absent GET body is {}. Strict hex/integer validation,
constant-time comparison and the 300-second window are retained. Device events
require provider IDs; database serialization makes concurrent retries idempotent.

The SchoolSafe licence client now uses this same contract. Ed25519 verification
and signed school binding remain in SchoolSafe, with only a public key. Missing
verification configuration now closes business routes. QR/card credential HMAC
is a different purpose and is intentionally not changed to the HTTP format.

Device mapping no longer selects the most recent school. Offline migrator
ops.bind_machine_device binds instance + exact device UUID + school + an existing
scoped service principal. Runtime API cannot create bindings. Each resolution
checks the real principal, security.scan, active device and tenant key; revoked
principals/devices fail closed. Use a dedicated least-privilege principal when
provisioning devices. Composite foreign keys prevent cross-school relationships.
No client-provided school_id is accepted on the machine event endpoint. Only
student mappings are qualified; staff mappings are refused pending their own
schema contract.

Remaining Control work (not deployed or changed by this SchoolSafe PR):

- /api/license/state is absent; no signed production licence flow is claimed.
- Control HMAC accepts looser numeric/hex encodings than the hardened client;
  implement the same strict validation on Control in a separate reviewed change.
- Control's registry trusts school_id sent by an authenticated instance; a
  server-side instance-to-authorized-school registry is still required there.
- No outbound Device Hub event delivery implementation was found in Control.

Three cross-repository vectors compare signatures against the actual Control
source. This proves the shared signing format, not missing endpoint behavior.
These gaps block a complete licence/device integration rollout; they do not
justify weakening SchoolSafe verification or sharing PostgreSQL credentials.

## Qualification

Portable PostgreSQL 17.11 on loopback, separate new cluster/database, no real
data and no production database access. Full run:

```sh
npm ci
npm run ci
node scripts/check-control-contract.mjs /path/to/read-only/control-checkout
npm run test:installation
```

The last command requires explicit local schoolsafe_test_* DATABASE_URL, four
runtime password variables and psql (or PSQL_BIN). It requires an empty target,
proves atomic rollback after a final-unit failure, installs 48 units, proves
identical replay, runs six real PostgreSQL RLS suites and 44 setup/auth/student/
device scenarios. Covers parent scope, exact class/subject pairs, role assignment,
FORCE RLS, foreign schools, no direct runtime tables, unknown/disabled devices,
expired/replayed/concurrent reset and non-superuser/no-BYPASSRLS roles.

Docker Linux build passed from a separate build context on the VPS. No SchoolSafe
application container was started. The production checkout was only read/cloned
with its dedicated read-only key; no VPS Git push occurred.

## CI and publication

CI runs on pull requests to production or manual dispatch; no deployment step.
Actions are pinned to verified official commits. Disposable PostgreSQL secrets
are generated and masked per run; no production secrets are used. The manual
deployment workflow has only workflow_dispatch and requires the production ref,
production environment and SCHOOLSAFE_DEPLOY_ENABLED=true. That variable is not
configured here. The VPS deployer additionally requires an approved-production-sha.
No merge, production installation or deployment is authorized by this PR.

The operator authenticated with GitHub CLI and published this branch from the
Codex workspace. PR: https://github.com/medygoo/schoolsafe-stable/pull/2. CI runs automatically for
this PR; its Checks tab is the authority for the current GitHub result. The VPS
key remains read-only. Human review is required; no merge or deployment occurs.
