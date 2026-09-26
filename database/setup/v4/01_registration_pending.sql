\set ON_ERROR_STOP on

-- SchoolSafe Setup v4 — unité 60 : fondation d'inscription PENDING.
-- Table auth.school_registration_requests + RPC api.school_registration_prepare.
-- L'école est créée complète mais inactive ; aucun login possible.

begin;
set local role schoolsafe_owner;

-- ─── Table de demande d'inscription ────────────────────────────────
create table auth.school_registration_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null unique references app.schools(id),
  user_id uuid not null references iam.users(id),
  profile_id uuid not null references iam.profiles(id),
  identity_id uuid not null references auth.identities(id),
  academic_year_id uuid not null references app.academic_years(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default pg_catalog.now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table auth.school_registration_requests enable row level security;
alter table auth.school_registration_requests force row level security;

do $schoolsafe$
begin
  execute pg_catalog.format('drop policy if exists %I on %s', 'school_registration_requests_owner_all', 'auth.school_registration_requests');
  execute pg_catalog.format(
    'create policy %I on %s to schoolsafe_owner using (true) with check (true)',
    'school_registration_requests_owner_all',
    'auth.school_registration_requests'
  );
end
$schoolsafe$;

revoke all on auth.school_registration_requests from public;
revoke all on auth.school_registration_requests from schoolsafe_api;
revoke all on auth.school_registration_requests from schoolsafe_auth;
revoke all on auth.school_registration_requests from schoolsafe_worker;
revoke all on auth.school_registration_requests from schoolsafe_migrator;
revoke all on auth.school_registration_requests from schoolsafe_auditor;

-- ─── RPC de préparation atomique ──────────────────────────────────
create or replace function api.school_registration_prepare(
  p_payload jsonb,
  p_password_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_school_id uuid := pg_catalog.gen_random_uuid();
  v_academic_year_id uuid := pg_catalog.gen_random_uuid();
  v_user_id uuid := pg_catalog.gen_random_uuid();
  v_profile_id uuid := pg_catalog.gen_random_uuid();
  v_identity_id uuid := pg_catalog.gen_random_uuid();
  v_admin_role_id uuid;
  v_cycle text;
  v_cycle_names jsonb := '{"nursery":"Maternelle","primary":"Primaire","secondary":"Secondaire"}'::jsonb;
begin
  -- 1. Valider le payload
  if p_payload is null then
    raise check_violation using message = 'Payload is required';
  end if;
  if p_password_hash is null or p_password_hash !~ '^\$argon2id\$' then
    raise check_violation using message = 'Valid Argon2id password hash is required';
  end if;
  if p_payload->>'identity' is null then
    raise check_violation using message = 'identity block is required';
  end if;
  if p_payload->'identity'->>'name_fr' is null or pg_catalog.btrim(p_payload->'identity'->>'name_fr') = '' then
    raise check_violation using message = 'School name_fr is required';
  end if;
  if not (p_payload ? 'cycles') or jsonb_array_length(p_payload->'cycles') < 1 then
    raise check_violation using message = 'At least one cycle is required';
  end if;
  if p_payload->>'academic_year' is null then
    raise check_violation using message = 'academic_year block is required';
  end if;
  if p_payload->'academic_year'->>'label' is null
     or p_payload->'academic_year'->>'starts_on' is null
     or p_payload->'academic_year'->>'ends_on' is null
     or p_payload->'academic_year'->>'periods' is null then
    raise check_violation using message = 'Complete academic_year is required';
  end if;
  if p_payload->>'admin' is null then
    raise check_violation using message = 'admin block is required';
  end if;
  if p_payload->'admin'->>'email' is null
     or p_payload->'admin'->>'first_name' is null
     or p_payload->'admin'->>'last_name' is null then
    raise check_violation using message = 'Admin email, first_name and last_name are required';
  end if;

  -- 3. Créer app.schools (inactive, setup_completed_at NULL)
  insert into app.schools (
    id, code, name, name_en, legal_name, school_type, approval_code,
    primary_color, accent_color, document_footer, logo_path,
    is_active, setup_completed_at
  ) values (
    v_school_id,
    'PENDING-' || pg_catalog.left(pg_catalog.md5(v_request_id::text), 8),
    pg_catalog.btrim(p_payload->'identity'->>'name_fr'),
    p_payload->'identity'->>'name_en',
    p_payload->'identity'->>'legal_name',
    coalesce(p_payload->'identity'->>'school_type', 'Privée agréée'),
    p_payload->'identity'->>'approval_code',
    coalesce(p_payload->'brand'->>'primary_color', '#071a3d'),
    coalesce(p_payload->'brand'->>'accent_color', '#e9a515'),
    p_payload->'brand'->>'document_footer',
    p_payload->'brand'->>'logo_path',
    false,
    null
  );

  -- 4. Créer iam.users temporairement actif pour provisioning
  insert into iam.users (id, auth_provider, external_subject, email, phone, is_active)
  values (
    v_user_id, 'local', p_payload->'admin'->>'email',
    p_payload->'admin'->>'email',
    p_payload->'admin'->>'phone',
    true
  );

  -- 5. Créer iam.profiles temporairement actif pour provisioning
  insert into iam.profiles (
    id, user_id, school_id, display_name, first_name, last_name, email, phone, is_active
  ) values (
    v_profile_id, v_user_id, v_school_id,
    pg_catalog.btrim(coalesce(p_payload->'admin'->>'first_name','') || ' ' || coalesce(p_payload->'admin'->>'last_name','')),
    p_payload->'admin'->>'first_name',
    p_payload->'admin'->>'last_name',
    p_payload->'admin'->>'email',
    p_payload->'admin'->>'phone',
    true
  );

  -- 6. Poser le contexte avec request_id
  perform api.set_request_context(v_user_id, v_profile_id, v_school_id, v_request_id);

  -- 7. Provisionner les rôles canoniques (réutilise la logique existante)
  perform iam.provision_school_roles(v_school_id, v_profile_id);

  -- 8-9. Trouver le rôle admin et l'assigner au profil
  select r.id into v_admin_role_id
  from iam.roles r
  where r.school_id = v_school_id and r.code = 'admin' and r.is_active;
  if v_admin_role_id is null then
    raise check_violation using message = 'Active admin role template required';
  end if;
  insert into iam.profile_roles (school_id, profile_id, role_id)
  values (v_school_id, v_profile_id, v_admin_role_id);

  -- 10. Vérifier permission roles.manage
  perform iam.require_access('roles.manage');

  -- 11. Créer auth.identities (status active temporairement pour credentials)
  insert into auth.identities (id, user_id, email, phone, status)
  values (
    v_identity_id, v_user_id,
    p_payload->'admin'->>'email',
    p_payload->'admin'->>'phone',
    'active'
  );

  -- 12. Créer auth.credentials avec le hash Argon2id fourni
  insert into auth.credentials (identity_id, password_hash)
  values (v_identity_id, p_password_hash);

  -- 13. Créer app.school_settings
  insert into app.school_settings (school_id)
  values (v_school_id);

  -- 14. Créer app.academic_years
  insert into app.academic_years (
    id, school_id, label, starts_on, ends_on, periods, is_active
  ) values (
    v_academic_year_id, v_school_id,
    p_payload->'academic_year'->>'label',
    (p_payload->'academic_year'->>'starts_on')::date,
    (p_payload->'academic_year'->>'ends_on')::date,
    p_payload->'academic_year'->>'periods',
    false
  );

  -- 15. Créer tous les cycles demandés
  for v_cycle in select jsonb_array_elements_text(p_payload->'cycles') loop
    insert into app.school_cycles (school_id, cycle_key, cycle_name)
    values (
      v_school_id, v_cycle,
      coalesce(v_cycle_names->>v_cycle, v_cycle)
    );
  end loop;

  -- 16. Créer app.school_contacts avec TOUS les champs du formulaire
  insert into app.school_contacts (
    school_id, country, province, city, address,
    email, phone, website_url, website_mode,
    public_news, public_gallery, public_honors
  ) values (
    v_school_id,
    coalesce(p_payload->'contact'->>'country', 'République démocratique du Congo'),
    coalesce(p_payload->'contact'->>'province', 'Kinshasa'),
    coalesce(p_payload->'contact'->>'city', 'Kinshasa'),
    p_payload->'contact'->>'address',
    p_payload->'contact'->>'email',
    p_payload->'contact'->>'phone',
    nullif(p_payload->'contact'->>'website_url', ''),
    coalesce(p_payload->'contact'->>'website_mode', 'Créer un nouveau site SchoolSafe'),
    coalesce(p_payload->'contact'->>'public_news', 'Après validation'),
    coalesce(p_payload->'contact'->>'public_gallery', 'Après validation et consentement'),
    coalesce(p_payload->'contact'->>'public_honors', 'Après validation')
  );

  -- 18. Créer la demande d'inscription PENDING
  insert into auth.school_registration_requests (
    id, school_id, user_id, profile_id, identity_id, academic_year_id, status
  ) values (
    v_request_id, v_school_id, v_user_id, v_profile_id, v_identity_id, v_academic_year_id, 'pending'
  );

  -- 19. Écrire l'audit sans mot de passe ni secret
  perform audit.write_event(
    'school.registration.pending',
    'school',
    v_school_id,
    jsonb_build_object(
      'request_id', v_request_id,
      'admin_email', p_payload->'admin'->>'email',
      'cycles', p_payload->'cycles',
      'academic_year_label', p_payload->'academic_year'->>'label'
    )
  );

  -- 20. Désactiver user, profile et identity APRÈS tout le provisioning
  update iam.users set is_active = false where id = v_user_id;
  update iam.profiles set is_active = false where id = v_profile_id;
  update auth.identities set status = 'disabled' where id = v_identity_id;

  -- 21-22. NE PAS activer app.schools, NE PAS renseigner setup_completed_at

  -- 23. Retourner uniquement request_id + status
  return jsonb_build_object('request_id', v_request_id::text, 'status', 'pending');
end
$schoolsafe$;

-- ACL : seul schoolsafe_auth peut exécuter le RPC
revoke all on function api.school_registration_prepare(jsonb,text) from public;
revoke all on function api.school_registration_prepare(jsonb,text) from schoolsafe_api;
revoke all on function api.school_registration_prepare(jsonb,text) from schoolsafe_worker;
revoke all on function api.school_registration_prepare(jsonb,text) from schoolsafe_migrator;
revoke all on function api.school_registration_prepare(jsonb,text) from schoolsafe_auditor;
grant execute on function api.school_registration_prepare(jsonb,text) to schoolsafe_auth;

commit;