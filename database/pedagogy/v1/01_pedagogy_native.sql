\set ON_ERROR_STOP on

-- SchoolSafe Pédagogie v1 — RPC natifs complets.
-- Matières, affectations enseignants, devoirs, notes, plans de cours, palmarès.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. CLASSES
-- ============================================================================

create or replace function api.class_list()
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
    select coalesce(jsonb_agg(
      jsonb_build_object('id', c.id, 'name', c.name, 'cycle_key', c.cycle_key, 'option', c.option, 'academic_year_id', c.academic_year_id, 'is_active', c.is_active)
      order by c.name
    ), '[]'::jsonb)
    from app.classes c
    where c.school_id = v_school_id
      and iam.can_access('school.class.read', null, null, c.id, null)
  );
end
$schoolsafe$;
grant execute on function api.class_list() to schoolsafe_api;

-- ============================================================================
-- 2. MATIÈRES
-- ============================================================================

create or replace function api.subject_list()
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
    select coalesce(jsonb_agg(
      jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'cycle_key', s.cycle_key, 'coefficient', s.coefficient, 'is_active', s.is_active)
      order by s.name
    ), '[]'::jsonb)
    from app.subjects s
    where s.school_id = v_school_id
      and iam.can_access('pedagogy.subject.read', null, null, null, s.id)
  );
end
$schoolsafe$;
grant execute on function api.subject_list() to schoolsafe_api;

create or replace function api.subject_create(p_code text, p_name text, p_cycle_key text, p_coefficient int default 1)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_id uuid;
begin
  perform iam.require_access('pedagogy.subject.manage', null, null, null);
  insert into app.subjects (school_id, code, name, cycle_key, coefficient)
  values (v_school_id, p_code, p_name, p_cycle_key, p_coefficient)
  returning id into v_id;
  return v_id;
end
$schoolsafe$;
grant execute on function api.subject_create(text, text, text, int) to schoolsafe_api;

-- ============================================================================
-- 3. AFFECTATIONS ENSEIGNANTS
-- ============================================================================

create or replace function api.teacher_assignment_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('school.structure.manage', null, null, null);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('id', ta.id, 'profile_id', ta.profile_id, 'subject_id', ta.subject_id, 'class_id', ta.class_id, 'academic_year_id', ta.academic_year_id,
        'teacher_name', p.display_name, 'subject_name', s.name, 'class_name', c.name)
      order by p.display_name
    ), '[]'::jsonb)
    from app.teacher_assignments ta
    join iam.profiles p on p.id = ta.profile_id and p.school_id = v_school_id
    join app.subjects s on s.id = ta.subject_id and s.school_id = v_school_id
    join app.classes c on c.id = ta.class_id and c.school_id = v_school_id
    where ta.school_id = v_school_id
  );
end
$schoolsafe$;
grant execute on function api.teacher_assignment_list() to schoolsafe_api;

