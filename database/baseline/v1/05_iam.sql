\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

create table if not exists iam.users (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  auth_provider text,
  external_subject text,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.profiles (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid,
  school_id uuid not null,
  display_name text not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  is_active boolean not null default true,
  account_status text not null default 'active',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.devices (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  profile_id uuid not null,
  device_key text not null,
  kind text not null default 'unknown',
  is_school_managed boolean not null default false,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.roles (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  code text not null,
  label text not null,
  is_system_template boolean not null default false,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.permissions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  code text not null,
  label text not null,
  default_scope_code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.scopes (
  code text primary key,
  label text not null,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.profile_roles (
  school_id uuid not null,
  profile_id uuid not null,
  role_id uuid not null,
  assigned_by uuid,
  is_active boolean not null default true,
  starts_at timestamptz not null default pg_catalog.now(),
  ends_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (profile_id, role_id)
);

create table if not exists iam.role_permission_grants (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null,
  effect text not null,
  reason text,
  granted_by uuid,
  is_active boolean not null default true,
  starts_at timestamptz not null default pg_catalog.now(),
  ends_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.permission_conditions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  grant_id uuid not null,
  condition_code text not null,
  condition_params jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.profile_permission_exceptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  profile_id uuid not null,
  permission_id uuid not null,
  effect text not null,
  condition_code text,
  condition_params jsonb not null default '{}'::jsonb,
  reason text not null,
  granted_by uuid not null,
  starts_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.grant_scopes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  grant_id uuid not null,
  scope_code text not null,
  target_id uuid,
  assigned_by uuid,
  is_active boolean not null default true,
  starts_at timestamptz not null default pg_catalog.now(),
  ends_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.exception_scopes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  exception_id uuid not null,
  scope_code text not null,
  target_id uuid,
  assigned_by uuid,
  is_active boolean not null default true,
  starts_at timestamptz not null default pg_catalog.now(),
  ends_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

commit;
