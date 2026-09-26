\set ON_ERROR_STOP on
-- SchoolSafe Setup v5 — unité 62 : approbation sécurisée des inscriptions.
-- Ajoute les colonnes d'approbation à auth.school_registration_requests,
-- la fonction d'audit système write_registration_event,
-- et les RPC de review/decision atomiques avec intégrité vérifiée.
begin;
set local role schoolsafe_owner;

-- ─── Colonnes d'approbation ────────────────────────────────────────
alter table auth.school_registration_requests
  add column if not exists approval_token_hash text,
  add column if not exists approval_expires_at timestamptz,
  add column if not exists approval_token_consumed_at timestamptz,
  add column if not exists approval_email_sent_at timestamptz;

-- Contrainte : hash NULL ou exactement 64 hex minuscules
alter table auth.school_registration_requests
  drop constraint if exists approval_token_hash_format;
alter table auth.school_registration_requests
  add constraint approval_token_hash_format
  check (approval_token_hash is null or approval_token_hash ~ '^[a-f0-9]{64}$');

-- Index unique partiel sur le token hash actif
drop index if exists auth.school_registration_requests_approval_token_hash_idx;
create unique index school_registration_requests_approval_token_hash_idx
  on auth.school_registration_requests (approval_token_hash)
  where approval_token_hash is not null;

