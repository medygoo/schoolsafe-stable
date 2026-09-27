\set ON_ERROR_STOP on
-- SchoolSafe Prodeli v1 — unité 1 : lecture sécurisée des inscriptions pour PRODELI.
-- Fournit une projection administrative sûre de auth.account_registration_requests
-- sans exposer password_hash, approval_token_hash ni aucune donnée sensible.
begin;
set local role schoolsafe_owner;

create or replace function api.prodeli_list_registrations(
  p_status text,
  p_limit integer
)
returns table (
  request_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  status text,
  created_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise check_violation using message = 'Limit must be between 1 and 100';
  end if;

  if p_status is not null and p_status not in ('pending', 'approved', 'rejected', 'completed') then
    raise check_violation using message = 'Invalid status filter';
  end if;

  return query
  select
    r.id,
    r.first_name,
    r.last_name,
    r.email::text,
    r.phone,
    r.status,
    r.created_at,
    r.approved_at,
    r.rejected_at,
    r.completed_at
  from auth.account_registration_requests r
  where (p_status is null or r.status = p_status)
  order by r.created_at desc
  limit p_limit;
end
$schoolsafe$;

-- ACL : seul schoolsafe_api (utilisé par le serveur PRODELI) peut lire
revoke all on function api.prodeli_list_registrations(text, integer) from public, schoolsafe_auth, schoolsafe_worker, schoolsafe_migrator, schoolsafe_auditor;
grant execute on function api.prodeli_list_registrations(text, integer) to schoolsafe_api;

commit;