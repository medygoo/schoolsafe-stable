-- Preuve A : rejeu AUTORITAIRE au niveau école (provision → corruption → re-provision).
\set ON_ERROR_STOP on
\set QUIET off
begin;
insert into app.schools (id, code, name) values
  ('a0000000-0000-4000-8000-00000000000a', 'AUTH-A', 'Ecole Autorite A');
insert into iam.users (id, auth_provider, external_subject, email) values
  ('a1000000-0000-4000-8000-00000000000a', 'test', 'auth-user-a', 'autha@example.invalid');
insert into iam.profiles (id, user_id, school_id, display_name) values
  ('a2000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-00000000000a', 'Admin Autorite');
insert into iam.roles (id, school_id, code, label) values
  ('a3000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'auth-admin', 'Admin Autorite');
insert into iam.profile_roles (school_id, profile_id, role_id, is_active) values
  ('a0000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-00000000000a', true);
insert into iam.role_permission_grants (id, school_id, role_id, permission_id, effect)
select 'a4000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a',
  'a3000000-0000-4000-8000-00000000000a', p.id, 'allow'
from iam.permissions p where p.code = 'roles.manage';
insert into iam.grant_scopes (id, school_id, grant_id, scope_code)
select 'a5000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a',
  'a4000000-0000-4000-8000-00000000000a', 'school';

select api.set_request_context(
  'a1000000-0000-4000-8000-00000000000a',
  'a2000000-0000-4000-8000-00000000000a',
  'a0000000-0000-4000-8000-00000000000a',
  'a6000000-0000-4000-8000-00000000000a'
);
\echo '--- PROVISION INITIAL ---'
select api.school_provision_roles('a0000000-0000-4000-8000-00000000000a');




-- Contaminate the old school with extra/inactive scope and condition rows.
insert into iam.grant_scopes(school_id,grant_id,scope_code,is_active)
select r.school_id,g.id,'school',false from iam.roles r join iam.role_permission_grants g on g.role_id=r.id
join iam.permissions p on p.id=g.permission_id where r.code='parent' and p.code='finance.status.read';
insert into iam.permission_conditions(school_id,grant_id,condition_code,condition_params,is_active)
select r.school_id,g.id,'device_managed','{"stale":true}',false from iam.roles r join iam.role_permission_grants g on g.role_id=r.id
join iam.permissions p on p.id=g.permission_id where r.code='parent' and p.code='finance.status.read';

update iam.role_permission_grants g set effect='deny',reason='stale reason',is_active=false,
 starts_at=now()+interval '1 day',ends_at=now()+interval '2 days'
from iam.roles r where g.role_id=r.id and r.code='parent';

-- Old school matrix -> changed reference matrix -> exact school contents.
update iam.role_template_grants set effect='deny', default_scope_code='own',
 condition_code='device_managed', condition_params='{"version":2}'
where template_id=(select id from iam.role_templates where code='cashier')
 and permission_id=(select id from iam.permissions where code='finance.payment.cancel');
delete from iam.role_template_grants where template_id=(select id from iam.role_templates where code='guard')
 and permission_id=(select id from iam.permissions where code='security.scan');
update iam.role_templates set is_active=false where code='staff';
set local role schoolsafe_api;
select api.school_provision_roles('a0000000-0000-4000-8000-00000000000a');
reset role;

create temp view actual_matrix as
select r.code,p.code as permission,g.effect,g.reason,g.is_active,
 coalesce((select jsonb_agg(jsonb_build_array(s.scope_code,s.target_id,s.is_active) order by s.scope_code)
 from iam.grant_scopes s where s.grant_id=g.id),'[]') scopes,
 coalesce((select jsonb_agg(jsonb_build_array(c.condition_code,c.condition_params,c.is_active) order by c.condition_code)
 from iam.permission_conditions c where c.grant_id=g.id),'[]') conditions
from iam.roles r join iam.role_templates t on t.code=r.code
join iam.role_permission_grants g on g.role_id=r.id join iam.permissions p on p.id=g.permission_id
where r.school_id='a0000000-0000-4000-8000-00000000000a';
create temp view expected_matrix as
select t.code,p.code as permission,tg.effect,'Provisionné depuis le modèle '||t.code as reason,true as is_active,
 case when tg.default_scope_code='assigned_classes' and p.code like 'pedagogy.%'
 then jsonb_build_array(jsonb_build_array('assigned_classes',null,true),jsonb_build_array('assigned_subjects',null,true))
 else jsonb_build_array(jsonb_build_array(tg.default_scope_code,null,true)) end as scopes,
 case when tg.condition_code is null then '[]'::jsonb
 else jsonb_build_array(jsonb_build_array(tg.condition_code,tg.condition_params,true)) end as conditions
from iam.role_templates t join iam.role_template_grants tg on tg.template_id=t.id
join iam.permissions p on p.id=tg.permission_id where t.is_active;
do $$ begin
 if exists((table actual_matrix except all table expected_matrix) union all
           (table expected_matrix except all table actual_matrix)) then
   raise exception 'school does not EXACTLY match new matrix (grants/scopes/conditions)';
 end if;
 if not exists(select 1 from audit.events where event_type='role.permission.revoked' and payload->>'operation'='DELETE'
 and actor_profile_id='a2000000-0000-4000-8000-00000000000a') then raise exception 'missing revocation audit'; end if;
 if exists(select 1 from iam.role_permission_grants g join iam.roles r on r.id=g.role_id
 where r.school_id='a0000000-0000-4000-8000-00000000000a' and (g.starts_at>now() or g.ends_at is not null)) then raise exception 'stale grant validity survived'; end if;
end $$;
-- Same matrix replay: same semantic result, no leftover child rows.
set local role schoolsafe_api;
select api.school_provision_roles('a0000000-0000-4000-8000-00000000000a');
reset role;
do $$ begin
 if exists((table actual_matrix except all table expected_matrix) union all
           (table expected_matrix except all table actual_matrix)) then raise exception 'replay not idempotent'; end if;
end $$;
rollback;
