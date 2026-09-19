\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

-- Every school-bound object that exposes an id also exposes a tenant-qualified
-- candidate key. Tenant relationships below must reference this key so a
-- cross-school pair is impossible even for the migration role.
do $schoolsafe$
declare
  v_table regclass;
  v_constraint_name text;
begin
  foreach v_table in array array[
    'app.academic_years'::regclass,
    'app.school_cycles'::regclass,
    'app.school_contacts'::regclass,
    'app.classes'::regclass,
    'app.students'::regclass,
    'app.student_guardians'::regclass,
    'app.student_enrollments'::regclass,
    'app.student_enrollment_events'::regclass,
    'app.parent_invitations'::regclass,
    'app.card_print_requests'::regclass,
    'app.locations'::regclass,
    'app.security_portals'::regclass,
    'app.student_cards'::regclass,
    'app.security_events'::regclass,
    'app.alert_rules'::regclass,
    'app.alerts'::regclass,
    'app.alert_notifications'::regclass,
    'app.fee_structures'::regclass,
    'app.student_fees'::regclass,
    'app.cash_registers'::regclass,
    'app.fee_payments'::regclass,
    'app.cash_register_closures'::regclass,
    'app.fee_control_campaigns'::regclass,
    'app.fee_control_scans'::regclass,
    'app.subjects'::regclass,
    'app.teacher_assignments'::regclass,
    'app.assignments'::regclass,
    'app.assignment_questions'::regclass,
    'app.grades'::regclass,
    'app.lesson_plans'::regclass,
    'app.approval_requests'::regclass,
    'app.rankings'::regclass,
    'app.ranking_entries'::regclass,
    'app.ranking_stars'::regclass,
    'iam.profiles'::regclass,
    'iam.devices'::regclass,
    'iam.roles'::regclass,
    'iam.role_permission_grants'::regclass,
    'iam.permission_conditions'::regclass,
    'iam.profile_permission_exceptions'::regclass,
    'iam.grant_scopes'::regclass,
    'iam.exception_scopes'::regclass,
    'audit.events'::regclass,
    'ops.system_events'::regclass,
    'ops.notification_templates'::regclass,
    'ops.notifications'::regclass,
    'ops.data_retention_policies'::regclass,
    'ops.document_number_sequences'::regclass,
    'ops.indicator_snapshots'::regclass
  ]
  loop
    v_constraint_name := pg_catalog.replace(v_table::text, '.', '_') || '_school_id_id_key';
    if not exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = v_table
        and conname = v_constraint_name
    ) then
      execute pg_catalog.format(
        'alter table %s add constraint %I unique (school_id, id)',
        v_table,
        v_constraint_name
      );
    end if;
  end loop;
end
$schoolsafe$;

do $schoolsafe$
declare
  v_constraint record;
