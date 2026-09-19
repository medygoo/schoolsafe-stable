\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

-- Transaction-local installer: every business table is FORCE RLS and receives one
-- policy per permitted SQL operation. Missing operations remain default DENY.
create or replace function iam.install_owner_policies(
  p_table regclass,
  p_read_predicate text,
  p_write_predicate text,
  p_allow_update boolean,
  p_allow_delete boolean
)
returns void
language plpgsql
as $schoolsafe$
declare
  v_stem text := pg_catalog.replace(p_table::text, '.', '_');
begin
  execute pg_catalog.format('alter table %s enable row level security', p_table);
  execute pg_catalog.format('alter table %s force row level security', p_table);

  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_tenant', p_table);
  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_select', p_table);
  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_insert', p_table);
  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_update', p_table);
  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_delete', p_table);

  execute pg_catalog.format(
    'create policy %I on %s for select to schoolsafe_owner using (%s)',
    v_stem || '_owner_select', p_table, p_read_predicate
  );
  execute pg_catalog.format(
    'create policy %I on %s for insert to schoolsafe_owner with check (%s)',
    v_stem || '_owner_insert', p_table, p_write_predicate
  );
  if p_allow_update then
    execute pg_catalog.format(
      'create policy %I on %s for update to schoolsafe_owner using (%s) with check (%s)',
      v_stem || '_owner_update', p_table, p_write_predicate, p_write_predicate
    );
  end if;
  if p_allow_delete then
    execute pg_catalog.format(
      'create policy %I on %s for delete to schoolsafe_owner using (%s)',
      v_stem || '_owner_delete', p_table, p_write_predicate
    );
  end if;
end
$schoolsafe$;

do $schoolsafe$
declare
  v_table regclass;
  v_predicate text;
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
    'app.parent_invitations'::regclass,
    'app.card_print_requests'::regclass,
    'app.locations'::regclass,
    'app.security_portals'::regclass,
    'app.student_cards'::regclass,
    'app.alert_rules'::regclass,
    'app.alerts'::regclass,
    'app.alert_notifications'::regclass,
    'app.fee_structures'::regclass,
    'app.student_fees'::regclass,
    'app.cash_registers'::regclass,
    'app.fee_payments'::regclass,
    'app.cash_register_closures'::regclass,
    'app.fee_control_campaigns'::regclass,
    'app.fee_control_assignees'::regclass,
    'app.subjects'::regclass,
    'app.teacher_assignments'::regclass,
    'app.assignments'::regclass,
    'app.assignment_questions'::regclass,
    'app.grades'::regclass,
    'app.lesson_plans'::regclass,
    'app.approval_requests'::regclass,
    'app.rankings'::regclass,
    'app.ranking_entries'::regclass,
    'app.ranking_stars'::regclass
  ]
  loop
    v_predicate := case
      when v_table = 'app.schools'::regclass
        then 'id = iam.current_school_id() and iam.context_is_valid()'
      else 'school_id = iam.current_school_id() and iam.context_is_valid()'
    end;
    perform iam.install_owner_policies(v_table, v_predicate, v_predicate, true, true);
  end loop;

  -- Immutable append-only ledgers: SELECT and INSERT only.
  foreach v_table in array array[
    'app.student_enrollment_events'::regclass,
    'app.security_events'::regclass,
    'app.fee_control_scans'::regclass
  ]
  loop
    perform iam.install_owner_policies(
      v_table,
      'school_id = iam.current_school_id() and iam.context_is_valid()',
      'school_id = iam.current_school_id() and iam.context_is_valid()',
      false,
      false
    );
  end loop;

  foreach v_table in array array[
    'iam.profiles'::regclass,
    'iam.devices'::regclass,
    'iam.roles'::regclass,
    'iam.profile_roles'::regclass,
    'iam.role_permission_grants'::regclass,
    'iam.permission_conditions'::regclass,
    'iam.profile_permission_exceptions'::regclass,
    'iam.grant_scopes'::regclass,
    'iam.exception_scopes'::regclass
  ]
  loop
    -- context_is_valid() reads iam.profiles; IAM policies therefore use only
    -- the transaction school setting to avoid RLS recursion. No runtime role
    -- has direct IAM table privileges, and every callable API validates the
    -- complete user/profile/school/request context before business access.
    perform iam.install_owner_policies(
      v_table,
      'school_id = iam.current_school_id()',
      'school_id = iam.current_school_id()',
      true,
      true
    );
  end loop;

  foreach v_table in array array[
    'ops.system_events'::regclass,
    'ops.notifications'::regclass
  ]
  loop
    perform iam.install_owner_policies(
      v_table,
      'school_id = iam.current_school_id() and iam.context_is_valid()',
      'school_id = iam.current_school_id() and iam.context_is_valid()',
      true,
      true
    );
  end loop;

  -- Numbering state can be updated but never deleted through normal operation.
  perform iam.install_owner_policies(
    'ops.document_number_sequences'::regclass,
    'school_id = iam.current_school_id() and iam.context_is_valid()',
    'school_id = iam.current_school_id() and iam.context_is_valid()',
    true,
    false
  );

  -- Historical indicator snapshots are append-only.
  perform iam.install_owner_policies(
    'ops.indicator_snapshots'::regclass,
    'school_id = iam.current_school_id() and iam.context_is_valid()',
    'school_id = iam.current_school_id() and iam.context_is_valid()',
    false,
    false
  );

  foreach v_table in array array[
    'ops.notification_templates'::regclass,
    'ops.data_retention_policies'::regclass
  ]
  loop
    perform iam.install_owner_policies(
      v_table,
      'iam.context_is_valid() and (school_id is null or school_id = iam.current_school_id())',
      'iam.context_is_valid() and school_id = iam.current_school_id()',
      true,
      true
    );
  end loop;
