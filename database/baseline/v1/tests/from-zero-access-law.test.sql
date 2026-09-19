\set ON_ERROR_STOP on

-- Execute only after the 13 baseline units have been installed in a disposable,
-- empty SchoolSafe TEST database. All synthetic data is rolled back.
begin;

create or replace function pg_temp.assert_true(p_value boolean, p_message text)
returns void
language plpgsql
as $schoolsafe$
begin
  if not coalesce(p_value, false) then
    raise exception 'BASELINE TEST FAILED: %', p_message;
  end if;
end
$schoolsafe$;

insert into app.schools (id, code, name)
values
  ('10000000-0000-4000-8000-000000000001', 'TEST-A', 'School A'),
  ('10000000-0000-4000-8000-000000000002', 'TEST-B', 'School B'),
  ('10000000-0000-4000-8000-000000000003', 'TEST-C', 'School C');

insert into iam.users (id, auth_provider, external_subject, email)
values
  ('20000000-0000-4000-8000-000000000001', 'test', 'user-a', 'user-a@example.invalid'),
  ('20000000-0000-4000-8000-000000000002', 'test', 'user-b', 'user-b@example.invalid'),
  ('20000000-0000-4000-8000-000000000003', 'test', 'user-c', 'user-c@example.invalid');

insert into iam.profiles (id, user_id, school_id, display_name)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'User A'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'User B'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'User C');

insert into iam.roles (id, school_id, code, label)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'access-a', 'School A test access'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'access-b', 'School B test access'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'access-c', 'School C test access'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'deny-a', 'School A explicit deny');

insert into iam.profile_roles (school_id, profile_id, role_id, is_active)
values
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', true),
  ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', true),
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', false);

-- Each school receives the same three logical permissions through a distinct
-- tenant role: exact pedagogy, own_children and school administration.
insert into iam.role_permission_grants (
  id, school_id, role_id, permission_id, effect, reason
)
select
  grant_data.id,
  grant_data.school_id,
  grant_data.role_id,
  p.id,
  grant_data.effect,
  'DB-04B-R2 three-school isolation test'
