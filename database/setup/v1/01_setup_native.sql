\set ON_ERROR_STOP on

-- SchoolSafe Set up v1 — fonctions RPC de création d'école et d'admin.
-- S'applique APRÈS la baseline v1 (tables app.schools, app.academic_years,
-- app.school_cycles, app.school_contacts, iam.*, auth.*).
-- Ces fonctions sont SECURITY DEFINER : l'appelant (schoolsafe_api) n'a pas
-- besoin de droits directs sur les tables.

begin;
set local role schoolsafe_owner;

-- Crée l'école, l'année scolaire, les cycles et les contacts en une seule
-- transaction. Retourne l'id de l'école et l'id de l'année scolaire.

create or replace function api.setup_create_school(
  p_code text,
  p_name text,
  p_name_en text default null,
  p_legal_name text default null,
  p_school_type text default 'Privée agréée',
  p_approval_code text default null,
  p_primary_color text default '#071a3d',
  p_accent_color text default '#e9a515',
  p_document_footer text default null,
  p_logo_data text default null,
  p_academic_year_label text default null,
  p_academic_year_starts_on date default null,
  p_academic_year_ends_on date default null,
  p_academic_year_periods text default 'Trimestres',
  p_cycles jsonb default '[]'::jsonb,
  p_contact_country text default 'République démocratique du Congo',
  p_contact_province text default 'Kinshasa',
  p_contact_city text default 'Kinshasa',
  p_contact_address text default null,
  p_contact_email text default null,
  p_contact_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid;
  v_academic_year_id uuid;
  v_result jsonb;
  v_cycle jsonb;
begin
  -- 1. Créer l'école
  insert into app.schools (code, name, name_en, legal_name, school_type, approval_code,
    primary_color, accent_color, document_footer, logo_path, setup_completed_at)
  values (p_code, p_name, p_name_en, p_legal_name, p_school_type, p_approval_code,
    p_primary_color, p_accent_color, p_document_footer, p_logo_data, pg_catalog.now())
  returning id into v_school_id;

  -- 2. Créer les paramètres par défaut de l'école
  insert into app.school_settings (school_id) values (v_school_id);

  -- 3. Créer l'année scolaire
  insert into app.academic_years (school_id, label, starts_on, ends_on, periods, is_active)
  values (v_school_id, p_academic_year_label, p_academic_year_starts_on, p_academic_year_ends_on,
    p_academic_year_periods, true)
  returning id into v_academic_year_id;

  -- 4. Créer les cycles
  for v_cycle in select * from pg_catalog.jsonb_array_elements(p_cycles)
  loop
    insert into app.school_cycles (school_id, cycle_key, cycle_name, is_active)
    values (v_school_id, v_cycle->>'key', v_cycle->>'name', true);
  end loop;

  -- 5. Créer les contacts
  insert into app.school_contacts (school_id, country, province, city, address, email, phone)
  values (v_school_id, p_contact_country, p_contact_province, p_contact_city,
    p_contact_address, p_contact_email, p_contact_phone);

  v_result := pg_catalog.jsonb_build_object(
    'school_id', v_school_id,
    'academic_year_id', v_academic_year_id
  );
  return v_result;
end
$schoolsafe$;

grant execute on function api.setup_create_school(
  text, text, text, text, text, text, text, text, text, text,
  text, date, date, text, jsonb, text, text, text, text, text, text
) to schoolsafe_api;

-- Crée l'utilisateur admin, son identité, son profil et assigne le rôle admin.
-- Le mot de passe doit être déjà hashé (argon2) côté serveur.

create or replace function api.setup_create_admin(
  p_school_id uuid,
  p_email text,
  p_password_hash text,
  p_first_name text,
  p_last_name text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_user_id uuid;
  v_profile_id uuid;
  v_role_id uuid;
  v_result jsonb;
begin
  -- 1. Créer l'utilisateur IAM
  insert into iam.users (email, phone)
  values (p_email, p_phone)
  returning id into v_user_id;

  -- 2. Créer l'identité auth
  insert into auth.identities (user_id, email, phone)
  values (v_user_id, p_email, p_phone);

  -- 3. Créer les credentials (mot de passe hashé)
  insert into auth.credentials (identity_id, password_hash)
  values (
    (select id from auth.identities where user_id = v_user_id),
    p_password_hash
  );

  -- 4. Créer le profil admin
  insert into iam.profiles (user_id, school_id, display_name, first_name, last_name, email, phone)
  values (v_user_id, p_school_id, p_first_name || ' ' || p_last_name, p_first_name, p_last_name, p_email, p_phone)
  returning id into v_profile_id;

  -- 5. Assigner le rôle "Super Admin" (premier rôle système de l'école)
  insert into iam.profile_roles (profile_id, role_id)
  values (v_profile_id, (
    select id from iam.roles where school_id = p_school_id and code = 'super_admin' limit 1
  ));

  v_result := pg_catalog.jsonb_build_object(
    'user_id', v_user_id,
    'profile_id', v_profile_id
  );
  return v_result;
end
$schoolsafe$;

grant execute on function api.setup_create_admin(uuid, text, text, text, text, text) to schoolsafe_api;

commit;