\set ON_ERROR_STOP on

begin;

-- Les paramètres réservés (shared_preload_libraries) ne sont lisibles que par
-- l'utilisateur de session directement doté de pg_read_all_settings ; ni
-- SET ROLE ni un grant sur le rôle cible ne suffisent (prouvé en DB-04C).
-- Ces trois gardes s'exécutent donc avant le changement de rôle.
do $schoolsafe$
begin
  if pg_catalog.current_setting('server_version_num')::integer <> 170011 then
    raise exception 'Verification requires PostgreSQL 17.11';
  end if;

  if not (
    'pg_stat_statements' = any(
      pg_catalog.regexp_split_to_array(
        pg_catalog.current_setting('shared_preload_libraries'),
        '\\s*,\\s*'
      )
    )
  ) then
    raise exception 'pg_stat_statements is not preloaded';
  end if;

  if pg_catalog.current_setting('compute_query_id') not in ('auto', 'on') then
    raise exception 'compute_query_id must be auto or on';
  end if;
end
$schoolsafe$;

set local role schoolsafe_owner;

do $schoolsafe$
declare
  v_missing text[];
  v_count integer;
begin

  if not exists (
    select 1
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_stat_statements'
      and n.nspname = 'ops'
  ) then
    raise exception 'pg_stat_statements extension is missing from ops';
  end if;

  select pg_catalog.array_agg(required_schema order by required_schema)
  into v_missing
  from pg_catalog.unnest(array['app', 'iam', 'audit', 'ops', 'api', 'legacy_cloud', 'auth']) required_schema
  where not exists (
    select 1 from pg_catalog.pg_namespace n where n.nspname = required_schema
  );
  if v_missing is not null then
    raise exception 'Missing schemas: %', v_missing;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_roles
  where rolname in (
    'schoolsafe_owner',
    'schoolsafe_migrator',
    'schoolsafe_api',
    'schoolsafe_worker',
    'schoolsafe_auditor'
  )
    and not rolsuper
    and not rolcreatedb
    and not rolcreaterole
    and not rolreplication
    and not rolbypassrls;
  if v_count <> 5 then
    raise exception 'SchoolSafe SQL role hardening mismatch';
  end if;

  select pg_catalog.count(*) into v_count from iam.permissions;
  if v_count <> 64 then
    raise exception 'Expected exactly 64 permissions, found %', v_count;
  end if;

  select pg_catalog.count(*) into v_count from iam.scopes;
  if v_count <> 7 then
    raise exception 'Expected exactly 7 scopes, found %', v_count;
  end if;

  if exists (
    select 1
    from iam.scopes s
    where s.code not in (
      'own',
      'own_children',
      'assigned_classes',
      'assigned_subjects',
      'assigned_portal',
      'school',
      'none'
    )
  ) then
    raise exception 'Non-canonical scope detected';
  end if;

  if pg_catalog.to_regclass('iam.scope_assignments') is not null
     or pg_catalog.to_regclass('iam.grant_scopes') is null
     or pg_catalog.to_regclass('iam.exception_scopes') is null then
    raise exception 'Permission-bound grant/exception scope schema mismatch';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute school_column
      on school_column.attrelid = c.oid
     and school_column.attname = 'school_id'
     and school_column.attnum > 0
     and not school_column.attisdropped
    join pg_catalog.pg_attribute id_column
      on id_column.attrelid = c.oid
     and id_column.attname = 'id'
     and id_column.attnum > 0
     and not id_column.attisdropped
    where n.nspname in ('app', 'iam', 'audit', 'ops')
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_catalog.pg_constraint candidate
        where candidate.conrelid = c.oid
          and candidate.contype in ('p', 'u')
          and candidate.conkey @> array[school_column.attnum, id_column.attnum]::smallint[]
      )
  ) then
    raise exception 'Tenant table is missing UNIQUE (school_id, id) candidate key';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_class child on child.oid = fk.conrelid
    join pg_catalog.pg_namespace child_namespace on child_namespace.oid = child.relnamespace
    join pg_catalog.pg_attribute child_school
      on child_school.attrelid = child.oid
     and child_school.attname = 'school_id'
     and child_school.attnum > 0
     and not child_school.attisdropped
    join pg_catalog.pg_class parent on parent.oid = fk.confrelid
    join pg_catalog.pg_namespace parent_namespace on parent_namespace.oid = parent.relnamespace
    join pg_catalog.pg_attribute parent_school
      on parent_school.attrelid = parent.oid
     and parent_school.attname = 'school_id'
     and parent_school.attnum > 0
     and not parent_school.attisdropped
    where fk.contype = 'f'
      and child_namespace.nspname in ('app', 'iam', 'audit', 'ops')
      and parent_namespace.nspname in ('app', 'iam', 'audit', 'ops')
      and (
        not child_school.attnum = any(fk.conkey)
        or not parent_school.attnum = any(fk.confkey)
      )
  ) then
    raise exception 'Simple cross-tenant foreign key detected';
  end if;

  if iam.current_user_id() is not null
     or iam.current_profile_id() is not null
     or iam.current_school_id() is not null
     or iam.current_request_id() is not null
     or iam.context_is_valid()
     or iam.can_access('school.manage') then
    raise exception 'Missing transaction context must deny by default';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'iam', 'audit', 'ops', 'api')
      and p.prokind = 'f'
      and pg_catalog.lower(
        case when p.prokind = 'f' then pg_catalog.pg_get_functiondef(p.oid) else '' end
      ) like ('%auth.' || 'uid(%')
  ) then
    raise exception 'Forbidden Supabase identity-function dependency detected';
  end if;

  select pg_catalog.array_agg(rpc_name order by rpc_name)
  into v_missing
  from pg_catalog.unnest(array[
    'deactivate_other_academic_years',
    'next_document_number',
    'ensure_receipt_number',
    'record_payment',
    'cancel_payment',
    'increment_card_print_count',
    'create_student_draft',
    'compensate_student_draft_creation'
  ]) rpc_name
  where not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = rpc_name and p.prosecdef
  );
  if v_missing is not null then
    raise exception 'Missing or non-definer P0 RPCs: %', v_missing;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.proname in (
        'deactivate_other_academic_years',
        'next_document_number',
        'ensure_receipt_number',
        'record_payment',
        'cancel_payment',
        'increment_card_print_count',
        'create_student_draft',
        'compensate_student_draft_creation'
      )
      and not coalesce(
        p.proconfig @> array['search_path=pg_catalog'],
        false
      )
  ) then
    raise exception 'A P0 RPC has an unsafe search_path';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where n.nspname in ('app', 'iam', 'audit', 'ops', 'api')
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC execute privilege detected on SchoolSafe function';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class table_class on table_class.oid = policy.polrelid
    join pg_catalog.pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
    where table_namespace.nspname in ('app', 'iam', 'audit', 'ops')
      and policy.polcmd = '*'
  ) then
    raise exception 'Unapproved business FOR ALL policy detected';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = any(array[
      'app.student_enrollment_events'::regclass,
      'app.security_events'::regclass,
      'app.fee_control_scans'::regclass,
      'audit.events'::regclass,
      'ops.indicator_snapshots'::regclass
    ]::oid[])
      and policy.polcmd in ('w', 'd')
  ) then
    raise exception 'Append-only business table has UPDATE or DELETE policy';
  end if;

  select pg_catalog.array_agg(signature order by signature)
  into v_missing
  from pg_catalog.unnest(array[
    'api.set_request_context(uuid,uuid,uuid,uuid)',
    'api.check_access(text,uuid,uuid,uuid,uuid,uuid,jsonb)',
    'api.deactivate_other_academic_years(uuid)',
    'api.next_document_number(text,text)',
    'api.ensure_receipt_number(uuid)',
    'api.record_payment(uuid,numeric,text,timestamptz,text,text,jsonb)',
    'api.cancel_payment(uuid,text,integer)',
    'api.increment_card_print_count(uuid)',
    'api.create_student_draft(text,text,text,text,date,text,uuid,uuid,date,text,uuid,text,text,text,text,text)',
    'api.compensate_student_draft_creation(uuid)'
  ]) signature
  where pg_catalog.to_regprocedure(signature) is null
     or not pg_catalog.has_function_privilege(
       'schoolsafe_api',
       pg_catalog.to_regprocedure(signature),
       'EXECUTE'
     );
  if v_missing is not null then
    raise exception 'Missing API execute allowlist entries: %', v_missing;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace procedure_namespace on procedure_namespace.oid = proc.pronamespace
    where procedure_namespace.nspname = 'api'
      and pg_catalog.has_function_privilege('schoolsafe_api', proc.oid, 'EXECUTE')
      and proc.oid <> all(array[
        pg_catalog.to_regprocedure('api.set_request_context(uuid,uuid,uuid,uuid)'),
        pg_catalog.to_regprocedure('api.check_access(text,uuid,uuid,uuid,uuid,uuid,jsonb)'),
        pg_catalog.to_regprocedure('api.deactivate_other_academic_years(uuid)'),
        pg_catalog.to_regprocedure('api.next_document_number(text,text)'),
        pg_catalog.to_regprocedure('api.ensure_receipt_number(uuid)'),
        pg_catalog.to_regprocedure('api.record_payment(uuid,numeric,text,timestamptz,text,text,jsonb)'),
        pg_catalog.to_regprocedure('api.cancel_payment(uuid,text,integer)'),
        pg_catalog.to_regprocedure('api.increment_card_print_count(uuid)'),
        pg_catalog.to_regprocedure('api.create_student_draft(text,text,text,text,date,text,uuid,uuid,date,text,uuid,text,text,text,text,text)'),
        pg_catalog.to_regprocedure('api.compensate_student_draft_creation(uuid)')
      ]::oid[])
  ) then
    raise exception 'Non-allowlisted API execute privilege detected';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'iam', 'audit', 'ops')
      and c.relkind in ('r', 'p')
      and (
        pg_catalog.has_table_privilege('schoolsafe_api', c.oid, 'select')
        or pg_catalog.has_table_privilege('schoolsafe_api', c.oid, 'insert')
        or pg_catalog.has_table_privilege('schoolsafe_api', c.oid, 'update')
        or pg_catalog.has_table_privilege('schoolsafe_api', c.oid, 'delete')
      )
  ) then
    raise exception 'schoolsafe_api must not have direct table privileges';
  end if;

  select pg_catalog.array_agg(required_table order by required_table)
  into v_missing
  from pg_catalog.unnest(array[
    'app.cash_registers',
    'app.security_portals',
    'iam.permission_conditions',
    'ops.document_number_sequences'
  ]) required_table
  where not exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid = pg_catalog.to_regclass(required_table)
      and c.relrowsecurity
      and c.relforcerowsecurity
  );
  if v_missing is not null then
    raise exception 'Required forced-RLS tables missing or unprotected: %', v_missing;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = c.oid
     and a.attname = 'school_id'
     and a.attnum > 0
     and not a.attisdropped
    where n.nspname in ('app', 'iam', 'audit', 'ops')
      and c.relkind in ('r', 'p')
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'Tenant-aware table without forced RLS detected';
  end if;

  select pg_catalog.count(*) into v_count
  from ops.schema_versions v
  where v.baseline_version = 'schoolsafe-vps-v1';
  if v_count not between 12 and 13 then
    raise exception 'Expected 12 or 13 recorded baseline units at verification time, found %', v_count;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relkind in ('r', 'p', 'v', 'm', 'S')
  ) then
    raise exception 'Auth migration must remain separate from the business baseline';
  end if;
end
$schoolsafe$;

select jsonb_build_object(
  'baseline_version', 'schoolsafe-vps-v1',
  'postgresql', pg_catalog.current_setting('server_version'),
  'pg_stat_statements', 'preloaded-and-installed',
  'permissions', (select pg_catalog.count(*) from iam.permissions),
  'scopes', (select pg_catalog.count(*) from iam.scopes),
  'p0_rpc', 8,
  'forced_rls_tables', (
    select pg_catalog.count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'iam', 'audit', 'ops')
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relforcerowsecurity
  ),
  'status', 'PASS'
) as schoolsafe_baseline_verification;

commit;
