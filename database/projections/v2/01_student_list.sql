\set ON_ERROR_STOP on
-- Additive replacement of the uninstalled v1 student_list unit. v1 is immutable.
begin;
set local role schoolsafe_owner;

create or replace function api.student_list(
  p_status text default null, p_query text default null, p_class_id uuid default null,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $schoolsafe$
declare
  v_school uuid := iam.current_school_id();
  v_limit integer := greatest(1, least(coalesce(p_limit,50),200));
  v_offset integer := greatest(0, least(coalesce(p_offset,0),100000));
  v_result jsonb;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message='Verified school context required';
  end if;
  with visible as materialized (
    select s.id,s.matricule,s.first_name,s.last_name,s.school_id,s.lifecycle_status,
           coalesce(e.class_id,s.class_id) as class_id,c.name as class_name
    from app.students s
    left join lateral (
      select en.class_id from app.student_enrollments en
      where en.school_id=v_school and en.student_id=s.id and en.status in ('active','draft')
      order by (en.status='active') desc,en.starts_on desc,en.id limit 1
    ) e on true
    left join app.classes c on c.school_id=v_school and c.id=coalesce(e.class_id,s.class_id)
    where s.school_id=v_school
      and (p_status is null or s.lifecycle_status=p_status)
      and (p_class_id is null or coalesce(e.class_id,s.class_id)=p_class_id)
      and (p_query is null or s.first_name ilike '%'||p_query||'%'
           or s.last_name ilike '%'||p_query||'%' or s.matricule ilike '%'||p_query||'%')
      and iam.can_access('school.student.read',null,s.id,coalesce(e.class_id,s.class_id))
  ), paged as (
    select * from visible order by last_name,first_name,id limit v_limit offset v_offset
  )
  select jsonb_build_object('total',(select count(*) from visible),
    'rows',coalesce((select jsonb_agg(to_jsonb(p) order by last_name,first_name,id) from paged p),'[]'::jsonb),
    'limit',v_limit,'offset',v_offset) into v_result;
  return v_result;
end
$schoolsafe$;

create or replace function api.student_create_draft(
  p_school_id uuid,p_matricule text,p_first_name text,p_middle_name text,p_last_name text,
  p_date_of_birth text,p_gender text,p_academic_year_id uuid,p_planned_class_id uuid,
  p_enrollment_starts_on date
) returns uuid language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare
  v_school uuid:=iam.current_school_id();
  v_student uuid;
begin
  if p_school_id is distinct from v_school or not iam.context_is_valid() then
    raise insufficient_privilege using message='School does not match verified context';
  end if;
  perform iam.require_access('school.student.create',null,null,p_planned_class_id);
  if nullif(btrim(p_matricule),'') is null or nullif(btrim(p_first_name),'') is null
     or nullif(btrim(p_last_name),'') is null or p_enrollment_starts_on is null then
    raise check_violation using message='Complete student identity and enrollment date required';
  end if;
  if not exists (
    select 1 from app.classes c join app.academic_years y
      on y.school_id=c.school_id and y.id=c.academic_year_id
    where c.school_id=v_school and c.id=p_planned_class_id and c.is_active
      and y.id=p_academic_year_id and p_enrollment_starts_on between y.starts_on and y.ends_on
  ) then
    raise foreign_key_violation using message='Class, year and date must belong to the active school';
  end if;
  insert into app.students(school_id,class_id,matricule,first_name,middle_name,last_name,
    date_of_birth,gender,lifecycle_status,created_by)
  values(v_school,null,btrim(p_matricule),btrim(p_first_name),p_middle_name,
    btrim(p_last_name),nullif(p_date_of_birth,'')::date,p_gender,'draft',iam.current_profile_id())
  returning id into v_student;
  insert into app.student_enrollments(school_id,student_id,academic_year_id,class_id,status,starts_on,created_by)
  values(v_school,v_student,p_academic_year_id,p_planned_class_id,'draft',p_enrollment_starts_on,iam.current_profile_id());
  perform audit.write_event('student.draft.created','student',v_student,'{}'::jsonb);
  return v_student;
end
$schoolsafe$;
revoke all on function api.student_list(text,text,uuid,integer,integer) from public;
revoke all on function api.student_create_draft(uuid,text,text,text,text,text,text,uuid,uuid,date) from public;
grant execute on function api.student_list(text,text,uuid,integer,integer) to schoolsafe_api;
grant execute on function api.student_create_draft(uuid,text,text,text,text,text,text,uuid,uuid,date) to schoolsafe_api;
commit;
