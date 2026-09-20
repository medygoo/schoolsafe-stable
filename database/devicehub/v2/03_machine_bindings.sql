\set ON_ERROR_STOP on
begin;
set local role schoolsafe_owner;
-- Composite tenant keys make cross-school associations impossible even for a bad writer.
alter table devicehub.devices add constraint devices_tenant_key unique(school_id,id);
alter table devicehub.device_subject_mappings add constraint mappings_tenant_key unique(school_id,id);
alter table devicehub.device_events add constraint events_tenant_key unique(school_id,id);
alter table devicehub.device_subject_mappings add constraint mapping_device_tenant foreign key(school_id,device_id) references devicehub.devices(school_id,id);
alter table devicehub.device_sync_jobs add constraint job_mapping_tenant foreign key(school_id,mapping_id) references devicehub.device_subject_mappings(school_id,id);
alter table devicehub.device_events add constraint event_device_tenant foreign key(school_id,device_id) references devicehub.devices(school_id,id);
alter table devicehub.event_processing add constraint processing_event_tenant foreign key(school_id,event_id) references devicehub.device_events(school_id,id);
alter table devicehub.event_processing add constraint processing_mapping_tenant foreign key(school_id,mapping_id) references devicehub.device_subject_mappings(school_id,id);
alter table devicehub.event_processing add constraint processing_student_tenant foreign key(school_id,student_id) references app.students(school_id,id);
create unique index mappings_active_external_unique on devicehub.device_subject_mappings(device_id,external_person_id) where sync_status<>'disabled';
-- Only an offline migrator may bind a device to an existing, scoped service principal.
-- Runtime never chooses a school or fabricates a profile. Revoking the principal revokes its binding.
create table devicehub.machine_bindings(
 instance_id text not null check(length(instance_id) between 1 and 255),
 device_id uuid primary key,school_id uuid not null,user_id uuid not null,profile_id uuid not null,
 enabled boolean not null default true,
 foreign key(school_id,device_id) references devicehub.devices(school_id,id),
 foreign key(school_id,profile_id) references iam.profiles(school_id,id),
 foreign key(user_id) references iam.users(id));
alter table devicehub.machine_bindings enable row level security;
alter table devicehub.machine_bindings force row level security;
create policy binding_owner on devicehub.machine_bindings to schoolsafe_owner using(true) with check(true);
revoke all on devicehub.machine_bindings from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker;
create function ops.bind_machine_device(p_instance text,p_device uuid,p_school uuid,p_user uuid,p_profile uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $schoolsafe$
begin
 if session_user<>'schoolsafe_migrator' then raise insufficient_privilege; end if;
 perform api.set_request_context(p_user,p_profile,p_school,gen_random_uuid());
 perform iam.require_access('security.scan');
 if not exists(select 1 from devicehub.devices where school_id=p_school and id=p_device and status not in ('disabled','revoked')) then raise foreign_key_violation; end if;
 insert into devicehub.machine_bindings(instance_id,device_id,school_id,user_id,profile_id) values(p_instance,p_device,p_school,p_user,p_profile);
end $schoolsafe$;
revoke all on function ops.bind_machine_device(text,uuid,uuid,uuid,uuid) from public;
grant execute on function ops.bind_machine_device(text,uuid,uuid,uuid,uuid) to schoolsafe_migrator;
create function api.machine_device_context(p_instance text,p_device uuid,p_request text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $schoolsafe$
declare b devicehub.machine_bindings%rowtype;
begin
 if session_user<>'schoolsafe_api' then raise insufficient_privilege; end if;
 select * into b from devicehub.machine_bindings where instance_id=p_instance and device_id=p_device and enabled;
 if not found then raise insufficient_privilege using message='Device binding unavailable'; end if;
 perform api.set_request_context(b.user_id,b.profile_id,b.school_id,p_request::uuid);
 perform iam.require_access('security.scan');
 if not exists(select 1 from devicehub.devices where school_id=b.school_id and id=p_device and status not in ('disabled','revoked')) then raise insufficient_privilege; end if;
 return jsonb_build_object('userId',b.user_id,'profileId',b.profile_id,'schoolId',b.school_id,'requestId',p_request);
end $schoolsafe$;
revoke all on function api.machine_device_context(text,uuid,text) from public;
grant execute on function api.machine_device_context(text,uuid,text) to schoolsafe_api;
commit;
