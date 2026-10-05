import assert from "node:assert/strict";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
const db = new pg.Client({ connectionString });
await db.connect();

const subject = "55555555-5555-4555-8555-555555555555";
const nativeUser = "66666666-6666-4666-8666-666666666666";
const nativeIdentity = "77777777-7777-4777-8777-777777777777";

try {
  await db.query("begin");
  await db.query("set local session authorization schoolsafe_auth");
  const linked = await db.query(
    "select user_id from api.auth_link_supabase_principal($1, $2, $3)",
    [subject, "password-gate@example.com", "+243810000111"],
  );
  await db.query("reset session authorization");
  const created = linked.rows[0].user_id;
  const flag = await db.query("select auth_provider, must_change_password from iam.users where id = $1", [created]);
  assert.equal(flag.rows[0].auth_provider, "supabase");
  assert.equal(flag.rows[0].must_change_password, true);
  const credentials = await db.query(
    "select count(*)::int n from auth.credentials c join auth.identities i on i.id = c.identity_id where i.user_id = $1",
    [created],
  );
  assert.equal(credentials.rows[0].n, 0);

  await db.query(
    "insert into iam.users (id, auth_provider, external_subject, email, is_active) values ($1::uuid, 'local', $1::text, 'native-password@example.com', true)",
    [nativeUser],
  );
  await db.query(
    "insert into auth.identities (id, user_id, email, status) values ($1, $2, 'native-password@example.com', 'active')",
    [nativeIdentity, nativeUser],
  );
  await db.query(
    "insert into auth.credentials (identity_id, password_hash, must_change) values ($1, '$argon2id$v=19$m=65536,t=3,p=4$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', true)",
    [nativeIdentity],
  );
  const native = await db.query(
    "select u.must_change_password, c.must_change from iam.users u join auth.identities i on i.user_id = u.id join auth.credentials c on c.identity_id = i.id where u.id = $1",
    [nativeUser],
  );
  assert.equal(native.rows[0].must_change_password, false);
  assert.equal(native.rows[0].must_change, true);

  await db.query("set local session authorization schoolsafe_auth");
  const cleared = await db.query("select api.auth_supabase_clear_password_change($1) as cleared", [subject]);
  await db.query("reset session authorization");
  assert.equal(cleared.rows[0].cleared, true);
  const after = await db.query("select must_change_password from iam.users where id = $1", [created]);
  assert.equal(after.rows[0].must_change_password, false);
  const nativeAfter = await db.query("select must_change_password from iam.users where id = $1", [nativeUser]);
  assert.equal(nativeAfter.rows[0].must_change_password, false);
  const credentialAfter = await db.query("select must_change from auth.credentials where identity_id = $1", [nativeIdentity]);
  assert.equal(credentialAfter.rows[0].must_change, true);
  const definition = await db.query("select pg_get_functiondef('api.auth_resolve_session(text)'::regprocedure) as def");
  assert.equal(definition.rows[0].def.includes("u.auth_provider = 'supabase' and u.must_change_password"), true);
  assert.equal(definition.rows[0].def.includes("coalesce(c.must_change, false)"), true);
  const forced = await db.query("select c.relforcerowsecurity as forced from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'iam' and c.relname = 'users'");
  assert.equal(forced.rows[0].forced, true);
  await db.query("rollback");
  console.log("SUPABASE_PASSWORD_STATE PASS");
} finally {
  await db.end();
}
