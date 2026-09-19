\set ON_ERROR_STOP on

-- SchoolSafe Familles — Lot E : import collectif des élèves.
-- Unité additive : ne modifie aucune table ni unité existante.
-- - app.import_jobs : un lot par école et fichier (empreinte SHA-256,
--   statuts preparing/previewed/committed/failed, compteurs réels).
-- - app.import_rows : une ligne par élève importé, résultat détaillé.
-- - api.import_prepare : lot idempotent par empreinte (relancer le même
--   fichier retourne le même lot, T13).
-- - api.import_preview : aperçu des lignes sans aucune écriture métier.
-- - api.import_commit : application confirmée, matricule unique dans
--   l'école, rapprochement par référence source, rejet propre si le
--   matricule est apparu entre l'aperçu et l'application.
-- L'école vient du contexte serveur, jamais du fichier.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. TABLES
-- ============================================================================
create table if not exists app.import_jobs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  source_filename text not null,
  file_sha256 text not null,
  status text not null default 'preparing',
  total_rows integer not null default 0,
  created_rows integer not null default 0,
  matched_rows integer not null default 0,
  rejected_rows integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint import_jobs_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint import_jobs_status_check check (status in ('preparing','previewed','committed','failed')),
  constraint import_jobs_school_file_unique unique (school_id, file_sha256)
);

create table if not exists app.import_rows (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  job_id uuid not null,
  school_id uuid not null,
  line_no integer not null,
  eleve_ref text,
  matricule text,
  first_name text,
  last_name text,
  class_code text,
  guardian_data jsonb not null default '{}'::jsonb,
  result_status text not null default 'pending',
  error_code text,
  resolved_student_id uuid,
  constraint import_rows_job_fkey foreign key (job_id) references app.import_jobs(id) on delete cascade,
  constraint import_rows_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint import_rows_status_check check (result_status in ('pending','create','match','reject','done'))
);

create index if not exists import_rows_job_idx on app.import_rows (job_id);
create index if not exists import_rows_student_idx on app.import_rows (resolved_student_id) where resolved_student_id is not null;

-- ============================================================================
-- 2. PREPARE — lot idempotent par empreinte (T13)
-- ============================================================================
create or replace function api.import_prepare(
  p_filename text,
  p_file_sha256 text,
  p_rows jsonb  -- [{line_no, eleve_ref, matricule, first_name, last_name, class_code, guardian_data}]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_job app.import_jobs%rowtype;
  v_row jsonb;
begin
  perform iam.require_access('school.student.create');

  -- Idempotence : le même fichier (même empreinte, même école) retourne
  -- le lot existant sans rien recréer (T13).
  select * into v_job
  from app.import_jobs
  where school_id = v_school_id and file_sha256 = p_file_sha256;
  if found then
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status,
      'total_rows', v_job.total_rows, 'idempotent', true);
  end if;

  insert into app.import_jobs (school_id, source_filename, file_sha256, created_by)
  values (v_school_id, p_filename, p_file_sha256, v_profile_id)
  returning * into v_job;

  if jsonb_typeof(p_rows) = 'array' then
    for v_row in select * from jsonb_array_elements(p_rows) loop
      insert into app.import_rows (
        job_id, school_id, line_no, eleve_ref, matricule,
        first_name, last_name, class_code, guardian_data
      ) values (
        v_job.id, v_school_id,
        (v_row->>'line_no')::int,
        v_row->>'eleve_ref',
        v_row->>'matricule',
        v_row->>'first_name',
        v_row->>'last_name',
        v_row->>'class_code',
        coalesce(v_row->'guardian_data', '{}'::jsonb)
      );
    end loop;
  end if;

  update app.import_jobs set total_rows = (select count(*) from app.import_rows where job_id = v_job.id)
  where id = v_job.id;

  return jsonb_build_object('job_id', v_job.id, 'status', 'preparing',
    'total_rows', (select count(*) from app.import_rows where job_id = v_job.id), 'idempotent', false);
end;
$schoolsafe$;

