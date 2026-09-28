\set ON_ERROR_STOP on
-- Control authorizations reuse native identities, sessions and atomic school creation.
begin;
set local role schoolsafe_owner;

create table auth.control_admin_links (
 access_id uuid primary key,
 identity_id uuid unique not null references auth.identities(id),
 user_id uuid unique not null references iam.users(id),
 school_id uuid references app.schools(id),
 created_at timestamptz not null default clock_timestamp(),
 bound_at timestamptz,
 check ((school_id is null and bound_at is null) or (school_id is not null and bound_at is not null))
);
alter table auth.control_admin_links enable row level security;
alter table auth.control_admin_links force row level security;
create policy control_admin_links_owner on auth.control_admin_links to schoolsafe_owner using(true) with check(true);
revoke all on auth.control_admin_links from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor;

create function api.auth_control_resolve_identity(p_access_id uuid,p_email text,p_phone text)
returns table(access_id uuid,identity_id uuid,user_id uuid,school_id uuid,profile_id uuid)
language plpgsql security definer set search_path=pg_catalog as $fn$
declare
 l auth.control_admin_links%rowtype;
 v_user uuid; v_identity uuid; v_email text:=nullif(lower(btrim(p_email)),'');
 v_phone text:=nullif(btrim(p_phone),'');
 v_old text:=coalesce(current_setting('schoolsafe.preauth',true),'');
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 if p_access_id is null or (v_email is null and v_phone is null)
  or (v_email is not null and (length(v_email)>254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'))
  or (v_phone is not null and v_phone !~ '^\+243[0-9]{9}$') then raise check_violation; end if;
 perform pg_advisory_xact_lock(hashtextextended('control-access:'||p_access_id::text,0));
 perform set_config('schoolsafe.preauth','on',true);
 select * into l from auth.control_admin_links a where a.access_id=p_access_id for update;
 if not found then
  -- Never take over a pre-existing local identity based only on a matching address.
  if exists(select 1 from auth.identities i where (v_email is not null and i.email::text=v_email) or (v_phone is not null and i.phone=v_phone))
   or exists(select 1 from iam.users u where (v_email is not null and lower(u.email)=v_email) or (v_phone is not null and u.phone=v_phone)) then
   raise insufficient_privilege using message='Identity already managed locally';
  end if;
  v_user:=gen_random_uuid(); v_identity:=gen_random_uuid();
  insert into iam.users(id,auth_provider,external_subject,email,phone,is_active)
   values(v_user,'local','control:'||p_access_id::text,v_email,v_phone,true);
  insert into auth.identities(id,user_id,email,phone,status) values(v_identity,v_user,v_email::auth.citext,v_phone,'active');
  -- No credential row: the Control password and its hash never enter SchoolSafe.
  insert into auth.direct_onboarding_accounts(identity_id,user_id) values(v_identity,v_user);
  insert into auth.control_admin_links(access_id,identity_id,user_id) values(p_access_id,v_identity,v_user) returning * into l;
 end if;
 if not exists(select 1 from auth.identities i join iam.users u on u.id=i.user_id
  where i.id=l.identity_id and i.user_id=l.user_id and i.status='active' and u.is_active) then
  raise insufficient_privilege using message='Identity inactive';
 end if;
 return query select l.access_id,l.identity_id,l.user_id,l.school_id,
  (select p.id from iam.profiles p where p.user_id=l.user_id and p.school_id=l.school_id and p.is_active);
 perform set_config('schoolsafe.preauth',v_old,true);
end
$fn$;

create function api.auth_control_link(p_identity_id uuid)
returns table(access_id uuid,identity_id uuid,user_id uuid,school_id uuid)
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 return query select a.access_id,a.identity_id,a.user_id,a.school_id from auth.control_admin_links a where a.identity_id=p_identity_id;
end
$fn$;

create function api.auth_control_revoke_sessions(p_access_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_identity uuid; v_old text:=coalesce(current_setting('schoolsafe.preauth',true),'');
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 select a.identity_id into v_identity from auth.control_admin_links a where a.access_id=p_access_id;
 if v_identity is null then return; end if;
 perform set_config('schoolsafe.preauth','on',true);
 update auth.sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where identity_id=v_identity;
 update auth.onboarding_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where identity_id=v_identity;
 perform set_config('schoolsafe.preauth',v_old,true);
end
$fn$;

create or replace function api.auth_resolve_onboarding_session(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_result jsonb;v_old text:=coalesce(current_setting('schoolsafe.preauth',true),'');
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 perform set_config('schoolsafe.preauth','on',true);
 select jsonb_build_object('access_id',a.access_id,'first_name',d.first_name,'last_name',d.last_name,
  'email',i.email,'phone',i.phone,'status','onboarding') into v_result
 from auth.onboarding_sessions s join auth.direct_onboarding_accounts d on d.identity_id=s.identity_id
 join auth.control_admin_links a on a.identity_id=d.identity_id and a.school_id is null
 join auth.identities i on i.id=d.identity_id
 where s.token_hash=p_token_hash and s.revoked_at is null and s.expires_at>clock_timestamp()
  and auth.account_onboarding_allowed(s.identity_id);
 perform set_config('schoolsafe.preauth',v_old,true);
 return v_result;
end
$fn$;

-- Retain the established transaction intact, behind an owner-only wrapper.
alter function api.auth_activate_school(text,jsonb,text) rename to control_activation_core;
alter function api.control_activation_core(text,jsonb,text) set schema auth;
revoke all on function auth.control_activation_core(text,jsonb,text) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor;

create function api.auth_activate_school(p_onboarding_token_hash text,p_payload jsonb,p_session_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare l auth.control_admin_links%rowtype;v_result jsonb;
begin
 if session_user<>'schoolsafe_auth' then raise insufficient_privilege; end if;
 select a.* into l from auth.control_admin_links a join auth.onboarding_sessions s on s.identity_id=a.identity_id
  where s.token_hash=p_onboarding_token_hash and s.revoked_at is null and s.expires_at>clock_timestamp()
  for update of a;
 if not found or l.school_id is not null then raise insufficient_privilege using message='Onboarding unavailable'; end if;
 v_result:=auth.control_activation_core(p_onboarding_token_hash,p_payload,p_session_hash);
 update auth.control_admin_links set school_id=(v_result->>'school_id')::uuid,bound_at=clock_timestamp() where access_id=l.access_id;
 return v_result||jsonb_build_object('access_id',l.access_id);
end
$fn$;

-- Retire public self-admission and master-code attempts; leave historical data intact.
revoke all on function api.auth_create_direct_identity(text,text,inet) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor;
revoke all on function api.auth_record_activation_attempt(text,boolean) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor;

do $security$
declare f regprocedure;
begin
 foreach f in array array[
  'api.auth_control_resolve_identity(uuid,text,text)'::regprocedure,
  'api.auth_control_link(uuid)'::regprocedure,
  'api.auth_control_revoke_sessions(uuid)'::regprocedure,
  'api.auth_activate_school(text,jsonb,text)'::regprocedure
 ] loop
  execute format('revoke all on function %s from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker,schoolsafe_migrator,schoolsafe_auditor',f);
  execute format('grant execute on function %s to schoolsafe_auth',f);
 end loop;
end
$security$;
commit;