begin
  for v_constraint in
    select * from (values
      ('app.schools', 'schools_code_key', 'unique (code)'),
      ('app.school_settings', 'school_settings_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.school_settings', 'school_settings_lockdown_actor_fkey', 'foreign key (school_id, lockdown_activated_by) references iam.profiles(school_id, id) on delete set null (lockdown_activated_by)'),
      ('app.school_settings', 'school_settings_offline_hours_check', 'check (max_offline_hours between 0 and 168)'),
      ('app.academic_years', 'academic_years_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.academic_years', 'academic_years_dates_check', 'check (ends_on >= starts_on)'),
      ('app.academic_years', 'academic_years_periods_check', 'check (periods in (''Trimestres'', ''Semestres''))'),
      ('app.academic_years', 'academic_years_school_label_key', 'unique (school_id, label)'),
      ('app.school_cycles', 'school_cycles_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.school_cycles', 'school_cycles_key_check', 'check (cycle_key in (''nursery'', ''primary'', ''secondary''))'),
      ('app.school_cycles', 'school_cycles_school_key_key', 'unique (school_id, cycle_key)'),
      ('app.school_contacts', 'school_contacts_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.school_contacts', 'school_contacts_school_key', 'unique (school_id)'),
      ('app.classes', 'classes_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.classes', 'classes_year_fkey', 'foreign key (school_id, academic_year_id) references app.academic_years(school_id, id) on delete restrict'),
      ('app.classes', 'classes_teacher_fkey', 'foreign key (school_id, teacher_profile_id) references iam.profiles(school_id, id) on delete set null (teacher_profile_id)'),
      ('app.classes', 'classes_cycle_check', 'check (cycle_key in (''nursery'', ''primary'', ''secondary''))'),
      ('app.students', 'students_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.students', 'students_class_fkey', 'foreign key (school_id, class_id) references app.classes(school_id, id) on delete set null (class_id)'),
      ('app.students', 'students_creator_fkey', 'foreign key (school_id, created_by) references iam.profiles(school_id, id) on delete set null (created_by)'),
      ('app.students', 'students_gender_check', 'check (gender is null or gender in (''M'', ''F''))'),
      ('app.students', 'students_lifecycle_check', 'check (lifecycle_status in (''draft'', ''active'', ''archived''))'),
      ('app.students', 'students_draft_class_check', 'check (lifecycle_status <> ''draft'' or class_id is null)'),
      ('app.students', 'students_print_count_check', 'check (card_print_count >= 0)'),
      ('app.students', 'students_school_matricule_key', 'unique (school_id, matricule)'),
      ('app.student_guardians', 'student_guardians_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.student_guardians', 'student_guardians_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.student_guardians', 'student_guardians_profile_fkey', 'foreign key (school_id, profile_id) references iam.profiles(school_id, id) on delete set null (profile_id)'),
      ('app.student_guardians', 'student_guardians_creator_fkey', 'foreign key (school_id, created_by) references iam.profiles(school_id, id) on delete set null (created_by)'),
      ('app.student_guardians', 'student_guardians_type_check', 'check (guardian_type in (''pere'', ''mere'', ''tuteur'', ''autre''))'),
      ('app.student_enrollments', 'student_enrollments_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.student_enrollments', 'student_enrollments_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.student_enrollments', 'student_enrollments_year_fkey', 'foreign key (school_id, academic_year_id) references app.academic_years(school_id, id) on delete restrict'),
      ('app.student_enrollments', 'student_enrollments_class_fkey', 'foreign key (school_id, class_id) references app.classes(school_id, id) on delete restrict'),
      ('app.student_enrollments', 'student_enrollments_creator_fkey', 'foreign key (school_id, created_by) references iam.profiles(school_id, id) on delete set null (created_by)'),
      ('app.student_enrollments', 'student_enrollments_status_check', 'check (status in (''draft'', ''active'', ''completed'', ''cancelled''))'),
      ('app.student_enrollments', 'student_enrollments_dates_check', 'check (ends_on is null or ends_on >= starts_on)'),
      ('app.student_enrollment_events', 'enrollment_events_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.student_enrollment_events', 'enrollment_events_enrollment_fkey', 'foreign key (school_id, enrollment_id) references app.student_enrollments(school_id, id) on delete cascade'),
      ('app.student_enrollment_events', 'enrollment_events_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.student_enrollment_events', 'enrollment_events_actor_fkey', 'foreign key (school_id, actor_profile_id) references iam.profiles(school_id, id) on delete set null (actor_profile_id)'),
      ('app.parent_invitations', 'parent_invitations_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.parent_invitations', 'parent_invitations_profile_fkey', 'foreign key (school_id, profile_id) references iam.profiles(school_id, id) on delete cascade'),
      ('app.parent_invitations', 'parent_invitations_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.parent_invitations', 'parent_invitations_inviter_fkey', 'foreign key (school_id, invited_by) references iam.profiles(school_id, id) on delete restrict'),
      ('app.parent_invitations', 'parent_invitations_hash_check', 'check (token_hash ~ ''^[a-f0-9]{64}$'')'),
      ('app.parent_invitations', 'parent_invitations_status_check', 'check (status in (''pending_activation'', ''accepted'', ''expired'', ''revoked''))'),
      ('app.card_print_requests', 'card_requests_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.card_print_requests', 'card_requests_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.card_print_requests', 'card_requests_year_fkey', 'foreign key (school_id, academic_year_id) references app.academic_years(school_id, id) on delete restrict'),
      ('app.card_print_requests', 'card_requests_actor_fkey', 'foreign key (school_id, requested_by) references iam.profiles(school_id, id) on delete restrict'),
      ('app.card_print_requests', 'card_requests_format_check', 'check (format in (''badge'', ''carte''))'),
      ('app.card_print_requests', 'card_requests_status_check', 'check (status in (''pending'', ''submitted'', ''printed'', ''failed''))'),
      ('app.card_print_requests', 'card_requests_version_check', 'check (version > 0)'),
      ('app.locations', 'locations_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.locations', 'locations_kind_check', 'check (kind in (''gate'', ''door'', ''classroom'', ''office'', ''control_point''))'),
      ('app.locations', 'locations_school_code_key', 'unique (school_id, code)'),
      ('app.security_portals', 'security_portals_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.security_portals', 'security_portals_location_fkey', 'foreign key (school_id, location_id) references app.locations(school_id, id) on delete set null (location_id)'),
      ('app.security_portals', 'security_portals_school_code_key', 'unique (school_id, code)'),
      ('app.student_cards', 'student_cards_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.student_cards', 'student_cards_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.student_cards', 'student_cards_replacement_fkey', 'foreign key (school_id, replaced_by_card_id) references app.student_cards(school_id, id) on delete set null (replaced_by_card_id)'),
      ('app.student_cards', 'student_cards_status_check', 'check (status in (''active'', ''lost'', ''revoked'', ''replaced''))'),
      ('app.student_cards', 'student_cards_school_number_key', 'unique (school_id, card_number)'),
      ('app.security_events', 'security_events_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.security_events', 'security_events_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete set null (student_id)'),
      ('app.security_events', 'security_events_card_fkey', 'foreign key (school_id, card_id) references app.student_cards(school_id, id) on delete set null (card_id)'),
      ('app.security_events', 'security_events_location_fkey', 'foreign key (school_id, location_id) references app.locations(school_id, id) on delete set null (location_id)'),
      ('app.security_events', 'security_events_portal_fkey', 'foreign key (school_id, portal_id) references app.security_portals(school_id, id) on delete set null (portal_id)'),
      ('app.security_events', 'security_events_scanner_fkey', 'foreign key (school_id, scanned_by) references iam.profiles(school_id, id) on delete set null (scanned_by)'),
      ('app.security_events', 'security_events_authorized_person_fkey', 'foreign key (school_id, authorized_person_id) references app.student_guardians(school_id, id) on delete set null (authorized_person_id)'),
      ('app.alert_rules', 'alert_rules_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.alert_rules', 'alert_rules_school_code_key', 'unique (school_id, code)'),
      ('app.alert_rules', 'alert_rules_cooldown_check', 'check (cooldown_seconds >= 0)'),
      ('app.alerts', 'alerts_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.alerts', 'alerts_rule_fkey', 'foreign key (school_id, rule_id) references app.alert_rules(school_id, id) on delete set null (rule_id)'),
      ('app.alerts', 'alerts_assignee_fkey', 'foreign key (school_id, assigned_to) references iam.profiles(school_id, id) on delete set null (assigned_to)'),
      ('app.alerts', 'alerts_ack_actor_fkey', 'foreign key (school_id, acknowledged_by) references iam.profiles(school_id, id) on delete set null (acknowledged_by)'),
      ('app.alerts', 'alerts_resolve_actor_fkey', 'foreign key (school_id, resolved_by) references iam.profiles(school_id, id) on delete set null (resolved_by)'),
      ('app.alerts', 'alerts_occurrence_check', 'check (occurrence_count > 0)'),
      ('app.alert_notifications', 'alert_notifications_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.alert_notifications', 'alert_notifications_alert_fkey', 'foreign key (school_id, alert_id) references app.alerts(school_id, id) on delete cascade'),
      ('app.alert_notifications', 'alert_notifications_profile_fkey', 'foreign key (school_id, profile_id) references iam.profiles(school_id, id) on delete set null (profile_id)'),
      ('app.fee_structures', 'fee_structures_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.fee_structures', 'fee_structures_year_fkey', 'foreign key (school_id, academic_year_id) references app.academic_years(school_id, id) on delete restrict'),
      ('app.fee_structures', 'fee_structures_amount_check', 'check (amount >= 0)'),
      ('app.student_fees', 'student_fees_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.student_fees', 'student_fees_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.student_fees', 'student_fees_structure_fkey', 'foreign key (school_id, fee_structure_id) references app.fee_structures(school_id, id) on delete restrict'),
      ('app.student_fees', 'student_fees_amounts_check', 'check (amount_expected >= 0 and amount_paid >= 0 and amount_remaining >= 0)'),
      ('app.student_fees', 'student_fees_status_check', 'check (status in (''pending'', ''partial'', ''paid'', ''waived'', ''cancelled''))'),
      ('app.cash_registers', 'cash_registers_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.cash_registers', 'cash_registers_opener_fkey', 'foreign key (school_id, opened_by) references iam.profiles(school_id, id) on delete set null (opened_by)'),
      ('app.cash_registers', 'cash_registers_closer_fkey', 'foreign key (school_id, closed_by) references iam.profiles(school_id, id) on delete set null (closed_by)'),
      ('app.cash_registers', 'cash_registers_status_check', 'check (status in (''open'', ''closed''))'),
      ('app.cash_registers', 'cash_registers_school_date_key', 'unique (school_id, register_date)'),
      ('app.fee_payments', 'fee_payments_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.fee_payments', 'fee_payments_student_fee_fkey', 'foreign key (school_id, student_fee_id) references app.student_fees(school_id, id) on delete restrict'),
      ('app.fee_payments', 'fee_payments_receiver_fkey', 'foreign key (school_id, received_by) references iam.profiles(school_id, id) on delete restrict'),
      ('app.fee_payments', 'fee_payments_canceller_fkey', 'foreign key (school_id, cancelled_by) references iam.profiles(school_id, id) on delete set null (cancelled_by)'),
      ('app.fee_payments', 'fee_payments_amount_check', 'check (amount > 0)'),
      ('app.fee_payments', 'fee_payments_status_check', 'check (status in (''valid'', ''cancelled''))'),
      ('app.fee_payments', 'fee_payments_version_check', 'check (version > 0)'),
      ('app.cash_register_closures', 'cash_closures_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.cash_register_closures', 'cash_closures_register_fkey', 'foreign key (school_id, cash_register_id) references app.cash_registers(school_id, id) on delete restrict'),
      ('app.cash_register_closures', 'cash_closures_actor_fkey', 'foreign key (school_id, closed_by) references iam.profiles(school_id, id) on delete restrict'),
      ('app.cash_register_closures', 'cash_closures_status_check', 'check (status in (''closed'', ''reopened'', ''adjusted''))'),
      ('app.cash_register_closures', 'cash_closures_school_date_key', 'unique (school_id, closure_date)'),
      ('app.fee_control_campaigns', 'fee_campaigns_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.fee_control_campaigns', 'fee_campaigns_structure_fkey', 'foreign key (school_id, fee_structure_id) references app.fee_structures(school_id, id) on delete restrict'),
      ('app.fee_control_campaigns', 'fee_campaigns_creator_fkey', 'foreign key (school_id, created_by) references iam.profiles(school_id, id) on delete restrict'),
      ('app.fee_control_campaigns', 'fee_campaigns_dates_check', 'check (ends_at is null or starts_at is null or ends_at >= starts_at)'),
      ('app.fee_control_campaigns', 'fee_campaigns_status_check', 'check (status in (''draft'', ''published'', ''closed'', ''cancelled''))'),
      ('app.fee_control_assignees', 'fee_assignees_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.fee_control_assignees', 'fee_assignees_campaign_fkey', 'foreign key (school_id, campaign_id) references app.fee_control_campaigns(school_id, id) on delete cascade'),
      ('app.fee_control_assignees', 'fee_assignees_profile_fkey', 'foreign key (school_id, profile_id) references iam.profiles(school_id, id) on delete cascade'),
      ('app.fee_control_scans', 'fee_scans_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.fee_control_scans', 'fee_scans_campaign_fkey', 'foreign key (school_id, campaign_id) references app.fee_control_campaigns(school_id, id) on delete restrict'),
      ('app.fee_control_scans', 'fee_scans_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete restrict'),
      ('app.fee_control_scans', 'fee_scans_scanner_fkey', 'foreign key (school_id, scanned_by) references iam.profiles(school_id, id) on delete restrict'),
      ('app.fee_control_scans', 'fee_scans_location_fkey', 'foreign key (school_id, location_id) references app.locations(school_id, id) on delete set null (location_id)'),
      ('app.subjects', 'subjects_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.subjects', 'subjects_year_fkey', 'foreign key (school_id, academic_year_id) references app.academic_years(school_id, id) on delete restrict'),
      ('app.subjects', 'subjects_school_year_code_key', 'unique (school_id, academic_year_id, code)'),
      ('app.teacher_assignments', 'teacher_assignments_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.teacher_assignments', 'teacher_assignments_year_fkey', 'foreign key (school_id, academic_year_id) references app.academic_years(school_id, id) on delete restrict'),
      ('app.teacher_assignments', 'teacher_assignments_class_fkey', 'foreign key (school_id, class_id) references app.classes(school_id, id) on delete cascade'),
      ('app.teacher_assignments', 'teacher_assignments_subject_fkey', 'foreign key (school_id, subject_id) references app.subjects(school_id, id) on delete cascade'),
      ('app.teacher_assignments', 'teacher_assignments_profile_fkey', 'foreign key (school_id, teacher_profile_id) references iam.profiles(school_id, id) on delete cascade'),
      ('app.teacher_assignments', 'teacher_assignments_dates_check', 'check (ends_on is null or ends_on >= starts_on)'),
      ('app.assignments', 'assignments_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.assignments', 'assignments_year_fkey', 'foreign key (school_id, academic_year_id) references app.academic_years(school_id, id) on delete restrict'),
      ('app.assignments', 'assignments_class_fkey', 'foreign key (school_id, class_id) references app.classes(school_id, id) on delete restrict'),
      ('app.assignments', 'assignments_subject_fkey', 'foreign key (school_id, subject_id) references app.subjects(school_id, id) on delete restrict'),
      ('app.assignments', 'assignments_teacher_fkey', 'foreign key (school_id, teacher_profile_id) references iam.profiles(school_id, id) on delete restrict'),
      ('app.assignments', 'assignments_coefficient_check', 'check (coefficient > 0)'),
      ('app.assignments', 'assignments_status_check', 'check (status in (''draft'', ''published'', ''closed'', ''cancelled''))'),
      ('app.assignment_questions', 'assignment_questions_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.assignment_questions', 'assignment_questions_assignment_fkey', 'foreign key (school_id, assignment_id) references app.assignments(school_id, id) on delete cascade'),
      ('app.assignment_questions', 'assignment_questions_points_check', 'check (points >= 0)'),
      ('app.grades', 'grades_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.grades', 'grades_assignment_fkey', 'foreign key (school_id, assignment_id) references app.assignments(school_id, id) on delete cascade'),
      ('app.grades', 'grades_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.grades', 'grades_creator_fkey', 'foreign key (school_id, created_by) references iam.profiles(school_id, id) on delete restrict'),
      ('app.grades', 'grades_updater_fkey', 'foreign key (school_id, updated_by) references iam.profiles(school_id, id) on delete set null (updated_by)'),
      ('app.grades', 'grades_value_check', 'check (value_numeric is not null or value_text is not null)'),
      ('app.grades', 'grades_status_check', 'check (status in (''draft'', ''published'', ''corrected''))'),
      ('app.grades', 'grades_assignment_student_key', 'unique (assignment_id, student_id)'),
      ('app.lesson_plans', 'lesson_plans_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.lesson_plans', 'lesson_plans_year_fkey', 'foreign key (school_id, academic_year_id) references app.academic_years(school_id, id) on delete restrict'),
      ('app.lesson_plans', 'lesson_plans_class_fkey', 'foreign key (school_id, class_id) references app.classes(school_id, id) on delete restrict'),
      ('app.lesson_plans', 'lesson_plans_subject_fkey', 'foreign key (school_id, subject_id) references app.subjects(school_id, id) on delete restrict'),
      ('app.lesson_plans', 'lesson_plans_teacher_fkey', 'foreign key (school_id, teacher_profile_id) references iam.profiles(school_id, id) on delete restrict'),
      ('app.lesson_plans', 'lesson_plans_homework_fkey', 'foreign key (school_id, homework_assignment_id) references app.assignments(school_id, id) on delete set null (homework_assignment_id)'),
      ('app.approval_requests', 'approval_requests_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.approval_requests', 'approval_requests_requester_fkey', 'foreign key (school_id, requested_by) references iam.profiles(school_id, id) on delete restrict'),
      ('app.approval_requests', 'approval_requests_decider_fkey', 'foreign key (school_id, decided_by) references iam.profiles(school_id, id) on delete set null (decided_by)'),
      ('app.approval_requests', 'approval_requests_status_check', 'check (status in (''pending'', ''approved'', ''rejected'', ''cancelled''))'),
      ('app.approval_requests', 'approval_requests_version_check', 'check (expected_version > 0)'),
      ('app.rankings', 'rankings_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.rankings', 'rankings_class_fkey', 'foreign key (school_id, class_id) references app.classes(school_id, id) on delete cascade'),
      ('app.rankings', 'rankings_computer_fkey', 'foreign key (school_id, computed_by_profile_id) references iam.profiles(school_id, id) on delete set null (computed_by_profile_id)'),
      ('app.rankings', 'rankings_status_check', 'check (status in (''draft'', ''published'', ''archived''))'),
      ('app.ranking_entries', 'ranking_entries_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.ranking_entries', 'ranking_entries_ranking_fkey', 'foreign key (school_id, ranking_id) references app.rankings(school_id, id) on delete cascade'),
      ('app.ranking_entries', 'ranking_entries_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.ranking_entries', 'ranking_entries_rank_check', 'check (rank > 0)'),
      ('app.ranking_entries', 'ranking_entries_ranking_student_key', 'unique (ranking_id, student_id)'),
      ('app.ranking_stars', 'ranking_stars_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('app.ranking_stars', 'ranking_stars_ranking_fkey', 'foreign key (school_id, ranking_id) references app.rankings(school_id, id) on delete cascade'),
      ('app.ranking_stars', 'ranking_stars_student_fkey', 'foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade'),
      ('app.ranking_stars', 'ranking_stars_parent_fkey', 'foreign key (school_id, parent_profile_id) references iam.profiles(school_id, id) on delete cascade'),
      ('app.ranking_stars', 'ranking_stars_unique_key', 'unique (ranking_id, student_id, parent_profile_id)'),
      ('iam.profiles', 'profiles_user_fkey', 'foreign key (user_id) references iam.users(id) on delete set null'),
      ('iam.profiles', 'profiles_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.profiles', 'profiles_status_check', 'check (account_status in (''active'', ''pending_activation'', ''suspended'', ''closed''))'),
      ('iam.devices', 'devices_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.devices', 'devices_profile_fkey', 'foreign key (school_id, profile_id) references iam.profiles(school_id, id) on delete cascade'),
      ('iam.devices', 'devices_profile_key_key', 'unique (profile_id, device_key)'),
      ('iam.roles', 'roles_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.roles', 'roles_creator_fkey', 'foreign key (school_id, created_by) references iam.profiles(school_id, id) on delete set null (created_by)'),
      ('iam.roles', 'roles_school_code_key', 'unique (school_id, code)'),
      ('iam.permissions', 'permissions_code_key', 'unique (code)'),
      ('iam.permissions', 'permissions_default_scope_fkey', 'foreign key (default_scope_code) references iam.scopes(code) on delete restrict deferrable initially deferred'),
      ('iam.profile_roles', 'profile_roles_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.profile_roles', 'profile_roles_profile_fkey', 'foreign key (school_id, profile_id) references iam.profiles(school_id, id) on delete cascade'),
      ('iam.profile_roles', 'profile_roles_role_fkey', 'foreign key (school_id, role_id) references iam.roles(school_id, id) on delete cascade'),
      ('iam.profile_roles', 'profile_roles_assigner_fkey', 'foreign key (school_id, assigned_by) references iam.profiles(school_id, id) on delete set null (assigned_by)'),
      ('iam.profile_roles', 'profile_roles_dates_check', 'check (ends_at is null or ends_at >= starts_at)'),
      ('iam.role_permission_grants', 'role_grants_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.role_permission_grants', 'role_grants_role_fkey', 'foreign key (school_id, role_id) references iam.roles(school_id, id) on delete cascade'),
      ('iam.role_permission_grants', 'role_grants_permission_fkey', 'foreign key (permission_id) references iam.permissions(id) on delete cascade'),
      ('iam.role_permission_grants', 'role_grants_actor_fkey', 'foreign key (school_id, granted_by) references iam.profiles(school_id, id) on delete set null (granted_by)'),
      ('iam.role_permission_grants', 'role_grants_effect_check', 'check (effect in (''allow'', ''deny''))'),
      ('iam.role_permission_grants', 'role_grants_dates_check', 'check (ends_at is null or ends_at >= starts_at)'),
      ('iam.permission_conditions', 'permission_conditions_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.permission_conditions', 'permission_conditions_grant_fkey', 'foreign key (school_id, grant_id) references iam.role_permission_grants(school_id, id) on delete cascade'),
      ('iam.permission_conditions', 'permission_conditions_creator_fkey', 'foreign key (school_id, created_by) references iam.profiles(school_id, id) on delete set null (created_by)'),
      ('iam.permission_conditions', 'permission_conditions_code_check', 'check (condition_code in (''academic_year_active'', ''cash_register_open'', ''campaign_published'', ''within_cancellation_window'', ''quota_available'', ''device_managed'', ''status_pending'', ''portal_open''))'),
      ('iam.profile_permission_exceptions', 'profile_exceptions_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.profile_permission_exceptions', 'profile_exceptions_profile_fkey', 'foreign key (school_id, profile_id) references iam.profiles(school_id, id) on delete cascade'),
      ('iam.profile_permission_exceptions', 'profile_exceptions_permission_fkey', 'foreign key (permission_id) references iam.permissions(id) on delete cascade'),
      ('iam.profile_permission_exceptions', 'profile_exceptions_actor_fkey', 'foreign key (school_id, granted_by) references iam.profiles(school_id, id) on delete restrict'),
      ('iam.profile_permission_exceptions', 'profile_exceptions_effect_check', 'check (effect in (''allow'', ''deny''))'),
      ('iam.profile_permission_exceptions', 'profile_exceptions_condition_check', 'check (condition_code is null or condition_code in (''academic_year_active'', ''cash_register_open'', ''campaign_published'', ''within_cancellation_window'', ''quota_available'', ''device_managed'', ''status_pending'', ''portal_open''))'),
      ('iam.profile_permission_exceptions', 'profile_exceptions_dates_check', 'check (expires_at is null or expires_at >= starts_at)'),
      ('iam.grant_scopes', 'grant_scopes_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.grant_scopes', 'grant_scopes_grant_fkey', 'foreign key (school_id, grant_id) references iam.role_permission_grants(school_id, id) on delete cascade'),
      ('iam.grant_scopes', 'grant_scopes_scope_fkey', 'foreign key (scope_code) references iam.scopes(code) on delete restrict'),
      ('iam.grant_scopes', 'grant_scopes_actor_fkey', 'foreign key (school_id, assigned_by) references iam.profiles(school_id, id) on delete set null (assigned_by)'),
      ('iam.grant_scopes', 'grant_scopes_dates_check', 'check (ends_at is null or ends_at >= starts_at)'),
      ('iam.exception_scopes', 'exception_scopes_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('iam.exception_scopes', 'exception_scopes_exception_fkey', 'foreign key (school_id, exception_id) references iam.profile_permission_exceptions(school_id, id) on delete cascade'),
      ('iam.exception_scopes', 'exception_scopes_scope_fkey', 'foreign key (scope_code) references iam.scopes(code) on delete restrict'),
      ('iam.exception_scopes', 'exception_scopes_actor_fkey', 'foreign key (school_id, assigned_by) references iam.profiles(school_id, id) on delete set null (assigned_by)'),
      ('iam.exception_scopes', 'exception_scopes_dates_check', 'check (ends_at is null or ends_at >= starts_at)'),
      ('audit.events', 'audit_events_school_fkey', 'foreign key (school_id) references app.schools(id) on delete restrict'),
      ('audit.events', 'audit_events_actor_fkey', 'foreign key (school_id, actor_profile_id) references iam.profiles(school_id, id) on delete set null (actor_profile_id)'),
      ('audit.events', 'audit_events_type_check', 'check (pg_catalog.length(pg_catalog.btrim(event_type)) > 0)'),
      ('ops.schema_versions', 'schema_versions_hash_check', 'check (sha256 ~ ''^[a-f0-9]{64}$'')'),
      ('ops.schema_versions', 'schema_versions_order_check', 'check (unit_order between 1 and 13)'),
      ('ops.system_events', 'system_events_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('ops.system_events', 'system_events_actor_fkey', 'foreign key (school_id, actor_profile_id) references iam.profiles(school_id, id) on delete set null (actor_profile_id)'),
      ('ops.system_events', 'system_events_status_check', 'check (status in (''pending'', ''processing'', ''completed'', ''failed'', ''cancelled''))'),
      ('ops.notification_templates', 'notification_templates_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('ops.notification_templates', 'notification_templates_channel_check', 'check (channel in (''EMAIL'', ''SMS'', ''IN_APP'', ''PUSH''))'),
      ('ops.notifications', 'notifications_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('ops.notifications', 'notifications_profile_fkey', 'foreign key (school_id, profile_id) references iam.profiles(school_id, id) on delete cascade'),
      ('ops.notifications', 'notifications_event_fkey', 'foreign key (school_id, event_id) references ops.system_events(school_id, id) on delete set null (event_id)'),
      ('ops.notifications', 'notifications_channel_check', 'check (channel in (''EMAIL'', ''SMS'', ''IN_APP'', ''PUSH''))'),
      ('ops.notifications', 'notifications_status_check', 'check (status in (''PENDING'', ''QUEUED'', ''SENT'', ''FAILED'', ''DELIVERED'', ''DISMISSED''))'),
      ('ops.notifications', 'notifications_retry_check', 'check (retry_count >= 0 and max_retries >= 0 and retry_count <= max_retries)'),
      ('ops.data_retention_policies', 'retention_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('ops.data_retention_policies', 'retention_days_check', 'check (retention_days > 0)'),
      ('ops.data_retention_policies', 'retention_target_check', 'check (archive_target in (''D1'', ''R2'', ''NONE''))'),
      ('ops.document_number_sequences', 'document_sequences_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade'),
      ('ops.document_number_sequences', 'document_sequences_last_check', 'check (last_number >= 0)'),
      ('ops.document_number_sequences', 'document_sequences_school_type_key', 'unique (school_id, document_type)'),
      ('ops.indicator_snapshots', 'indicator_snapshots_school_fkey', 'foreign key (school_id) references app.schools(id) on delete cascade')
    ) as constraints(table_name, constraint_name, definition)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = pg_catalog.to_regclass(v_constraint.table_name)
        and conname = v_constraint.constraint_name
    ) then
      execute pg_catalog.format(
        'alter table %s add constraint %I %s',
        v_constraint.table_name,
        v_constraint.constraint_name,
        v_constraint.definition
      );
    end if;
  end loop;
end
$schoolsafe$;

create unique index if not exists academic_years_one_active_idx on app.academic_years (school_id) where is_active;
create unique index if not exists classes_school_year_name_idx on app.classes (school_id, academic_year_id, name, coalesce(option, ''));
create unique index if not exists student_enrollments_one_active_idx on app.student_enrollments (student_id) where status = 'active';
create unique index if not exists student_enrollments_one_draft_idx on app.student_enrollments (student_id) where status = 'draft';
create unique index if not exists parent_invitations_token_hash_idx on app.parent_invitations (token_hash);
create unique index if not exists parent_invitations_pending_profile_idx on app.parent_invitations (profile_id) where status = 'pending_activation';
create unique index if not exists fee_payments_receipt_idx on app.fee_payments (school_id, receipt_no) where receipt_no is not null;
create unique index if not exists teacher_assignments_active_exact_idx on app.teacher_assignments (school_id, teacher_profile_id, class_id, subject_id, academic_year_id) where is_active;
create unique index if not exists rankings_school_period_class_idx on app.rankings (school_id, period_code, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index if not exists iam_users_external_subject_idx on iam.users (auth_provider, external_subject) where external_subject is not null;
create unique index if not exists iam_users_email_idx on iam.users (pg_catalog.lower(email)) where email is not null;
create unique index if not exists profiles_school_email_idx on iam.profiles (school_id, pg_catalog.lower(email)) where email is not null;
create unique index if not exists role_grants_identity_idx on iam.role_permission_grants (school_id, role_id, permission_id);
create unique index if not exists permission_conditions_identity_idx on iam.permission_conditions (grant_id, condition_code);
create unique index if not exists profile_exceptions_identity_idx on iam.profile_permission_exceptions (school_id, profile_id, permission_id);
create unique index if not exists grant_scopes_identity_idx on iam.grant_scopes (school_id, grant_id, scope_code, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index if not exists exception_scopes_identity_idx on iam.exception_scopes (school_id, exception_id, scope_code, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index if not exists notification_templates_identity_idx on ops.notification_templates (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, channel, language);
create unique index if not exists retention_policy_identity_idx on ops.data_retention_policies (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), entity_type);
create unique index if not exists indicator_snapshot_identity_idx on ops.indicator_snapshots (school_id, snapshot_date, indicator_code, dimensions);

create index if not exists school_settings_lockdown_actor_idx on app.school_settings (lockdown_activated_by);
create index if not exists academic_years_school_idx on app.academic_years (school_id, starts_on desc);
create index if not exists school_cycles_school_idx on app.school_cycles (school_id);
create index if not exists school_contacts_school_idx on app.school_contacts (school_id);
create index if not exists classes_school_year_idx on app.classes (school_id, academic_year_id);
create index if not exists classes_teacher_idx on app.classes (teacher_profile_id) where teacher_profile_id is not null;
create index if not exists students_school_lifecycle_idx on app.students (school_id, lifecycle_status, last_name, first_name);
create index if not exists students_class_idx on app.students (class_id) where class_id is not null;
create index if not exists student_guardians_student_idx on app.student_guardians (student_id);
create index if not exists student_guardians_profile_idx on app.student_guardians (profile_id) where profile_id is not null;
create index if not exists enrollments_school_status_idx on app.student_enrollments (school_id, status);
create index if not exists enrollments_class_idx on app.student_enrollments (class_id) where class_id is not null;
create index if not exists enrollment_events_student_created_idx on app.student_enrollment_events (student_id, created_at desc);
create index if not exists card_requests_school_status_idx on app.card_print_requests (school_id, status, requested_at desc);
create index if not exists card_requests_student_idx on app.card_print_requests (student_id);
create index if not exists security_portals_school_active_idx on app.security_portals (school_id, is_active);
create index if not exists student_cards_student_status_idx on app.student_cards (student_id, status);
create index if not exists security_events_school_occurred_idx on app.security_events (school_id, occurred_at desc);
create index if not exists security_events_student_idx on app.security_events (student_id, occurred_at desc) where student_id is not null;
create index if not exists alerts_school_status_idx on app.alerts (school_id, status, detected_at desc);
create index if not exists alert_notifications_alert_idx on app.alert_notifications (alert_id);
create index if not exists fee_structures_school_year_idx on app.fee_structures (school_id, academic_year_id);
create index if not exists student_fees_student_idx on app.student_fees (student_id, status);
create index if not exists student_fees_structure_idx on app.student_fees (fee_structure_id);
create index if not exists fee_payments_student_fee_idx on app.fee_payments (student_fee_id, received_at desc);
create index if not exists fee_payments_school_received_idx on app.fee_payments (school_id, received_at desc);
create index if not exists cash_closures_register_idx on app.cash_register_closures (cash_register_id);
create index if not exists fee_campaigns_school_status_idx on app.fee_control_campaigns (school_id, status);
create index if not exists fee_assignees_profile_idx on app.fee_control_assignees (profile_id);
create index if not exists fee_scans_campaign_idx on app.fee_control_scans (campaign_id, scanned_at desc);
create index if not exists teacher_assignments_teacher_idx on app.teacher_assignments (school_id, teacher_profile_id, is_active);
create index if not exists teacher_assignments_class_subject_idx on app.teacher_assignments (school_id, class_id, subject_id, is_active);
create index if not exists assignments_class_subject_idx on app.assignments (school_id, class_id, subject_id, status);
create index if not exists assignment_questions_assignment_idx on app.assignment_questions (assignment_id, order_index);
create index if not exists grades_student_idx on app.grades (student_id, status);
create index if not exists lesson_plans_teacher_date_idx on app.lesson_plans (teacher_profile_id, lesson_date desc);
create index if not exists approval_requests_school_status_idx on app.approval_requests (school_id, status, requested_at desc);
create index if not exists approval_requests_entity_idx on app.approval_requests (entity_type, entity_id);
create index if not exists rankings_school_status_idx on app.rankings (school_id, status, period_code desc);
create index if not exists ranking_entries_student_idx on app.ranking_entries (student_id);
create index if not exists ranking_stars_parent_idx on app.ranking_stars (parent_profile_id);
create index if not exists profiles_school_user_idx on iam.profiles (school_id, user_id);
create index if not exists profile_roles_role_idx on iam.profile_roles (role_id, is_active);
create index if not exists role_grants_permission_idx on iam.role_permission_grants (permission_id, effect, is_active);
create index if not exists permission_conditions_grant_idx on iam.permission_conditions (grant_id, is_active);
create index if not exists profile_exceptions_lookup_idx on iam.profile_permission_exceptions (profile_id, permission_id, effect, is_active);
create index if not exists grant_scopes_lookup_idx on iam.grant_scopes (school_id, grant_id, scope_code, target_id, is_active);
create index if not exists exception_scopes_lookup_idx on iam.exception_scopes (school_id, exception_id, scope_code, target_id, is_active);
create index if not exists audit_events_school_occurred_idx on audit.events (school_id, occurred_at desc);
create index if not exists audit_events_actor_idx on audit.events (actor_profile_id, occurred_at desc) where actor_profile_id is not null;
create index if not exists system_events_pending_idx on ops.system_events (school_id, created_at) where status = 'pending';
create index if not exists notifications_pending_idx on ops.notifications (school_id, created_at) where status in ('PENDING', 'QUEUED');
create index if not exists notifications_profile_idx on ops.notifications (profile_id, created_at desc);
create index if not exists indicator_snapshots_school_code_idx on ops.indicator_snapshots (school_id, indicator_code, snapshot_date desc);

commit;
