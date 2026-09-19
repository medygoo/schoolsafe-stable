\set ON_ERROR_STOP on

-- A3 read models: delegation preview and revision, before explicit mutation.
-- Append-only migration; preserves the already applied A2 unit unchanged.
begin;
set local role schoolsafe_owner;

create or replace function api.access_profiles_list(p_query text default '', p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $schoolsafe$
declare
  v_school uuid := iam.current_school_id();
  v_result jsonb;
begin
  perform iam.require_access('roles.manage');
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 1000000
     or length(coalesce(p_query, '')) > 100 then
    raise invalid_parameter_value using message = 'Invalid access pagination';
  end if;
  with filtered as (
    select p.id, p.display_name, p.is_active, p.account_status
    from iam.profiles p
    where p.school_id = v_school
      and strpos(lower(p.display_name), lower(btrim(coalesce(p_query, '')))) > 0
  ), page as (
    select * from filtered order by lower(display_name), id limit p_limit offset p_offset
  )
  select jsonb_build_object('schoolId', v_school, 'total', (select count(*) from filtered),
    'limit', p_limit, 'offset', p_offset,
    'rows', coalesce((select jsonb_agg(to_jsonb(page) order by lower(display_name), id) from page), '[]'::jsonb))
  into v_result;
  return v_result;
end
$schoolsafe$;

create or replace function api.access_roles_list(p_query text default '', p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $schoolsafe$
declare
  v_school uuid := iam.current_school_id();
  v_result jsonb;
begin
  perform iam.require_access('roles.manage');
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 1000000
     or length(coalesce(p_query, '')) > 100 then
    raise invalid_parameter_value using message = 'Invalid access pagination';
  end if;
  with filtered as (
    select r.id, r.code, r.label, r.is_active, iam.role_is_delegatable(r.id) as delegatable from iam.roles r
    where r.school_id = v_school
      and strpos(lower(r.label || ' ' || r.code), lower(btrim(coalesce(p_query, '')))) > 0
  ), page as (
    select * from filtered order by lower(label), id limit p_limit offset p_offset
  )
  select jsonb_build_object('schoolId', v_school, 'total', (select count(*) from filtered),
    'limit', p_limit, 'offset', p_offset,
    'rows', coalesce((select jsonb_agg(to_jsonb(page) order by lower(label), id) from page), '[]'::jsonb))
  into v_result;
  return v_result;
end
$schoolsafe$;

create or replace function api.access_profile_read(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $schoolsafe$
declare
  v_school uuid := iam.current_school_id();
  v_profile jsonb;
begin
  -- Deliberately no target: a permission restricted to 'own' cannot read the directory.
  perform iam.require_access('roles.manage');
  select jsonb_build_object('id', p.id, 'display_name', p.display_name,
    'is_active', p.is_active, 'account_status', p.account_status)
  into v_profile from iam.profiles p where p.id = p_profile_id and p.school_id = v_school;
  if v_profile is null then return null; end if;

  return jsonb_build_object('schoolId', v_school, 'profile', v_profile,
    'revision', (select access_revision::text from app.schools where id=v_school),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'label', r.label,
        'is_active', r.is_active, 'assignment', jsonb_build_object(
          'is_active', pr.is_active, 'starts_at', pr.starts_at, 'ends_at', pr.ends_at)) order by r.code, r.id)
      from iam.profile_roles pr join iam.roles r on r.id = pr.role_id and r.school_id = pr.school_id
      where pr.school_id = v_school and pr.profile_id = p_profile_id
    ), '[]'::jsonb),
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'role_id', g.role_id, 'permission', p.code,
        'permission_active', p.is_active, 'effect', g.effect, 'is_active', g.is_active,
        'starts_at', g.starts_at, 'ends_at', g.ends_at,
        'scopes', coalesce((
          select jsonb_agg(jsonb_build_object('type', s.scope_code, 'target', s.target_id,
            'is_active', s.is_active, 'starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.scope_code, s.target_id, s.id)
          from iam.grant_scopes s where s.school_id = v_school and s.grant_id = g.id
        ), '[]'::jsonb),
        'conditions', coalesce((
          select jsonb_agg(jsonb_build_object('code', c.condition_code, 'is_active', c.is_active) order by c.condition_code, c.id)
          from iam.permission_conditions c where c.school_id = v_school and c.grant_id = g.id
        ), '[]'::jsonb)) order by p.code, g.role_id, g.id)
      from iam.profile_roles pr
      join iam.roles r on r.id = pr.role_id and r.school_id = pr.school_id
      join iam.role_permission_grants g on g.role_id = r.id and g.school_id = r.school_id
      join iam.permissions p on p.id = g.permission_id
      where pr.school_id = v_school and pr.profile_id = p_profile_id
    ), '[]'::jsonb),
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'permission', p.code, 'permission_active', p.is_active,
        'effect', e.effect, 'condition_code', e.condition_code, 'is_active', e.is_active,
        'starts_at', e.starts_at, 'ends_at', e.expires_at,
        'scopes', coalesce((
          select jsonb_agg(jsonb_build_object('type', s.scope_code, 'target', s.target_id,
            'is_active', s.is_active, 'starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.scope_code, s.target_id, s.id)
          from iam.exception_scopes s where s.school_id = v_school and s.exception_id = e.id
        ), '[]'::jsonb)) order by p.code, e.id)
      from iam.profile_permission_exceptions e join iam.permissions p on p.id = e.permission_id
      where e.school_id = v_school and e.profile_id = p_profile_id
    ), '[]'::jsonb));
