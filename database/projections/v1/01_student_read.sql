\set ON_ERROR_STOP on

-- SchoolSafe Projections v1 — unité 01 : première lecture métier autorisée.
-- Projection FILTRÉE (jamais la ligne complète) : seulement ce que la
-- permission school.student.read autorise. La classe est résolue côté serveur
-- pour l'évaluation de portée (jamais fournie par le client).

begin;
set local role schoolsafe_owner;

create or replace function api.student_read(p_student_id uuid)
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
begin
  -- Résolution serveur de la classe active de l'élève (pour la portée).
  select e.class_id into v_class_id
  from app.student_enrollments e
  where e.student_id = p_student_id
    and e.school_id = v_school_id
    and e.status = 'active'
  order by e.starts_on desc
  limit 1;

  -- Access_Law : permission + portée (parent : lien actif ; enseignant :
  -- affectation de classe ; direction/admin : school) + DENY prioritaire.
  perform iam.require_access('school.student.read', null, p_student_id, v_class_id);

  select * into v_student
  from app.students s
  where s.id = p_student_id and s.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Student not found in the active school';
  end if;

  select c.name into v_class_name
  from app.classes c
  where c.id = v_student.class_id and c.school_id = v_school_id;

  return jsonb_build_object(
    'id', v_student.id,
    'matricule', v_student.matricule,
    'first_name', v_student.first_name,
    'last_name', v_student.last_name,
    'class_id', v_student.class_id,
    'class_name', v_class_name,
    'school_id', v_student.school_id,
    'lifecycle_status', v_student.lifecycle_status
  );
end
$schoolsafe$;

grant execute on function api.student_read(uuid) to schoolsafe_api;

commit;
