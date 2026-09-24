\set ON_ERROR_STOP on

-- SchoolSafe Auth v2 — unité 03 : credentials WebAuthn (passkeys).
-- Stocke uniquement les clés publiques et métadonnées nécessaires à la vérification.
-- La clé privée ne quitte jamais l'appareil de l'utilisateur.
-- Utilisé pour :
--   1. Authentification forte en session (enregistrement volontaire)
--   2. Récupération de compte via appareil de confiance (recovery-only)
-- Une assertion WebAuthn valide pour recovery ne crée PAS de session métier ;
-- elle produit une autorisation temporaire de reset (gérée par le service).

begin;
set local role schoolsafe_owner;

create table if not exists auth.webauthn_credentials (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  identity_id uuid not null references auth.identities (id),
  credential_id bytea not null unique,
  public_key bytea not null,
  sign_count bigint not null check (sign_count >= 0),
  transports text[] not null default '{}',
  friendly_name text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists webauthn_credentials_identity_idx
  on auth.webauthn_credentials (identity_id)
  where revoked_at is null;

alter table auth.webauthn_credentials enable row level security;
alter table auth.webauthn_credentials force row level security;

drop policy if exists webauthn_credentials_owner on auth.webauthn_credentials;
create policy webauthn_credentials_owner on auth.webauthn_credentials
  to schoolsafe_owner using (true) with check (true);

revoke all on auth.webauthn_credentials
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker;

-- Enregistre un nouveau credential WebAuthn pour une identité authentifiée.
-- Le serveur a déjà vérifié l'attestation/registration avant d'appeler cette fonction.
create or replace function api.auth_register_webauthn_credential(
  p_identity_id uuid,
  p_credential_id bytea,
  p_public_key bytea,
  p_sign_count bigint,
  p_transports text[],
  p_friendly_name text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_id uuid;
begin
  if p_credential_id is null or octet_length(p_credential_id) = 0 then
    raise check_violation using message = 'Credential ID is required';
  end if;
  if p_public_key is null or octet_length(p_public_key) = 0 then
    raise check_violation using message = 'Public key is required';
  end if;
  if p_sign_count is null or p_sign_count < 0 then
    raise check_violation using message = 'Valid sign count is required';
  end if;

  -- Vérifier que l'identité existe et est active
  if not exists (
    select 1 from auth.identities i
    where i.id = p_identity_id and i.status = 'active'
  ) then
    raise foreign_key_violation using message = 'Unknown or inactive identity';
  end if;

  insert into auth.webauthn_credentials (
    identity_id, credential_id, public_key, sign_count, transports, friendly_name
  ) values (
    p_identity_id, p_credential_id, p_public_key, p_sign_count,
    coalesce(p_transports, '{}'), p_friendly_name
  ) returning id into v_id;

  return v_id;
end
$schoolsafe$;

-- Révoque un credential appartenant à l'identité donnée.
create or replace function api.auth_revoke_webauthn_credential(
  p_identity_id uuid,
  p_credential_id bytea
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_updated integer;
begin
  update auth.webauthn_credentials
  set revoked_at = pg_catalog.clock_timestamp()
  where identity_id = p_identity_id
    and credential_id = p_credential_id
    and revoked_at is null;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end
$schoolsafe$;

-- Liste les credentials actifs d'une identité (pour l'UI de gestion).
create or replace function api.auth_list_webauthn_credentials(
  p_identity_id uuid
) returns table (
  credential_id bytea,
  friendly_name text,
  created_at timestamptz,
  last_used_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  return query
  select c.credential_id, c.friendly_name, c.created_at, c.last_used_at
  from auth.webauthn_credentials c
  where c.identity_id = p_identity_id
    and c.revoked_at is null
  order by c.created_at desc;
end
$schoolsafe$;

-- Met à jour le sign_count après une assertion réussie.
-- Retourne true si le credential existe et n'est pas révoqué.
create or replace function api.auth_update_webauthn_sign_count(
  p_credential_id bytea,
  p_new_sign_count bigint
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_updated integer;
begin
  if p_new_sign_count is null or p_new_sign_count < 0 then
    raise check_violation using message = 'Valid sign count is required';
  end if;

  update auth.webauthn_credentials
  set sign_count = p_new_sign_count,
      last_used_at = pg_catalog.clock_timestamp()
  where credential_id = p_credential_id
    and revoked_at is null;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end
$schoolsafe$;

-- Vérifie si une identité possède au moins un credential actif.
-- Utilisé pour déterminer si la méthode "webauthn" est disponible en recovery.
create or replace function api.auth_has_active_webauthn(
  p_identity_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select exists (
    select 1 from auth.webauthn_credentials c
    where c.identity_id = p_identity_id
      and c.revoked_at is null
  )
$schoolsafe$;

-- ACL : seul schoolsafe_auth peut appeler ces fonctions
grant execute on function api.auth_register_webauthn_credential(uuid, bytea, bytea, bigint, text[], text) to schoolsafe_auth;
grant execute on function api.auth_revoke_webauthn_credential(uuid, bytea) to schoolsafe_auth;
grant execute on function api.auth_list_webauthn_credentials(uuid) to schoolsafe_auth;
grant execute on function api.auth_update_webauthn_sign_count(bytea, bigint) to schoolsafe_auth;
grant execute on function api.auth_has_active_webauthn(uuid) to schoolsafe_auth;

commit;