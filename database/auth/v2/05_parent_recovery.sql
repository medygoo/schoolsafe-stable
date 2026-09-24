\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;
-- Fonction de normalisation des noms pour comparaison sécurisée
CREATE OR REPLACE FUNCTION auth.normalize_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $schoolsafe$
SELECT lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
$schoolsafe$;
-- Fonction de récupération de compte par identité parentale
-- Vérifie : Nom Parent + Téléphone + Nom Enfant + Classe
-- Retourne un token de reset temporaire si tout correspond à la même école
CREATE OR REPLACE FUNCTION api.auth_recover_parent_account(
p_parent_full_name text,
p_phone_number text,
p_child_full_name text,
p_class_name text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolsafe$
DECLARE
v_normalized_parent text;
v_normalized_child text;
v_normalized_class text;
v_normalized_phone text;
v_identity_id uuid;
v_reset_token text;
BEGIN
-- 1. Normaliser les entrées
v_normalized_parent := auth.normalize_name(p_parent_full_name);
v_normalized_child := auth.normalize_name(p_child_full_name);
v_normalized_class := auth.normalize_name(p_class_name);
-- Normaliser le téléphone via la logique existante si possible, sinon simple clean
-- Pour l'instant on utilise une normalisation basique RDC
v_normalized_phone := regexp_replace(p_phone_number, '[^0-9+]', '', 'g');
IF v_normalized_phone LIKE '0%' THEN
v_normalized_phone := '+243' || substring(v_normalized_phone from 2);
ELSIF v_normalized_phone NOT LIKE '+%' THEN
v_normalized_phone := '+243' || v_normalized_phone;
END IF;
-- 2. Rechercher la correspondance exacte dans les tables canoniques
-- On joint guardian -> student -> class -> profile -> identity
SELECT i.id INTO v_identity_id
FROM app.student_guardians g
JOIN app.students s ON s.id = g.student_id AND s.school_id = g.school_id
JOIN app.classes c ON c.id = s.class_id AND c.school_id = g.school_id
JOIN iam.profiles p ON p.id = g.profile_id AND p.school_id = g.school_id
JOIN auth.identities i ON i.user_id = p.user_id
WHERE g.is_active = true
AND p.is_active = true
AND i.status = 'active'
AND auth.normalize_name(g.full_name) = v_normalized_parent
AND g.phone = v_normalized_phone
AND auth.normalize_name(s.first_name || ' ' || COALESCE(s.middle_name || ' ', '') || s.last_name) = v_normalized_child
AND auth.normalize_name(c.name) = v_normalized_class
LIMIT 1;
-- 3. Si aucune correspondance, retourner NULL sans révéler pourquoi
IF v_identity_id IS NULL THEN
RETURN NULL;
END IF;
-- 4. Générer un token de reset temporaire (valide 15 min)
-- On réutilise la table auth.password_reset_tokens ou on en crée un nouveau
-- Pour simplifier, on génère un token aléatoire et on l'insère
v_reset_token := encode(gen_random_bytes(32), 'hex');
INSERT INTO auth.password_reset_tokens (identity_id, token_hash, expires_at)
VALUES (v_identity_id, crypt(v_reset_token, gen_salt('bf')), now() + interval '15 minutes');
RETURN v_reset_token;
END;
$schoolsafe$;
-- ACL : seul schoolsafe_auth peut appeler cette fonction
GRANT EXECUTE ON FUNCTION api.auth_recover_parent_account(text, text, text, text) TO schoolsafe_auth;
commit;