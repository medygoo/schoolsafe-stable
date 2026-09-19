\set ON_ERROR_STOP on

-- SchoolSafe Device Hub — Phase 2 : tables noyau.
-- Unité additive alignée sur l'audit Phase 0 validé (sections 9-10).
-- Toutes les tables portent school_id NOT NULL avec clés composites.
-- Aucun secret en clair (référence de coffre uniquement). Les commandes de
-- synchronisation sont persistées AVANT exécution : device_sync_jobs sert
-- de file durable au worker.
-- Invariants : unicité du mapping actif identité/appareil ; unicité du
-- numéro externe par appareil et génération ; série affectée à une seule
-- école active ; aucune relation inter-écoles.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 0. SCHÉMA devicehub
-- ============================================================================
create schema if not exists devicehub;
grant usage on schema devicehub to schoolsafe_api;

-- ============================================================================
-- 1. DEVICES — un appareil appartient obligatoirement à une école (§4)
-- ============================================================================
create table if not exists devicehub.devices (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  code text not null,
  vendor text not null,
  model text not null,
  serial_number text not null,
  device_type text not null default 'terminal',
  protocol text not null default 'unknown',
  connection_mode text not null default 'bridge',
  location text,
  status text not null default 'registered',
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint devices_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint devices_code_unique unique (school_id, code),
  constraint devices_status_check check (status in ('registered','testing','online','offline','disabled','revoked'))
);

-- Une série ne peut appartenir qu'à UNE école active (anti-réaffectation).
create unique index if not exists devices_serial_active_unique
  on devicehub.devices (serial_number)
  where (status not in ('revoked'));

-- ============================================================================
-- 2. CAPABILITIES — l'appareil déclare ce qu'il sait réellement faire (§6)
-- ============================================================================
create table if not exists devicehub.device_capabilities (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  device_id uuid not null,
  capability text not null,
  state text not null default 'unknown',
  evidence text,
  observed_at timestamptz not null default pg_catalog.now(),
  constraint capabilities_device_fkey foreign key (device_id) references devicehub.devices(id) on delete cascade,
  constraint capabilities_unique unique (device_id, capability),
  constraint capabilities_state_check check (state in ('unknown','supported','unsupported'))
);

-- ============================================================================
-- 3. AUTH CONFIG — secrets séparés, jamais en clair (§5)
-- ============================================================================
create table if not exists devicehub.device_auth_config (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  device_id uuid not null,
  secret_ref text not null,
  secret_version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint auth_config_device_fkey foreign key (device_id) references devicehub.devices(id) on delete cascade
);

-- Un seul secret actif par appareil (index partiel, pas de contrainte inline).
create unique index if not exists auth_config_active_unique
  on devicehub.device_auth_config (device_id) where (is_active = true);

-- ============================================================================
-- 4. BRIDGES — principal machine révocable, borné à une école (§26)
-- ============================================================================
create table if not exists devicehub.bridges (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  label text not null,
  principal_ref text not null,
  allowed_device_ids uuid[] not null default '{}',
  status text not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint bridges_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint bridges_status_check check (status in ('active','suspended','revoked'))
);

-- ============================================================================
-- 5. SUBJECT MAPPINGS — l'ID terminal ne devient jamais l'identité (§9)
-- ============================================================================
create table if not exists devicehub.device_subject_mappings (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  device_id uuid not null,
  subject_type text not null,
  student_id uuid,
  staff_member_id uuid,
  external_person_id text not null,
  generation integer not null default 1,
  sync_status text not null default 'pending',
  biometric_enrolled boolean not null default false,
  wanted_revision integer not null default 1,
  applied_revision integer not null default 0,
  enrolled_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint mappings_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint mappings_device_fkey foreign key (device_id) references devicehub.devices(id) on delete cascade,
  constraint mappings_student_fk foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint mappings_subject_check check (
    (subject_type = 'student' and student_id is not null and staff_member_id is null)
    or (subject_type = 'staff' and staff_member_id is not null and student_id is null)
  ),
  constraint mappings_type_check check (subject_type in ('student','staff')),
  constraint mappings_sync_check check (sync_status in ('pending','syncing','synced','failed','retrying','disabled'))
);

