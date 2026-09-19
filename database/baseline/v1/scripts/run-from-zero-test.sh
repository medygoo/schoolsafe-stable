#!/usr/bin/env bash
set -Eeuo pipefail

# This script is intentionally NOT executed by DB-04B. It is the reviewed,
# manual DB-04C candidate for one empty TEST database only.
readonly BASELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly CONTAINER="${SCHOOLSAFE_PG_CONTAINER:-schoolsafe-postgres-test}"
readonly DATABASE="${SCHOOLSAFE_DB_NAME:-schoolsafe_test}"
readonly BOOTSTRAP_ROLE="${SCHOOLSAFE_BOOTSTRAP_ROLE:-schoolsafe_bootstrap}"
readonly CONFIRMATION="${SCHOOLSAFE_BASELINE_APPLY_CONFIRM:-}"
readonly BASELINE_VERSION="schoolsafe-vps-v1"

readonly -a UNITS=(
  01_roles.sql
  02_schemas.sql
  03_extensions.sql
  04_app_tables.sql
  05_iam.sql
  06_audit_ops.sql
  07_constraints_indexes.sql
  08_internal_functions.sql
  09_api_rpc.sql
  10_triggers.sql
  11_rls_acl.sql
  12_seed_permissions.sql
  13_verification.sql
)

fail() {
  printf 'DB-04B runner refused: %s\n' "$1" >&2
  exit 1
}

[[ "$CONTAINER" == "schoolsafe-postgres-test" ]] || fail "unexpected container: $CONTAINER"
[[ "$DATABASE" == "schoolsafe_test" ]] || fail "unexpected database: $DATABASE"
[[ "$CONFIRMATION" == "APPLY_SCHOOLSAFE_TEST_FROM_ZERO" ]] || fail "explicit TEST confirmation is missing"

command -v docker >/dev/null 2>&1 || fail "docker CLI is unavailable"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is unavailable"

[[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER")" == "true" ]] \
  || fail "TEST container is not running"

published_5432="$(docker port "$CONTAINER" 5432/tcp 2>/dev/null || true)"
[[ -z "$published_5432" ]] || fail "PostgreSQL 5432 is published: $published_5432"

network_attached="$(
  docker inspect --format '{{if index .NetworkSettings.Networks "schoolsafe-test-internal"}}yes{{else}}no{{end}}' "$CONTAINER"
)"
[[ "$network_attached" == "yes" ]] || fail "isolated TEST network is not attached"

docker exec "$CONTAINER" test -r /run/secrets/postgres_bootstrap_password \
  || fail "bootstrap password file is not readable inside the TEST container"

run_psql() {
  docker exec -i "$CONTAINER" sh -ceu '
    readonly role="$1"
    readonly database="$2"
    shift 2
    export PGPASSWORD="$(cat /run/secrets/postgres_bootstrap_password)"
    exec psql -X --set=ON_ERROR_STOP=1 --username "$role" --dbname "$database" "$@"
  ' sh "$BOOTSTRAP_ROLE" "$DATABASE" "$@"
}

server_version="$(run_psql --tuples-only --no-align --command 'show server_version_num' | tr -d '[:space:]')"
[[ "$server_version" == "170011" ]] || fail "PostgreSQL 17.11 required; got $server_version"

database_name="$(run_psql --tuples-only --no-align --command 'select current_database()' | tr -d '[:space:]')"
[[ "$database_name" == "$DATABASE" ]] || fail "connected to unexpected database: $database_name"

preloaded_libraries="$(
  run_psql --tuples-only --no-align --command 'show shared_preload_libraries' \
    | tr -d '[:space:]'
)"
case ",$preloaded_libraries," in
  *,pg_stat_statements,*) ;;
  *) fail "pg_stat_statements is absent from shared_preload_libraries; unit 03 is blocked" ;;
esac

compute_query_id="$(
  run_psql --tuples-only --no-align --command 'show compute_query_id' \
    | tr -d '[:space:]'
)"
[[ "$compute_query_id" == "auto" || "$compute_query_id" == "on" ]] \
  || fail "compute_query_id must be auto or on; got $compute_query_id"

extension_available="$(
  run_psql --tuples-only --no-align --command \
    "select count(*) from pg_catalog.pg_available_extensions where name = 'pg_stat_statements'" \
    | tr -d '[:space:]'
)"
[[ "$extension_available" == "1" ]] || fail "pg_stat_statements extension files are unavailable"

custom_schema_count="$(
  run_psql --tuples-only --no-align --command \
    "select count(*) from pg_catalog.pg_namespace where nspname in ('app','iam','audit','ops','api','legacy_cloud','auth')" \
    | tr -d '[:space:]'
)"
[[ "$custom_schema_count" == "0" ]] || fail "target is not from-zero; SchoolSafe schemas already exist"

(
  cd "$BASELINE_DIR"
  sha256sum --check --strict manifest.sha256
)

apply_unit() {
  local file="$1"
  printf 'Applying %s\n' "$file"
  run_psql < "$BASELINE_DIR/$file"
}

record_unit() {
  local order="$1"
  local file="$2"
  local name="${file%.sql}"
  name="${name:3}"
  local sha256
  sha256="$(awk -v target="$file" '$2 == target { print $1 }' "$BASELINE_DIR/manifest.sha256")"
  [[ "$sha256" =~ ^[a-f0-9]{64}$ ]] || fail "missing manifest hash for $file"

  run_psql \
    --set=unit_order="$order" \
    --set=baseline_version="$BASELINE_VERSION" \
    --set=unit_name="$name" \
    --set=file_name="$file" \
    --set=sha256="$sha256" \
    <<'SQL'
set role schoolsafe_owner;
select ops.record_schema_version(
  :'unit_order'::smallint,
  :'baseline_version',
  :'unit_name',
  :'file_name',
  :'sha256'
);
reset role;
SQL
}

# First pass: units 01-08 make the version recorder available.
for index in {0..7}; do
  apply_unit "${UNITS[$index]}"
done

# Register 01-08 before unit 13 verifies the complete installation history.
for index in {0..7}; do
  record_unit "$((index + 1))" "${UNITS[$index]}"
done

# Install and immediately register units 09-12.
for index in {8..11}; do
  apply_unit "${UNITS[$index]}"
  record_unit "$((index + 1))" "${UNITS[$index]}"
done

# Unit 13 accepts 12 records during its first run, then is registered and run
# again so the final state proves all 13 immutable version records.
apply_unit 13_verification.sql
record_unit 13 13_verification.sql
apply_unit 13_verification.sql

# Second full pass proves SQL-unit idempotence and checksum-record idempotence.
for index in "${!UNITS[@]}"; do
  apply_unit "${UNITS[$index]}"
  record_unit "$((index + 1))" "${UNITS[$index]}"
done

run_psql < "$BASELINE_DIR/tests/from-zero-access-law.test.sql"

run_psql --command \
  "select unit_order, unit_name, sha256 from ops.schema_versions order by unit_order"

printf 'DB-04B baseline from-zero and idempotence tests: PASS\n'
