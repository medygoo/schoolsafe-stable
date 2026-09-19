#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../../.."
readonly C="schoolsafe-access-review-$(date +%s)-$$"
readonly IMAGE='sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0'
cleanup() { docker rm -f "$C" >/dev/null; }
trap cleanup EXIT
docker run -d --pull=never --name "$C" --network none --tmpfs /var/lib/postgresql/data --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_USER=schoolsafe_bootstrap --env POSTGRES_DB=access_review --label schoolsafe.environment=access-review-ephemeral "$IMAGE" -c shared_preload_libraries=pg_stat_statements >/dev/null
for i in {1..30}; do docker exec "$C" pg_isready -U schoolsafe_bootstrap -d access_review >/dev/null 2>&1 && break; sleep 1; done
sql() { docker exec -i "$C" psql -X -v ON_ERROR_STOP=1 -U schoolsafe_bootstrap -d access_review "$@"; }
[ "$(sql -Atc 'show server_version_num')" = 170011 ]
for f in baseline/v1/[0-9][0-9]_*.sql; do
  sql < "$f" >/dev/null
  n=$(basename "$f"); order=$((10#${n:0:2})); hash=$(sha256sum "$f" | cut -d' ' -f1)
  if [ "$order" -ge 6 ]; then
    sql -c "insert into ops.schema_versions(unit_order,baseline_version,unit_name,file_name,sha256) values ($order,'schoolsafe-vps-v1','${n:3:-4}','$n','$hash');" >/dev/null
  fi
  if [ "$order" = 6 ]; then
    for prev in baseline/v1/0[1-5]_*.sql; do
      pn=$(basename "$prev"); po=$((10#${pn:0:2})); ph=$(sha256sum "$prev" | cut -d' ' -f1)
      sql -c "insert into ops.schema_versions(unit_order,baseline_version,unit_name,file_name,sha256) values ($po,'schoolsafe-vps-v1','${pn:3:-4}','$pn','$ph');" >/dev/null
    done
  fi
done
sql < baseline/v1/tests/from-zero-access-law.test.sql >/dev/null
for f in auth/v1/[0-9][0-9]_*.sql access/v1/[0-9][0-9]_*.sql; do sql < "$f" >/dev/null; done
for f in access/v1/[0-9][0-9]_*.sql; do sql < "$f" >/dev/null; done
for f in access/v1/tests/*.test.sql; do echo "PROOF $f"; sql < "$f"; done
echo 'PASS PostgreSQL 17.11 ephemeral proofs'
