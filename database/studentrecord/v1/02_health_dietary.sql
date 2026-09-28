\set ON_ERROR_STOP on

-- SchoolSafe B1 — Child Record Complete: Health + Dietary + Allergies + Medications
-- Additive unit: creates health/dietary tables without modifying existing ones.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. HEALTH PROFILE (one row per student)
-- ============================================================================
create table if not exists app.student_health_profiles (
  student_id uuid primary key,
  school_id uuid not null,
  blood_type text not null default 'UNKNOWN',
  primary_doctor_name text,
  primary_doctor_phone text,
  medical_notes text,
  emergency_instructions text,
  medical_declaration_completed boolean not null default false,
  medical_consent_status boolean,
  last_confirmed_at timestamptz,
  last_confirmed_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint health_profiles_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint health_profiles_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint health_profiles_blood_type_check check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-','UNKNOWN'))
);

alter table app.student_health_profiles enable row level security;
alter table app.student_health_profiles force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'health_profiles_isolation' and tablename = 'student_health_profiles') then
    create policy health_profiles_isolation on app.student_health_profiles
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_health_profiles to schoolsafe_api;

-- ============================================================================
-- 2. HEALTH CONDITIONS
-- ============================================================================
create table if not exists app.student_health_conditions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  name text not null,
  notes text,
  status text not null default 'active',
  reported_at timestamptz not null default pg_catalog.now(),
  reported_by uuid,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint health_conditions_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint health_conditions_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint health_conditions_status_check check (status in ('active','inactive'))
);

create index if not exists health_conditions_student_idx on app.student_health_conditions (student_id);

alter table app.student_health_conditions enable row level security;
alter table app.student_health_conditions force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'health_conditions_isolation' and tablename = 'student_health_conditions') then
    create policy health_conditions_isolation on app.student_health_conditions
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_health_conditions to schoolsafe_api;

-- ============================================================================
-- 3. ALLERGIES
-- ============================================================================
create table if not exists app.student_allergies (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  category text not null,
  allergen text not null,
  severity text not null default 'unknown',
  reaction text,
  emergency_instruction text,
  status text not null default 'reported',
  reported_at timestamptz not null default pg_catalog.now(),
  reported_by uuid,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint allergies_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint allergies_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint allergies_category_check check (category in ('food','medication','environmental','other')),
  constraint allergies_severity_check check (severity in ('mild','moderate','severe','unknown')),
  constraint allergies_status_check check (status in ('reported','confirmed','inactive'))
);

create index if not exists allergies_student_idx on app.student_allergies (student_id);
create unique index if not exists allergies_active_unique on app.student_allergies (school_id, student_id, category, allergen) where (status <> 'inactive');

alter table app.student_allergies enable row level security;
alter table app.student_allergies force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'allergies_isolation' and tablename = 'student_allergies') then
    create policy allergies_isolation on app.student_allergies
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_allergies to schoolsafe_api;

-- ============================================================================
-- 4. MEDICATIONS
-- ============================================================================
create table if not exists app.student_medications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  name text not null,
  dosage_text text,
  schedule_text text,
  instructions text,
  school_administration_required boolean not null default false,
  status text not null default 'active',
  reported_at timestamptz not null default pg_catalog.now(),
  reported_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint medications_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint medications_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint medications_status_check check (status in ('active','inactive'))
);

create index if not exists medications_student_idx on app.student_medications (student_id);

alter table app.student_medications enable row level security;
alter table app.student_medications force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'medications_isolation' and tablename = 'student_medications') then
    create policy medications_isolation on app.student_medications
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_medications to schoolsafe_api;

-- ============================================================================
-- 5. DIETARY PROFILE
-- ============================================================================
create table if not exists app.student_dietary_profiles (
  student_id uuid primary key,
  school_id uuid not null,
  dietary_declaration_completed boolean not null default false,
  parent_food_note varchar(1000),
  last_confirmed_at timestamptz,
  last_confirmed_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint dietary_profiles_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint dietary_profiles_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade
);

alter table app.student_dietary_profiles enable row level security;
alter table app.student_dietary_profiles force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'dietary_profiles_isolation' and tablename = 'student_dietary_profiles') then
    create policy dietary_profiles_isolation on app.student_dietary_profiles
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_dietary_profiles to schoolsafe_api;

-- ============================================================================
-- 6. DIETARY RESTRICTIONS
-- ============================================================================
create table if not exists app.student_dietary_restrictions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  kind text not null,
  label text not null,
  notes text,
  status text not null default 'reported',
  reported_at timestamptz not null default pg_catalog.now(),
  reported_by uuid,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint dietary_restrictions_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint dietary_restrictions_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint dietary_restrictions_kind_check check (kind in ('intolerance','prohibited_food','restriction','diet')),
  constraint dietary_restrictions_status_check check (status in ('reported','confirmed','inactive'))
);

create index if not exists dietary_restrictions_student_idx on app.student_dietary_restrictions (student_id);

alter table app.student_dietary_restrictions enable row level security;
alter table app.student_dietary_restrictions force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'dietary_restrictions_isolation' and tablename = 'student_dietary_restrictions') then
    create policy dietary_restrictions_isolation on app.student_dietary_restrictions
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_dietary_restrictions to schoolsafe_api;

-- ============================================================================
-- 7. FOOD PREFERENCES
-- ============================================================================
create table if not exists app.student_food_preferences (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  preference_type text not null,
  item text not null,
  notes text,
  status text not null default 'active',
  reported_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint food_preferences_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint food_preferences_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint food_preferences_type_check check (preference_type in ('liked','disliked')),
  constraint food_preferences_status_check check (status in ('active','inactive'))
);

create index if not exists food_preferences_student_idx on app.student_food_preferences (student_id);

alter table app.student_food_preferences enable row level security;
alter table app.student_food_preferences force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'food_preferences_isolation' and tablename = 'student_food_preferences') then
    create policy food_preferences_isolation on app.student_food_preferences
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_food_preferences to schoolsafe_api;

commit;