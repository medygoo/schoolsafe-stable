\set ON_ERROR_STOP on

-- SchoolSafe B1 — Child Record Complete: Confirmations + Consents + Permissions
-- Additive unit: creates confirmation/consent tables and seeds new permissions.
-- No existing table or function is modified or removed.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. STUDENT RECORD CONFIRMATIONS (family, medical, dietary, pickup)
-- ============================================================================
create table if not exists app.student_record_confirmations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  confirmation_key text not null,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint record_confirmations_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint record_confirmations_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint record_confirmations_key_check check (confirmation_key in ('family','medical','dietary','pickup')),
  constraint record_confirmations_unique unique (school_id, student_id, confirmation_key)
);

alter table app.student_record_confirmations enable row level security;
alter table app.student_record_confirmations force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'record_confirmations_isolation' and tablename = 'student_record_confirmations') then
    create policy record_confirmations_isolation on app.student_record_confirmations
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_record_confirmations to schoolsafe_api;

-- ============================================================================
-- 2. STUDENT CONSENTS (photo_video, emergency_care)
-- ============================================================================
create table if not exists app.student_consents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  consent_key text not null,
  decision boolean not null,
  decided_at timestamptz not null default pg_catalog.now(),
  decided_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint student_consents_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint student_consents_student_fkey foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint student_consents_key_check check (consent_key in ('photo_video','emergency_care')),
  constraint student_consents_unique unique (school_id, student_id, consent_key)
);

alter table app.student_consents enable row level security;
alter table app.student_consents force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'student_consents_isolation' and tablename = 'student_consents') then
    create policy student_consents_isolation on app.student_consents
      for all using (school_id = iam.current_school_id())
      with check (school_id = iam.current_school_id());
  end if;
end $$;

grant select, insert, update on app.student_consents to schoolsafe_api;

-- ============================================================================
-- 3. ADDITIVE PERMISSIONS SEED
-- ============================================================================
insert into app.permissions (code, scope, label)
values
  ('school.student.health.read', 'school', 'Consulter le dossier santé élève'),
  ('school.student.health.manage', 'school', 'Modifier le dossier santé élève'),
  ('school.student.health.confirm', 'school', 'Confirmer les informations santé élève'),
  ('school.student.dietary.read', 'school', 'Consulter le profil alimentaire élève'),
  ('school.student.dietary.manage', 'school', 'Modifier le profil alimentaire élève'),
  ('school.student.dietary.confirm', 'school', 'Confirmer les informations alimentaires élève')
on conflict (code) do nothing;

commit;