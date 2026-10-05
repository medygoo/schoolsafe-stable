\set ON_ERROR_STOP on
-- Bridge a verified Supabase principal to iam.users. No school is created.
begin;
set local role schoolsafe_owner;

create function api.auth_link_supabase_principal(p_subject uuid, p_email text, p_phone text)
returns table(user_id uuid, created boolean, profile_id uuid, school_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $fn$
declare
  v_old text := coalesce(pg_catalog.current_setting('schoolsafe.preauth', true), '');
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(pg_catalog.btrim(coalesce(p_phone, '')), '');
  v_user uuid;
  v_created boolean := false;
begin
  if session_user <> 'schoolsafe_auth' then
    raise insufficient_privilege;
  end if;
  if p_subject is null
     or v_email is null
     or pg_catalog.length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise check_violation;
  end if;
  if v_phone is not null then
    v_phone := nullif(auth.normalize_login(v_phone), '');
    if v_phone is null or v_phone !~ '^\+243[0-9]{9}$' then
      raise check_violation;
    end if;
  end if;

  perform pg_catalog.set_config('schoolsafe.preauth', 'on', true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supabase-principal:' || p_subject::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supabase-principal-email:' || v_email, 0));
  if v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supabase-principal-phone:' || v_phone, 0));
  end if;

  select u.id into v_user
    from iam.users u
   where u.auth_provider = 'supabase'
     and u.external_subject = p_subject::text;

  if v_user is null then
    if exists (
      select 1
        from iam.users u
       where (lower(u.email) = v_email)
          or (v_phone is not null and u.phone = v_phone)
    ) then
      raise unique_violation using message = 'IDENTITY_CONFLICT';
    end if;
    v_user := pg_catalog.gen_random_uuid();
    v_created := true;
    insert into iam.users (id, auth_provider, external_subject, email, phone, is_active)
    values (v_user, 'supabase', p_subject::text, v_email, v_phone, true);
  end if;

  return query
    select v_user, v_created, p.id, p.school_id
      from iam.profiles p
     where p.user_id = v_user
       and p.is_active
       and p.account_status = 'active';
  if not found then
    return query select v_user, v_created, null::uuid, null::uuid;
  end if;

  perform pg_catalog.set_config('schoolsafe.preauth', v_old, true);
exception
  when others then
    perform pg_catalog.set_config('schoolsafe.preauth', v_old, true);
    raise;
end
$fn$;

revoke all on function api.auth_link_supabase_principal(uuid, text, text)
  from public, schoolsafe_api, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
grant execute on function api.auth_link_supabase_principal(uuid, text, text) to schoolsafe_auth;

commit;
