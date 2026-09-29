\set ON_ERROR_STOP on

-- SchoolSafe B1 — Child Record Complete: Identity extensions + Emergency Contacts
-- Additive unit: extends app.students, creates app.student_emergency_contacts
-- No existing table or function is modified or removed.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. EXTEND app.students WITH ADDITIVE IDENTITY FIELDS
-- ============================================================================
alter table app.students
  add column if not exists place_of_birth text,
  add column if not exists nationality text,
  add column if not exists home_address text;

comment on column app.students.place_of_birth is 'B1: optional birthplace';
comment on column app.students.nationality is 'B1: optional nationality';
comment on column app.students.home_address is 'B1: optional home address';

-- ============================================================================
-- 2. EMERGENCY CONTACTS TABLE (slot 1 = primary mandatory, slot 2 = secondary)
-- ============================================================================
create table if not exists app.student_emergency_contacts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  slot_no smallint not null,
  guardian_id uuid,
  full_name text not null,
  relation text not null,
  phone text not null,
  alternate_phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint emergency_contacts_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint emergency_contacts_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint emergency_contacts_slot_check check (slot_no in (1, 2)),
  constraint emergency_contacts_unique_slot unique (school_id, student_id, slot_no)
);

create index if not exists emergency_contacts_student_idx on app.student_emergency_contacts (student_id);

alter table app.student_emergency_contacts enable row level security;
alter table app.student_emergency_contacts force row level security;

-- RLS: only same-school access
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'emergency_contacts_isolation' and tablename = 'student_emergency_contacts') then
    create policy emergency_contacts_isolation on app.student_emergency_contacts
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

commit;