-- ─── Audit système pour inscriptions (sans contexte utilisateur) ───
create or replace function audit.write_registration_event(
  p_school_id uuid,
  p_request_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_event_id uuid;
begin
  if p_event_type not in ('school.registration.approved', 'school.registration.rejected') then
    raise check_violation using message = 'Invalid registration audit event type';
  end if;
  if not exists (
    select 1 from auth.school_registration_requests r
    where r.id = p_request_id and r.school_id = p_school_id
  ) then
    raise foreign_key_violation using message = 'Registration request mismatch for audit';
  end if;

  insert into audit.events (
    school_id, actor_profile_id, request_id, event_type, entity_type, entity_id, payload
  ) values (
    p_school_id, null, p_request_id, p_event_type, 'school', p_school_id, coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end
$schoolsafe$;

revoke all on function audit.write_registration_event(uuid,uuid,text,jsonb) from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
grant execute on function audit.write_registration_event(uuid,uuid,text,jsonb) to schoolsafe_owner;

-- Policy INSERT owner dédiée pour audit des inscriptions système
do $schoolsafe$
begin
  execute pg_catalog.format('drop policy if exists %I on %s', 'registration_audit_insert', 'audit.events');
  execute pg_catalog.format(
    'create policy %I on %s for insert to schoolsafe_owner with check (event_type in (''school.registration.approved'',''school.registration.rejected'') and actor_profile_id is null and entity_type = ''school'' and exists (select 1 from auth.school_registration_requests r where r.id = request_id and r.school_id = entity_id))',
    'registration_audit_insert', 'audit.events'
  );
end
$schoolsafe$;

-- ─── RPC issue_approval ────────────────────────────────────────────
create or replace function api.school_registration_issue_approval(
  p_request_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_status text;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise check_violation using message = 'Valid SHA-256 token hash required';
  end if;
  if p_expires_at <= pg_catalog.now() then
    raise check_violation using message = 'Expiration must be in the future';
  end if;
  if p_expires_at > pg_catalog.now() + interval '172800 seconds' then
    raise check_violation using message = 'Token TTL exceeds maximum allowed';
  end if;

  select status into v_status
  from auth.school_registration_requests
  where id = p_request_id
  for update;

  if v_status is null then
    raise foreign_key_violation using message = 'Registration request not found';
  end if;
  if v_status <> 'pending' then
    raise check_violation using message = 'Request is not pending';
  end if;

  update auth.school_registration_requests
  set approval_token_hash = p_token_hash,
      approval_expires_at = p_expires_at,
      approval_token_consumed_at = null,
      updated_at = pg_catalog.now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id::text, 'status', 'pending');
end
$schoolsafe$;

-- ─── RPC mark_email_sent ───────────────────────────────────────────
create or replace function api.school_registration_mark_email_sent(
  p_request_id uuid,
  p_message_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  update auth.school_registration_requests
  set approval_email_sent_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_request_id
    and status = 'pending'
    and approval_token_hash is not null;
end
$schoolsafe$;

-- ─── RPC review ────────────────────────────────────────────────────
create or replace function api.school_registration_review(
  p_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_row record;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise check_violation using message = 'Valid token hash required';
  end if;

  select r.id as request_id, r.status, s.name as school_name, s.school_type,
         array_agg(distinct sc.cycle_key order by sc.cycle_key) filter (where sc.cycle_key is not null) as cycles,
         ay.label as academic_year_label,
         c.country, c.province, c.city, c.address, c.email as contact_email, c.phone as contact_phone,
         p.first_name as admin_first_name, p.last_name as admin_last_name,
         p.email as admin_email, p.phone as admin_phone
  into v_row
  from auth.school_registration_requests r
  join app.schools s on s.id = r.school_id
  left join app.school_cycles sc on sc.school_id = s.id
  left join app.academic_years ay on ay.id = r.academic_year_id
  left join app.school_contacts c on c.school_id = s.id
  join iam.profiles p on p.id = r.profile_id and p.user_id = r.user_id and p.school_id = r.school_id
  where r.approval_token_hash = p_token_hash
    and r.status = 'pending'
    and r.approval_token_consumed_at is null
    and r.approval_expires_at > pg_catalog.now();

  if v_row.request_id is null then
    raise insufficient_privilege using message = 'Invalid or expired approval token';
  end if;

  return jsonb_build_object(
    'request_id', v_row.request_id::text,
    'school_name', v_row.school_name,
    'school_type', v_row.school_type,
    'cycles', coalesce(v_row.cycles, array[]::text[]),
    'academic_year_label', v_row.academic_year_label,
    'contact', jsonb_build_object(
      'country', v_row.country,
      'province', v_row.province,
      'city', v_row.city,
      'address', v_row.address,
      'email', v_row.contact_email,
      'phone', v_row.contact_phone
    ),
    'admin', jsonb_build_object(
      'first_name', v_row.admin_first_name,
      'last_name', v_row.admin_last_name,
      'email', v_row.admin_email,
      'phone', v_row.admin_phone
    ),
    'status', v_row.status
  );
end
$schoolsafe$;

-- ─── RPC decide (approve/reject) ───────────────────────────────────
create or replace function api.school_registration_decide(
  p_token_hash text,
  p_decision text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_request record;
  v_rows integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise check_violation using message = 'Valid token hash required';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise check_violation using message = 'Decision must be approve or reject';
  end if;

  -- Verrouiller la ligne pour éviter double approbation
  select id, school_id, user_id, profile_id, identity_id, academic_year_id, status,
         approval_token_consumed_at, approval_expires_at
  into v_request
  from auth.school_registration_requests
  where approval_token_hash = p_token_hash
  for update;

  if v_request.id is null then
    raise insufficient_privilege using message = 'Unknown approval token';
  end if;
  if v_request.status <> 'pending' then
    raise check_violation using message = 'Request already decided';
  end if;
  if v_request.approval_token_consumed_at is not null then
    raise check_violation using message = 'Token already consumed';
  end if;
  if v_request.approval_expires_at <= pg_catalog.now() then
    raise check_violation using message = 'Approval token expired';
  end if;

  if p_decision = 'approve' then
    -- Activer les objets EXISTANTS uniquement avec vérification ROW_COUNT = 1
    update app.schools
    set is_active = true, setup_completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_request.school_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise foreign_key_violation using message = 'School activation failed: expected 1 row'; end if;

    update iam.users
    set is_active = true, updated_at = pg_catalog.now()
    where id = v_request.user_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise foreign_key_violation using message = 'User activation failed: expected 1 row'; end if;

    update iam.profiles
    set is_active = true, updated_at = pg_catalog.now()
    where id = v_request.profile_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise foreign_key_violation using message = 'Profile activation failed: expected 1 row'; end if;

    update auth.identities
    set status = 'active', updated_at = pg_catalog.now()
    where id = v_request.identity_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise foreign_key_violation using message = 'Identity activation failed: expected 1 row'; end if;

    update app.academic_years
    set is_active = true, updated_at = pg_catalog.now()
    where id = v_request.academic_year_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise foreign_key_violation using message = 'Academic year activation failed: expected 1 row'; end if;

    update auth.school_registration_requests
    set status = 'approved',
        approved_at = pg_catalog.now(),
        approval_token_consumed_at = pg_catalog.now(),
        approval_token_hash = null,
        updated_at = pg_catalog.now()
    where id = v_request.id;

    perform audit.write_registration_event(
      v_request.school_id,
      v_request.id,
      'school.registration.approved',
      jsonb_build_object('request_id', v_request.id::text)
    );

    return jsonb_build_object('request_id', v_request.id::text, 'status', 'approved');

  elsif p_decision = 'reject' then
    update auth.school_registration_requests
    set status = 'rejected',
        rejected_at = pg_catalog.now(),
        approval_token_consumed_at = pg_catalog.now(),
        approval_token_hash = null,
        updated_at = pg_catalog.now()
    where id = v_request.id;

    perform audit.write_registration_event(
      v_request.school_id,
      v_request.id,
      'school.registration.rejected',
      jsonb_build_object('request_id', v_request.id::text)
    );

    return jsonb_build_object('request_id', v_request.id::text, 'status', 'rejected');
  end if;

  raise check_violation using message = 'Unexpected decision path';
end
$schoolsafe$;

-- ─── ACL : seul schoolsafe_auth exécute ces RPC ────────────────────
revoke all on function api.school_registration_issue_approval(uuid,text,timestamptz) from public, schoolsafe_api, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.school_registration_mark_email_sent(uuid,text) from public, schoolsafe_api, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.school_registration_review(text) from public, schoolsafe_api, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
revoke all on function api.school_registration_decide(text,text) from public, schoolsafe_api, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;

grant execute on function api.school_registration_issue_approval(uuid,text,timestamptz) to schoolsafe_auth;
grant execute on function api.school_registration_mark_email_sent(uuid,text) to schoolsafe_auth;
grant execute on function api.school_registration_review(text) to schoolsafe_auth;
grant execute on function api.school_registration_decide(text,text) to schoolsafe_auth;

commit;