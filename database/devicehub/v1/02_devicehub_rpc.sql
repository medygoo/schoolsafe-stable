\set ON_ERROR_STOP on

-- SchoolSafe Device Hub — Phase 2b : RPC noyau du hub.
-- Unité additive : ne modifie aucune table ni unité existante.
-- - api.device_register : enregistrer un appareil (école du contexte
--   serveur, jamais du client ; série unique par école active).
-- - api.device_mapping_ensure : créer/réutiliser le mapping identité/appareil
--   et empiler les jobs de synchronisation (file durable, idempotence).
-- - api.device_event_ingest : journaliser un événement brut avec clé
--   d'idempotence fournisseur — le même événement n'est jamais dupliqué (§23),
--   et la résolution de mapping crée la ligne event_processing.
-- - api.device_sync_job_claim : réserver le prochain job dû (bail + tentatives).

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. ENREGISTRER UN APPAREIL — école du contexte serveur (§4/§30)
-- ============================================================================
create or replace function api.device_register(
  p_code text,
  p_vendor text,
  p_model text,
  p_serial_number text,
  p_location text default null,
  p_protocol text default 'unknown',
  p_connection_mode text default 'bridge'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_id uuid;
begin
  perform iam.require_access('school.settings.manage');

  insert into devicehub.devices (school_id, code, vendor, model, serial_number, location, protocol, connection_mode, status)
  values (v_school_id, p_code, p_vendor, p_model, p_serial_number, p_location, p_protocol, p_connection_mode, 'registered')
  returning id into v_id;

  return jsonb_build_object('device_id', v_id, 'code', p_code, 'status', 'registered');
end;
$schoolsafe$;

-- ============================================================================
-- 2. MAPPING + JOBS DE SYNCHRONISATION — file durable (§8/§9/§25)
-- ============================================================================
create or replace function api.device_mapping_ensure(
  p_device_id uuid,
  p_student_id uuid default null,
  p_subject_type text default 'student',
  p_person_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_device devicehub.devices%rowtype;
  v_mapping devicehub.device_subject_mappings%rowtype;
begin
  perform iam.require_access('school.student.create');

  select * into v_device from devicehub.devices
  where id = p_device_id and school_id = v_school_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Appareil introuvable dans cette école';
  end if;

  -- Réutiliser le mapping actif existant (jamais deux mappings actifs).
  select * into v_mapping
  from devicehub.device_subject_mappings
  where device_id = p_device_id and subject_type = p_subject_type
    and student_id is not distinct from p_student_id
    and sync_status <> 'disabled';
  if not found then
    insert into devicehub.device_subject_mappings (school_id, device_id, subject_type, student_id, external_person_id, generation, sync_status, wanted_revision)
    values (v_school_id, p_device_id, p_subject_type, p_student_id, '', 1, 'pending', 1)
    returning * into v_mapping;
  end if;

  -- Empiler le job de création/mise à jour : persisté AVANT exécution.
  insert into devicehub.device_sync_jobs (school_id, mapping_id, operation, revision, idempotency_key)
  values (
    v_school_id, v_mapping.id, 'create_person', v_mapping.wanted_revision,
    'create:' || v_mapping.id::text || ':' || v_mapping.wanted_revision
  )
  on conflict (idempotency_key) do nothing;

  update devicehub.device_subject_mappings
  set wanted_revision = wanted_revision + 1, updated_at = now()
  where id = v_mapping.id;

  return jsonb_build_object(
    'mapping_id', v_mapping.id,
    'sync_status', 'pending',
    'job_queued', true
  );
end;
$schoolsafe$;

-- ============================================================================
-- 3. INGESTION D'ÉVÉNEMENTS — idempotence fournisseur (§22-23)
-- ============================================================================
create or replace function api.device_event_ingest(
  p_device_id uuid default null,
  p_source text default 'terminal',
  p_raw_provider_event_id text default null,
  p_external_person_id text default null,
  p_credential_type text default null,
  p_event_type text default null,
  p_occurred_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_device devicehub.devices%rowtype;
  v_mapping devicehub.device_subject_mappings%rowtype;
  v_event_id uuid;
begin
  -- Le terminal ne fournit jamais l'école : résolue depuis l'appareil.
  if p_device_id is null and p_source = 'terminal' then
    raise exception using errcode = '22023', message = 'device_id requis pour un événement terminal';
  end if;
  if p_device_id is not null then
    select * into v_device from devicehub.devices
    where id = p_device_id and school_id = v_school_id;
    if not found then
      raise foreign_key_violation using message = 'Appareil introuvable dans cette école';
    end if;
  end if;

  -- Idempotence : le même événement brut n'est jamais dupliqué.
  if p_raw_provider_event_id is not null then
    select id into v_event_id from devicehub.device_events
    where school_id = v_school_id and device_id = p_device_id
      and raw_provider_event_id = p_raw_provider_event_id;
    if v_event_id is not null then
      return jsonb_build_object('event_id', v_event_id, 'duplicate', true);
    end if;
  end if;

  insert into devicehub.device_events (
    school_id, device_id, source, raw_provider_event_id,
    external_person_id, credential_type, event_type, occurred_at, metadata
  ) values (
    v_school_id, p_device_id, p_source, p_raw_provider_event_id,
    p_external_person_id, p_credential_type, p_event_type, p_occurred_at, p_metadata
  )
  returning id into v_event_id;

  -- Résolution immédiate si le mapping existe ; sinon file d'attente.
  select * into v_mapping
  from devicehub.device_subject_mappings
  where device_id = p_device_id
    and external_person_id = p_external_person_id
    and sync_status <> 'disabled'
  limit 1;
  if found then
    insert into devicehub.event_processing (event_id, school_id, mapping_id, subject_type, student_id, status, processed_at)
    values (v_event_id, v_school_id, v_mapping.id, v_mapping.subject_type, v_mapping.student_id, 'resolved', now());
  else
    insert into devicehub.event_processing (event_id, school_id, status, error_code)
    values (v_event_id, v_school_id, 'pending', 'MAPPING_NOT_FOUND');
  end if;

  -- Actualiser la dernière communication de l'appareil.
  if p_device_id is not null then
    update devicehub.devices set last_seen_at = now() where id = p_device_id;
  end if;

  return jsonb_build_object('event_id', v_event_id, 'duplicate', false);
end;
$schoolsafe$;

-- ============================================================================
-- 4. CLAIM D'UN JOB — bail, tentatives, reprise (§25)
-- ============================================================================
create or replace function api.device_sync_job_claim(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_jobs jsonb := '[]'::jsonb;
  v_row record;
begin
  perform iam.require_access('school.settings.manage');

  for v_row in
    select id, mapping_id, operation, revision, attempts
    from devicehub.device_sync_jobs
    where school_id = v_school_id
      and status in ('queued','retrying')
      and (next_attempt_at is null or next_attempt_at <= now())
      and (lease_expires_at is null or lease_expires_at < now())
    order by created_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  loop
    update devicehub.device_sync_jobs
    set status = 'running', attempts = attempts + 1,
        lease_expires_at = now() + interval '5 minutes', updated_at = now()
    where id = v_row.id;

    v_jobs := v_jobs || jsonb_build_object(
      'job_id', v_row.id, 'mapping_id', v_row.mapping_id,
      'operation', v_row.operation, 'revision', v_row.revision,
      'attempt', v_row.attempts + 1
    );
  end loop;

  return jsonb_build_object('jobs', v_jobs, 'claimed', jsonb_array_length(v_jobs));
end;
$schoolsafe$;

commit;