\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;

-- Table and static partial index are owned by v2/04; do not redefine them.
create or replace function auth.recovery_admin_school(p_admin uuid,p_identity uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare school uuid;
  previous_preauth text:=coalesce(current_setting('schoolsafe.recovery_preauth',true),'');
begin
  perform set_config('schoolsafe.recovery_preauth','on',true);
  select p.school_id into school from iam.profiles p
  where p.id=p_admin and p.is_active and p.account_status='active'
    and exists(select 1 from iam.profile_roles pr join iam.roles r on r.id=pr.role_id
      and r.school_id=p.school_id and r.is_active and r.code='admin'
      where pr.profile_id=p.id and pr.school_id=p.school_id and pr.is_active
        and pr.starts_at<=clock_timestamp() and (pr.ends_at is null or pr.ends_at>clock_timestamp()))
    and exists(select 1 from auth.identities i join iam.profiles t on t.user_id=i.user_id
      and t.school_id=p.school_id and t.is_active and t.account_status='active'
      where i.id=p_identity and i.status='active' and i.user_id<>p.user_id);
  perform set_config('schoolsafe.recovery_preauth',previous_preauth,true);
  return school;
end
$schoolsafe$;
revoke all on function auth.recovery_admin_school(uuid,uuid) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;

create or replace function api.auth_resolve_admin_recovery_target(p_admin_profile_id uuid,p_target_profile_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare matches uuid[];
  previous_preauth text:=coalesce(current_setting('schoolsafe.recovery_preauth',true),'');
begin
  perform set_config('schoolsafe.recovery_preauth','on',true);
  select array_agg(distinct i.id) into matches from iam.profiles p
    join auth.identities i on i.user_id=p.user_id and i.status='active'
    where p.id=p_target_profile_id and p.is_active and p.account_status='active'
      and p.school_id=auth.recovery_admin_school(p_admin_profile_id,i.id);
  perform set_config('schoolsafe.recovery_preauth',previous_preauth,true);
  if coalesce(cardinality(matches),0)<>1 then return null; end if;
  return matches[1];
end
$schoolsafe$;

create or replace function api.auth_can_admin_recover(p_admin_profile_id uuid,p_target_identity_id uuid)
returns boolean language sql security definer set search_path=pg_catalog
as $$ select auth.recovery_admin_school(p_admin_profile_id,p_target_identity_id) is not null $$;

-- Preserve the TEXT return type installed in 04.
create or replace function api.auth_admin_generate_recovery_code(
  p_admin_profile_id uuid,p_target_identity_id uuid,p_code_hash text
) returns text language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare school uuid;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  perform 1 from auth.identities where id=p_target_identity_id and status='active' for update;
  if not found then return null; end if;
  school:=auth.recovery_admin_school(p_admin_profile_id,p_target_identity_id);
  if school is null then return null; end if;
  update auth.admin_recovery_codes set used_at=clock_timestamp()
    where identity_id=p_target_identity_id and used_at is null;
  insert into auth.admin_recovery_codes(identity_id,school_id,code_hash,authorized_by_profile_id,expires_at)
    values(p_target_identity_id,school,p_code_hash,p_admin_profile_id,clock_timestamp()+interval '60 minutes');
  return 'CODE_GENERATED';
end
$schoolsafe$;

-- Owner-only consumption helper. The runtime must use the atomic three-argument API.
create or replace function api.auth_redeem_admin_recovery_code(p_login text,p_code_hash text)
returns uuid language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare matches uuid[]; identity uuid; item auth.admin_recovery_codes%rowtype;
  profile_active boolean;
  previous_preauth text:=coalesce(current_setting('schoolsafe.recovery_preauth',true),'');
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select array_agg(distinct i.id) into matches from auth.identities i
    where (i.email::text=auth.normalize_login(p_login) or i.phone=auth.normalize_login(p_login)) and i.status='active';
  if coalesce(cardinality(matches),0)<>1 then return null; end if;
  identity:=matches[1];
  perform 1 from auth.identities where id=identity and status='active' for update;
  if not found then return null; end if;
  select c.* into item from auth.admin_recovery_codes c where c.identity_id=identity
    and c.used_at is null order by c.created_at desc,c.id limit 1 for update;
  if not found or item.expires_at<=clock_timestamp() or item.attempt_count>=5 then return null; end if;
  if item.code_hash<>p_code_hash then
    update auth.admin_recovery_codes set attempt_count=attempt_count+1 where id=item.id;
    return null;
  end if;
  perform set_config('schoolsafe.recovery_preauth','on',true);
  select exists(select 1 from iam.profiles p join auth.identities i on i.user_id=p.user_id
      where i.id=identity and p.school_id=item.school_id and p.is_active and p.account_status='active') into profile_active;
  perform set_config('schoolsafe.recovery_preauth',previous_preauth,true);
  if not profile_active then return null; end if;
  update auth.admin_recovery_codes set used_at=clock_timestamp() where id=item.id;
  return identity;
end
$schoolsafe$;
revoke all on function api.auth_redeem_admin_recovery_code(text,text) from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;

create or replace function api.auth_redeem_admin_recovery_code(p_login text,p_code_hash text,p_token_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $schoolsafe$
declare identity uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  identity:=api.auth_redeem_admin_recovery_code(p_login,p_code_hash);
  if identity is null then return false; end if;
  if not auth.recovery_issue(identity,p_token_hash) then
    raise check_violation using message='Recovery refused';
  end if;
  return true;
end
$schoolsafe$;

-- The existing reset function still consumes tokens and revokes sessions.
-- Only phone-shaped candidate passwords are provided to this wrapper.
create or replace function api.auth_reset_password(p_token_hash text,p_new_password_hash text,p_phone_candidate text)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare identity uuid;
  phone_matches boolean;
  previous_preauth text:=coalesce(current_setting('schoolsafe.recovery_preauth',true),'');
begin
  select r.identity_id into identity from auth.recovery_requests r where r.token_hash=p_token_hash;
  if not found then return false; end if;
  perform 1 from auth.identities where id=identity and status='active' for update;
  if not found then return false; end if;
  perform set_config('schoolsafe.recovery_preauth','on',true);
  select p_phone_candidate is not null and exists(
    select 1 from auth.identities i left join iam.profiles p on p.user_id=i.user_id
    where i.id=identity and
      ((coalesce(p.phone,'')<>'' and auth.normalize_login(p.phone)=auth.normalize_login(p_phone_candidate))
      or (coalesce(i.phone,'')<>'' and auth.normalize_login(i.phone)=auth.normalize_login(p_phone_candidate)))
  ) into phone_matches;
  perform set_config('schoolsafe.recovery_preauth',previous_preauth,true);
  if phone_matches then return false; end if;
  return api.auth_reset_password(p_token_hash,p_new_password_hash);
end
$schoolsafe$;
revoke all on function api.auth_resolve_admin_recovery_target(uuid,uuid),
  api.auth_admin_generate_recovery_code(uuid,uuid,text),api.auth_can_admin_recover(uuid,uuid),
  api.auth_redeem_admin_recovery_code(text,text,text),api.auth_reset_password(text,text,text)
  from public,schoolsafe_api,schoolsafe_worker;
grant execute on function api.auth_resolve_admin_recovery_target(uuid,uuid),
  api.auth_admin_generate_recovery_code(uuid,uuid,text),api.auth_can_admin_recover(uuid,uuid),
  api.auth_redeem_admin_recovery_code(text,text,text),api.auth_reset_password(text,text,text)
  to schoolsafe_auth;
commit;
