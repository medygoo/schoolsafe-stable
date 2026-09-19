\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

create or replace function api.check_access(
  p_permission_code text,
  p_target_profile_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_subject_id uuid default null,
  p_portal_id uuid default null,
  p_runtime_context jsonb default '{}'::jsonb
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select iam.can_access(
    p_permission_code,
    p_target_profile_id,
    p_student_id,
    p_class_id,
    p_subject_id,
    p_portal_id,
    p_runtime_context
  )
$schoolsafe$;

create or replace function api.deactivate_other_academic_years(p_active_year_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_target app.academic_years%rowtype;
  v_deactivated integer;
begin
  perform iam.require_access('school.manage');

  select * into v_target
  from app.academic_years y
  where y.id = p_active_year_id and y.school_id = v_school_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'Academic year does not belong to the active school';
  end if;

  update app.academic_years
  set is_active = false, updated_at = pg_catalog.now()
  where school_id = v_school_id and id <> p_active_year_id and is_active = true;
  get diagnostics v_deactivated = row_count;

  update app.academic_years
  set is_active = true, updated_at = pg_catalog.now()
  where id = p_active_year_id and school_id = v_school_id;

  perform audit.write_event(
    'academic_year.activated',
    'academic_year',
    p_active_year_id,
    jsonb_build_object(
      'actor_profile_id', v_profile_id,
      'deactivated_count', v_deactivated
    )
  );

  return jsonb_build_object(
    'academic_year_id', p_active_year_id,
    'is_active', true,
    'deactivated_count', v_deactivated
  );
end
$schoolsafe$;

create or replace function api.next_document_number(
  p_document_type text,
  p_prefix text default ''
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_required_permission text;
  v_year text := pg_catalog.to_char(pg_catalog.now(), 'YYYY');
  v_next bigint;
  v_number text;
begin
  if p_document_type is null or p_document_type !~ '^[a-z][a-z0-9_.-]{1,63}$' then
    raise check_violation using message = 'Invalid document type';
  end if;
  if p_prefix is null or pg_catalog.length(p_prefix) > 16 or p_prefix !~ '^[A-Z0-9-]*$' then
    raise check_violation using message = 'Invalid document prefix';
  end if;

  v_required_permission := case p_document_type
    when 'receipt' then 'finance.payment.record'
    when 'student_card' then 'cards.request.print'
    else 'school.manage'
  end;
  perform iam.require_access(v_required_permission);

  insert into ops.document_number_sequences as sequence_row (
    school_id,
    document_type,
    prefix,
    last_number
  ) values (
    v_school_id,
    p_document_type,
    p_prefix,
    1
  )
  on conflict (school_id, document_type)
  do update set
    prefix = excluded.prefix,
    last_number = sequence_row.last_number + 1,
    updated_at = pg_catalog.now()
  returning last_number into v_next;

  v_number := p_prefix || v_year || '-' || pg_catalog.lpad(v_next::text, 5, '0');

  perform audit.write_event(
    'document.number.issued',
    'document_number_sequence',
    null,
    jsonb_build_object('document_type', p_document_type, 'number', v_number)
  );

  return v_number;
end
$schoolsafe$;

create or replace function api.ensure_receipt_number(p_payment_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_receipt_no text;
  v_status text;
begin
  perform iam.require_access('finance.payment.record');

  select p.receipt_no, p.status
  into v_receipt_no, v_status
  from app.fee_payments p
  where p.id = p_payment_id and p.school_id = v_school_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'Payment does not belong to the active school';
  end if;
  if v_status = 'cancelled' then
    raise check_violation using message = 'A cancelled payment cannot receive a receipt number';
  end if;
  if v_receipt_no is not null then
    return v_receipt_no;
  end if;

  v_receipt_no := api.next_document_number('receipt', 'REC-');

  update app.fee_payments
  set receipt_no = v_receipt_no, updated_at = pg_catalog.now(), version = version + 1
  where id = p_payment_id and school_id = v_school_id;

  perform audit.write_event(
    'finance.receipt.number.assigned',
    'fee_payment',
    p_payment_id,
    jsonb_build_object('receipt_no', v_receipt_no)
  );

  return v_receipt_no;
end
$schoolsafe$;

create or replace function api.record_payment(
  p_student_fee_id uuid,
  p_amount numeric,
  p_currency text,
  p_received_at timestamptz,
  p_mode text,
  p_reference text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_student_fee app.student_fees%rowtype;
  v_payment_id uuid;
  v_receipt_no text;
  v_new_paid numeric(12,2);
  v_new_remaining numeric(12,2);
  v_new_status text;
begin
  perform iam.require_access(
    'finance.payment.record',
    null,
    null,
    null,
    null,
    null,
    jsonb_build_object('date', coalesce(p_received_at, pg_catalog.now())::date)
  );

  if not iam.condition_matches(
    'cash_register_open',
    '{}'::jsonb,
    jsonb_build_object('date', coalesce(p_received_at, pg_catalog.now())::date)
  ) then
    raise check_violation using message = 'An open cash register is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise check_violation using message = 'Payment amount must be positive';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise check_violation using message = 'Currency must be an uppercase ISO-style code';
  end if;

  select sf.* into v_student_fee
  from app.student_fees sf
  where sf.id = p_student_fee_id and sf.school_id = v_school_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'Student fee does not belong to the active school';
  end if;
  if v_student_fee.status in ('waived', 'cancelled') then
    raise check_violation using message = 'Payment cannot be recorded for this student fee status';
  end if;
  if p_amount > v_student_fee.amount_remaining then
    raise check_violation using message = 'Payment exceeds the remaining amount';
  end if;

  v_receipt_no := api.next_document_number('receipt', 'REC-');

  insert into app.fee_payments (
    school_id,
    student_fee_id,
    amount,
    currency,
    received_by,
    received_at,
    receipt_no,
    mode,
    reference,
    metadata,
    status
  ) values (
    v_school_id,
    p_student_fee_id,
    p_amount,
    p_currency,
    v_profile_id,
    coalesce(p_received_at, pg_catalog.now()),
    v_receipt_no,
    nullif(pg_catalog.btrim(p_mode), ''),
    nullif(pg_catalog.btrim(p_reference), ''),
    coalesce(p_metadata, '{}'::jsonb),
    'valid'
  ) returning id into v_payment_id;

  select coalesce(pg_catalog.sum(p.amount), 0)::numeric(12,2)
  into v_new_paid
  from app.fee_payments p
  where p.student_fee_id = p_student_fee_id and p.school_id = v_school_id and p.status = 'valid';

  v_new_remaining := greatest(v_student_fee.amount_expected - v_new_paid, 0);
  v_new_status := case
    when v_new_remaining = 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    else 'pending'
  end;

  update app.student_fees
  set amount_paid = v_new_paid,
      amount_remaining = v_new_remaining,
      status = v_new_status,
      updated_at = pg_catalog.now()
  where id = p_student_fee_id and school_id = v_school_id;

  perform audit.write_event(
    'finance.payment.recorded',
    'fee_payment',
    v_payment_id,
    jsonb_build_object(
      'student_fee_id', p_student_fee_id,
      'amount', p_amount,
      'currency', p_currency,
      'receipt_no', v_receipt_no,
      'student_fee_status', v_new_status
    )
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'receipt_no', v_receipt_no,
    'student_fee_id', p_student_fee_id,
    'amount_paid', v_new_paid,
    'amount_remaining', v_new_remaining,
    'status', v_new_status
  );
end
$schoolsafe$;

create or replace function api.cancel_payment(
  p_payment_id uuid,
  p_reason text,
  p_expected_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_payment app.fee_payments%rowtype;
  v_student_fee app.student_fees%rowtype;
  v_new_paid numeric(12,2);
  v_new_remaining numeric(12,2);
  v_new_status text;
begin
  perform iam.require_access(
    'finance.payment.cancel',
    null,
    null,
    null,
    null,
    null,
    jsonb_build_object('payment_id', p_payment_id, 'max_age_hours', 24)
  );

  if not iam.condition_matches(
    'within_cancellation_window',
    '{}'::jsonb,
    jsonb_build_object('payment_id', p_payment_id, 'max_age_hours', 24)
  ) then
    raise check_violation using message = 'Payment is outside the cancellation window';
  end if;
  if p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) < 3 then
    raise check_violation using message = 'Cancellation reason is required';
  end if;

  select p.* into v_payment
  from app.fee_payments p
  where p.id = p_payment_id and p.school_id = v_school_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'Payment does not belong to the active school';
  end if;
  if v_payment.status = 'cancelled' then
    raise check_violation using message = 'Payment is already cancelled';
  end if;
  if p_expected_version is null or v_payment.version <> p_expected_version then
    raise serialization_failure using message = 'Payment version conflict';
  end if;

  select sf.* into v_student_fee
  from app.student_fees sf
  where sf.id = v_payment.student_fee_id and sf.school_id = v_school_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'Student fee does not belong to the active school';
  end if;

  update app.fee_payments
  set status = 'cancelled',
      cancelled_at = pg_catalog.now(),
      cancelled_by = v_profile_id,
      cancellation_reason = pg_catalog.btrim(p_reason),
      version = version + 1,
      updated_at = pg_catalog.now()
  where id = p_payment_id and school_id = v_school_id;

  select coalesce(pg_catalog.sum(p.amount), 0)::numeric(12,2)
  into v_new_paid
  from app.fee_payments p
  where p.student_fee_id = v_student_fee.id and p.school_id = v_school_id and p.status = 'valid';

  v_new_remaining := greatest(v_student_fee.amount_expected - v_new_paid, 0);
  v_new_status := case
    when v_new_remaining = 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    else 'pending'
  end;

  update app.student_fees
  set amount_paid = v_new_paid,
      amount_remaining = v_new_remaining,
      status = v_new_status,
      updated_at = pg_catalog.now()
  where id = v_student_fee.id and school_id = v_school_id;

  perform audit.write_event(
    'finance.payment.cancelled',
    'fee_payment',
    p_payment_id,
    jsonb_build_object(
      'reason', pg_catalog.btrim(p_reason),
      'previous_version', p_expected_version,
      'student_fee_id', v_student_fee.id,
      'student_fee_status', v_new_status
    )
  );

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'cancelled',
    'version', p_expected_version + 1,
    'student_fee_id', v_student_fee.id,
    'amount_paid', v_new_paid,
    'amount_remaining', v_new_remaining,
    'student_fee_status', v_new_status
  );
end
$schoolsafe$;

create or replace function api.increment_card_print_count(p_student_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_new_count integer;
begin
  perform iam.require_access('cards.request.print', null, p_student_id);

  if not app.is_student_operational(p_student_id) then
    raise check_violation using message = 'Student is not operational';
  end if;

  update app.students
  set card_print_count = card_print_count + 1,
      card_printed = true,
      card_print_date = current_date,
      updated_at = pg_catalog.now()
  where id = p_student_id and school_id = iam.current_school_id()
  returning card_print_count into v_new_count;

  if not found then
    raise foreign_key_violation using message = 'Student does not belong to the active school';
  end if;

  perform audit.write_event(
    'student.card.print_count.incremented',
    'student',
    p_student_id,
    jsonb_build_object('print_count', v_new_count)
  );

  return v_new_count;
end
$schoolsafe$;

create or replace function api.create_student_draft(
  p_matricule text,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_date_of_birth date,
  p_gender text,
  p_academic_year_id uuid,
  p_planned_class_id uuid,
  p_enrollment_starts_on date,
  p_guardian_type text,
  p_existing_parent_profile_id uuid,
  p_invited_parent_email text,
  p_invited_parent_first_name text,
  p_invited_parent_last_name text,
  p_invited_parent_phone text,
  p_invitation_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_student_id uuid;
  v_enrollment_id uuid;
  v_parent_profile_id uuid;
  v_parent_status text;
  v_parent_role_id uuid;
begin
  perform iam.require_access('school.student.create');

  if p_matricule is null or pg_catalog.btrim(p_matricule) = ''
     or p_first_name is null or pg_catalog.btrim(p_first_name) = ''
     or p_last_name is null or pg_catalog.btrim(p_last_name) = '' then
    raise check_violation using message = 'Student matricule, first name, and last name are required';
  end if;
  if (p_existing_parent_profile_id is null) = (p_invited_parent_email is null) then
    raise check_violation using message = 'Exactly one primary parent mode is required';
  end if;
  if p_guardian_type not in ('pere', 'mere', 'tuteur', 'autre') then
    raise check_violation using message = 'Invalid guardian type';
  end if;
  if not exists (
    select 1
    from app.classes c
    join app.academic_years y
      on y.id = c.academic_year_id
     and y.school_id = c.school_id
    where c.id = p_planned_class_id
      and c.school_id = v_school_id
      and y.id = p_academic_year_id
  ) then
    raise check_violation using message = 'Class and academic year must belong to the active school';
  end if;

  if p_existing_parent_profile_id is not null then
    select p.id, p.account_status
    into v_parent_profile_id, v_parent_status
    from iam.profiles p
    where p.id = p_existing_parent_profile_id
      and p.school_id = v_school_id
      and p.is_active = true
      and p.account_status = 'active'
      and exists (
        select 1
        from iam.profile_roles pr
        join iam.roles r on r.id = pr.role_id and r.school_id = pr.school_id
        where pr.profile_id = p.id
          and pr.school_id = v_school_id
          and pr.is_active = true
          and r.code = 'parent'
          and r.is_active = true
      );
    if not found then
      raise check_violation using message = 'Existing parent must be active and belong to the active school';
    end if;
  else
    if p_invitation_token_hash is null or p_invitation_token_hash !~ '^[a-f0-9]{64}$' then
      raise check_violation using message = 'Invitation token hash must be lowercase SHA-256 hexadecimal';
    end if;
    if p_invited_parent_email is null or position('@' in p_invited_parent_email) <= 1 then
      raise check_violation using message = 'Invited parent email is invalid';
    end if;

    select r.id into v_parent_role_id
    from iam.roles r
    where r.school_id = v_school_id and r.code = 'parent' and r.is_active = true;
    if not found then
      raise check_violation using message = 'Parent role is missing for the active school';
    end if;

    insert into iam.profiles (
      user_id,
      school_id,
      display_name,
      first_name,
      last_name,
      email,
      phone,
      is_active,
      account_status
    ) values (
      null,
      v_school_id,
      pg_catalog.btrim(pg_catalog.concat_ws(' ', p_invited_parent_first_name, p_invited_parent_last_name)),
      nullif(pg_catalog.btrim(p_invited_parent_first_name), ''),
      nullif(pg_catalog.btrim(p_invited_parent_last_name), ''),
      pg_catalog.lower(pg_catalog.btrim(p_invited_parent_email)),
      nullif(pg_catalog.btrim(p_invited_parent_phone), ''),
      false,
      'pending_activation'
    ) returning id into v_parent_profile_id;

    insert into iam.profile_roles (school_id, profile_id, role_id, assigned_by)
    values (v_school_id, v_parent_profile_id, v_parent_role_id, v_profile_id);
    v_parent_status := 'pending_activation';
  end if;

  insert into app.students (
    school_id,
    class_id,
    matricule,
    first_name,
    middle_name,
    last_name,
    date_of_birth,
    gender,
    lifecycle_status,
    created_by
  ) values (
    v_school_id,
    null,
    pg_catalog.btrim(p_matricule),
    pg_catalog.btrim(p_first_name),
    nullif(pg_catalog.btrim(p_middle_name), ''),
    pg_catalog.btrim(p_last_name),
    p_date_of_birth,
    p_gender,
    'draft',
    v_profile_id
  ) returning id into v_student_id;

  insert into app.student_enrollments (
    school_id,
    student_id,
    academic_year_id,
    class_id,
    status,
    starts_on,
    created_by
  ) values (
    v_school_id,
    v_student_id,
    p_academic_year_id,
    p_planned_class_id,
    'draft',
    p_enrollment_starts_on,
    v_profile_id
  ) returning id into v_enrollment_id;

  insert into app.student_enrollment_events (
    school_id,
    enrollment_id,
    student_id,
    event_type,
    from_status,
    to_status,
    actor_profile_id,
    payload
  ) values (
    v_school_id,
    v_enrollment_id,
    v_student_id,
    'enrollment.draft.created',
    null,
    'draft',
    v_profile_id,
    jsonb_build_object('academic_year_id', p_academic_year_id, 'planned_class_id', p_planned_class_id)
  );

  insert into app.student_guardians (
    school_id,
    student_id,
    profile_id,
    guardian_type,
    is_primary,
    full_name,
    phone,
    email,
    is_authorized_pickup,
    created_by
  )
  select
    v_school_id,
    v_student_id,
    p.id,
    p_guardian_type,
    true,
    p.display_name,
    p.phone,
    p.email,
    false,
    v_profile_id
  from iam.profiles p
  where p.id = v_parent_profile_id and p.school_id = v_school_id;

  if v_parent_status = 'pending_activation' then
    insert into app.parent_invitations (
      school_id,
      profile_id,
      student_id,
      email,
      token_hash,
      status,
      expires_at,
      invited_by
    ) values (
      v_school_id,
      v_parent_profile_id,
      v_student_id,
      pg_catalog.lower(pg_catalog.btrim(p_invited_parent_email)),
      p_invitation_token_hash,
      'pending_activation',
      pg_catalog.now() + interval '72 hours',
      v_profile_id
    );
  end if;

  perform audit.write_event(
    'student.draft.created',
    'student',
    v_student_id,
    jsonb_build_object(
      'enrollment_id', v_enrollment_id,
      'academic_year_id', p_academic_year_id,
      'planned_class_id', p_planned_class_id,
      'primary_parent_profile_id', v_parent_profile_id,
      'parent_account_status', v_parent_status
    )
  );

  return jsonb_build_object(
    'id', v_student_id,
    'lifecycle_status', 'draft',
    'class_id', null,
    'enrollment_id', v_enrollment_id,
    'enrollment_status', 'draft',
    'parent', jsonb_build_object('id', v_parent_profile_id, 'account_status', v_parent_status)
  );
end
$schoolsafe$;

create or replace function api.compensate_student_draft_creation(p_student_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_parent_profile_id uuid;
begin
  perform iam.require_access('school.student.create');

  perform 1
  from app.students s
  where s.id = p_student_id
    and s.school_id = v_school_id
    and s.lifecycle_status = 'draft'
    and s.created_by = v_profile_id
  for update;

  if not found then
    raise check_violation using message = 'Compensation target is not a draft created by the active profile';
  end if;

  select sg.profile_id into v_parent_profile_id
  from app.student_guardians sg
  join iam.profiles p on p.id = sg.profile_id and p.school_id = sg.school_id
  where sg.school_id = v_school_id
    and sg.student_id = p_student_id
    and sg.is_primary = true
    and p.account_status = 'pending_activation'
    and p.user_id is null;

  delete from app.students
  where id = p_student_id and school_id = v_school_id;

  if v_parent_profile_id is not null
     and not exists (
       select 1 from app.student_guardians sg
       where sg.profile_id = v_parent_profile_id
     ) then
    delete from iam.profiles
    where id = v_parent_profile_id
      and school_id = v_school_id
      and account_status = 'pending_activation'
      and user_id is null;
  end if;

  perform audit.write_event(
    'student.draft.compensated',
    'student',
    p_student_id,
    jsonb_build_object('pending_parent_profile_id', v_parent_profile_id)
  );

  return true;
end
$schoolsafe$;

comment on function api.deactivate_other_academic_years(uuid) is 'P0: school and actor derive only from transaction context.';
comment on function api.next_document_number(text, text) is 'P0: atomic tenant document numbering; school derives only from transaction context.';
comment on function api.ensure_receipt_number(uuid) is 'P0: payment school derives only from transaction context.';
comment on function api.record_payment(uuid, numeric, text, timestamptz, text, text, jsonb) is 'P0: actor and school derive only from transaction context.';
comment on function api.cancel_payment(uuid, text, integer) is 'P0: actor and school derive only from transaction context.';
comment on function api.increment_card_print_count(uuid) is 'P0: actor and school derive only from transaction context.';
comment on function api.create_student_draft(text, text, text, text, date, text, uuid, uuid, date, text, uuid, text, text, text, text, text) is 'P0: actor and school derive only from transaction context.';
comment on function api.compensate_student_draft_creation(uuid) is 'P0: actor and school derive only from transaction context.';

commit;
