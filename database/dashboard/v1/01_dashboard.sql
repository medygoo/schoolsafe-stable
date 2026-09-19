\set ON_ERROR_STOP on

-- SchoolSafe Dashboard — service d'agrégation par rôle (ordre §1-11).
-- Unité additive : ne modifie aucune donnée existante.
-- Principes : aucune table parallèle — tout est CALCULÉ depuis la source
-- de vérité (schools, students, classes, iam.profiles, attendance_records,
-- assignments, grades, student_fees). Aucun total stocké ; agrégations
-- COUNT/SUM + LIMIT ; isolation school_id stricte (résolue depuis le
-- contexte serveur, jamais du client).
-- Le sexe du personnel n'existait pas : colonne additive gender sur
-- iam.profiles (null = non renseigné, comme students.gender).

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. MIGRATION MINIMALE — sexe du personnel (seul manque de l'audit)
-- ============================================================================
alter table iam.profiles add column if not exists gender text;

-- ============================================================================
-- 2. DASHBOARD PARENT — fiche école + ses enfants uniquement
-- ============================================================================
create or replace function api.dashboard_parent()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_school jsonb;
begin
  select jsonb_build_object(
    'name', s.name,
    'display_name', coalesce(s.name_en, s.name),
    'logo_path', s.logo_path,
    'address', (sc.city || coalesce(', ' || sc.address, '')),
    'phone', sc.phone,
    'email', sc.email,
    'website_url', sc.website_url,
    'academic_year', (
      select ay.label from app.academic_years ay
      where ay.school_id = s.id and ay.is_active limit 1
    )
  ) into v_school
  from app.schools s
  left join app.school_contacts sc on sc.school_id = s.id
  where s.id = v_school_id;

  return jsonb_build_object(
    'school', coalesce(v_school, '{}'::jsonb),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', st.id,
        'photo_path', st.photo_path,
        'name', (st.first_name || ' ' || st.last_name),
        'class_name', c.name
      ) order by st.first_name)
      from app.student_guardians sg
      join app.students st on st.id = sg.student_id and st.school_id = v_school_id
        and st.lifecycle_status = 'active'
      left join app.classes c on c.id = st.class_id
      where sg.profile_id = v_profile_id and sg.is_active
    ), '[]'::jsonb)
  );
end;
$schoolsafe$;

-- ============================================================================
-- 3. DASHBOARD PARENT — enfant sélectionné (contrôle serveur du rattachement)
-- ============================================================================
create or replace function api.dashboard_child(
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_is_parent boolean;
begin
  -- Sécurité : l'élève doit être rattaché à ce profil (jamais du client).
  select exists(
    select 1 from app.student_guardians sg
    join app.students st on st.id = sg.student_id and st.school_id = v_school_id
    where sg.profile_id = v_profile_id and sg.is_active and sg.student_id = p_student_id
  ) into v_is_parent;
  if not v_is_parent then
    raise exception using errcode = '42501',
      message = 'CHILD_NOT_YOURS : cet enfant n''est pas rattaché à votre profil';
  end if;

  return jsonb_build_object(
    'student_id', p_student_id,
    'presence_today', (
      select jsonb_build_object('status', ar.status, 'arrived_at', ar.arrived_at, 'left_at', ar.left_at)
      from app.attendance_records ar
      where ar.school_id = v_school_id and ar.student_id = p_student_id and ar.day = current_date
    ),
    'last_arrivals', coalesce((
      select jsonb_agg(jsonb_build_object('day', ar.day, 'arrived_at', ar.arrived_at) order by ar.day desc)
      from (select day, arrived_at from app.attendance_records
            where school_id = v_school_id and student_id = p_student_id
              and arrived_at is not null
            order by day desc limit 3) ar
    ), '[]'::jsonb),
    'last_departures', coalesce((
      select jsonb_agg(jsonb_build_object('day', ar.day, 'left_at', ar.left_at) order by ar.day desc)
      from (select day, left_at from app.attendance_records
            where school_id = v_school_id and student_id = p_student_id
              and left_at is not null
            order by day desc limit 3) ar
    ), '[]'::jsonb),
    'fees', (
      select jsonb_build_object(
        'expected', coalesce(sum(sf.amount_expected), 0),
        'paid', coalesce(sum(sf.amount_paid), 0),
        'remaining', coalesce(sum(sf.amount_remaining), 0)
      )
      from app.student_fees sf
      where sf.school_id = v_school_id and sf.student_id = p_student_id
    ),
    'recent_assignments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'due_date', a.due_date, 'status', a.status)
                       order by a.due_date desc nulls last)
      from (select id, title, due_date, status from app.assignments
            where school_id = v_school_id and class_id = (select class_id from app.students where id = p_student_id)
            order by due_date desc nulls last limit 5) a
    ), '[]'::jsonb),
    'recent_grades', coalesce((
      select jsonb_agg(jsonb_build_object('value', g.value_numeric, 'comment', g.comment) order by g.created_at desc)
      from (select value_numeric, comment, created_at from app.grades g
            where g.school_id = v_school_id and g.student_id = p_student_id
            order by g.created_at desc limit 5) g
    ), '[]'::jsonb),
    'average', (
      select avg(g.normalized_value) from app.grades g
      where g.school_id = v_school_id and g.student_id = p_student_id
    )
  );
