\set ON_ERROR_STOP on

-- SchoolSafe Cartes v1 — unité 02 : RPC pour les classes avec config carte.

begin;
set local role schoolsafe_owner;

create or replace function api.class_card_config_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
begin
  perform iam.require_access('school.class.read', null, null, null);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'cycle_key', c.cycle_key,
        'option', c.option,
        'teacher_id', c.teacher_id,
        'academic_year_id', c.academic_year_id,
        'card_color', c.card_color,
        'card_color_soft', c.card_color_soft,
        'card_color_dark', c.card_color_dark,
        'card_pat', c.card_pat,
        'card_family', c.card_family,
        'card_variant', c.card_variant,
        'card_pat_style', c.card_pat_style,
        'is_active', c.is_active
      ) order by c.name
    ), '[]'::jsonb)
    from app.classes c
    where c.school_id = v_school_id
  );
end
$schoolsafe$;
grant execute on function api.class_card_config_list() to schoolsafe_api;

commit;