create or replace function api.teacher_assignment_create(p_profile_id uuid, p_subject_id uuid, p_class_id uuid, p_academic_year_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_id uuid;
begin
  perform iam.require_access('school.structure.manage', null, null, null);
  insert into app.teacher_assignments (school_id, profile_id, subject_id, class_id, academic_year_id)
  values (v_school_id, p_profile_id, p_subject_id, p_class_id, p_academic_year_id)
  returning id into v_id;
  return v_id;
end
$schoolsafe$;
grant execute on function api.teacher_assignment_create(uuid, uuid, uuid, uuid) to schoolsafe_api;

create or replace function api.teacher_assignment_delete(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('school.structure.manage', null, null, null);
  delete from app.teacher_assignments where id = p_id and school_id = v_school_id;
  return found;
end
$schoolsafe$;
grant execute on function api.teacher_assignment_delete(uuid) to schoolsafe_api;

-- ============================================================================
-- 4. DEVOIRS (assignments)
-- ============================================================================

create or replace function api.assignment_list(p_class_id uuid default null, p_subject_id uuid default null)
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
    select coalesce(jsonb_agg(
      jsonb_build_object('id', a.id, 'class_id', a.class_id, 'subject_id', a.subject_id, 'title', a.title, 'type', a.type, 'max_score', a.max_score,
        'coefficient', a.coefficient, 'assigned_at', a.assigned_at, 'due_at', a.due_at, 'published', a.published,
        'subject_name', s.name, 'class_name', c.name)
      order by a.assigned_at desc
    ), '[]'::jsonb)
    from app.assignments a
    join app.subjects s on s.id = a.subject_id and s.school_id = v_school_id
    join app.classes c on c.id = a.class_id and c.school_id = v_school_id
    where a.school_id = v_school_id
      and (p_class_id is null or a.class_id = p_class_id)
      and (p_subject_id is null or a.subject_id = p_subject_id)
      and iam.can_access('pedagogy.assignment.read', null, null, a.class_id, a.subject_id)
  );
end
$schoolsafe$;
grant execute on function api.assignment_list(uuid, uuid) to schoolsafe_api;

create or replace function api.assignment_create(
  p_class_id uuid, p_subject_id uuid, p_title text, p_type text, p_max_score numeric, p_coefficient int default 1, p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_id uuid;
begin
  perform iam.require_access('pedagogy.assignment.manage', null, null, p_class_id, p_subject_id);
  insert into app.assignments (school_id, class_id, subject_id, title, type, max_score, coefficient, due_at)
  values (v_school_id, p_class_id, p_subject_id, p_title, p_type, p_max_score, p_coefficient, p_due_at)
  returning id into v_id;
  return v_id;
end
$schoolsafe$;
grant execute on function api.assignment_create(uuid, uuid, text, text, numeric, int, timestamptz) to schoolsafe_api;

create or replace function api.assignment_update(p_id uuid, p_title text default null, p_max_score numeric default null, p_coefficient int default null, p_due_at timestamptz default null)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_subject_id uuid;
begin
  select a.class_id, a.subject_id
  into v_class_id, v_subject_id
  from app.assignments a
  where a.id = p_id and a.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Assignment not found in school';
  end if;

  perform iam.require_access('pedagogy.assignment.manage', null, null, v_class_id, v_subject_id);
  update app.assignments set
    title = coalesce(p_title, title),
    max_score = coalesce(p_max_score, max_score),
    coefficient = coalesce(p_coefficient, coefficient),
    due_at = coalesce(p_due_at, due_at)
  where id = p_id and school_id = v_school_id;
  return found;
end
$schoolsafe$;
grant execute on function api.assignment_update(uuid, text, numeric, int, timestamptz) to schoolsafe_api;

create or replace function api.assignment_publish(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_subject_id uuid;
begin
  select a.class_id, a.subject_id
  into v_class_id, v_subject_id
  from app.assignments a
  where a.id = p_id and a.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Assignment not found in school';
  end if;

  perform iam.require_access('pedagogy.assignment.manage', null, null, v_class_id, v_subject_id);
  update app.assignments set published = true where id = p_id and school_id = v_school_id;
  return found;
end
$schoolsafe$;
grant execute on function api.assignment_publish(uuid) to schoolsafe_api;

-- ============================================================================
-- 5. NOTES (grades)
-- ============================================================================

create or replace function api.grades_get(p_assignment_id uuid)
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
    select coalesce(jsonb_agg(
      jsonb_build_object('id', g.id, 'student_id', g.student_id, 'score', g.score, 'comment', g.comment,
        'student_name', s.first_name || ' ' || s.last_name, 'matricule', s.matricule)
      order by s.last_name, s.first_name
    ), '[]'::jsonb)
    from app.grades g
    join app.students s on s.id = g.student_id and s.school_id = v_school_id
    join app.assignments a on a.id = g.assignment_id and a.school_id = v_school_id
    where g.assignment_id = p_assignment_id
      and iam.can_access('pedagogy.grade.read', null, null, a.class_id, a.subject_id)
  );
end
$schoolsafe$;
grant execute on function api.grades_get(uuid) to schoolsafe_api;

create or replace function api.grades_save(p_assignment_id uuid, p_grades jsonb)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_subject_id uuid;
  v_grade jsonb;
begin
  select a.class_id, a.subject_id
  into v_class_id, v_subject_id
  from app.assignments a
  where a.id = p_assignment_id and a.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Assignment not found in school';
  end if;

  perform iam.require_access('pedagogy.grade.manage', null, null, v_class_id, v_subject_id);
  for v_grade in select * from pg_catalog.jsonb_array_elements(p_grades)
  loop
    insert into app.grades (school_id, assignment_id, student_id, score, comment)
    values (v_school_id, p_assignment_id, (v_grade->>'student_id')::uuid, (v_grade->>'score')::numeric, v_grade->>'comment')
    on conflict (assignment_id, student_id) do update set
      score = excluded.score, comment = excluded.comment;
  end loop;
  return true;
end
$schoolsafe$;
grant execute on function api.grades_save(uuid, jsonb) to schoolsafe_api;

create or replace function api.grades_publish(p_assignment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_subject_id uuid;
begin
  select a.class_id, a.subject_id
  into v_class_id, v_subject_id
  from app.assignments a
  where a.id = p_assignment_id and a.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Assignment not found in school';
  end if;

  perform iam.require_access('pedagogy.grade.manage', null, null, v_class_id, v_subject_id);
  update app.grades set published = true
  where assignment_id = p_assignment_id and school_id = v_school_id;
  return true;
end
$schoolsafe$;
grant execute on function api.grades_publish(uuid) to schoolsafe_api;

-- ============================================================================
-- 6. PLANS DE COURS
-- ============================================================================

create or replace function api.lesson_plan_list(p_class_id uuid default null, p_subject_id uuid default null)
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
    select coalesce(jsonb_agg(
      jsonb_build_object('id', lp.id, 'class_id', lp.class_id, 'subject_id', lp.subject_id, 'title', lp.title, 'week_start', lp.week_start,
        'objectives', lp.objectives, 'content', lp.content, 'status', lp.status,
        'subject_name', s.name, 'class_name', c.name)
      order by lp.week_start desc
    ), '[]'::jsonb)
    from app.lesson_plans lp
    join app.subjects s on s.id = lp.subject_id and s.school_id = v_school_id
    join app.classes c on c.id = lp.class_id and c.school_id = v_school_id
    where lp.school_id = v_school_id
      and (p_class_id is null or lp.class_id = p_class_id)
      and (p_subject_id is null or lp.subject_id = p_subject_id)
      and iam.can_access('pedagogy.lesson-plan.read', null, null, lp.class_id, lp.subject_id)
  );
end
$schoolsafe$;
grant execute on function api.lesson_plan_list(uuid, uuid) to schoolsafe_api;

create or replace function api.lesson_plan_create(p_class_id uuid, p_subject_id uuid, p_title text, p_week_start date, p_objectives text default null, p_content text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_id uuid;
begin
  perform iam.require_access('pedagogy.lesson-plan.manage', null, null, p_class_id, p_subject_id);
  insert into app.lesson_plans (school_id, class_id, subject_id, title, week_start, objectives, content)
  values (v_school_id, p_class_id, p_subject_id, p_title, p_week_start, p_objectives, p_content)
  returning id into v_id;
  return v_id;
end
$schoolsafe$;
grant execute on function api.lesson_plan_create(uuid, uuid, text, date, text, text) to schoolsafe_api;

create or replace function api.lesson_plan_update(p_id uuid, p_title text default null, p_objectives text default null, p_content text default null)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_subject_id uuid;
begin
  select lp.class_id, lp.subject_id
  into v_class_id, v_subject_id
  from app.lesson_plans lp
  where lp.id = p_id and lp.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Lesson plan not found in school';
  end if;

  perform iam.require_access('pedagogy.lesson-plan.manage', null, null, v_class_id, v_subject_id);
  update app.lesson_plans set
    title = coalesce(p_title, title),
    objectives = coalesce(p_objectives, objectives),
    content = coalesce(p_content, content)
  where id = p_id and school_id = v_school_id;
  return found;
end
$schoolsafe$;
grant execute on function api.lesson_plan_update(uuid, text, text, text) to schoolsafe_api;

create or replace function api.lesson_plan_delete(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_subject_id uuid;
begin
  select lp.class_id, lp.subject_id
  into v_class_id, v_subject_id
  from app.lesson_plans lp
  where lp.id = p_id and lp.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Lesson plan not found in school';
  end if;

  perform iam.require_access('pedagogy.lesson-plan.manage', null, null, v_class_id, v_subject_id);
  delete from app.lesson_plans where id = p_id and school_id = v_school_id;
  return found;
end
$schoolsafe$;
grant execute on function api.lesson_plan_delete(uuid) to schoolsafe_api;

-- ============================================================================
-- 7. PARENT — enfants et notes
-- ============================================================================

create or replace function api.parent_children_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_profile_id uuid := iam.current_profile_id();
  v_school_id uuid := iam.current_school_id();
begin
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('id', sg.student_id, 'first_name', s.first_name, 'last_name', s.last_name, 'matricule', s.matricule, 'class_id', s.class_id,
        'class_name', (select c.name from app.classes c where c.id = s.class_id))
      order by s.last_name, s.first_name
    ), '[]'::jsonb)
    from app.student_guardians sg
    join app.students s on s.id = sg.student_id and s.school_id = v_school_id
    where sg.school_id = v_school_id
      and sg.profile_id = v_profile_id
      and sg.is_active = true
  );
end
$schoolsafe$;
grant execute on function api.parent_children_list() to schoolsafe_api;

create or replace function api.parent_student_grades(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_profile_id uuid := iam.current_profile_id();
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
begin
  -- Vérifier que le parent est bien lié à cet élève (dans son école)
  if not exists (
    select 1 from app.student_guardians
    where school_id = v_school_id
      and profile_id = v_profile_id
      and student_id = p_student_id
      and is_active = true
  ) then
    return '[]'::jsonb;
  end if;

  select s.class_id
  into v_class_id
  from app.students s
  where s.id = p_student_id and s.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Student not found in school';
  end if;

  perform iam.require_access('pedagogy.grade.read', null, p_student_id, v_class_id);

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('id', g.id, 'assignment_id', g.assignment_id, 'title', a.title, 'subject_name', s.name,
        'score', g.score, 'max_score', a.max_score, 'coefficient', a.coefficient, 'published', g.published)
      order by a.assigned_at desc
    ), '[]'::jsonb)
    from app.grades g
    join app.assignments a on a.id = g.assignment_id and a.school_id = v_school_id
    join app.subjects s on s.id = a.subject_id and s.school_id = v_school_id
    where g.student_id = p_student_id and g.school_id = v_school_id
      and g.published = true
  );
