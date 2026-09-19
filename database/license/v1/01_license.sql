\set ON_ERROR_STOP on

-- SchoolSafe License v1 — état de licence hors-ligne (TRIAL-02).
--
-- Modèle : SchoolSafe Control est l'autorité ; il signe chaque état (Ed25519).
-- Le backend stocke le jeton SIGNÉ et le revérifie à chaque lecture : une
-- ligne falsifiée en base casse la signature → fail-closed. Le serveur seul
-- décide ; le frontend ne décide jamais (règle 10/11).
--
-- Cette table contient le jeton signé brut + le payload vérifié en miroir.
-- L'autorisation réelle = vérification cryptographique côté serveur.

begin;
set local role schoolsafe_owner;

create table if not exists ops.license_states (
  school_id uuid primary key,
  -- Jeton signé complet : base64url(payload) || '.' || base64url(signature)
  signed_token text not null,
  -- Miroir du payload APRÈS vérification de la signature (affichage seul).
  payload jsonb not null,
  license_id text not null,
  status text not null check (status in ('active', 'suspended', 'revoked')),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  grace_days integer not null check (grace_days between 0 and 90),
  -- Plancher anti-retour d'horloge : jamais en dessous du dernier état vu.
  last_seen_at timestamptz not null default pg_catalog.now(),
  fetched_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (expires_at > issued_at)
);

-- Tenant FORCE RLS : chaque école ne lit que son propre état (affichage).
alter table ops.license_states enable row level security;
alter table ops.license_states force row level security;

do $schoolsafe$
begin
  execute pg_catalog.format('drop policy if exists %I on %s', 'license_states_owner_tenant', 'ops.license_states');
  execute pg_catalog.format('drop policy if exists %I on %s', 'license_states_api_read', 'ops.license_states');
  execute pg_catalog.format('drop policy if exists %I on %s', 'license_states_migrator_write', 'ops.license_states');
end
$schoolsafe$;

create policy license_states_owner_tenant on ops.license_states
  to schoolsafe_owner
  using (school_id = iam.current_school_id() and iam.context_is_valid())
  with check (school_id = iam.current_school_id() and iam.context_is_valid());

-- Le rôle api n'a AUCUNE policy directe : il passe par les RPC definer.
-- Le migrateur (provisioning) gère la table hors contexte tenant.
create policy license_states_migrator_write on ops.license_states
  to schoolsafe_migrator
  using (session_user = 'schoolsafe_migrator')
  with check (session_user = 'schoolsafe_migrator');

-- ─── RPC serveur (le rôle api ne touche JAMAIS la table directement) ───

-- Lecture : jeton signé + métadonnées de l'école du contexte.
create or replace function api.license_state_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_row ops.license_states%rowtype;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Active SchoolSafe context required';
  end if;

  select * into v_row from ops.license_states l where l.school_id = v_school_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'school_id', v_row.school_id,
    'signed_token', v_row.signed_token,
    'license_id', v_row.license_id,
    'status', v_row.status,
    'issued_at', v_row.issued_at,
    'expires_at', v_row.expires_at,
    'grace_days', v_row.grace_days,
    'last_seen_at', v_row.last_seen_at,
    'fetched_at', v_row.fetched_at
  );
end
$schoolsafe$;

-- Écriture : le serveur a DÉJÀ vérifié la signature avant d'appeler ; la
-- fonction impose l'anti-rejeu (issued_at strictement monotone) et audite.
create or replace function api.license_state_write(
  p_signed_token text,
  p_payload jsonb,
  p_license_id text,
  p_status text,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_grace_days integer,
  p_last_seen_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_existing ops.license_states%rowtype;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Active SchoolSafe context required';
  end if;
  if p_status not in ('active', 'suspended', 'revoked') then
    raise check_violation using message = 'Invalid license status';
  end if;

  select * into v_existing from ops.license_states l where l.school_id = v_school_id for update;

  if found and p_issued_at < v_existing.issued_at then
    -- Anti-rejeu : un état plus ancien n'écrase jamais un état plus récent.
    return jsonb_build_object('stored', false, 'reason', 'stale');
  end if;

  insert into ops.license_states (
    school_id, signed_token, payload, license_id, status,
    issued_at, expires_at, grace_days, last_seen_at, fetched_at, updated_at
  ) values (
    v_school_id, p_signed_token, p_payload, p_license_id, p_status,
    p_issued_at, p_expires_at, p_grace_days, p_last_seen_at, pg_catalog.now(), pg_catalog.now()
  )
  on conflict (school_id) do update
    set signed_token = excluded.signed_token,
        payload = excluded.payload,
        license_id = excluded.license_id,
        status = excluded.status,
        issued_at = excluded.issued_at,
        expires_at = excluded.expires_at,
        grace_days = excluded.grace_days,
        last_seen_at = excluded.last_seen_at,
        fetched_at = pg_catalog.now(),
        updated_at = pg_catalog.now();

  perform audit.write_event(
    'license.state.refreshed',
    'school',
    v_school_id,
    jsonb_build_object('license_id', p_license_id, 'status', p_status)
  );

  return jsonb_build_object('stored', true);
end
$schoolsafe$;

grant execute on function api.license_state_read() to schoolsafe_api;
grant execute on function api.license_state_write(text, jsonb, text, text, timestamptz, timestamptz, integer, timestamptz) to schoolsafe_api;

-- Lecture d'affichage : le statut courant de l'école (jamais une autorisation).
create or replace function api.license_status_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_row ops.license_states%rowtype;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Active SchoolSafe context required';
  end if;

  select * into v_row from ops.license_states l where l.school_id = v_school_id;
  if not found then
    return jsonb_build_object('status', 'no_license');
  end if;

  return jsonb_build_object(
    'school_id', v_school_id,
    'license_id', v_row.license_id,
    'status', v_row.status,
    'expires_at', v_row.expires_at,
    'grace_days', v_row.grace_days,
    'fetched_at', v_row.fetched_at
  );
end
$schoolsafe$;

grant execute on function api.license_status_read() to schoolsafe_api;

-- Le rôle api ne touche JAMAIS la table : tout passe par les RPC definer.
revoke all on ops.license_states from schoolsafe_api;
grant select, insert, update on ops.license_states to schoolsafe_migrator;

commit;
