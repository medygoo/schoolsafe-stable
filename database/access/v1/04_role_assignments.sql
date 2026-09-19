\set ON_ERROR_STOP on
-- Additive, replayable A3. No accounts, roles or permissions removed.
begin;
set local role schoolsafe_owner;

alter table app.schools add column if not exists access_revision bigint not null default 0;

-- All IAM writers serialize on the school, including the provisioning bridge.
create or replace function iam.bump_access_revision()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog
as $schoolsafe$
declare v_school uuid := case when tg_op = 'DELETE' then old.school_id else new.school_id end;
begin
  if tg_op = 'UPDATE' and old.school_id is distinct from new.school_id then
    raise insufficient_privilege using message = 'Access school cannot be changed';
  end if;
  update app.schools set access_revision = access_revision + 1
    where id = v_school and id = iam.current_school_id();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$schoolsafe$;
do $schoolsafe$
declare t text;
begin
  foreach t in array array['roles','profile_roles','role_permission_grants','permission_conditions',
    'profile_permission_exceptions','grant_scopes','exception_scopes'] loop
    execute format('drop trigger if exists access_revision on iam.%I', t);
    execute format('create trigger access_revision before insert or update or delete on iam.%I for each row execute function iam.bump_access_revision()', t);
  end loop;
end
$schoolsafe$;

-- Conservative delegation envelope. This does NOT decide business access: the
-- canonical can_access still evaluates every actual action and target.
create or replace function iam.delegation_scopes(p_profile uuid, p_permission uuid)
returns text[] language sql stable security definer set search_path = pg_catalog
as $schoolsafe$
  select coalesce(array_agg(distinct s.scope_code), array[]::text[])
  from iam.profiles p join iam.users u on u.id=p.user_id and u.is_active
  join iam.profile_roles pr on pr.profile_id=p.id and pr.school_id=p.school_id
  join iam.roles r on r.id=pr.role_id and r.school_id=p.school_id
  join iam.role_permission_grants g on g.role_id=r.id and g.school_id=p.school_id
  join iam.permissions perm on perm.id=g.permission_id
  join iam.grant_scopes s on s.grant_id=g.id and s.school_id=p.school_id
  where p.school_id=iam.current_school_id() and p.id=p_profile and p.is_active and p.account_status='active'
    and pr.is_active and pr.starts_at<=now() and pr.ends_at is null and r.is_active
    and g.permission_id=p_permission and g.effect='allow' and g.is_active and g.starts_at<=now() and g.ends_at is null
    and perm.is_active and perm.code <> 'cards.print.manage'
    and s.is_active and s.starts_at<=now() and s.ends_at is null
    and (s.scope_code in ('school','none') or (s.scope_code='own' and perm.default_scope_code='own'))
    and not exists(select 1 from iam.permission_conditions c where c.school_id=p.school_id and c.grant_id=g.id and c.is_active)
    and not exists(
      select 1 from iam.profile_permission_exceptions e
      where e.school_id=p.school_id and e.profile_id=p.id and e.permission_id=p_permission
        and e.effect='deny' and e.is_active and (e.expires_at is null or e.expires_at>now())
    )
    and not exists(
      select 1 from iam.profile_roles dp join iam.roles dr on dr.id=dp.role_id and dr.school_id=dp.school_id
      join iam.role_permission_grants dg on dg.role_id=dr.id and dg.school_id=dr.school_id
      where dp.school_id=p.school_id and dp.profile_id=p.id and dp.is_active and dr.is_active
        and (dp.ends_at is null or dp.ends_at>now()) and dg.permission_id=p_permission
        and dg.effect='deny' and dg.is_active and (dg.ends_at is null or dg.ends_at>now())
    );
$schoolsafe$;

create or replace function iam.role_is_delegatable(p_role uuid)
returns boolean language plpgsql stable security definer set search_path = pg_catalog
as $schoolsafe$
declare g record; v_scopes text[];
begin
  if not iam.context_is_valid() or not exists(select 1 from iam.roles r
    where r.id=p_role and r.school_id=iam.current_school_id() and r.is_active) then return false; end if;
  for g in select rg.id,rg.permission_id,p.code from iam.role_permission_grants rg
    join iam.permissions p on p.id=rg.permission_id
    where rg.role_id=p_role and rg.school_id=iam.current_school_id()
      and rg.is_active and (rg.ends_at is null or rg.ends_at>now()) loop
    if g.code='cards.print.manage' then return false; end if;
    v_scopes := iam.delegation_scopes(iam.current_profile_id(),g.permission_id);
    if cardinality(v_scopes)=0 then return false; end if;
    if not ('school'=any(v_scopes) or 'none'=any(v_scopes)) and exists(
      select 1 from iam.grant_scopes s where s.grant_id=g.id and s.school_id=iam.current_school_id()
        and s.is_active and (s.ends_at is null or s.ends_at>now()) and not s.scope_code=any(v_scopes)
    ) then return false; end if;
  end loop;
  return true;
