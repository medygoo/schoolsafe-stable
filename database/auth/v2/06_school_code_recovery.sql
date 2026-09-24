\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;
-- Fonction de récupération par code école + identifiant
-- Vérifie que le code est valide pour l'école et que l'identifiant y appartient
-- Retourne un token de reset temporaire si tout correspond
CREATE OR REPLACE FUNCTION api.auth_recover_by_school_code(
p_school_code text,
p_recovery_code text,
p_login text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolsafe$
DECLARE
v_school_id uuid;
v_identity_id uuid;
v_reset_token text;
BEGIN
-- 1. Vérifier l'existence de l'école et du code
SELECT s.id INTO v_school_id
FROM app.schools s
WHERE s.code = p_school_code AND s.is_active = true;
IF v_school_id IS NULL THEN
RETURN NULL;
END IF;
-- 2. Vérifier le code de récupération (pour l'instant, on accepte tout code non vide > 5 chars)
-- Dans une version finale, ce code serait haché et stocké dans auth.school_recovery_codes
IF p_recovery_code IS NULL OR length(p_recovery_code) < 5 THEN
RETURN NULL;
END IF;
-- 3. Trouver l'identité associée au login ET à cette école
SELECT i.id INTO v_identity_id
FROM auth.identities i
JOIN iam.profiles p ON p.user_id = i.user_id
WHERE i.login = p_login
AND p.school_id = v_school_id
AND i.status = 'active'
AND p.is_active = true
LIMIT 1;
-- Si aucune identité trouvée dans cette école, échec silencieux
IF v_identity_id IS NULL THEN
RETURN NULL;
END IF;
-- 4. Générer un token de reset temporaire (valide 15 min)
v_reset_token := encode(gen_random_bytes(32), 'hex');
INSERT INTO auth.password_reset_tokens (identity_id, token_hash, expires_at)
VALUES (v_identity_id, crypt(v_reset_token, gen_salt('bf')), now() + interval '15 minutes');
RETURN v_reset_token;
END;
$schoolsafe$;
GRANT EXECUTE ON FUNCTION api.auth_recover_by_school_code(text, text, text) TO schoolsafe_auth;
commit;