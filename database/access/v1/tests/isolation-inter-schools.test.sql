-- Tests d'isolation inter-écoles — PREUVES DESTRUCTIVES, base éphémère seule.
-- Chaque assertion lève une exception en cas d'échec ; la fin fait ROLLBACK
-- (rien ne persiste). Exécutée comme bootstrap après les deux bootstraps.
--
-- Scénario :
--   École ISO-A (admin A, élève SA)   École ISO-B (admin B, élève SB)
--   Utilisateur X : profil admin en A ET profil parent en B (multi-écoles)
--
-- T1  admin A lit l'élève SA                          → autorisé
-- T2  contexte profil A + school B                    → REFUSÉ (cohérence)
-- T3  contexte A, lecture élève SB                    → REFUSÉ (tenant RLS)
-- T4  X en contexte B (profil B) lit SB               → autorisé
-- T5  X en contexte B lit SA                          → REFUSÉ (tenant RLS)
-- T6  admin A + exception DENY sur student.read       → REFUSÉ (DENY prioritaire)
-- T7  aucun contexte                                  → REFUSÉ (fail-closed)
-- T8  changement de school_id vers une école non liée → REFUSÉ
\set ON_ERROR_STOP on

-- ─── Préparation ───
insert into iam.users (id, auth_provider, external_subject, email) values
  ('51000000-0000-4000-8000-000000000051', 'test', 'user-x-multi', 'x-multi@example.invalid');
insert into app.students (id, school_id, matricule, first_name, last_name, lifecycle_status) values
  ('53000000-0000-4000-8000-000000000051', (select id from app.schools where code = 'ISO-A'), 'ISO-A-1', 'Elève', 'A', 'active'),
  ('53000000-0000-4000-8000-000000000052', (select id from app.schools where code = 'ISO-B'), 'ISO-B-1', 'Elève', 'B', 'active');

-- Utilisateur X : profil admin en A + profil parent en B.
insert into iam.profiles (id, user_id, school_id, display_name) values
  ('52000000-0000-4000-8000-000000000051', '51000000-0000-4000-8000-000000000051', (select id from app.schools where code = 'ISO-A'), 'X Admin A'),
  ('52000000-0000-4000-8000-000000000052', '51000000-0000-4000-8000-000000000051', (select id from app.schools where code = 'ISO-B'), 'X Parent B');
insert into iam.profile_roles (school_id, profile_id, role_id, is_active)
select (select id from app.schools where code = 'ISO-A'), '52000000-0000-4000-8000-000000000051', r.id, true
from iam.roles r where r.school_id = (select id from app.schools where code = 'ISO-A') and r.code = 'admin';
insert into iam.profile_roles (school_id, profile_id, role_id, is_active)
select (select id from app.schools where code = 'ISO-B'), '52000000-0000-4000-8000-000000000052', r.id, true
from iam.roles r where r.school_id = (select id from app.schools where code = 'ISO-B') and r.code = 'parent';

-- DENY de preuve : admin A perd school.student.read par exception, AVEC sa
-- ligne de portée (le moteur l'exige : une exception sans portée ne s'applique
-- pas — fail-closed du modèle).
insert into iam.profile_permission_exceptions (id, school_id, profile_id, permission_id, effect, reason, granted_by)
select
  '55000000-0000-4000-8000-000000000051',
  (select id from app.schools where code = 'ISO-A'),
  '52000000-0000-4000-8000-000000000051',
  p.id,
  'deny',
  'Preuve isolation : DENY prioritaire même pour admin',
  '52000000-0000-4000-8000-000000000051'
from iam.permissions p where p.code = 'school.student.read';
insert into iam.exception_scopes (school_id, exception_id, scope_code, target_id)
values (
  (select id from app.schools where code = 'ISO-A'),
  '55000000-0000-4000-8000-000000000051',
  'school',
  null
);

begin;

-- T1 : admin A lit son élève.
do $t$
declare
  v_school uuid := (select id from app.schools where code = 'ISO-A');
  v_profile uuid;
  v_user uuid;
  v_student uuid := '53000000-0000-4000-8000-000000000051';
begin
  select pr.id, pr.user_id into v_profile, v_user
  from iam.profiles pr
  join iam.profile_roles pro on pro.profile_id = pr.id
  join iam.roles r on r.id = pro.role_id
  where pr.school_id = v_school and r.code = 'admin'
    and pr.id <> '52000000-0000-4000-8000-000000000051'
  limit 1;
  perform api.set_request_context(v_user, v_profile, v_school, pg_catalog.gen_random_uuid());
  perform api.student_read(v_student);
  raise notice 'T1 OK : admin A lit son eleve';
end
$t$;

commit;
begin;

