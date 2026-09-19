\set ON_ERROR_STOP on

-- SchoolSafe Access — contexte machine SchoolSafe Control.
-- Les callbacks Control sont signés HMAC (vérifié côté serveur Node AVANT tout SQL).
-- Ce RPC pose un contexte machine : instance + requête + école — JAMAIS de
-- profileId humain fabriqué. Les fonctions métier invoquées ensuite doivent
-- reconnaître le contexte machine (drapeau schoolsafe.control_context).
begin;
set local role schoolsafe_owner;

create or replace function api.set_control_context(
  p_instance_id text,
  p_request_id text,
  p_school_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $schoolsafe$
begin
  if p_instance_id is null or btrim(p_instance_id) = ''
     or p_request_id is null or btrim(p_request_id) = ''
     or p_school_id is null then
    raise exception 'CONTROL_CONTEXT_INVALID' using errcode = '28000';
  end if;

  perform pg_catalog.set_config('schoolsafe.control_instance', p_instance_id, true);
  perform pg_catalog.set_config('schoolsafe.control_request', p_request_id, true);
  perform pg_catalog.set_config('schoolsafe.school_id', p_school_id::text, true);
  perform pg_catalog.set_config('schoolsafe.control_context', 'on', true);
end
$schoolsafe$;

-- Le rôle API serveur peut poser le contexte machine ; jamais public.
grant execute on function api.set_control_context(text, text, uuid) to schoolsafe_api;

commit;
