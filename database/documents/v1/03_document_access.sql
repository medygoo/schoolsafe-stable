\set ON_ERROR_STOP on

-- SchoolSafe Documents v1 — unité 03 : sécurité RLS et ACL.
-- Applique FORCE RLS et les policies tenant-aware sur les tables documentaires.

begin;
set local role schoolsafe_owner;

-- =============================================================================
-- 1. RLS : app.document_sequences
-- =============================================================================
alter table app.document_sequences enable row level security;
alter table app.document_sequences force row level security;

drop policy if exists document_sequences_owner_select on app.document_sequences;
create policy document_sequences_owner_select
on app.document_sequences
for select
to schoolsafe_owner
using (
  school_id = iam.current_school_id()
  and iam.context_is_valid()
);

drop policy if exists document_sequences_owner_insert on app.document_sequences;
create policy document_sequences_owner_insert
on app.document_sequences
for insert
to schoolsafe_owner
with check (
  school_id = iam.current_school_id()
  and iam.context_is_valid()
);

drop policy if exists document_sequences_owner_update on app.document_sequences;
create policy document_sequences_owner_update
on app.document_sequences
for update
to schoolsafe_owner
using (
  school_id = iam.current_school_id()
  and iam.context_is_valid()
)
with check (
  school_id = iam.current_school_id()
  and iam.context_is_valid()
);

-- Pas de DELETE policy : les séquences ne sont pas supprimables.

-- =============================================================================
-- 2. RLS : app.documents
-- =============================================================================
alter table app.documents enable row level security;
alter table app.documents force row level security;

drop policy if exists documents_owner_select on app.documents;
create policy documents_owner_select
on app.documents
for select
to schoolsafe_owner
using (
  school_id = iam.current_school_id()
  and iam.context_is_valid()
);

drop policy if exists documents_owner_insert on app.documents;
create policy documents_owner_insert
on app.documents
for insert
to schoolsafe_owner
with check (
  school_id = iam.current_school_id()
  and iam.context_is_valid()
);

drop policy if exists documents_owner_update on app.documents;
create policy documents_owner_update
on app.documents
for update
to schoolsafe_owner
using (
  school_id = iam.current_school_id()
  and iam.context_is_valid()
)
with check (
  school_id = iam.current_school_id()
  and iam.context_is_valid()
);

-- Pas de DELETE policy : les documents doivent être CANCELLED ou ARCHIVED.

-- =============================================================================
-- 3. ACL : Révoquer tout accès direct non autorisé
-- =============================================================================
revoke all on app.document_sequences
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_auditor;

revoke all on app.documents
  from public, schoolsafe_api, schoolsafe_auth, schoolsafe_worker, schoolsafe_auditor;

commit;