\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

create table if not exists audit.events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  actor_profile_id uuid,
  request_id uuid,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists ops.schema_versions (
  unit_order smallint primary key,
  baseline_version text not null,
  unit_name text not null,
  file_name text not null,
  sha256 text not null,
  applied_at timestamptz not null default pg_catalog.now(),
  applied_by name not null default current_user,
  unique (baseline_version, unit_name),
  unique (baseline_version, file_name)
);

create table if not exists ops.system_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  actor_profile_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists ops.notification_templates (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid,
  event_type text not null,
  channel text not null,
  language text not null default 'fr',
  subject text,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists ops.notifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  profile_id uuid not null,
  event_id uuid,
  channel text not null,
  template_key text,
  title text,
  message text not null,
  recipient_email text,
  recipient_phone text,
  status text not null default 'PENDING',
  provider text,
  provider_message_id text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists ops.data_retention_policies (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid,
  entity_type text not null,
  retention_days integer not null,
  archive_target text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists ops.document_number_sequences (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  document_type text not null,
  prefix text not null default '',
  last_number bigint not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists ops.indicator_snapshots (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  snapshot_date date not null default current_date,
  indicator_code text not null,
  value numeric not null default 0,
  unit text not null default 'count',
  dimensions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

commit;
