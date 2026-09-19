\set ON_ERROR_STOP on

-- SchoolSafe Auth v1 — unité 02 : surface API d'authentification.
-- Rôle dédié schoolsafe_auth : la fonction ne fabrique jamais une session sans
-- preuve, et schoolsafe_api (rôle métier générique) n'a AUCUN droit ici.
-- AUTH = identité · ACCESS_LAW = autorisation · fail-closed partout.

begin;

-- Rôle dédié minimal : créé par l'utilisateur de session (le rôle owner n'a
-- pas CREATEROLE — par conception), puis verrouillé avec les mêmes attributs
-- que les rôles applicatifs de la baseline.
do $schoolsafe$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'schoolsafe_auth') then
    create role schoolsafe_auth login;
  end if;
end
$schoolsafe$;

alter role schoolsafe_auth with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role schoolsafe_auth set search_path = pg_catalog;

-- CONNECT sur la base courante (nom dynamique : TEST et PROD diffèrent) —
-- accordé par l'utilisateur de session, jamais par le rôle owner.
do $schoolsafe$
begin
  execute pg_catalog.format(
    'grant connect on database %I to schoolsafe_auth',
    pg_catalog.current_database()
  );
end
$schoolsafe$;

set local role schoolsafe_owner;

-- Normalisation canonique UNIQUE du login (e-mail insensible à la casse ;
-- téléphone au format +243… — même logique que le frontend).
-- Utilisée par résolution, verrouillage et journalisation : impossible de
-- contourner le verrou par une variation de casse ou de format.
create or replace function auth.normalize_login(p_login text)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v text := pg_catalog.btrim(coalesce(p_login, ''));
  v_digits text;
begin
  if v = '' then
    return '';
  end if;

  if pg_catalog.strpos(v, '@') > 0 then
    return pg_catalog.lower(v);
  end if;

  v_digits := pg_catalog.regexp_replace(v, '\D', '', 'g');
  -- Ordre : préfixe international 00, indicatif 243, zéro national (RDC).
  if v_digits like '00%' then
    v_digits := pg_catalog.substr(v_digits, 3);
  end if;
  if v_digits like '243%' and pg_catalog.length(v_digits) > 9 then
    v_digits := pg_catalog.substr(v_digits, 4);
  end if;
  if v_digits like '0%' then
    v_digits := pg_catalog.substr(v_digits, 2);
  end if;
  return '+243' || v_digits;
end
$schoolsafe$;

-- Résolution pré-auth : trouve l'identité par e-mail OU téléphone normalisé.
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
  left join auth.credentials c on c.identity_id = i.id
  where i.email::text = v_login or i.phone = v_login
  limit 1;
end
$schoolsafe$;

-- Profils actifs de l'identité (choix d'école à la connexion).
-- Les tables auth sont FORCE RLS : sans policy propriétaire, même les
-- fonctions definer du pack ne peuvent rien lire (défaut réel découvert en
-- preuve PostgreSQL). Le rôle owner est l'autorité de migration : accès
-- complet. Les rôles applicatifs n'ont RIEN (revoke ci-dessous).
do $schoolsafe$
declare
  v_table regclass;
  v_name text;
begin
  foreach v_table in array array[
    'auth.identities'::regclass,
    'auth.credentials'::regclass,
    'auth.sessions'::regclass,
    'auth.login_attempts'::regclass,
    'auth.recovery_requests'::regclass
  ]
  loop
    v_name := pg_catalog.format('%s_owner_all', v_table::regclass::text);
    execute pg_catalog.format('drop policy if exists %I on %s', v_name, v_table);
    execute pg_catalog.format(
      'create policy %I on %s to schoolsafe_owner using (true) with check (true)',
      v_name,
      v_table
    );
  end loop;
end
$schoolsafe$;

-- Porte pré-contexte : les fonctions d'authentification lisent les profils
-- AVANT qu'aucun contexte tenant existe. Le GUC schoolsafe.preauth n'est posé
-- qu'à l'intérieur des fonctions definer de ce pack (exécutables par
-- schoolsafe_auth seul) — transaction-local, mort avec la requête.
do $schoolsafe$
begin
  execute pg_catalog.format('drop policy if exists %I on %s', 'profiles_preauth_read', 'iam.profiles');
end
$schoolsafe$;

create policy profiles_preauth_read on iam.profiles
  for select to schoolsafe_owner
  using (pg_catalog.current_setting('schoolsafe.preauth', true) = 'on');

create policy schools_preauth_read on app.schools
  for select to schoolsafe_owner
  using (pg_catalog.current_setting('schoolsafe.preauth', true) = 'on');

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
  join app.schools s on s.id = p.school_id
  where i.id = p_identity_id
  order by p.created_at;
