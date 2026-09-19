\set ON_ERROR_STOP on

-- SchoolSafe Familles — Lot C : accrédités externes à la récupération.
-- Unité additive : ne modifie aucune table ni unité existante.
-- Règles V05–V11 : jusqu'à 3 accrédités externes ACTIFS par enfant
-- (slot_no 1..3, unicité active), aucun compte créé, aucun droit sur le
-- dossier ; le retrait/suspension demandé par le principal prend effet
-- immédiatement ; l'activation exige la validation scolaire et une photo.

begin;
set local role schoolsafe_owner;

create table if not exists app.pickup_authorizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  slot_no integer not null,
  status text not null default 'draft',
  requested_by uuid,
  validated_by uuid,
  reason text,
  photo_verified boolean not null default false,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint pickup_authorizations_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint pickup_authorizations_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint pickup_authorizations_guardian_fkey foreign key (school_id, guardian_id) references app.student_guardians(school_id, id) on delete cascade,
  constraint pickup_authorizations_requested_by_fkey foreign key (school_id, requested_by) references app.student_guardians(school_id, id) on delete set null (requested_by),
  constraint pickup_authorizations_slot_check check (slot_no between 1 and 3),
  constraint pickup_authorizations_status_check check (status in ('draft','pending','active','suspended','expired','revoked')),
  constraint pickup_authorizations_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists pickup_authorizations_active_slot
  on app.pickup_authorizations (school_id, student_id, slot_no) where (status = 'active');
create index if not exists pickup_authorizations_student_idx on app.pickup_authorizations (student_id);
create index if not exists pickup_authorizations_guardian_idx on app.pickup_authorizations (guardian_id);
create index if not exists pickup_authorizations_active_idx on app.pickup_authorizations (school_id, student_id) where (status = 'active');

-- ============================================================================
-- 2. CRÉER UNE DEMANDE — principal seul (T10) ; aucun droit avant validation
-- ============================================================================
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
as $schoolsafe$
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

  perform iam.require_access('school.guardian.manage', null, p_student_id, null);

  -- Le demandeur doit être le lien familial principal actif de cet élève (V05).
  select id into v_requested_by
  from app.student_guardians
  where student_id = p_student_id and school_id = v_school_id
    and is_primary = true and is_active = true;
  if v_requested_by is null then
    raise exception using errcode = '22023',
      message = 'Aucun responsable principal actif : demande impossible';
  end if;

  -- La personne ne doit pas être un responsable familial actif de cet enfant (7.1).
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
end;
$schoolsafe$;

-- ============================================================================
-- 3. VALIDER — école habilitée ; attribue un slot libre sous verrou (T11)
-- ============================================================================
create or replace function api.pickup_authorization_validate(
  p_authorization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_auth app.pickup_authorizations%rowtype;
  v_slot int;
begin
  perform iam.require_access('school.guardian.manage');

  select * into v_auth
  from app.pickup_authorizations
  where id = p_authorization_id and school_id = v_school_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Autorisation introuvable';
  end if;
  if v_auth.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Autorisation non en attente';
  end if;

  -- Photo obligatoire avant activation (V08).
  perform 1
  from app.student_guardians g
  where g.id = v_auth.guardian_id and g.photo_path is not null;
  if not found then
    raise exception using errcode = '22023', message = 'PHOTO_REQUIRED : photo de la personne absente';
  end if;

  -- Slot libre sous verrou de l'élève : max 3 actifs (V06/T11).
  perform 1 from app.students where id = v_auth.student_id for update;
  select s.slot_no into v_slot
  from generate_series(1, 3) as s(slot_no)
  where not exists (
    select 1 from app.pickup_authorizations a
    where a.school_id = v_school_id and a.student_id = v_auth.student_id
      and a.slot_no = s.slot_no and a.status = 'active'
  )
  order by s.slot_no
  limit 1;
  if v_slot is null then
    raise exception using errcode = '22023', message = 'PICKUP_LIMIT_REACHED : trois accrédités actifs';
  end if;

  update app.pickup_authorizations
  set status = 'active', slot_no = v_slot, validated_by = v_profile_id,
      photo_verified = true, updated_at = now()
  where id = p_authorization_id;

  insert into app.security_events (school_id, student_id, event_type, decision, metadata)
  values (
    v_school_id, v_auth.student_id, 'pickup_authorization_validated', 'noted',
    jsonb_build_object('authorization_id', p_authorization_id, 'validated_by', v_profile_id, 'slot_no', v_slot)
  );

  return jsonb_build_object('id', p_authorization_id, 'status', 'active', 'slot_no', v_slot);
end;
$schoolsafe$;

-- ============================================================================
-- 4. RETIRER / SUSPENDRE — principal ou école ; effet immédiat (T10/V14)
-- ============================================================================
create or replace function api.pickup_authorization_revoke(
  p_authorization_id uuid,
  p_reason text default null,
  p_mode text default 'revoked'  -- 'revoked' | 'suspended'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_student_id uuid;
begin
  perform iam.require_access('school.guardian.manage');

  select student_id into v_student_id
  from app.pickup_authorizations
  where id = p_authorization_id and school_id = v_school_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Autorisation introuvable';
  end if;

  update app.pickup_authorizations
  set status = p_mode, updated_at = now()
  where id = p_authorization_id and status in ('active','pending','suspended');

  insert into app.security_events (school_id, student_id, event_type, decision, metadata)
  values (
    v_school_id, v_student_id, 'pickup_authorization_' || p_mode, 'noted',
    jsonb_build_object('authorization_id', p_authorization_id, 'actor', v_profile_id, 'reason', p_reason)
  );

  return jsonb_build_object('id', p_authorization_id, 'status', p_mode);
end;
$schoolsafe$;

-- ============================================================================
-- 5. LISTE — les deux groupes séparés (7.1) pour l'écran du gardien
-- ============================================================================
create or replace function api.pickup_authorization_list(
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('security.scan', null, p_student_id, null);

  return jsonb_build_object(
    'student_id', p_student_id,
    'family', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'guardian_id', g.id, 'name', g.full_name, 'type', g.guardian_type,
        'is_primary', g.is_primary, 'photo_path', g.photo_path,
        'authorized', (g.is_authorized_pickup and g.is_active)
      ) order by g.is_primary desc, g.guardian_type), '[]'::jsonb)
      from app.student_guardians g
      where g.student_id = p_student_id and g.school_id = v_school_id and g.is_active
    ),
    'accredited', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'authorization_id', a.id, 'guardian_id', a.guardian_id, 'name', g.full_name,
        'status', a.status, 'slot_no', a.slot_no, 'photo_path', g.photo_path,
        'starts_on', a.starts_on, 'ends_on', a.ends_on
      ) order by a.slot_no nulls last), '[]'::jsonb)
      from app.pickup_authorizations a
      join app.student_guardians g on g.id = a.guardian_id
      where a.student_id = p_student_id and a.school_id = v_school_id
    )
  );
end;
$schoolsafe$;

commit;