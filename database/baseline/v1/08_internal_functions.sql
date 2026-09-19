\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

create or replace function iam.read_context_uuid(p_setting_name text)
returns uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $schoolsafe$
declare
  v_value text;
begin
  v_value := pg_catalog.current_setting(p_setting_name, true);
  if v_value is null or pg_catalog.btrim(v_value) = '' then
    return null;
  end if;
  return v_value::uuid;
exception
  when invalid_text_representation then
    return null;
end
$schoolsafe$;

create or replace function iam.current_user_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $schoolsafe$
  select iam.read_context_uuid('schoolsafe.user_id')
$schoolsafe$;

create or replace function iam.current_profile_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $schoolsafe$
  select iam.read_context_uuid('schoolsafe.profile_id')
$schoolsafe$;

create or replace function iam.current_school_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $schoolsafe$
  select iam.read_context_uuid('schoolsafe.school_id')
$schoolsafe$;

create or replace function iam.current_request_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $schoolsafe$
  select iam.read_context_uuid('schoolsafe.request_id')
$schoolsafe$;

create or replace function iam.context_is_valid()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select
    iam.current_user_id() is not null
    and iam.current_profile_id() is not null
    and iam.current_school_id() is not null
    and iam.current_request_id() is not null
    and exists (
      select 1
      from iam.profiles p
      join iam.users u on u.id = p.user_id
      where p.id = iam.current_profile_id()
        and p.school_id = iam.current_school_id()
        and p.is_active = true
        and p.account_status = 'active'
        and u.id = iam.current_user_id()
        and u.is_active = true
    )
$schoolsafe$;

