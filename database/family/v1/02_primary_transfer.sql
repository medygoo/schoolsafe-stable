\set ON_ERROR_STOP on

-- SchoolSafe Familles — Lot C2 : transfert du responsable principal (V12/T04).
-- Unité additive : ne modifie aucune table existante.
-- - Index unique partiel : au plus UN lien familial principal actif par élève.
-- - api.family_primary_transfer : opération atomique école habilitée —
--   retirer l'ancienne autorité principale et attribuer la nouvelle dans
--   la même transaction, sous verrou de l'élève ; jamais deux principaux,
--   jamais zéro principal à la fin de l'opération.
-- - Historique conservé dans app.security_events (ancien, nouveau, acteur, motif).

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. INVARIANT — au plus un principal actif par élève (T17)
-- ============================================================================
create unique index if not exists student_guardians_single_primary
  on app.student_guardians (school_id, student_id)
  where (is_primary = true and is_active = true);

-- ============================================================================
-- 2. TRANSFERT ATOMIQUE DU PRINCIPAL — école habilitée (V12/T04)
-- ============================================================================
create or replace function api.family_primary_transfer(
  p_student_id uuid,
  p_new_guardian_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_old record;
  v_new record;
begin
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Élève introuvable';
  end if;

  perform iam.require_access('school.guardian.manage', null, p_student_id, null);

  -- Verrou de l'élève : sérialise tout transfert concurrent sur cet enfant.
  perform 1 from app.students where id = p_student_id for update;

  -- Nouveau lien : doit exister, être actif et valide pour cet élève.
  select id, guardian_type, full_name into v_new
  from app.student_guardians
  where id = p_new_guardian_id and student_id = p_student_id and school_id = v_school_id
    and is_active = true;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'Nouveau responsable introuvable ou lien non actif';
  end if;

  -- Ancien principal actif (peut ne pas exister si dossier en correction).
  select id, full_name into v_old
  from app.student_guardians
  where student_id = p_student_id and school_id = v_school_id
    and is_primary = true and is_active = true;

  -- Retrait et attribution dans la même transaction : jamais zéro ni deux.
  update app.student_guardians
  set is_primary = false, updated_at = now()
  where student_id = p_student_id and school_id = v_school_id
    and is_primary = true and is_active = true and id <> p_new_guardian_id;

  update app.student_guardians
  set is_primary = true, updated_at = now()
  where id = p_new_guardian_id;

  -- Historique du transfert (V12) : ancien, nouveau, acteur, motif, date.
  insert into app.security_events (school_id, student_id, event_type, decision, metadata)
  values (
    v_school_id, p_student_id, 'family_primary_transfer', 'noted',
    jsonb_build_object(
      'old_guardian_id', v_old.id,
      'old_name', v_old.full_name,
      'new_guardian_id', p_new_guardian_id,
      'new_name', v_new.full_name,
      'actor', v_profile_id,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'student_id', p_student_id,
    'old_guardian_id', v_old.id,
    'new_guardian_id', p_new_guardian_id,
    'status', 'transferred'
  );
end;
$schoolsafe$;

commit;
