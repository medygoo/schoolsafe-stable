\set ON_ERROR_STOP on

-- A null expiry is accepted only for an explicitly perpetual signed payload.
-- Signature verification, tenant RLS and the existing write RPC stay in place.
begin;
set local role schoolsafe_owner;
alter table ops.license_states alter column expires_at drop not null;
alter table ops.license_states add constraint license_states_perpetual_expiry
  check (expires_at is not null or
    (coalesce(payload -> 'perpetual' = 'true'::jsonb, false)
     and payload ? 'expires_at'
     and payload -> 'expires_at' = 'null'::jsonb
     and grace_days = 0));
commit;
