\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;

-- Reuse the A3 envelope for inactive custom roles without temporarily granting
-- their rights to the caller. The A3 assignment wrapper still requires active.
create or replace function iam.role_grants_delegatable(p_role uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $schoolsafe$
declare g record; v_scopes text[];
begin
  if not iam.context_is_valid() or not exists(select 1 from iam.roles r
    where r.id=p_role and r.school_id=iam.current_school_id()) then return false; end if;
  for g in select rg.id,rg.permission_id,p.code from iam.role_permission_grants rg
    join iam.permissions p on p.id=rg.permission_id
    where rg.role_id=p_role and rg.school_id=iam.current_school_id()
      and (rg.is_active or p.code='cards.print.manage') loop
    if g.code='cards.print.manage' then return false; end if;
    v_scopes := iam.delegation_scopes(iam.current_profile_id(),g.permission_id);
    if cardinality(v_scopes)=0 then return false; end if;
    if not ('school'=any(v_scopes) or 'none'=any(v_scopes)) and exists(
      select 1 from iam.grant_scopes s where s.grant_id=g.id and s.school_id=iam.current_school_id()
        and s.is_active and not s.scope_code=any(v_scopes)
    ) then return false; end if;
  end loop;
  return true;
end
$schoolsafe$;

create or replace function iam.role_is_delegatable(p_role uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $schoolsafe$
  select exists(select 1 from iam.roles where id=p_role and school_id=iam.current_school_id() and is_active)
    and iam.role_grants_delegatable(p_role);
$schoolsafe$;

create or replace function iam.simple_delegation_scopes(p_permission uuid)
returns text[] language sql stable security definer set search_path=pg_catalog
as $schoolsafe$
  select coalesce(array_agg(distinct s),array[]::text[]) from iam.permissions p,
    unnest(iam.delegation_scopes(iam.current_profile_id(),p.id)) actor_scope,
    unnest(array['school','own','own_children','none']) s
  where p.id=p_permission and (
    (s='school' and actor_scope='school') or
    (s=p.default_scope_code and s in ('own','none') and actor_scope in ('school','none',s)) or
    (s='own_children' and actor_scope='school' and exists(select 1 from iam.role_template_grants tg
      where tg.permission_id=p.id and tg.default_scope_code='own_children'))
  );
$schoolsafe$;

create or replace function iam.begin_access_change(p_revision bigint,p_reason text,p_confirmed boolean)
returns void language plpgsql volatile security definer set search_path=pg_catalog
as $schoolsafe$
declare v_revision bigint;
begin
  perform iam.require_access('roles.manage');
  select access_revision into v_revision from app.schools where id=iam.current_school_id() for update;
  perform iam.require_access('roles.manage');
  if p_revision is null or p_revision<0 or p_confirmed is distinct from true
    or p_reason is null or length(btrim(p_reason)) not between 5 and 500 then
    raise invalid_parameter_value using message='Invalid access change';
  end if;
  if v_revision<>p_revision then raise exception 'ACCESS_VERSION_CONFLICT' using errcode='40001'; end if;
end
$schoolsafe$;

create or replace function iam.require_stable_access_admin()
returns void language plpgsql stable security definer set search_path=pg_catalog
as $schoolsafe$
declare v_manage uuid;
begin
  select id into v_manage from iam.permissions where code='roles.manage';
  if not exists(select 1 from iam.profiles p where p.school_id=iam.current_school_id()
    and 'school'=any(iam.delegation_scopes(p.id,v_manage))) then
    raise exception 'LAST_ACCESS_ADMIN' using errcode='P0001';
  end if;
end
$schoolsafe$;

create or replace function api.access_role_editor(p_role uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $schoolsafe$
declare v_detail jsonb; v_school uuid:=iam.current_school_id();
begin
  perform iam.require_access('roles.manage');
  if p_role is not null then
    select jsonb_build_object('role',jsonb_build_object('id',r.id,'code',r.code,'label',r.label,'is_active',r.is_active),
      'editable',not r.is_system_template and not exists(select 1 from iam.role_templates t where t.code=r.code)
        and iam.role_grants_delegatable(r.id),
      'memberCount',(select count(*) from iam.profile_roles pr where pr.school_id=v_school and pr.role_id=r.id and pr.is_active),
      'affectsCurrentProfile',exists(select 1 from iam.profile_roles pr where pr.school_id=v_school and pr.role_id=r.id and pr.profile_id=iam.current_profile_id() and pr.is_active),
      'members',coalesce((select jsonb_agg(to_jsonb(m) order by m.display_name,m.id) from (
        select p.id,p.display_name from iam.profile_roles pr join iam.profiles p on p.id=pr.profile_id and p.school_id=pr.school_id
        where pr.school_id=v_school and pr.role_id=r.id and pr.is_active order by p.display_name,p.id limit 100) m),'[]'::jsonb),
      'grants',coalesce((select jsonb_agg(jsonb_build_object('permission',p.code,'effect',g.effect,'is_active',g.is_active,
        'starts_at',g.starts_at,'ends_at',g.ends_at,
        'scopes',coalesce((select jsonb_agg(jsonb_build_object('type',s.scope_code,'target',s.target_id))
          from iam.grant_scopes s where s.school_id=v_school and s.grant_id=g.id and s.is_active),'[]'::jsonb),
        'conditions',coalesce((select jsonb_agg(c.condition_code) from iam.permission_conditions c
          where c.school_id=v_school and c.grant_id=g.id and c.is_active),'[]'::jsonb)) order by p.code)
        from iam.role_permission_grants g join iam.permissions p on p.id=g.permission_id
        where g.school_id=v_school and g.role_id=r.id),'[]'::jsonb)) into v_detail
    from iam.roles r where r.id=p_role and r.school_id=v_school;
    if v_detail is null then return null; end if;
  end if;
  return jsonb_build_object('schoolId',v_school,'revision',(select access_revision::text from app.schools where id=iam.current_school_id()),
    'detail',v_detail,
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('code',p.code,'label',p.label,'scopes',iam.simple_delegation_scopes(p.id)) order by p.code)
      from iam.permissions p where p.is_active and cardinality(iam.simple_delegation_scopes(p.id))>0),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'label',t.label) order by t.label)
      from iam.role_templates t where t.is_active),'[]'::jsonb));