from (values
  ('50000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000001'::uuid, 'pedagogy.grade.manage'::text, 'allow'::text),
  ('50000000-0000-4000-8000-000000000002'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000001'::uuid, 'pedagogy.grade.read'::text, 'allow'::text),
  ('50000000-0000-4000-8000-000000000003'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000001'::uuid, 'school.manage'::text, 'allow'::text),
  ('50000000-0000-4000-8000-000000000004'::uuid, '10000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000002'::uuid, 'pedagogy.grade.manage'::text, 'allow'::text),
  ('50000000-0000-4000-8000-000000000005'::uuid, '10000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000002'::uuid, 'pedagogy.grade.read'::text, 'allow'::text),
  ('50000000-0000-4000-8000-000000000006'::uuid, '10000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000002'::uuid, 'school.manage'::text, 'allow'::text),
  ('50000000-0000-4000-8000-000000000007'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, '40000000-0000-4000-8000-000000000003'::uuid, 'pedagogy.grade.manage'::text, 'allow'::text),
  ('50000000-0000-4000-8000-000000000008'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, '40000000-0000-4000-8000-000000000003'::uuid, 'pedagogy.grade.read'::text, 'allow'::text),
  ('50000000-0000-4000-8000-000000000009'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, '40000000-0000-4000-8000-000000000003'::uuid, 'school.manage'::text, 'allow'::text),
  ('50000000-0000-4000-8000-00000000000a'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000004'::uuid, 'pedagogy.grade.manage'::text, 'deny'::text)
) as grant_data(id, school_id, role_id, permission_code, effect)
join iam.permissions p on p.code = grant_data.permission_code;

-- Scope rows belong to one exact permission grant. The pedagogy grants carry
-- both class and subject scopes; evaluation requires the pair (AND).
insert into iam.grant_scopes (id, school_id, grant_id, scope_code, target_id)
values
  ('51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'assigned_classes', '70000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'assigned_subjects', '80000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'own_children', null),
  ('51000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'school', null),
  ('51000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'assigned_classes', '70000000-0000-4000-8000-000000000002'),
  ('51000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'assigned_subjects', '80000000-0000-4000-8000-000000000002'),
  ('51000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000005', 'own_children', null),
  ('51000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', 'school', null),
  ('51000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000007', 'assigned_classes', '70000000-0000-4000-8000-000000000003'),
  ('51000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000007', 'assigned_subjects', '80000000-0000-4000-8000-000000000003'),
  ('51000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000008', 'own_children', null),
  ('51000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000009', 'school', null),
  ('51000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000a', 'assigned_classes', '70000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000a', 'assigned_subjects', '80000000-0000-4000-8000-000000000001');

insert into app.academic_years (id, school_id, label, starts_on, ends_on, periods, is_active)
values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-2027', date '2026-09-01', date '2027-07-31', 'Trimestres', true),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '2026-2027', date '2026-09-01', date '2027-07-31', 'Trimestres', true),
  ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '2026-2027', date '2026-09-01', date '2027-07-31', 'Trimestres', true);

insert into app.classes (id, school_id, academic_year_id, cycle_key, name)
values
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'secondary', 'Class A'),
  ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'secondary', 'Class B'),
  ('70000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'secondary', 'Class C');

insert into app.subjects (id, school_id, academic_year_id, code, name)
values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'MATH', 'Mathematics A'),
  ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'MATH', 'Mathematics B'),
  ('80000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'MATH', 'Mathematics C');

insert into app.teacher_assignments (
  id, school_id, academic_year_id, class_id, subject_id, teacher_profile_id, starts_on
)
values
  ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', date '2026-09-01'),
  ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', date '2026-09-01'),
  ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', date '2026-09-01');

insert into app.students (id, school_id, class_id, matricule, first_name, last_name, lifecycle_status)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'DB04B-A', 'Child', 'A', 'active'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'DB04B-B', 'Child', 'B', 'active'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', 'DB04B-C', 'Child', 'C', 'active'),
  ('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'DB04B-A-OTHER', 'Other', 'A', 'active');

insert into app.student_enrollments (
  id, school_id, student_id, academic_year_id, class_id, status, starts_on
)
values
  ('b0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'active', date '2026-09-01'),
  ('b0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'active', date '2026-09-01'),
  ('b0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', 'active', date '2026-09-01');

insert into app.student_guardians (id, school_id, student_id, profile_id, guardian_type, full_name)
values
  ('c0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'tuteur', 'Guardian A'),
  ('c0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'tuteur', 'Guardian B'),
  ('c0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'tuteur', 'Guardian C');

insert into app.fee_structures (
  id, school_id, academic_year_id, label, amount, currency
)
values (
  'e0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000002',
  'School B test fee',
  100,
  'USD'
);

-- Le trigger require_operational_student lit app.students sous RLS, dont le
-- prédicat exige un contexte COMPLET et valide (school_id + context_is_valid,
-- cf. 11_rls_acl.sql). On établit l'identité de School B le temps de ce seed,
-- puis on retire le contexte : la suite du test gère les siens via
-- api.set_request_context et compte sur un contexte absent par défaut.
select api.set_request_context(
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-00000000000f'
);

insert into app.student_fees (
  id, school_id, student_id, fee_structure_id, amount_expected, amount_paid, amount_remaining
)
values (
  'e1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000002',
  'e0000000-0000-4000-8000-000000000001',
  100,
  0,
  100
);

select pg_catalog.set_config('schoolsafe.user_id', '', true);
select pg_catalog.set_config('schoolsafe.profile_id', '', true);
select pg_catalog.set_config('schoolsafe.school_id', '', true);
select pg_catalog.set_config('schoolsafe.request_id', '', true);

-- Physical tenant isolation is independent from Access_Law and RLS. These
-- writes run with baseline setup authority and must still fail at the FK layer.
-- The redundant tenant guard triggers are disabled only inside this transaction
-- so the expected foreign_key_violation can come only from the composite FK.
set local role schoolsafe_owner;
alter table app.students disable trigger app_students_class_id_tenant_guard;
alter table app.student_guardians disable trigger app_student_guardians_student_id_tenant_guard;
alter table app.teacher_assignments disable trigger app_teacher_assignments_subject_id_tenant_guard;
alter table app.fee_payments disable trigger app_fee_payments_student_fee_id_tenant_guard;
reset role;

do $schoolsafe$
declare
  v_denied boolean := false;
begin
  begin
    insert into app.students (
      id, school_id, class_id, matricule, first_name, last_name, lifecycle_status
    ) values (
      'e2000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002',
      'DB04B-CROSS-CLASS',
      'Cross',
      'Class',
      'active'
    );
  exception when foreign_key_violation then
    v_denied := true;
  end;
  perform pg_temp.assert_true(v_denied, 'School A student to School B class FK must be rejected');
end
$schoolsafe$;

do $schoolsafe$
declare
  v_denied boolean := false;
begin
  begin
    insert into app.student_guardians (
      id, school_id, student_id, profile_id, guardian_type, full_name
    ) values (
      'e3000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      'tuteur',
      'Cross-school guardian'
    );
  exception when foreign_key_violation then
    v_denied := true;
  end;
  perform pg_temp.assert_true(v_denied, 'School A guardian to School B student FK must be rejected');
end
$schoolsafe$;

do $schoolsafe$
declare
  v_denied boolean := false;
begin
  begin
    insert into app.teacher_assignments (
      id, school_id, academic_year_id, class_id, subject_id, teacher_profile_id, starts_on
    ) values (
      'e4000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      date '2026-09-01'
    );
  exception when foreign_key_violation then
    v_denied := true;
  end;
  perform pg_temp.assert_true(v_denied, 'School A teacher assignment to School B subject FK must be rejected');
end
$schoolsafe$;

do $schoolsafe$
declare
  v_denied boolean := false;
begin
  begin
    insert into app.fee_payments (
      id, school_id, student_fee_id, amount, currency, received_by
    ) values (
      'e5000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000001',
      10,
      'USD',
      '30000000-0000-4000-8000-000000000001'
    );
  exception when foreign_key_violation then
    v_denied := true;
  end;
  perform pg_temp.assert_true(v_denied, 'School A payment to School B fee FK must be rejected');
end
$schoolsafe$;

set local role schoolsafe_owner;
alter table app.students enable trigger app_students_class_id_tenant_guard;
alter table app.student_guardians enable trigger app_student_guardians_student_id_tenant_guard;
alter table app.teacher_assignments enable trigger app_teacher_assignments_subject_id_tenant_guard;
alter table app.fee_payments enable trigger app_fee_payments_student_fee_id_tenant_guard;
reset role;

set local role schoolsafe_api;

select pg_temp.assert_true(
  not api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001'),
  'missing context must be denied'
);

-- An identity/profile from School A cannot be paired with School B.
do $schoolsafe$
declare
  v_denied boolean := false;
begin
  begin
    perform api.set_request_context(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      'd0000000-0000-4000-8000-000000000000'
    );
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  perform pg_temp.assert_true(v_denied, 'incoherent injected school context must be denied');
end
$schoolsafe$;

select api.set_request_context(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001'
);

select pg_temp.assert_true(
  api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001'),
  'exact active class-subject assignment must be allowed'
);
select pg_temp.assert_true(
  not api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000001', null),
  'teacher access must not degrade to assigned_classes without a subject'
);
select pg_temp.assert_true(
  not api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002')
  and not api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001'),
  'assigned class-subject access must remain bounded to school_id'
);
select pg_temp.assert_true(
  api.check_access('pedagogy.grade.read', null, 'a0000000-0000-4000-8000-000000000001'),
  'parent must be allowed for an active linked child'
);
select pg_temp.assert_true(
  not api.check_access('pedagogy.grade.read', null, 'a0000000-0000-4000-8000-000000000002')
  and not api.check_access('pedagogy.grade.read', null, 'a0000000-0000-4000-8000-000000000003'),
  'own_children must remain bounded to school_id'
);
select pg_temp.assert_true(
  not api.check_access('pedagogy.grade.read', null, 'a0000000-0000-4000-8000-000000000004'),
  'parent must be denied for an unlinked child'
);

do $schoolsafe$
declare
  v_denied boolean := false;
begin
  begin
    perform api.deactivate_other_academic_years('60000000-0000-4000-8000-000000000002');
  exception
    when foreign_key_violation then
      v_denied := true;
  end;
  perform pg_temp.assert_true(v_denied, 'cross-school RPC resource must be rejected');
end
$schoolsafe$;

reset role;
set local role schoolsafe_owner;
select pg_temp.assert_true(
  (select pg_catalog.count(*) from app.schools) = 1
  and exists (select 1 from app.schools where name = 'School A')
  and not exists (select 1 from app.schools where name in ('School B', 'School C')),
  'School A must not read School B or C'
);

reset role;
set local role schoolsafe_api;
select api.set_request_context(
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000002'
);
select pg_temp.assert_true(
  api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002'),
  'School B exact assignment must be allowed'
);
select pg_temp.assert_true(
  not api.check_access('pedagogy.grade.read', null, 'a0000000-0000-4000-8000-000000000001')
  and not api.check_access('pedagogy.grade.read', null, 'a0000000-0000-4000-8000-000000000003'),
  'School B own_children must exclude School A and C'
);

reset role;
set local role schoolsafe_owner;
select pg_temp.assert_true(
  (select pg_catalog.count(*) from app.schools) = 1
  and exists (select 1 from app.schools where name = 'School B')
  and not exists (select 1 from app.schools where name in ('School A', 'School C')),
  'School B must not read School A or C'
);

reset role;
set local role schoolsafe_api;
select api.set_request_context(
  '20000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000003'
);
select pg_temp.assert_true(
  api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000003'),
  'School C exact assignment must be allowed'
);

reset role;
set local role schoolsafe_owner;
select pg_temp.assert_true(
  (select pg_catalog.count(*) from app.schools) = 1
  and exists (select 1 from app.schools where name = 'School C')
  and not exists (select 1 from app.schools where name in ('School A', 'School B')),
  'School C must not read School A or B'
);

-- Activate the School A DENY only after its positive tests. School B must
-- remain allowed, proving that a DENY never leaks across tenant boundaries.
reset role;
set local role schoolsafe_api;
select api.set_request_context(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000004'
);
reset role;
update iam.profile_roles
set is_active = true
where school_id = '10000000-0000-4000-8000-000000000001'
  and profile_id = '30000000-0000-4000-8000-000000000001'
  and role_id = '40000000-0000-4000-8000-000000000004';

set local role schoolsafe_api;
select api.set_request_context(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000005'
);
select pg_temp.assert_true(
  not api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001'),
  'explicit DENY must override an otherwise valid ALLOW'
);

select api.set_request_context(
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000006'
);
select pg_temp.assert_true(
  api.check_access('pedagogy.grade.manage', null, null, '70000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002'),
  'explicit DENY must not cross school boundaries'
);

reset role;
rollback;

\echo 'DB-04B-R2 tenant-safe Access_Law semantic tests: PASS'
