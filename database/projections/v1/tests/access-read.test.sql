\set ON_ERROR_STOP on
-- Synthetic fixtures only. Session user must be schoolsafe_bootstrap in TEST.
begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ACCESS TEST: %', label; end if; end $$;
create function pg_temp.expect_denied() returns void language plpgsql as $$
begin
  begin perform api.access_profiles_list(); raise exception 'ACCESS TEST: profiles exposed'; exception when insufficient_privilege then null; end;
  begin perform api.access_roles_list(); raise exception 'ACCESS TEST: roles exposed'; exception when insufficient_privilege then null; end;
  begin perform api.access_profile_read('a2000000-0000-4000-8000-000000000002'); raise exception 'ACCESS TEST: detail exposed'; exception when insufficient_privilege then null; end;
end $$;

insert into app.schools(id,code,name) values
 ('a0000000-0000-4000-8000-000000000001','ACCESS-A2-A','Synthetic school A'),
 ('a0000000-0000-4000-8000-000000000002','ACCESS-A2-B','Synthetic school B');
insert into iam.users(id) values ('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002');
insert into iam.profiles(id,user_id,school_id,display_name,email,phone) values
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','A Admin','private@example.invalid','private-phone'),
 ('a2000000-0000-4000-8000-000000000002',null,'a0000000-0000-4000-8000-000000000001','B Person','private-other@example.invalid','private-phone-2'),
 ('a2000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','Secret other school','private@example.invalid','private-phone');
insert into iam.roles(id,school_id,code,label) values
 ('a3000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','admin','Administration'),
 ('a3000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','observer','Observation'),
 ('a3000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','secret','Other school role');
insert into iam.profile_roles(school_id,profile_id,role_id) values
 ('a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001'),
 ('a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002');
insert into iam.role_permission_grants(id,school_id,role_id,permission_id,effect)
 select 'a4000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',id,'allow' from iam.permissions where code='roles.manage';
insert into iam.role_permission_grants(id,school_id,role_id,permission_id,effect,starts_at,ends_at)
 select 'a4000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002',id,'allow',now()-interval '2 days',now()-interval '1 day' from iam.permissions where code='staff.read';
insert into iam.grant_scopes(school_id,grant_id,scope_code) values
 ('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','school'),
 ('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','school'),
 ('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','own');
insert into iam.permission_conditions(school_id,grant_id,condition_code)
 values ('a0000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','device_managed');
insert into iam.profile_permission_exceptions(id,school_id,profile_id,permission_id,effect,reason,granted_by)
 select 'a5000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002',id,'deny','Synthetic restriction','a2000000-0000-4000-8000-000000000001' from iam.permissions where code='staff.read';
insert into iam.exception_scopes(school_id,exception_id,scope_code)
 values ('a0000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','school');

set local role schoolsafe_api;
select pg_temp.expect_denied(); -- no context
select api.set_request_context('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((api.access_profiles_list()->>'total')::int=2,'school-scoped total');
select pg_temp.assert_true(jsonb_array_length(api.access_profiles_list('',1,1)->'rows')=1,'pagination');
select pg_temp.assert_true(api.access_profiles_list('',1,1)#>>'{rows,0,display_name}'='B Person','stable order');
select pg_temp.assert_true((api.access_profiles_list('secret')->>'total')::int=0,'search cannot reveal other school');
select pg_temp.assert_true((api.access_profiles_list('%')->>'total')::int=0,'search wildcard is literal');
select pg_temp.assert_true((api.access_roles_list()->>'total')::int=2,'roles tenant bound');
select pg_temp.assert_true(api.access_profile_read('a2000000-0000-4000-8000-000000000003') is null,'other school same as absent');
select pg_temp.assert_true(api.access_profile_read('a2000000-0000-4000-8000-000000000099') is null,'absent target');
select pg_temp.assert_true(jsonb_array_length(api.access_profile_read('a2000000-0000-4000-8000-000000000002')->'grants')=1,'grants');
select pg_temp.assert_true(jsonb_array_length(api.access_profile_read('a2000000-0000-4000-8000-000000000002')#>'{grants,0,scopes}')=2,'multiple scopes retained');
select pg_temp.assert_true(api.access_profile_read('a2000000-0000-4000-8000-000000000002')#>>'{grants,0,conditions,0,code}'='device_managed','condition retained');
select pg_temp.assert_true(api.access_profile_read('a2000000-0000-4000-8000-000000000002')#>>'{exceptions,0,effect}'='deny','individual deny retained');
select pg_temp.assert_true((api.access_profile_read('a2000000-0000-4000-8000-000000000002')#>>'{grants,0,ends_at}')::timestamptz < now(),'expired assignment not disguised as effective permission');
select pg_temp.assert_true(api.access_profile_read('a2000000-0000-4000-8000-000000000002')::text not like '%private%' and api.access_profiles_list()::text not like '%private%','no contact or authentication fields');
select pg_temp.assert_true(api.session_bootstrap()#>>'{profile,id}'='a2000000-0000-4000-8000-000000000001','reader identity unchanged');
do $$ begin
 begin perform api.access_profiles_list('',101,0); raise exception 'limit accepted'; exception when invalid_parameter_value then null; end;
 begin perform api.access_roles_list('',25,-1); raise exception 'offset accepted'; exception when invalid_parameter_value then null; end;
 begin perform 1 from iam.profiles; raise exception 'direct table access'; exception when insufficient_privilege then null; end;
end $$;

reset role;
update iam.grant_scopes set scope_code='own' where grant_id='a4000000-0000-4000-8000-000000000001';
set local role schoolsafe_api;
select pg_temp.expect_denied(); -- insufficient scope even for own profile
reset role;
update iam.grant_scopes set scope_code='school' where grant_id='a4000000-0000-4000-8000-000000000001';
update iam.profile_roles set starts_at=now()+interval '1 day' where profile_id='a2000000-0000-4000-8000-000000000001';
set local role schoolsafe_api;
select pg_temp.expect_denied(); -- future role
reset role;
update iam.profile_roles set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where profile_id='a2000000-0000-4000-8000-000000000001';
set local role schoolsafe_api;
select pg_temp.expect_denied(); -- expired role
reset role;
update iam.profile_roles set ends_at=null where profile_id='a2000000-0000-4000-8000-000000000001';
update iam.role_permission_grants set is_active=false where id='a4000000-0000-4000-8000-000000000001';
set local role schoolsafe_api;
select pg_temp.expect_denied(); -- revoked permission despite admin label
reset role;
update iam.role_permission_grants set is_active=true where id='a4000000-0000-4000-8000-000000000001';
insert into iam.profile_permission_exceptions(id,school_id,profile_id,permission_id,effect,reason,granted_by)
 select 'a5000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',id,'deny','Synthetic admin deny','a2000000-0000-4000-8000-000000000001' from iam.permissions where code='roles.manage';
insert into iam.exception_scopes(school_id,exception_id,scope_code) values
 ('a0000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','school');
set local role schoolsafe_api;
select pg_temp.expect_denied(); -- DENY wins
reset role;
update iam.profile_permission_exceptions set is_active=false where id='a5000000-0000-4000-8000-000000000001';
update iam.roles set is_active=false where id='a3000000-0000-4000-8000-000000000001';
set local role schoolsafe_api;
select pg_temp.expect_denied(); -- inactive role cannot retain access
reset role;
update iam.roles set is_active=true where id='a3000000-0000-4000-8000-000000000001';
update iam.profiles set account_status='suspended' where id='a2000000-0000-4000-8000-000000000001';
set local role schoolsafe_api;
select pg_temp.expect_denied(); -- suspended actor
reset role;
rollback;
