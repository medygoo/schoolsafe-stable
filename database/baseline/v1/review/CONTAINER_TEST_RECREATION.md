# DB-04B-R1 — correction contrôlée du conteneur TEST

Statut : **RUNBOOK UNIQUEMENT — NON EXÉCUTÉ**.

L'unité `03_extensions.sql` et toute la baseline restent bloquées tant que
`schoolsafe-postgres-test` ne précharge pas `pg_stat_statements`. PostgreSQL
exige un démarrage du serveur avec ce module dans
`shared_preload_libraries`; un simple `CREATE EXTENSION` ne suffit pas.

Ce runbook conserve le volume `schoolsafe-pg-test-data`, n'expose aucun port,
ne tire aucune image et ne touche ni à PROD, ni à Coolify. Les commandes sont à
exécuter plus tard, manuellement en root, après une autorisation distincte.

## Valeurs verrouillées

```bash
readonly CONTAINER='schoolsafe-postgres-test'
readonly OLD_CONTAINER='schoolsafe-postgres-test-pre-r1'
readonly NETWORK='schoolsafe-test-internal'
readonly VOLUME='schoolsafe-pg-test-data'
readonly SECRET='/etc/schoolsafe-db/test/secrets/postgres_bootstrap_password'
readonly IMAGE_TAG='postgres:17.11-bookworm'
readonly EXPECTED_REPO_DIGEST='postgres@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0'
```

## 1. Précontrôles bloquants

```bash
test "$(id -u)" -eq 0
test -f "$SECRET"
test "$(stat -c '%a' "$SECRET")" = '600'
test "$(docker inspect --format '{{.State.Running}}' "$CONTAINER")" = 'true'
! docker inspect "$OLD_CONTAINER" >/dev/null 2>&1
test -z "$(docker port "$CONTAINER" 5432/tcp 2>/dev/null || true)"
docker network inspect "$NETWORK" >/dev/null
docker volume inspect "$VOLUME" >/dev/null

test "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER")" = "$VOLUME"
test "$(docker inspect --format '{{if index .NetworkSettings.Networks "schoolsafe-test-internal"}}yes{{else}}no{{end}}' "$CONTAINER")" = 'yes'
test "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/postgres_bootstrap_password"}}{{.Source}}{{end}}{{end}}' "$CONTAINER")" = "$SECRET"

IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_TAG")"
docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$IMAGE_TAG" \
  | grep -Fx "$EXPECTED_REPO_DIGEST"
test -n "$IMAGE_ID"
```

Si un contrôle échoue : **STOP**. Aucun `docker pull` n'est autorisé dans cette
procédure. Le `IMAGE_ID` local validé est utilisé pour empêcher tout accès
réseau implicite.

## 2. Conservation du conteneur précédent et recréation

La sauvegarde est le conteneur arrêté renommé ; le volume nommé n'est ni
supprimé ni recréé. Ne jamais démarrer les deux conteneurs simultanément.

