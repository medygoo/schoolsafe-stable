\set ON_ERROR_STOP on

-- SchoolSafe Device Hub — AttendanceService (§47/§48).
-- Unité additive : ne modifie aucune table ni unité existante.
-- Les règles métier de présence vivent dans SchoolSafe, jamais dans le
-- terminal. Le terminal dit uniquement "personne reconnue à telle heure".
-- - app.attendance_records : UNE présence par élève et jour (unicité),
--   arrivée/départ, état calculé, provenance des événements conservée.
-- - api.attendance_apply : consolide les événements résolus — plusieurs
--   authentifications rapprochées = 1 seul événement métier d'arrivée
--   (fenêtre de consolidation 5 minutes), événements bruts jamais
--   supprimés, idempotent (repasser ne duplique rien).

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. TABLE — une présence par élève et jour (§21/§48)
-- ============================================================================
create table if not exists app.attendance_records (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  day date not null,
  arrived_at timestamptz,
  left_at timestamptz,
  status text not null default 'present',
  source_event_ids uuid[] not null default '{}',
  computed_version integer not null default 1,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint attendance_school_fkey foreign key (school_id) references app.schools(id) on delete cascade,
  constraint attendance_student_fk foreign key (school_id, student_id) references app.students(school_id, id) on delete cascade,
  constraint attendance_day_unique unique (school_id, student_id, day),
  constraint attendance_status_check check (status in ('present','late','absent','left'))
);

-- ============================================================================
-- 2. CONSOLIDATION — appliquer les événements résolus (§47/§48)
-- ============================================================================
create or replace function api.attendance_apply(
  p_day date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_row record;
  v_record app.attendance_records%rowtype;
  v_applied int := 0;
begin
  perform iam.require_access('security.scan');

  -- Événements check_in/check_out résolus par élève, avec fenêtre de
  -- consolidation : une authentification répétée dans les 5 minutes ne crée
  -- pas une nouvelle arrivée.
  for v_row in
    select ep.student_id,
           ep.event_id,
           de.event_type,
           de.occurred_at
    from devicehub.event_processing ep
    join devicehub.device_events de on de.id = ep.event_id
    where ep.school_id = v_school_id
      and ep.status = 'resolved'
      and ep.student_id is not null
      and de.event_type in ('check_in','check_out')
      and de.occurred_at::date = p_day
    order by ep.student_id, de.occurred_at
  loop
    select * into v_record
    from app.attendance_records
    where school_id = v_school_id and student_id = v_row.student_id and day = p_day;

    if v_record.id is null then
      insert into app.attendance_records (school_id, student_id, day, arrived_at, status, source_event_ids, created_by)
      values (v_school_id, v_row.student_id, p_day, v_row.occurred_at, 'present',
              array[v_row.event_id], v_profile_id);
      v_applied := v_applied + 1;
    elsif v_row.event_type = 'check_in' then
      -- Consolidation : arrivée ignorée si déjà arrivée dans les 5 minutes.
      if (v_record.arrived_at is null or v_record.arrived_at + interval '5 minutes' > v_row.occurred_at)
         and not (v_record.source_event_ids @> array[v_row.event_id]) then
        update app.attendance_records
        set arrived_at = coalesce(arrived_at, v_row.occurred_at),
            source_event_ids = array_append(source_event_ids, v_row.event_id),
            updated_at = now()
        where id = v_record.id;
        if v_record.arrived_at is null then v_applied := v_applied + 1; end if;
      end if;
    else
      -- Sortie : ne jamais écraser une sortie existante.
      if v_record.left_at is null
         and not (v_record.source_event_ids @> array[v_row.event_id]) then
        update app.attendance_records
        set left_at = v_row.occurred_at,
            status = 'left',
            source_event_ids = array_append(source_event_ids, v_row.event_id),
            updated_at = now()
        where id = v_record.id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('day', p_day, 'records_touched', v_applied, 'idempotent', true);
end;
$schoolsafe$;

commit;
