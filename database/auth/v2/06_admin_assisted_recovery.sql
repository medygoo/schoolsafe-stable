\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;

-- Table des codes de récupération générés par les administrateurs principaux
CREATE TABLE IF NOT EXISTS auth.admin_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES auth.identities(id),
  school_id uuid NOT NULL,
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  generated_by_profile_id uuid NOT NULL REFERENCES iam.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_identity
  ON auth.admin_recovery_codes(identity_id)
  WHERE used_at IS NULL AND expires_at > now();

ALTER TABLE auth.admin_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.admin_recovery_codes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_recovery_codes_owner ON auth.admin_recovery_codes;
CREATE POLICY admin_recovery_codes_owner ON auth.admin_recovery_codes
  TO schoolsafe_owner USING (true) WITH CHECK (true);

REVOKE ALL ON auth.admin_recovery_codes
  FROM public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_auditor;

-- Fonction : Générer un code de récupération (appelée par Node après validation des rôles)
-- Node génère le code clair (10 chiffres), le hash, et passe le hash ici.
CREATE OR REPLACE FUNCTION api.auth_admin_generate_recovery_code(
  p_admin_profile_id uuid,
  p_target_identity_id uuid,
  p_code_hash text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolsafe$
DECLARE
  v_admin_school_id uuid;
  v_target_school_id uuid;
  v_admin_user_id uuid;
  v_target_user_id uuid;
BEGIN
  -- Valider le hash
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE exception 'Invalid code hash';
  END IF;

  -- Vérifier l'admin et son école
  SELECT p.school_id, p.user_id INTO v_admin_school_id, v_admin_user_id
  FROM iam.profiles p
  JOIN iam.profile_roles pr ON pr.profile_id = p.id AND pr.is_active = true
  JOIN iam.roles r ON r.id = pr.role_id AND r.code = 'admin' AND r.is_active = true
  WHERE p.id = p_admin_profile_id AND p.is_active = true;

  IF NOT FOUND THEN
    RAISE insufficient_privilege USING MESSAGE = 'Invalid or non-admin profile';
  END IF;

  -- Vérifier la cible et son école
  SELECT p.school_id, i.user_id INTO v_target_school_id, v_target_user_id
  FROM auth.identities i
  JOIN iam.profiles p ON p.user_id = i.user_id AND p.is_active = true
  WHERE i.id = p_target_identity_id AND i.status = 'active';

  IF NOT FOUND THEN
    RAISE foreign_key_violation USING MESSAGE = 'Unknown or inactive target identity';
  END IF;

  -- Interdire l'auto-reset
  IF v_admin_user_id = v_target_user_id THEN
    RAISE insufficient_privilege USING MESSAGE = 'Administrator cannot generate recovery code for themselves';
  END IF;

  -- Isolation par école
  IF v_admin_school_id IS DISTINCT FROM v_target_school_id THEN
    RAISE insufficient_privilege USING MESSAGE = 'Cross-school recovery not allowed';
  END IF;

  -- Révoquer les anciens codes non utilisés pour cette identité
  UPDATE auth.admin_recovery_codes
  SET used_at = now() -- Marquer comme utilisé/expiré pour les invalider
  WHERE identity_id = p_target_identity_id
  AND used_at IS NULL;

  -- Insérer le nouveau code (valide 60 minutes)
  INSERT INTO auth.admin_recovery_codes (identity_id, school_id, code_hash, generated_by_profile_id, expires_at)
  VALUES (p_target_identity_id, v_target_school_id, p_code_hash, p_admin_profile_id, now() + interval '60 minutes');

  RETURN true;
END;
$schoolsafe$;

-- Fonction : Consommer un code de récupération (appelée par Node avec login et code clair)
-- Retourne l'identity_id si succès, NULL sinon.
CREATE OR REPLACE FUNCTION api.auth_redeem_admin_recovery_code(
  p_login text,
  p_code_hash text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolsafe$
DECLARE
  v_identity_id uuid;
  v_normalized_login text;
  v_found_id uuid;
BEGIN
  v_normalized_login := auth.normalize_login(p_login);

  -- Trouver l'identité correspondant au login
  SELECT i.id INTO v_identity_id
  FROM auth.identities i
  WHERE (i.email = v_normalized_login OR i.phone = v_normalized_login)
  AND i.status = 'active'
  LIMIT 1;

  IF v_identity_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Vérifier le code et incrémenter le compteur d'échec si nécessaire
  UPDATE auth.admin_recovery_codes
  SET attempt_count = attempt_count + 1,
      used_at = CASE WHEN code_hash = p_code_hash THEN now() ELSE used_at END
  WHERE identity_id = v_identity_id
  AND used_at IS NULL
  AND expires_at > now()
  AND attempt_count < 5
  AND code_hash = p_code_hash
  RETURNING id INTO v_found_id;

  -- Si aucune ligne mise à jour, c'est que le code est invalide/expiré/trop de tentatives
  IF v_found_id IS NULL THEN
    -- Incrémenter le compteur même si le code est faux pour bloquer les brute-force
    UPDATE auth.admin_recovery_codes
    SET attempt_count = attempt_count + 1
    WHERE identity_id = v_identity_id
    AND used_at IS NULL
    AND expires_at > now();
    
    RETURN NULL;
  END IF;

  RETURN v_identity_id;
END;
$schoolsafe$;

GRANT EXECUTE ON FUNCTION api.auth_admin_generate_recovery_code(uuid, uuid, text) TO schoolsafe_auth;
GRANT EXECUTE ON FUNCTION api.auth_redeem_admin_recovery_code(text, text) TO schoolsafe_auth;

commit;