```bash
docker stop --time 60 "$CONTAINER"
docker rename "$CONTAINER" "$OLD_CONTAINER"

docker run --detach \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network "$NETWORK" \
  --mount "source=$VOLUME,target=/var/lib/postgresql/data" \
  --mount "type=bind,src=$SECRET,dst=/run/secrets/postgres_bootstrap_password,readonly" \
  --env POSTGRES_USER=schoolsafe_bootstrap \
  --env POSTGRES_DB=schoolsafe_test \
  --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_bootstrap_password \
  --env PGDATA=/var/lib/postgresql/data/pgdata \
  --env TZ=UTC \
  --env PGTZ=UTC \
  --cpus 0.50 \
  --memory 2g \
  --memory-reservation 1g \
  --shm-size 256m \
  --pids-limit 256 \
  --security-opt no-new-privileges:true \
  --stop-timeout 60 \
  --health-cmd 'pg_isready --username schoolsafe_bootstrap --dbname schoolsafe_test' \
  --health-interval 10s \
  --health-timeout 5s \
  --health-retries 5 \
  --health-start-period 30s \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  "$IMAGE_ID" \
  -c shared_preload_libraries=pg_stat_statements \
  -c compute_query_id=auto \
  -c pg_stat_statements.max=5000 \
  -c pg_stat_statements.track=top \
  -c pg_stat_statements.track_utility=on \
  -c pg_stat_statements.track_planning=off \
  -c pg_stat_statements.save=on \
  -c max_connections=40 \
  -c shared_buffers=512MB \
  -c effective_cache_size=1280MB \
  -c work_mem=4MB \
  -c maintenance_work_mem=128MB \
  -c statement_timeout=30s \
  -c idle_in_transaction_session_timeout=30s \
  -c lock_timeout=5s \
  -c password_encryption=scram-sha-256 \
  -c log_destination=stderr \
  -c logging_collector=off \
  -c log_statement=none \
  -c log_min_duration_statement=500 \
  -c log_parameter_max_length=0 \
  -c log_parameter_max_length_on_error=0 \
  -c log_connections=on \
  -c log_disconnections=on \
  -c log_checkpoints=on \
  -c log_lock_waits=on \
  -c deadlock_timeout=1s \
  -c log_temp_files=10485760 \
  -c log_min_error_statement=error \
  -c 'log_line_prefix=%m [%p] %q%u@%d/%a '
```

Il n'y a volontairement ni `--publish`, ni `-p`, ni rattachement au réseau
`coolify`. Les paramètres de logs ajoutés couvrent connexions, déconnexions,
checkpoints, attentes de verrous et fichiers temporaires, sans journaliser les
paramètres SQL.

## 3. Contrôles après démarrage — lecture seule

```bash
for attempt in $(seq 1 30); do
  HEALTH="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER")"
  test "$HEALTH" = 'healthy' && break
  test "$HEALTH" = 'unhealthy' && break
  sleep 4
done
test "$HEALTH" = 'healthy'
test -z "$(docker port "$CONTAINER" 5432/tcp 2>/dev/null || true)"
test "$(docker inspect --format '{{if index .NetworkSettings.Networks "schoolsafe-test-internal"}}yes{{else}}no{{end}}' "$CONTAINER")" = 'yes'
test "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$CONTAINER")" = "$VOLUME"
test "$(docker inspect --format '{{.State.Running}}' "$OLD_CONTAINER")" = 'false'

docker exec "$CONTAINER" sh -ceu '
  export PGPASSWORD="$(cat /run/secrets/postgres_bootstrap_password)"
  exec psql -X --set=ON_ERROR_STOP=1 \
    --username schoolsafe_bootstrap --dbname schoolsafe_test \
    --tuples-only --no-align <<"SQL"
show server_version_num;
show shared_preload_libraries;
show compute_query_id;
show log_destination;
show logging_collector;
show log_min_duration_statement;
show log_parameter_max_length;
show log_parameter_max_length_on_error;
select count(*) from pg_catalog.pg_extension where extname = 'pg_stat_statements';
SQL
'
```

Valeurs attendues : `170011`, préchargement contenant exactement le module
`pg_stat_statements`, `compute_query_id=auto`, logs sur `stderr`, collector
désactivé, seuil lent `500`, paramètres `0`, et **extension installée = 0** tant
que la baseline n'a pas reçu un GO d'application. Ne pas lancer
`03_extensions.sql` pendant DB-04B-R1.

## 4. Retour arrière si le nouveau conteneur n'est pas sain

Le retour arrière ne supprime jamais le volume :

```bash
docker stop --time 60 "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true
docker rename "$OLD_CONTAINER" "$CONTAINER"
docker start "$CONTAINER"
test "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER")" = 'healthy'
```

Le conteneur de sauvegarde ne sera supprimé qu'après une validation ultérieure
et une autorisation explicite. La présence de cette procédure n'autorise aucune
de ces commandes pendant DB-04B-R1.