end
$schoolsafe$;

-- The audit ledger is immutable. Owner can append/read; auditor can only read.
alter table audit.events enable row level security;
alter table audit.events force row level security;
drop policy if exists audit_events_owner_tenant on audit.events;
drop policy if exists audit_events_owner_select on audit.events;
drop policy if exists audit_events_owner_insert on audit.events;
drop policy if exists audit_events_owner_update on audit.events;
drop policy if exists audit_events_owner_delete on audit.events;
create policy audit_events_owner_select on audit.events
for select to schoolsafe_owner
using (school_id = iam.current_school_id() and iam.context_is_valid());
create policy audit_events_owner_insert on audit.events
for insert to schoolsafe_owner
with check (school_id = iam.current_school_id() and iam.context_is_valid());
drop policy if exists audit_events_auditor_tenant on audit.events;
create policy audit_events_auditor_tenant on audit.events
for select to schoolsafe_auditor
using (school_id = iam.current_school_id() and iam.context_is_valid());

-- Worker policies match its table ACL: read and update only.
drop policy if exists system_events_worker_tenant on ops.system_events;
drop policy if exists system_events_worker_select on ops.system_events;
drop policy if exists system_events_worker_update on ops.system_events;
create policy system_events_worker_select on ops.system_events
for select to schoolsafe_worker
using (school_id = iam.current_school_id() and iam.context_is_valid());
create policy system_events_worker_update on ops.system_events
for update to schoolsafe_worker
using (school_id = iam.current_school_id() and iam.context_is_valid())
with check (school_id = iam.current_school_id() and iam.context_is_valid());

drop policy if exists notifications_worker_tenant on ops.notifications;
drop policy if exists notifications_worker_select on ops.notifications;
drop policy if exists notifications_worker_update on ops.notifications;
create policy notifications_worker_select on ops.notifications
for select to schoolsafe_worker
using (school_id = iam.current_school_id() and iam.context_is_valid());
create policy notifications_worker_update on ops.notifications
for update to schoolsafe_worker
using (school_id = iam.current_school_id() and iam.context_is_valid())
with check (school_id = iam.current_school_id() and iam.context_is_valid());

