\set ON_ERROR_STOP on
-- Additive adult provisioning. S5.1 accepts only the existing teacher template.
begin;
set local role schoolsafe_owner;

create function api.provision_school_adult_guard(p_email text, p_phone text, p_role_code text)
returns table(email text, phone text, school_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(pg_catalog.btrim(coalesce(p_phone, '')), '');
  v_school uuid;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Verified school context required';
  end if;
  perform iam.require_access('staff.manage');
  v_school := iam.current_school_id();
  if v_school is null or p_role_code is distinct from 'teacher' then
    raise check_violation using message = 'ROLE_REFUSED';
  end if;
  if v_email is null
     or pg_catalog.length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     or v_phone is null then
    raise check_violation using message = 'IDENTITY_INVALID';
  end if;
  v_phone := nullif(auth.normalize_login(v_phone), '');
  if v_phone is null or v_phone !~ '^\+243[0-9]{9}$' then
    raise check_violation using message = 'IDENTITY_INVALID';
  end if;
  if not exists (
    select 1
      from iam.roles r
     where r.school_id = v_school
       and r.code = 'teacher'
       and r.is_active
  ) then
    raise check_violation using message = 'TEACHER_ROLE_MISSING';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('school-adult-email:' || v_email, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('school-adult-phone:' || v_phone, 0));
  if exists (
    select 1
      from iam.users u
     where pg_catalog.lower(u.email) = v_email
        or u.phone = v_phone
  ) then
    raise unique_violation using message = 'IDENTITY_CONFLICT';
  end if;
  return query select v_email, v_phone, v_school;
end
$fn$;

create function api.provision_school_adult_prepare(p_email text, p_phone text, p_role_code text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
begin
  perform api.provision_school_adult_guard(p_email, p_phone, p_role_code);
end
$fn$;

create function api.provision_school_adult(
  p_subject uuid,
  p_email text,
  p_phone text,
  p_role_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_email text;
  v_phone text;
  v_school uuid;
  v_user uuid;
  v_profile uuid;
  v_role uuid;
begin
  if p_subject is null then
    raise check_violation using message = 'IDENTITY_INVALID';
  end if;
  select g.email, g.phone, g.school_id
    into v_email, v_phone, v_school
    from api.provision_school_adult_guard(p_email, p_phone, p_role_code) g;
  if exists (
    select 1
      from iam.users u
     where u.auth_provider = 'supabase'
       and u.external_subject = p_subject::text
  ) then
    raise unique_violation using message = 'IDENTITY_CONFLICT';
  end if;
  select r.id into v_role
    from iam.roles r
   where r.school_id = v_school
     and r.code = 'teacher'
     and r.is_active;
  v_user := pg_catalog.gen_random_uuid();
  v_profile := pg_catalog.gen_random_uuid();
  insert into iam.users (
    id, auth_provider, external_subject, email, phone, is_active, must_change_password
  ) values (
    v_user, 'supabase', p_subject::text, v_email, v_phone, true, true
  );
  insert into iam.profiles (
    id, user_id, school_id, display_name, email, phone, is_active, account_status
  ) values (
    v_profile, v_user, v_school, v_email, v_email, v_phone, true, 'active'
  );
  insert into iam.profile_roles (school_id, profile_id, role_id, assigned_by)
  values (v_school, v_profile, v_role, iam.current_profile_id());
  perform audit.write_event(
    'staff.provisioned',
    'profile',
    v_profile,
    pg_catalog.jsonb_build_object('role_code', 'teacher', 'user_id', v_user)
  );
  return pg_catalog.jsonb_build_object(
    'user_id', v_user,
    'profile_id', v_profile,
    'school_id', v_school,
    'role_code', 'teacher'
  );
end
$fn$;

revoke all on function api.provision_school_adult_guard(text, text, text)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.provision_school_adult_prepare(text, text, text)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.provision_school_adult(uuid, text, text, text)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
grant execute on function api.provision_school_adult_prepare(text, text, text) to schoolsafe_api;
grant execute on function api.provision_school_adult(uuid, text, text, text) to schoolsafe_api;

commit;
