\set ON_ERROR_STOP on
begin;
-- Synthetic identities only. Reused by the real browser/concurrency proof.
insert into app.schools(id,code,name) values
 ('b0000000-0000-4000-8000-000000000001','ACCESS-A3-A','Access assignment test A'),
 ('b0000000-0000-4000-8000-000000000002','ACCESS-A3-B','Access assignment test B');
insert into iam.users(id) values
 ('b1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002'),('b1000000-0000-4000-8000-000000000003');
insert into iam.profiles(id,user_id,school_id,display_name) values
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Admin test A3'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','Second profil A3'),
 ('b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001','Gestionnaire limité A3'),
 ('b2000000-0000-4000-8000-000000000004',null,'b0000000-0000-4000-8000-000000000002','Profil étranger A3');
insert into iam.roles(id,school_id,code,label) values
 ('b3000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','admin','Administration complète'),
 ('b3000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','reader','Lecture du personnel'),
 ('b3000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001','limited','Gestion limitée'),
 ('b3000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000001','control','Réservé Control'),
 ('b3000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000001','deny','Restriction personnel'),
 ('b3000000-0000-4000-8000-000000000006','b0000000-0000-4000-8000-000000000002','foreign','Rôle étranger');
insert into iam.role_permission_grants(school_id,role_id,permission_id,effect)
 select 'b0000000-0000-4000-8000-000000000001',r.id,p.id,case when r.code='deny' then 'deny' else 'allow' end
 from iam.roles r cross join iam.permissions p where
 (r.code='admin' and p.code<>'cards.print.manage') or
 (r.code in ('reader','deny') and p.code='staff.read') or
 (r.code='limited' and p.code='roles.manage') or
 (r.code='control' and p.code='cards.print.manage');
insert into iam.grant_scopes(school_id,grant_id,scope_code)
 select g.school_id,g.id,case when p.default_scope_code in ('own','none') then p.default_scope_code else 'school' end
 from iam.role_permission_grants g join iam.permissions p on p.id=g.permission_id where g.school_id='b0000000-0000-4000-8000-000000000001';
insert into iam.profile_roles(school_id,profile_id,role_id) values
 ('b0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001');
-- END FIXTURES

create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'A3: %',label; end if; end $$;
create function pg_temp.change(p_action text,p_profile uuid,p_role uuid,p_error text default null,p_revision bigint default null)
returns jsonb language plpgsql as $$
declare result jsonb;
begin
  begin
    result := api.access_role_assign(p_profile,p_role,p_action,
      coalesce(p_revision,(api.access_profile_read('b2000000-0000-4000-8000-000000000001')->>'revision')::bigint),
      'Synthetic test reason',true);
  exception when others then
    if p_error is null or sqlstate<>p_error then raise; end if;
    return null;
  end;
  if p_error is not null then raise exception 'A3: expected refusal %',p_error; end if;
  return result;
end $$;
set local role schoolsafe_api;
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','42501'); -- missing context
select api.set_request_context('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000002','P0002');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000006','P0002');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000004','42501');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','40001',999999);
select pg_temp.change('revoke','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','P0001'); -- last admin
savepoint backup_admin_checks;
reset role;
insert into iam.profile_roles(school_id,profile_id,role_id,starts_at) values
 ('b0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001',now()+interval '1 day');
set local role schoolsafe_api;
select pg_temp.change('revoke','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','P0001'); -- future backup
reset role;
update iam.profile_roles set starts_at=now()-interval '1 day',ends_at=now()+interval '1 day' where profile_id='b2000000-0000-4000-8000-000000000002';
set local role schoolsafe_api;
select pg_temp.change('revoke','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','P0001'); -- temporary backup
reset role;
update iam.profile_roles set ends_at=null where profile_id='b2000000-0000-4000-8000-000000000002';
update iam.profiles set account_status='suspended' where id='b2000000-0000-4000-8000-000000000002';
set local role schoolsafe_api;
select pg_temp.change('revoke','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','P0001'); -- suspended backup
reset role;
update iam.profiles set account_status='active' where id='b2000000-0000-4000-8000-000000000002';
update iam.users set is_active=false where id='b1000000-0000-4000-8000-000000000002';
set local role schoolsafe_api;
select pg_temp.change('revoke','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','P0001'); -- inactive login
rollback to backup_admin_checks;
select pg_temp.ok((api.access_role_read('b3000000-0000-4000-8000-000000000001')#>>'{role,delegatable}')::boolean,'full admin may delegate all school rights');
select pg_temp.ok(api.access_role_read('b3000000-0000-4000-8000-000000000006') is null,'foreign role detail absent');
select pg_temp.ok((pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002')->>'changed')::boolean,'assign succeeds');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','40001',0); -- repeated old submission
select pg_temp.ok((api.access_profile_read('b2000000-0000-4000-8000-000000000002')#>>'{roles,0,assignment,is_active}')::boolean,'read confirms assignment');
select pg_temp.change('revoke','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002');
select pg_temp.ok(not (api.access_profile_read('b2000000-0000-4000-8000-000000000002')#>>'{roles,0,assignment,is_active}')::boolean,'revoke retains inactive record');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000003');
-- A limited manager must not promote themselves, assign unowned rights, remove
-- a DENY to grant access, or reset the canonical templates through provisioning.
select api.set_request_context('b1000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000002');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001','42501');
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','42501');
select pg_temp.change('revoke','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000005','42501');
do $$ begin
  begin perform api.school_provision_roles('b0000000-0000-4000-8000-000000000001'); raise exception 'provision bypass'; exception when insufficient_privilege then null; end;
  begin update iam.profile_roles set is_active=true; raise exception 'direct mutation'; exception when insufficient_privilege then null; end;
end $$;
select api.set_request_context('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000003');
reset role;
update iam.roles set is_active=false where code='reader';
set local role schoolsafe_api;
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','42501');
reset role;
update iam.roles set is_active=true where code='reader';
update iam.profile_roles set ends_at=now()+interval '1 day' where profile_id='b2000000-0000-4000-8000-000000000001';
set local role schoolsafe_api;
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','42501'); -- temporary authority cannot delegate permanent
reset role;
update iam.profile_roles set ends_at=null where profile_id='b2000000-0000-4000-8000-000000000001';
insert into iam.profile_roles(school_id,profile_id,role_id) values
 ('b0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000005');
set local role schoolsafe_api;
select pg_temp.change('assign','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','42501'); -- DENY even with admin label
reset role;
update iam.profile_roles set is_active=false where role_id='b3000000-0000-4000-8000-000000000005';
select pg_temp.ok(exists(select 1 from audit.events where event_type='access.role.revoke'
  and entity_id='b2000000-0000-4000-8000-000000000002' and actor_profile_id='b2000000-0000-4000-8000-000000000001'
  and school_id='b0000000-0000-4000-8000-000000000001' and payload->>'reason'='Synthetic test reason'
  and (payload#>>'{before,is_active}')::boolean and not (payload#>>'{after,is_active}')::boolean),'atomic attributed audit with before/after');
-- Simulate audit storage failure: mutation must not survive its transaction.
create function pg_temp.reject_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit unavailable' using errcode='XX000'; end $$;
create trigger a3_test_audit_failure before insert on audit.events for each row execute function pg_temp.reject_audit();
set local role schoolsafe_api;
select pg_temp.change('revoke','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','XX000');
select pg_temp.ok((api.access_profile_read('b2000000-0000-4000-8000-000000000002')#>>'{roles,0,assignment,is_active}')::boolean,'audit failure rolls assignment back');
reset role;
drop trigger a3_test_audit_failure on audit.events;
rollback;
