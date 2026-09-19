\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

create table if not exists app.schools (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  code text not null,
  name text not null,
  name_en text,
  legal_name text,
  school_type text not null default 'Privée agréée',
  approval_code text,
  primary_color text not null default '#071a3d',
  accent_color text not null default '#e9a515',
  document_footer text,
  logo_path text,
  motto text,
  currency text not null default 'USD',
  bank_name text,
  bank_account text,
  tax_id text,
  director_name text,
  director_signature_url text,
  official_seal_url text,
  official_language text not null default 'FR',
  setup_completed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.school_settings (
  school_id uuid primary key,
  max_offline_hours integer not null default 24,
  lockdown_active boolean not null default false,
  lockdown_activated_at timestamptz,
  lockdown_activated_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.academic_years (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  periods text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.school_cycles (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  cycle_key text not null,
  cycle_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.school_contacts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  country text not null default 'République démocratique du Congo',
  province text not null default 'Kinshasa',
  city text not null default 'Kinshasa',
  address text,
  email text,
  phone text,
  website_url text,
  website_mode text not null default 'Créer un nouveau site SchoolSafe',
  public_news text not null default 'Après validation',
  public_gallery text not null default 'Après validation et consentement',
  public_honors text not null default 'Après validation',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.classes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid,
  cycle_key text not null,
  name text not null,
  option text,
  teacher_profile_id uuid,
  card_color text default '#e9a515',
  card_color_soft text default '#f9e8b8',
  card_color_dark text default '#b87e0d',
  card_family text,
  card_variant text,
  card_pat text default 'auto',
  card_pat_style text,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.students (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  class_id uuid,
  matricule text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date,
  gender text,
  photo_path text,
  lifecycle_status text not null default 'draft',
  card_printed boolean not null default false,
  card_print_date date,
  card_print_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.student_guardians (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  profile_id uuid,
  guardian_type text not null,
  is_primary boolean not null default false,
  full_name text not null,
  phone text,
  email text,
  address text,
  is_authorized_pickup boolean not null default true,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.student_enrollments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid,
  class_id uuid,
  status text not null,
  starts_on date not null,
  ends_on date,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.student_enrollment_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  enrollment_id uuid not null,
  student_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text not null,
  actor_profile_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.parent_invitations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  profile_id uuid not null,
  student_id uuid not null,
  email text not null,
  token_hash text not null,
  status text not null default 'pending_activation',
  expires_at timestamptz not null,
  invited_by uuid not null,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.card_print_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid,
  requested_by uuid not null,
  format text not null,
  is_duplicate boolean not null default false,
  version integer not null default 1,
  status text not null default 'pending',
  front_image_url text,
  back_image_url text,
  front_r2_key text,
  back_r2_key text,
  metadata jsonb not null default '{}'::jsonb,
  control_app_reference text,
  error_message text,
  requested_at timestamptz not null default pg_catalog.now(),
  submitted_at timestamptz,
  printed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.locations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  code text not null,
  label text not null,
  kind text not null default 'gate',
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.security_portals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  location_id uuid,
  code text not null,
  label text not null,
  is_open boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.student_cards (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  card_number text not null,
  card_secret text not null,
  signature text not null,
  status text not null default 'active',
  issued_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  replaced_by_card_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.security_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid,
  card_id uuid,
  location_id uuid,
  portal_id uuid,
  event_type text not null,
  occurred_at timestamptz not null default pg_catalog.now(),
  scanned_by uuid,
  authorized_person_id uuid,
  decision text,
  denial_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.alert_rules (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  code text not null,
  domain text not null,
  name text not null,
  description text,
  enabled boolean not null default true,
  severity text not null default 'medium',
  evaluation_mode text not null default 'event',
  cooldown_seconds integer not null default 0,
  notify_channels jsonb not null default '[]'::jsonb,
  target_roles jsonb not null default '[]'::jsonb,
  condition_type text,
  threshold_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.alerts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  rule_id uuid,
  source_module text not null,
  alert_type text not null,
  severity text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  dedup_key text,
  status text not null default 'open',
  detected_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  occurrence_count integer not null default 1,
  assigned_to uuid,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.alert_notifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  alert_id uuid not null,
  profile_id uuid,
  channel text not null,
  status text not null default 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.fee_structures (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  cycle_key text,
  label text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  due_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.student_fees (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  fee_structure_id uuid not null,
  status text not null default 'pending',
  amount_expected numeric(12,2) not null,
  amount_paid numeric(12,2) not null default 0,
  amount_remaining numeric(12,2) not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.cash_registers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  register_date date not null default current_date,
  status text not null default 'open',
  opened_by uuid,
  opened_at timestamptz not null default pg_catalog.now(),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.fee_payments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_fee_id uuid not null,
  amount numeric(12,2) not null,
  currency text not null,
  received_by uuid not null,
  received_at timestamptz not null default pg_catalog.now(),
  receipt_no text,
  mode text,
  reference text,
  status text not null default 'valid',
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.cash_register_closures (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  cash_register_id uuid not null,
  closure_date date not null,
  closed_by uuid not null,
  expected_amount numeric(12,2) not null,
  counted_amount numeric(12,2) not null,
  variance numeric(12,2) not null,
  status text not null default 'closed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.fee_control_campaigns (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  fee_structure_id uuid not null,
  label text not null,
  description text,
  classes jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft',
  created_by uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.fee_control_assignees (
  school_id uuid not null,
  campaign_id uuid not null,
  profile_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (campaign_id, profile_id)
);

create table if not exists app.fee_control_scans (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  campaign_id uuid not null,
  student_id uuid not null,
  scanned_by uuid not null,
  location_id uuid,
  student_fee_status text,
  result text not null,
  notes text,
  scanned_at timestamptz not null default pg_catalog.now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists app.subjects (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  cycle_key text,
  code text not null,
  name text not null,
  language text not null default 'fr',
  subject_family_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.teacher_assignments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  teacher_profile_id uuid not null,
  is_tutor boolean not null default false,
  is_active boolean not null default true,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.assignments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  teacher_profile_id uuid not null,
  title text not null,
  type text not null,
  scale_mode text,
  scale_max numeric(8,2),
  scale_label text,
  coefficient numeric(8,2) not null default 1,
  due_date date,
  prerequisites jsonb not null default '[]'::jsonb,
  instructions text,
  language text not null default 'fr',
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.assignment_questions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  assignment_id uuid not null,
  text text not null,
  type text not null,
  points numeric(8,2) not null default 0,
  answer_space text,
  choices jsonb not null default '[]'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.grades (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  value_numeric numeric(8,2),
  value_text text,
  normalized_value numeric(8,4),
  comment text,
  change_reason text,
  status text not null default 'draft',
  published_at timestamptz,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.lesson_plans (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  teacher_profile_id uuid not null,
  title text not null,
  lesson_date date not null,
  objectives jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  procedure text,
  homework_assignment_id uuid,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.approval_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  request_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  requested_by uuid not null,
  requested_at timestamptz not null default pg_catalog.now(),
  status text not null default 'pending',
  decided_by uuid,
  decided_at timestamptz,
  expected_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.rankings (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  class_id uuid,
  period_code text not null,
  status text not null default 'draft',
  calculation_version text,
  computed_at timestamptz,
  published_at timestamptz,
  computed_by_profile_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.ranking_entries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  ranking_id uuid not null,
  student_id uuid not null,
  rank integer not null,
  score numeric(12,4),
  result_component numeric(12,4),
  progress_component numeric(12,4),
  effort_component numeric(12,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.ranking_stars (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  ranking_id uuid not null,
  student_id uuid not null,
  parent_profile_id uuid not null,
  created_at timestamptz not null default pg_catalog.now()
);

commit;