end
$schoolsafe$;
grant execute on function api.parent_student_grades(uuid) to schoolsafe_api;

-- ============================================================================
-- 8. MOYENNES ÉLÈVE
-- ============================================================================

create or replace function api.student_averages(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
begin
  select s.class_id
  into v_class_id
  from app.students s
  where s.id = p_student_id and s.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Student not found in school';
  end if;

  perform iam.require_access('pedagogy.grade.read', null, p_student_id, v_class_id);

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('subject_id', agg.subject_id, 'subject_name', agg.subject_name,
        'average', agg.average, 'max', agg.max, 'coefficient', agg.coefficient)
      order by agg.subject_name
    ), '[]'::jsonb)
    from (
      select s.id as subject_id, s.name as subject_name,
        round(avg(g.score / a.max_score * 20)::numeric, 2) as average,
        20::numeric as max,
        max(s.coefficient) as coefficient
      from app.grades g
      join app.assignments a on a.id = g.assignment_id and a.school_id = v_school_id
      join app.subjects s on s.id = a.subject_id and s.school_id = v_school_id
      where g.student_id = p_student_id and g.school_id = v_school_id and g.published = true
      group by s.id, s.name
    ) agg
  );
end
$schoolsafe$;
grant execute on function api.student_averages(uuid) to schoolsafe_api;

