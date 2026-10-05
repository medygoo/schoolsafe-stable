\set ON_ERROR_STOP on
-- One person engine. A future biometric reference is app.staff_profiles.id.
-- No fingerprint image is stored.
begin;
set local role schoolsafe_owner;

alter table iam.profiles add column if not exists middle_name text;
alter table iam.profiles add column if not exists photo_path text;

create table if not exists app.staff_profiles (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null references app.schools(id),
  profile_id uuid not null,
  employee_number text not null,
  job_title text not null,
  hired_on date,
  created_at timestamptz not null default pg_catalog.now(),
  unique (school_id, profile_id),
  unique (school_id, employee_number),
  foreign key (school_id, profile_id) references iam.profiles(school_id, id)
);

comment on column app.staff_profiles.id is
  'Future biometric staff reference. The professional dossier belongs to iam.profiles. No fingerprint image is stored.';

alter table app.staff_profiles enable row level security;
alter table app.staff_profiles force row level security;

drop policy if exists staff_profiles_school on app.staff_profiles;
create policy staff_profiles_school on app.staff_profiles
  to schoolsafe_owner
  using (school_id = iam.current_school_id() and iam.context_is_valid())
  with check (school_id = iam.current_school_id() and iam.context_is_valid());

revoke all on app.staff_profiles
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;

create unique index if not exists student_guardians_one_active_father
  on app.student_guardians (school_id, student_id)
  where is_active and guardian_type = 'pere';

create unique index if not exists student_guardians_one_active_mother
  on app.student_guardians (school_id, student_id)
  where is_active and guardian_type = 'mere';

create unique index if not exists student_guardians_one_active_tutor
  on app.student_guardians (school_id, student_id)
  where is_active and guardian_type = 'tuteur';

create unique index if not exists teacher_assignments_one_active_tutor
  on app.teacher_assignments (school_id, class_id)
  where is_active and is_tutor;

create or replace function app.family_primary_invariant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_student uuid;
  v_school uuid;
  v_active integer;
  v_primary integer;
begin
  v_student := coalesce(new.student_id, old.student_id);
  v_school := coalesce(new.school_id, old.school_id);
  select count(*) filter (where is_active),
         count(*) filter (where is_active and is_primary)
    into v_active, v_primary
    from app.student_guardians
   where school_id = v_school
     and student_id = v_student;
  if v_active > 0 and v_primary <> 1 then
    raise exception 'PRIMARY_GUARDIAN_REQUIRED' using errcode = '23514';
  end if;
  return null;
end
$fn$;

drop trigger if exists student_guardians_primary_invariant on app.student_guardians;
create constraint trigger student_guardians_primary_invariant
  after insert or update or delete on app.student_guardians
  deferrable initially deferred
  for each row
  execute function app.family_primary_invariant();

create or replace function app.sync_class_homeroom()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_class uuid;
  v_school uuid;
  v_profile uuid;
begin
  v_class := coalesce(new.class_id, old.class_id);
  v_school := coalesce(new.school_id, old.school_id);
  select teacher_profile_id into v_profile
    from app.teacher_assignments
   where school_id = v_school
     and class_id = v_class
     and is_tutor
     and is_active
   limit 1;
  update app.classes
     set teacher_profile_id = v_profile,
         updated_at = pg_catalog.now()
   where id = v_class
     and school_id = v_school
     and teacher_profile_id is distinct from v_profile;
  return null;
end
$fn$;

drop trigger if exists teacher_assignments_sync_homeroom on app.teacher_assignments;
create trigger teacher_assignments_sync_homeroom
  after insert or update or delete on app.teacher_assignments
  for each row
  execute function app.sync_class_homeroom();

create or replace function api.person_display_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $fn$
  select coalesce(
    nullif(pg_catalog.concat_ws(' ',
      nullif(pg_catalog.btrim(last_name), ''),
      nullif(pg_catalog.btrim(middle_name), ''),
      nullif(pg_catalog.btrim(first_name), '')
    ), ''),
    display_name
  )
    from iam.profiles
   where id = p_profile_id;