end
$schoolsafe$;

create or replace function api.access_role_read(p_role uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $schoolsafe$
declare v_role jsonb; v_school uuid:=iam.current_school_id();
begin
  perform iam.require_access('roles.manage');
  select jsonb_build_object('id',id,'code',code,'label',label,'is_active',is_active,
    'delegatable',iam.role_is_delegatable(id)) into v_role from iam.roles where id=p_role and school_id=v_school;
  if v_role is null then return null; end if;
  return jsonb_build_object('schoolId',v_school,'role',v_role,
    'revision',(select access_revision::text from app.schools where id=v_school),
    'grants',coalesce((select jsonb_agg(jsonb_build_object(
      'permission',p.code,'effect',g.effect,'is_active',g.is_active,'starts_at',g.starts_at,'ends_at',g.ends_at,
      'scopes',coalesce((select jsonb_agg(jsonb_build_object('type',s.scope_code,'target',s.target_id,
        'is_active',s.is_active,'starts_at',s.starts_at,'ends_at',s.ends_at) order by s.scope_code,s.id)
        from iam.grant_scopes s where s.school_id=v_school and s.grant_id=g.id),'[]'::jsonb),
      'conditions',coalesce((select jsonb_agg(c.condition_code order by c.condition_code)
        from iam.permission_conditions c where c.school_id=v_school and c.grant_id=g.id and c.is_active),'[]'::jsonb)
    ) order by p.code,g.id) from iam.role_permission_grants g join iam.permissions p on p.id=g.permission_id
      where g.school_id=v_school and g.role_id=p_role),'[]'::jsonb));
end
$schoolsafe$;

revoke all on function api.access_role_read(uuid) from public;
grant execute on function api.access_role_read(uuid) to schoolsafe_api;
revoke all on function api.access_profiles_list(text, integer, integer) from public;
revoke all on function api.access_roles_list(text, integer, integer) from public;
revoke all on function api.access_profile_read(uuid) from public;
grant execute on function api.access_profiles_list(text, integer, integer) to schoolsafe_api;
grant execute on function api.access_roles_list(text, integer, integer) to schoolsafe_api;
grant execute on function api.access_profile_read(uuid) to schoolsafe_api;

commit;
