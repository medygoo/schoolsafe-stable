\set ON_ERROR_STOP on

-- Authoritative school replay and offline, atomic school bootstrap.
begin;
set local role schoolsafe_owner;

create or replace function iam.provision_school_roles(
  p_school_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_template record;
  v_grant record;
  v_role_id uuid;
  v_grant_id uuid;
  v_roles integer := 0;
  v_grants integer := 0;
  v_deleted integer := 0;
  v_deleted_total integer := 0;
begin
  if p_school_id is distinct from iam.current_school_id() or not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Verified school context required';
  end if;
  -- Serialize school replays, including the first creation of each role.
  perform 1 from app.schools where id=p_school_id for update;
  for v_template in
    select t.id, t.code, t.label
    from iam.role_templates t
    where t.is_active = true
    order by t.code
  loop
    select r.id into v_role_id
    from iam.roles r
    where r.school_id = p_school_id and r.code = v_template.code;

    if v_role_id is null then
      v_role_id := pg_catalog.gen_random_uuid();
      insert into iam.roles (id, school_id, code, label, created_by)
      values (v_role_id, p_school_id, v_template.code, v_template.label, p_actor_profile_id);
      v_roles := v_roles + 1;
    end if;

    for v_grant in
      select g.effect, g.permission_id, g.default_scope_code, g.condition_code, g.condition_params
      from iam.role_template_grants g
      where g.template_id = v_template.id
    loop
      select g2.id into v_grant_id
      from iam.role_permission_grants g2
      where g2.school_id = p_school_id
        and g2.role_id = v_role_id
        and g2.permission_id = v_grant.permission_id;

      if v_grant_id is null then
        v_grant_id := pg_catalog.gen_random_uuid();
        insert into iam.role_permission_grants (
          id, school_id, role_id, permission_id, effect, reason, granted_by
        ) values (
          v_grant_id, p_school_id, v_role_id, v_grant.permission_id, v_grant.effect,
          'Provisionné depuis le modèle ' || v_template.code, p_actor_profile_id
        );
        v_grants := v_grants + 1;
      else
        update iam.role_permission_grants
        set effect = v_grant.effect,
            starts_at = least(starts_at, pg_catalog.now()), ends_at = null,
            is_active = true,
            reason = 'Provisionné depuis le modèle ' || v_template.code,
            updated_at = pg_catalog.now()
        where id = v_grant_id;
      end if;

      -- Portées et conditions : remplacement intégral par la matrice.
      delete from iam.grant_scopes where grant_id = v_grant_id;
      insert into iam.grant_scopes (school_id, grant_id, scope_code, target_id, assigned_by)
      values (p_school_id, v_grant_id, v_grant.default_scope_code, null, p_actor_profile_id);

      -- Règle Enseignant (jamais affaiblie) : une permission pédagogique à
      -- portée assigned_classes exige AUSSI assigned_subjects — la paire
      -- exacte classe+matière, comme le montre iam.grant_scopes_match.
      if v_grant.default_scope_code = 'assigned_classes'
         and (select p.code from iam.permissions p where p.id = v_grant.permission_id) like 'pedagogy.%' then
        insert into iam.grant_scopes (school_id, grant_id, scope_code, target_id, assigned_by)
        values (p_school_id, v_grant_id, 'assigned_subjects', null, p_actor_profile_id);
      end if;

      delete from iam.permission_conditions where grant_id = v_grant_id;
      if v_grant.condition_code is not null then
        insert into iam.permission_conditions (
          school_id, grant_id, condition_code, condition_params, created_by
        ) values (
          p_school_id, v_grant_id, v_grant.condition_code, v_grant.condition_params, p_actor_profile_id
        );
      end if;
    end loop;

    -- Suppression stricte des grants devenus absents de la matrice.
    delete from iam.role_permission_grants g
    where g.school_id = p_school_id
      and g.role_id = v_role_id
      and not exists (
        select 1
        from iam.role_template_grants tg
        where tg.template_id = v_template.id
          and tg.permission_id = g.permission_id
      );
    get diagnostics v_deleted = row_count;
    v_deleted_total := v_deleted_total + v_deleted;
  end loop;

  delete from iam.role_permission_grants g
  using iam.roles r, iam.role_templates t
  where g.role_id=r.id and r.school_id=p_school_id and t.code=r.code and not t.is_active;
  get diagnostics v_deleted = row_count;
  v_deleted_total := v_deleted_total + v_deleted;

  return jsonb_build_object(
    'school_id', p_school_id,
    'roles_created', v_roles,
    'grants_created', v_grants,
    'grants_deleted', v_deleted_total
  );
end
$schoolsafe$;

-- ─── Chemin normal : école existante, permission roles.manage ───
create or replace function api.school_provision_roles(p_school_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_result jsonb;
begin
  perform iam.require_access('roles.manage');

  if p_school_id is null or p_school_id <> v_school_id then
    raise foreign_key_violation using message = 'School does not match the active context';
  end if;

  if not exists (select 1 from app.schools s where s.id = v_school_id) then
    raise foreign_key_violation using message = 'Unknown school';
  end if;

  v_result := iam.provision_school_roles(v_school_id, v_profile_id);

  perform audit.write_event(
    'school.roles.provisioned',
    'school',
    v_school_id,
    jsonb_build_object('actor_profile_id', v_profile_id, 'result', v_result)
  );

  return v_result;
end
$schoolsafe$;

-- No runtime-facing bootstrap API. Remove the unfinished earlier bridge on replay.
drop function if exists api.school_bootstrap_register(text, text);
drop function if exists api.school_bootstrap_finalize(uuid, text, text);
drop policy if exists schools_bootstrap_insert on app.schools;
drop policy if exists schools_bootstrap_select on app.schools;
drop policy if exists users_bootstrap_insert on iam.users;
drop policy if exists profiles_bootstrap_insert on iam.profiles;

-- Only the offline migration login can cross the empty-school boundary.
create policy schools_bootstrap_insert on app.schools for insert to schoolsafe_owner
with check (session_user = 'schoolsafe_migrator' and id = iam.current_school_id()
            and not is_active and setup_completed_at is null);

create or replace function ops.bootstrap_school(
  p_code text, p_name text, p_admin_email text, p_admin_display_name text,
  p_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school uuid := pg_catalog.gen_random_uuid();
  v_user uuid := pg_catalog.gen_random_uuid();
  v_profile uuid := pg_catalog.gen_random_uuid();
  v_role uuid;
  v_result jsonb;
  v_old_school text := pg_catalog.current_setting('schoolsafe.school_id',true);
  v_old_user text := pg_catalog.current_setting('schoolsafe.user_id',true);
  v_old_profile text := pg_catalog.current_setting('schoolsafe.profile_id',true);
  v_old_request text := pg_catalog.current_setting('schoolsafe.request_id',true);
begin
  if session_user <> 'schoolsafe_migrator' then
    raise insufficient_privilege using message='Offline migration login required';
  end if;
  if p_request_id is null or p_code is null or p_code !~ '^[A-Z0-9-]{2,32}$'
     or nullif(pg_catalog.btrim(p_name),'') is null
     or nullif(pg_catalog.btrim(p_admin_display_name),'') is null
     or p_admin_email is null or p_admin_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise check_violation using message='Complete bootstrap identity and request required';
  end if;
  perform pg_catalog.set_config('schoolsafe.school_id',v_school::text,true);
  insert into app.schools(id,code,name,is_active) values(v_school,p_code,p_name,false);
  -- Create the audit identity before provisioning; no role/access exists yet.
  insert into iam.users(id,auth_provider,external_subject,email)
  values(v_user,'local',p_admin_email,p_admin_email);
  insert into iam.profiles(id,user_id,school_id,display_name)
  values(v_profile,v_user,v_school,p_admin_display_name);
  perform api.set_request_context(v_user,v_profile,v_school,p_request_id);
  perform audit.write_event('school.bootstrap.started','school',v_school,
    jsonb_build_object('operator',session_user,'admin_profile_id',v_profile));
  v_result := iam.provision_school_roles(v_school,v_profile);
  select id into v_role from iam.roles where school_id=v_school and code='admin' and is_active;
  if v_role is null then raise check_violation using message='Active admin template required'; end if;
  insert into iam.profile_roles(school_id,profile_id,role_id) values(v_school,v_profile,v_role);
  perform iam.require_access('roles.manage');
  update app.schools set is_active=true,setup_completed_at=pg_catalog.now() where id=v_school;
  perform audit.write_event('school.bootstrap.completed','school',v_school,
    jsonb_build_object('operator',session_user,'admin_profile_id',v_profile,'provision',v_result));
  perform pg_catalog.set_config('schoolsafe.school_id',coalesce(v_old_school,''),true);
  perform pg_catalog.set_config('schoolsafe.user_id',coalesce(v_old_user,''),true);
  perform pg_catalog.set_config('schoolsafe.profile_id',coalesce(v_old_profile,''),true);
  perform pg_catalog.set_config('schoolsafe.request_id',coalesce(v_old_request,''),true);
  return jsonb_build_object('school_id',v_school,'user_id',v_user,'admin_profile_id',v_profile);
end
$schoolsafe$;
revoke all on function iam.provision_school_roles(uuid,uuid) from public, schoolsafe_api, schoolsafe_worker;
revoke all on function ops.bootstrap_school(text,text,text,text,uuid) from public, schoolsafe_api, schoolsafe_worker;
grant execute on function ops.bootstrap_school(text,text,text,text,uuid) to schoolsafe_migrator;
grant execute on function api.school_provision_roles(uuid) to schoolsafe_api;
commit;
