\set ON_ERROR_STOP on
-- Additive runtime credentials and RLS for the post-baseline business tables.
begin;
do $schoolsafe$
declare v_name text; v_password text;
begin
  foreach v_name in array array['api','auth','worker','migrator'] loop
    v_password:=current_setting('schoolsafe.install_'||v_name||'_password',true);
    if v_password is null or length(v_password)<32 then
      raise check_violation using message='Explicit strong runtime credentials required';
    end if;
    execute format('alter role %I password %L','schoolsafe_'||v_name,v_password);
  end loop;
end
$schoolsafe$;
set local role schoolsafe_owner;
create or replace function iam.install_owner_policies(
  p_table regclass,
  p_read_predicate text,
  p_write_predicate text,
  p_allow_update boolean,
  p_allow_delete boolean
)
returns void
language plpgsql
as $schoolsafe$
declare
  v_stem text := pg_catalog.replace(p_table::text, '.', '_');
begin
  execute pg_catalog.format('alter table %s enable row level security', p_table);
  execute pg_catalog.format('alter table %s force row level security', p_table);

  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_tenant', p_table);
  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_select', p_table);
  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_insert', p_table);
  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_update', p_table);
  execute pg_catalog.format('drop policy if exists %I on %s', v_stem || '_owner_delete', p_table);

  execute pg_catalog.format(
    'create policy %I on %s for select to schoolsafe_owner using (%s)',
    v_stem || '_owner_select', p_table, p_read_predicate
  );
  execute pg_catalog.format(
    'create policy %I on %s for insert to schoolsafe_owner with check (%s)',
    v_stem || '_owner_insert', p_table, p_write_predicate
  );
  if p_allow_update then
    execute pg_catalog.format(
      'create policy %I on %s for update to schoolsafe_owner using (%s) with check (%s)',
      v_stem || '_owner_update', p_table, p_write_predicate, p_write_predicate
    );
  end if;
  if p_allow_delete then
    execute pg_catalog.format(
      'create policy %I on %s for delete to schoolsafe_owner using (%s)',
      v_stem || '_owner_delete', p_table, p_write_predicate
    );
  end if;
end
$schoolsafe$;

do $schoolsafe$
declare v_table regclass; v_name text;
begin
  foreach v_table in array array[
    'app.pickup_authorizations'::regclass,'app.import_jobs'::regclass,
    'app.import_rows'::regclass,'app.attendance_records'::regclass,
    'devicehub.devices'::regclass,'devicehub.bridges'::regclass,
    'devicehub.device_subject_mappings'::regclass,'devicehub.device_sync_jobs'::regclass,
    'devicehub.device_events'::regclass,'devicehub.event_processing'::regclass
  ] loop
    perform iam.install_owner_policies(v_table,
      'school_id=iam.current_school_id() and iam.context_is_valid()',
      'school_id=iam.current_school_id() and iam.context_is_valid()',
      v_table <> 'devicehub.device_events'::regclass,v_table <> 'devicehub.device_events'::regclass);
  end loop;
  foreach v_table in array array[
    'devicehub.device_capabilities'::regclass,'devicehub.device_auth_config'::regclass,'devicehub.device_cursors'::regclass
  ] loop
    perform iam.install_owner_policies(v_table,
      'iam.context_is_valid() and exists(select 1 from devicehub.devices d where d.id=device_id and d.school_id=iam.current_school_id())',
      'iam.context_is_valid() and exists(select 1 from devicehub.devices d where d.id=device_id and d.school_id=iam.current_school_id())',true,true);
  end loop;
end
$schoolsafe$;
alter table iam.users enable row level security;
alter table iam.users force row level security;
drop policy if exists users_owner on iam.users;
create policy users_owner on iam.users to schoolsafe_owner using(true) with check(true);
revoke all on all tables in schema app,iam,auth,devicehub from schoolsafe_api,schoolsafe_auth;
revoke all on all sequences in schema app,iam,auth,devicehub from schoolsafe_api,schoolsafe_auth;
grant execute on function api.attendance_apply(date) to schoolsafe_api;
drop function iam.install_owner_policies(regclass,text,text,boolean,boolean);
commit;
