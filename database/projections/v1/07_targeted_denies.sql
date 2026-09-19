\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;

-- A5.1 unit 07: same A5.0 bootstrap contract, plus exact projection of
-- targeted/conditional DENY rules (provenance, scope, target, condition,
-- dates) so the frontend never flattens a targeted deny into a global one.
-- Navigation metadata only, never an action authorization.
create or replace function api.session_bootstrap()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $schoolsafe$
declare v_school uuid:=iam.current_school_id(); v_profile uuid:=iam.current_profile_id(); v_result jsonb;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message='Active SchoolSafe context required'; end if;
  with current_roles as materialized (
    select r.id,r.code from iam.profile_roles pr
    join iam.roles r on r.id=pr.role_id and r.school_id=pr.school_id
    where pr.school_id=v_school and pr.profile_id=v_profile and pr.is_active and r.is_active
      and pr.starts_at<=now() and (pr.ends_at is null or pr.ends_at>=now())
  ), current_scopes as materialized (
    select gs.grant_id,gs.scope_code,gs.target_id from iam.grant_scopes gs
    join iam.role_permission_grants g on g.id=gs.grant_id and g.school_id=gs.school_id
    join current_roles r on r.id=g.role_id
    where gs.school_id=v_school and gs.is_active and gs.starts_at<=now() and (gs.ends_at is null or gs.ends_at>=now())
  ), current_grants as materialized (
    select g.id,g.effect,p.code,g.starts_at,g.ends_at from iam.role_permission_grants g
    join current_roles r on r.id=g.role_id join iam.permissions p on p.id=g.permission_id
    where g.school_id=v_school and g.is_active and p.is_active
      and g.starts_at<=now() and (g.ends_at is null or g.ends_at>=now())
      and exists(select 1 from current_scopes s where s.grant_id=g.id)
  ), current_exception_scopes as materialized (
    select es.exception_id,es.scope_code,es.target_id from iam.exception_scopes es
    join iam.profile_permission_exceptions e on e.id=es.exception_id and e.school_id=es.school_id
    where es.school_id=v_school and es.profile_id=v_profile and es.is_active and es.starts_at<=now() and (es.ends_at is null or es.ends_at>=now())
  ), current_exceptions as materialized (
    select ex.id,ex.effect,ex.reason,ex.expires_at,ex.condition_code,ex.condition_params,ex.starts_at,p.code from iam.profile_permission_exceptions ex
    join iam.permissions p on p.id=ex.permission_id
    where ex.school_id=v_school and ex.profile_id=v_profile and ex.is_active and p.is_active
      and ex.starts_at<=now() and (ex.expires_at is null or ex.expires_at>=now())
      and exists(select 1 from current_exception_scopes s where s.exception_id=ex.id)
  ), denied_codes as materialized (
    select code from current_grants where effect='deny'
    union select code from current_exceptions where effect='deny'
  ), denied_rules as (
    select g.code,'role'::text as source,g.id::text as origin_id,s.scope_code,s.target_id,
      c.condition_code,c.condition_params,g.starts_at,g.ends_at
    from current_grants g
    join current_scopes s on s.grant_id=g.id
    left join iam.permission_conditions c on c.school_id=v_school and c.grant_id=g.id and c.is_active
    where g.effect='deny'
    union all
    select e.code,'exception'::text as source,e.id::text as origin_id,s.scope_code,s.target_id,
      e.condition_code,e.condition_params,e.starts_at,e.expires_at
    from current_exceptions e
    join current_exception_scopes s on s.exception_id=e.id
    where e.effect='deny'
  ), allowed_codes as (
    select code from current_grants where effect='allow'
    union select code from current_exceptions where effect='allow'
  ), allowed_scopes as materialized (
    select g.code,s.scope_code,s.target_id from current_grants g join current_scopes s on s.grant_id=g.id
    where g.effect='allow' and not exists(select 1 from denied_codes d where d.code=g.code)
  ), allowed_exception_scopes as (
    select e.code,s.scope_code,s.target_id from current_exceptions e join current_exception_scopes s on s.exception_id=e.id
    where e.effect='allow' and not exists(select 1 from denied_codes d where d.code=e.code)
  ), teacher_links as materialized (
    select distinct ta.class_id,ta.subject_id from app.teacher_assignments ta
    where ta.school_id=v_school and ta.teacher_profile_id=v_profile and ta.is_active
      and ta.starts_on<=current_date and (ta.ends_on is null or ta.ends_on>=current_date)
  )
  select jsonb_build_object(
    'profile',(select jsonb_build_object('id',p.id,'display_name',p.display_name) from iam.profiles p where p.id=v_profile and p.school_id=v_school),
    'schoolId',v_school,
    'school',(select jsonb_build_object('id',s.id,'code',s.code,'name',s.name) from app.schools s where s.id=iam.current_school_id()),
    'roles',coalesce((select jsonb_agg(code order by code) from current_roles),'[]'::jsonb),
    'permissions',coalesce((select jsonb_agg(a.code order by a.code) from allowed_codes a
      where not exists(select 1 from denied_codes d where d.code=a.code)),'[]'::jsonb),
    'deniedPermissions',coalesce((select jsonb_agg(code order by code) from denied_codes),'[]'::jsonb),
    'deniedRules',coalesce((select jsonb_agg(jsonb_build_object(
      'permission',d.code,'source',d.source,'originId',d.origin_id,'effect','deny',
      'scopeType',d.scope_code,'target',d.target_id,
      'conditionCode',d.condition_code,'conditionParams',d.condition_params,
      'startsAt',d.starts_at,'endsAt',d.ends_at)
      order by d.code,d.source,d.scope_code,d.target_id) from denied_rules d),'[]'::jsonb),
    'scopes',coalesce((select jsonb_agg(jsonb_build_object('permission',s.code,'type',s.scope_code,'target',s.target_id)
      order by s.code,s.scope_code,s.target_id) from allowed_scopes s),'[]'::jsonb),
    'permissionExceptions',coalesce((select jsonb_agg(jsonb_build_object(
      'permission',e.code,'effect',e.effect,'reason',e.reason,'expires_at',e.expires_at,
      'scopes',coalesce((select jsonb_agg(jsonb_build_object('permission',e.code,'type',s.scope_code,'target',s.target_id)
        order by s.scope_code,s.target_id) from current_exception_scopes s where s.exception_id=e.id),'[]'::jsonb)
      ) order by e.code,e.id) from current_exceptions e),'[]'::jsonb),
    'childIds',coalesce((select jsonb_agg(distinct sg.student_id) from app.student_guardians sg
      where sg.school_id=v_school and sg.profile_id=v_profile and sg.is_active
        and iam.is_guardian_of(v_profile,sg.student_id)),'[]'::jsonb),
    'assignedClassIds',coalesce((select jsonb_agg(distinct class_id) from teacher_links),'[]'::jsonb),
    'assignedSubjectIds',coalesce((select jsonb_agg(distinct subject_id) from teacher_links),'[]'::jsonb),
    'assignedPortalIds',coalesce((select jsonb_agg(distinct s.target_id) from (
        select * from allowed_scopes union select * from allowed_exception_scopes
      ) s join app.security_portals p on p.id=s.target_id and p.school_id=v_school and p.is_active
      where s.scope_code='assigned_portal'),'[]'::jsonb),
    'offline_policy',jsonb_build_object('max_offline_hours',24)
  ) into v_result;
  return v_result;
end
$schoolsafe$;
revoke all on function api.session_bootstrap() from public;
grant execute on function api.session_bootstrap() to schoolsafe_api;
commit;