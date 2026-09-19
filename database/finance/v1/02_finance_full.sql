\set ON_ERROR_STOP on

-- SchoolSafe Finance v1 — unité 02 : RPC complets (structures, caisse, rapports, contrôle).
-- Complète l'unité 01 (frais élèves + paiements).

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. STRUCTURES DE FRAIS (fee_structures)
-- ============================================================================

create or replace function api.fee_structure_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('finance.fee.read', null, null, null);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', fs.id,
        'academic_year_id', fs.academic_year_id,
        'cycle_key', fs.cycle_key,
        'label', fs.label,
        'amount', fs.amount,
        'currency', fs.currency,
        'due_date', fs.due_date,
        'is_active', fs.is_active
      ) order by fs.created_at desc
    ), '[]'::jsonb)
    from app.fee_structures fs
    where fs.school_id = v_school_id
  );
end
$schoolsafe$;
grant execute on function api.fee_structure_list() to schoolsafe_api;

create or replace function api.fee_structure_create(
  p_academic_year_id uuid,
  p_cycle_key text default null,
  p_label text,
  p_amount numeric(12,2),
  p_currency text default 'USD',
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_id uuid;
begin
  perform iam.require_access('finance.fee.manage', null, null, null);
  insert into app.fee_structures (school_id, academic_year_id, cycle_key, label, amount, currency, due_date)
  values (v_school_id, p_academic_year_id, p_cycle_key, p_label, p_amount, p_currency, p_due_date)
  returning id into v_id;
  return v_id;
end
$schoolsafe$;
grant execute on function api.fee_structure_create(uuid, text, text, numeric, text, date) to schoolsafe_api;

-- ============================================================================
-- 2. CAISSE (cash_registers)
-- ============================================================================

create or replace function api.cash_register_open()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_id uuid;
begin
  perform iam.require_access('finance.cash_register.open', null, null, null);
  insert into app.cash_registers (school_id, status, opened_by)
  values (v_school_id, 'open', v_profile_id)
  returning id into v_id;
  return v_id;
end
$schoolsafe$;
grant execute on function api.cash_register_open() to schoolsafe_api;

create or replace function api.cash_register_close(p_register_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
begin
  perform iam.require_access('finance.cash_register.close', null, null, null);
  update app.cash_registers
  set status = 'closed', closed_by = v_profile_id, closed_at = pg_catalog.now()
  where id = p_register_id and school_id = v_school_id and status = 'open';
  return found;
end
$schoolsafe$;
grant execute on function api.cash_register_close(uuid) to schoolsafe_api;

-- ============================================================================
-- 3. RAPPORTS
-- ============================================================================

create or replace function api.finance_daily_report(p_date date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_total_paid numeric(12,2);
  v_count int;
  v_result jsonb;
begin
  perform iam.require_access('finance.report.read', null, null, null);

  select coalesce(sum(fp.amount), 0), count(fp.id)
  into v_total_paid, v_count
  from app.fee_payments fp
  where fp.school_id = v_school_id
    and fp.received_at::date = p_date
    and fp.status = 'valid';

  v_result := jsonb_build_object(
    'date', p_date,
    'total_paid', v_total_paid,
    'payment_count', v_count
  );
  return v_result;
end
$schoolsafe$;
grant execute on function api.finance_daily_report(date) to schoolsafe_api;

-- ============================================================================
-- 4. ANNULATION DE PAIEMENT
-- ============================================================================

create or replace function api.payment_cancel(
  p_payment_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_payment app.fee_payments%rowtype;
begin
  perform iam.require_access('finance.payment.cancel', null, null, null);

  select * into v_payment
  from app.fee_payments
  where id = p_payment_id and school_id = v_school_id
  for update;

  if not found then
    return false;
  end if;

  update app.fee_payments
  set status = 'cancelled',
      cancellation_reason = p_reason,
      cancelled_at = pg_catalog.now(),
      cancelled_by = v_profile_id
  where id = p_payment_id and school_id = v_school_id;

  -- Restaurer le solde du frais
  update app.student_fees
  set amount_paid = amount_paid - v_payment.amount,
      amount_remaining = amount_remaining + v_payment.amount,
      status = case
        when amount_paid - v_payment.amount <= 0 then 'pending'
        else 'partial'
      end
  where id = v_payment.student_fee_id and school_id = v_school_id;

  return true;
end
$schoolsafe$;
grant execute on function api.payment_cancel(uuid, text) to schoolsafe_api;

-- ============================================================================
-- 5. REÇU
-- ============================================================================

create or replace function api.payment_receipt(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_student_id uuid;
  v_class_id uuid;
  v_result jsonb;
begin
  select sf.student_id, s.class_id
  into v_student_id, v_class_id
  from app.fee_payments fp
  join app.student_fees sf on sf.id = fp.student_fee_id and sf.school_id = fp.school_id
  join app.students s on s.id = sf.student_id and s.school_id = sf.school_id
  where fp.id = p_payment_id and fp.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Payment not found in school';
  end if;

  perform iam.require_access('finance.receipt.read', null, v_student_id, v_class_id);

  select jsonb_build_object(
    'payment_id', fp.id,
    'receipt_no', fp.receipt_no,
    'student_fee_id', fp.student_fee_id,
    'amount', fp.amount,
    'currency', fp.currency,
    'received_at', fp.received_at,
    'mode', fp.mode,
    'reference', fp.reference,
    'student_matricule', s.matricule,
    'student_name', s.first_name || ' ' || s.last_name,
    'fee_label', fs.label
  ) into v_result
  from app.fee_payments fp
  join app.student_fees sf on sf.id = fp.student_fee_id and sf.school_id = v_school_id
  join app.students s on s.id = sf.student_id and s.school_id = v_school_id
  join app.fee_structures fs on fs.id = sf.fee_structure_id and fs.school_id = v_school_id
  where fp.id = p_payment_id and fp.school_id = v_school_id;

  return v_result;
end
$schoolsafe$;
grant execute on function api.payment_receipt(uuid) to schoolsafe_api;

-- ============================================================================
-- 6. CAMPAGNES DE CONTRÔLE
-- ============================================================================

create or replace function api.fee_control_campaign_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('finance.control.read', null, null, null);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'fee_structure_id', c.fee_structure_id,
        'label', c.label,
        'description', c.description,
        'classes', c.classes,
        'starts_at', c.starts_at,
        'ends_at', c.ends_at,
        'status', c.status,
        'created_by', c.created_by,
        'created_at', c.created_at
      ) order by c.created_at desc
    ), '[]'::jsonb)
    from app.fee_control_campaigns c
    where c.school_id = v_school_id
  );
end
$schoolsafe$;
grant execute on function api.fee_control_campaign_list() to schoolsafe_api;

create or replace function api.fee_control_campaign_create(
  p_fee_structure_id uuid,
  p_label text,
  p_description text default null,
  p_classes jsonb default '[]'::jsonb,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_id uuid;
begin
  perform iam.require_access('finance.control.manage', null, null, null);
  insert into app.fee_control_campaigns (school_id, fee_structure_id, label, description, classes, starts_at, ends_at, created_by)
  values (v_school_id, p_fee_structure_id, p_label, p_description, p_classes, p_starts_at, p_ends_at, v_profile_id)
  returning id into v_id;
  return v_id;
end
$schoolsafe$;
grant execute on function api.fee_control_campaign_create(uuid, text, text, jsonb, timestamptz, timestamptz) to schoolsafe_api;

-- ============================================================================
-- 7. SCANS DE CONTRÔLE
-- ============================================================================

create or replace function api.fee_control_scan_create(
  p_campaign_id uuid,
  p_student_id uuid,
  p_result text,
  p_notes text default null,
  p_student_fee_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_student_fee_status text := p_student_fee_status;
  v_class_id uuid;
  v_runtime_context jsonb;
  v_id uuid;
begin
  select s.class_id
  into v_class_id
  from app.students s
  where s.school_id = v_school_id
    and s.id = p_student_id;

  if not found then
    raise foreign_key_violation using message = 'Student not found in school';
  end if;

  v_runtime_context := jsonb_build_object('campaign_id', p_campaign_id::text);

  perform iam.require_access('finance.control.scan', null, p_student_id, v_class_id, null, null, v_runtime_context);

  -- Si pas de stat fourni, résoudre depuis student_fees
  if v_student_fee_status is null then
    select sf.status into v_student_fee_status
    from app.student_fees sf
    join app.fee_control_campaigns cc on cc.fee_structure_id = sf.fee_structure_id
    where cc.id = p_campaign_id and cc.school_id = v_school_id
      and sf.student_id = p_student_id and sf.school_id = v_school_id
    limit 1;
  end if;

  insert into app.fee_control_scans (school_id, campaign_id, student_id, scanned_by, student_fee_status, result, notes)
  values (v_school_id, p_campaign_id, p_student_id, v_profile_id, v_student_fee_status, p_result, p_notes)
  returning id into v_id;

  return v_id;
end
$schoolsafe$;
grant execute on function api.fee_control_scan_create(uuid, uuid, text, text, text) to schoolsafe_api;

commit;