\set ON_ERROR_STOP on
-- Account-first registration. Historical installation units and policies remain unchanged.
begin;
set local role schoolsafe_owner;

create table auth.account_registration_requests (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 user_id uuid not null unique references iam.users(id),
 identity_id uuid not null unique references auth.identities(id),
 first_name text not null check (btrim(first_name) <> ''),
 last_name text not null check (btrim(last_name) <> ''),
 email auth.citext not null,
 phone text not null check (phone ~ '^\+243[0-9]{9}$'),
 status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
 submitted_ip inet not null,
 submitted_at timestamptz not null default clock_timestamp(),
 approved_at timestamptz, rejected_at timestamptz, completed_at timestamptz,
 approval_token_hash text unique check (approval_token_hash ~ '^[0-9a-f]{64}$'),
 approval_expires_at timestamptz, approval_token_consumed_at timestamptz, approval_email_sent_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check ((approval_token_hash is null) = (approval_expires_at is null)),
 check ((status='pending' and approved_at is null and rejected_at is null and completed_at is null and approval_token_consumed_at is null)
     or (status='approved' and approved_at is not null and rejected_at is null and completed_at is null and approval_token_consumed_at is not null)
     or (status='rejected' and approved_at is null and rejected_at is not null and completed_at is null and approval_token_consumed_at is not null)
     or (status='completed' and approved_at is not null and rejected_at is null and completed_at is not null and approval_token_consumed_at is not null))
);
create index account_registration_ip_time on auth.account_registration_requests(submitted_ip,submitted_at);
create table auth.onboarding_sessions (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 identity_id uuid not null references auth.identities(id) on delete cascade,
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null, revoked_at timestamptz, ip inet, user_agent text,
 check (expires_at > created_at)
);
create index onboarding_sessions_identity on auth.onboarding_sessions(identity_id);
create table auth.account_registration_events (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 request_id uuid not null references auth.account_registration_requests(id) on delete cascade,
 event_type text not null check (event_type in ('account.registration.pending','account.registration.approved','account.registration.rejected','account.registration.completed')),
 payload jsonb not null default '{}'::jsonb check (payload = '{}'::jsonb),
 created_at timestamptz not null default clock_timestamp()
);
create index account_registration_events_request on auth.account_registration_events(request_id);
do $security$
declare t text;
begin
 foreach t in array array['account_registration_requests','onboarding_sessions','account_registration_events'] loop
  execute format('alter table auth.%I enable row level security',t);
  execute format('alter table auth.%I force row level security',t);
  execute format('create policy %I on auth.%I to schoolsafe_owner using (true) with check (true)',t||'_owner',t);
  execute format('revoke all on auth.%I from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor',t);
 end loop;
end
$security$;

create function api.account_registration_prepare(p_payload jsonb,p_password_hash text,p_ip inet)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 v_user uuid:=gen_random_uuid(); v_identity uuid:=gen_random_uuid(); v_request uuid:=gen_random_uuid();
 v_email text; v_phone text; v_first text; v_last text; v_bucket text;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise check_violation using message='Invalid account registration'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('first_name','last_name','email','phone'))
  or exists(select 1 from unnest(array['first_name','last_name','email','phone']) k where jsonb_typeof(p_payload->k) is distinct from 'string')
  or p_password_hash is null or p_password_hash !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'
  or p_ip is null then raise check_violation using message='Invalid account registration'; end if;
 v_first:=btrim(p_payload->>'first_name'); v_last:=btrim(p_payload->>'last_name');
 v_email:=auth.normalize_login(p_payload->>'email'); v_phone:=auth.normalize_login(p_payload->>'phone');
 if length(v_first) not between 1 and 100 or length(v_last) not between 1 and 100
  or length(v_email)>254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  or v_phone !~ '^\+243[0-9]{9}$' then raise check_violation using message='Invalid account registration'; end if;
 -- Serialize the IP window; delivery compensation must not erase the admission counter.
 v_bucket:='account-registration-ip:'||host(p_ip);
 perform pg_advisory_xact_lock(hashtextextended(v_bucket,0));
 if (select count(*) from auth.login_attempts where login=v_bucket and attempted_at>clock_timestamp()-interval '15 minutes')>=5 then
  raise exception using errcode='P0001',message='Registration temporarily unavailable';
 end if;
 begin
  insert into iam.users(id,auth_provider,external_subject,email,phone,is_active) values(v_user,'local',v_email,v_email,v_phone,false);
  insert into auth.identities(id,user_id,email,phone,status) values(v_identity,v_user,v_email::auth.citext,v_phone,'disabled');
  insert into auth.credentials(identity_id,password_hash) values(v_identity,p_password_hash);
  insert into auth.account_registration_requests(id,user_id,identity_id,first_name,last_name,email,phone,submitted_ip)
   values(v_request,v_user,v_identity,v_first,v_last,v_email::auth.citext,v_phone,p_ip);
 exception when unique_violation then
  raise unique_violation using message='Account registration unavailable';
 end;
 insert into auth.account_registration_events(request_id,event_type) values(v_request,'account.registration.pending');
 insert into auth.login_attempts(login,succeeded) values(v_bucket,false);
 return jsonb_build_object('request_id',v_request,'status','pending');
