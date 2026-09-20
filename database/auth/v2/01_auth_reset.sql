\set ON_ERROR_STOP on
-- Recovery creation is atomic; only a SHA256 of an unpredictable token is stored.
begin;
set local role schoolsafe_owner;
create or replace function api.auth_create_recovery_request(p_login text,p_token_hash text)
returns table(recovery_id uuid,email text) language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare v_identity auth.identities%rowtype; v_request uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise check_violation using message='A SHA256 recovery token is required';
  end if;
  select i.* into v_identity from auth.identities i
  join iam.users u on u.id=i.user_id and u.is_active
  where (i.email::text=auth.normalize_login(p_login) or i.phone=auth.normalize_login(p_login))
    and i.status='active' and i.email is not null for update of i;
  if not found then return; end if;
  if (select count(*) from auth.recovery_requests r where r.identity_id=v_identity.id
      and r.created_at > clock_timestamp()-interval '15 minutes') >= 5 then return; end if;
  update auth.recovery_requests set used_at=clock_timestamp()
    where identity_id=v_identity.id and used_at is null;
  insert into auth.recovery_requests(identity_id,token_hash,expires_at)
    values(v_identity.id,p_token_hash,clock_timestamp()+interval '60 minutes') returning id into v_request;
  return query select v_request,v_identity.email::text;
end
$schoolsafe$;

create or replace function api.auth_reset_password(p_token_hash text,p_new_password_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $schoolsafe$
declare v_identity uuid; v_request uuid; v_changed integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  if p_new_password_hash is null or p_new_password_hash not like '$argon2id$v=19$%' then
    raise check_violation using message='An Argon2id password hash is required';
  end if;
  select r.identity_id into v_identity from auth.recovery_requests r where r.token_hash=p_token_hash;
  if not found then return false; end if;
  -- Same lock order as creation, including concurrent requests/resets.
  perform 1 from auth.identities i join iam.users u on u.id=i.user_id and u.is_active
    where i.id=v_identity and i.status='active' for update of i;
  if not found then return false; end if;
  select r.id into v_request from auth.recovery_requests r
    where r.identity_id=v_identity and r.token_hash=p_token_hash
      and r.used_at is null and r.expires_at>clock_timestamp() for update;
  if not found then return false; end if;
  update auth.credentials set password_hash=p_new_password_hash,must_change=false,changed_at=clock_timestamp()
    where identity_id=v_identity;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then return false; end if;
  update auth.recovery_requests set used_at=clock_timestamp() where identity_id=v_identity and used_at is null;
  update auth.sessions set revoked_at=clock_timestamp() where identity_id=v_identity and revoked_at is null;
  return true;
end
$schoolsafe$;
revoke all on function api.auth_create_recovery_request(text,text),api.auth_reset_password(text,text)
  from public,schoolsafe_api,schoolsafe_worker;
grant execute on function api.auth_create_recovery_request(text,text),api.auth_reset_password(text,text) to schoolsafe_auth;
-- The unsafe two-step v1 recovery API is never installed by the v2 plan.
do $schoolsafe$ begin
  if to_regprocedure('api.auth_create_recovery_request(text)') is not null then
    revoke execute on function api.auth_create_recovery_request(text) from public,schoolsafe_auth;
  end if;
  if to_regprocedure('api.auth_attach_recovery_token(uuid,text)') is not null then
    revoke execute on function api.auth_attach_recovery_token(uuid,text) from public,schoolsafe_auth;
  end if;
end $schoolsafe$;
commit;
