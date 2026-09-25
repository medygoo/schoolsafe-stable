\set ON_ERROR_STOP on
-- Additive binding of the existing setup RPCs to the authorization resolver.
-- Preserve their locks, tenant context, atomic creation and consumption rules.
begin;
set local role schoolsafe_owner;

create or replace function api.setup_stage_school(p_token_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare v_auth auth.setup_authorizations%rowtype; v_school_id uuid;
begin
  if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
  v_school_id := ops.resolve_school_setup_authorization(p_token_hash);
  if v_school_id is null then
    raise insufficient_privilege using message='Setup capability unavailable';
  end if;
  select * into v_auth from auth.setup_authorizations
    where token_hash=p_token_hash and school_id=v_school_id and consumed_at is null and expires_at>clock_timestamp() for update;
  if not found then raise insufficient_privilege using message='Setup capability unavailable'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or nullif(btrim(p_payload#>>'{identity,name_fr}'),'') is null
     or nullif(btrim(p_payload#>>'{academic_year,label}'),'') is null
     or (p_payload#>>'{academic_year,starts_on}')::date is null
     or (p_payload#>>'{academic_year,ends_on}')::date is null
     or (p_payload#>>'{academic_year,ends_on}')::date < (p_payload#>>'{academic_year,starts_on}')::date
     or jsonb_typeof(p_payload->'cycles') is distinct from 'array'
     or jsonb_array_length(p_payload->'cycles')=0 then
    raise check_violation using message='Complete school payload required';
  end if;
  if v_auth.payload is not null and v_auth.payload<>p_payload then
    raise check_violation using message='Setup capability already bound to another payload';
  end if;
  update auth.setup_authorizations set payload=p_payload where token_hash=p_token_hash;
  return jsonb_build_object('school_id',v_auth.school_id,'academic_year_id',v_auth.academic_year_id);
end
$schoolsafe$;

create or replace function api.setup_complete_school(
  p_token_hash text,p_email text,p_password_hash text,p_first_name text,p_last_name text,p_phone text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare
  v_auth auth.setup_authorizations%rowtype; v_school_id uuid;
  v_user uuid:=gen_random_uuid(); v_profile uuid:=gen_random_uuid(); v_identity uuid:=gen_random_uuid();
  v_role uuid; v_cycle text; v_payload jsonb; v_key text; v_old jsonb:='{}'::jsonb;
begin
  if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
  v_school_id := ops.resolve_school_setup_authorization(p_token_hash);
  if v_school_id is null then
    raise insufficient_privilege using message='Setup capability unavailable';
  end if;
  select * into v_auth from auth.setup_authorizations
    where token_hash=p_token_hash and school_id=v_school_id and consumed_at is null and expires_at>clock_timestamp() for update;
  if not found or v_auth.payload is null then
    raise insufficient_privilege using message='Staged setup capability required';
  end if;
  if p_password_hash is null or p_password_hash not like '$argon2id$v=19$%'
     or p_email is null or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     or nullif(btrim(p_first_name),'') is null or nullif(btrim(p_last_name),'') is null then
    raise check_violation using message='Complete administrator identity and Argon2id hash required';
  end if;
  foreach v_key in array array['school_id','user_id','profile_id','request_id','setup_token_hash'] loop
    v_old:=v_old||jsonb_build_object(v_key,coalesce(current_setting('schoolsafe.'||v_key,true),''));
  end loop;
  perform set_config('schoolsafe.school_id',v_auth.school_id::text,true);
  perform set_config('schoolsafe.setup_token_hash',p_token_hash,true);
  v_payload:=v_auth.payload;
  insert into app.schools(id,code,name,name_en,legal_name,school_type,approval_code,
    primary_color,accent_color,document_footer,logo_path,is_active)
  values(v_auth.school_id,'SCH-'||upper(substr(replace(v_auth.school_id::text,'-',''),1,12)),
    v_payload#>>'{identity,name_fr}',v_payload#>>'{identity,name_en}',v_payload#>>'{identity,legal_name}',
    coalesce(v_payload#>>'{identity,school_type}','Privée agréée'),v_payload#>>'{identity,approval_code}',
    coalesce(v_payload#>>'{brand,primary_color}','#071a3d'),coalesce(v_payload#>>'{brand,accent_color}','#e9a515'),
    v_payload#>>'{brand,document_footer}',v_payload#>>'{brand,logo_path}',false);
  insert into iam.users(id,auth_provider,external_subject,email,phone)
    values(v_user,'local',auth.normalize_login(p_email),auth.normalize_login(p_email),
      case when nullif(p_phone,'') is null then null else auth.normalize_login(p_phone) end);
  insert into iam.profiles(id,user_id,school_id,display_name,first_name,last_name,email,phone)
    values(v_profile,v_user,v_auth.school_id,btrim(p_first_name)||' '||btrim(p_last_name),
      btrim(p_first_name),btrim(p_last_name),auth.normalize_login(p_email),p_phone);
  perform api.set_request_context(v_user,v_profile,v_auth.school_id,gen_random_uuid());
  perform iam.provision_school_roles(v_auth.school_id,v_profile);
  select id into v_role from iam.roles
    where school_id=v_auth.school_id and code='admin' and is_active;
  if v_role is null then raise check_violation using message='Canonical school admin role required'; end if;
  insert into iam.profile_roles(school_id,profile_id,role_id) values(v_auth.school_id,v_profile,v_role);
  perform iam.require_access('roles.manage');
  insert into auth.identities(id,user_id,email,phone) values(v_identity,v_user,auth.normalize_login(p_email),
    case when nullif(p_phone,'') is null then null else auth.normalize_login(p_phone) end);
  insert into auth.credentials(identity_id,password_hash) values(v_identity,p_password_hash);
  insert into app.school_settings(school_id) values(v_auth.school_id);
  insert into app.academic_years(id,school_id,label,starts_on,ends_on,periods,is_active)
    values(v_auth.academic_year_id,v_auth.school_id,v_payload#>>'{academic_year,label}',
      (v_payload#>>'{academic_year,starts_on}')::date,(v_payload#>>'{academic_year,ends_on}')::date,
      coalesce(v_payload#>>'{academic_year,periods}','Trimestres'),true);
  for v_cycle in select jsonb_array_elements_text(v_payload->'cycles') loop
    if v_cycle not in ('nursery','primary','secondary') then raise check_violation using message='Unknown cycle'; end if;
    insert into app.school_cycles(school_id,cycle_key,cycle_name) values(v_auth.school_id,v_cycle,
      case v_cycle when 'nursery' then 'Maternelle' when 'primary' then 'Primaire' else 'Secondaire et Humanités' end);
  end loop;
  insert into app.school_contacts(school_id,country,province,city,address,email,phone)
    values(v_auth.school_id,coalesce(v_payload#>>'{contact,country}','République démocratique du Congo'),
      coalesce(v_payload#>>'{contact,province}','Kinshasa'),coalesce(v_payload#>>'{contact,city}','Kinshasa'),
      v_payload#>>'{contact,address}',v_payload#>>'{contact,email}',v_payload#>>'{contact,phone}');
  update app.schools set is_active=true,setup_completed_at=clock_timestamp() where id=v_auth.school_id;
  perform audit.write_event('school.setup.completed','school',v_auth.school_id,
    jsonb_build_object('admin_profile_id',v_profile));
  update auth.setup_authorizations set consumed_at=clock_timestamp() where token_hash=p_token_hash;
  foreach v_key in array array['school_id','user_id','profile_id','request_id','setup_token_hash'] loop
    perform set_config('schoolsafe.'||v_key,v_old->>v_key,true);
  end loop;
  return jsonb_build_object('user_id',v_user,'profile_id',v_profile);
end
$schoolsafe$;
revoke all on function api.setup_stage_school(text,jsonb),api.setup_complete_school(text,text,text,text,text,text)
  from public,schoolsafe_api,schoolsafe_worker;
grant execute on function api.setup_stage_school(text,jsonb),api.setup_complete_school(text,text,text,text,text,text) to schoolsafe_auth;
commit;
