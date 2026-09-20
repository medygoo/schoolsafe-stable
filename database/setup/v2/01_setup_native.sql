\set ON_ERROR_STOP on
-- One-use provisioning capability, issued offline by the migration login.
-- School + admin + canonical school-scoped roles commit atomically.
begin;
set local role schoolsafe_owner;
create table if not exists auth.setup_authorizations (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  school_id uuid not null unique default gen_random_uuid(),
  academic_year_id uuid not null unique default gen_random_uuid(),
  payload jsonb,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table auth.setup_authorizations enable row level security;
alter table auth.setup_authorizations force row level security;
drop policy if exists setup_authorizations_owner on auth.setup_authorizations;
create policy setup_authorizations_owner on auth.setup_authorizations to schoolsafe_owner using(true) with check(true);
revoke all on auth.setup_authorizations from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;

create or replace function ops.authorize_school_setup(p_token_hash text,p_ttl_seconds integer default 3600)
returns void language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
begin
  if session_user<>'schoolsafe_migrator' then
    raise insufficient_privilege using message='Offline migration login required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_ttl_seconds is null or p_ttl_seconds not between 60 and 86400 then
    raise check_violation using message='Valid setup token hash and bounded expiry required';
  end if;
  insert into auth.setup_authorizations(token_hash,expires_at)
    values(p_token_hash,clock_timestamp()+make_interval(secs=>p_ttl_seconds));
end
$schoolsafe$;
revoke all on function ops.authorize_school_setup(text,integer) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;
grant execute on function ops.authorize_school_setup(text,integer) to schoolsafe_migrator;

create or replace function auth.setup_context_allows(p_school_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $schoolsafe$
  select session_user='schoolsafe_auth' and exists(
    select 1 from auth.setup_authorizations a
    where a.school_id=p_school_id and a.school_id=iam.current_school_id()
      and a.token_hash=current_setting('schoolsafe.setup_token_hash',true)
      and a.payload is not null and a.consumed_at is null and a.expires_at>clock_timestamp()
  )
$schoolsafe$;
revoke all on function auth.setup_context_allows(uuid) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;
drop policy if exists schools_setup_capability_insert on app.schools;
create policy schools_setup_capability_insert on app.schools for insert to schoolsafe_owner
  with check(not is_active and setup_completed_at is null and auth.setup_context_allows(id));

create or replace function api.setup_stage_school(p_token_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare v_auth auth.setup_authorizations%rowtype;
begin
  if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
  select * into v_auth from auth.setup_authorizations
    where token_hash=p_token_hash and consumed_at is null and expires_at>clock_timestamp() for update;
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
  v_auth auth.setup_authorizations%rowtype;
  v_user uuid:=gen_random_uuid(); v_profile uuid:=gen_random_uuid(); v_identity uuid:=gen_random_uuid();
  v_role uuid; v_cycle text; v_payload jsonb; v_key text; v_old jsonb:='{}'::jsonb;
begin
  if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
  select * into v_auth from auth.setup_authorizations
    where token_hash=p_token_hash and consumed_at is null and expires_at>clock_timestamp() for update;
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