-- ============================================================================
-- 9. PALMARÈS (rankings)
-- ============================================================================

create or replace function api.ranking_list(p_class_id uuid default null, p_academic_year_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('palmarques.read', null, null, null);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object('id', r.id, 'class_id', r.class_id, 'month', r.month, 'status', r.status,
        'class_name', c.name, 'academic_year_id', r.academic_year_id)
      order by r.month desc
    ), '[]'::jsonb)
    from app.rankings r
    join app.classes c on c.id = r.class_id and c.school_id = v_school_id
    where r.school_id = v_school_id
      and (p_class_id is null or r.class_id = p_class_id)
  );
end
$schoolsafe$;
grant execute on function api.ranking_list(uuid, uuid) to schoolsafe_api;

create or replace function api.ranking_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_result jsonb;
begin
  perform iam.require_access('palmarques.read', null, null, null);
  select jsonb_build_object(
    'id', r.id, 'class_id', r.class_id, 'month', r.month, 'status', r.status, 'class_name', c.name, 'data', r.data
  ) into v_result
  from app.rankings r
  join app.classes c on c.id = r.class_id and c.school_id = v_school_id
  where r.id = p_id and r.school_id = v_school_id;
  return v_result;
end
$schoolsafe$;
grant execute on function api.ranking_get(uuid) to schoolsafe_api;

