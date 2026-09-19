\set ON_ERROR_STOP on

-- SchoolSafe Access v1 R3 — MATRICE AUTORITATIVE rôle × permission × portée × condition.
-- Une SEULE source de vérité : la constante v_matrix ci-dessous.
-- Chaque ligne est une décision écrite. Admin = snapshot figé des 60 codes.
-- Rejeu/upgrade : upsert (portée, condition, paramètres mis à jour) + suppression
-- stricte des grants obsolètes — la matrice est autoritaire et déterministe.
--
-- Tables de référence globales : ENABLE RLS sans policy (PAS force : le rôle
-- owner doit pouvoir provisionner et upgrader via des fonctions SECURITY
-- DEFINER ; les rôles applicatifs restent refusés — zéro policy + REVOKE).

begin;
set local role schoolsafe_owner;

insert into iam.scopes(code,label,description) values
 ('assigned_fee_classes','Classes des campagnes affectées','Campagnes publiées actives affectées à cet agent dans son école.')
on conflict (code) do update set label=excluded.label,description=excluded.description,is_active=true;

create table if not exists iam.role_templates (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  code text not null unique,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists iam.role_template_grants (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  template_id uuid not null references iam.role_templates (id),
  permission_id uuid not null references iam.permissions (id),
  default_scope_code text not null references iam.scopes (code),
  condition_code text,
  condition_params jsonb not null default '{}'::jsonb,
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  created_at timestamptz not null default pg_catalog.now(),
  unique (template_id, permission_id)
);

insert into iam.role_templates (id, code, label) values
  ('21000000-0000-4000-8000-000000000001', 'admin', 'Administrateur principal'),
  ('21000000-0000-4000-8000-000000000002', 'school_head', 'Chef d''établissement'),
  ('21000000-0000-4000-8000-000000000003', 'pedagogy', 'Responsable pédagogique'),
  ('21000000-0000-4000-8000-000000000004', 'teacher', 'Enseignant'),
  ('21000000-0000-4000-8000-000000000005', 'cashier', 'Agent de caisse'),
  ('21000000-0000-4000-8000-000000000006', 'guard', 'Agent de contrôle d''accès'),
  ('21000000-0000-4000-8000-000000000007', 'parent', 'Parent ou responsable légal'),
  ('21000000-0000-4000-8000-000000000008', 'fee_control', 'Responsable du contrôle des frais'),
  ('21000000-0000-4000-8000-000000000009', 'hr', 'Responsable RH'),
  ('21000000-0000-4000-8000-00000000000a', 'staff', 'Personnel'),
  ('21000000-0000-4000-8000-00000000000b', 'hikvision_admin', 'Administrateur du terminal de pointage')
on conflict (code) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- LA MATRICE — source unique de vérité.
-- Format : role → [ [permission, portée, condition|null, params|null], ... ]
-- ════════════════════════════════════════════════════════════════════════
do $schoolsafe$
declare
  v_matrix jsonb := '{
"admin": [
["session.bootstrap","none"],["school.class.read","school"],["school.student.read","school"],
["school.student.create","school"],["school.guardian.read","school"],["school.guardian.manage","school"],
["school.manage","school"],
["school.structure.manage","school"],["staff.manage","school"],["roles.manage","school"],
["security.pickup.read","school"],["security.pickup.manage","school"],["security.scan","school"],
["security.lockdown.manage","school"],["security.events.read","school"],["security.card.create","school"],
["cards.request.print","school"],
["cards.print.read","school"],["pilotage.dashboard.read","school"],["pilotage.alerts.read","school"],
["pilotage.alerts.manage","school"],["pilotage.approvals.read","own"],["pilotage.approvals.manage","school"],
["email.send","school"],["finance.fee.read","school"],["finance.fee.manage","school"],
["finance.payment.record","school"],["finance.payment.cancel","school"],
["finance.receipt.read","school"],["finance.report.read","school"],["finance.cash_register.close","school"],
["finance.cash_register.open","school"],
["finance.control.read","school"],["finance.control.manage","school"],["finance.control.scan","school"],
["finance.status.read","school"],["pedagogy.subject.read","school"],["pedagogy.subject.manage","school"],
["pedagogy.assignment.read","school"],["pedagogy.assignment.manage","school"],["pedagogy.grade.read","school"],
["pedagogy.grade.manage","school"],["pedagogy.lesson-plan.read","school"],["pedagogy.lesson-plan.manage","school"],
["pedagogy.report.read","school"],["pedagogy.report.manage","school"],["palmarques.read","school"],
["palmarques.manage","school"],["staff.read","school"],["staff.attendance.read","school"],
["canteen.manage","school"],["infirmary.manage","school"],["communication.announcement.manage","school"],
["communication.message.send","school"],["notification.subscribe","own"],["safe.assistant.use","own"],
["reports.operational.read","school"],["reports.financial.read","school"],["reports.security.read","school"],
["reports.hr.read","school"],["sync.submit","own"],["file.upload","own"],["file.download","own"]
],
"school_head": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["pilotage.dashboard.read","school"],["pilotage.alerts.read","school"],["pilotage.alerts.manage","school"],
["pilotage.approvals.read","own"],["pilotage.approvals.manage","school"],
["school.class.read","school"],["school.student.read","school"],["school.guardian.read","school"],
["staff.read","school"],["staff.attendance.read","school"],
["pedagogy.report.read","school"],["palmarques.read","school"],
["finance.report.read","school"],["finance.status.read","school"],["security.events.read","school"],
["reports.operational.read","school"],["reports.financial.read","school"],["reports.security.read","school"],
["reports.hr.read","school"],["communication.announcement.manage","school"],["communication.message.send","school"],
["email.send","school"]
],
"pedagogy": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["pedagogy.subject.read","school"],["pedagogy.subject.manage","school"],
["pedagogy.assignment.read","school"],["pedagogy.assignment.manage","school"],
["pedagogy.grade.read","school"],["pedagogy.grade.manage","school"],
["pedagogy.lesson-plan.read","school"],["pedagogy.lesson-plan.manage","school"],
["pedagogy.report.read","school"],["pedagogy.report.manage","school"],
["palmarques.read","school"],["palmarques.manage","school"],
["school.class.read","school"],["school.student.read","school"],["school.guardian.read","school"],
["finance.status.read","school"],
["pilotage.dashboard.read","school"],["pilotage.alerts.read","school"],["reports.operational.read","school"]
],
"teacher": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["pedagogy.subject.read","assigned_subjects"],
["pedagogy.assignment.read","assigned_classes"],["pedagogy.assignment.manage","assigned_classes"],
["pedagogy.grade.read","assigned_classes"],["pedagogy.grade.manage","assigned_classes"],
["pedagogy.lesson-plan.read","assigned_classes"],["pedagogy.lesson-plan.manage","assigned_classes"],
["school.class.read","assigned_classes"],["school.student.read","assigned_classes"],
["school.guardian.read","assigned_classes"],
["palmarques.read","assigned_classes"],["pilotage.alerts.read","assigned_classes"]
],
"cashier": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["finance.fee.read","school"],["finance.payment.record","school"],
["finance.payment.cancel","school","within_cancellation_window",{"max_age_hours":24}],
["finance.receipt.read","school"],["finance.report.read","school"],
["finance.cash_register.close","school"],
["finance.cash_register.open","school"],["finance.status.read","school"],
["pilotage.dashboard.read","school"]
],
"guard": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["security.scan","assigned_portal"],["security.pickup.read","assigned_portal"],
["security.pickup.manage","assigned_portal"],["security.events.read","assigned_portal"]
],
"parent": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["pedagogy.grade.read","own_children"],["pedagogy.assignment.read","own_children"],
["palmarques.read","own_children"],
["finance.receipt.read","own_children"],["finance.status.read","own_children"],
["security.pickup.read","own_children"],["school.guardian.read","own_children"]
],
"fee_control": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["finance.control.read","school"],["finance.control.manage","school"],
["finance.control.scan","assigned_fee_classes"],
["finance.fee.read","school"],["finance.status.read","school"],
["finance.report.read","school"],["pilotage.dashboard.read","school"]
],
"hr": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["staff.read","school"],["staff.attendance.read","school"],["reports.hr.read","school"]
],
"staff": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"]
],
"hikvision_admin": [
["session.bootstrap","none"],["sync.submit","own"],["file.upload","own"],
["file.download","own"],["notification.subscribe","own"],["safe.assistant.use","own"],
["staff.attendance.read","school"]
]
}'::jsonb;
  v_role text;
  v_row jsonb;
  v_template_id uuid;
  v_permission_id uuid;
