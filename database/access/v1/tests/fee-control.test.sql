-- Preuve C : fee_control et la portée assigned_classes (relation métier correcte).
\set ON_ERROR_STOP on
begin;
-- Seed technique : désactivation temporaire de RLS et des triggers d'audit
set local role schoolsafe_owner;
alter table app.schools disable row level security;
alter table app.academic_years disable row level security;
alter table app.classes disable row level security;
alter table app.fee_structures disable row level security;
alter table app.students disable row level security;
alter table app.student_fees disable row level security;
alter table app.fee_control_campaigns disable row level security;
alter table app.fee_control_assignees disable row level security;
alter table iam.users disable row level security;
alter table iam.profiles disable row level security;
alter table iam.roles disable row level security;
alter table iam.profile_roles disable row level security;
alter table iam.role_permission_grants disable row level security;
alter table iam.grant_scopes disable row level security;
alter table iam.roles disable trigger iam_roles_audit;
alter table iam.profile_roles disable trigger iam_profile_roles_audit;
alter table iam.role_permission_grants disable trigger iam_role_permission_grants_audit;
alter table iam.grant_scopes disable trigger iam_grant_scopes_audit;
insert into app.schools (id, code, name) values
  ('40000000-0000-4000-8000-000000000004', 'FC-SCHOOL4', 'Ecole Fee Control');
insert into iam.users (id, auth_provider, external_subject, email) values
  ('41000000-0000-4000-8000-000000000004', 'test', 'fc-user-4', 'fc4@example.invalid'),
  ('41000000-0000-4000-8000-00000000000d', 'test', 'fc-user2-4', 'fc24@example.invalid');
