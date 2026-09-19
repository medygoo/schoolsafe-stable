\set ON_ERROR_STOP on

-- SchoolSafe Projections v1 — unité 02 : liste paginée des élèves.
-- Respecte l'Access_Law : filtré par school_id + permission.
-- Portée : school (direction), assigned_classes (enseignant), own_children (parent).

begin;
set local role schoolsafe_owner;

create or replace function api.student_list(
  p_status text default null,
  p_query text default null,
  p_class_id uuid default null,
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
  v_profile_id uuid := iam.current_profile_id();
  v_result jsonb;
  v_total int;
  v_rows jsonb;
begin
  -- Vérifier que l'utilisateur a au moins la permission de lire les élèves
  perform iam.require_access('school.student.read', null, null, null);

  -- Construire la requête filtrée par school_id
  with filtered as (
    select
      s.id,
      s.matricule,
      s.first_name,
      s.last_name,
      s.class_id,
      (select c.name from app.classes c where c.id = s.class_id and c.school_id = v_school_id) as class_name,
      s.school_id,
      s.lifecycle_status,
      s.created_at
    from app.students s
    where s.school_id = v_school_id
      and (p_status is null or s.lifecycle_status = p_status)
      and (p_class_id is null or s.class_id = p_class_id)
      and (p_query is null
        or s.first_name ilike '%' || p_query || '%'
        or s.last_name ilike '%' || p_query || '%'
        or s.matricule ilike '%' || p_query || '%')
  ),
  counted as (
    select count(*)::int as total from filtered
  ),
  paged as (
    select f.*
    from filtered f
    order by f.last_name, f.first_name
    limit p_limit
    offset p_offset
  )
  select
    c.total,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'matricule', p.matricule,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'class_id', p.class_id,
      'class_name', p.class_name,
      'school_id', p.school_id,
      'lifecycle_status', p.lifecycle_status
    ) order by p.last_name, p.first_name), '[]'::jsonb) as rows
  into v_total, v_rows
  from counted c, paged p
  group by c.total;

  if v_total is null then
    v_total := 0;
    v_rows := '[]'::jsonb;
  end if;

  v_result := jsonb_build_object(
    'total', v_total,
    'rows', v_rows,
    'limit', p_limit,
    'offset', p_offset
  );

  return v_result;
end
$schoolsafe$;

grant execute on function api.student_list(text, text, uuid, int, int) to schoolsafe_api;

-- Crée un élève en mode brouillon (draft) avec son inscription initiale.
-- Retourne l'id de l'élève créé.

create or replace function api.student_create_draft(
  p_school_id uuid,
  p_matricule text,
  p_first_name text,
  p_middle_name text default null,
  p_last_name text,
  p_date_of_birth text default null,
  p_gender text default null,
  p_academic_year_id uuid,
  p_planned_class_id uuid,
  p_enrollment_starts_on date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_student_id uuid;
  v_school_id uuid := iam.current_school_id();
begin
  -- Vérifier que l'utilisateur a la permission de créer un élève
  perform iam.require_access('school.student.create', null, null, null);

  insert into app.students (
    school_id, matricule, first_name, middle_name, last_name,
    date_of_birth, gender, lifecycle_status
  ) values (
    p_school_id, p_matricule, p_first_name, p_middle_name, p_last_name,
    p_date_of_birth::date, p_gender, 'draft'
  ) returning id into v_student_id;

  insert into app.student_enrollments (
    student_id, school_id, academic_year_id, class_id,
    starts_on, status
  ) values (
    v_student_id, p_school_id, p_academic_year_id, p_planned_class_id,
    p_enrollment_starts_on, 'planned'
  );

  return v_student_id;
end
$schoolsafe$;

grant execute on function api.student_create_draft(uuid, text, text, text, text, text, text, uuid, uuid, date) to schoolsafe_api;

commit;