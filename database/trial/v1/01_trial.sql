\set ON_ERROR_STOP on

-- SchoolSafe Trial v1 — système d'essai 14 jours (arbitrage B1 : grâce puis
-- suppression ; conversion A1 : promotion en place).
--
-- Constantes verrouillées : TRIAL 14 jours, GRÂCE 7 jours (à valider).
-- Statuts : active → grace → expired ; converted = promotion définitive.
-- Toute transition est auditée. La suppression réelle d'une école expirée
-- reste une action opérateur explicite (jamais automatique dans v1).

begin;
set local role schoolsafe_owner;

create table if not exists app.trial_licenses (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null unique,
  started_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  grace_ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'grace', 'expired', 'converted')),
  converted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (expires_at > started_at),
  check (grace_ends_at > expires_at)
);

-- Tenant FORCE RLS : chaque école ne voit que sa propre licence.
alter table app.trial_licenses enable row level security;
alter table app.trial_licenses force row level security;

do $schoolsafe$
begin
  execute pg_catalog.format('drop policy if exists %I on %s', 'trial_licenses_owner_tenant', 'app.trial_licenses');
  execute pg_catalog.format('drop policy if exists %I on %s', 'trial_licenses_owner_insert', 'app.trial_licenses');
  execute pg_catalog.format('drop policy if exists %I on %s', 'trial_licenses_owner_update', 'app.trial_licenses');
  execute pg_catalog.format('drop policy if exists %I on %s', 'trial_licenses_migrator_select', 'app.trial_licenses');
  execute pg_catalog.format('drop policy if exists %I on %s', 'trial_licenses_migrator_update', 'app.trial_licenses');
end
$schoolsafe$;

create policy trial_licenses_owner_tenant on app.trial_licenses
  to schoolsafe_owner
  using (school_id = iam.current_school_id() and iam.context_is_valid())
  with check (school_id = iam.current_school_id() and iam.context_is_valid());

create policy trial_licenses_migrator_select on app.trial_licenses
  for select to schoolsafe_migrator
  using (session_user = 'schoolsafe_migrator');

create policy trial_licenses_migrator_insert on app.trial_licenses
  for insert to schoolsafe_migrator
  with check (session_user = 'schoolsafe_migrator');

create policy trial_licenses_migrator_update on app.trial_licenses
  for update to schoolsafe_migrator
  using (session_user = 'schoolsafe_migrator')
  with check (session_user = 'schoolsafe_migrator');

-- ─── Audit opérateur : un événement de transition exige un contexte valide.
grant usage on schema app to schoolsafe_migrator;
grant usage on schema iam to schoolsafe_migrator;
grant usage on schema audit to schoolsafe_migrator;
grant select on audit.events to schoolsafe_migrator;
grant select on app.schools to schoolsafe_migrator;
grant select on iam.profiles to schoolsafe_migrator;
grant select, insert, update on app.trial_licenses to schoolsafe_migrator;

