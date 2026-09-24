\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;

-- Fonction de récupération de compte par identité parentale (HOTFIX V1-R1)
-- Vérifie : Nom Parent + Téléphone (normalisé) + Nom Enfant + Classe (active)
-- Insère une demande dans auth.recovery_requests avec le token_hash fourni par Node
-- Retourne true si succès, false sinon (message générique côté client)
CREATE OR REPLACE FUNCTION api.auth_recover_parent_account(
  p_parent_full_name text,
  p_phone_number text,
  p_child_full_name text,
  p_class_name text,
  p_token_hash text
) RETURNS boolean
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
  v_school_id uuid;
BEGIN
  -- 1. Normaliser les entrées texte
  v_normalized_parent := lower(regexp_replace(trim(p_parent_full_name), '\s+', ' ', 'g'));
  v_normalized_child := lower(regexp_replace(trim(p_child_full_name), '\s+', ' ', 'g'));
  v_normalized_class := lower(regexp_replace(trim(p_class_name), '\s+', ' ', 'g'));

  -- 2. Normaliser le téléphone via la fonction canonique SchoolSafe
  v_normalized_phone := auth.normalize_login(p_phone_number);

  -- 3. Rechercher la correspondance exacte dans les tables canoniques
  -- On joint guardian -> student -> enrollment (active) -> class -> profile (role parent) -> identity
  SELECT i.id, g.school_id INTO v_identity_id, v_school_id
  FROM app.student_guardians g
  JOIN iam.profiles p ON p.id = g.profile_id AND p.is_active = true
  JOIN iam.profile_roles pr ON pr.profile_id = p.id AND pr.is_active = true
  JOIN iam.roles r ON r.id = pr.role_id AND r.code = 'parent' AND r.is_active = true
  JOIN auth.identities i ON i.user_id = p.user_id AND i.status = 'active'
  JOIN app.students s ON s.id = g.student_id AND s.school_id = g.school_id AND s.is_active = true
  JOIN app.student_enrollments e ON e.student_id = s.id AND e.school_id = s.school_id AND e.status = 'active'
  JOIN app.classes c ON c.id = e.class_id AND c.school_id = s.school_id AND c.is_active = true
  WHERE g.is_active = true
    AND g.phone = v_normalized_phone
    AND lower(regexp_replace(trim(g.full_name), '\s+', ' ', 'g')) = v_normalized_parent
    AND lower(regexp_replace(trim(s.first_name || ' ' || COALESCE(s.middle_name || ' ', '') || s.last_name), '\s+', ' ', 'g')) = v_normalized_child
    AND lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) = v_normalized_class
  LIMIT 1;

  -- 4. Si aucune correspondance, retourner false sans révéler pourquoi
  IF v_identity_id IS NULL THEN
    RETURN false;
  END IF;

  -- 5. Insérer la demande de récupération dans la table canonique
  -- Le token_hash a été généré et hashé côté Node (generateSessionToken + hashSessionToken)
  INSERT INTO auth.recovery_requests (identity_id, token_hash, expires_at, used_at)
  VALUES (v_identity_id, p_token_hash, now() + interval '15 minutes', null);

  RETURN true;
END;
$schoolsafe$;

-- ACL : seul schoolsafe_auth peut appeler cette fonction
GRANT EXECUTE ON FUNCTION api.auth_recover_parent_account(text, text, text, text, text) TO schoolsafe_auth;

commit;