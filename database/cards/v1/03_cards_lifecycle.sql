\set ON_ERROR_STOP on

-- SchoolSafe Cartes — Lot 2 : cycle de vie perte/vol des cartes élèves.
-- Unité additive : ne modifie aucune table ni unité existante.
-- - Signalement perte/vol (école habilitée ou principal via parcours autorisé).
-- - Suspension immédiate : l'ancien QR est refusé même réimprimé.
-- - Remplacement : nouvelle carte, lien vers l'ancienne révoquée.
-- - Réimpression contrôlée : même credential, support récupéré/détruit.
-- - Distribution : remise de la carte à l'élève confirmée par l'admin.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. SIGNALEMENT PERTE / VOL — suspend immédiatement la carte active
-- ============================================================================

create or replace function api.card_loss_report(
  p_student_id uuid,
  p_card_id uuid default null,
  p_reason text default null,
  p_reported_by_relation text default 'school'  -- 'school' | 'primary_guardian'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_card app.student_cards%rowtype;
begin
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Élève introuvable';
  end if;

  perform iam.require_access('cards.request.print', null, p_student_id, null);

  if p_card_id is null then
    select * into v_card
    from app.student_cards
    where student_id = p_student_id and school_id = v_school_id and status = 'active'
    order by issued_at desc
    limit 1;
  else
    select * into v_card
    from app.student_cards
    where id = p_card_id and student_id = p_student_id and school_id = v_school_id;
  end if;

  if not found then
    raise exception using errcode = 'P0002', message = 'Aucune carte active à signaler';
  end if;

  update app.student_cards
  set status = 'lost', updated_at = now()
  where id = v_card.id;

  insert into app.security_events (school_id, student_id, card_id, event_type, decision, metadata)
  values (
    v_school_id, p_student_id, v_card.id, 'card_loss_reported', 'noted',
    jsonb_build_object(
      'reason', p_reason,
      'reported_by', v_profile_id,
      'reported_by_relation', p_reported_by_relation,
      'card_number', v_card.card_number
    )
  );

  return jsonb_build_object(
    'card_id', v_card.id,
    'card_number', v_card.card_number,
    'status', 'lost'
  );
end;
$schoolsafe$;

-- ============================================================================
-- 2. REMPLACEMENT — révoque l'ancienne carte, émet une nouvelle
-- ============================================================================

create or replace function api.card_replace(
  p_student_id uuid,
  p_old_card_id uuid,
  p_reason text,
  p_card_number text,
  p_signature text,
  p_card_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_old app.student_cards%rowtype;
  v_new_id uuid;
begin
  perform 1 from app.students where id = p_student_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Élève introuvable';
  end if;

  perform iam.require_access('cards.request.print', null, p_student_id, null);

  select * into v_old
  from app.student_cards
  where id = p_old_card_id and student_id = p_student_id and school_id = v_school_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Carte à remplacer introuvable';
  end if;
  if v_old.status = 'replaced' then
    raise exception using errcode = '22023', message = 'Carte déjà remplacée';
  end if;

  update app.student_cards
  set status = 'replaced', revoked_at = now(), updated_at = now()
  where id = v_old.id;

  insert into app.student_cards (
    school_id, student_id, card_number, card_secret, signature, status
  ) values (
    v_school_id, p_student_id, p_card_number, p_card_secret, p_signature, 'active'
  )
  returning id into v_new_id;

  update app.student_cards
  set replaced_by_card_id = v_new_id
  where id = v_old.id;

  insert into app.security_events (school_id, student_id, card_id, event_type, decision, metadata)
  values (
    v_school_id, p_student_id, v_new_id, 'card_replaced', 'noted',
    jsonb_build_object(
      'reason', p_reason,
      'actor', v_profile_id,
      'old_card_id', v_old.id,
      'old_card_number', v_old.card_number
    )
  );

  return jsonb_build_object(
    'old_card_id', v_old.id,
    'new_card_id', v_new_id,
    'card_number', p_card_number,
    'status', 'active'
  );
end;
$schoolsafe$;

-- ============================================================================
-- 3. RÉIMPRESSION CONTRÔLÉE — même credential, support récupéré/détruit
-- ============================================================================

create or replace function api.card_reprint_authorize(
  p_card_id uuid,
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
  v_card app.student_cards%rowtype;
begin
  select * into v_card
  from app.student_cards
  where id = p_card_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Carte introuvable';
  end if;

  perform iam.require_access('cards.request.print', null, v_card.student_id, null);

  if v_card.status <> 'active' then
    raise exception using errcode = '22023',
      message = 'Carte non réimprimable (état : ' || v_card.status ||
      ') — une carte perdue ou remplacée exige un remplacement, pas une réimpression';
  end if;

  insert into app.security_events (school_id, student_id, card_id, event_type, decision, metadata)
  values (
    v_school_id, v_card.student_id, v_card.id, 'card_reprint_authorized', 'noted',
    jsonb_build_object('reason', p_reason, 'actor', v_profile_id, 'card_number', v_card.card_number)
  );

  return jsonb_build_object(
    'card_id', v_card.id,
    'card_number', v_card.card_number,
    'status', v_card.status,
    'reprint', 'authorized'
  );
end;
$schoolsafe$;

-- ============================================================================
-- 4. DISTRIBUTION — remise de la carte à l'élève confirmée par l'admin
--    (student_cards n'a pas de colonne metadata : trace dans security_events)
-- ============================================================================

create or replace function api.card_mark_distributed(
  p_card_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_profile_id uuid := iam.current_profile_id();
  v_student_id uuid;
  v_card_number text;
begin
  select student_id, card_number into v_student_id, v_card_number
  from app.student_cards
  where id = p_card_id and school_id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'Carte introuvable';
  end if;

  perform iam.require_access('cards.request.print', null, v_student_id, null);

  insert into app.security_events (school_id, student_id, card_id, event_type, decision, metadata)
  values (
    v_school_id, v_student_id, p_card_id, 'card_distributed', 'noted',
    jsonb_build_object('distributed_by', v_profile_id, 'card_number', v_card_number)
  );

  return jsonb_build_object('card_id', p_card_id, 'distributed', true);
end;
$schoolsafe$;

commit;