\set ON_ERROR_STOP on

begin;

do $schoolsafe$
declare
  v_server_version integer := pg_catalog.current_setting('server_version_num')::integer;
  v_preloaded text[] := pg_catalog.regexp_split_to_array(
    pg_catalog.current_setting('shared_preload_libraries'),
    '\\s*,\\s*'
  );
  v_compute_query_id text := pg_catalog.current_setting('compute_query_id');
begin
  if v_server_version <> 170011 then
    raise exception 'SchoolSafe baseline requires PostgreSQL 17.11; server_version_num=%', v_server_version;
  end if;

  if pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception 'PostgreSQL built-in pg_catalog.gen_random_uuid() is required';
  end if;

  if not ('pg_stat_statements' = any(v_preloaded)) then
    raise exception 'pg_stat_statements must be present in shared_preload_libraries before unit 03';
  end if;

  if v_compute_query_id not in ('auto', 'on') then
    raise exception 'compute_query_id must be auto or on; current value=%', v_compute_query_id;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_available_extensions e
    where e.name = 'pg_stat_statements'
  ) then
    raise exception 'pg_stat_statements extension files are unavailable in this PostgreSQL image';
  end if;
end
$schoolsafe$;

create extension if not exists pg_stat_statements with schema ops;

do $schoolsafe$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_stat_statements'
      and n.nspname = 'ops'
  ) then
    raise exception 'pg_stat_statements must be installed in the protected ops schema';
  end if;
end
$schoolsafe$;

-- Extension objects are owned by the bootstrap administrator. Remove every
-- implicit runtime privilege immediately; later units grant no monitoring
-- access to application roles.
revoke all on all tables in schema ops
  from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor, schoolsafe_migrator;
revoke execute on all functions in schema ops
  from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor, schoolsafe_migrator;

commit;
