\set ON_ERROR_STOP on

-- SchoolSafe Auth v2 — unité 02 : vérification des identifiants email/téléphone.
-- Ajoute les colonnes de vérification et les fonctions API pour valider
-- un email ou un téléphone avant d'autoriser la récupération sécurisée.
-- Les tokens de vérification suivent le même modèle que recovery_requests :
-- hash SHA-256 en base, expiration, usage unique.

begin;
set local role schoolsafe_owner;

-- Colonnes de vérification sur auth.identities
alter table auth.identities add column if not exists email_verified_at timestamptz;
alter table auth.identities add column if not exists phone_verified_at timestamptz;

-- Table des tokens de vérification (email et phone)
create table if not exists auth.verification_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  identity_id uuid not null references auth.identities (id),
  channel text not null check (channel in ('email', 'phone')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table auth.verification_requests enable row level security;
alter table auth.verification_requests force row level security;

drop policy if exists verification_requests_owner on auth.verification_requests;
create policy verification_requests_owner on auth.verification_requests
  to schoolsafe_owner using (true) with check (true);

revoke all on auth.verification_requests from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker;

-- Crée une demande de vérification email.
-- Révoque toute demande précédente non utilisée pour cette identité.
-- Retourne l'identity_id et l'email si trouvés, sinon rien.
create or replace function api.auth_create_email_verification(
  p_identity_id uuid,
  p_token_hash text
) returns table (identity_id uuid, email text)
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_identity auth.identities%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise check_violation using message = 'A SHA256 verification token is required';
  end if;

  select * into v_identity from auth.identities i
  where i.id = p_identity_id and i.status = 'active' and i.email is not null
  for update of i;

  if not found then return; end if;

  -- Rate limit: max 5 demandes non utilisées dans les 15 dernières minutes
  if (select count(*) from auth.verification_requests r
      where r.identity_id = v_identity.id
        and r.channel = 'email'
        and r.created_at > pg_catalog.clock_timestamp() - interval '15 minutes') >= 5 then
    return;
  end if;

  -- Révoquer les anciennes demandes non utilisées
  update auth.verification_requests
  set used_at = pg_catalog.clock_timestamp()
  where identity_id = v_identity.id
    and channel = 'email'
    and used_at is null;

  insert into auth.verification_requests (identity_id, channel, token_hash, expires_at)
  values (v_identity.id, 'email', p_token_hash, pg_catalog.clock_timestamp() + interval '60 minutes')
  returning id;

  return query select v_identity.id, v_identity.email::text;
end
$schoolsafe$;

-- Vérifie un token email et pose email_verified_at.
-- Consomme le token (used_at). Retourne true si succès.
create or replace function api.auth_verify_email(
  p_token_hash text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_identity_id uuid;
  v_request_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;

  select r.identity_id, r.id into v_identity_id, v_request_id
  from auth.verification_requests r
  join auth.identities i on i.id = r.identity_id and i.status = 'active'
  where r.token_hash = p_token_hash
    and r.channel = 'email'
    and r.used_at is null
    and r.expires_at > pg_catalog.clock_timestamp()
  for update of r;

  if not found then return false; end if;

  update auth.verification_requests set used_at = pg_catalog.clock_timestamp()
  where id = v_request_id;

  update auth.identities set email_verified_at = pg_catalog.clock_timestamp()
  where id = v_identity_id and email_verified_at is null;

  return true;
end
$schoolsafe$;

-- Crée une demande de vérification téléphone.
-- Même logique que email mais canal 'phone'.
create or replace function api.auth_create_phone_verification(
  p_identity_id uuid,
  p_token_hash text
) returns table (identity_id uuid, phone text)
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_identity auth.identities%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise check_violation using message = 'A SHA256 verification token is required';
  end if;

  select * into v_identity from auth.identities i
  where i.id = p_identity_id and i.status = 'active' and i.phone is not null
  for update of i;

  if not found then return; end if;

  if (select count(*) from auth.verification_requests r
      where r.identity_id = v_identity.id
        and r.channel = 'phone'
        and r.created_at > pg_catalog.clock_timestamp() - interval '15 minutes') >= 5 then
    return;
  end if;

  update auth.verification_requests
  set used_at = pg_catalog.clock_timestamp()
  where identity_id = v_identity.id
    and channel = 'phone'
    and used_at is null;

  insert into auth.verification_requests (identity_id, channel, token_hash, expires_at)
  values (v_identity.id, 'phone', p_token_hash, pg_catalog.clock_timestamp() + interval '10 minutes')
  returning id;

  return query select v_identity.id, v_identity.phone;
end
$schoolsafe$;

-- Vérifie un token phone et pose phone_verified_at.
create or replace function api.auth_verify_phone(
  p_token_hash text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_identity_id uuid;
  v_request_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;

  select r.identity_id, r.id into v_identity_id, v_request_id
  from auth.verification_requests r
  join auth.identities i on i.id = r.identity_id and i.status = 'active'
  where r.token_hash = p_token_hash
    and r.channel = 'phone'
    and r.used_at is null
    and r.expires_at > pg_catalog.clock_timestamp()
  for update of r;

  if not found then return false; end if;

  update auth.verification_requests set used_at = pg_catalog.clock_timestamp()
  where id = v_request_id;

  update auth.identities set phone_verified_at = pg_catalog.clock_timestamp()
  where id = v_identity_id and phone_verified_at is null;

  return true;
end
$schoolsafe$;

-- ACL : seul schoolsafe_auth peut appeler ces fonctions
grant execute on function api.auth_create_email_verification(uuid, text) to schoolsafe_auth;
grant execute on function api.auth_verify_email(text) to schoolsafe_auth;
grant execute on function api.auth_create_phone_verification(uuid, text) to schoolsafe_auth;
grant execute on function api.auth_verify_phone(text) to schoolsafe_auth;

commit;