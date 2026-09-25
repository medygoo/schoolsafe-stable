\set ON_ERROR_STOP on
-- Resolve an existing setup capability without exposing auth tables to the migrator.
begin;
set local role schoolsafe_owner;

create or replace function ops.resolve_school_setup_authorization(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid;
begin
  -- Auth can reach this function only through the owner-owned setup RPCs;
  -- its direct EXECUTE privilege remains revoked below.
  if session_user not in ('schoolsafe_migrator', 'schoolsafe_auth') then
    raise insufficient_privilege using message = 'Setup authorization context required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select a.school_id into v_school_id
    from auth.setup_authorizations a
    where a.token_hash = p_token_hash
      and a.consumed_at is null
      and a.expires_at > pg_catalog.clock_timestamp();
  return v_school_id;
end
$schoolsafe$;

revoke all on function ops.resolve_school_setup_authorization(text)
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_auditor;
grant execute on function ops.resolve_school_setup_authorization(text) to schoolsafe_migrator;
commit;