end
$fn$;

create function api.account_registration_issue_approval(p_request_id uuid,p_token_hash text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare r auth.account_registration_requests%rowtype;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at is null
  or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '48 hours' then
  raise check_violation using message='Invalid approval capability'; end if;
 select * into r from auth.account_registration_requests where id=p_request_id for update;
 if not found or r.status<>'pending' or r.approval_token_consumed_at is not null or r.approval_token_hash is not null then
  raise insufficient_privilege using message='Approval unavailable'; end if;
 update auth.account_registration_requests set approval_token_hash=p_token_hash,approval_expires_at=p_expires_at,updated_at=clock_timestamp() where id=r.id;
 return jsonb_build_object('request_id',r.id,'status',r.status);
end
$fn$;

create function api.account_registration_mark_email_sent(p_request_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 update auth.account_registration_requests set approval_email_sent_at=coalesce(approval_email_sent_at,clock_timestamp()),updated_at=clock_timestamp()
 where id=p_request_id and approval_token_hash is not null;
end
$fn$;

create function api.account_registration_review(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare r auth.account_registration_requests%rowtype;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 select * into r from auth.account_registration_requests where approval_token_hash=p_token_hash
  and status='pending' and approval_token_consumed_at is null and approval_expires_at>clock_timestamp();
 if not found then raise insufficient_privilege using message='Approval unavailable'; end if;
 return jsonb_build_object('request_id',r.id,'first_name',r.first_name,'last_name',r.last_name,'email',r.email,'phone',r.phone,'status',r.status);
end
$fn$;

create function api.account_registration_decide(p_token_hash text,p_decision text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare r auth.account_registration_requests%rowtype; v_preauth text:=coalesce(current_setting('schoolsafe.preauth',true),'');
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 if p_decision is null or p_decision not in ('approve','reject') then raise check_violation using message='Invalid approval decision'; end if;
 select * into r from auth.account_registration_requests where approval_token_hash=p_token_hash for update;
 if not found or r.status<>'pending' or r.approval_token_consumed_at is not null or r.approval_expires_at<=clock_timestamp() then
  raise insufficient_privilege using message='Approval unavailable'; end if;
 perform set_config('schoolsafe.preauth','on',true);
 perform 1 from auth.identities i join iam.users u on u.id=i.user_id where i.id=r.identity_id and i.user_id=r.user_id
  and i.email=r.email and i.phone=r.phone and u.email=r.email::text and u.phone=r.phone and not u.is_active and i.status='disabled'
  and not exists(select 1 from iam.profiles p where p.user_id=r.user_id) for update of i,u;
 if not found then raise insufficient_privilege using message='Approval unavailable'; end if;
 if p_decision='approve' then
  update iam.users set is_active=true where id=r.user_id;
  update auth.identities set status='active' where id=r.identity_id;
 end if;
 update auth.account_registration_requests set status=case p_decision when 'approve' then 'approved' else 'rejected' end,
  approved_at=case when p_decision='approve' then clock_timestamp() end,rejected_at=case when p_decision='reject' then clock_timestamp() end,
  approval_token_consumed_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id returning * into r;
 insert into auth.account_registration_events(request_id,event_type) values(r.id,'account.registration.'||r.status);
 perform set_config('schoolsafe.preauth',v_preauth,true);
 return jsonb_build_object('request_id',r.id,'status',r.status);
end
$fn$;

create function api.account_registration_cancel_delivery_failure(p_request_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
declare r auth.account_registration_requests%rowtype; v_preauth text:=coalesce(current_setting('schoolsafe.preauth',true),'');
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 select * into r from auth.account_registration_requests where id=p_request_id for update;
 if not found then return false; end if;
 if r.status<>'pending' or r.approved_at is not null or r.approval_token_consumed_at is not null or r.approval_email_sent_at is not null then return false; end if;
 perform set_config('schoolsafe.preauth','on',true);
 perform 1 from auth.identities i join iam.users u on u.id=i.user_id where i.id=r.identity_id and i.user_id=r.user_id
  and not u.is_active and i.status='disabled' and not exists(select 1 from iam.profiles p where p.user_id=r.user_id) for update of i,u;
 if not found then perform set_config('schoolsafe.preauth',v_preauth,true);return false; end if;
 delete from auth.account_registration_requests where id=r.id;
 delete from auth.credentials where identity_id=r.identity_id;
 delete from auth.identities where id=r.identity_id and user_id=r.user_id;
 delete from iam.users where id=r.user_id;
 perform set_config('schoolsafe.preauth',v_preauth,true);
 return true;
end
$fn$;

-- Private shared predicate restores pre-auth visibility before returning.
create function auth.account_onboarding_allowed(p_identity_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ok boolean; v_preauth text:=coalesce(current_setting('schoolsafe.preauth',true),'');
begin
 perform set_config('schoolsafe.preauth','on',true);
 select exists(select 1 from auth.account_registration_requests r
  join auth.identities i on i.id=r.identity_id and i.user_id=r.user_id and i.status='active' and i.email=r.email and i.phone=r.phone
  join iam.users u on u.id=r.user_id and u.is_active and u.email=r.email::text and u.phone=r.phone
  where r.identity_id=p_identity_id and r.status='approved' and r.approved_at is not null
  and not exists(select 1 from iam.profiles p where p.user_id=r.user_id and p.is_active)) into v_ok;
 perform set_config('schoolsafe.preauth',v_preauth,true);
 return v_ok;
end
$fn$;
revoke all on function auth.account_onboarding_allowed(uuid) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor;

create function api.auth_resolve_onboarding_identity(p_login text)
returns table(identity_id uuid,user_id uuid,password_hash text,status text,must_change boolean)
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 return query select i.id,i.user_id,c.password_hash,i.status,c.must_change from auth.identities i
 join auth.credentials c on c.identity_id=i.id
 where (i.email::text=auth.normalize_login(p_login) or i.phone=auth.normalize_login(p_login)) and auth.account_onboarding_allowed(i.id);
end
$fn$;

create function api.auth_create_onboarding_session(p_identity_id uuid,p_token_hash text,p_ttl_seconds integer,p_ip inet,p_user_agent text)
returns table(session_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_ttl_seconds is null or p_ttl_seconds not between 1 and 3600 then
  raise check_violation using message='Invalid onboarding session'; end if;
 perform 1 from auth.account_registration_requests where identity_id=p_identity_id for update;
 if not found or not auth.account_onboarding_allowed(p_identity_id) then raise insufficient_privilege using message='Onboarding unavailable'; end if;
 return query insert into auth.onboarding_sessions(identity_id,token_hash,expires_at,ip,user_agent)
  values(p_identity_id,p_token_hash,clock_timestamp()+make_interval(secs=>p_ttl_seconds),p_ip,p_user_agent)
  returning id,auth.onboarding_sessions.expires_at;
end
$fn$;

create function api.auth_resolve_onboarding_session(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_result jsonb;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 select jsonb_build_object('first_name',r.first_name,'last_name',r.last_name,'email',r.email,'phone',r.phone,'status',r.status) into v_result
 from auth.onboarding_sessions s join auth.account_registration_requests r on r.identity_id=s.identity_id
 where s.token_hash=p_token_hash and s.revoked_at is null and s.expires_at>clock_timestamp() and auth.account_onboarding_allowed(s.identity_id);
 return v_result;
end
$fn$;

create function api.auth_revoke_onboarding_session(p_token_hash text)
returns void language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 update auth.onboarding_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where token_hash=p_token_hash;
end
$fn$;

create function api.account_onboarding_create_school(p_onboarding_token_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 r auth.account_registration_requests%rowtype; s auth.onboarding_sessions%rowtype;
 v_school uuid:=gen_random_uuid(); v_year uuid:=gen_random_uuid(); v_profile uuid:=gen_random_uuid();
 v_capability text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 v_role uuid; v_cycle text; v_key text; v_old jsonb:='{}'::jsonb;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 -- Request first: distinct sessions for the same identity must serialize too.
 select r0.* into r from auth.account_registration_requests r0 join auth.onboarding_sessions s0 on s0.identity_id=r0.identity_id
 where s0.token_hash=p_onboarding_token_hash for update of r0;
 if not found or not auth.account_onboarding_allowed(r.identity_id) then raise insufficient_privilege using message='Onboarding unavailable'; end if;
 select * into s from auth.onboarding_sessions where token_hash=p_onboarding_token_hash and identity_id=r.identity_id for update;
 if not found or s.revoked_at is not null or s.expires_at<=clock_timestamp() then raise insufficient_privilege using message='Onboarding unavailable'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise check_violation using message='Invalid school payload'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('identity','cycles','academic_year','contact','brand'))
  or exists(select 1 from unnest(array['identity','academic_year','contact','brand']) k where jsonb_typeof(p_payload->k) is distinct from 'object')
  or jsonb_typeof(p_payload->'cycles') is distinct from 'array' then raise check_violation using message='Invalid school payload'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload->'identity') k where k not in ('name_fr','name_en','legal_name','school_type','approval_code'))
  or exists(select 1 from jsonb_object_keys(p_payload->'academic_year') k where k not in ('label','starts_on','ends_on','periods'))
  or exists(select 1 from jsonb_object_keys(p_payload->'brand') k where k not in ('primary_color','accent_color','document_footer','logo_path'))
  or exists(select 1 from jsonb_object_keys(p_payload->'contact') k where k not in ('country','province','city','address','email','phone','website_url','website_mode','public_news','public_gallery','public_honors'))
  or exists(select 1 from jsonb_each(p_payload) b cross join lateral jsonb_each(case when jsonb_typeof(b.value)='object' then b.value else '{}'::jsonb end) f where jsonb_typeof(f.value) not in ('string','null'))
  or nullif(btrim(p_payload#>>'{identity,name_fr}'),'') is null or nullif(btrim(p_payload#>>'{academic_year,label}'),'') is null
  or (p_payload#>>'{academic_year,starts_on}')::date is null or (p_payload#>>'{academic_year,ends_on}')::date is null
  or (p_payload#>>'{academic_year,ends_on}')::date < (p_payload#>>'{academic_year,starts_on}')::date
  or jsonb_array_length(p_payload->'cycles')=0
  or exists(select 1 from jsonb_array_elements_text(p_payload->'cycles') c where c not in ('nursery','primary','secondary') or c is null)
  or coalesce(p_payload#>>'{brand,logo_path}','') ~* '(data:|base64)' then raise check_violation using message='Invalid school payload'; end if;
 foreach v_key in array array['school_id','user_id','profile_id','request_id','setup_token_hash'] loop
  v_old:=v_old||jsonb_build_object(v_key,coalesce(current_setting('schoolsafe.'||v_key,true),''));
 end loop;
 -- The existing, short-lived setup capability admits only this new inactive school.
 insert into auth.setup_authorizations(token_hash,school_id,academic_year_id,payload,expires_at)
 values(v_capability,v_school,v_year,p_payload,clock_timestamp()+interval '1 minute');
 perform set_config('schoolsafe.school_id',v_school::text,true);
 perform set_config('schoolsafe.setup_token_hash',v_capability,true);
 insert into app.schools(id,code,name,name_en,legal_name,school_type,approval_code,primary_color,accent_color,document_footer,logo_path,is_active)
 values(v_school,'SCH-'||upper(substr(replace(v_school::text,'-',''),1,12)),btrim(p_payload#>>'{identity,name_fr}'),p_payload#>>'{identity,name_en}',
  p_payload#>>'{identity,legal_name}',coalesce(p_payload#>>'{identity,school_type}','Privée agréée'),p_payload#>>'{identity,approval_code}',
  coalesce(p_payload#>>'{brand,primary_color}','#071a3d'),coalesce(p_payload#>>'{brand,accent_color}','#e9a515'),p_payload#>>'{brand,document_footer}',p_payload#>>'{brand,logo_path}',false);
 insert into iam.profiles(id,user_id,school_id,display_name,first_name,last_name,email,phone,is_active)
 values(v_profile,r.user_id,v_school,r.first_name||' '||r.last_name,r.first_name,r.last_name,r.email::text,r.phone,true);
 perform api.set_request_context(r.user_id,v_profile,v_school,gen_random_uuid());
 perform iam.provision_school_roles(v_school,v_profile);
 select id into v_role from iam.roles where school_id=v_school and code='admin' and is_active;
 if v_role is null then raise check_violation using message='Canonical administrator required'; end if;
 insert into iam.profile_roles(school_id,profile_id,role_id) values(v_school,v_profile,v_role);
 perform iam.require_access('roles.manage');
 insert into app.school_settings(school_id) values(v_school);
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
 update app.academic_years set is_active=true where id=v_year;
 update app.schools set is_active=true,setup_completed_at=clock_timestamp() where id=v_school;
 perform audit.write_event('school.onboarding.completed','school',v_school,jsonb_build_object('request_id',r.id,'admin_profile_id',v_profile));
 update auth.setup_authorizations set consumed_at=clock_timestamp() where token_hash=v_capability;
 update auth.account_registration_requests set status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
 insert into auth.account_registration_events(request_id,event_type) values(r.id,'account.registration.completed');
 update auth.onboarding_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where identity_id=r.identity_id;
 foreach v_key in array array['school_id','user_id','profile_id','request_id','setup_token_hash'] loop
  perform set_config('schoolsafe.'||v_key,v_old->>v_key,true);
 end loop;
 return jsonb_build_object('school_id',v_school,'profile_id',v_profile,'status','completed');
end
$fn$;

do $security$
declare f regprocedure;
begin
 foreach f in array array[
  'api.account_registration_prepare(jsonb,text,inet)'::regprocedure,
  'api.account_registration_issue_approval(uuid,text,timestamptz)'::regprocedure,
  'api.account_registration_mark_email_sent(uuid)'::regprocedure,
  'api.account_registration_review(text)'::regprocedure,
  'api.account_registration_decide(text,text)'::regprocedure,
  'api.account_registration_cancel_delivery_failure(uuid)'::regprocedure,
  'api.auth_resolve_onboarding_identity(text)'::regprocedure,
  'api.auth_create_onboarding_session(uuid,text,integer,inet,text)'::regprocedure,
  'api.auth_resolve_onboarding_session(text)'::regprocedure,
  'api.auth_revoke_onboarding_session(text)'::regprocedure,
  'api.account_onboarding_create_school(text,jsonb)'::regprocedure
 ] loop
  execute format('revoke all on function %s from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor',f);
  execute format('grant execute on function %s to schoolsafe_auth',f);
 end loop;
end
$security$;
commit;