-- Le migrateur n'a pas de profil d'école : ce helper emprunte le premier
-- profil actif de l'école, écrit l'événement, puis RESTAURE le contexte
-- (même discipline que ops.bootstrap_school).
create or replace function iam.trial_audit(
  p_school_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
declare
  v_user uuid;
  v_profile uuid;
  v_old_school text := pg_catalog.current_setting('schoolsafe.school_id', true);
  v_old_user text := pg_catalog.current_setting('schoolsafe.user_id', true);
  v_old_profile text := pg_catalog.current_setting('schoolsafe.profile_id', true);
  v_old_request text := pg_catalog.current_setting('schoolsafe.request_id', true);
begin
  select p.user_id, p.id into v_user, v_profile
  from iam.profiles p
  where p.school_id = p_school_id and p.is_active = true
  order by p.created_at
  limit 1;

  if not found then
    return;
  end if;

  perform pg_catalog.set_config('schoolsafe.school_id', p_school_id::text, true);
  perform pg_catalog.set_config('schoolsafe.user_id', v_user::text, true);
  perform pg_catalog.set_config('schoolsafe.profile_id', v_profile::text, true);
  perform pg_catalog.set_config('schoolsafe.request_id', pg_catalog.gen_random_uuid()::text, true);

  perform audit.write_event(p_event_type, 'school', p_school_id, p_payload);

  perform pg_catalog.set_config('schoolsafe.school_id', coalesce(v_old_school, ''), true);
  perform pg_catalog.set_config('schoolsafe.user_id', coalesce(v_old_user, ''), true);
  perform pg_catalog.set_config('schoolsafe.profile_id', coalesce(v_old_profile, ''), true);
  perform pg_catalog.set_config('schoolsafe.request_id', coalesce(v_old_request, ''), true);
end
$schoolsafe$;


-- Le migrateurrôle de provisioning invoker lit les écoles et les profils.
do $schoolsafe$
begin
  execute pg_catalog.format('drop policy if exists %I on %s', 'schools_migrator_select', 'app.schools');
  execute pg_catalog.format('drop policy if exists %I on %s', 'profiles_migrator_select', 'iam.profiles');
end
$schoolsafe$;

create policy schools_migrator_select on app.schools
  for select to schoolsafe_migrator
  using (session_user = 'schoolsafe_migrator');

create policy profiles_migrator_select on iam.profiles
  for select to schoolsafe_migrator
  using (session_user = 'schoolsafe_migrator');

-- État courant d'une licence (pur, stable).
create or replace function iam.trial_state(
  p_status text,
  p_expires_at timestamptz,
  p_grace_ends_at timestamptz
)
returns text
language sql
stable
set search_path = pg_catalog
as $schoolsafe$
  select case
    when p_status = 'converted' then 'converted'
    when pg_catalog.now() < p_expires_at then 'active'
    when pg_catalog.now() < p_grace_ends_at then 'grace'
    else 'expired'
  end
$schoolsafe$;

-- Porte d'application : vrai si l'école peut utiliser le service.
create or replace function iam.trial_gate(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select coalesce((
    select iam.trial_state(l.status, l.expires_at, l.grace_ends_at) in ('active', 'grace', 'converted')
    from app.trial_licenses l
    where l.school_id = p_school_id
  ), false)
$schoolsafe$;

-- Lecture du statut : l'école lit SON statut (contexte tenant requis).
create or replace function api.trial_status_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_license app.trial_licenses%rowtype;
  v_state text;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Active SchoolSafe context required';
  end if;

  select * into v_license from app.trial_licenses l where l.school_id = v_school_id;
  if not found then
    return jsonb_build_object('status', 'no_license');
  end if;

  v_state := iam.trial_state(v_license.status, v_license.expires_at, v_license.grace_ends_at);

  return jsonb_build_object(
    'school_id', v_school_id,
    'status', v_state,
    'started_at', v_license.started_at,
    'expires_at', v_license.expires_at,
    'grace_ends_at', v_license.grace_ends_at,
    'days_remaining', greatest(0, extract(day from v_license.expires_at - pg_catalog.now())::integer)
  );
end
$schoolsafe$;

grant execute on function api.trial_status_read() to schoolsafe_api;

-- Faucheuse (worker/migrator) : active → grace → expired, chaque transition auditée.
create or replace function ops.trial_reap()
returns integer
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
declare
  v_row record;
  v_new_state text;
  v_count integer := 0;
begin
  if session_user <> 'schoolsafe_migrator' then
    raise insufficient_privilege using message = 'Offline migration login required';
  end if;

  for v_row in
    select l.school_id, l.status, l.expires_at, l.grace_ends_at
    from app.trial_licenses l
    where l.status in ('active', 'grace')
  loop
    v_new_state := iam.trial_state(v_row.status, v_row.expires_at, v_row.grace_ends_at);
    if v_new_state <> v_row.status then
      update app.trial_licenses
      set status = v_new_state, updated_at = pg_catalog.now()
      where school_id = v_row.school_id;
      perform iam.trial_audit(v_row.school_id, 'trial.status.changed', jsonb_build_object('operator', session_user, 'from', v_row.status, 'to', v_new_state));
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end
$schoolsafe$;

-- Démarrage d'un essai : appelé par l'opérateur juste après ops.bootstrap_school
-- (même script de provisioning Control — le bootstrap reste agnostique).
create or replace function ops.trial_start(
  p_school_id uuid,
  p_trial_days integer default 14,
  p_grace_days integer default 7
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
begin
  if session_user <> 'schoolsafe_migrator' then
    raise insufficient_privilege using message = 'Offline migration login required';
  end if;
  if p_trial_days < 1 or p_trial_days > 90 or p_grace_days < 1 or p_grace_days > 30 then
    raise check_violation using message = 'Trial and grace durations must stay within safe bounds';
  end if;
  if not exists (select 1 from app.schools s where s.id = p_school_id) then
    raise foreign_key_violation using message = 'Unknown school';
  end if;
  if exists (select 1 from app.trial_licenses l where l.school_id = p_school_id) then
    raise unique_violation using message = 'Trial already exists for this school';
  end if;

  insert into app.trial_licenses (school_id, expires_at, grace_ends_at)
  values (
    p_school_id,
    pg_catalog.now() + (p_trial_days || ' days')::interval,
    pg_catalog.now() + ((p_trial_days + p_grace_days) || ' days')::interval
  );

  perform iam.trial_audit(p_school_id, 'trial.started', jsonb_build_object('operator', session_user, 'trial_days', p_trial_days, 'grace_days', p_grace_days));

  return jsonb_build_object('school_id', p_school_id, 'status', 'active', 'trial_days', p_trial_days);
end
$schoolsafe$;

-- Conversion (promotion en place — arbitrage A1) : action opérateur payée.
create or replace function ops.trial_convert(p_school_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
begin
  if session_user <> 'schoolsafe_migrator' then
    raise insufficient_privilege using message = 'Offline migration login required';
  end if;

  update app.trial_licenses
  set status = 'converted', converted_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where school_id = p_school_id and status in ('active', 'grace', 'expired');

  if not found then
    raise foreign_key_violation using message = 'No trial license to convert for this school';
  end if;

  perform iam.trial_audit(p_school_id, 'trial.converted', jsonb_build_object('operator', session_user));

  return jsonb_build_object('school_id', p_school_id, 'status', 'converted');
end
$schoolsafe$;

revoke all on function ops.trial_start(uuid, integer, integer) from public, schoolsafe_api, schoolsafe_worker;
revoke all on function ops.trial_reap() from public, schoolsafe_api, schoolsafe_worker;
revoke all on function ops.trial_convert(uuid) from public, schoolsafe_api, schoolsafe_worker;
grant execute on function ops.trial_start(uuid, integer, integer) to schoolsafe_migrator;
grant execute on function ops.trial_reap() to schoolsafe_migrator;
grant execute on function ops.trial_convert(uuid) to schoolsafe_migrator;
grant execute on function iam.trial_audit(uuid, text, jsonb) to schoolsafe_migrator;
revoke all on function iam.trial_audit(uuid, text, jsonb) from public, schoolsafe_api, schoolsafe_worker;
grant execute on function audit.write_event(text, text, uuid, jsonb) to schoolsafe_migrator;

-- Fonctions internes : porte et état, accessibles au serveur (api) et aux preuves (migrateur).
grant execute on function iam.trial_state(text, timestamptz, timestamptz) to schoolsafe_api, schoolsafe_migrator;
grant execute on function iam.trial_gate(uuid) to schoolsafe_api, schoolsafe_migrator;
revoke all on function iam.trial_state(text, timestamptz, timestamptz) from public, schoolsafe_worker;
revoke all on function iam.trial_gate(uuid) from public, schoolsafe_worker, schoolsafe_auth;

commit;