$fn$;

create or replace function api.card_class_teacher(p_class_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $fn$
  select api.person_display_name(ta.teacher_profile_id)
    from app.teacher_assignments ta
   where ta.class_id = p_class_id
     and ta.school_id = iam.current_school_id()
     and ta.is_tutor
     and ta.is_active
   limit 1;
$fn$;

create or replace function api.provision_school_person_prepare(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school uuid := iam.current_school_id();
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'email', '')));
  v_phone text := pg_catalog.btrim(coalesce(p_payload->>'phone', ''));
  v_first text := pg_catalog.btrim(coalesce(p_payload->>'first_name', ''));
  v_last text := pg_catalog.btrim(coalesce(p_payload->>'last_name', ''));
  v_roles text[];
  v_staff boolean;
  v_parent boolean;
  v_profile uuid;
begin
  if iam.current_profile_id() is null or not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Verified school context required';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or v_phone !~ '^\+243[0-9]{9}$'
     or v_first = '' or v_last = ''
     or pg_catalog.jsonb_typeof(p_payload->'role_codes') <> 'array' then
    raise exception 'IDENTITY_INVALID' using errcode = '23514';
  end if;
  select coalesce(array_agg(value), '{}'::text[])
    into v_roles
    from jsonb_array_elements_text(p_payload->'role_codes') as value;
  if cardinality(v_roles) < 1 or cardinality(v_roles) > 8
     or exists (
       select 1 from unnest(v_roles) code
        where code not in ('teacher','school_head','pedagogy','cashier','guard','parent','fee_control','hr','staff')
     ) then
    raise exception 'ROLE_REFUSED' using errcode = '23514';
  end if;
  v_staff := exists (select 1 from unnest(v_roles) code where code <> 'parent');
  v_parent := 'parent' = any (v_roles);
  if v_staff then
    perform iam.require_access('staff.manage');
  end if;
  if v_parent then
    perform iam.require_access('school.guardian.manage');
  end if;
  if v_staff and (
    pg_catalog.btrim(coalesce(p_payload->>'employee_number', '')) = ''
    or pg_catalog.btrim(coalesce(p_payload->>'job_title', '')) = ''
  ) then
    raise exception 'STAFF_FIELDS_REQUIRED' using errcode = '23514';
  end if;
  select p.id into v_profile
    from iam.users u
    join iam.profiles p on p.user_id = u.id and p.school_id = v_school
   where pg_catalog.lower(u.email) = v_email
   limit 1;
  if v_profile is not null then
    return pg_catalog.jsonb_build_object('status', 'reuse', 'profile_id', v_profile);
  end if;
  if exists (
    select 1 from iam.users u where pg_catalog.lower(u.email) = v_email
  ) then
    raise exception 'LINK_REQUIRED' using errcode = '23514';
  end if;
  return pg_catalog.jsonb_build_object('status', 'create');
end
$fn$;

create or replace function api.provision_school_person(p_subject uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school uuid := iam.current_school_id();
  v_actor uuid := iam.current_profile_id();
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'email', '')));
  v_phone text := pg_catalog.btrim(coalesce(p_payload->>'phone', ''));
  v_first text := pg_catalog.btrim(coalesce(p_payload->>'first_name', ''));
  v_last text := pg_catalog.btrim(coalesce(p_payload->>'last_name', ''));
  v_middle text := nullif(pg_catalog.btrim(coalesce(p_payload->>'middle_name', '')), '');
  v_photo text := nullif(pg_catalog.btrim(coalesce(p_payload->>'photo_path', '')), '');
  v_display text;
  v_roles text[];
  v_role text;
  v_staff boolean;
  v_parent boolean;
  v_user uuid;
  v_profile uuid;
  v_role_id uuid;
  v_reused boolean := false;