insert into app.academic_years (id, school_id, label, starts_on, ends_on, periods, is_active) values
  ('46000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '2026-2027', date '2026-09-01', date '2027-07-31', 'Trimestres', true);
insert into iam.profiles (id, user_id, school_id, display_name) values
  ('42000000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 'Agent FC Affecte'),
  ('c2000000-0000-4000-8000-00000000000d', '41000000-0000-4000-8000-00000000000d', '40000000-0000-4000-8000-000000000004', 'Agent FC Non Affecte');
insert into app.classes (id, school_id, academic_year_id, cycle_key, name) values
  ('47000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '46000000-0000-4000-8000-000000000004', 'primary', '6A');
insert into iam.roles (id, school_id, code, label) values
  ('43000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 'fee_control', 'Controle des frais');
insert into iam.profile_roles (school_id, profile_id, role_id, is_active)
select '40000000-0000-4000-8000-000000000004', pr.id, '43000000-0000-4000-8000-000000000004', true
from iam.profiles pr where pr.school_id = '40000000-0000-4000-8000-000000000004';
insert into iam.role_permission_grants (id, school_id, role_id, permission_id, effect)
select '44000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004',
  '43000000-0000-4000-8000-000000000004', p.id, 'allow'
from iam.permissions p where p.code = 'finance.control.scan';
insert into iam.grant_scopes (id, school_id, grant_id, scope_code)
select '45000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004',
  '44000000-0000-4000-8000-000000000004', 'assigned_fee_classes';
-- Réactivation de RLS et des triggers avant les tests de logique
alter table app.schools enable row level security;
alter table app.academic_years enable row level security;
alter table app.classes enable row level security;
alter table app.fee_structures enable row level security;
alter table app.students enable row level security;
alter table app.student_fees enable row level security;
alter table app.fee_control_campaigns enable row level security;
alter table app.fee_control_assignees enable row level security;
alter table iam.users enable row level security;
alter table iam.profiles enable row level security;
alter table iam.roles enable row level security;
alter table iam.profile_roles enable row level security;
alter table iam.role_permission_grants enable row level security;
alter table iam.grant_scopes enable row level security;
alter table iam.roles enable trigger iam_roles_audit;
alter table iam.profile_roles enable trigger iam_profile_roles_audit;
alter table iam.role_permission_grants enable trigger iam_role_permission_grants_audit;
alter table iam.grant_scopes enable trigger iam_grant_scopes_audit;
reset role;
-- Campagne publiée couvrant la classe 6A, avec l'agent affecté.
insert into app.fee_structures (id, school_id, academic_year_id, label, amount, currency) values
  ('48000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '46000000-0000-4000-8000-000000000004', 'Frais', 100, 'USD');
insert into app.fee_control_campaigns (id, school_id, fee_structure_id, label, classes, status, created_by) values
  ('49000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '48000000-0000-4000-8000-000000000004',
   'Campagne 6A', '["47000000-0000-4000-8000-000000000004"]', 'published', '42000000-0000-4000-8000-000000000004');
insert into app.fee_control_assignees (school_id, campaign_id, profile_id) values
  ('40000000-0000-4000-8000-000000000004', '49000000-0000-4000-8000-000000000004', '42000000-0000-4000-8000-000000000004');



insert into app.schools(id,code,name) values('40000000-0000-4000-8000-000000000005','FC-OTHER','Other school');
insert into app.academic_years(id,school_id,label,starts_on,ends_on,periods) values
('46000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000005','Year',current_date,current_date+100,'Trimestres');
insert into app.classes(id,school_id,academic_year_id,cycle_key,name) values
('47000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000005','46000000-0000-4000-8000-000000000005','primary','Other');
-- Even malformed campaign JSON mentioning another school's class must not authorize it.
update app.fee_control_campaigns set classes=classes||'["47000000-0000-4000-8000-000000000005"]'::jsonb;
create function pg_temp.check_scan(expected boolean, msg text, campaign text default '49000000-0000-4000-8000-000000000004', class_id uuid default '47000000-0000-4000-8000-000000000004') returns void language plpgsql as $$
begin
 if api.check_access('finance.control.scan',null,null,class_id,null,null,jsonb_build_object('campaign_id',campaign)) is distinct from expected then raise exception '%',msg; end if;
end $$;
set local role schoolsafe_api;
select api.set_request_context('41000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','4b000000-0000-4000-8000-000000000004');
select pg_temp.check_scan(true,'assigned non-teacher must pass');
select pg_temp.check_scan(false,'missing campaign denied',null);
select pg_temp.check_scan(false,'other campaign denied','49000000-0000-4000-8000-000000000005');
select pg_temp.check_scan(false,'actual other-school class denied','49000000-0000-4000-8000-000000000004','47000000-0000-4000-8000-000000000005');
select api.set_request_context('41000000-0000-4000-8000-00000000000d','c2000000-0000-4000-8000-00000000000d','40000000-0000-4000-8000-000000000004','4b000000-0000-4000-8000-000000000004');
select pg_temp.check_scan(false,'unassigned non-teacher denied');
reset role;
-- A fee assignment never supplies a teacher assignment, even with a teacher grant.
insert into iam.role_permission_grants(id,school_id,role_id,permission_id,effect)
select '44000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000004',id,'allow'
from iam.permissions where code='pedagogy.grade.manage';
insert into iam.grant_scopes(school_id,grant_id,scope_code)
values('40000000-0000-4000-8000-000000000004','44000000-0000-4000-8000-000000000006','assigned_classes'),
('40000000-0000-4000-8000-000000000004','44000000-0000-4000-8000-000000000006','assigned_subjects');
set local role schoolsafe_api;
select api.set_request_context('41000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','4b000000-0000-4000-8000-000000000004');
do $$ begin
 if api.check_access('pedagogy.grade.manage',null,null,'47000000-0000-4000-8000-000000000004','48000000-0000-4000-8000-000000000004') then raise exception 'fee assignment weakened teacher scope'; end if;
end $$;
reset role;
-- Explicit individual DENY still wins over the fee role ALLOW.
insert into iam.profile_permission_exceptions(id,school_id,profile_id,permission_id,effect,reason,granted_by)
select '4e000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004',id,'deny','test denial','42000000-0000-4000-8000-000000000004'
from iam.permissions where code='finance.control.scan';
insert into iam.exception_scopes(school_id,exception_id,scope_code)
values('40000000-0000-4000-8000-000000000004','4e000000-0000-4000-8000-000000000004','assigned_fee_classes');
set local role schoolsafe_api;
select pg_temp.check_scan(false,'individual DENY overrides role');
reset role;
delete from iam.profile_permission_exceptions where id='4e000000-0000-4000-8000-000000000004';
update app.fee_control_campaigns set ends_at=now()-interval '1 hour';
set local role schoolsafe_api;
select api.set_request_context('41000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004','4b000000-0000-4000-8000-000000000004');
select pg_temp.check_scan(false,'expired campaign denied');
reset role;
rollback;
