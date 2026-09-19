\set ON_ERROR_STOP on

-- SchoolSafe Projections v1 — unité 02 : paquet de session natif.
-- Après un login par cookie, le frontend appelle cette RPC pour obtenir
-- exactement ce que la permission lui autorise : profil, rôles, permissions
-- effectives (ALLOW moins DENY), portées, liens parentaux et affectations.
-- Tout est lu sous Access_Law en base — jamais calculé côté navigateur.

begin;
set local role schoolsafe_owner;

create or replace function api.session_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_user_id uuid := iam.current_user_id();
  v_profile_id uuid := iam.current_profile_id();
  v_school_id uuid := iam.current_school_id();
  v_profile record;
  v_school record;
begin
  if not iam.context_is_valid() then
    raise insufficient_privilege using message = 'Active SchoolSafe context required';
  end if;

  select p.id, p.display_name into v_profile
  from iam.profiles p
  where p.id = v_profile_id and p.school_id = v_school_id;

  select s.id, s.code, s.name into v_school
  from app.schools s
  where s.id = v_school_id;

  return jsonb_build_object(
    'profile', jsonb_build_object('id', v_profile.id, 'display_name', v_profile.display_name),
    'schoolId', v_school.id,
    'school', jsonb_build_object('id', v_school.id, 'code', v_school.code, 'name', v_school.name),

    -- Rôles actifs du profil.
    'roles', coalesce((
      select jsonb_agg(r.code order by r.code)
      from iam.profile_roles pr
      join iam.roles r on r.id = pr.role_id and r.school_id = pr.school_id
      where pr.school_id = v_school_id
        and pr.profile_id = v_profile_id
        and pr.is_active = true
        and r.is_active = true
    ), '[]'::jsonb),

    -- Permissions effectives : ALLOW actifs distincts, moins les DENY de rôle
    -- ET les exceptions individuelles DENY (toutes deux prioritaires).
    'permissions', coalesce((
      select jsonb_agg(a.code order by a.code)
      from (
        select distinct p.code as code
        from iam.profile_roles pr
        join iam.role_permission_grants g
          on g.role_id = pr.role_id and g.school_id = pr.school_id
        join iam.permissions p on p.id = g.permission_id
        where pr.school_id = v_school_id
          and pr.profile_id = v_profile_id
          and pr.is_active = true
          and g.effect = 'allow'
          and g.is_active = true
          and p.is_active = true
          and not exists (
            select 1
            from iam.role_permission_grants dg
            join iam.permissions dp on dp.id = dg.permission_id
            join iam.profile_roles dpr
              on dpr.role_id = dg.role_id and dpr.school_id = dg.school_id
            where dpr.school_id = v_school_id
              and dpr.profile_id = v_profile_id
              and dpr.is_active = true
              and dg.effect = 'deny'
              and dg.is_active = true
              and dp.code = p.code
          )
          and not exists (
            select 1
            from iam.profile_permission_exceptions ex
            join iam.permissions xp on xp.id = ex.permission_id
            where ex.school_id = v_school_id
              and ex.profile_id = v_profile_id
              and ex.is_active = true
              and ex.effect = 'deny'
              and (ex.expires_at is null or ex.expires_at >= pg_catalog.now())
              and xp.code = p.code
          )
      ) a
    ), '[]'::jsonb),

    -- Exceptions individuelles actives, AVEC leurs portées canoniques
    -- (INC-6 : une exception ALLOW sans portée remontée est inutilisable).
    'permissionExceptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'permission', xp.code,
        'effect', ex.effect,
        'reason', ex.reason,
        'expires_at', ex.expires_at,
        'scopes', coalesce((
          select jsonb_agg(jsonb_build_object('permission', xp.code, 'type', es.scope_code, 'target', es.target_id))
          from iam.exception_scopes es
          where es.school_id = v_school_id
            and es.exception_id = ex.id
            and es.is_active = true
            and es.starts_at <= pg_catalog.now()
            and (es.ends_at is null or es.ends_at >= pg_catalog.now())
        ), '[]'::jsonb)
      ))
      from iam.profile_permission_exceptions ex
      join iam.permissions xp on xp.id = ex.permission_id
      where ex.school_id = v_school_id
        and ex.profile_id = v_profile_id
        and ex.is_active = true
        and (ex.expires_at is null or ex.expires_at >= pg_catalog.now())
    ), '[]'::jsonb),

    -- Portées liées aux grants actifs — CONTRAT CANONIQUE {permission, type, target}.
    -- Une portée sans permission est interdite : chaque ligne joint son code.
    'scopes', coalesce((
      select jsonb_agg(jsonb_build_object('permission', p.code, 'type', gs.scope_code, 'target', gs.target_id))
      from iam.grant_scopes gs
      join iam.role_permission_grants g on g.id = gs.grant_id and g.school_id = gs.school_id
      join iam.permissions p on p.id = g.permission_id
      join iam.profile_roles pr on pr.role_id = g.role_id and pr.school_id = g.school_id
      where pr.school_id = v_school_id
        and pr.profile_id = v_profile_id
        and pr.is_active = true
        and g.effect = 'allow'
        and g.is_active = true
        and gs.is_active = true
        -- DENY prioritaire : une permission niée (rôle ou exception) ne laisse
        -- AUCUNE portée visible dans le paquet de session.
        and not exists (
          select 1
          from iam.role_permission_grants dg
          join iam.permissions dp on dp.id = dg.permission_id
          join iam.profile_roles dpr
            on dpr.role_id = dg.role_id and dpr.school_id = dg.school_id
          where dpr.school_id = v_school_id
            and dpr.profile_id = v_profile_id
            and dpr.is_active = true
            and dg.effect = 'deny'
            and dg.is_active = true
            and dp.code = p.code
        )
        and not exists (
          select 1
          from iam.profile_permission_exceptions ex
          join iam.permissions xp on xp.id = ex.permission_id
          where ex.school_id = v_school_id
            and ex.profile_id = v_profile_id
            and ex.is_active = true
            and ex.effect = 'deny'
            and (ex.expires_at is null or ex.expires_at >= pg_catalog.now())
            and xp.code = p.code
        )
    ), '[]'::jsonb),
    'childIds', coalesce((
      select jsonb_agg(sg.student_id)
      from app.student_guardians sg
      where sg.school_id = v_school_id
        and sg.profile_id = v_profile_id
        and sg.is_active = true
    ), '[]'::jsonb),

    -- Affectations enseignantes actives.
    'assignedClassIds', coalesce((
      select jsonb_agg(distinct ta.class_id)
      from app.teacher_assignments ta
      where ta.school_id = v_school_id
        and ta.teacher_profile_id = v_profile_id
        and ta.is_active = true
    ), '[]'::jsonb),
    'assignedSubjectIds', coalesce((
      select jsonb_agg(distinct ta.subject_id)
      from app.teacher_assignments ta
      where ta.school_id = v_school_id
        and ta.teacher_profile_id = v_profile_id
        and ta.is_active = true
        and ta.subject_id is not null
    ), '[]'::jsonb),

    -- Portails affectés (via les portées de grants).
    'assignedPortalIds', coalesce((
      select jsonb_agg(distinct gs.target_id)
      from iam.grant_scopes gs
      join iam.role_permission_grants g on g.id = gs.grant_id and g.school_id = gs.school_id
      join iam.profile_roles pr on pr.role_id = g.role_id and pr.school_id = g.school_id
      where pr.school_id = v_school_id
        and pr.profile_id = v_profile_id
        and gs.scope_code = 'assigned_portal'
        and gs.is_active = true
        and gs.target_id is not null
    ), '[]'::jsonb),

    -- Permissions explicitement refusées : rôles DENY + exceptions DENY.
    'deniedPermissions', coalesce((
      select jsonb_agg(distinct denied_code)
      from (
        select dp.code as denied_code
        from iam.profile_roles dpr
        join iam.role_permission_grants dg
          on dg.role_id = dpr.role_id and dg.school_id = dpr.school_id
        join iam.permissions dp on dp.id = dg.permission_id
        where dpr.school_id = v_school_id
          and dpr.profile_id = v_profile_id
          and dpr.is_active = true
          and dg.effect = 'deny'
          and dg.is_active = true
        union
        select xp.code
        from iam.profile_permission_exceptions ex
        join iam.permissions xp on xp.id = ex.permission_id
        where ex.school_id = v_school_id
          and ex.profile_id = v_profile_id
          and ex.is_active = true
          and ex.effect = 'deny'
          and (ex.expires_at is null or ex.expires_at >= pg_catalog.now())
      ) denied_codes
    ), '[]'::jsonb),

    'offline_policy', jsonb_build_object('max_offline_hours', 24)
  );
end
$schoolsafe$;

grant execute on function api.session_bootstrap() to schoolsafe_api;

commit;