end
$schoolsafe$;

-- Création de session : EXIGE le profil exact, validé comme appartenant à
-- l'utilisateur de l'identité, actif, et identité active. Fail-closed.
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

  -- Le profil doit appartenir à l'utilisateur de l'identité et être actif.
  if not exists (
    select 1
    from iam.profiles p
    where p.id = p_profile_id
      and p.user_id = v_identity.user_id
      and p.is_active = true
  ) then
    raise insufficient_privilege using message = 'Profile does not belong to identity or is inactive';
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

-- Résolution déterministe : la session connaît SON profil, donc SON école.
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
  join auth.identities i on i.id = s.identity_id
  join iam.profiles p on p.id = s.profile_id and p.is_active = true
  left join auth.credentials c on c.identity_id = i.id
  where s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > pg_catalog.now()
    and i.status = 'active';
end
$schoolsafe$;

-- Expiration glissante RÉELLE : passée la mi-vie, la session est prolongée.
create or replace function api.auth_touch_session(
  p_token_hash text,
  p_ttl_seconds integer default 43200
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_new_expiry timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return null;
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 300 or p_ttl_seconds > 604800 then
    return null;
  end if;

  update auth.sessions s
  set expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_ttl_seconds)
  where s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > pg_catalog.now()
    and s.expires_at < pg_catalog.now() + pg_catalog.make_interval(secs => p_ttl_seconds / 2)
  returning s.expires_at into v_new_expiry;

  return v_new_expiry;
end
$schoolsafe$;

create or replace function api.auth_revoke_session(p_token_hash text)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_updated integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  update auth.sessions
  set revoked_at = pg_catalog.now()
  where token_hash = p_token_hash and revoked_at is null;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end
$schoolsafe$;

create or replace function api.auth_record_attempt(p_login text, p_succeeded boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_login text := auth.normalize_login(p_login);
  v_failures integer;
begin
  if v_login = '' then
    return false;
  end if;

  insert into auth.login_attempts (login, succeeded) values (v_login, p_succeeded);

  select pg_catalog.count(*) into v_failures
  from auth.login_attempts a
  where a.login = v_login
    and a.succeeded = false
    and a.attempted_at > pg_catalog.now() - pg_catalog.make_interval(mins => 15);

  return v_failures < 5;
end
$schoolsafe$;

create or replace function api.auth_is_locked(p_login text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select pg_catalog.count(*) >= 5
  from auth.login_attempts a
  where a.login = auth.normalize_login(p_login)
    and a.succeeded = false
    and a.attempted_at > pg_catalog.now() - pg_catalog.make_interval(mins => 15)
$schoolsafe$;

create or replace function api.auth_set_password(
  p_identity_id uuid,
  p_password_hash text,
  p_clear_must_change boolean default true
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_updated integer;
begin
  if p_password_hash is null or not p_password_hash like '$argon2id$%' then
    raise check_violation using message = 'Password hash must be argon2id';
  end if;

  insert into auth.credentials (identity_id, password_hash, must_change, changed_at)
  values (p_identity_id, p_password_hash, not p_clear_must_change, pg_catalog.now())
  on conflict (identity_id) do update
  set password_hash = excluded.password_hash,
      must_change = not p_clear_must_change,
      changed_at = pg_catalog.now();
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end
$schoolsafe$;

-- ACL : le rôle métier générique n'a RIEN ici ; seul le rôle auth dédié passe.
revoke all on all tables in schema auth from schoolsafe_api;
revoke all on all tables in schema auth from schoolsafe_auth;
-- USAGE sur le schéma api est indispensable pour appeler les fonctions auth ;
-- il n'ouvre AUCUNE table (les tables restent refusées ci-dessus).
grant usage on schema api to schoolsafe_auth;
grant execute on function api.auth_resolve_identity(text) to schoolsafe_auth;
grant execute on function api.auth_list_profiles(uuid) to schoolsafe_auth;
grant execute on function api.auth_create_session(uuid, uuid, text, integer, inet, text) to schoolsafe_auth;
grant execute on function api.auth_resolve_session(text) to schoolsafe_auth;
grant execute on function api.auth_touch_session(text, integer) to schoolsafe_auth;
grant execute on function api.auth_revoke_session(text) to schoolsafe_auth;
grant execute on function api.auth_record_attempt(text, boolean) to schoolsafe_auth;
grant execute on function api.auth_is_locked(text) to schoolsafe_auth;
grant execute on function api.auth_set_password(uuid, text, boolean) to schoolsafe_auth;

commit;
