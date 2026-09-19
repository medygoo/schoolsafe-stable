\set ON_ERROR_STOP on

-- SchoolSafe Auth v1 — unité 03 : réinitialisation du mot de passe.
-- Utilise la table auth.recovery_requests (unité 01).
-- Chaîne : forgot → token de réinitialisation (email) → reset (nouveau mdp).
-- Le token est haché côté serveur : la base ne conserve jamais le token clair.
-- La durée de validité est 60 minutes ; un second appel annule le précédent.

begin;
set local role schoolsafe_owner;

-- Crée un token de réinitialisation pour l'identité correspondant au login.
-- Ancien token non utilisé révoqué avant d'en créer un nouveau.
-- Retourne l'identity_id si trouvée (pour que le serveur sache quel email
-- contacter) ou NULL si le login est inconnu.

create or replace function api.auth_create_recovery_request(p_login text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_identity_id uuid;
  v_req_id uuid;
begin
  select i.id into v_identity_id
  from auth.identities i
  where i.email = auth.normalize_login(p_login)::auth.citext
    and i.status = 'active';

  if not found then
    return null;
  end if;

  -- Révoque toute demande non utilisée précédente pour cette identité
  update auth.recovery_requests
  set used_at = pg_catalog.clock_timestamp()
  where identity_id = v_identity_id
    and used_at is null
    and expires_at > pg_catalog.clock_timestamp();

  insert into auth.recovery_requests (identity_id, token_hash, expires_at)
  values (v_identity_id, 'pending', pg_catalog.clock_timestamp() + interval '60 minutes')
  returning id into v_req_id;

  return v_identity_id;
end
$schoolsafe$;

grant execute on function api.auth_create_recovery_request(text) to schoolsafe_auth;

-- Associe le token à la demande (appelé par le serveur après avoir hashé le token).
-- Retourne true si la mise à jour a réussi.

create or replace function api.auth_attach_recovery_token(p_recovery_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  update auth.recovery_requests
  set token_hash = p_token_hash
  where id = p_recovery_id
    and used_at is null
    and expires_at > pg_catalog.clock_timestamp();

  return found;
end
$schoolsafe$;

grant execute on function api.auth_attach_recovery_token(uuid, text) to schoolsafe_auth;

-- Réinitialise le mot de passe si le token est valide et non expiré.
-- Consomme le token (used_at). Met à jour password_hash dans auth.credentials.
-- Retourne true si le mot de passe a été changé.

create or replace function api.auth_reset_password(p_token_hash text, p_new_password_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_identity_id uuid;
begin
  select identity_id into v_identity_id
  from auth.recovery_requests
  where token_hash = p_token_hash
    and used_at is null
    and expires_at > pg_catalog.clock_timestamp()
  for update;

  if not found then
    return false;
  end if;

  -- Marque le token comme utilisé
  update auth.recovery_requests
  set used_at = pg_catalog.clock_timestamp()
  where token_hash = p_token_hash;

  -- Met à jour le mot de passe
  update auth.credentials
  set password_hash = p_new_password_hash,
      changed_at = pg_catalog.now()
  where identity_id = v_identity_id;

  return true;
end
$schoolsafe$;

grant execute on function api.auth_reset_password(text, text) to schoolsafe_auth;

commit;