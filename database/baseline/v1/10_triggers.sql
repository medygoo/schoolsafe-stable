\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

create or replace function ops.set_updated_at()
returns trigger
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$schoolsafe$;

do $schoolsafe$
declare
  v_table regclass;
  v_trigger_name text;
begin
  foreach v_table in array array[
    'app.schools'::regclass,
    'app.school_settings'::regclass,
    'app.academic_years'::regclass,
    'app.school_cycles'::regclass,
    'app.school_contacts'::regclass,
    'app.classes'::regclass,
    'app.students'::regclass,
    'app.student_guardians'::regclass,
    'app.student_enrollments'::regclass,
    'app.card_print_requests'::regclass,
    'app.locations'::regclass,
    'app.security_portals'::regclass,
    'app.student_cards'::regclass,
    'app.alert_rules'::regclass,
    'app.alerts'::regclass,
    'app.fee_structures'::regclass,
    'app.student_fees'::regclass,
    'app.cash_registers'::regclass,
    'app.fee_payments'::regclass,
    'app.cash_register_closures'::regclass,
    'app.fee_control_campaigns'::regclass,
    'app.subjects'::regclass,
    'app.teacher_assignments'::regclass,
    'app.assignments'::regclass,
    'app.assignment_questions'::regclass,
    'app.grades'::regclass,
    'app.lesson_plans'::regclass,
    'app.approval_requests'::regclass,
    'app.rankings'::regclass,
    'iam.users'::regclass,
    'iam.profiles'::regclass,
    'iam.roles'::regclass,
    'iam.permissions'::regclass,
    'iam.scopes'::regclass,
    'iam.role_permission_grants'::regclass,
    'iam.permission_conditions'::regclass,
    'iam.profile_permission_exceptions'::regclass,
    'iam.grant_scopes'::regclass,
    'iam.exception_scopes'::regclass,
    'ops.system_events'::regclass,
    'ops.notification_templates'::regclass,
    'ops.notifications'::regclass,
    'ops.data_retention_policies'::regclass,
    'ops.document_number_sequences'::regclass
  ]
  loop
    v_trigger_name := pg_catalog.replace(v_table::text, '.', '_') || '_set_updated_at';
    execute pg_catalog.format('drop trigger if exists %I on %s', v_trigger_name, v_table);
    execute pg_catalog.format(
      'create trigger %I before update on %s for each row execute function ops.set_updated_at()',
      v_trigger_name,
      v_table
    );
  end loop;
end
$schoolsafe$;

create or replace function app.guard_same_school_reference()
returns trigger
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
declare
  v_row jsonb := pg_catalog.to_jsonb(new);
  v_reference_id uuid;
  v_reference_school_id uuid;
  v_relation regclass := pg_catalog.to_regclass(tg_argv[1]);
begin
  v_reference_id := nullif(v_row ->> tg_argv[0], '')::uuid;
  if v_reference_id is null then
    return new;
  end if;
  if v_relation is null then
    raise check_violation using message = 'Tenant reference relation is missing';
  end if;

  execute pg_catalog.format('select school_id from %s where id = $1', v_relation)
    into v_reference_school_id
    using v_reference_id;

  if v_reference_school_id is null or v_reference_school_id <> new.school_id then
    raise check_violation using message = pg_catalog.format(
      'Cross-school reference rejected: %s.%s',
      tg_table_name,
      tg_argv[0]
    );
  end if;

  return new;
end
$schoolsafe$;

do $schoolsafe$
declare
  v_reference record;
  v_trigger_name text;