begin
  if v_actor is null or not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Verified school context required';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'role_codes') <> 'array' then
    raise exception 'ROLE_REFUSED' using errcode = '23514';
  end if;
  select coalesce(array_agg(value), '{}'::text[]) into v_roles
    from jsonb_array_elements_text(p_payload->'role_codes') as value;
  if exists (
    select 1 from unnest(v_roles) code
     where code not in ('teacher','school_head','pedagogy','cashier','guard','parent','fee_control','hr','staff')
  ) then
    raise exception 'ROLE_REFUSED' using errcode = '23514';
  end if;
  v_staff := exists (select 1 from unnest(v_roles) code where code <> 'parent');
  v_parent := 'parent' = any (v_roles);
  if v_staff then
    perform iam.require_access('staff.manage');
  end if;
  if v_parent then
    perform iam.require_access('school.guardian.manage');
  end if;
  if v_staff and (
    pg_catalog.btrim(coalesce(p_payload->>'employee_number', '')) = ''
    or pg_catalog.btrim(coalesce(p_payload->>'job_title', '')) = ''
  ) then
    raise exception 'STAFF_FIELDS_REQUIRED' using errcode = '23514';
  end if;
  v_display := pg_catalog.concat_ws(' ', v_last, v_middle, v_first);
  select u.id into v_user
    from iam.users u
    join iam.profiles p on p.user_id = u.id and p.school_id = v_school
   where pg_catalog.lower(u.email) = v_email
   limit 1;
  if v_user is null and p_subject is not null then
    select u.id into v_user
      from iam.users u
      join iam.profiles p on p.user_id = u.id and p.school_id = v_school
     where u.external_subject = p_subject::text
     limit 1;
  end if;
  if v_user is null then
    if p_subject is null then
      raise exception 'IDENTITY_INVALID' using errcode = '23514';
    end if;
    if exists (select 1 from iam.users u where pg_catalog.lower(u.email) = v_email) then
      raise exception 'LINK_REQUIRED' using errcode = '23514';
    end if;
    v_user := pg_catalog.gen_random_uuid();
    v_profile := pg_catalog.gen_random_uuid();
    insert into iam.users (
      id, auth_provider, external_subject, email, phone, is_active, must_change_password
    ) values (
      v_user, 'supabase', p_subject::text, v_email, v_phone, true, true
    );
    insert into iam.profiles (
      id, user_id, school_id, display_name, first_name, middle_name, last_name,
      email, phone, photo_path, is_active, account_status
    ) values (
      v_profile, v_user, v_school, v_display, v_first, v_middle, v_last,
      v_email, v_phone, v_photo, true, 'active'
    );
  else
    v_reused := true;
    select id into v_profile
      from iam.profiles
     where user_id = v_user and school_id = v_school
     limit 1;
    update iam.profiles
       set first_name = v_first,
           middle_name = coalesce(v_middle, middle_name),
           last_name = v_last,
           display_name = v_display,
           phone = v_phone,
           photo_path = coalesce(v_photo, photo_path)
     where id = v_profile
       and school_id = v_school;
  end if;
  foreach v_role in array v_roles loop
    select id into v_role_id
      from iam.roles
     where school_id = v_school and code = v_role and is_active
     limit 1;
    if v_role_id is null then
      raise exception 'ROLE_REFUSED' using errcode = '23514';
    end if;
    insert into iam.profile_roles (school_id, profile_id, role_id, assigned_by)
    values (v_school, v_profile, v_role_id, v_actor)
    on conflict (profile_id, role_id) do nothing;
  end loop;
  if v_staff and not exists (
    select 1 from app.staff_profiles
     where school_id = v_school and profile_id = v_profile
  ) then
    insert into app.staff_profiles (school_id, profile_id, employee_number, job_title, hired_on)
    values (
      v_school,
      v_profile,
      pg_catalog.btrim(p_payload->>'employee_number'),
      pg_catalog.btrim(p_payload->>'job_title'),
      nullif(p_payload->>'hired_on', '')::date
    );
  end if;
  perform audit.write_event(
    'staff.provisioned',
    'profile',
    v_profile,
    pg_catalog.jsonb_build_object('role_codes', to_jsonb(v_roles), 'user_id', v_user, 'reused', v_reused)
  );
  return pg_catalog.jsonb_build_object(
    'profile_id', v_profile,
    'user_id', v_user,
    'school_id', v_school,
    'reused', v_reused
  );