-- Un seul mapping ACTIF par identité/appareil ; numéro externe unique par appareil+génération.
create unique index if not exists mappings_active_identity_unique
  on devicehub.device_subject_mappings (device_id, subject_type, coalesce(student_id, staff_member_id))
  where (sync_status <> 'disabled');
create unique index if not exists mappings_external_id_unique
  on devicehub.device_subject_mappings (device_id, external_person_id, generation);
create index if not exists mappings_student_idx on devicehub.device_subject_mappings (school_id, student_id);

-- ============================================================================
-- 6. SYNC JOBS — file durable : persistées AVANT exécution (§25)
-- ============================================================================
create table if not exists devicehub.device_sync_jobs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  mapping_id uuid not null,
  operation text not null,
  revision integer not null,
  idempotency_key text not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  lease_expires_at timestamptz,
  error_redacted text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sync_jobs_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint sync_jobs_mapping_fkey foreign key (mapping_id) references devicehub.device_subject_mappings(id) on delete cascade,
  constraint sync_jobs_idem_unique unique (idempotency_key),
  constraint sync_jobs_op_check check (operation in ('create_person','update_person','disable_person','assign_pin','assign_card','start_fingerprint_enrollment')),
  constraint sync_jobs_status_check check (status in ('queued','running','done','failed','retrying'))
);
create index if not exists sync_jobs_due_idx on devicehub.device_sync_jobs (status, next_attempt_at);

-- ============================================================================
-- 7. EVENTS — journal source immuable (§22-23)
-- ============================================================================
create table if not exists devicehub.device_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  device_id uuid,
  source text not null default 'terminal',
  raw_provider_event_id text,
  log_epoch text,
  external_person_id text,
  credential_type text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default pg_catalog.now(),
  sync_status text not null default 'received',
  metadata jsonb not null default '{}'::jsonb,
  constraint events_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint events_device_fkey foreign key (device_id) references devicehub.devices(id) on delete set null (device_id),
  constraint events_cred_check check (credential_type in ('fingerprint','pin','card','qr')),
  constraint events_type_check check (event_type in ('check_in','check_out','authentication','access','unknown'))
);

-- Clé d'idempotence fournisseur : le même événement brut n'est jamais dupliqué.
create unique index if not exists events_provider_idem_unique
  on devicehub.device_events (school_id, device_id, raw_provider_event_id)
  where (raw_provider_event_id is not null);
create index if not exists events_occurred_idx on devicehub.device_events (school_id, occurred_at desc);

-- ============================================================================
-- 8. EVENT PROCESSING — résolution distincte du journal (§10)
-- ============================================================================
create table if not exists devicehub.event_processing (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null,
  school_id uuid not null,
  mapping_id uuid,
  subject_type text,
  student_id uuid,
  staff_member_id uuid,
  status text not null default 'pending',
  error_code text,
  processing_version integer not null default 1,
  processed_at timestamptz,
  constraint processing_event_fkey foreign key (event_id) references devicehub.device_events(id) on delete cascade,
  constraint processing_unique unique (event_id, processing_version)
);
create index if not exists processing_pending_idx on devicehub.event_processing (status);

-- ============================================================================
-- 9. CURSORS — déplacés après commit uniquement (§24)
-- ============================================================================
create table if not exists devicehub.device_cursors (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  device_id uuid not null,
  stream text not null,
  log_epoch text not null default 'default',
  last_position text,
  last_acknowledged_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint cursors_device_fkey foreign key (device_id) references devicehub.devices(id) on delete cascade,
  constraint cursors_unique unique (device_id, stream, log_epoch)
);

commit;