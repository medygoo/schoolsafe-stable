\set ON_ERROR_STOP on

-- Restore transaction-local preauth without changing the auth v3 active-state filters.
begin;
set local role schoolsafe_owner;

create or replace function api.auth_resolve_identity(p_login text)
returns table (
  identity_id uuid,
  user_id uuid,
  password_hash text,
  status text,
  must_change boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_login text := auth.normalize_login(p_login);
begin
  perform pg_catalog.set_config(
    'schoolsafe.preauth',
    'on',
    true
  );
  if v_login = '' then
    return;
  end if;

  return query
  select i.id, i.user_id, c.password_hash, i.status, coalesce(c.must_change, false)
  from auth.identities i
  join iam.users u on u.id = i.user_id and u.is_active = true
  left join auth.credentials c on c.identity_id = i.id
  where (i.email::text = v_login or i.phone = v_login)
    and i.status = 'active'
    and exists (
      select 1
      from iam.profiles p
      join app.schools s on s.id = p.school_id and s.is_active = true
      where p.user_id = i.user_id and p.is_active = true
    )
  limit 1;
end
$schoolsafe$;

commit;