revoke all on all tables in schema app from public;
revoke all on all tables in schema iam from public;
revoke all on all tables in schema audit from public;
revoke all on ops.schema_versions, ops.system_events, ops.notification_templates,
  ops.notifications, ops.data_retention_policies, ops.document_number_sequences,
  ops.indicator_snapshots from public;
revoke all on all sequences in schema app from public;
revoke all on all sequences in schema iam from public;
revoke all on all sequences in schema audit from public;
revoke all on all sequences in schema ops from public;

revoke all on all tables in schema app from schoolsafe_api;
revoke all on all tables in schema iam from schoolsafe_api;
revoke all on all tables in schema audit from schoolsafe_api;
revoke all on ops.schema_versions, ops.system_events, ops.notification_templates,
  ops.notifications, ops.data_retention_policies, ops.document_number_sequences,
  ops.indicator_snapshots from schoolsafe_api;
revoke all on all sequences in schema app from schoolsafe_api;
revoke all on all sequences in schema iam from schoolsafe_api;
revoke all on all sequences in schema audit from schoolsafe_api;
revoke all on all sequences in schema ops from schoolsafe_api;

revoke execute on all functions in schema app from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;
revoke execute on all functions in schema iam from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;
revoke execute on all functions in schema audit from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;
revoke execute on function ops.record_schema_version(smallint, text, text, text, text)
  from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;
revoke execute on all functions in schema api from public, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;

-- API execute privileges are signature-specific. New RPCs remain inaccessible
-- until they are deliberately added to this allowlist.
grant usage on schema api to schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;
grant execute on function api.set_request_context(uuid, uuid, uuid, uuid) to schoolsafe_api;
grant execute on function api.check_access(text, uuid, uuid, uuid, uuid, uuid, jsonb) to schoolsafe_api;
grant execute on function api.deactivate_other_academic_years(uuid) to schoolsafe_api;
grant execute on function api.next_document_number(text, text) to schoolsafe_api;
grant execute on function api.ensure_receipt_number(uuid) to schoolsafe_api;
grant execute on function api.record_payment(uuid, numeric, text, timestamptz, text, text, jsonb) to schoolsafe_api;
grant execute on function api.cancel_payment(uuid, text, integer) to schoolsafe_api;
grant execute on function api.increment_card_print_count(uuid) to schoolsafe_api;
grant execute on function api.create_student_draft(text, text, text, text, date, text, uuid, uuid, date, text, uuid, text, text, text, text, text) to schoolsafe_api;
grant execute on function api.compensate_student_draft_creation(uuid) to schoolsafe_api;
grant execute on function api.set_request_context(uuid, uuid, uuid, uuid) to schoolsafe_worker, schoolsafe_auditor;

grant usage on schema iam to schoolsafe_worker, schoolsafe_auditor;
grant execute on function iam.current_school_id() to schoolsafe_worker, schoolsafe_auditor;
grant execute on function iam.context_is_valid() to schoolsafe_worker, schoolsafe_auditor;

grant usage on schema ops to schoolsafe_worker;
grant select, update on ops.system_events, ops.notifications to schoolsafe_worker;

grant usage on schema audit to schoolsafe_auditor;
grant select on audit.events to schoolsafe_auditor;

grant usage on schema ops to schoolsafe_migrator;
grant select, insert on ops.schema_versions to schoolsafe_migrator;
grant execute on function ops.record_schema_version(smallint, text, text, text, text) to schoolsafe_migrator;

drop function iam.install_owner_policies(regclass, text, text, boolean, boolean);

-- Database ACL belongs to the bootstrap/database owner, not to the object owner.
reset role;

do $schoolsafe$
declare
  v_database name := pg_catalog.current_database();
begin
  execute pg_catalog.format('revoke all on database %I from public', v_database);
  execute pg_catalog.format('revoke temporary on database %I from public', v_database);
  execute pg_catalog.format(
    'grant connect on database %I to schoolsafe_owner, schoolsafe_migrator, schoolsafe_api, schoolsafe_worker, schoolsafe_auditor',
    v_database
  );
end
$schoolsafe$;

commit;