end
$fn$;

create or replace function api.provision_school_profile_link(p_subject text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school uuid := iam.current_school_id();
  v_actor uuid := iam.current_profile_id();
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'email', '')));
  v_user uuid;
  v_profile uuid;
  v_roles text[];
  v_role text;
  v_role_id uuid;
  v_staff boolean;
  v_parent boolean;
  v_display text;
begin
  if v_actor is null or pg_catalog.btrim(coalesce(p_subject, '')) = '' then
    raise exception 'LINK_SUBJECT_UNKNOWN' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'role_codes') <> 'array' then
    raise exception 'ROLE_REFUSED' using errcode = '23514';
  end if;
  select coalesce(array_agg(value), '{}'::text[]) into v_roles
    from jsonb_array_elements_text(p_payload->'role_codes') as value;
  if exists (
    select 1 from unnest(v_roles) code
     where code not in ('teacher','school_head','pedagogy','cashier','guard','parent','fee_control','hr','staff')
  ) then
    raise exception 'ROLE_REFUSED' using errcode = '23514';
  end if;
  v_staff := exists (select 1 from unnest(v_roles) code where code <> 'parent');
  v_parent := 'parent' = any (v_roles);
  if v_staff then
    perform iam.require_access('staff.manage');
  end if;
  if v_parent then
    perform iam.require_access('school.guardian.manage');
  end if;
  if v_staff and (
    pg_catalog.btrim(coalesce(p_payload->>'employee_number', '')) = ''
    or pg_catalog.btrim(coalesce(p_payload->>'job_title', '')) = ''
  ) then
    raise exception 'STAFF_FIELDS_REQUIRED' using errcode = '23514';
  end if;
  select u.id into v_user
    from iam.users u
   where u.external_subject = pg_catalog.btrim(p_subject)
     and u.auth_provider = 'supabase'
     and pg_catalog.lower(u.email) = v_email
   limit 1;
  if v_user is null then
    raise exception 'LINK_SUBJECT_UNKNOWN' using errcode = '23514';
  end if;
  if exists (
    select 1 from iam.profiles p
     where p.user_id = v_user and p.school_id = v_school
  ) then
    raise exception 'IDENTITY_CONFLICT' using errcode = '23505';
  end if;
  v_display := pg_catalog.concat_ws(
    ' ',
    pg_catalog.btrim(p_payload->>'last_name'),
    nullif(pg_catalog.btrim(coalesce(p_payload->>'middle_name', '')), ''),
    pg_catalog.btrim(p_payload->>'first_name')
  );
  v_profile := pg_catalog.gen_random_uuid();
  insert into iam.profiles (
    id, user_id, school_id, display_name, first_name, middle_name, last_name,
    email, phone, is_active, account_status
  ) values (
    v_profile,
    v_user,
    v_school,
    v_display,
    pg_catalog.btrim(p_payload->>'first_name'),
    nullif(pg_catalog.btrim(coalesce(p_payload->>'middle_name', '')), ''),
    pg_catalog.btrim(p_payload->>'last_name'),
    v_email,
    pg_catalog.btrim(p_payload->>'phone'),
    true,
    'active'
  );
  foreach v_role in array v_roles loop
    select id into v_role_id from iam.roles
     where school_id = v_school and code = v_role and is_active
     limit 1;
    if v_role_id is null then
      raise exception 'ROLE_REFUSED' using errcode = '23514';
    end if;
    insert into iam.profile_roles (school_id, profile_id, role_id, assigned_by)
    values (v_school, v_profile, v_role_id, v_actor);
  end loop;
  if v_staff then
    insert into app.staff_profiles (school_id, profile_id, employee_number, job_title, hired_on)
    values (
      v_school, v_profile,
      pg_catalog.btrim(p_payload->>'employee_number'),
      pg_catalog.btrim(p_payload->>'job_title'),
      nullif(p_payload->>'hired_on', '')::date
    );
  end if;
  return pg_catalog.jsonb_build_object('profile_id', v_profile, 'user_id', v_user, 'linked', true);
