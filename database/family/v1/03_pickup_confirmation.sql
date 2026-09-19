\set ON_ERROR_STOP on

-- SchoolSafe Familles — Lot C3 : confirmation de remise transactionnelle (V16/R16–R17).
-- Unité additive : ne modifie aucune table ni unité existante.
-- - Revalidation serveur AU MOMENT de confirmer : la liste affichée il y a
--   dix minutes ne suffit pas ; une révocation validée avant la confirmation
--   fait refuser la remise (R16).
-- - Une répétition de la même requête (clé d'idempotence) ne crée pas deux
--   sorties ; une seconde remise d'un enfant déjà sorti ce jour est refusée
--   (R17).
-- - Le gardien confirme ; la comparaison humaine photo reste hors logiciel.

begin;
set local role schoolsafe_owner;

create or replace function api.pickup_confirm(
  p_student_id uuid,
  p_guardian_id uuid,               -- responsable familial OU accrédité (fiche personne)
  p_guardian_profile_id uuid,       -- profil du gardien qui confirme
  p_request_key text,               -- clé d'idempotence fournie par l'appelant
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_guardian app.student_guardians%rowtype;
  v_auth app.pickup_authorizations%rowtype;
  v_existing record;
  v_allowed boolean := false;
  v_basis text;
begin
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Élève introuvable';
  end if;

  perform iam.require_access('security.scan', null, p_student_id, null);

  -- Idempotence : la même clé retourne le résultat déjà enregistré (R17).
  select event_type, metadata into v_existing
  from app.security_events
  where school_id = v_school_id and student_id = p_student_id
    and event_type = 'pickup_confirmed'
    and metadata->>'request_key' = p_request_key
  limit 1;
  if found then
    return jsonb_build_object('status', 'already_confirmed', 'idempotent', true,
      'event_type', v_existing.event_type);
  end if;

  -- Verrou de l'élève : la confirmation et une révocation concurrente sont
  -- ordonnées par le même mécanisme (T11/T19).
  perform 1 from app.students where id = p_student_id for update;

  -- Une seule sortie par jour (R17) : refuser une seconde remise.
  perform 1
  from app.security_events
  where school_id = v_school_id and student_id = p_student_id
    and event_type = 'pickup_confirmed'
    and occurred_at::date = current_date;
  if found then
    raise exception using errcode = '22023',
      message = 'PICKUP_ALREADY_DONE : remise déjà confirmée aujourd''hui pour cet élève';
  end if;

  -- Résolution de la fiche personne.
  select * into v_guardian
  from app.student_guardians
  where id = p_guardian_id and student_id = p_student_id and school_id = v_school_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Personne non liée à cet élève';
  end if;

  -- Droit en vigueur, recalculé maintenant (V16) :
  -- 1) responsable familial actif autorisé (V09/V10), ou
  if v_guardian.is_active = true and v_guardian.is_authorized_pickup = true
     and v_guardian.guardian_type in ('pere','mere','tuteur') then
    v_allowed := true;
    v_basis := 'family';
  else
    -- 2) accréditation externe active dans sa période (une ligne ACTIVE mais
    --    échue reste refusée — le traitement périodique ne fait pas foi).
    select * into v_auth
    from app.pickup_authorizations
    where guardian_id = p_guardian_id and student_id = p_student_id and school_id = v_school_id
      and status = 'active'
    order by updated_at desc
    limit 1;
    if found
       and (v_auth.starts_on is null or v_auth.starts_on <= current_date)
       and (v_auth.ends_on is null or v_auth.ends_on >= current_date) then
      v_allowed := true;
      v_basis := 'accredited';
    end if;
  end if;

  if not v_allowed then
    insert into app.security_events (school_id, student_id, card_id, event_type, decision, denial_reason, metadata)
    values (
      v_school_id, p_student_id, null, 'pickup_denied', 'denied', 'PICKUP_RESTRICTED',
      jsonb_build_object('guardian_id', p_guardian_id, 'request_key', p_request_key,
        'actor', p_guardian_profile_id, 'note', p_note)
    );
    raise exception using errcode = '22023',
      message = 'PICKUP_RESTRICTED : aucun droit de récupération en vigueur pour cette personne';
  end if;

  -- Confirmation : événement unique, jamais dupliqué (idempotence ci-dessus).
  insert into app.security_events (school_id, student_id, card_id, event_type, decision, scanned_by, metadata)
  values (
    v_school_id, p_student_id, null, 'pickup_confirmed', 'allowed', p_guardian_profile_id,
    jsonb_build_object(
      'guardian_id', p_guardian_id,
      'guardian_name', v_guardian.full_name,
      'basis', v_basis,
      'authorization_id', v_auth.id,
      'request_key', p_request_key,
      'note', p_note
    )
  );

  return jsonb_build_object(
    'status', 'confirmed',
    'basis', v_basis,
    'guardian_name', v_guardian.full_name
  );
end;
$schoolsafe$;

commit;