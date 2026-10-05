\set ON_ERROR_STOP on
-- Opens the existing auth.identities row, or inserts one, before api.auth_create_session.
-- Never writes auth.credentials. Called only once a Supabase profile is resolved
-- and must_change_password is already false.
begin;
set local role schoolsafe_owner;

create or replace function api.auth_supabase_session_identity(p_user_id uuid, p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_old text := coalesce(pg_catalog.current_setting('schoolsafe.preauth', true), '');
  v_email text;
  v_phone text;
  v_active boolean;
  v_provider text;
  v_must boolean;
  v_identity uuid;
begin
  if session_user <> 'schoolsafe_auth' then
    raise insufficient_privilege;
  end if;
  perform pg_catalog.set_config('schoolsafe.preauth', 'on', true);
  select u.email::text, u.phone, u.is_active, u.auth_provider, u.must_change_password
    into v_email, v_phone, v_active, v_provider, v_must
    from iam.users u
   where u.id = p_user_id;
  if not found
     or v_provider is distinct from 'supabase'
     or v_active is not true
     or v_must is not false then
    raise check_violation using message = 'IDENTITY_REFUSED';
  end if;
  v_email := nullif(pg_catalog.btrim(coalesce(v_email, '')), '');
  v_phone := nullif(pg_catalog.btrim(coalesce(v_phone, '')), '');
  if not exists (
    select 1
      from iam.profiles p
      join app.schools s on s.id = p.school_id
     where p.id = p_profile_id
       and p.user_id = p_user_id
       and p.is_active
       and p.account_status = 'active'
       and s.is_active
  ) then
    raise check_violation using message = 'IDENTITY_REFUSED';
  end if;

  select i.id into v_identity
    from auth.identities i
   where i.user_id = p_user_id;
  if v_identity is not null then
    if not exists (
      select 1 from auth.identities i
       where i.id = v_identity and i.status = 'active'
    ) then
      raise check_violation using message = 'IDENTITY_REFUSED';
    end if;
    perform pg_catalog.set_config('schoolsafe.preauth', v_old, true);
    return v_identity;
  end if;

  if v_email is null and v_phone is null then
    raise check_violation using message = 'IDENTITY_REFUSED';
  end if;
  if exists (
    select 1 from auth.identities i
     where (v_email is not null and i.email = v_email::auth.citext)
        or (v_phone is not null and i.phone = v_phone)
  ) then
    raise unique_violation using message = 'IDENTITY_CONFLICT';
  end if;

  v_identity := pg_catalog.gen_random_uuid();
  insert into auth.identities (id, user_id, email, phone, status)
  values (v_identity, p_user_id, v_email::auth.citext, v_phone, 'active');
  perform pg_catalog.set_config('schoolsafe.preauth', v_old, true);
  return v_identity;
exception
  when others then
    perform pg_catalog.set_config('schoolsafe.preauth', v_old, true);
    raise;
end
$fn$;

revoke all on function api.auth_supabase_session_identity(uuid, uuid)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
grant execute on function api.auth_supabase_session_identity(uuid, uuid) to schoolsafe_auth;

commit;