create or replace function api.ranking_compute(p_class_id uuid, p_month date)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_academic_year_id uuid;
  v_ranking_id uuid;
  v_averages jsonb;
  v_weighted_avg numeric;
  v_entry record;
begin
  perform iam.require_access('palmarques.manage', null, null, null);
  -- Prendre l'année académique active
  select id into v_academic_year_id from app.academic_years where school_id = v_school_id and is_active = true limit 1;
  if v_academic_year_id is null then return null; end if;

  -- Calculer les moyennes pondérées par élève
  with student_avgs as (
    select g.student_id, round(sum(g.score / a.max_score * 20 * a.coefficient) / sum(a.coefficient), 2) as weighted_avg,
      jsonb_agg(jsonb_build_object('subject_name', s.name, 'average', round(avg(g.score / a.max_score * 20)::numeric, 2))) as subjects
    from app.grades g
    join app.assignments a on a.id = g.assignment_id and a.school_id = v_school_id
    join app.subjects s on s.id = a.subject_id and s.school_id = v_school_id
    where g.school_id = v_school_id and g.published = true
      and a.class_id = p_class_id
      and date_trunc('month', g.created_at) = date_trunc('month', p_month)
    group by g.student_id
  )
  insert into app.rankings (school_id, class_id, academic_year_id, month, status, data)
  select v_school_id, p_class_id, v_academic_year_id, p_month, 'draft',
    jsonb_build_object('students', jsonb_agg(
      jsonb_build_object('student_id', sa.student_id, 'weighted_average', sa.weighted_avg, 'subjects', sa.subjects,
        'rank', row_number() over (order by sa.weighted_avg desc))
    ))
  from student_avgs sa
  returning id into v_ranking_id;

  return v_ranking_id;
end
$schoolsafe$;
grant execute on function api.ranking_compute(uuid, date) to schoolsafe_api;

create or replace function api.ranking_publish(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('palmarques.manage', null, null, null);
  update app.rankings set status = 'published' where id = p_id and school_id = v_school_id;
  return found;
end
$schoolsafe$;
grant execute on function api.ranking_publish(uuid) to schoolsafe_api;

-- ============================================================================
-- 10. ÉTOILES (palmarès)
-- ============================================================================

create or replace function api.star_list(p_ranking_id uuid)
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
    select coalesce(jsonb_agg(
      jsonb_build_object('id', st.id, 'student_id', st.student_id, 'reason', st.reason,
        'awarded_by', st.awarded_by, 'created_at', st.created_at,
        'student_name', s.first_name || ' ' || s.last_name)
      order by st.created_at desc
    ), '[]'::jsonb)
    from app.stars st
    join app.students s on s.id = st.student_id and s.school_id = v_school_id
    where st.ranking_id = p_ranking_id and st.school_id = v_school_id
  );
end
$schoolsafe$;
grant execute on function api.star_list(uuid) to schoolsafe_api;

create or replace function api.star_add(p_ranking_id uuid, p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_id uuid;
begin
  perform iam.require_access('palmarques.manage', null, null, null);
  insert into app.stars (school_id, ranking_id, student_id, awarded_by)
  values (v_school_id, p_ranking_id, p_student_id, v_profile_id)
  returning id into v_id;
  return v_id;
end
$schoolsafe$;
grant execute on function api.star_add(uuid, uuid) to schoolsafe_api;

create or replace function api.star_remove(p_ranking_id uuid, p_student_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('palmarques.manage', null, null, null);
  delete from app.stars where ranking_id = p_ranking_id and student_id = p_student_id and school_id = v_school_id;
  return found;
end
$schoolsafe$;
grant execute on function api.star_remove(uuid, uuid) to schoolsafe_api;

commit;