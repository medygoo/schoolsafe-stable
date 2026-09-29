\set ON_ERROR_STOP on

-- SchoolSafe B1 — Child Record Complete: RPCs for completeness, canteen projection, parent children
-- Additive unit: creates new SECURITY DEFINER functions without modifying existing ones.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. COMPLETENESS CALCULATION (12 checkpoints exactly)
-- ============================================================================
create or replace function api.student_record_completeness(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_completed integer := 0;
  v_total integer := 12;
  v_missing jsonb := '[]'::jsonb;
  v_student app.students%rowtype;
  v_has_primary boolean;
  v_primary_phone text;
  v_emergency_slot1 boolean;
  v_health_completed boolean;
  v_dietary_completed boolean;
  v_family_confirmed boolean;
  v_medical_confirmed boolean;
  v_dietary_confirmed boolean;
  v_pickup_confirmed boolean;
  v_photo_video_decided boolean;
  v_emergency_care_decided boolean;
begin
  perform iam.require_access('school.student.read', null, p_student_id, null);

  select * into v_student from app.students where id = p_student_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Student not found';
  end if;

  -- CHECKPOINT 1: identité obligatoire complète (first_name, last_name, gender, date_of_birth, matricule)
  if v_student.first_name is not null and v_student.last_name is not null
     and v_student.gender is not null and v_student.date_of_birth is not null
     and v_student.matricule is not null then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"identity_incomplete"'::jsonb;
  end if;

  -- CHECKPOINT 2: photo enfant
  if v_student.photo_path is not null and v_student.photo_path <> '' then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"photo_missing"'::jsonb;
  end if;

  -- CHECKPOINT 3: année scolaire
  if exists (select 1 from app.student_enrollments where student_id = p_student_id and school_id = v_school_id and academic_year_id is not null and status = 'active') then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"academic_year_missing"'::jsonb;
  end if;

  -- CHECKPOINT 4: classe
  if exists (select 1 from app.student_enrollments where student_id = p_student_id and school_id = v_school_id and class_id is not null and status = 'active') then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"class_missing"'::jsonb;
  end if;

  -- CHECKPOINT 5: au moins un responsable familial
  if exists (select 1 from app.student_guardians where student_id = p_student_id and school_id = v_school_id and is_active = true) then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"no_guardian"'::jsonb;
  end if;

  -- CHECKPOINT 6: exactement un responsable principal
  select count(*) = 1 into v_has_primary from app.student_guardians where student_id = p_student_id and school_id = v_school_id and is_primary = true and is_active = true;
  if v_has_primary then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"no_single_primary"'::jsonb;
  end if;

  -- CHECKPOINT 7: téléphone du responsable principal
  select p.phone into v_primary_phone
  from app.student_guardians g
  join iam.profiles p on p.id = g.profile_id
  where g.student_id = p_student_id and g.school_id = v_school_id and g.is_primary = true and g.is_active = true
  limit 1;
  if v_primary_phone is not null and v_primary_phone <> '' then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"primary_phone_missing"'::jsonb;
  end if;

  -- CHECKPOINT 8: contact urgence principal (slot 1)
  select exists(select 1 from app.student_emergency_contacts where student_id = p_student_id and school_id = v_school_id and slot_no = 1 and is_active = true) into v_emergency_slot1;
  if v_emergency_slot1 then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"emergency_contact_primary_missing"'::jsonb;
  end if;

  -- CHECKPOINT 9: medical_declaration_completed
  select medical_declaration_completed into v_health_completed from app.student_health_profiles where student_id = p_student_id and school_id = v_school_id;
  if v_health_completed = true then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"medical_declaration_incomplete"'::jsonb;
  end if;

  -- CHECKPOINT 10: dietary_declaration_completed
  select dietary_declaration_completed into v_dietary_completed from app.student_dietary_profiles where student_id = p_student_id and school_id = v_school_id;
  if v_dietary_completed = true then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"dietary_declaration_incomplete"'::jsonb;
  end if;

  -- CHECKPOINT 11: confirmations family + medical + dietary + pickup toutes true
  select confirmed into v_family_confirmed from app.student_record_confirmations where student_id = p_student_id and school_id = v_school_id and confirmation_key = 'family';
  select confirmed into v_medical_confirmed from app.student_record_confirmations where student_id = p_student_id and school_id = v_school_id and confirmation_key = 'medical';
  select confirmed into v_dietary_confirmed from app.student_record_confirmations where student_id = p_student_id and school_id = v_school_id and confirmation_key = 'dietary';
  select confirmed into v_pickup_confirmed from app.student_record_confirmations where student_id = p_student_id and school_id = v_school_id and confirmation_key = 'pickup';
  if coalesce(v_family_confirmed, false) and coalesce(v_medical_confirmed, false) and coalesce(v_dietary_confirmed, false) and coalesce(v_pickup_confirmed, false) then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"confirmations_incomplete"'::jsonb;
  end if;

  -- CHECKPOINT 12: consentements photo_video + emergency_care décidés
  select exists(select 1 from app.student_consents where student_id = p_student_id and school_id = v_school_id and consent_key = 'photo_video') into v_photo_video_decided;
  select exists(select 1 from app.student_consents where student_id = p_student_id and school_id = v_school_id and consent_key = 'emergency_care') into v_emergency_care_decided;
  if v_photo_video_decided and v_emergency_care_decided then
    v_completed := v_completed + 1;
  else
    v_missing := v_missing || '"consents_missing"'::jsonb;
  end if;

  return jsonb_build_object(
    'student_id', p_student_id,
    'completed_checkpoints', v_completed,
    'total_checkpoints', v_total,
    'percentage', round((v_completed::numeric / v_total::numeric) * 100),
    'status', case when v_completed = v_total then 'READY_TO_VALIDATE' else 'INCOMPLETE' end,
    'missing', v_missing
  );
end;
$schoolsafe$;

grant execute on function api.student_record_completeness(uuid) to schoolsafe_api;

-- ============================================================================
-- 2. CANTEEN DIETARY PROJECTION (safety-only, no medical data)
-- ============================================================================
create or replace function api.canteen_student_dietary(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_student app.students%rowtype;
  v_class_name text;
begin
  perform iam.require_access('school.student.dietary.read', null, p_student_id, null);

  select * into v_student from app.students where id = p_student_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Student not found';
  end if;

  select c.name into v_class_name
  from app.student_enrollments e
  join app.classes c on c.id = e.class_id
  where e.student_id = p_student_id and e.school_id = v_school_id and e.status = 'active'
  order by e.starts_on desc limit 1;

  return jsonb_build_object(
    'student_id', p_student_id,
    'photo_path', v_student.photo_path,
    'first_name', v_student.first_name,
    'last_name', v_student.last_name,
    'class_name', v_class_name,
    'food_allergies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'allergen', a.allergen, 'severity', a.severity, 'status', a.status,
        'emergency_instruction', a.emergency_instruction
      ) order by a.reported_at desc), '[]'::jsonb)
      from app.student_allergies a
      where a.student_id = p_student_id and a.school_id = v_school_id
        and a.category = 'food' and a.status in ('reported','confirmed')
    ),
    'dietary_restrictions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', r.kind, 'label', r.label, 'status', r.status, 'notes', r.notes
      ) order by r.reported_at desc), '[]'::jsonb)
      from app.student_dietary_restrictions r
      where r.student_id = p_student_id and r.school_id = v_school_id
        and r.status in ('reported','confirmed')
    ),
    'food_preferences', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', fp.preference_type, 'item', fp.item, 'notes', fp.notes
      ) order by fp.created_at desc), '[]'::jsonb)
      from app.student_food_preferences fp
      where fp.student_id = p_student_id and fp.school_id = v_school_id
        and fp.status = 'active'
    ),
    'parent_food_note', (select parent_food_note from app.student_dietary_profiles where student_id = p_student_id and school_id = v_school_id)
  );
