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
