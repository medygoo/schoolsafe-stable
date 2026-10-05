\set ON_ERROR_STOP on
-- Server access state for a school created by the validated Supabase principal path.
-- Legacy SignedLicenseV1 rows stay in ops.license_states and are not rewritten here.
begin;
set local role schoolsafe_owner;

create table ops.supabase_school_access (
  school_id uuid primary key references app.schools (id),
  access_status text not null check (access_status in ('active', 'suspended', 'revoked')),
  source text not null check (source = 'supabase_principal_onboarding'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table ops.supabase_school_access enable row level security;
alter table ops.supabase_school_access force row level security;

create policy supabase_school_access_owner on ops.supabase_school_access
  to schoolsafe_owner
  using (school_id = iam.current_school_id() and iam.context_is_valid())
  with check (school_id = iam.current_school_id() and iam.context_is_valid());

revoke all on ops.supabase_school_access
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;

create function api.supabase_school_access_read()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $fn$
declare
  v_status text;
begin
  if not iam.context_is_valid() or iam.current_school_id() is null then
    raise insufficient_privilege using message = 'Verified school context required';
  end if;
  select a.access_status into v_status
    from ops.supabase_school_access a
   where a.school_id = iam.current_school_id();
  return v_status;
end
$fn$;

create function auth.open_supabase_school_access()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
begin
  if old.completed_at is null
     and new.completed_at is not null
     and old.bootstrap_school_id is not null then
    insert into ops.supabase_school_access (school_id, access_status, source)
    values (old.bootstrap_school_id, 'active', 'supabase_principal_onboarding')
    on conflict (school_id) do nothing;
  end if;
  return new;
end
$fn$;

create trigger supabase_school_access_on_completion
  after update on auth.supabase_principal_bootstrap
  for each row
  execute function auth.open_supabase_school_access();

revoke all on function api.supabase_school_access_read()
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function auth.open_supabase_school_access()
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
grant execute on function api.supabase_school_access_read() to schoolsafe_api;

commit;
