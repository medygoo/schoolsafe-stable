\set ON_ERROR_STOP on
begin;
-- The runtime cannot reach the offline entry point even with forged context.
set local role schoolsafe_api;
do $$ begin
 begin
  perform ops.bootstrap_school('DENIED','Denied','denied@example.invalid','Denied',gen_random_uuid());
  raise exception 'runtime bootstrap unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role schoolsafe_worker;
do $$ begin
 begin
  perform ops.bootstrap_school('DENIED','Denied','denied@example.invalid','Denied',gen_random_uuid());
  raise exception 'worker bootstrap unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Exercise a real non-superuser migration SESSION, not merely SET ROLE.
set session authorization schoolsafe_migrator;
select ops.bootstrap_school('NEW-SCHOOL','New school','admin@example.invalid','First admin','bb000000-0000-4000-8000-000000000001') as boot \gset
reset session authorization;
select set_config('proof.boot', :'boot', true);
do $$ declare b jsonb:=current_setting('proof.boot')::jsonb; begin
 if not exists(select 1 from app.schools where id=(b->>'school_id')::uuid and is_active and setup_completed_at is not null) then raise exception 'school not activated'; end if;
 if not exists(select 1 from audit.events where school_id=(b->>'school_id')::uuid and event_type='school.bootstrap.completed' and actor_profile_id=(b->>'admin_profile_id')::uuid and payload->>'operator'='schoolsafe_migrator') then raise exception 'missing bootstrap audit'; end if;
 if nullif(current_setting('schoolsafe.school_id',true),'') is not null then raise exception 'bootstrap leaked context'; end if;
end $$;
set local role schoolsafe_api;
select api.set_request_context((:'boot'::jsonb->>'user_id')::uuid,(:'boot'::jsonb->>'admin_profile_id')::uuid,(:'boot'::jsonb->>'school_id')::uuid,'bb000000-0000-4000-8000-000000000002');
-- access/v1/04 intentionally closes runtime reprovisioning. Preserve that later rule.
do $$ begin
 begin perform api.school_provision_roles(iam.current_school_id()); raise exception 'runtime reprovision unexpectedly allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set session authorization schoolsafe_migrator;
do $$ begin
 begin
  perform ops.bootstrap_school('NEW-SCHOOL','Duplicate','second@example.invalid','Second',gen_random_uuid());
  raise exception 'school bootstrap replay unexpectedly allowed';
 exception when unique_violation then null; end;
 begin
  perform ops.bootstrap_school('FAIL-NEW','Failure','bad-email','Admin',gen_random_uuid());
  raise exception 'invalid identity allowed';
 exception when check_violation then null; end;
end $$;
reset session authorization;
do $$ begin
 if exists(select 1 from app.schools where code='FAIL-NEW') then raise exception 'failed bootstrap left school'; end if;
end $$;

-- Force a late failure after identity/provisioning: the whole school must roll back.
update iam.role_templates set is_active=false where code='admin';
set session authorization schoolsafe_migrator;
do $$ begin
 begin
  perform ops.bootstrap_school('FAIL-LATE','Failure','late@example.invalid','Late',gen_random_uuid());
  raise exception 'bootstrap without admin unexpectedly allowed';
 exception when check_violation then null; end;
end $$;
reset session authorization;
do $$ begin
 if exists(select 1 from app.schools where code='FAIL-LATE') or exists(select 1 from iam.users where email='late@example.invalid') then raise exception 'late failure left partial state'; end if;
end $$;
rollback;