begin
  for v_reference in
    select * from (values
      ('app.school_settings', 'lockdown_activated_by', 'iam.profiles'),
      ('app.classes', 'academic_year_id', 'app.academic_years'),
      ('app.classes', 'teacher_profile_id', 'iam.profiles'),
      ('app.students', 'class_id', 'app.classes'),
      ('app.students', 'created_by', 'iam.profiles'),
      ('app.student_guardians', 'student_id', 'app.students'),
      ('app.student_guardians', 'profile_id', 'iam.profiles'),
      ('app.student_guardians', 'created_by', 'iam.profiles'),
      ('app.student_enrollments', 'student_id', 'app.students'),
      ('app.student_enrollments', 'academic_year_id', 'app.academic_years'),
      ('app.student_enrollments', 'class_id', 'app.classes'),
      ('app.student_enrollments', 'created_by', 'iam.profiles'),
      ('app.student_enrollment_events', 'enrollment_id', 'app.student_enrollments'),
      ('app.student_enrollment_events', 'student_id', 'app.students'),
      ('app.student_enrollment_events', 'actor_profile_id', 'iam.profiles'),
      ('app.parent_invitations', 'profile_id', 'iam.profiles'),
      ('app.parent_invitations', 'student_id', 'app.students'),
      ('app.parent_invitations', 'invited_by', 'iam.profiles'),
      ('app.card_print_requests', 'student_id', 'app.students'),
      ('app.card_print_requests', 'academic_year_id', 'app.academic_years'),
      ('app.card_print_requests', 'requested_by', 'iam.profiles'),
      ('app.security_portals', 'location_id', 'app.locations'),
      ('app.student_cards', 'student_id', 'app.students'),
      ('app.security_events', 'student_id', 'app.students'),
      ('app.security_events', 'card_id', 'app.student_cards'),
      ('app.security_events', 'location_id', 'app.locations'),
      ('app.security_events', 'portal_id', 'app.security_portals'),
      ('app.security_events', 'scanned_by', 'iam.profiles'),
      ('app.security_events', 'authorized_person_id', 'app.student_guardians'),
      ('app.alerts', 'rule_id', 'app.alert_rules'),
      ('app.alerts', 'assigned_to', 'iam.profiles'),
      ('app.alerts', 'acknowledged_by', 'iam.profiles'),
      ('app.alerts', 'resolved_by', 'iam.profiles'),
      ('app.alert_notifications', 'alert_id', 'app.alerts'),
      ('app.alert_notifications', 'profile_id', 'iam.profiles'),
      ('app.fee_structures', 'academic_year_id', 'app.academic_years'),
      ('app.student_fees', 'student_id', 'app.students'),
      ('app.student_fees', 'fee_structure_id', 'app.fee_structures'),
      ('app.cash_registers', 'opened_by', 'iam.profiles'),
      ('app.cash_registers', 'closed_by', 'iam.profiles'),
      ('app.fee_payments', 'student_fee_id', 'app.student_fees'),
      ('app.fee_payments', 'received_by', 'iam.profiles'),
      ('app.fee_payments', 'cancelled_by', 'iam.profiles'),
      ('app.cash_register_closures', 'cash_register_id', 'app.cash_registers'),
      ('app.cash_register_closures', 'closed_by', 'iam.profiles'),
      ('app.fee_control_campaigns', 'fee_structure_id', 'app.fee_structures'),
      ('app.fee_control_campaigns', 'created_by', 'iam.profiles'),
      ('app.fee_control_scans', 'campaign_id', 'app.fee_control_campaigns'),
      ('app.fee_control_scans', 'student_id', 'app.students'),
      ('app.fee_control_scans', 'scanned_by', 'iam.profiles'),
      ('app.fee_control_scans', 'location_id', 'app.locations'),
      ('app.subjects', 'academic_year_id', 'app.academic_years'),
      ('app.teacher_assignments', 'academic_year_id', 'app.academic_years'),
      ('app.teacher_assignments', 'class_id', 'app.classes'),
      ('app.teacher_assignments', 'subject_id', 'app.subjects'),
      ('app.teacher_assignments', 'teacher_profile_id', 'iam.profiles'),
      ('app.assignments', 'academic_year_id', 'app.academic_years'),
      ('app.assignments', 'class_id', 'app.classes'),
      ('app.assignments', 'subject_id', 'app.subjects'),
      ('app.assignments', 'teacher_profile_id', 'iam.profiles'),
      ('app.assignment_questions', 'assignment_id', 'app.assignments'),
      ('app.grades', 'assignment_id', 'app.assignments'),
      ('app.grades', 'student_id', 'app.students'),
      ('app.grades', 'created_by', 'iam.profiles'),
      ('app.grades', 'updated_by', 'iam.profiles'),
      ('app.lesson_plans', 'academic_year_id', 'app.academic_years'),
      ('app.lesson_plans', 'class_id', 'app.classes'),
      ('app.lesson_plans', 'subject_id', 'app.subjects'),
      ('app.lesson_plans', 'teacher_profile_id', 'iam.profiles'),
      ('app.lesson_plans', 'homework_assignment_id', 'app.assignments'),
      ('app.approval_requests', 'requested_by', 'iam.profiles'),
      ('app.approval_requests', 'decided_by', 'iam.profiles'),
      ('app.rankings', 'class_id', 'app.classes'),
      ('app.rankings', 'computed_by_profile_id', 'iam.profiles'),
      ('app.ranking_entries', 'ranking_id', 'app.rankings'),
      ('app.ranking_entries', 'student_id', 'app.students'),
      ('app.ranking_stars', 'ranking_id', 'app.rankings'),
      ('app.ranking_stars', 'student_id', 'app.students'),
      ('app.ranking_stars', 'parent_profile_id', 'iam.profiles'),
      ('iam.devices', 'profile_id', 'iam.profiles'),
      ('iam.roles', 'created_by', 'iam.profiles'),
      ('iam.profile_roles', 'profile_id', 'iam.profiles'),
      ('iam.profile_roles', 'role_id', 'iam.roles'),
      ('iam.profile_roles', 'assigned_by', 'iam.profiles'),
      ('iam.role_permission_grants', 'role_id', 'iam.roles'),
      ('iam.role_permission_grants', 'granted_by', 'iam.profiles'),
      ('iam.permission_conditions', 'grant_id', 'iam.role_permission_grants'),
      ('iam.permission_conditions', 'created_by', 'iam.profiles'),
      ('iam.profile_permission_exceptions', 'profile_id', 'iam.profiles'),
      ('iam.profile_permission_exceptions', 'granted_by', 'iam.profiles'),
      ('iam.grant_scopes', 'grant_id', 'iam.role_permission_grants'),
      ('iam.grant_scopes', 'assigned_by', 'iam.profiles'),
      ('iam.exception_scopes', 'exception_id', 'iam.profile_permission_exceptions'),
      ('iam.exception_scopes', 'assigned_by', 'iam.profiles'),
      ('audit.events', 'actor_profile_id', 'iam.profiles'),
      ('ops.system_events', 'actor_profile_id', 'iam.profiles'),
      ('ops.notifications', 'profile_id', 'iam.profiles')
    ) as tenant_refs(table_name, column_name, reference_table)
  loop
    v_trigger_name := pg_catalog.replace(v_reference.table_name, '.', '_') || '_' || v_reference.column_name || '_tenant_guard';
    execute pg_catalog.format('drop trigger if exists %I on %s', v_trigger_name, v_reference.table_name);
    execute pg_catalog.format(
      'create trigger %I before insert or update of %I, school_id on %s for each row execute function app.guard_same_school_reference(%L, %L)',
      v_trigger_name,
      v_reference.column_name,
      v_reference.table_name,
      v_reference.column_name,
      v_reference.reference_table
    );
  end loop;
