\set ON_ERROR_STOP on

-- SchoolSafe Auth v3 — unité 59 : durcissement auth pour écoles inactives.
-- Une école PENDING (is_active=false) ne doit jamais pouvoir obtenir ou
-- conserver une session. Additif : CREATE OR REPLACE uniquement.
-- iam.context_is_valid() n'est PAS modifiée (provisioning interne requis).

begin;
set local role schoolsafe_owner;

create or replace function api.auth_resolve_identity(p_login text)
returns table (
  identity_id uuid,
  user_id uuid,
  password_hash text,
  status text,
  must_change boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_login text := auth.normalize_login(p_login);
begin
  if v_login = '' then
    return;
  end if;

  return query
  select i.id, i.user_id, c.password_hash, i.status, coalesce(c.must_change, false)
  from auth.identities i
  join iam.users u on u.id = i.user_id and u.is_active = true
  left join auth.credentials c on c.identity_id = i.id
  where (i.email::text = v_login or i.phone = v_login)
    and i.status = 'active'
    and exists (
      select 1
      from iam.profiles p
      join app.schools s on s.id = p.school_id and s.is_active = true
      where p.user_id = i.user_id and p.is_active = true
    )
  limit 1;
end
$schoolsafe$;

create or replace function api.auth_list_profiles(p_identity_id uuid)
returns table (profile_id uuid, school_id uuid, school_code text, school_name text, display_name text)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  perform pg_catalog.set_config('schoolsafe.preauth', 'on', true);
  return query
  select p.id, p.school_id, s.code, s.name, p.display_name
  from auth.identities i
  join iam.profiles p on p.user_id = i.user_id and p.is_active = true
  join app.schools s on s.id = p.school_id and s.is_active = true
  where i.id = p_identity_id
    and i.status = 'active'
  order by p.created_at;
end
$schoolsafe$;

create or replace function api.auth_create_session(
  p_identity_id uuid,
  p_profile_id uuid,
  p_token_hash text,
  p_ttl_seconds integer default 43200,
  p_ip inet default null,
  p_user_agent text default null
)
returns table (session_id uuid, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_identity auth.identities%rowtype;
  v_school_active boolean;
begin
  perform pg_catalog.set_config('schoolsafe.preauth', 'on', true);
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise check_violation using message = 'Invalid session token hash';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 300 or p_ttl_seconds > 604800 then
    raise check_violation using message = 'Invalid session TTL';
  end if;

  select * into v_identity from auth.identities i where i.id = p_identity_id;
  if not found then
    raise foreign_key_violation using message = 'Unknown identity';
  end if;
  if v_identity.status <> 'active' then
    raise insufficient_privilege using message = 'Identity is disabled';
  end if;

  -- Vérifier user actif
  if not exists (select 1 from iam.users u where u.id = v_identity.user_id and u.is_active = true) then
    raise insufficient_privilege using message = 'User account is inactive';
  end if;

  -- Le profil doit appartenir à l'utilisateur de l'identité, être actif,
  -- et l'école doit être active.
  select s.is_active into v_school_active
  from iam.profiles p
  join app.schools s on s.id = p.school_id
  where p.id = p_profile_id
    and p.user_id = v_identity.user_id
    and p.is_active = true;

  if v_school_active is null then
    raise insufficient_privilege using message = 'Profile does not belong to identity or is inactive';
  end if;
  if v_school_active is distinct from true then
    raise insufficient_privilege using message = 'School is not active';
  end if;

  return query
  insert into auth.sessions (identity_id, profile_id, token_hash, expires_at, ip, user_agent)
  values (
    p_identity_id,
    p_profile_id,
    p_token_hash,
    pg_catalog.now() + pg_catalog.make_interval(secs => p_ttl_seconds),
    p_ip,
    p_user_agent
  )
  returning sessions.id, sessions.expires_at;
end
$schoolsafe$;

create or replace function api.auth_resolve_session(p_token_hash text)
returns table (
  session_id uuid,
  identity_id uuid,
  user_id uuid,
  profile_id uuid,
  school_id uuid,
  must_change boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  perform pg_catalog.set_config('schoolsafe.preauth', 'on', true);
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return;
  end if;

  return query
  select s.id, i.id, i.user_id, p.id, p.school_id, coalesce(c.must_change, false)
  from auth.sessions s
  join auth.identities i on i.id = s.identity_id and i.status = 'active'
  join iam.users u on u.id = i.user_id and u.is_active = true
  join iam.profiles p on p.id = s.profile_id and p.is_active = true
  join app.schools sc on sc.id = p.school_id and sc.is_active = true
  left join auth.credentials c on c.identity_id = i.id
  where s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > pg_catalog.now();
end
$schoolsafe$;

commit;