end;
$schoolsafe$;

grant execute on function api.canteen_student_dietary(uuid) to schoolsafe_api;

-- ============================================================================
-- 3. PARENT CHILDREN LIST (derived from guardian links)
-- ============================================================================
create or replace function api.parent_children()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'student_id', s.id,
      'first_name', s.first_name,
      'last_name', s.last_name,
      'photo_path', s.photo_path,
      'lifecycle_status', s.lifecycle_status,
      'class_name', (
        select c.name from app.student_enrollments e
        join app.classes c on c.id = e.class_id
        where e.student_id = s.id and e.school_id = v_school_id and e.status = 'active'
        order by e.starts_on desc limit 1
      )
    ) order by s.last_name, s.first_name), '[]'::jsonb)
    from app.student_guardians g
    join app.students s on s.id = g.student_id and s.school_id = v_school_id
    where g.profile_id = v_profile_id and g.school_id = v_school_id and g.is_active = true
  );
end;
$schoolsafe$;

grant execute on function api.parent_children() to schoolsafe_api;


-- ============================================================================
-- 4. MUTATION RPCs (no direct runtime table privileges)
-- ============================================================================
create or replace function api.student_emergency_contact_upsert(
  p_student_id uuid,
  p_slot_no integer,
  p_guardian_id uuid,
  p_full_name text,
  p_relation text,
  p_phone text,
  p_alternate_phone text default null,
  p_notes text default null
)
returns table(id uuid, slot_no smallint, full_name text, relation text, phone text)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  perform iam.require_access('school.guardian.manage', null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_emergency_contacts as c
    (school_id, student_id, slot_no, guardian_id, full_name, relation, phone, alternate_phone, notes, created_by, updated_by)
  values
    (v_school_id, p_student_id, p_slot_no, p_guardian_id, p_full_name, p_relation, p_phone, p_alternate_phone, p_notes, v_profile_id, v_profile_id)
  on conflict (school_id, student_id, slot_no)
  do update set guardian_id=excluded.guardian_id, full_name=excluded.full_name, relation=excluded.relation,
    phone=excluded.phone, alternate_phone=excluded.alternate_phone, notes=excluded.notes,
    updated_by=v_profile_id, updated_at=now()
  returning c.id, c.slot_no, c.full_name, c.relation, c.phone;
end;
$schoolsafe$;

create or replace function api.student_health_profile_upsert(
  p_student_id uuid,
  p_blood_type text default null,
  p_primary_doctor_name text default null,
  p_primary_doctor_phone text default null,
  p_medical_notes text default null,
  p_emergency_instructions text default null,
  p_medical_declaration_completed boolean default null,
  p_medical_consent_status boolean default null
)
returns table(student_id uuid, blood_type text, medical_declaration_completed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  perform iam.require_access('school.student.health.manage', null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_health_profiles as h
    (student_id, school_id, blood_type, primary_doctor_name, primary_doctor_phone, medical_notes,
     emergency_instructions, medical_declaration_completed, medical_consent_status, last_confirmed_by)
  values
    (p_student_id, v_school_id, coalesce(p_blood_type,'UNKNOWN'), p_primary_doctor_name, p_primary_doctor_phone,
     p_medical_notes, p_emergency_instructions, coalesce(p_medical_declaration_completed,false),
     p_medical_consent_status, v_profile_id)
  on conflict (student_id) do update set
    blood_type=coalesce(excluded.blood_type, h.blood_type),
    primary_doctor_name=excluded.primary_doctor_name,
    primary_doctor_phone=excluded.primary_doctor_phone,
    medical_notes=excluded.medical_notes,
    emergency_instructions=excluded.emergency_instructions,
    medical_declaration_completed=excluded.medical_declaration_completed,
    medical_consent_status=excluded.medical_consent_status,
    last_confirmed_by=excluded.last_confirmed_by,
    last_confirmed_at=case when excluded.medical_declaration_completed then now() else h.last_confirmed_at end,
    updated_at=now()
  returning h.student_id, h.blood_type, h.medical_declaration_completed;
end;
$schoolsafe$;

create or replace function api.student_allergy_add(
  p_student_id uuid,
  p_category text,
  p_allergen text,
  p_severity text default null,
  p_reaction text default null,
  p_emergency_instruction text default null
)
returns table(id uuid, category text, allergen text, severity text, status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  perform iam.require_access('school.student.health.manage', null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_allergies as a
    (school_id, student_id, category, allergen, severity, reaction, emergency_instruction, status, reported_by)
  values
    (v_school_id, p_student_id, p_category, p_allergen, coalesce(p_severity,'unknown'),
     p_reaction, p_emergency_instruction, 'reported', v_profile_id)
  returning a.id, a.category, a.allergen, a.severity, a.status;
end;
$schoolsafe$;

create or replace function api.student_dietary_restriction_add(
  p_student_id uuid,
  p_kind text,
  p_label text,
  p_notes text default null
)
returns table(id uuid, kind text, label text, status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  perform iam.require_access('school.student.dietary.manage', null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_dietary_restrictions as r
    (school_id, student_id, kind, label, notes, status, reported_by)
  values
    (v_school_id, p_student_id, p_kind, p_label, p_notes, 'reported', v_profile_id)
  returning r.id, r.kind, r.label, r.status;
end;
$schoolsafe$;

create or replace function api.student_record_confirmation_set(
  p_student_id uuid,
  p_confirmation_key text,
  p_confirmed boolean
)
returns table(confirmation_key text, confirmed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_permission text;
begin
  v_permission := case p_confirmation_key
    when 'medical' then 'school.student.health.confirm'
    when 'dietary' then 'school.student.dietary.confirm'
    when 'family' then 'school.guardian.manage'
    when 'pickup' then 'school.guardian.manage'
    else null
  end;
  if v_permission is null then raise check_violation using message = 'Invalid confirmation key'; end if;
  perform iam.require_access(v_permission, null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_record_confirmations as c
    (school_id, student_id, confirmation_key, confirmed, confirmed_by, confirmed_at)
  values
    (v_school_id, p_student_id, p_confirmation_key, p_confirmed, v_profile_id, case when p_confirmed then now() else null end)
  on conflict (school_id, student_id, confirmation_key)
  do update set confirmed=excluded.confirmed, confirmed_by=excluded.confirmed_by,
    confirmed_at=case when excluded.confirmed then now() else c.confirmed_at end, updated_at=now()
  returning c.confirmation_key, c.confirmed;
end;
$schoolsafe$;

create or replace function api.student_consent_set(
  p_student_id uuid,
  p_consent_key text,
  p_decision boolean
)
returns table(consent_key text, decision boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_permission text;
begin
  v_permission := case p_consent_key
    when 'photo_video' then 'school.guardian.manage'
    when 'emergency_care' then 'school.student.health.manage'
    else null
  end;
  if v_permission is null then raise check_violation using message = 'Invalid consent key'; end if;
  perform iam.require_access(v_permission, null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_consents as c
    (school_id, student_id, consent_key, decision, decided_by, decided_at)
  values
    (v_school_id, p_student_id, p_consent_key, p_decision, v_profile_id, now())
  on conflict (school_id, student_id, consent_key)
  do update set decision=excluded.decision, decided_by=excluded.decided_by, decided_at=now(), updated_at=now()
  returning c.consent_key, c.decision;
end;
$schoolsafe$;

create or replace function api.student_medication_add(
  p_student_id uuid,
  p_name text,
  p_dosage_text text default null,
  p_schedule_text text default null,
  p_instructions text default null,
  p_school_administration_required boolean default false
)
returns table(id uuid, name text, status text, school_administration_required boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  perform iam.require_access('school.student.health.manage', null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_medications as m
    (school_id, student_id, name, dosage_text, schedule_text, instructions, school_administration_required, status, reported_by)
  values
    (v_school_id, p_student_id, p_name, p_dosage_text, p_schedule_text, p_instructions,
     coalesce(p_school_administration_required,false), 'active', v_profile_id)
  returning m.id, m.name, m.status, m.school_administration_required;
end;
$schoolsafe$;

create or replace function api.student_food_preference_add(
  p_student_id uuid,
  p_preference_type text,
  p_item text,
  p_notes text default null
)
returns table(id uuid, preference_type text, item text, status text)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  perform iam.require_access('school.student.dietary.manage', null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_food_preferences as f
    (school_id, student_id, preference_type, item, notes, status, reported_by)
  values
    (v_school_id, p_student_id, p_preference_type, p_item, p_notes, 'active', v_profile_id)
  returning f.id, f.preference_type, f.item, f.status;
end;
$schoolsafe$;

create or replace function api.student_dietary_profile_upsert(
  p_student_id uuid,
  p_dietary_declaration_completed boolean default null,
  p_parent_food_note text default null
)
returns table(student_id uuid, dietary_declaration_completed boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  perform iam.require_access('school.student.dietary.manage', null, p_student_id, null);
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then raise foreign_key_violation using message = 'Student not found'; end if;

  return query
  insert into app.student_dietary_profiles as d
    (student_id, school_id, dietary_declaration_completed, parent_food_note, last_confirmed_by)
  values
    (p_student_id, v_school_id, coalesce(p_dietary_declaration_completed,false), p_parent_food_note, v_profile_id)
  on conflict (student_id) do update set
    dietary_declaration_completed=coalesce(excluded.dietary_declaration_completed, d.dietary_declaration_completed),
    parent_food_note=excluded.parent_food_note,
    last_confirmed_by=excluded.last_confirmed_by,
    last_confirmed_at=case when excluded.dietary_declaration_completed then now() else d.last_confirmed_at end,
    updated_at=now()
  returning d.student_id, d.dietary_declaration_completed;
end;
$schoolsafe$;


-- ============================================================================
-- 5. COMPLETE CHILD-RECORD READ/EDIT RPCs
-- ============================================================================

create or replace function api.student_record_read(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_student app.students%rowtype;
  v_class_id uuid;
  v_class_name text;
  v_year_id uuid;
begin
  select e.class_id, e.academic_year_id into v_class_id, v_year_id
  from app.student_enrollments e
  where e.student_id=p_student_id and e.school_id=v_school_id and e.status='active'
  order by e.starts_on desc limit 1;

  perform iam.require_access('school.student.read', null, p_student_id, v_class_id);

  select * into v_student from app.students
  where id=p_student_id and school_id=v_school_id;
  if not found then raise foreign_key_violation using message='Student not found'; end if;

  select c.name into v_class_name from app.classes c
  where c.id=v_class_id and c.school_id=v_school_id;

  return jsonb_build_object(
    'id',v_student.id,
    'school_id',v_school_id,
    'matricule',v_student.matricule,
    'first_name',v_student.first_name,
    'middle_name',v_student.middle_name,
    'last_name',v_student.last_name,
    'date_of_birth',v_student.date_of_birth,
    'gender',v_student.gender,
    'photo_path',v_student.photo_path,
    'place_of_birth',v_student.place_of_birth,
    'nationality',v_student.nationality,
    'home_address',v_student.home_address,
    'lifecycle_status',v_student.lifecycle_status,
    'schooling',jsonb_build_object(
      'academic_year_id',v_year_id,
      'class_id',v_class_id,
      'class_name',v_class_name
    ),
    'family',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',g.id,
        'guardian_type',g.guardian_type,
        'full_name',g.full_name,
        'is_primary',g.is_primary,
        'is_authorized_pickup',g.is_authorized_pickup,
        'is_active',g.is_active
      ) order by g.is_primary desc,g.created_at),'[]'::jsonb)
      from app.student_guardians g
      where g.school_id=v_school_id and g.student_id=p_student_id and g.is_active=true
    ),
    'confirmations',(
      select coalesce(jsonb_object_agg(c.confirmation_key,c.confirmed),'{}'::jsonb)
      from app.student_record_confirmations c
      where c.school_id=v_school_id and c.student_id=p_student_id
    ),
    'consents',(
      select coalesce(jsonb_object_agg(c.consent_key,c.decision),'{}'::jsonb)
      from app.student_consents c
      where c.school_id=v_school_id and c.student_id=p_student_id
    )
  );
end;
$schoolsafe$;

create or replace function api.student_identity_update(p_student_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_student app.students%rowtype;
begin
  perform iam.require_access('school.student.create', null, p_student_id, null);
  update app.students s set
    first_name=case when p_patch ? 'first_name' then nullif(btrim(p_patch->>'first_name'),'') else s.first_name end,
    middle_name=case when p_patch ? 'middle_name' then nullif(btrim(p_patch->>'middle_name'),'') else s.middle_name end,
    last_name=case when p_patch ? 'last_name' then nullif(btrim(p_patch->>'last_name'),'') else s.last_name end,
    date_of_birth=case when p_patch ? 'date_of_birth' then nullif(p_patch->>'date_of_birth','')::date else s.date_of_birth end,
    gender=case when p_patch ? 'gender' then nullif(btrim(p_patch->>'gender'),'') else s.gender end,
    place_of_birth=case when p_patch ? 'place_of_birth' then nullif(btrim(p_patch->>'place_of_birth'),'') else s.place_of_birth end,
    nationality=case when p_patch ? 'nationality' then nullif(btrim(p_patch->>'nationality'),'') else s.nationality end,
    home_address=case when p_patch ? 'home_address' then nullif(btrim(p_patch->>'home_address'),'') else s.home_address end,
    updated_at=now()
  where s.id=p_student_id and s.school_id=v_school_id
  returning s.* into v_student;
  if not found then raise foreign_key_violation using message='Student not found'; end if;
  if v_student.first_name is null or v_student.last_name is null then
    raise check_violation using message='Student first and last name are required';
  end if;
  return api.student_record_read(p_student_id);
end;
$schoolsafe$;

create or replace function api.student_family_read(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('school.guardian.read', null, p_student_id, null);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',g.id,
      'profile_id',g.profile_id,
      'guardian_type',g.guardian_type,
      'full_name',g.full_name,
      'is_primary',g.is_primary,
      'is_authorized_pickup',g.is_authorized_pickup,
      'is_active',g.is_active
    ) order by g.is_primary desc,g.created_at)
    from app.student_guardians g
    where g.school_id=v_school_id and g.student_id=p_student_id and g.is_active=true
  ),'[]'::jsonb);
end;
$schoolsafe$;

create or replace function api.student_guardian_add(p_student_id uuid,p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_link_id uuid;
  v_target_profile uuid;
  v_type text := lower(coalesce(p_payload->>'guardian_type',''));
  v_make_primary boolean := coalesce((p_payload->>'is_primary')::boolean,false);
begin
  perform iam.require_access('school.guardian.manage', null, p_student_id, null);
  perform 1 from app.students where id=p_student_id and school_id=v_school_id for update;
  if not found then raise foreign_key_violation using message='Student not found'; end if;
  if v_type not in ('pere','mere','tuteur') then raise check_violation using message='Invalid family guardian type'; end if;
  if nullif(btrim(p_payload->>'full_name'),'') is null then raise check_violation using message='Guardian full name is required'; end if;

  if nullif(p_payload->>'profile_id','') is not null then
    v_target_profile := (p_payload->>'profile_id')::uuid;
    perform 1 from iam.profiles where id=v_target_profile and school_id=v_school_id and is_active=true;
    if not found then raise foreign_key_violation using message='Guardian profile not found in active school'; end if;
    if exists(select 1 from app.student_guardians where school_id=v_school_id and student_id=p_student_id and profile_id=v_target_profile and is_active=true) then
      raise unique_violation using message='Guardian profile already linked to student';
    end if;
  end if;

  insert into app.student_guardians(
    school_id,student_id,profile_id,guardian_type,is_primary,full_name,phone,email,address,is_authorized_pickup,is_active,created_by
  ) values(
    v_school_id,p_student_id,v_target_profile,v_type,false,btrim(p_payload->>'full_name'),
    nullif(btrim(p_payload->>'phone'),''),nullif(btrim(p_payload->>'email'),''),
    nullif(btrim(p_payload->>'address'),''),coalesce((p_payload->>'is_authorized_pickup')::boolean,true),true,v_profile_id
  ) returning id into v_link_id;

  if v_make_primary then
    update app.student_guardians set is_primary=false,updated_at=now()
    where school_id=v_school_id and student_id=p_student_id and is_primary=true and is_active=true and id<>v_link_id;
    update app.student_guardians set is_primary=true,updated_at=now() where id=v_link_id;
  end if;

  return jsonb_build_object('id',v_link_id,'guardian_type',v_type,'is_primary',v_make_primary);
end;
$schoolsafe$;

create or replace function api.student_guardian_update(p_student_id uuid,p_guardian_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_type text;
  v_row app.student_guardians%rowtype;
begin
  perform iam.require_access('school.guardian.manage', null, p_student_id, null);
  select guardian_type into v_type from app.student_guardians
  where id=p_guardian_id and student_id=p_student_id and school_id=v_school_id and is_active=true;
  if not found then raise foreign_key_violation using message='Guardian link not found'; end if;
  if p_patch ? 'guardian_type' then
    v_type:=lower(coalesce(p_patch->>'guardian_type',''));
    if v_type not in ('pere','mere','tuteur') then raise check_violation using message='Invalid family guardian type'; end if;
  end if;

  update app.student_guardians g set
    guardian_type=case when p_patch ? 'guardian_type' then v_type else g.guardian_type end,
    full_name=case when p_patch ? 'full_name' then nullif(btrim(p_patch->>'full_name'),'') else g.full_name end,
    phone=case when p_patch ? 'phone' then nullif(btrim(p_patch->>'phone'),'') else g.phone end,
    email=case when p_patch ? 'email' then nullif(btrim(p_patch->>'email'),'') else g.email end,
    address=case when p_patch ? 'address' then nullif(btrim(p_patch->>'address'),'') else g.address end,
    is_authorized_pickup=case when p_patch ? 'is_authorized_pickup' then (p_patch->>'is_authorized_pickup')::boolean else g.is_authorized_pickup end,
    updated_at=now()
  where g.id=p_guardian_id and g.student_id=p_student_id and g.school_id=v_school_id and g.is_active=true
  returning g.* into v_row;
  if v_row.full_name is null then raise check_violation using message='Guardian full name is required'; end if;

  return jsonb_build_object('id',v_row.id,'guardian_type',v_row.guardian_type,'full_name',v_row.full_name,'is_primary',v_row.is_primary,'is_authorized_pickup',v_row.is_authorized_pickup);
end;
$schoolsafe$;

create or replace function api.student_guardian_set_primary(p_student_id uuid,p_guardian_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('school.guardian.manage', null, p_student_id, null);
  perform 1 from app.students where id=p_student_id and school_id=v_school_id for update;
  if not found then raise foreign_key_violation using message='Student not found'; end if;
  perform 1 from app.student_guardians where id=p_guardian_id and student_id=p_student_id and school_id=v_school_id and is_active=true;
  if not found then raise foreign_key_violation using message='Guardian link not found'; end if;
  update app.student_guardians set is_primary=false,updated_at=now()
  where school_id=v_school_id and student_id=p_student_id and is_primary=true and is_active=true and id<>p_guardian_id;
  update app.student_guardians set is_primary=true,updated_at=now() where id=p_guardian_id;
  return jsonb_build_object('student_id',p_student_id,'guardian_id',p_guardian_id,'is_primary',true);
end;
$schoolsafe$;

create or replace function api.student_guardian_deactivate(p_student_id uuid,p_guardian_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_primary boolean;
begin
  perform iam.require_access('school.guardian.manage', null, p_student_id, null);
  select is_primary into v_primary from app.student_guardians
  where id=p_guardian_id and student_id=p_student_id and school_id=v_school_id and is_active=true;
  if not found then raise foreign_key_violation using message='Guardian link not found'; end if;
  if v_primary then raise check_violation using message='Primary guardian must be transferred before deactivation'; end if;
  update app.student_guardians set is_active=false,updated_at=now() where id=p_guardian_id;
  return jsonb_build_object('guardian_id',p_guardian_id,'is_active',false);
end;
$schoolsafe$;

create or replace function api.student_emergency_contacts_read(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('school.student.read', null, p_student_id, null);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',c.id,'slot_no',c.slot_no,'guardian_id',c.guardian_id,'full_name',c.full_name,
      'relation',c.relation,'phone',c.phone,'alternate_phone',c.alternate_phone,'notes',c.notes
    ) order by c.slot_no)
    from app.student_emergency_contacts c
    where c.school_id=v_school_id and c.student_id=p_student_id and c.is_active=true
  ),'[]'::jsonb);
end;
$schoolsafe$;

create or replace function api.student_health_read(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('school.student.health.read', null, p_student_id, null);
  perform 1 from app.students where id=p_student_id and school_id=v_school_id;
  if not found then raise foreign_key_violation using message='Student not found'; end if;
  return jsonb_build_object(
    'profile',coalesce((select to_jsonb(h)-'school_id' from app.student_health_profiles h where h.school_id=v_school_id and h.student_id=p_student_id),'{}'::jsonb),
    'conditions',coalesce((select jsonb_agg(to_jsonb(c)-'school_id' order by c.reported_at desc) from app.student_health_conditions c where c.school_id=v_school_id and c.student_id=p_student_id),'[]'::jsonb),
    'allergies',coalesce((select jsonb_agg(to_jsonb(a)-'school_id' order by a.reported_at desc) from app.student_allergies a where a.school_id=v_school_id and a.student_id=p_student_id),'[]'::jsonb),
    'medications',coalesce((select jsonb_agg(to_jsonb(m)-'school_id' order by m.reported_at desc) from app.student_medications m where m.school_id=v_school_id and m.student_id=p_student_id),'[]'::jsonb)
  );
end;
$schoolsafe$;

create or replace function api.student_health_condition_add(p_student_id uuid,p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare v_school_id uuid:=iam.current_school_id();v_profile_id uuid:=iam.current_profile_id();v_id uuid;
begin
  perform iam.require_access('school.student.health.manage', null, p_student_id, null);
  if nullif(btrim(p_payload->>'name'),'') is null then raise check_violation using message='Condition name is required'; end if;
  insert into app.student_health_conditions(school_id,student_id,name,notes,status,reported_by)
  values(v_school_id,p_student_id,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'notes'),''),'active',v_profile_id)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'status','active');
end;
$schoolsafe$;

create or replace function api.student_health_condition_update(p_student_id uuid,p_condition_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare v_school_id uuid:=iam.current_school_id();v_row app.student_health_conditions%rowtype;
begin
  perform iam.require_access('school.student.health.manage', null, p_student_id, null);
  update app.student_health_conditions c set
    name=case when p_patch ? 'name' then nullif(btrim(p_patch->>'name'),'') else c.name end,
    notes=case when p_patch ? 'notes' then nullif(btrim(p_patch->>'notes'),'') else c.notes end,
    status=case when p_patch ? 'status' then p_patch->>'status' else c.status end,
    updated_at=now()
  where c.id=p_condition_id and c.student_id=p_student_id and c.school_id=v_school_id
  returning c.* into v_row;
  if not found then raise foreign_key_violation using message='Health condition not found'; end if;
  return to_jsonb(v_row)-'school_id';
end;
$schoolsafe$;

create or replace function api.student_allergy_update(p_student_id uuid,p_allergy_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare v_school_id uuid:=iam.current_school_id();v_profile_id uuid:=iam.current_profile_id();v_status text;v_row app.student_allergies%rowtype;
begin
  perform iam.require_access('school.student.health.manage', null, p_student_id, null);
  select status into v_status from app.student_allergies where id=p_allergy_id and student_id=p_student_id and school_id=v_school_id;
  if not found then raise foreign_key_violation using message='Allergy not found'; end if;
  if p_patch ? 'status' and p_patch->>'status'='confirmed' then
    perform iam.require_access('school.student.health.confirm', null, p_student_id, null);
  end if;
  update app.student_allergies a set
    category=case when p_patch ? 'category' then p_patch->>'category' else a.category end,
    allergen=case when p_patch ? 'allergen' then nullif(btrim(p_patch->>'allergen'),'') else a.allergen end,
    severity=case when p_patch ? 'severity' then p_patch->>'severity' else a.severity end,
    reaction=case when p_patch ? 'reaction' then nullif(btrim(p_patch->>'reaction'),'') else a.reaction end,
    emergency_instruction=case when p_patch ? 'emergency_instruction' then nullif(btrim(p_patch->>'emergency_instruction'),'') else a.emergency_instruction end,
    status=case when p_patch ? 'status' then p_patch->>'status' else a.status end,
    confirmed_at=case when p_patch ? 'status' and p_patch->>'status'='confirmed' then now() else a.confirmed_at end,
    confirmed_by=case when p_patch ? 'status' and p_patch->>'status'='confirmed' then v_profile_id else a.confirmed_by end,
    updated_at=now()
  where a.id=p_allergy_id and a.student_id=p_student_id and a.school_id=v_school_id
  returning a.* into v_row;
  return to_jsonb(v_row)-'school_id';
end;
$schoolsafe$;

create or replace function api.student_medication_update(p_student_id uuid,p_medication_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare v_school_id uuid:=iam.current_school_id();v_row app.student_medications%rowtype;
begin
  perform iam.require_access('school.student.health.manage', null, p_student_id, null);
  update app.student_medications m set
    name=case when p_patch ? 'name' then nullif(btrim(p_patch->>'name'),'') else m.name end,
    dosage_text=case when p_patch ? 'dosage_text' then nullif(btrim(p_patch->>'dosage_text'),'') else m.dosage_text end,
    schedule_text=case when p_patch ? 'schedule_text' then nullif(btrim(p_patch->>'schedule_text'),'') else m.schedule_text end,
    instructions=case when p_patch ? 'instructions' then nullif(btrim(p_patch->>'instructions'),'') else m.instructions end,
    school_administration_required=case when p_patch ? 'school_administration_required' then (p_patch->>'school_administration_required')::boolean else m.school_administration_required end,
    status=case when p_patch ? 'status' then p_patch->>'status' else m.status end,
    updated_at=now()
  where m.id=p_medication_id and m.student_id=p_student_id and m.school_id=v_school_id
  returning m.* into v_row;
  if not found then raise foreign_key_violation using message='Medication not found'; end if;
  return to_jsonb(v_row)-'school_id';
end;
$schoolsafe$;

create or replace function api.student_dietary_read(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare v_school_id uuid:=iam.current_school_id();
begin
  perform iam.require_access('school.student.dietary.read', null, p_student_id, null);
  return jsonb_build_object(
    'profile',coalesce((select to_jsonb(d)-'school_id' from app.student_dietary_profiles d where d.school_id=v_school_id and d.student_id=p_student_id),'{}'::jsonb),
    'restrictions',coalesce((select jsonb_agg(to_jsonb(r)-'school_id' order by r.reported_at desc) from app.student_dietary_restrictions r where r.school_id=v_school_id and r.student_id=p_student_id),'[]'::jsonb),
    'preferences',coalesce((select jsonb_agg(to_jsonb(f)-'school_id' order by f.created_at desc) from app.student_food_preferences f where f.school_id=v_school_id and f.student_id=p_student_id),'[]'::jsonb)
  );
end;
$schoolsafe$;

create or replace function api.student_dietary_restriction_update(p_student_id uuid,p_restriction_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare v_school_id uuid:=iam.current_school_id();v_profile_id uuid:=iam.current_profile_id();v_row app.student_dietary_restrictions%rowtype;
begin
  perform iam.require_access('school.student.dietary.manage', null, p_student_id, null);
  if p_patch ? 'status' and p_patch->>'status'='confirmed' then
    perform iam.require_access('school.student.dietary.confirm', null, p_student_id, null);
  end if;
  update app.student_dietary_restrictions r set
    kind=case when p_patch ? 'kind' then p_patch->>'kind' else r.kind end,
    label=case when p_patch ? 'label' then nullif(btrim(p_patch->>'label'),'') else r.label end,
    notes=case when p_patch ? 'notes' then nullif(btrim(p_patch->>'notes'),'') else r.notes end,
    status=case when p_patch ? 'status' then p_patch->>'status' else r.status end,
    confirmed_at=case when p_patch ? 'status' and p_patch->>'status'='confirmed' then now() else r.confirmed_at end,
    confirmed_by=case when p_patch ? 'status' and p_patch->>'status'='confirmed' then v_profile_id else r.confirmed_by end,
    updated_at=now()
  where r.id=p_restriction_id and r.student_id=p_student_id and r.school_id=v_school_id
  returning r.* into v_row;
  if not found then raise foreign_key_violation using message='Dietary restriction not found'; end if;
  return to_jsonb(v_row)-'school_id';
end;
$schoolsafe$;

create or replace function api.student_food_preference_update(p_student_id uuid,p_preference_id uuid,p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare v_school_id uuid:=iam.current_school_id();v_row app.student_food_preferences%rowtype;
begin
  perform iam.require_access('school.student.dietary.manage', null, p_student_id, null);
  update app.student_food_preferences f set
    preference_type=case when p_patch ? 'preference_type' then p_patch->>'preference_type' else f.preference_type end,
    item=case when p_patch ? 'item' then nullif(btrim(p_patch->>'item'),'') else f.item end,
    notes=case when p_patch ? 'notes' then nullif(btrim(p_patch->>'notes'),'') else f.notes end,
    status=case when p_patch ? 'status' then p_patch->>'status' else f.status end,
    updated_at=now()
  where f.id=p_preference_id and f.student_id=p_student_id and f.school_id=v_school_id
  returning f.* into v_row;
  if not found then raise foreign_key_violation using message='Food preference not found'; end if;
  return to_jsonb(v_row)-'school_id';
end;
$schoolsafe$;

revoke all on function api.student_record_read(uuid) from public;
revoke all on function api.student_identity_update(uuid,jsonb) from public;
revoke all on function api.student_family_read(uuid) from public;
revoke all on function api.student_guardian_add(uuid,jsonb) from public;
revoke all on function api.student_guardian_update(uuid,uuid,jsonb) from public;
revoke all on function api.student_guardian_set_primary(uuid,uuid) from public;
revoke all on function api.student_guardian_deactivate(uuid,uuid) from public;
revoke all on function api.student_emergency_contacts_read(uuid) from public;
revoke all on function api.student_health_read(uuid) from public;
revoke all on function api.student_health_condition_add(uuid,jsonb) from public;
revoke all on function api.student_health_condition_update(uuid,uuid,jsonb) from public;
revoke all on function api.student_allergy_update(uuid,uuid,jsonb) from public;
revoke all on function api.student_medication_update(uuid,uuid,jsonb) from public;
revoke all on function api.student_dietary_read(uuid) from public;
revoke all on function api.student_dietary_restriction_update(uuid,uuid,jsonb) from public;
revoke all on function api.student_food_preference_update(uuid,uuid,jsonb) from public;

grant execute on function api.student_record_read(uuid) to schoolsafe_api;
grant execute on function api.student_identity_update(uuid,jsonb) to schoolsafe_api;
grant execute on function api.student_family_read(uuid) to schoolsafe_api;
grant execute on function api.student_guardian_add(uuid,jsonb) to schoolsafe_api;
grant execute on function api.student_guardian_update(uuid,uuid,jsonb) to schoolsafe_api;
grant execute on function api.student_guardian_set_primary(uuid,uuid) to schoolsafe_api;
grant execute on function api.student_guardian_deactivate(uuid,uuid) to schoolsafe_api;
grant execute on function api.student_emergency_contacts_read(uuid) to schoolsafe_api;
grant execute on function api.student_health_read(uuid) to schoolsafe_api;
grant execute on function api.student_health_condition_add(uuid,jsonb) to schoolsafe_api;
grant execute on function api.student_health_condition_update(uuid,uuid,jsonb) to schoolsafe_api;
grant execute on function api.student_allergy_update(uuid,uuid,jsonb) to schoolsafe_api;
grant execute on function api.student_medication_update(uuid,uuid,jsonb) to schoolsafe_api;
grant execute on function api.student_dietary_read(uuid) to schoolsafe_api;
grant execute on function api.student_dietary_restriction_update(uuid,uuid,jsonb) to schoolsafe_api;
grant execute on function api.student_food_preference_update(uuid,uuid,jsonb) to schoolsafe_api;

revoke all on function api.student_emergency_contact_upsert(uuid,integer,uuid,text,text,text,text,text) from public;
revoke all on function api.student_health_profile_upsert(uuid,text,text,text,text,text,boolean,boolean) from public;
revoke all on function api.student_allergy_add(uuid,text,text,text,text,text) from public;
revoke all on function api.student_dietary_restriction_add(uuid,text,text,text) from public;
revoke all on function api.student_record_confirmation_set(uuid,text,boolean) from public;
revoke all on function api.student_consent_set(uuid,text,boolean) from public;
revoke all on function api.student_medication_add(uuid,text,text,text,text,boolean) from public;
revoke all on function api.student_food_preference_add(uuid,text,text,text) from public;
revoke all on function api.student_dietary_profile_upsert(uuid,boolean,text) from public;

grant execute on function api.student_emergency_contact_upsert(uuid,integer,uuid,text,text,text,text,text) to schoolsafe_api;
grant execute on function api.student_health_profile_upsert(uuid,text,text,text,text,text,boolean,boolean) to schoolsafe_api;
grant execute on function api.student_allergy_add(uuid,text,text,text,text,text) to schoolsafe_api;
grant execute on function api.student_dietary_restriction_add(uuid,text,text,text) to schoolsafe_api;
grant execute on function api.student_record_confirmation_set(uuid,text,boolean) to schoolsafe_api;
grant execute on function api.student_consent_set(uuid,text,boolean) to schoolsafe_api;
grant execute on function api.student_medication_add(uuid,text,text,text,text,boolean) to schoolsafe_api;
grant execute on function api.student_food_preference_add(uuid,text,text,text) to schoolsafe_api;
grant execute on function api.student_dietary_profile_upsert(uuid,boolean,text) to schoolsafe_api;

commit;
