\set ON_ERROR_STOP on

-- SchoolSafe Finance v1 — RPC natifs (VPS PostgreSQL).
-- Couvre : frais par élève, création de frais, paiements.

begin;
set local role schoolsafe_owner;

-- ----------------------------------------
-- FRAIS : liste des frais d'un élève
-- ----------------------------------------
create or replace function api.student_fee_list(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_result jsonb;
begin
  select s.class_id
  into v_class_id
  from app.students s
  where s.school_id = v_school_id
    and s.id = p_student_id;

  if not found then
    raise foreign_key_violation using message = 'Student not found in school';
  end if;

  perform iam.require_access('finance.fee.read', null, p_student_id, v_class_id);

  select jsonb_agg(
    jsonb_build_object(
      'id', sf.id,
      'student_id', sf.student_id,
      'fee_structure_id', sf.fee_structure_id,
      'label', fs.label,
      'amount_expected', sf.amount_expected,
      'amount_paid', sf.amount_paid,
      'amount_remaining', sf.amount_remaining,
      'status', sf.status,
      'due_date', fs.due_date,
      'currency', fs.currency
    ) order by fs.due_date
  ) into v_result
  from app.student_fees sf
  join app.fee_structures fs on fs.id = sf.fee_structure_id and fs.school_id = v_school_id
  where sf.student_id = p_student_id and sf.school_id = v_school_id;

  return coalesce(v_result, '[]'::jsonb);
end
$schoolsafe$;

grant execute on function api.student_fee_list(uuid) to schoolsafe_api;

-- ----------------------------------------
-- PAIEMENTS : historique des paiements d'un élève
-- ----------------------------------------
create or replace function api.student_payment_list(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_result jsonb;
begin
  select s.class_id
  into v_class_id
  from app.students s
  where s.school_id = v_school_id
    and s.id = p_student_id;

  if not found then
    raise foreign_key_violation using message = 'Student not found in school';
  end if;

  perform iam.require_access('finance.receipt.read', null, p_student_id, v_class_id);

  select jsonb_agg(
    jsonb_build_object(
      'id', fp.id,
      'student_fee_id', fp.student_fee_id,
      'amount', fp.amount,
      'currency', fp.currency,
      'received_at', fp.received_at,
      'receipt_no', fp.receipt_no,
      'mode', fp.mode,
      'status', fp.status
    ) order by fp.received_at desc
  ) into v_result
  from app.fee_payments fp
  join app.student_fees sf on sf.id = fp.student_fee_id and sf.school_id = v_school_id
  where sf.student_id = p_student_id and sf.school_id = v_school_id;

  return coalesce(v_result, '[]'::jsonb);
end
$schoolsafe$;

grant execute on function api.student_payment_list(uuid) to schoolsafe_api;

-- ----------------------------------------
-- FRAIS : créer un nouveau frais pour un élève
-- ----------------------------------------
create or replace function api.student_fee_create(
  p_student_id uuid,
  p_fee_structure_id uuid,
  p_academic_year_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_class_id uuid;
  v_fee_structure app.fee_structures%rowtype;
  v_fee_id uuid;
begin
  select s.class_id
  into v_class_id
  from app.students s
  where s.school_id = v_school_id
    and s.id = p_student_id;

  if not found then
    raise foreign_key_violation using message = 'Student not found in school';
  end if;

  perform iam.require_access('finance.fee.manage', null, p_student_id, v_class_id);

  select * into v_fee_structure
  from app.fee_structures
  where id = p_fee_structure_id and school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Fee structure not found in school';
  end if;

  insert into app.student_fees (
    school_id, student_id, fee_structure_id,
    amount_expected, amount_paid, amount_remaining, status
  ) values (
    v_school_id, p_student_id, p_fee_structure_id,
    v_fee_structure.amount, 0, v_fee_structure.amount, 'pending'
  ) returning id into v_fee_id;

  return v_fee_id;
end
$schoolsafe$;

grant execute on function api.student_fee_create(uuid, uuid, uuid) to schoolsafe_api;

-- ----------------------------------------
-- PAIEMENTS : enregistrer un paiement
-- ----------------------------------------
create or replace function api.payment_create(
  p_student_fee_id uuid,
  p_amount numeric(12,2),
  p_currency text,
  p_received_by uuid,
  p_mode text default 'cash',
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_student_id uuid;
  v_class_id uuid;
  v_fee app.student_fees%rowtype;
  v_payment_id uuid;
begin
  select sf.student_id, s.class_id
  into v_student_id, v_class_id
  from app.student_fees sf
  join app.students s on s.id = sf.student_id and s.school_id = sf.school_id
  where sf.id = p_student_fee_id and sf.school_id = v_school_id;

  if not found then
    raise foreign_key_violation using message = 'Student fee not found';
  end if;

  perform iam.require_access('finance.payment.record', null, v_student_id, v_class_id);

  select * into v_fee
  from app.student_fees
  where id = p_student_fee_id and school_id = v_school_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'Student fee not found';
  end if;

  insert into app.fee_payments (
    school_id, student_fee_id, amount, currency,
    received_by, mode, reference, status
  ) values (
    v_school_id, p_student_fee_id, p_amount, p_currency,
    p_received_by, p_mode, p_reference, 'valid'
  ) returning id into v_payment_id;

  -- Mettre à jour le solde du frais
  update app.student_fees
  set amount_paid = amount_paid + p_amount,
      amount_remaining = amount_remaining - p_amount,
      status = case when amount_remaining - p_amount <= 0 then 'paid' else 'partial' end
  where id = p_student_fee_id and school_id = v_school_id;

  return v_payment_id;
end
$schoolsafe$;

grant execute on function api.payment_create(uuid, numeric, text, uuid, text, text) to schoolsafe_api;

commit;