end;
$schoolsafe$;

-- ============================================================================
-- 4. DASHBOARD ENSEIGNANT — ses classes uniquement (calculées)
-- ============================================================================
create or replace function api.dashboard_teacher()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  return jsonb_build_object(
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'class_id', c.id, 'name', c.name,
        'total', cs.total, 'boys', cs.boys, 'girls', cs.girls,
        'unspecified', cs.total - cs.boys - cs.girls,
        'present_today', cs.present_today
      ) order by c.name)
      from app.classes c
      left join app.teacher_assignments ta
        on ta.class_id = c.id and ta.teacher_profile_id = v_profile_id and ta.is_active
      left join lateral (
        select count(*) as total,
               count(*) filter (where st.gender = 'M') as boys,
               count(*) filter (where st.gender = 'F') as girls,
               (select count(*) from app.attendance_records ar
                where ar.class_id is null and ar.student_id in (
                  select id from app.students where class_id = c.id and school_id = v_school_id
                ) and ar.day = current_date and ar.status in ('present','late')) as present_today
        from app.students st
        where st.class_id = c.id and st.school_id = v_school_id and st.lifecycle_status = 'active'
      ) cs on true
      where c.school_id = v_school_id and c.is_active
        and (c.teacher_profile_id = v_profile_id or ta.id is not null)
    ), '[]'::jsonb)
  );
end;
$schoolsafe$;

-- ============================================================================
-- 5. DASHBOARD ADMINISTRATEUR — vue globale + effectifs par classe
-- ============================================================================
create or replace function api.dashboard_admin()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_school jsonb;
begin
  select jsonb_build_object(
    'name', s.name, 'display_name', coalesce(s.name_en, s.name), 'logo_path', s.logo_path
  ) into v_school
  from app.schools s where s.id = v_school_id;

  return coalesce(v_school, '{}'::jsonb) || jsonb_build_object(
    'students', (
      select jsonb_build_object(
        'total', count(*),
        'boys', count(*) filter (where st.gender = 'M'),
        'girls', count(*) filter (where st.gender = 'F'),
        'unspecified', count(*) filter (where st.gender is null or st.gender not in ('M','F'))
      )
      from app.students st
      where st.school_id = v_school_id and st.lifecycle_status = 'active'
    ),
    'staff', (
      select jsonb_build_object(
        'total', count(*),
        'men', count(*) filter (where p.gender = 'M'),
        'women', count(*) filter (where p.gender = 'F'),
        'unspecified', count(*) filter (where p.gender is null or p.gender not in ('M','F'))
      )
      from iam.profiles p
      where p.school_id = v_school_id and p.is_active
    ),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'class_id', c.id, 'name', c.name,
        'total', cs.total, 'boys', cs.boys, 'girls', cs.girls,
        'unspecified', cs.total - cs.boys - cs.girls
      ) order by c.name)
      from app.classes c
      left join lateral (
        select count(*) as total,
               count(*) filter (where st.gender = 'M') as boys,
               count(*) filter (where st.gender = 'F') as girls
        from app.students st
        where st.class_id = c.id and st.school_id = v_school_id and st.lifecycle_status = 'active'
      ) cs on true
      where c.school_id = v_school_id and c.is_active
    ), '[]'::jsonb),
    'attendance_today', (
      select jsonb_build_object(
        'present', count(*) filter (where ar.status in ('present','late','left'))
      )
      from app.attendance_records ar
      where ar.school_id = v_school_id and ar.day = current_date
    )
  );
end;
$schoolsafe$;

commit;