-- ============================================================================
-- 3. PREVIEW — aperçu sans écriture métier (§8.2)
-- ============================================================================
create or replace function api.import_preview(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_job app.import_jobs%rowtype;
  v_plan jsonb := '[]'::jsonb;
  v_row record;
  v_action text;
  v_existing uuid;
  v_error text;
begin
  perform iam.require_access('school.student.create');

  select * into v_job from app.import_jobs
  where id = p_job_id and school_id = v_school_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lot d''import introuvable';
  end if;
  if v_job.status = 'committed' then
    raise exception using errcode = '22023', message = 'IMPORT_STALE_PREVIEW : lot déjà appliqué';
  end if;

  for v_row in
    select r.*, c.id as class_id, s.id as student_id
    from app.import_rows r
    left join app.classes c on c.school_id = r.school_id and c.name = r.class_code
    left join app.students s on s.school_id = r.school_id and s.matricule = r.matricule and r.matricule is not null
    where r.job_id = p_job_id
    order by r.line_no
  loop
    v_action := 'create';
    v_error := null;
    v_existing := null;
    if v_row.student_id is not null then
      v_action := 'match';
      v_existing := v_row.student_id;
    elsif v_row.matricule is null or v_row.first_name is null or v_row.last_name is null then
      v_action := 'reject';
      v_error := 'MISSING_REQUIRED_FIELD';
    elsif v_row.class_id is null then
      v_action := 'reject';
      v_error := 'CLASS_NOT_FOUND';
    end if;

    v_plan := v_plan || jsonb_build_object(
      'line_no', v_row.line_no,
      'eleve_ref', v_row.eleve_ref,
      'matricule', v_row.matricule,
      'name', (v_row.first_name || ' ' || coalesce(v_row.last_name, '')),
      'action', v_action,
      'matched_student_id', v_existing,
      'error_code', v_error
    );

    update app.import_rows
    set result_status = case v_action when 'match' then 'match' when 'reject' then 'reject' else 'create' end,
        error_code = v_error,
        resolved_student_id = v_existing
    where id = v_row.id;
  end loop;

  update app.import_jobs
  set status = 'previewed',
      matched_rows = (select count(*) from app.import_rows where job_id = p_job_id and result_status = 'match'),
      rejected_rows = (select count(*) from app.import_rows where job_id = p_job_id and result_status = 'reject')
  where id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'status', 'previewed',
    'plan', v_plan,
    'counts', jsonb_build_object(
      'total', (select count(*) from app.import_rows where job_id = p_job_id),
      'create', (select count(*) from app.import_rows where job_id = p_job_id and result_status = 'create'),
      'match', (select count(*) from app.import_rows where job_id = p_job_id and result_status = 'match'),
      'reject', (select count(*) from app.import_rows where job_id = p_job_id and result_status = 'reject')
    )
  );
end;
$schoolsafe$;

-- ============================================================================
-- 4. COMMIT — application confirmée, idempotente, matricule unique (T13)
-- ============================================================================
create or replace function api.import_commit(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_job app.import_jobs%rowtype;
  v_row record;
  v_created int := 0;
  v_matched int := 0;
  v_rejected int := 0;
  v_new_id uuid;
begin
  perform iam.require_access('school.student.create');

  select * into v_job from app.import_jobs
  where id = p_job_id and school_id = v_school_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lot d''import introuvable';
  end if;
  if v_job.status = 'committed' then
    -- Idempotence : un lot déjà appliqué retourne son résultat sans rien refaire.
    return jsonb_build_object('job_id', p_job_id, 'status', 'committed',
      'created_rows', v_job.created_rows, 'matched_rows', v_job.matched_rows,
      'rejected_rows', v_job.rejected_rows, 'idempotent', true);
  end if;
  if v_job.status <> 'previewed' then
    raise exception using errcode = '22023', message = 'IMPORT_STALE_PREVIEW : aperçu requis avant application';
  end if;

  for v_row in
    select r.*, c.id as class_id
    from app.import_rows r
    left join app.classes c on c.school_id = r.school_id and c.name = r.class_code
    where r.job_id = p_job_id
    order by r.line_no
  loop
    if v_row.result_status = 'create' then
      begin
        insert into app.students (school_id, class_id, matricule, first_name, last_name, lifecycle_status, created_by)
        values (v_school_id, v_row.class_id, v_row.matricule, v_row.first_name, v_row.last_name, 'draft', v_profile_id)
        returning id into v_new_id;
        update app.import_rows set result_status = 'done', resolved_student_id = v_new_id where id = v_row.id;
        v_created := v_created + 1;
      exception when unique_violation then
        -- Matricule apparu entre l'aperçu et l'application : rejet propre.
        update app.import_rows set result_status = 'reject', error_code = 'STUDENT_MATRICULE_EXISTS' where id = v_row.id;
        v_rejected := v_rejected + 1;
      end;
    elsif v_row.result_status = 'match' then
      v_matched := v_matched + 1;
    else
      v_rejected := v_rejected + 1;
    end if;
  end loop;

  update app.import_jobs
  set status = 'committed', created_rows = v_created, matched_rows = v_matched,
      rejected_rows = v_rejected, updated_at = now()
  where id = p_job_id;

  insert into app.security_events (school_id, event_type, decision, metadata)
  values (v_school_id, 'student_import_committed', 'noted',
    jsonb_build_object('job_id', p_job_id, 'created', v_created, 'matched', v_matched, 'rejected', v_rejected, 'actor', v_profile_id));

  return jsonb_build_object('job_id', p_job_id, 'status', 'committed',
    'created_rows', v_created, 'matched_rows', v_matched, 'rejected_rows', v_rejected);
end;
$schoolsafe$;

commit;