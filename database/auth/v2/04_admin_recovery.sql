\set ON_ERROR_STOP on

-- SchoolSafe Auth v2 — unité 04 : récupération assistée par administrateur principal.
-- L'admin peut générer un code temporaire pour un utilisateur de SON école uniquement.
-- L'utilisateur saisit ensuite identifiant + code pour obtenir une autorisation de reset.
-- L'admin ne voit jamais l'ancien ni le nouveau mot de passe.
-- Auto-reset interdit : un admin ne peut pas utiliser ce mécanisme sur lui-même.

begin;
set local role schoolsafe_owner;

create table if not exists auth.admin_recovery_codes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  identity_id uuid not null references auth.identities (id),
  school_id uuid not null,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  authorized_by_profile_id uuid not null references iam.profiles (id),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  used_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

create index if not exists admin_recovery_codes_identity_idx
  on auth.admin_recovery_codes (identity_id, expires_at)
  where used_at is null;

alter table auth.admin_recovery_codes enable row level security;
alter table auth.admin_recovery_codes force row level security;

drop policy if exists admin_recovery_codes_owner on auth.admin_recovery_codes;
create policy admin_recovery_codes_owner on auth.admin_recovery_codes
  to schoolsafe_owner using (true) with check (true);

revoke all on auth.admin_recovery_codes
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker;

-- Génère un code de récupération administrateur.
-- Vérifie : admin actif, target dans même école, pas d'auto-reset.
-- Révoque les codes précédents non utilisés pour cette identité.
-- Retourne le code en clair (à transmettre à l'utilisateur) ou NULL si refusé.
create or replace function api.auth_admin_generate_recovery_code(
  p_admin_profile_id uuid,
  p_target_identity_id uuid,
  p_code_hash text
) returns text
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_admin_school_id uuid;
  v_target_school_id uuid;
  v_admin_user_id uuid;
  v_target_user_id uuid;
  v_code text;
begin
  -- Valider le hash du code
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise check_violation using message = 'Valid SHA256 code hash required';
  end if;

  -- Récupérer l'admin et vérifier qu'il est actif
  select p.school_id, p.user_id into v_admin_school_id, v_admin_user_id
  from iam.profiles p
  where p.id = p_admin_profile_id and p.is_active = true;

  if not found then
    raise insufficient_privilege using message = 'Invalid or inactive administrator profile';
  end if;

  -- Récupérer l'identité cible et son école via son profil actif
  select p.school_id, i.user_id into v_target_school_id, v_target_user_id
  from auth.identities i
  join iam.profiles p on p.user_id = i.user_id and p.is_active = true
  where i.id = p_target_identity_id and i.status = 'active';

  if not found then
    raise foreign_key_violation using message = 'Unknown or inactive target identity';
  end if;

  -- Interdire l'auto-reset
  if v_admin_user_id = v_target_user_id then
    raise insufficient_privilege using message = 'Administrator cannot generate recovery code for themselves';
  end if;

  -- Isolation par école
  if v_admin_school_id is distinct from v_target_school_id then
    raise insufficient_privilege using message = 'Administrator can only recover users in their own school';
  end if;

  -- Révoquer les codes précédents non utilisés pour cette identité
  update auth.admin_recovery_codes
  set used_at = pg_catalog.clock_timestamp()
  where identity_id = p_target_identity_id
    and used_at is null;

  -- Insérer le nouveau code (15 min TTL, max 5 tentatives gérées côté service)
  insert into auth.admin_recovery_codes (
    identity_id, school_id, code_hash, authorized_by_profile_id, expires_at
  ) values (
    p_target_identity_id, v_target_school_id, p_code_hash, p_admin_profile_id,
    pg_catalog.clock_timestamp() + interval '15 minutes'
  );

  -- Le code clair n'est PAS stocké ; le serveur le retourne à l'appelant
  -- qui doit le transmettre à l'utilisateur. Ici on retourne un marqueur
  -- de succès ; le code clair est généré et retourné par le service TS.
  return 'CODE_GENERATED';
end
$schoolsafe$;

-- Valide un code administrateur et retourne l'identity_id si valide.
-- Incrémente attempt_count. Marque used_at si valide.
-- Retourne NULL si invalide, expiré, trop de tentatives ou déjà utilisé.
create or replace function api.auth_redeem_admin_recovery_code(
  p_login text,
  p_code_hash text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_identity_id uuid;
  v_code_record auth.admin_recovery_codes%rowtype;
  v_normalized_login text;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  v_normalized_login := auth.normalize_login(p_login);
  if v_normalized_login = '' then
    return null;
  end if;

  -- Trouver l'identité par login
  select i.id into v_identity_id
  from auth.identities i
  where (i.email::text = v_normalized_login or i.phone = v_normalized_login)
    and i.status = 'active';

  if v_identity_id is null then
    return null;
  end if;

  -- Trouver le code valide le plus récent pour cette identité
  select * into v_code_record
  from auth.admin_recovery_codes c
  where c.identity_id = v_identity_id
    and c.code_hash = p_code_hash
    and c.used_at is null
    and c.expires_at > pg_catalog.clock_timestamp()
  order by c.created_at desc
  limit 1
  for update;

  if not found then
    -- Incrémenter attempt_count sur le code le plus récent non utilisé/expiré
    -- pour le rate-limiting même en cas de mauvais code
    update auth.admin_recovery_codes
    set attempt_count = attempt_count + 1
    where identity_id = v_identity_id
      and used_at is null
      and expires_at > pg_catalog.clock_timestamp();
    return null;
  end if;

  -- Vérifier le nombre de tentatives (max 5)
  if v_code_record.attempt_count >= 5 then
    update auth.admin_recovery_codes
    set used_at = pg_catalog.clock_timestamp()
    where id = v_code_record.id;
    return null;
  end if;

  -- Marquer comme utilisé
  update auth.admin_recovery_codes
  set used_at = pg_catalog.clock_timestamp()
  where id = v_code_record.id;

  return v_identity_id;
end
$schoolsafe$;

-- Vérifie si un admin peut générer un code pour une identité donnée.
-- Utilisé par le frontend pour afficher/masquer l'option admin recovery.
create or replace function api.auth_can_admin_recover(
  p_admin_profile_id uuid,
  p_target_identity_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_admin_school_id uuid;
  v_target_school_id uuid;
  v_admin_user_id uuid;
  v_target_user_id uuid;
begin
  select p.school_id, p.user_id into v_admin_school_id, v_admin_user_id
  from iam.profiles p
  where p.id = p_admin_profile_id and p.is_active = true;

  if not found then return false; end if;

  select p.school_id, i.user_id into v_target_school_id, v_target_user_id
  from auth.identities i
  join iam.profiles p on p.user_id = i.user_id and p.is_active = true
  where i.id = p_target_identity_id and i.status = 'active';

  if not found then return false; end if;

  -- Pas d'auto-reset
  if v_admin_user_id = v_target_user_id then return false; end if;

  -- Même école
  return v_admin_school_id is not distinct from v_target_school_id;
end
$schoolsafe$;

-- ACL : seul schoolsafe_auth peut appeler ces fonctions
grant execute on function api.auth_admin_generate_recovery_code(uuid, uuid, text) to schoolsafe_auth;
grant execute on function api.auth_redeem_admin_recovery_code(text, text) to schoolsafe_auth;
grant execute on function api.auth_can_admin_recover(uuid, uuid) to schoolsafe_auth;

commit;