end
$schoolsafe$;

create or replace function app.validate_student_enrollment()
returns trigger
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
declare
  v_student_status text;
  v_class_year_id uuid;
begin
  select s.lifecycle_status into v_student_status
  from app.students s
  where s.id = new.student_id and s.school_id = new.school_id;

  if v_student_status is null then
    raise check_violation using message = 'Enrollment student is unavailable';
  end if;
  if new.status = 'draft' and v_student_status <> 'draft' then
    raise check_violation using message = 'Draft enrollment requires a draft student';
  end if;
  if new.status = 'active' and v_student_status <> 'active' then
    raise check_violation using message = 'Active enrollment requires an active student';
  end if;

  if new.class_id is not null then
    select c.academic_year_id into v_class_year_id
    from app.classes c
    where c.id = new.class_id and c.school_id = new.school_id;
    if v_class_year_id is distinct from new.academic_year_id then
      raise check_violation using message = 'Enrollment class and academic year must match';
    end if;
  end if;

  return new;
end
$schoolsafe$;

drop trigger if exists student_enrollments_validate on app.student_enrollments;
create trigger student_enrollments_validate
before insert or update on app.student_enrollments
for each row execute function app.validate_student_enrollment();

create or replace function app.project_active_enrollment_class()
returns trigger
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
begin
  if new.status = 'active' then
    update app.students
    set class_id = new.class_id, updated_at = pg_catalog.now()
    where id = new.student_id and school_id = new.school_id and lifecycle_status = 'active';
  end if;
  return new;
end
$schoolsafe$;

drop trigger if exists student_enrollments_project_class on app.student_enrollments;
create trigger student_enrollments_project_class
after insert or update of status, class_id on app.student_enrollments
for each row execute function app.project_active_enrollment_class();

create or replace function app.require_operational_student()
returns trigger
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
declare
  v_student_id uuid := nullif(pg_catalog.to_jsonb(new) ->> 'student_id', '')::uuid;
