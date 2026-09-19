\set ON_ERROR_STOP on

begin;

create schema if not exists app authorization schoolsafe_owner;
create schema if not exists iam authorization schoolsafe_owner;
create schema if not exists audit authorization schoolsafe_owner;
create schema if not exists ops authorization schoolsafe_owner;
create schema if not exists api authorization schoolsafe_owner;
create schema if not exists legacy_cloud authorization schoolsafe_owner;
create schema if not exists auth authorization schoolsafe_owner;

alter schema app owner to schoolsafe_owner;
alter schema iam owner to schoolsafe_owner;
alter schema audit owner to schoolsafe_owner;
alter schema ops owner to schoolsafe_owner;
alter schema api owner to schoolsafe_owner;
alter schema legacy_cloud owner to schoolsafe_owner;
alter schema auth owner to schoolsafe_owner;

revoke all on schema public from public;
revoke all on schema app, iam, audit, ops, api, legacy_cloud, auth from public;
revoke all on schema app, iam, audit, ops, api, legacy_cloud, auth from schoolsafe_api, schoolsafe_worker, schoolsafe_auditor;

alter default privileges for role schoolsafe_owner revoke all on tables from public;
alter default privileges for role schoolsafe_owner revoke all on sequences from public;
alter default privileges for role schoolsafe_owner revoke execute on functions from public;

alter default privileges for role schoolsafe_owner in schema app revoke all on tables from public;
alter default privileges for role schoolsafe_owner in schema iam revoke all on tables from public;
alter default privileges for role schoolsafe_owner in schema audit revoke all on tables from public;
alter default privileges for role schoolsafe_owner in schema ops revoke all on tables from public;
alter default privileges for role schoolsafe_owner in schema api revoke execute on functions from public;

comment on schema app is 'SchoolSafe tenant business data.';
comment on schema iam is 'SchoolSafe identities, roles, permissions, scopes, conditions, and exceptions.';
comment on schema audit is 'Append-only SchoolSafe audit trail.';
comment on schema ops is 'Operational queues, numbering, retention, and baseline metadata.';
comment on schema api is 'Only database surface callable by backend runtime roles.';
comment on schema legacy_cloud is 'Quarantine target for future reconciled cloud imports; empty in the baseline.';
comment on schema auth is 'Reserved for a future, separately approved authentication migration.';

commit;
