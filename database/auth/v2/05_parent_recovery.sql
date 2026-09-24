\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;

-- FORCE RLS remains enabled. Recovery functions scope PREAUTH to their lookup.
do $schoolsafe$
declare t text;
begin
  foreach t in array array['iam.profiles','iam.profile_roles','iam.roles','app.schools',
    'app.student_guardians','app.students','app.student_enrollments','app.classes'] loop
    execute format('drop policy if exists recovery_preauth_read on %s',t);
    execute format('create policy recovery_preauth_read on %s for select to schoolsafe_owner using (current_setting(''schoolsafe.recovery_preauth'',true) = ''on'')',t);
  end loop;
end
$schoolsafe$;

create table if not exists auth.recovery_failure_buckets (
  attempt_key text primary key check (attempt_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default clock_timestamp(),
  failures integer not null default 0 check (failures between 0 and 5)
);
alter table auth.recovery_failure_buckets enable row level security;
alter table auth.recovery_failure_buckets force row level security;
drop policy if exists recovery_failure_owner on auth.recovery_failure_buckets;
create policy recovery_failure_owner on auth.recovery_failure_buckets to schoolsafe_owner using (true) with check (true);
revoke all on auth.recovery_failure_buckets from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;

create or replace function auth.recovery_name(p_value text) returns text
language sql immutable set search_path=pg_catalog
as $$ select lower(regexp_replace(btrim(p_value), '\s+', ' ', 'g')) $$;
revoke all on function auth.recovery_name(text) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;

create or replace function api.auth_recovery_normalize_phone(p_phone text) returns text
language sql security definer set search_path=pg_catalog
as $$ select auth.normalize_login(p_phone) $$;
revoke all on function api.auth_recovery_normalize_phone(text) from public,schoolsafe_api,schoolsafe_worker;
grant execute on function api.auth_recovery_normalize_phone(text) to schoolsafe_auth;

-- Internal helper: no runtime EXECUTE and no second reset store.
create or replace function auth.recovery_issue(p_identity uuid,p_token_hash text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $schoolsafe$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  perform 1 from auth.identities where id=p_identity and status='active' for update;
  if not found then return false; end if;
  update auth.recovery_requests set used_at=clock_timestamp() where identity_id=p_identity and used_at is null;
  insert into auth.recovery_requests(identity_id,token_hash,expires_at)
    values(p_identity,p_token_hash,clock_timestamp()+interval '15 minutes');
  return true;
end
$schoolsafe$;
revoke all on function auth.recovery_issue(uuid,text) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;

create or replace function api.auth_recover_parent_account(
  p_parent_full_name text,p_phone_number text,p_child_full_name text,p_class_name text,
  p_token_hash text,p_attempt_key text
) returns boolean language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare identities uuid[]; bucket auth.recovery_failure_buckets%rowtype;
  previous_preauth text:=coalesce(current_setting('schoolsafe.recovery_preauth',true),'');
begin
  if p_attempt_key is null or p_attempt_key !~ '^[0-9a-f]{64}$'
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into auth.recovery_failure_buckets(attempt_key) values(p_attempt_key) on conflict do nothing;
  select * into bucket from auth.recovery_failure_buckets where attempt_key=p_attempt_key for update;
  if bucket.window_started_at<=clock_timestamp()-interval '30 minutes' then
    update auth.recovery_failure_buckets set failures=0,window_started_at=clock_timestamp() where attempt_key=p_attempt_key;
    bucket.failures:=0;
  end if;
  if bucket.failures>=5 then return false; end if;
  perform set_config('schoolsafe.recovery_preauth','on',true);
  select array_agg(distinct i.id) into identities
  from iam.profiles p
  join auth.identities i on i.user_id=p.user_id and i.status='active'
  join iam.profile_roles pr on pr.profile_id=p.id and pr.school_id=p.school_id
    and pr.is_active and pr.starts_at<=clock_timestamp() and (pr.ends_at is null or pr.ends_at>clock_timestamp())
  join iam.roles r on r.id=pr.role_id and r.school_id=p.school_id and r.is_active and r.code='parent'
  join app.student_guardians g on g.profile_id=p.id and g.school_id=p.school_id and g.is_active
  join app.students s on s.id=g.student_id and s.school_id=p.school_id and s.lifecycle_status='active'
  join app.student_enrollments e on e.student_id=s.id and e.school_id=p.school_id and e.status='active'
    and e.starts_on<=current_date and (e.ends_on is null or e.ends_on>=current_date)
  join app.classes c on c.id=e.class_id and c.school_id=p.school_id and c.is_active
  where p.is_active and p.account_status='active' and coalesce(p.phone,'')<>''
    and auth.normalize_login(p.phone)=auth.normalize_login(p_phone_number)
    and auth.recovery_name(p.display_name)=auth.recovery_name(p_parent_full_name)
    and auth.recovery_name(concat_ws(' ',s.first_name,s.middle_name,s.last_name))=auth.recovery_name(p_child_full_name)
    and auth.recovery_name(c.name)=auth.recovery_name(p_class_name);
  perform set_config('schoolsafe.recovery_preauth',previous_preauth,true);
  if coalesce(cardinality(identities),0)<>1 then
    update auth.recovery_failure_buckets set failures=failures+1 where attempt_key=p_attempt_key;
    return false;
  end if;
  return auth.recovery_issue(identities[1],p_token_hash);
end
$schoolsafe$;
revoke all on function api.auth_recover_parent_account(text,text,text,text,text,text) from public,schoolsafe_api,schoolsafe_worker;
grant execute on function api.auth_recover_parent_account(text,text,text,text,text,text) to schoolsafe_auth;

create or replace function api.auth_recover_profile_account(
  p_full_name text,p_phone_number text,p_school_name text,p_role_name text,p_token_hash text
) returns boolean language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare identities uuid[];
  previous_preauth text:=coalesce(current_setting('schoolsafe.recovery_preauth',true),'');
begin
  perform set_config('schoolsafe.recovery_preauth','on',true);
  select array_agg(distinct i.id) into identities
  from iam.profiles p
  join auth.identities i on i.user_id=p.user_id and i.status='active'
  join app.schools s on s.id=p.school_id and s.is_active
  join iam.profile_roles pr on pr.profile_id=p.id and pr.school_id=p.school_id and pr.is_active
    and pr.starts_at<=clock_timestamp() and (pr.ends_at is null or pr.ends_at>clock_timestamp())
  join iam.roles r on r.id=pr.role_id and r.school_id=p.school_id and r.is_active and r.code<>'parent'
  where p.is_active and p.account_status='active' and coalesce(p.phone,'')<>''
    and auth.normalize_login(p.phone)=auth.normalize_login(p_phone_number)
    and auth.recovery_name(p.display_name)=auth.recovery_name(p_full_name)
    and auth.recovery_name(s.name)=auth.recovery_name(p_school_name)
    and (auth.recovery_name(r.label)=auth.recovery_name(p_role_name) or auth.recovery_name(r.code)=auth.recovery_name(p_role_name));
  perform set_config('schoolsafe.recovery_preauth',previous_preauth,true);
  if coalesce(cardinality(identities),0)<>1 then return false; end if;
  return auth.recovery_issue(identities[1],p_token_hash);
end
$schoolsafe$;
revoke all on function api.auth_recover_profile_account(text,text,text,text,text) from public,schoolsafe_api,schoolsafe_worker;
grant execute on function api.auth_recover_profile_account(text,text,text,text,text) to schoolsafe_auth;
commit;
