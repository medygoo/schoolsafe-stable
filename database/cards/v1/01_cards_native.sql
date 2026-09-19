\set ON_ERROR_STOP on

-- SchoolSafe Cartes v1 — RPC natifs pour les demandes d'impression.
-- Remplace l'ancien service Supabase.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. CRÉER UNE DEMANDE D'IMPRESSION
-- ============================================================================

create or replace function api.card_print_request_create(
  p_student_id uuid,
  p_format text,
  p_front_image_url text default null,
  p_back_image_url text default null,
  p_front_r2_key text default null,
  p_back_r2_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_class_id uuid;
  v_student app.students%rowtype;
  v_current_version int;
  v_next_version int;
  v_academic_year_id uuid;
  v_id uuid;
begin
  -- Résoudre l'élève et sa classe avant autorisation (cible exacte)
  select * into v_student
  from app.students
  where id = p_student_id and school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Élève introuvable';
  end if;

  v_class_id := v_student.class_id;

  perform iam.require_access('cards.request.print', null, p_student_id, v_class_id);

  -- Récupérer la version actuelle
  select max(version) into v_current_version
  from app.card_print_requests
  where student_id = p_student_id and school_id = v_school_id;

  v_next_version := coalesce(v_current_version, 0) + 1;

  -- Année académique active
  select id into v_academic_year_id
  from app.academic_years
  where school_id = v_school_id and is_active = true
  limit 1;

  -- Créer la demande
  insert into app.card_print_requests (
    school_id, student_id, academic_year_id, requested_by, format,
    is_duplicate, version, status,
    front_image_url, back_image_url, front_r2_key, back_r2_key, metadata
  ) values (
    v_school_id, p_student_id, v_academic_year_id, v_profile_id, p_format,
    v_next_version > 1, v_next_version, 'pending',
    p_front_image_url, p_back_image_url, p_front_r2_key, p_back_r2_key, p_metadata
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'student_id', p_student_id,
    'version', v_next_version,
    'is_duplicate', v_next_version > 1,
    'status', 'pending'
  );
end
$schoolsafe$;
grant execute on function api.card_print_request_create(uuid, text, text, text, text, text, jsonb) to schoolsafe_api;

-- ============================================================================
-- 2. LISTER LES DEMANDES D'IMPRESSION
-- ============================================================================

create or replace function api.card_print_request_list(
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('cards.print.read', null, null, null);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', cpr.id,
        'student_id', cpr.student_id,
        'student_name', s.first_name || ' ' || s.last_name,
        'matricule', s.matricule,
        'class_name', c.name,
        'format', cpr.format,
        'version', cpr.version,
        'is_duplicate', cpr.is_duplicate,
        'status', cpr.status,
        'front_image_url', cpr.front_image_url,
        'back_image_url', cpr.back_image_url,
        'metadata', cpr.metadata,
        'requested_at', cpr.requested_at,
        'submitted_at', cpr.submitted_at,
        'printed_at', cpr.printed_at
      ) order by cpr.requested_at desc
    ), '[]'::jsonb)
    from app.card_print_requests cpr
    join app.students s on s.id = cpr.student_id and s.school_id = v_school_id
    left join app.classes c on c.id = s.class_id
    where cpr.school_id = v_school_id
      and (p_status is null or cpr.status = p_status)
    limit p_limit offset p_offset
  );
end
$schoolsafe$;
grant execute on function api.card_print_request_list(text, int, int) to schoolsafe_api;

-- ============================================================================
-- 3. METTRE À JOUR LE STATUT (marquer soumis/imprimé/échec)
-- ============================================================================

create or replace function api.card_print_request_update_status(
  p_id uuid,
  p_status text,
  p_control_app_reference text default null,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_now timestamptz := pg_catalog.now();
begin
  perform iam.require_access('cards.print.manage', null, null, null);

  update app.card_print_requests
  set status = p_status,
      control_app_reference = coalesce(p_control_app_reference, control_app_reference),
      error_message = case when p_status = 'failed' then p_error_message else error_message end,
      submitted_at = case when p_status = 'submitted' and submitted_at is null then v_now else submitted_at end,
      printed_at = case when p_status = 'printed' then v_now else printed_at end,
      updated_at = v_now
  where id = p_id and school_id = v_school_id;

  return found;
end
$schoolsafe$;
grant execute on function api.card_print_request_update_status(uuid, text, text, text) to schoolsafe_api;

-- ============================================================================
-- 4. COMPTER LES DEMANDES PAR STATUT
-- ============================================================================

create or replace function api.card_print_request_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  return (
    select jsonb_build_object(
      'pending', count(*) filter (where status = 'pending'),
      'submitted', count(*) filter (where status = 'submitted'),
      'printed', count(*) filter (where status = 'printed'),
      'failed', count(*) filter (where status = 'failed'),
      'total', count(*)
    )
    from app.card_print_requests
    where school_id = v_school_id
  );
end
$schoolsafe$;
grant execute on function api.card_print_request_counts() to schoolsafe_api;

commit;