\set ON_ERROR_STOP on
-- Direct account admission. No change to historical migrations or approval records.
begin;
set local role schoolsafe_owner;

create table auth.direct_onboarding_accounts (
 identity_id uuid primary key references auth.identities(id),
 user_id uuid not null unique references iam.users(id),
 first_name text not null default '', last_name text not null default '',
 created_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 activating_school_id uuid, activating_txid bigint
);
alter table auth.direct_onboarding_accounts enable row level security;
alter table auth.direct_onboarding_accounts force row level security;
create policy direct_onboarding_owner on auth.direct_onboarding_accounts to schoolsafe_owner using(true) with check(true);
revoke all on auth.direct_onboarding_accounts from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor;
-- Only previously approved accounts retain onboarding eligibility. Pending/rejected
-- historical identities remain locked and cannot be recreated by the public login.
insert into auth.direct_onboarding_accounts(identity_id,user_id,first_name,last_name)
 select identity_id,user_id,first_name,last_name from auth.account_registration_requests where status='approved';

-- Private transaction-bound admission for the initial inactive school insert.
-- Runtime roles cannot write these columns or call this predicate.
create function auth.direct_activation_allows(p_school_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $fn$
 select session_user='schoolsafe_auth' and exists(
  select 1 from auth.direct_onboarding_accounts
  where activating_school_id=p_school_id and activating_txid=txid_current()
   and completed_at is null)
$fn$;
revoke all on function auth.direct_activation_allows(uuid) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor;
create policy schools_direct_activation_insert on app.schools for insert to schoolsafe_owner
 with check(not is_active and setup_completed_at is null and auth.direct_activation_allows(id));
create policy years_direct_activation_insert on app.academic_years for insert to schoolsafe_owner
 with check(not is_active and auth.direct_activation_allows(school_id));
create policy cycles_direct_activation_insert on app.school_cycles for insert to schoolsafe_owner
 with check(auth.direct_activation_allows(school_id));
create policy contacts_direct_activation_insert on app.school_contacts for insert to schoolsafe_owner
 with check(auth.direct_activation_allows(school_id));

create function api.auth_create_direct_identity(p_login text,p_password_hash text,p_ip inet)
returns table(identity_id uuid,user_id uuid,password_hash text,status text,must_change boolean)
language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 v_login text:=auth.normalize_login(p_login); v_user uuid:=gen_random_uuid(); v_identity uuid:=gen_random_uuid();
 v_email text; v_phone text; v_bucket text; v_old text:=coalesce(current_setting('schoolsafe.preauth',true),'');
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 if v_login is null or length(v_login)>254 or p_ip is null
  or p_password_hash is null or p_password_hash !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$' then return; end if;
 if v_login ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then v_email:=v_login;
 elsif p_login ~ '^[+0-9().[:space:]-]+$' and v_login ~ '^\+243[0-9]{9}$' then v_phone:=v_login;
 else return; end if;
 v_bucket:='direct-account-ip:'||host(p_ip);
 perform pg_advisory_xact_lock(hashtextextended(v_bucket,0));
 perform pg_advisory_xact_lock(hashtextextended('direct-login:'||v_login,0));
 perform set_config('schoolsafe.preauth','on',true);
 if exists(select 1 from auth.identities i where i.email::text=v_login or i.phone=v_login)
  or exists(select 1 from iam.users u where lower(u.email)=v_login or u.phone=v_login)
  or (select count(*) from auth.login_attempts where login=v_bucket and attempted_at>clock_timestamp()-interval '15 minutes')>=5 then
  perform set_config('schoolsafe.preauth',v_old,true); return;
 end if;
 insert into iam.users(id,auth_provider,external_subject,email,phone,is_active) values(v_user,'local',v_login,v_email,v_phone,true);
 insert into auth.identities(id,user_id,email,phone,status) values(v_identity,v_user,v_email::auth.citext,v_phone,'active');
 insert into auth.credentials(identity_id,password_hash) values(v_identity,p_password_hash);
 insert into auth.direct_onboarding_accounts(identity_id,user_id) values(v_identity,v_user);
 insert into auth.login_attempts(login,succeeded) values(v_bucket,true);
 perform set_config('schoolsafe.preauth',v_old,true);
 return query select v_identity,v_user,p_password_hash,'active'::text,false;
end
$fn$;

create or replace function auth.account_onboarding_allowed(p_identity_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ok boolean; v_old text:=coalesce(current_setting('schoolsafe.preauth',true),'');
begin
 perform set_config('schoolsafe.preauth','on',true);
 select exists(select 1 from auth.direct_onboarding_accounts d
  join auth.identities i on i.id=d.identity_id and i.user_id=d.user_id and i.status='active'
  join iam.users u on u.id=d.user_id and u.is_active
  where d.identity_id=p_identity_id and d.completed_at is null
  and not exists(select 1 from iam.profiles p where p.user_id=d.user_id)) into v_ok;
 perform set_config('schoolsafe.preauth',v_old,true);
 return v_ok;
end
$fn$;

create or replace function api.auth_create_onboarding_session(p_identity_id uuid,p_token_hash text,p_ttl_seconds integer,p_ip inet,p_user_agent text)
returns table(session_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_ttl_seconds is null or p_ttl_seconds not between 1 and 3600 then
  raise check_violation using message='Invalid onboarding session'; end if;
 perform 1 from auth.direct_onboarding_accounts where identity_id=p_identity_id for update;
 if not found or not auth.account_onboarding_allowed(p_identity_id) then raise insufficient_privilege using message='Onboarding unavailable'; end if;
 return query insert into auth.onboarding_sessions(identity_id,token_hash,expires_at,ip,user_agent)
  values(p_identity_id,p_token_hash,clock_timestamp()+make_interval(secs=>p_ttl_seconds),p_ip,p_user_agent)
  returning id,auth.onboarding_sessions.expires_at;
end
$fn$;

create or replace function api.auth_resolve_onboarding_session(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 select jsonb_build_object('first_name',d.first_name,'last_name',d.last_name,'email',i.email,'phone',i.phone,'status','onboarding') into v_result
 from auth.onboarding_sessions s join auth.direct_onboarding_accounts d on d.identity_id=s.identity_id
 join auth.identities i on i.id=d.identity_id
 where s.token_hash=p_token_hash and s.revoked_at is null and s.expires_at>clock_timestamp() and auth.account_onboarding_allowed(s.identity_id);
 return v_result;
end
$fn$;

-- Only the Node comparison result is accepted; no code or code digest enters SQL.
-- A separate committed call preserves failures even when activation later rolls back.
create function api.auth_record_activation_attempt(p_onboarding_token_hash text,p_matches boolean)
returns text language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_identity uuid; v_bucket text;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 select d.identity_id into v_identity from auth.direct_onboarding_accounts d
 join auth.onboarding_sessions s on s.identity_id=d.identity_id
 where s.token_hash=p_onboarding_token_hash for update of d;
 if not found or not auth.account_onboarding_allowed(v_identity)
  or not exists(select 1 from auth.onboarding_sessions where token_hash=p_onboarding_token_hash
   and revoked_at is null and expires_at>clock_timestamp()) then raise insufficient_privilege; end if;
 v_bucket:='direct-activation:'||v_identity::text;
 if (select count(*) from auth.login_attempts where login=v_bucket and not succeeded
  and attempted_at>clock_timestamp()-interval '15 minutes')>=5 then return 'limited'; end if;
 if p_matches is not true then
  insert into auth.login_attempts(login,succeeded) values(v_bucket,false);
  return 'denied';
 end if;
 return 'allowed';
end
$fn$;

create function api.auth_activate_school(p_onboarding_token_hash text,p_payload jsonb,p_session_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 r record; s auth.onboarding_sessions%rowtype;
 v_school uuid:=gen_random_uuid(); v_year uuid:=gen_random_uuid(); v_profile uuid:=gen_random_uuid();
 v_role uuid; v_cycle text; v_key text; v_old jsonb:='{}'::jsonb;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 -- Request first: distinct sessions for the same identity must serialize too.
 select r0.*,i.email,i.phone into r from auth.direct_onboarding_accounts r0
 join auth.identities i on i.id=r0.identity_id
 join auth.onboarding_sessions s0 on s0.identity_id=r0.identity_id
 where s0.token_hash=p_onboarding_token_hash for update of r0;
 if not found or not auth.account_onboarding_allowed(r.identity_id) then raise insufficient_privilege using message='Onboarding unavailable'; end if;
 select * into s from auth.onboarding_sessions where token_hash=p_onboarding_token_hash and identity_id=r.identity_id for update;
 if not found or s.revoked_at is not null or s.expires_at<=clock_timestamp() then raise insufficient_privilege using message='Onboarding unavailable'; end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise check_violation; end if;
 if (select count(*) from auth.login_attempts where login='direct-activation:'||r.identity_id::text
  and not succeeded and attempted_at>clock_timestamp()-interval '15 minutes')>=5 then
  raise exception using errcode='P0429',message='Activation rate limited'; end if;
 if jsonb_typeof(p_payload->'admin') is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_payload->'admin') k where k not in ('first_name','last_name'))
  or length(btrim(coalesce(p_payload#>>'{admin,first_name}',''))) not between 1 and 100
  or length(btrim(coalesce(p_payload#>>'{admin,last_name}',''))) not between 1 and 100
  or jsonb_typeof(p_payload#>'{admin,first_name}') is distinct from 'string'
  or jsonb_typeof(p_payload#>'{admin,last_name}') is distinct from 'string' then raise check_violation; end if;
 r.first_name:=btrim(p_payload#>>'{admin,first_name}'); r.last_name:=btrim(p_payload#>>'{admin,last_name}');
 p_payload:=p_payload-'admin';
 if jsonb_typeof(p_payload) is distinct from 'object' then raise check_violation using message='Invalid school payload'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('identity','cycles','academic_year','contact','brand'))
  or exists(select 1 from unnest(array['identity','academic_year','contact','brand']) k where jsonb_typeof(p_payload->k) is distinct from 'object')
  or jsonb_typeof(p_payload->'cycles') is distinct from 'array' then raise check_violation using message='Invalid school payload'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload->'identity') k where k not in ('name_fr','name_en','legal_name','school_type','approval_code'))
  or exists(select 1 from jsonb_object_keys(p_payload->'academic_year') k where k not in ('label','starts_on','ends_on','periods'))
  or exists(select 1 from jsonb_object_keys(p_payload->'brand') k where k not in ('primary_color','accent_color','document_footer'))
  or exists(select 1 from jsonb_object_keys(p_payload->'contact') k where k not in ('country','province','city','address','email','phone','website_url','website_mode','public_news','public_gallery','public_honors'))
  or exists(select 1 from jsonb_each(p_payload) b cross join lateral jsonb_each(case when jsonb_typeof(b.value)='object' then b.value else '{}'::jsonb end) f where jsonb_typeof(f.value) not in ('string','null'))
  or nullif(btrim(p_payload#>>'{identity,name_fr}'),'') is null or nullif(btrim(p_payload#>>'{academic_year,label}'),'') is null
  or (p_payload#>>'{academic_year,starts_on}')::date is null or (p_payload#>>'{academic_year,ends_on}')::date is null
  or (p_payload#>>'{academic_year,ends_on}')::date <= (p_payload#>>'{academic_year,starts_on}')::date
  or jsonb_array_length(p_payload->'cycles')=0
  or exists(select 1 from jsonb_array_elements_text(p_payload->'cycles') c where c not in ('nursery','primary','secondary') or c is null)
  or coalesce(p_payload#>>'{brand,logo_path}','') ~* '(data:|base64)' then raise check_violation using message='Invalid school payload'; end if;
 foreach v_key in array array['school_id','user_id','profile_id','request_id','preauth'] loop
  v_old:=v_old||jsonb_build_object(v_key,coalesce(current_setting('schoolsafe.'||v_key,true),''));
 end loop;
 -- Only this transaction can insert the newly generated inactive school.
 update auth.direct_onboarding_accounts set activating_school_id=v_school,activating_txid=txid_current() where identity_id=r.identity_id;
 perform set_config('schoolsafe.school_id',v_school::text,true);
 insert into app.schools(id,code,name,name_en,legal_name,school_type,approval_code,primary_color,accent_color,document_footer,logo_path,is_active)
 values(v_school,'SCH-'||upper(substr(replace(v_school::text,'-',''),1,12)),btrim(p_payload#>>'{identity,name_fr}'),p_payload#>>'{identity,name_en}',
  p_payload#>>'{identity,legal_name}',coalesce(p_payload#>>'{identity,school_type}','Privée agréée'),p_payload#>>'{identity,approval_code}',
  coalesce(p_payload#>>'{brand,primary_color}','#071a3d'),coalesce(p_payload#>>'{brand,accent_color}','#e9a515'),p_payload#>>'{brand,document_footer}',p_payload#>>'{brand,logo_path}',false);
 insert into app.academic_years(id,school_id,label,starts_on,ends_on,periods,is_active)
 values(v_year,v_school,p_payload#>>'{academic_year,label}',(p_payload#>>'{academic_year,starts_on}')::date,(p_payload#>>'{academic_year,ends_on}')::date,coalesce(p_payload#>>'{academic_year,periods}','Trimestres'),false);
 for v_cycle in select distinct jsonb_array_elements_text(p_payload->'cycles') loop
  insert into app.school_cycles(school_id,cycle_key,cycle_name) values(v_school,v_cycle,case v_cycle when 'nursery' then 'Maternelle' when 'primary' then 'Primaire' else 'Secondaire et Humanités' end);
 end loop;
 insert into app.school_contacts(school_id,country,province,city,address,email,phone,website_url,website_mode,public_news,public_gallery,public_honors)
 values(v_school,coalesce(p_payload#>>'{contact,country}','République démocratique du Congo'),coalesce(p_payload#>>'{contact,province}','Kinshasa'),coalesce(p_payload#>>'{contact,city}','Kinshasa'),
 p_payload#>>'{contact,address}',p_payload#>>'{contact,email}',p_payload#>>'{contact,phone}',nullif(p_payload#>>'{contact,website_url}',''),
 coalesce(p_payload#>>'{contact,website_mode}','Créer un nouveau site SchoolSafe'),coalesce(p_payload#>>'{contact,public_news}','Après validation'),
 coalesce(p_payload#>>'{contact,public_gallery}','Après validation et consentement'),coalesce(p_payload#>>'{contact,public_honors}','Après validation'));
 insert into iam.profiles(id,user_id,school_id,display_name,first_name,last_name,email,phone,is_active)
 values(v_profile,r.user_id,v_school,r.first_name||' '||r.last_name,r.first_name,r.last_name,r.email::text,r.phone,true);
 perform api.set_request_context(r.user_id,v_profile,v_school,gen_random_uuid());
 perform iam.provision_school_roles(v_school,v_profile);
 select id into v_role from iam.roles where school_id=v_school and code='admin' and is_active;
 if v_role is null then raise check_violation using message='Canonical administrator required'; end if;
 insert into iam.profile_roles(school_id,profile_id,role_id) values(v_school,v_profile,v_role);
 perform iam.require_access('roles.manage');
 insert into app.school_settings(school_id) values(v_school);
 update app.schools set is_active=true,setup_completed_at=clock_timestamp() where id=v_school;
 update app.academic_years set is_active=true where id=v_year;
 perform audit.write_event('school.onboarding.completed','school',v_school,jsonb_build_object('admin_profile_id',v_profile));
 update auth.direct_onboarding_accounts set first_name=r.first_name,last_name=r.last_name,completed_at=clock_timestamp(),activating_school_id=null,activating_txid=null where identity_id=r.identity_id;
 update auth.account_registration_requests set status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp() where identity_id=r.identity_id and status='approved';
 update auth.onboarding_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where identity_id=r.identity_id;
 perform api.auth_create_session(r.identity_id,v_profile,p_session_hash,43200,s.ip,s.user_agent);
 foreach v_key in array array['school_id','user_id','profile_id','request_id','preauth'] loop
  perform set_config('schoolsafe.'||v_key,v_old->>v_key,true);
 end loop;
 return jsonb_build_object('school_id',v_school,'profile_id',v_profile,'status','completed');
end
$fn$;


do $security$
declare f regprocedure;
begin
 foreach f in array array[
  'api.auth_create_direct_identity(text,text,inet)'::regprocedure,
  'api.auth_record_activation_attempt(text,boolean)'::regprocedure,
  'api.auth_activate_school(text,jsonb,text)'::regprocedure
 ] loop
  execute format('revoke all on function %s from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor',f);
  execute format('grant execute on function %s to schoolsafe_auth',f);
 end loop;
 -- Retire every account approval entry point, including the unlicensed v5 creation RPC.
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api' and (p.proname like 'account_registration_%' or p.proname='account_onboarding_create_school') loop
  execute format('revoke all on function %s from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor',f);
 end loop;
end
$security$;
commit;