end
$schoolsafe$;

create or replace function api.access_role_create(p_label text,p_template uuid,p_revision bigint,p_reason text,p_confirmed boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $schoolsafe$
declare v_role uuid:=gen_random_uuid(); v_grant uuid; t record; v_school uuid:=iam.current_school_id();
begin
  perform iam.begin_access_change(p_revision,p_reason,p_confirmed);
  if p_label is null or length(btrim(p_label)) not between 2 and 100 or p_label ~ '[[:cntrl:]]' then
    raise invalid_parameter_value using message='Invalid role label'; end if;
  if p_template is not null and not exists(select 1 from iam.role_templates where id=p_template and is_active) then
    raise no_data_found using message='Template not found'; end if;
  insert into iam.roles(id,school_id,code,label,created_by) values(v_role,v_school,'custom_'||replace(v_role::text,'-',''),btrim(p_label),iam.current_profile_id());
  for t in select tg.*,p.code from iam.role_template_grants tg join iam.permissions p on p.id=tg.permission_id
    where tg.template_id=p_template loop
    insert into iam.role_permission_grants(school_id,role_id,permission_id,effect,reason,granted_by)
      values(v_school,v_role,t.permission_id,t.effect,btrim(p_reason),iam.current_profile_id()) returning id into v_grant;
    insert into iam.grant_scopes(school_id,grant_id,scope_code,assigned_by)
      values(v_school,v_grant,t.default_scope_code,iam.current_profile_id());
    if t.default_scope_code='assigned_classes' and t.code like 'pedagogy.%' then
      insert into iam.grant_scopes(school_id,grant_id,scope_code,assigned_by) values(v_school,v_grant,'assigned_subjects',iam.current_profile_id());
    end if;
    if t.condition_code is not null then
      insert into iam.permission_conditions(school_id,grant_id,condition_code,condition_params,created_by)
        values(v_school,v_grant,t.condition_code,t.condition_params,iam.current_profile_id());
    end if;
  end loop;
  if not iam.role_grants_delegatable(v_role) then raise insufficient_privilege using message='Template exceeds delegation authority'; end if;
  perform audit.write_event('access.role.created','iam.roles',v_role,jsonb_build_object('reason',btrim(p_reason),'template_id',p_template,'label',btrim(p_label)));
  return jsonb_build_object('schoolId',v_school,'roleId',v_role,'revision',(select access_revision::text from app.schools where id=iam.current_school_id()));
end
$schoolsafe$;

create or replace function api.access_role_save(p_role uuid,p_label text,p_active boolean,p_grants jsonb,p_revision bigint,p_reason text,p_confirmed boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $schoolsafe$
declare v_school uuid:=iam.current_school_id(); v_before jsonb; v_after jsonb; item jsonb; v_permission uuid; v_grant uuid; v_existing boolean;
begin
  perform iam.begin_access_change(p_revision,p_reason,p_confirmed);
  if not exists(select 1 from iam.roles where id=p_role and school_id=v_school) then raise no_data_found using message='Role not found'; end if;
  if exists(select 1 from iam.roles r where r.id=p_role and r.school_id=v_school
    and (r.is_system_template or exists(select 1 from iam.role_templates t where t.code=r.code)))
    or not iam.role_grants_delegatable(p_role) then raise insufficient_privilege using message='Role cannot be edited'; end if;
  if p_label is null or length(btrim(p_label)) not between 2 and 100 or p_label ~ '[[:cntrl:]]' or p_active is null
    or p_grants is null or jsonb_typeof(p_grants)<>'array' then raise invalid_parameter_value using message='Invalid role composition'; end if;
  if jsonb_array_length(p_grants)>64 or (select count(*)<>count(distinct e->>'permission') from jsonb_array_elements(p_grants) e) then
    raise invalid_parameter_value using message='Invalid or duplicate grants'; end if;
  -- Validate the entire request against the pre-change authority. Never let an
  -- edit of the caller's own role grant authority for later items in the same request.
  for item in select jsonb_array_elements(p_grants) loop
    if jsonb_typeof(item)<>'object' or item->>'permission' is null or item->>'effect' is null
      or item->>'effect' not in ('allow','deny') or (item - array['permission','effect','scope'])<>'{}'::jsonb then
      raise invalid_parameter_value using message='Invalid grant'; end if;
    select id into v_permission from iam.permissions where code=item->>'permission' and is_active and code<>'cards.print.manage';
    if v_permission is null then raise insufficient_privilege using message='Permission not delegatable'; end if;
    select id into v_grant from iam.role_permission_grants where school_id=v_school and role_id=p_role and permission_id=v_permission;
    v_existing := v_grant is not null;
    if cardinality(iam.delegation_scopes(iam.current_profile_id(),v_permission))=0 then
      raise insufficient_privilege using message='Permission exceeds delegation authority'; end if;
    if v_existing and item ? 'scope' then raise invalid_parameter_value using message='Existing grant scopes are preserved'; end if;
    if not v_existing and (item->>'scope' is null or not (item->>'scope'=any(iam.simple_delegation_scopes(v_permission)))) then
      raise insufficient_privilege using message='Scope exceeds delegation authority'; end if;
    -- Inactive historical grants cannot be reactivated with wider scopes than the actor.
    if v_existing and not ('school'=any(iam.delegation_scopes(iam.current_profile_id(),v_permission)) or 'none'=any(iam.delegation_scopes(iam.current_profile_id(),v_permission)))
      and exists(select 1 from iam.grant_scopes s where s.school_id=v_school and s.grant_id=v_grant and s.is_active
        and not s.scope_code=any(iam.delegation_scopes(iam.current_profile_id(),v_permission))) then
      raise insufficient_privilege using message='Stored scopes exceed delegation authority'; end if;
  end loop;
  v_before := (api.access_role_editor(p_role)->'detail') - array['members','editable'];
  update iam.roles set label=btrim(p_label),is_active=p_active where id=p_role and school_id=v_school;
  update iam.role_permission_grants g set is_active=false where g.school_id=v_school and g.role_id=p_role and g.is_active
    and not exists(select 1 from jsonb_array_elements(p_grants) e join iam.permissions p on p.code=e->>'permission' where p.id=g.permission_id);
  for item in select jsonb_array_elements(p_grants) loop
    select id into v_permission from iam.permissions where code=item->>'permission';
    select id into v_grant from iam.role_permission_grants where school_id=v_school and role_id=p_role and permission_id=v_permission;
    if v_grant is null then
      insert into iam.role_permission_grants(school_id,role_id,permission_id,effect,reason,granted_by)
        values(v_school,p_role,v_permission,item->>'effect',btrim(p_reason),iam.current_profile_id()) returning id into v_grant;
      insert into iam.grant_scopes(school_id,grant_id,scope_code,assigned_by) values(v_school,v_grant,item->>'scope',iam.current_profile_id());
    else
      update iam.role_permission_grants set effect=item->>'effect',is_active=true,reason=btrim(p_reason),granted_by=iam.current_profile_id()
        where id=v_grant and school_id=v_school;
    end if;
  end loop;
  perform iam.require_stable_access_admin();
  -- Do not call a roles.manage-gated projection after a valid self-revocation.
  v_after := jsonb_build_object('label',btrim(p_label),'is_active',p_active,'grants',p_grants);
  perform audit.write_event('access.role.composed','iam.roles',p_role,jsonb_build_object('reason',btrim(p_reason),'before',v_before,'after',v_after));
  return jsonb_build_object('schoolId',v_school,'roleId',p_role,'revision',(select access_revision::text from app.schools where id=iam.current_school_id()));
end
$schoolsafe$;

revoke all on function iam.role_grants_delegatable(uuid),iam.simple_delegation_scopes(uuid),iam.begin_access_change(bigint,text,boolean),iam.require_stable_access_admin() from public;
revoke all on function api.access_role_editor(uuid),api.access_role_create(text,uuid,bigint,text,boolean),api.access_role_save(uuid,text,boolean,jsonb,bigint,text,boolean) from public;
grant execute on function api.access_role_editor(uuid),api.access_role_create(text,uuid,bigint,text,boolean),api.access_role_save(uuid,text,boolean,jsonb,bigint,text,boolean) to schoolsafe_api;
commit;