begin
  for v_role in select pg_catalog.jsonb_object_keys(v_matrix) loop
    select t.id into v_template_id from iam.role_templates t where t.code = v_role;

    -- Upsert : la portée, la condition et les paramètres suivent TOUJOURS la
    -- matrice (jamais de conservation d'une ancienne valeur erronée).
    for v_row in select pg_catalog.jsonb_array_elements(v_matrix -> v_role) loop
      select p.id into v_permission_id from iam.permissions p where p.code = v_row ->> 0;

      insert into iam.role_template_grants (
        template_id, permission_id, default_scope_code, condition_code, condition_params
      )
      values (
        v_template_id,
        v_permission_id,
        v_row ->> 1,
        nullif(v_row ->> 2, ''),
        coalesce(v_row -> 3, '{}'::jsonb)
      )
      on conflict (template_id, permission_id) do update
      set default_scope_code = excluded.default_scope_code,
          condition_code = excluded.condition_code,
          condition_params = excluded.condition_params;
    end loop;

    -- Suppression stricte des grants absents de la matrice (autoritaire).
    delete from iam.role_template_grants g
    where g.template_id = v_template_id
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_matrix -> v_role) e
        join iam.permissions p on p.code = e ->> 0
        where p.id = g.permission_id
      );
  end loop;
end
$schoolsafe$;

-- ACL : aucun accès direct aux tables de référence pour les rôles applicatifs.
revoke all on iam.role_templates from schoolsafe_api;
revoke all on iam.role_template_grants from schoolsafe_api;
revoke all on iam.role_templates from schoolsafe_auth;
revoke all on iam.role_template_grants from schoolsafe_auth;

-- ENABLE (sans FORCE) + zéro policy : les rôles applicatifs sont refusés,
-- et le rôle owner conserve le passage nécessaire au provisioning sécurisé
-- et aux upgrades (une FORCE bloquerait même les fonctions DEFINER).
-- "no force" d'abord : un rejeu après une ancienne version FORCE doit
-- retomber sur ses pieds (upgrade déterministe).
alter table iam.role_templates no force row level security;
alter table iam.role_template_grants no force row level security;
alter table iam.role_templates enable row level security;
alter table iam.role_template_grants enable row level security;

commit;