end
$schoolsafe$;

create or replace function api.access_role_assign(
  p_profile uuid, p_role uuid, p_action text, p_revision bigint, p_reason text, p_confirmed boolean)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $schoolsafe$
declare v_school uuid:=iam.current_school_id(); v_revision bigint; v_changed integer;
  v_before jsonb; v_after jsonb; v_manage uuid;
begin
  perform iam.require_access('roles.manage');
  select access_revision into v_revision from app.schools where id=iam.current_school_id() for update;
  -- Fresh snapshot after waiting for another IAM transaction.
  perform iam.require_access('roles.manage');
  if p_confirmed is distinct from true or p_action is null or p_action not in ('assign','revoke')
    or p_revision is null or p_revision<0 or p_reason is null or length(btrim(p_reason)) not between 5 and 500 then
    raise invalid_parameter_value using message='Invalid role change';
  end if;
  if not exists(select 1 from iam.profiles where id=p_profile and school_id=v_school)
    or not exists(select 1 from iam.roles where id=p_role and school_id=v_school) then
    raise no_data_found using message='Access target not found';
  end if;
  if v_revision<>p_revision then raise exception 'ACCESS_VERSION_CONFLICT' using errcode='40001'; end if;
  if not iam.role_is_delegatable(p_role) then
    raise insufficient_privilege using message='Role exceeds delegation authority';
  end if;
  select to_jsonb(pr) into v_before from iam.profile_roles pr
    where school_id=v_school and profile_id=p_profile and role_id=p_role;
  if p_action='assign' then
    insert into iam.profile_roles(school_id,profile_id,role_id,assigned_by,is_active,starts_at,ends_at)
      values(v_school,p_profile,p_role,iam.current_profile_id(),true,now(),null)
    on conflict(profile_id,role_id) do update set is_active=true,starts_at=excluded.starts_at,ends_at=null,assigned_by=excluded.assigned_by
      where not iam.profile_roles.is_active or iam.profile_roles.starts_at>now() or iam.profile_roles.ends_at is not null;
  else
    update iam.profile_roles set is_active=false
      where school_id=v_school and profile_id=p_profile and role_id=p_role and is_active;
  end if;
  get diagnostics v_changed=row_count;
  if v_changed>0 then
    select id into v_manage from iam.permissions where code='roles.manage';
    if not exists(select 1 from iam.profiles p where p.school_id=v_school
      and 'school'=any(iam.delegation_scopes(p.id,v_manage))) then
      raise exception 'LAST_ACCESS_ADMIN' using errcode='P0001';
    end if;
    select to_jsonb(pr) into v_after from iam.profile_roles pr
      where school_id=v_school and profile_id=p_profile and role_id=p_role;
    perform audit.write_event('access.role.'||p_action,'iam.profiles',p_profile,
      jsonb_build_object('role_id',p_role,'reason',btrim(p_reason),'before',v_before,'after',v_after));
  end if;
  select access_revision into v_revision from app.schools where id=iam.current_school_id();
  return jsonb_build_object('schoolId',v_school,'profileId',p_profile,'roleId',p_role,
    'revision',v_revision::text,'changed',v_changed>0);
end
$schoolsafe$;

revoke all on function iam.bump_access_revision() from public;
revoke all on function iam.delegation_scopes(uuid,uuid) from public;
revoke all on function iam.role_is_delegatable(uuid) from public;
revoke all on function api.access_role_assign(uuid,uuid,text,bigint,text,boolean) from public;
grant execute on function api.access_role_assign(uuid,uuid,text,bigint,text,boolean) to schoolsafe_api;
-- Runtime provisioning must not reset restrictions or restore an admin template.
revoke execute on function api.school_provision_roles(uuid) from schoolsafe_api;

commit;