end
$fn$;

create or replace function api.family_guardian_link(
  p_profile_id uuid,
  p_student_id uuid,
  p_guardian_type text,
  p_primary boolean
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school uuid := iam.current_school_id();
  v_name text;
  v_id uuid;
  v_active integer;
begin
  perform iam.require_access('school.guardian.manage', null, p_student_id, null);
  if p_guardian_type not in ('pere', 'mere', 'tuteur') then
    raise exception 'GUARDIAN_TYPE_REFUSED' using errcode = '23514';
  end if;
  if not exists (
    select 1 from iam.profiles p where p.id = p_profile_id and p.school_id = v_school
  ) or not exists (
    select 1 from app.students s where s.id = p_student_id and s.school_id = v_school
  ) then
    raise exception 'SCHOOL_MISMATCH' using errcode = '23514';
  end if;
  if not exists (
    select 1
      from iam.profile_roles pr
      join iam.roles r on r.id = pr.role_id and r.school_id = v_school
     where pr.profile_id = p_profile_id
       and pr.school_id = v_school
       and r.code = 'parent'
       and pr.is_active
  ) then
    raise exception 'PARENT_ROLE_REQUIRED' using errcode = '23514';
  end if;
  v_name := api.person_display_name(p_profile_id);
  select count(*) into v_active
    from app.student_guardians
   where school_id = v_school and student_id = p_student_id and is_active;
  if v_active = 0 then
    p_primary := true;
  elsif p_primary then
    update app.student_guardians
       set is_primary = false, updated_at = pg_catalog.now()
     where school_id = v_school
       and student_id = p_student_id
       and is_primary
       and is_active;
  end if;
  insert into app.student_guardians (
    school_id, student_id, profile_id, guardian_type, is_primary, full_name, is_active, created_by
  ) values (
    v_school, p_student_id, p_profile_id, p_guardian_type, coalesce(p_primary, false), v_name, true, iam.current_profile_id()
  )
  returning id into v_id;
  return v_id;
end
$fn$;

create or replace function api.student_guardian_add(p_student_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_link_id uuid;
  v_target_profile uuid;
  v_type text := lower(coalesce(p_payload->>'guardian_type', ''));
  v_make_primary boolean := coalesce((p_payload->>'is_primary')::boolean, false);
  v_primary boolean;
begin
  perform iam.require_access('school.guardian.manage', null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id for update;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;
  if v_type not in ('pere', 'mere', 'tuteur') then raise check_violation using message = 'Invalid family guardian type'; end if;
  if nullif(btrim(p_payload->>'full_name'), '') is null and nullif(p_payload->>'profile_id', '') is null then
    raise check_violation using message = 'Guardian full name is required';
  end if;
  if nullif(p_payload->>'profile_id', '') is not null then
    v_target_profile := (p_payload->>'profile_id')::uuid;
    perform 1 from iam.profiles where id = v_target_profile and school_id = v_school_id and is_active = true;
    if not found then raise foreign_key_violation using message = 'Guardian profile not found in active school'; end if;
    if exists (
      select 1 from app.student_guardians
       where school_id = v_school_id and student_id = p_student_id and profile_id = v_target_profile and is_active = true
    ) then
      raise unique_violation using message = 'Guardian profile already linked to student';
    end if;
  end if;
  insert into app.student_guardians(
    school_id, student_id, profile_id, guardian_type, is_primary, full_name, phone, email, address, is_authorized_pickup, is_active, created_by
  ) values (
    v_school_id, p_student_id, v_target_profile, v_type, false,
    coalesce(
      nullif(btrim(p_payload->>'full_name'), ''),
      api.person_display_name(v_target_profile)
    ),
    nullif(btrim(p_payload->>'phone'), ''),
    nullif(btrim(p_payload->>'email'), ''),
    nullif(btrim(p_payload->>'address'), ''),
    coalesce((p_payload->>'is_authorized_pickup')::boolean, true),
    true,
    v_profile_id
  ) returning id into v_link_id;
  if v_make_primary or not exists (
    select 1 from app.student_guardians
     where school_id = v_school_id and student_id = p_student_id and is_active and is_primary and id <> v_link_id
  ) then
    update app.student_guardians set is_primary = false, updated_at = now()
     where school_id = v_school_id and student_id = p_student_id and is_primary = true and is_active = true and id <> v_link_id;
    update app.student_guardians set is_primary = true, updated_at = now() where id = v_link_id;
    v_primary := true;
  else
    v_primary := false;
  end if;
  return jsonb_build_object('id', v_link_id, 'guardian_type', v_type, 'is_primary', v_primary);
end
$fn$;

create or replace function api.teacher_assignment_create(
  p_profile_id uuid,
  p_subject_id uuid,
  p_class_id uuid,
  p_academic_year_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school uuid := iam.current_school_id();
  v_id uuid;
begin
  perform iam.require_access('school.structure.manage', null, null, null);
  if not exists (select 1 from iam.profiles p where p.id = p_profile_id and p.school_id = v_school)
     or not exists (select 1 from app.classes c where c.id = p_class_id and c.school_id = v_school)
     or not exists (select 1 from app.subjects s where s.id = p_subject_id and s.school_id = v_school) then
    raise exception 'SCHOOL_MISMATCH' using errcode = '23514';
  end if;
  select id into v_id
    from app.teacher_assignments
   where school_id = v_school
     and teacher_profile_id = p_profile_id
     and class_id = p_class_id
     and subject_id = p_subject_id
     and academic_year_id = p_academic_year_id
     and is_active
   limit 1;
  if v_id is null then
    insert into app.teacher_assignments (
      school_id, teacher_profile_id, subject_id, class_id, academic_year_id, is_tutor, is_active
    ) values (
      v_school, p_profile_id, p_subject_id, p_class_id, p_academic_year_id, false, true
    )
    returning id into v_id;
  end if;
  return v_id;
end
$fn$;

create or replace function api.teacher_homeroom_set(
  p_profile_id uuid,
  p_class_id uuid,
  p_subject_id uuid,
  p_academic_year_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school uuid := iam.current_school_id();
  v_id uuid;
begin
  perform iam.require_access('school.structure.manage', null, null, null);
  if not exists (select 1 from iam.profiles p where p.id = p_profile_id and p.school_id = v_school)
     or not exists (select 1 from app.classes c where c.id = p_class_id and c.school_id = v_school)
     or not exists (select 1 from app.subjects s where s.id = p_subject_id and s.school_id = v_school) then
    raise exception 'SCHOOL_MISMATCH' using errcode = '23514';
  end if;
  update app.teacher_assignments
     set is_tutor = false, updated_at = pg_catalog.now()
   where school_id = v_school
     and class_id = p_class_id
     and is_tutor
     and is_active
     and teacher_profile_id <> p_profile_id;
  select id into v_id
    from app.teacher_assignments
   where school_id = v_school
     and teacher_profile_id = p_profile_id
     and class_id = p_class_id
     and subject_id = p_subject_id
     and academic_year_id = p_academic_year_id
     and is_active
   limit 1;
  if v_id is null then
    insert into app.teacher_assignments (
      school_id, teacher_profile_id, subject_id, class_id, academic_year_id, is_tutor, is_active
    ) values (
      v_school, p_profile_id, p_subject_id, p_class_id, p_academic_year_id, true, true
    )
    returning id into v_id;
  else
    update app.teacher_assignments
       set is_tutor = true, updated_at = pg_catalog.now()
     where id = v_id;
  end if;
  return v_id;
end
$fn$;

create or replace function api.access_profile_exception(
  p_profile_id uuid,
  p_permission_code text,
  p_effect text,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school uuid := iam.current_school_id();
  v_actor uuid := iam.current_profile_id();
  v_permission uuid;
  v_id uuid;
begin
  perform iam.require_access('roles.manage', p_profile_id, null, null);
  if p_effect not in ('allow', 'deny') or char_length(coalesce(p_reason, '')) < 5 then
    raise exception 'VALIDATION_INVALID' using errcode = '23514';
  end if;
  select id into v_permission from iam.permissions where code = p_permission_code and is_active;
  if v_permission is null then
    raise exception 'PERMISSION_UNKNOWN' using errcode = '23514';
  end if;
  if cardinality(iam.delegation_scopes(v_actor, v_permission)) = 0 then
    raise insufficient_privilege using message = 'DELEGATION_REFUSED';
  end if;
  insert into iam.profile_permission_exceptions (
    school_id, profile_id, permission_id, effect, reason, granted_by
  ) values (
    v_school, p_profile_id, v_permission, p_effect, p_reason, v_actor
  )
  on conflict (school_id, profile_id, permission_id)
  do update set effect = excluded.effect,
                reason = excluded.reason,
                granted_by = excluded.granted_by,
                is_active = true,
                updated_at = pg_catalog.now()
  returning id into v_id;
  insert into iam.exception_scopes (school_id, exception_id, scope_code, assigned_by)
  select v_school, v_id, scope_code, v_actor
    from pg_catalog.unnest(iam.delegation_scopes(v_actor, v_permission)) as delegated(scope_code)
   where not exists (
     select 1 from iam.exception_scopes existing
      where existing.school_id = v_school
        and existing.exception_id = v_id
        and existing.scope_code = scope_code
        and existing.is_active
   );
  return v_id;
end
$fn$;

create or replace function api.access_role_assign(
  p_profile uuid, p_role uuid, p_action text, p_revision bigint, p_reason text, p_confirmed boolean)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $fn$
declare v_school uuid:=iam.current_school_id(); v_revision bigint; v_changed integer;
  v_before jsonb; v_after jsonb; v_manage uuid;
begin
  perform iam.require_access('roles.manage');
  select access_revision into v_revision from app.schools where id=iam.current_school_id() for update;
  perform iam.require_access('roles.manage');
  if p_confirmed is distinct from true or p_action is null or p_action not in ('assign','revoke')
    or p_revision is null or p_revision<0 or p_reason is null or length(btrim(p_reason)) not between 5 and 500 then
    raise invalid_parameter_value using message='Invalid role change';
  end if;
  if not exists(select 1 from iam.profiles where id=p_profile and school_id=v_school)
    or not exists(select 1 from iam.roles where id=p_role and school_id=v_school) then
    raise no_data_found using message='Access target not found';
  end if;
  if v_revision<>p_revision then raise exception 'ACCESS_VERSION_CONFLICT' using errcode='40001'; end if;
  if p_action='assign' and exists (
    select 1 from iam.roles
     where id=p_role and school_id=v_school and code in ('admin','hikvision_admin')
  ) then
    raise insufficient_privilege using message='PRINCIPAL_ROLE_PROTECTED';
  end if;
  if not iam.role_is_delegatable(p_role) then
    raise insufficient_privilege using message='Role exceeds delegation authority';
  end if;
  select to_jsonb(pr) into v_before from iam.profile_roles pr
    where school_id=v_school and profile_id=p_profile and role_id=p_role;
  if p_action='assign' then
    insert into iam.profile_roles(school_id,profile_id,role_id,assigned_by,is_active,starts_at,ends_at)
      values(v_school,p_profile,p_role,iam.current_profile_id(),true,now(),null)
    on conflict(profile_id,role_id) do update set is_active=true,starts_at=excluded.starts_at,ends_at=null,assigned_by=excluded.assigned_by
      where not iam.profile_roles.is_active or iam.profile_roles.starts_at>now() or iam.profile_roles.ends_at is not null;
  else
    update iam.profile_roles set is_active=false
      where school_id=v_school and profile_id=p_profile and role_id=p_role and is_active;
  end if;
  get diagnostics v_changed=row_count;
  if v_changed>0 then
    select id into v_manage from iam.permissions where code='roles.manage';
    if not exists(select 1 from iam.profiles p where p.school_id=v_school
      and 'school'=any(iam.delegation_scopes(p.id,v_manage))) then
      raise exception 'LAST_ACCESS_ADMIN' using errcode='P0001';
    end if;
    select to_jsonb(pr) into v_after from iam.profile_roles pr
      where school_id=v_school and profile_id=p_profile and role_id=p_role;
    perform audit.write_event('access.role.'||p_action,'iam.profiles',p_profile,
      jsonb_build_object('role_id',p_role,'reason',btrim(p_reason),'before',v_before,'after',v_after));
  end if;
  select access_revision into v_revision from app.schools where id=iam.current_school_id();
  return jsonb_build_object('schoolId',v_school,'profileId',p_profile,'roleId',p_role,
    'revision',v_revision::text,'changed',v_changed>0);
end
$fn$;

create or replace function api.pickup_authorization_request(
  p_student_id uuid,
  p_guardian_id uuid,
  p_reason text default null,
  p_starts_on date default null,
  p_ends_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_requested_by uuid;
  v_new_id uuid;
begin
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Élève introuvable';
  end if;

  if not exists (
    select 1 from app.student_guardians
     where student_id = p_student_id
       and school_id = v_school_id
       and profile_id = v_profile_id
       and is_primary
       and is_active
  ) then
    perform iam.require_access('security.pickup.manage', null, p_student_id, null);
  end if;

  select id into v_requested_by
  from app.student_guardians
  where student_id = p_student_id and school_id = v_school_id
    and is_primary = true and is_active = true;
  if v_requested_by is null then
    raise exception using errcode = '22023',
      message = 'Aucun responsable principal actif : demande impossible';
  end if;

  perform 1
  from app.student_guardians
  where id = p_guardian_id and student_id = p_student_id and school_id = v_school_id
    and guardian_type in ('pere','mere','tuteur') and is_active = true;
  if found then
    raise exception using errcode = '22023',
      message = 'Cette personne est déjà un responsable familial de l''enfant';
  end if;

  insert into app.pickup_authorizations (
    school_id, student_id, guardian_id, slot_no, status, requested_by, reason, starts_on, ends_on
  ) values (
    v_school_id, p_student_id, p_guardian_id, 1, 'pending', v_requested_by, p_reason, p_starts_on, p_ends_on
  )
  returning id into v_new_id;

  return jsonb_build_object('id', v_new_id, 'status', 'pending');
end
$fn$;

revoke all on function api.provision_school_person_prepare(jsonb)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.provision_school_person(uuid, jsonb)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.provision_school_profile_link(text, jsonb)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.family_guardian_link(uuid, uuid, text, boolean)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.teacher_homeroom_set(uuid, uuid, uuid, uuid)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.access_profile_exception(uuid, text, text, text)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.card_class_teacher(uuid)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.person_display_name(uuid)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;

grant execute on function api.provision_school_person_prepare(jsonb) to schoolsafe_api;
grant execute on function api.provision_school_person(uuid, jsonb) to schoolsafe_api;
grant execute on function api.provision_school_profile_link(text, jsonb) to schoolsafe_api;
grant execute on function api.family_guardian_link(uuid, uuid, text, boolean) to schoolsafe_api;
grant execute on function api.teacher_homeroom_set(uuid, uuid, uuid, uuid) to schoolsafe_api;
grant execute on function api.access_profile_exception(uuid, text, text, text) to schoolsafe_api;
grant execute on function api.card_class_teacher(uuid) to schoolsafe_api;
grant execute on function api.pickup_authorization_request(uuid, uuid, text, date, date) to schoolsafe_api;
grant execute on function api.family_primary_transfer(uuid, uuid, text) to schoolsafe_api;
grant execute on function api.person_display_name(uuid) to schoolsafe_api;

commit;