create or replace function api.set_request_context(
  p_user_id uuid,
  p_profile_id uuid,
  p_school_id uuid,
  p_request_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  if p_user_id is null or p_profile_id is null or p_school_id is null or p_request_id is null then
    raise insufficient_privilege using message = 'Complete SchoolSafe request context is required';
  end if;

  perform pg_catalog.set_config('schoolsafe.user_id', p_user_id::text, true);
  perform pg_catalog.set_config('schoolsafe.profile_id', p_profile_id::text, true);
  perform pg_catalog.set_config('schoolsafe.school_id', p_school_id::text, true);
  perform pg_catalog.set_config('schoolsafe.request_id', p_request_id::text, true);

  if not iam.context_is_valid() then
    raise insufficient_privilege using message = 'SchoolSafe request context does not match an active identity';
  end if;
end
$schoolsafe$;

create or replace function iam.has_exact_teacher_assignment(
  p_profile_id uuid,
  p_class_id uuid,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select
    p_profile_id is not null
    and p_class_id is not null
    and p_subject_id is not null
    and exists (
      select 1
      from app.teacher_assignments ta
      where ta.school_id = iam.current_school_id()
        and ta.teacher_profile_id = p_profile_id
        and ta.class_id = p_class_id
        and ta.subject_id = p_subject_id
        and ta.is_active = true
        and ta.starts_on <= current_date
        and (ta.ends_on is null or ta.ends_on >= current_date)
    )
$schoolsafe$;

create or replace function iam.is_guardian_of(p_profile_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select exists (
    select 1
    from app.student_guardians sg
    join app.students s on s.id = sg.student_id and s.school_id = sg.school_id
    where sg.school_id = iam.current_school_id()
      and sg.profile_id = p_profile_id
      and sg.student_id = p_student_id
      and sg.is_active = true
      and s.lifecycle_status = 'active'
  )
$schoolsafe$;

create or replace function iam.condition_matches(
  p_condition_code text,
  p_stored_params jsonb default '{}'::jsonb,
  p_runtime_params jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_params jsonb := coalesce(p_stored_params, '{}'::jsonb) || coalesce(p_runtime_params, '{}'::jsonb);
  v_entity_id uuid;
  v_date date;
  v_max_age_hours integer;
begin
  if not iam.context_is_valid() then
    return false;
  end if;

  case p_condition_code
    when 'academic_year_active' then
      return exists (
        select 1 from app.academic_years y
        where y.school_id = iam.current_school_id() and y.is_active = true
      );

    when 'cash_register_open' then
      v_date := coalesce(nullif(v_params ->> 'date', '')::date, current_date);
      return exists (
        select 1 from app.cash_registers c
        where c.school_id = iam.current_school_id()
          and c.register_date = v_date
          and c.status = 'open'
      );

    when 'campaign_published' then
      v_entity_id := nullif(v_params ->> 'campaign_id', '')::uuid;
      return v_entity_id is not null and exists (
        select 1 from app.fee_control_campaigns c
        where c.school_id = iam.current_school_id()
          and c.id = v_entity_id
          and c.status = 'published'
          and (c.starts_at is null or c.starts_at <= pg_catalog.now())
          and (c.ends_at is null or c.ends_at >= pg_catalog.now())
      );

    when 'within_cancellation_window' then
      v_entity_id := nullif(v_params ->> 'payment_id', '')::uuid;
      v_max_age_hours := coalesce(nullif(v_params ->> 'max_age_hours', '')::integer, 24);
      return v_entity_id is not null and v_max_age_hours between 1 and 168 and exists (
        select 1 from app.fee_payments p
        where p.school_id = iam.current_school_id()
          and p.id = v_entity_id
          and p.status = 'valid'
          and p.received_at >= pg_catalog.now() - pg_catalog.make_interval(hours => v_max_age_hours)
      );

    when 'device_managed' then
      return exists (
        select 1 from iam.devices d
        where d.school_id = iam.current_school_id()
          and d.profile_id = iam.current_profile_id()
          and d.is_school_managed = true
          and d.revoked_at is null
      );

    when 'status_pending' then
      v_entity_id := nullif(v_params ->> 'request_id', '')::uuid;
      return v_entity_id is not null and exists (
        select 1 from app.approval_requests r
        where r.school_id = iam.current_school_id()
          and r.id = v_entity_id
          and r.status = 'pending'
      );

    when 'portal_open' then
      v_entity_id := nullif(v_params ->> 'portal_id', '')::uuid;
      return v_entity_id is not null and exists (
        select 1 from app.security_portals p
        where p.school_id = iam.current_school_id()
          and p.id = v_entity_id
          and p.is_active = true
          and p.is_open = true
      );

    when 'quota_available' then
      return false;

    else
      return false;
  end case;
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    return false;
end
$schoolsafe$;

drop function if exists iam.scope_matches(text,uuid,uuid,uuid,uuid,uuid,uuid);
create or replace function iam.scope_matches(
  p_scope_code text,
  p_scope_target_id uuid default null,
  p_target_profile_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_subject_id uuid default null,
  p_portal_id uuid default null,
  p_runtime_context jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  if not iam.context_is_valid() then
    return false;
  end if;

  case p_scope_code
    when 'none' then
      return true;
    when 'school' then
      return true;
    when 'own' then
      return p_target_profile_id is not null and p_target_profile_id = iam.current_profile_id();
    when 'own_children' then
      return iam.is_guardian_of(iam.current_profile_id(), p_student_id);
    when 'assigned_portal' then
      return p_portal_id is not null
        and p_scope_target_id = p_portal_id
        and exists (
          select 1
          from app.security_portals portal
          where portal.school_id = iam.current_school_id()
            and portal.id = p_portal_id
            and portal.is_active = true
        );
    when 'assigned_fee_classes' then
      return p_class_id is not null
        and nullif(p_runtime_context->>'campaign_id','') is not null
        and (p_scope_target_id is null or p_scope_target_id=p_class_id)
        and exists (
          select 1 from app.fee_control_assignees a
          join app.fee_control_campaigns c on c.id=a.campaign_id and c.school_id=a.school_id
          join app.classes cl on cl.id=p_class_id and cl.school_id=a.school_id
          where a.school_id=iam.current_school_id() and a.profile_id=iam.current_profile_id()
            and c.id::text=p_runtime_context->>'campaign_id'
            and c.status='published' and jsonb_typeof(c.classes)='array'
            and c.classes ? p_class_id::text
            and (p_student_id is null or exists (select 1 from app.students st
              where st.id=p_student_id and st.school_id=a.school_id and st.class_id=p_class_id))
            and (c.starts_at is null or c.starts_at<=pg_catalog.now())
            and (c.ends_at is null or c.ends_at>=pg_catalog.now())
        );
    when 'assigned_classes' then
      if p_class_id is null then
        return false;
      end if;
      if p_scope_target_id is not null and p_scope_target_id <> p_class_id then
        return false;
      end if;
      if p_subject_id is not null then
        return iam.has_exact_teacher_assignment(iam.current_profile_id(), p_class_id, p_subject_id);
      end if;
      return exists (
        select 1 from app.teacher_assignments ta
        where ta.school_id = iam.current_school_id()
          and ta.teacher_profile_id = iam.current_profile_id()
          and ta.class_id = p_class_id
          and ta.is_active = true
          and ta.starts_on <= current_date
          and (ta.ends_on is null or ta.ends_on >= current_date)
      );
    when 'assigned_subjects' then
      if p_subject_id is null then
        return false;
      end if;
      if p_scope_target_id is not null and p_scope_target_id <> p_subject_id then
        return false;
      end if;
      if p_class_id is not null then
        return iam.has_exact_teacher_assignment(iam.current_profile_id(), p_class_id, p_subject_id);
      end if;
      return exists (
        select 1 from app.teacher_assignments ta
        where ta.school_id = iam.current_school_id()
          and ta.teacher_profile_id = iam.current_profile_id()
          and ta.subject_id = p_subject_id
          and ta.is_active = true
          and ta.starts_on <= current_date
          and (ta.ends_on is null or ta.ends_on >= current_date)
      );
    else
      return false;
  end case;
end
$schoolsafe$;

drop function if exists iam.grant_scopes_match(uuid,uuid,uuid,uuid,uuid,uuid);
create or replace function iam.grant_scopes_match(
  p_grant_id uuid,
  p_target_profile_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_subject_id uuid default null,
  p_portal_id uuid default null,
  p_runtime_context jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_has_teacher_scope boolean;
begin
  if not iam.context_is_valid() then
    return false;
  end if;

  select exists (
    select 1
    from iam.grant_scopes gs
    where gs.school_id = iam.current_school_id()
      and gs.grant_id = p_grant_id
      and gs.scope_code in ('assigned_classes', 'assigned_subjects')
      and gs.is_active = true
      and gs.starts_at <= pg_catalog.now()
      and (gs.ends_at is null or gs.ends_at >= pg_catalog.now())
  ) into v_has_teacher_scope;

  if v_has_teacher_scope then
    return p_class_id is not null
      and p_subject_id is not null
      and exists (
        select 1
        from iam.grant_scopes gs
        where gs.school_id = iam.current_school_id()
          and gs.grant_id = p_grant_id
          and gs.scope_code = 'assigned_classes'
          and gs.is_active = true
          and gs.starts_at <= pg_catalog.now()
          and (gs.ends_at is null or gs.ends_at >= pg_catalog.now())
          and iam.scope_matches(
            gs.scope_code,
            gs.target_id,
            p_target_profile_id,
            p_student_id,
            p_class_id,
            p_subject_id,
            p_portal_id,
            p_runtime_context
          )
      )
      and exists (
        select 1
        from iam.grant_scopes gs
        where gs.school_id = iam.current_school_id()
          and gs.grant_id = p_grant_id
          and gs.scope_code = 'assigned_subjects'
          and gs.is_active = true
          and gs.starts_at <= pg_catalog.now()
          and (gs.ends_at is null or gs.ends_at >= pg_catalog.now())
          and iam.scope_matches(
            gs.scope_code,
            gs.target_id,
            p_target_profile_id,
            p_student_id,
            p_class_id,
            p_subject_id,
            p_portal_id,
            p_runtime_context
          )
      );
  end if;

  return exists (
    select 1
    from iam.grant_scopes gs
    where gs.school_id = iam.current_school_id()
      and gs.grant_id = p_grant_id
      and gs.is_active = true
      and gs.starts_at <= pg_catalog.now()
      and (gs.ends_at is null or gs.ends_at >= pg_catalog.now())
      and iam.scope_matches(
        gs.scope_code,
        gs.target_id,
        p_target_profile_id,
        p_student_id,
        p_class_id,
        p_subject_id,
        p_portal_id,
        p_runtime_context
      )
  );
end
$schoolsafe$;

drop function if exists iam.exception_scopes_match(uuid,uuid,uuid,uuid,uuid,uuid);
create or replace function iam.exception_scopes_match(
  p_exception_id uuid,
  p_target_profile_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_subject_id uuid default null,
  p_portal_id uuid default null,
  p_runtime_context jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_has_teacher_scope boolean;
begin
  if not iam.context_is_valid() then
    return false;
  end if;

  select exists (
    select 1
    from iam.exception_scopes es
    where es.school_id = iam.current_school_id()
      and es.exception_id = p_exception_id
      and es.scope_code in ('assigned_classes', 'assigned_subjects')
      and es.is_active = true
      and es.starts_at <= pg_catalog.now()
      and (es.ends_at is null or es.ends_at >= pg_catalog.now())
  ) into v_has_teacher_scope;

  if v_has_teacher_scope then
    return p_class_id is not null
      and p_subject_id is not null
      and exists (
        select 1
        from iam.exception_scopes es
        where es.school_id = iam.current_school_id()
          and es.exception_id = p_exception_id
          and es.scope_code = 'assigned_classes'
          and es.is_active = true
          and es.starts_at <= pg_catalog.now()
          and (es.ends_at is null or es.ends_at >= pg_catalog.now())
          and iam.scope_matches(
            es.scope_code,
            es.target_id,
            p_target_profile_id,
            p_student_id,
            p_class_id,
            p_subject_id,
            p_portal_id,
            p_runtime_context
          )
      )
      and exists (
        select 1
        from iam.exception_scopes es
        where es.school_id = iam.current_school_id()
          and es.exception_id = p_exception_id
          and es.scope_code = 'assigned_subjects'
          and es.is_active = true
          and es.starts_at <= pg_catalog.now()
          and (es.ends_at is null or es.ends_at >= pg_catalog.now())
          and iam.scope_matches(
            es.scope_code,
            es.target_id,
            p_target_profile_id,
            p_student_id,
            p_class_id,
            p_subject_id,
            p_portal_id,
            p_runtime_context
          )
      );
  end if;

  return exists (
    select 1
    from iam.exception_scopes es
    where es.school_id = iam.current_school_id()
      and es.exception_id = p_exception_id
      and es.is_active = true
      and es.starts_at <= pg_catalog.now()
      and (es.ends_at is null or es.ends_at >= pg_catalog.now())
      and iam.scope_matches(
        es.scope_code,
        es.target_id,
        p_target_profile_id,
        p_student_id,
        p_class_id,
        p_subject_id,
        p_portal_id,
        p_runtime_context
      )
  );
end
$schoolsafe$;

create or replace function iam.has_explicit_deny(
  p_permission_code text,
  p_target_profile_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_subject_id uuid default null,
  p_portal_id uuid default null,
  p_runtime_context jsonb default '{}'::jsonb
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select
    exists (
      select 1
      from iam.profile_roles pr
      join iam.role_permission_grants g
        on g.role_id = pr.role_id
       and g.school_id = pr.school_id
      join iam.permissions p on p.id = g.permission_id
      where pr.school_id = iam.current_school_id()
        and pr.profile_id = iam.current_profile_id()
        and pr.is_active = true
        and pr.starts_at <= pg_catalog.now()
        and (pr.ends_at is null or pr.ends_at >= pg_catalog.now())
        and exists (
          select 1 from iam.roles r
          where r.id = pr.role_id and r.school_id = pr.school_id and r.is_active = true
        )
        and g.effect = 'deny'
        and g.is_active = true
        and g.starts_at <= pg_catalog.now()
        and (g.ends_at is null or g.ends_at >= pg_catalog.now())
        and p.code = p_permission_code
        and p.is_active = true
        and iam.grant_scopes_match(
          g.id,
          p_target_profile_id,
          p_student_id,
          p_class_id,
          p_subject_id,
          p_portal_id,
          p_runtime_context
        )
        and not exists (
          select 1
          from iam.permission_conditions c
          where c.school_id = g.school_id
            and c.grant_id = g.id
            and c.is_active = true
            and not iam.condition_matches(c.condition_code, c.condition_params, p_runtime_context)
        )
    )
    or exists (
      select 1
      from iam.profile_permission_exceptions e
      join iam.permissions p on p.id = e.permission_id
      where e.school_id = iam.current_school_id()
        and e.profile_id = iam.current_profile_id()
        and e.effect = 'deny'
        and e.is_active = true
        and e.starts_at <= pg_catalog.now()
        and (e.expires_at is null or e.expires_at >= pg_catalog.now())
        and p.code = p_permission_code
        and p.is_active = true
        and iam.exception_scopes_match(
          e.id,
          p_target_profile_id,
          p_student_id,
          p_class_id,
          p_subject_id,
          p_portal_id,
          p_runtime_context
        )
        and (
          e.condition_code is null
          or iam.condition_matches(e.condition_code, e.condition_params, p_runtime_context)
        )
    )
$schoolsafe$;

create or replace function iam.can_access(
  p_permission_code text,
  p_target_profile_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_subject_id uuid default null,
  p_portal_id uuid default null,
  p_runtime_context jsonb default '{}'::jsonb
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select
    iam.context_is_valid()
    and not iam.has_explicit_deny(
      p_permission_code,
      p_target_profile_id,
      p_student_id,
      p_class_id,
      p_subject_id,
      p_portal_id,
      p_runtime_context
    )
    and (
      p_permission_code not in (
        'pedagogy.subject.read',
        'pedagogy.assignment.read',
        'pedagogy.assignment.manage',
        'pedagogy.grade.manage',
        'pedagogy.lesson-plan.read',
        'pedagogy.lesson-plan.manage'
      )
      or (p_class_id is not null and p_subject_id is not null)
    )
    and (
      exists (
        select 1
        from iam.profile_permission_exceptions e
        join iam.permissions p on p.id = e.permission_id
        where e.school_id = iam.current_school_id()
          and e.profile_id = iam.current_profile_id()
          and e.effect = 'allow'
          and e.is_active = true
          and e.starts_at <= pg_catalog.now()
          and (e.expires_at is null or e.expires_at >= pg_catalog.now())
          and p.code = p_permission_code
          and p.is_active = true
          and iam.exception_scopes_match(
            e.id,
            p_target_profile_id,
            p_student_id,
            p_class_id,
            p_subject_id,
            p_portal_id,
            p_runtime_context
          )
          and (
            e.condition_code is null
            or iam.condition_matches(e.condition_code, e.condition_params, p_runtime_context)
          )
      )
      or exists (
        select 1
        from iam.profile_roles pr
        join iam.role_permission_grants g
          on g.role_id = pr.role_id
         and g.school_id = pr.school_id
        join iam.permissions p on p.id = g.permission_id
        where pr.school_id = iam.current_school_id()
          and pr.profile_id = iam.current_profile_id()
          and pr.is_active = true
          and pr.starts_at <= pg_catalog.now()
          and (pr.ends_at is null or pr.ends_at >= pg_catalog.now())
          and exists (
            select 1 from iam.roles r
            where r.id = pr.role_id and r.school_id = pr.school_id and r.is_active = true
          )
          and g.effect = 'allow'
          and g.is_active = true
          and g.starts_at <= pg_catalog.now()
          and (g.ends_at is null or g.ends_at >= pg_catalog.now())
          and p.code = p_permission_code
          and p.is_active = true
          and iam.grant_scopes_match(
            g.id,
            p_target_profile_id,
            p_student_id,
            p_class_id,
            p_subject_id,
            p_portal_id,
            p_runtime_context
          )
          and not exists (
            select 1
            from iam.permission_conditions c
            where c.school_id = g.school_id
              and c.grant_id = g.id
              and c.is_active = true
              and not iam.condition_matches(c.condition_code, c.condition_params, p_runtime_context)
          )
      )
    )
$schoolsafe$;

create or replace function iam.require_access(
  p_permission_code text,
  p_target_profile_id uuid default null,
  p_student_id uuid default null,
  p_class_id uuid default null,
  p_subject_id uuid default null,
  p_portal_id uuid default null,
  p_runtime_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  if not iam.can_access(
    p_permission_code,
    p_target_profile_id,
    p_student_id,
    p_class_id,
    p_subject_id,
    p_portal_id,
    p_runtime_context
  ) then
    raise insufficient_privilege using message = pg_catalog.format('Access denied: %s', p_permission_code);
  end if;
end
$schoolsafe$;

create or replace function app.is_student_operational(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
  select exists (
    select 1
    from app.students s
    join app.student_enrollments e
      on e.student_id = s.id
     and e.school_id = s.school_id
     and e.status = 'active'
    where s.id = p_student_id
      and s.school_id = iam.current_school_id()
      and s.lifecycle_status = 'active'
      and s.class_id = e.class_id
  )
$schoolsafe$;

create or replace function audit.write_event(
  p_event_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_event_id uuid;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Valid SchoolSafe context is required for audit';
  end if;
  if p_event_type is null or pg_catalog.btrim(p_event_type) = '' then
    raise check_violation using message = 'Audit event_type is required';
  end if;

  insert into audit.events (
    school_id,
    actor_profile_id,
    request_id,
    event_type,
    entity_type,
    entity_id,
    payload
  ) values (
    iam.current_school_id(),
    iam.current_profile_id(),
    iam.current_request_id(),
    p_event_type,
    p_entity_type,
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end
$schoolsafe$;

create or replace function ops.record_schema_version(
  p_unit_order smallint,
  p_baseline_version text,
  p_unit_name text,
  p_file_name text,
  p_sha256 text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_existing_hash text;
begin
  if p_unit_order not between 1 and 13 or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise check_violation using message = 'Invalid baseline version record';
  end if;

  select v.sha256 into v_existing_hash
  from ops.schema_versions v
  where v.unit_order = p_unit_order;

  if found and v_existing_hash <> p_sha256 then
    raise check_violation using message = pg_catalog.format(
      'Baseline checksum drift for unit %s: database=%s requested=%s',
      p_unit_order,
      v_existing_hash,
      p_sha256
    );
  end if;

  insert into ops.schema_versions (
    unit_order,
    baseline_version,
    unit_name,
    file_name,
    sha256
  ) values (
    p_unit_order,
    p_baseline_version,
    p_unit_name,
    p_file_name,
    p_sha256
  )
  on conflict (unit_order) do nothing;
end
$schoolsafe$;

commit;
