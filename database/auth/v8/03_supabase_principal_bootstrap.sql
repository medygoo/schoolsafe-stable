\set ON_ERROR_STOP on
-- One-time insert gate for the first Supabase principal school.
-- Older activation paths keep their own predicate and are not altered here.
begin;
set local role schoolsafe_owner;

create table auth.supabase_principal_bootstrap (
  user_id uuid primary key references iam.users (id),
  subject text not null,
  bootstrap_school_id uuid,
  bootstrap_txid bigint,
  completed_at timestamptz
);
alter table auth.supabase_principal_bootstrap enable row level security;
alter table auth.supabase_principal_bootstrap force row level security;
create policy supabase_principal_bootstrap_owner on auth.supabase_principal_bootstrap
  to schoolsafe_owner using (true) with check (true);
revoke all on auth.supabase_principal_bootstrap
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;

create function auth.supabase_principal_bootstrap_allows(p_school_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $fn$
declare
  v_old text := coalesce(pg_catalog.current_setting('schoolsafe.preauth', true), '');
  v_ok boolean := false;
begin
  if session_user <> 'schoolsafe_auth' or p_school_id is null then
    return false;
  end if;
  perform pg_catalog.set_config('schoolsafe.preauth', 'on', true);
  select exists (
    select 1
      from auth.supabase_principal_bootstrap b
      join iam.users u on u.id = b.user_id
     where b.bootstrap_school_id = p_school_id
       and b.bootstrap_txid = pg_catalog.txid_current()
       and b.completed_at is null
       and u.is_active
       and u.auth_provider = 'supabase'
       and u.external_subject = b.subject
       and not exists (select 1 from iam.profiles p where p.user_id = u.id)
  ) into v_ok;
  perform pg_catalog.set_config('schoolsafe.preauth', v_old, true);
  return coalesce(v_ok, false);
end
$fn$;

revoke all on function auth.supabase_principal_bootstrap_allows(uuid)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;

create policy schools_supabase_bootstrap_insert on app.schools
  for insert to schoolsafe_owner
  with check (not is_active and setup_completed_at is null and auth.supabase_principal_bootstrap_allows(id));
create policy years_supabase_bootstrap_insert on app.academic_years
  for insert to schoolsafe_owner
  with check (not is_active and auth.supabase_principal_bootstrap_allows(school_id));
create policy cycles_supabase_bootstrap_insert on app.school_cycles
  for insert to schoolsafe_owner
  with check (auth.supabase_principal_bootstrap_allows(school_id));
create policy contacts_supabase_bootstrap_insert on app.school_contacts
  for insert to schoolsafe_owner
  with check (auth.supabase_principal_bootstrap_allows(school_id));

create or replace function api.auth_supabase_principal_create_school(p_subject uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_old text := coalesce(pg_catalog.current_setting('schoolsafe.preauth', true), '');
  v_user uuid;
  v_email text;
  v_phone text;
  v_identity uuid;
  v_first text;
  v_last text;
  v_school uuid := pg_catalog.gen_random_uuid();
  v_year uuid := pg_catalog.gen_random_uuid();
  v_profile uuid := pg_catalog.gen_random_uuid();
  v_role uuid;
  v_cycle text;
  v_key text;
  v_must boolean;
  v_saved jsonb := '{}'::jsonb;
begin
  if session_user <> 'schoolsafe_auth' then
    raise insufficient_privilege;
  end if;
  if p_subject is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise check_violation using message = 'Invalid school payload';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) k
    where k in ('school_id', 'user_id', 'profile_id', 'role', 'external_subject')
  ) then
    raise check_violation using message = 'Invalid school payload';
  end if;

  perform pg_catalog.set_config('schoolsafe.preauth', 'on', true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supabase-principal:' || p_subject::text, 0));

  select u.id, u.email, u.phone into v_user, v_email, v_phone
    from iam.users u
   where u.auth_provider = 'supabase'
     and u.external_subject = p_subject::text
     and u.is_active;
  if v_user is null then
    raise insufficient_privilege using message = 'Onboarding unavailable';
  end if;
  if exists (select 1 from iam.profiles p where p.user_id = v_user) then
    raise unique_violation using message = 'PRINCIPAL_ONBOARDING_EXISTS';
  end if;

  if jsonb_typeof(p_payload->'admin') is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_payload->'admin') k where k not in ('first_name', 'last_name'))
     or length(btrim(coalesce(p_payload#>>'{admin,first_name}', ''))) not between 1 and 100
     or length(btrim(coalesce(p_payload#>>'{admin,last_name}', ''))) not between 1 and 100
     or jsonb_typeof(p_payload#>'{admin,first_name}') is distinct from 'string'
     or jsonb_typeof(p_payload#>'{admin,last_name}') is distinct from 'string' then
    raise check_violation using message = 'Invalid school payload';
  end if;
  v_first := btrim(p_payload#>>'{admin,first_name}');
  v_last := btrim(p_payload#>>'{admin,last_name}');
  p_payload := p_payload - 'admin';
  if exists (select 1 from jsonb_object_keys(p_payload) k where k not in ('identity', 'cycles', 'academic_year', 'contact', 'brand'))
     or exists (select 1 from unnest(array['identity', 'academic_year', 'contact', 'brand']) k where jsonb_typeof(p_payload->k) is distinct from 'object')
     or jsonb_typeof(p_payload->'cycles') is distinct from 'array'
     or exists (select 1 from jsonb_object_keys(p_payload->'identity') k where k not in ('name_fr', 'name_en', 'legal_name', 'school_type', 'approval_code'))
     or exists (select 1 from jsonb_object_keys(p_payload->'academic_year') k where k not in ('label', 'starts_on', 'ends_on', 'periods'))
     or exists (select 1 from jsonb_object_keys(p_payload->'brand') k where k not in ('primary_color', 'accent_color', 'document_footer'))
     or exists (select 1 from jsonb_object_keys(p_payload->'contact') k where k not in ('country', 'province', 'city', 'address', 'email', 'phone', 'website_url', 'website_mode', 'public_news', 'public_gallery', 'public_honors'))
     or nullif(btrim(p_payload#>>'{identity,name_fr}'), '') is null
     or nullif(btrim(p_payload#>>'{academic_year,label}'), '') is null
     or (p_payload#>>'{academic_year,starts_on}')::date is null
     or (p_payload#>>'{academic_year,ends_on}')::date is null
     or (p_payload#>>'{academic_year,ends_on}')::date <= (p_payload#>>'{academic_year,starts_on}')::date
     or jsonb_array_length(p_payload->'cycles') = 0
     or exists (select 1 from jsonb_array_elements_text(p_payload->'cycles') c where c not in ('nursery', 'primary', 'secondary') or c is null) then
    raise check_violation using message = 'Invalid school payload';
  end if;

  select i.id into v_identity from auth.identities i where i.user_id = v_user;
  if v_identity is null then
    if exists (
      select 1 from auth.identities i
      where (v_email is not null and i.email::text = v_email)
         or (v_phone is not null and i.phone = v_phone)
    ) then
      raise unique_violation using message = 'IDENTITY_CONFLICT';
    end if;
    v_identity := pg_catalog.gen_random_uuid();
    insert into auth.identities (id, user_id, email, phone, status)
    values (v_identity, v_user, v_email::auth.citext, v_phone, 'active');
  end if;

  insert into auth.supabase_principal_bootstrap (user_id, subject)
  values (v_user, p_subject::text)
  on conflict (user_id) do update
    set subject = excluded.subject
  where auth.supabase_principal_bootstrap.completed_at is null;
  update auth.supabase_principal_bootstrap
     set bootstrap_school_id = v_school, bootstrap_txid = pg_catalog.txid_current()
   where user_id = v_user and completed_at is null;
  if not auth.supabase_principal_bootstrap_allows(v_school) then
    raise insufficient_privilege using message = 'Onboarding unavailable';
  end if;

  foreach v_key in array array['school_id', 'user_id', 'profile_id', 'request_id', 'preauth'] loop
    v_saved := v_saved || jsonb_build_object(v_key, coalesce(pg_catalog.current_setting('schoolsafe.' || v_key, true), ''));
  end loop;
  perform pg_catalog.set_config('schoolsafe.school_id', v_school::text, true);

  insert into app.schools (id, code, name, name_en, legal_name, school_type, approval_code, primary_color, accent_color, document_footer, logo_path, is_active)
  values (
    v_school,
    'SCH-' || upper(substr(replace(v_school::text, '-', ''), 1, 12)),
    btrim(p_payload#>>'{identity,name_fr}'),
    p_payload#>>'{identity,name_en}',
    p_payload#>>'{identity,legal_name}',
    coalesce(p_payload#>>'{identity,school_type}', 'Privée agréée'),
    p_payload#>>'{identity,approval_code}',
    coalesce(p_payload#>>'{brand,primary_color}', '#071a3d'),
    coalesce(p_payload#>>'{brand,accent_color}', '#e9a515'),
    p_payload#>>'{brand,document_footer}',
    null,
    false
  );
  insert into app.academic_years (id, school_id, label, starts_on, ends_on, periods, is_active)
  values (
    v_year, v_school, p_payload#>>'{academic_year,label}',
    (p_payload#>>'{academic_year,starts_on}')::date,
    (p_payload#>>'{academic_year,ends_on}')::date,
    coalesce(p_payload#>>'{academic_year,periods}', 'Trimestres'),
    false
  );
  for v_cycle in select distinct jsonb_array_elements_text(p_payload->'cycles') loop
    insert into app.school_cycles (school_id, cycle_key, cycle_name)
    values (v_school, v_cycle, case v_cycle when 'nursery' then 'Maternelle' when 'primary' then 'Primaire' else 'Secondaire et Humanités' end);
  end loop;
  insert into app.school_contacts (school_id, country, province, city, address, email, phone, website_url, website_mode, public_news, public_gallery, public_honors)
  values (
    v_school,
    coalesce(p_payload#>>'{contact,country}', 'République démocratique du Congo'),
    coalesce(p_payload#>>'{contact,province}', 'Kinshasa'),
    coalesce(p_payload#>>'{contact,city}', 'Kinshasa'),
    p_payload#>>'{contact,address}',
    p_payload#>>'{contact,email}',
    p_payload#>>'{contact,phone}',
    nullif(p_payload#>>'{contact,website_url}', ''),
    coalesce(p_payload#>>'{contact,website_mode}', 'Créer un nouveau site SchoolSafe'),
    coalesce(p_payload#>>'{contact,public_news}', 'Après validation'),
    coalesce(p_payload#>>'{contact,public_gallery}', 'Après validation et consentement'),
    coalesce(p_payload#>>'{contact,public_honors}', 'Après validation')
  );
  insert into iam.profiles (id, user_id, school_id, display_name, first_name, last_name, email, phone, is_active)
  values (v_profile, v_user, v_school, v_first || ' ' || v_last, v_first, v_last, v_email, v_phone, true);
  perform api.set_request_context(v_user, v_profile, v_school, pg_catalog.gen_random_uuid());
  perform iam.provision_school_roles(v_school, v_profile);
  select id into v_role from iam.roles where school_id = v_school and code = 'admin' and is_active;
  if v_role is null then
    raise check_violation using message = 'Canonical administrator required';
  end if;
  insert into iam.profile_roles (school_id, profile_id, role_id) values (v_school, v_profile, v_role);
  perform iam.require_access('roles.manage');
  insert into app.school_settings (school_id) values (v_school);
  update app.schools set is_active = true, setup_completed_at = pg_catalog.clock_timestamp() where id = v_school;
  update app.academic_years set is_active = true where id = v_year;
  perform audit.write_event('school.onboarding.completed', 'school', v_school, jsonb_build_object('admin_profile_id', v_profile));
  update auth.supabase_principal_bootstrap
     set completed_at = pg_catalog.clock_timestamp(), bootstrap_school_id = null, bootstrap_txid = null
   where user_id = v_user;

  select coalesce(c.must_change, true) into v_must
    from auth.identities i
    left join auth.credentials c on c.identity_id = i.id
   where i.user_id = v_user;

  foreach v_key in array array['school_id', 'user_id', 'profile_id', 'request_id', 'preauth'] loop
    perform pg_catalog.set_config('schoolsafe.' || v_key, v_saved->>v_key, true);
  end loop;
  perform pg_catalog.set_config('schoolsafe.preauth', v_old, true);

  return jsonb_build_object(
    'school_id', v_school,
    'profile_id', v_profile,
    'user_id', v_user,
    'status', 'completed',
    'school_created', true,
    'principal_profile_created', true,
    'must_change', v_must,
    'role', 'admin'
  );
end
$fn$;

revoke all on function api.auth_supabase_principal_create_school(uuid, jsonb)
  from public, schoolsafe_api, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
grant execute on function api.auth_supabase_principal_create_school(uuid, jsonb) to schoolsafe_auth;

commit;