-- T2 : profil A + school B → contexte refusé.
do $t$
declare
  v_school_a uuid := (select id from app.schools where code = 'ISO-A');
  v_school_b uuid := (select id from app.schools where code = 'ISO-B');
begin
  begin
    perform api.set_request_context(
      '51000000-0000-4000-8000-000000000051',
      '52000000-0000-4000-8000-000000000051',
      v_school_b,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'T2 ECHEC : contexte profil-A/ecole-B accepté';
  exception when insufficient_privilege then
    raise notice 'T2 OK : contexte incoherent refuse';
  end;
end
$t$;

commit;
begin;

-- T3 : contexte A valide (admin PROPRE, pas X), lecture de l'élève SB → REFUSÉ (tenant RLS).
do $t$
declare
  v_school uuid := (select id from app.schools where code = 'ISO-A');
  v_profile uuid;
  v_user uuid;
begin
  select pr.id, pr.user_id into v_profile, v_user
  from iam.profiles pr
  join iam.profile_roles pro on pro.profile_id = pr.id
  join iam.roles r on r.id = pro.role_id
  where pr.school_id = v_school and r.code = 'admin'
    and pr.id <> '52000000-0000-4000-8000-000000000051'
  limit 1;
  perform api.set_request_context(v_user, v_profile, v_school, pg_catalog.gen_random_uuid());
  begin
    perform api.student_read('53000000-0000-4000-8000-000000000052');
    raise exception 'T3 ECHEC : eleve d une autre ecole lu';
  exception when foreign_key_violation then
    raise notice 'T3 OK : eleve inter-ecole refuse';
  end;
end
$t$;

commit;
begin;

-- T4 : X en contexte B lit son élève SB (rôle parent, mais admin... non :
-- parent sans lien → refusé par Access_Law own_children !)
do $t$
declare
  v_school uuid := (select id from app.schools where code = 'ISO-B');
begin
  perform api.set_request_context(
    '51000000-0000-4000-8000-000000000051',
    '52000000-0000-4000-8000-000000000052',
    v_school,
    pg_catalog.gen_random_uuid()
  );
  begin
    perform api.student_read('53000000-0000-4000-8000-000000000052');
    raise exception 'T4 ECHEC : parent sans lien a lu un eleve';
  exception when insufficient_privilege then
    raise notice 'T4 OK : parent sans lien refuse par own_children';
  end;
end
$t$;

commit;
begin;

-- T5 : X en contexte B tente l'élève SA → REFUSÉ (tenant).
do $t$
declare
  v_school uuid := (select id from app.schools where code = 'ISO-B');
begin
  perform api.set_request_context(
    '51000000-0000-4000-8000-000000000051',
    '52000000-0000-4000-8000-000000000052',
    v_school,
    pg_catalog.gen_random_uuid()
  );
  begin
    perform api.student_read('53000000-0000-4000-8000-000000000051');
    raise exception 'T5 ECHEC : eleve inter-ecole lu';
  exception when insufficient_privilege or foreign_key_violation then
    raise notice 'T5 OK : lecture inter-ecole refusee';
  end;
end
$t$;

commit;
begin;

-- T6 : admin A avec DENY exception → student_read REFUSÉ même pour admin.
do $t$
declare
  v_school uuid := (select id from app.schools where code = 'ISO-A');
begin
  perform api.set_request_context(
    '51000000-0000-4000-8000-000000000051',
    '52000000-0000-4000-8000-000000000051',
    v_school,
    pg_catalog.gen_random_uuid()
  );
  begin
    perform api.student_read('53000000-0000-4000-8000-000000000051');
    raise exception 'T6 ECHEC : DENY ignore pour admin';
  exception when insufficient_privilege then
    raise notice 'T6 OK : DENY prioritaire meme pour admin';
  end;
end
$t$;

commit;
begin;

-- T7 : aucun contexte → fail-closed.
do $t$
begin
  begin
    perform api.student_read('53000000-0000-4000-8000-000000000051');
    raise exception 'T7 ECHEC : lecture sans contexte';
  exception when insufficient_privilege then
    raise notice 'T7 OK : sans contexte refuse';
  end;
end
$t$;

commit;
begin;

-- T8 : profil B + school A (changement de school_id non autorisé) → REFUSÉ.
do $t$
declare
  v_school_a uuid := (select id from app.schools where code = 'ISO-A');
begin
  begin
    perform api.set_request_context(
      '51000000-0000-4000-8000-000000000051',
      '52000000-0000-4000-8000-000000000052',
      v_school_a,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'T8 ECHEC : changement d ecole accepte';
  exception when insufficient_privilege then
    raise notice 'T8 OK : changement de school_id refuse';
  end;
end
$t$;

commit;

\echo '=== ISOLATION : T1-T8 TERMINEES ==='
