\set ON_ERROR_STOP on

begin;

do $schoolsafe$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'schoolsafe_owner') then
    create role schoolsafe_owner nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'schoolsafe_migrator') then
    create role schoolsafe_migrator login;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'schoolsafe_api') then
    create role schoolsafe_api login;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'schoolsafe_worker') then
    create role schoolsafe_worker login;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'schoolsafe_auditor') then
    create role schoolsafe_auditor nologin;
  end if;
end
$schoolsafe$;

alter role schoolsafe_owner with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role schoolsafe_migrator with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role schoolsafe_api with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role schoolsafe_worker with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role schoolsafe_auditor with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;

alter role schoolsafe_owner set search_path = pg_catalog;
alter role schoolsafe_migrator set search_path = pg_catalog;
alter role schoolsafe_api set search_path = pg_catalog;
alter role schoolsafe_worker set search_path = pg_catalog;
alter role schoolsafe_auditor set search_path = pg_catalog;

grant schoolsafe_owner to schoolsafe_migrator;

do $schoolsafe$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'schoolsafe_bootstrap') then
    grant schoolsafe_owner to schoolsafe_bootstrap;
    grant schoolsafe_migrator to schoolsafe_bootstrap;
  end if;
end
$schoolsafe$;

commit;
