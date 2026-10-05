import assert from "node:assert/strict";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
const db = new pg.Client({ connectionString });
await db.connect();

const payload = {
  admin: { first_name: "Ada", last_name: "Test" },
  identity: { name_fr: "Ecole Bootstrap" },
  cycles: ["primary"],
  academic_year: { label: "2026-2027", starts_on: "2026-09-01", ends_on: "2027-07-01" },
  contact: { country: "RDC", province: "Kinshasa", city: "Kinshasa", address: "Adresse test" },
  brand: { primary_color: "#112233", accent_color: "#abcdef" },
};
const principal = "11111111-1111-4111-8111-111111111111";
const nativeSubject = "22222222-2222-4222-8222-222222222222";
const existingSubject = "33333333-3333-4333-8333-333333333333";

function rejects(code) {
  return (error) => error.code === code;
}

async function asAuth(sql, params = []) {
  await db.query("begin");
  try {
    await db.query("set local session authorization schoolsafe_auth");
    const result = await db.query(sql, params);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

try {
  await db.query("insert into iam.users (id, auth_provider, external_subject, email, phone) values ($1::uuid,'supabase',$1::text,'bootstrap-a@example.com','+243810000101')", [principal]);
  const created = await asAuth("select api.auth_supabase_principal_create_school($1,$2::jsonb) result", [principal, JSON.stringify(payload)]);
  const row = created.rows[0].result;
  assert.equal(row.status, "completed");
  assert.equal(row.role, "admin");
  assert.equal(row.school_created, true);
  assert.equal(row.principal_profile_created, true);
  assert.equal(row.user_id, principal);

  const definition = await db.query("select pg_get_functiondef('api.auth_supabase_principal_create_school(uuid,jsonb)'::regprocedure) def");
  assert.equal(definition.rows[0].def.toLowerCase().includes("direct_activation_allows"), false);
  assert.equal(definition.rows[0].def.toLowerCase().includes("direct_onboarding_accounts"), false);
  const legacy = await db.query("select to_regprocedure('auth.direct_activation_allows(uuid)') fn, (select count(*)::int from pg_policies where policyname = 'schools_direct_activation_insert') policies");
  assert.ok(legacy.rows[0].fn);
  assert.equal(legacy.rows[0].policies, 1);
  const forced = await db.query("select c.relrowsecurity and c.relforcerowsecurity as forced from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname='schools'");
  assert.equal(forced.rows[0].forced, true);
  const privilege = await db.query("select has_function_privilege('schoolsafe_auth','auth.supabase_principal_bootstrap_allows(uuid)','execute') allowed");
  assert.equal(privilege.rows[0].allowed, false);

  await assert.rejects(asAuth("select api.auth_supabase_principal_create_school($1,$2::jsonb)", [principal, JSON.stringify(payload)]), rejects("23505"));
  assert.equal((await db.query("select count(*)::int n from app.schools")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from iam.profiles where user_id=$1", [principal])).rows[0].n, 1);

  await db.query("insert into iam.users (id, auth_provider, external_subject, email) values ($1::uuid,'native',$1::text,'native-bootstrap@example.com')", [nativeSubject]);
  await assert.rejects(asAuth("select api.auth_supabase_principal_create_school($1,$2::jsonb)", [nativeSubject, JSON.stringify(payload)]), rejects("42501"));

  const otherSchool = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherProfile = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await db.query("insert into iam.users (id, auth_provider, external_subject, email) values ($1::uuid,'supabase',$1::text,'bootstrap-b@example.com')", [existingSubject]);
  await db.query("insert into app.schools (id, code, name, is_active) values ($1,'SCH-OTHER','Autre ecole',true)", [otherSchool]);
  await db.query("insert into iam.profiles (id, user_id, school_id, display_name, is_active) values ($1,$2,$3,'Deja profil',true)", [otherProfile, existingSubject, otherSchool]);
  await assert.rejects(asAuth("select api.auth_supabase_principal_create_school($1,$2::jsonb)", [existingSubject, JSON.stringify({ ...payload, identity: { name_fr: "Ne doit pas naitre" } })]), rejects("23505"));
  assert.equal((await db.query("select count(*)::int n from app.schools where name='Ne doit pas naitre'")).rows[0].n, 0);

  await assert.rejects(asAuth("select api.auth_supabase_principal_create_school($1,$2::jsonb)", [principal, JSON.stringify({ ...payload, school_id: otherSchool })]), rejects("23514"));
  await assert.rejects(asAuth("select api.auth_supabase_principal_create_school($1,$2::jsonb)", [principal, JSON.stringify({ ...payload, external_subject: nativeSubject })]), rejects("23514"));

  await db.query("begin");
  await db.query("update iam.role_templates set is_active=false where code='admin'");
  await db.query("savepoint before_failure");
  await db.query("set local role schoolsafe_auth");
  const fresh = "44444444-4444-4444-8444-444444444444";
  await db.query("reset role");
  await db.query("insert into iam.users (id, auth_provider, external_subject, email) values ($1::uuid,'supabase',$1::text,'bootstrap-rollback@example.com')", [fresh]);
  await db.query("savepoint before_call");
  await db.query("set local session authorization schoolsafe_auth");
  await assert.rejects(db.query("select api.auth_supabase_principal_create_school($1,$2::jsonb)", [fresh, JSON.stringify({ ...payload, identity: { name_fr: "Rollback" } })]), rejects("23514"));
  await db.query("rollback to savepoint before_call");
  await db.query("reset role");
  assert.equal((await db.query("select count(*)::int n from app.schools where name='Rollback'")).rows[0].n, 0);
  await db.query("rollback");
  assert.equal((await db.query("select is_active from iam.role_templates where code='admin'")).rows[0].is_active, true);

  await db.query("begin");
  const legacySchool = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const legacyUser = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const legacyIdentity = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await db.query("insert into iam.users (id, auth_provider, external_subject, email) values ($1::uuid,'native',$1::text,'legacy-direct@example.com')", [legacyUser]);
  await db.query("insert into auth.identities (id, user_id, email, status) values ($1,$2,'legacy-direct@example.com','active')", [legacyIdentity, legacyUser]);
  await db.query("insert into auth.direct_onboarding_accounts (identity_id, user_id, first_name, last_name, activating_school_id, activating_txid) values ($1,$2,'Legacy','Path',$3,txid_current())", [legacyIdentity, legacyUser, legacySchool]);
  await db.query("grant schoolsafe_owner to schoolsafe_auth");
  await db.query("set local session authorization schoolsafe_auth");
  await db.query("set local role schoolsafe_owner");
  await db.query("insert into app.schools (id, code, name, is_active) values ($1,'SCH-LEGACY','Legacy direct',false)", [legacySchool]);
  await db.query("reset role");
  await db.query("reset session authorization");
  assert.equal((await db.query("select count(*)::int n from app.schools where id=$1", [legacySchool])).rows[0].n, 1);
  await db.query("rollback");

  await db.query("begin");
  const hidden = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await db.query("insert into app.schools (id, code, name, is_active) values ($1,'SCH-HIDDEN','Ecole B',true)", [hidden]);
  await db.query("set local role schoolsafe_owner");
  await db.query("select api.set_request_context($1,$2,$3,$4)", [row.user_id, row.profile_id, row.school_id, "99999999-9999-4999-8999-999999999999"]);
  assert.equal((await db.query("select count(*)::int n from app.schools where id=$1", [hidden])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from app.schools where id=$1", [row.school_id])).rows[0].n, 1);
  await db.query("rollback");

  console.log("SUPABASE_BOOTSTRAP_RLS PASS");
} finally {
  await db.end();
}