begin
  if v_student_id is not null and not app.is_student_operational(v_student_id) then
    raise check_violation using message = 'Operation requires an active, coherently enrolled student';
  end if;
  return new;
end
$schoolsafe$;

do $schoolsafe$
declare
  v_table regclass;
  v_trigger_name text;
begin
  foreach v_table in array array[
    'app.card_print_requests'::regclass,
    'app.student_cards'::regclass,
    'app.security_events'::regclass,
    'app.student_fees'::regclass,
    'app.fee_control_scans'::regclass,
    'app.grades'::regclass,
    'app.ranking_entries'::regclass,
    'app.ranking_stars'::regclass
  ]
  loop
    v_trigger_name := pg_catalog.replace(v_table::text, '.', '_') || '_student_operational';
    execute pg_catalog.format('drop trigger if exists %I on %s', v_trigger_name, v_table);
    execute pg_catalog.format(
      'create trigger %I before insert or update of student_id on %s for each row execute function app.require_operational_student()',
      v_trigger_name,
      v_table
    );
  end loop;
end
$schoolsafe$;

create or replace function audit.capture_access_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_before jsonb := case when tg_op = 'INSERT' then null else pg_catalog.to_jsonb(old) end;
  v_after jsonb := case when tg_op = 'DELETE' then null else pg_catalog.to_jsonb(new) end;
  v_row jsonb := coalesce(v_after, v_before);
  v_event_type text;
  v_entity_id uuid := nullif(v_row ->> 'id', '')::uuid;
begin
  if not iam.context_is_valid() then
    if session_user in ('schoolsafe_bootstrap', 'schoolsafe_migrator') then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
    raise insufficient_privilege using message = 'Access configuration changes require a verified request context';
  end if;

  v_event_type := case tg_table_name
    when 'role_permission_grants' then
      case when tg_op = 'DELETE' then 'role.permission.revoked' else
      case coalesce(v_after ->> 'effect', v_before ->> 'effect')
        when 'allow' then 'role.permission.granted'
        else 'role.permission.revoked'
      end end
    when 'profile_permission_exceptions' then
      case tg_op when 'DELETE' then 'user.exception.removed' else 'user.exception.added' end
    when 'profile_roles' then
      case tg_op when 'DELETE' then 'profile.role.removed' else 'profile.role.assigned' end
    when 'grant_scopes' then
      case tg_op when 'DELETE' then 'grant.scope.removed' else 'grant.scope.changed' end
    when 'exception_scopes' then
      case tg_op when 'DELETE' then 'exception.scope.removed' else 'exception.scope.changed' end
    when 'permission_conditions' then
      case tg_op when 'DELETE' then 'permission.condition.removed' else 'permission.condition.changed' end
    when 'roles' then
      case tg_op when 'INSERT' then 'role.created' when 'DELETE' then 'role.removed' else 'role.updated' end
    else 'access.configuration.changed'
  end;

  perform audit.write_event(
    v_event_type,
    tg_table_schema || '.' || tg_table_name,
    v_entity_id,
    jsonb_build_object('operation', tg_op, 'before', v_before, 'after', v_after)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$schoolsafe$;

do $schoolsafe$
declare
  v_table regclass;
  v_trigger_name text;
begin
  foreach v_table in array array[
    'iam.roles'::regclass,
    'iam.profile_roles'::regclass,
    'iam.role_permission_grants'::regclass,
    'iam.permission_conditions'::regclass,
    'iam.profile_permission_exceptions'::regclass,
    'iam.grant_scopes'::regclass,
    'iam.exception_scopes'::regclass
  ]
  loop
    v_trigger_name := pg_catalog.replace(v_table::text, '.', '_') || '_audit';
    execute pg_catalog.format('drop trigger if exists %I on %s', v_trigger_name, v_table);
    execute pg_catalog.format(
      'create trigger %I after insert or update or delete on %s for each row execute function audit.capture_access_change()',
      v_trigger_name,
      v_table
    );
  end loop;
end
$schoolsafe$;

create or replace function audit.prevent_event_mutation()
returns trigger
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $schoolsafe$
begin
  raise insufficient_privilege using message = 'Audit events are append-only';
end
$schoolsafe$;

drop trigger if exists audit_events_immutable on audit.events;
create trigger audit_events_immutable
before update or delete on audit.events
for each row execute function audit.prevent_event_mutation();

commit;
