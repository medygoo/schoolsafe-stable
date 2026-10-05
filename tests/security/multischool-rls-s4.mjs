import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "../..");
const temp = path.join(process.env.TEMP, "schoolsafe-s4");
const emailA = "p05-principal-test@example.com";
const emailB = "p05-principal-b-test@example.com";
const port = 8797;

function readSecret(name) {
  return fs.readFileSync(path.join(temp, name), "utf8").trim();
}

function schoolBody(name) {
  return {
    admin: { first_name: "Admin", last_name: name },
    identity: { name_fr: name, school_type: "Privée agréée" },
    cycles: ["primary"],
    academic_year: { label: "2026-2027", starts_on: "2026-09-01", ends_on: "2027-06-30", periods: "Trimestres" },
    contact: { country: "République démocratique du Congo", province: "Kinshasa", city: "Kinshasa", address: "Test" },
    brand: { primary_color: "#071a3d", accent_color: "#e9a515" },
  };
}

async function http(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 200) }; }
  return { status: response.status, body, cookie: response.headers.get("set-cookie") };
}

function fail(table, scenario, obtained, expected) {
  console.log("STOP_S4_SECURITY_FAILURE");
  console.log(`TABLE=${table}`);
  console.log(`SCENARIO=${scenario}`);
  console.log(`OBTAINED=${obtained}`);
  console.log(`EXPECTED=${expected}`);
  process.exitCode = 2;
  throw new Error("STOP_S4_SECURITY_FAILURE");
}

async function main() {
  const bootstrap = readSecret("bootstrap.txt");
  const roles = JSON.parse(fs.readFileSync(path.join(temp, "roles.json"), "utf8"));
  const anon = readSecret("anon.key");
  const passwordA = readSecret("admin-a.password");
  const passwordB = readSecret("admin-b.password");
  const supabaseUrl = "https://supabase.179-198-195-15.sslip.io";
  const db = new pg.Client({
    connectionString: `postgresql://schoolsafe_bootstrap:${encodeURIComponent(bootstrap)}@127.0.0.1:55441/schoolsafe_test_s4`,
  });
  await db.connect();
  const server = spawn(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "src/index.ts"], {
    cwd: path.join(root, "server"),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "test",
      PGHOST: "127.0.0.1",
      PGPORT: "55441",
      PGDATABASE: "schoolsafe_test_s4",
      PGUSER: "schoolsafe_api",
      PGPASSWORD: roles.api,
      PGAUTH_USER: "schoolsafe_auth",
      PGAUTH_PASSWORD: roles.auth,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: anon,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (chunk) => { serverLog += chunk; });
  server.stderr.on("data", (chunk) => { serverLog += chunk; });
  const stopServer = () => { if (!server.killed) server.kill(); };
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 40; i += 1) {
      try {
        const health = await http(`${base}/health`);
        if (health.status === 200) break;
      } catch { /* retry */ }
      if (i === 39) throw new Error(`STOP_S4: SERVER_NOT_READY ${serverLog.slice(-400)}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    async function login(email, password) {
      const result = await http(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: anon, "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (result.status !== 200 || !result.body?.access_token) {
        throw new Error(`STOP_S4: SUPABASE_LOGIN_${result.status}`);
      }
      return result.body.access_token;
    }
    const tokenA = await login(emailA, passwordA);
    const tokenB = await login(emailB, passwordB);
    console.log("REAL_SUPABASE_AUTH_USED=YES");
    async function exchange(token, body) {
      return http(`${base}/auth/native/supabase/exchange`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    const linkedA = await exchange(tokenA);
    const linkedB = await exchange(tokenB);
    async function createSchool(token, name, extra = {}) {
      return http(`${base}/auth/native/supabase/school`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...schoolBody(name), ...extra }),
      });
    }
    async function ensureSchool(token, email, name, linked) {
      if (linked.body?.status === "onboarding_required") {
        const created = await createSchool(token, name);
        if (created.status !== 201) throw new Error(`STOP_S4: SCHOOL_CREATE ${created.status} ${created.body?.code ?? ""}`);
        return { school_id: created.body.school_id, profile_id: created.body.profile_id };
      }
      if (linked.body?.status !== "password_change_required") {
        throw new Error(`STOP_S4: LINK ${linked.status}:${linked.body?.code ?? linked.body?.status ?? ""}`);
      }
      const found = await db.query(
        `select p.id as profile_id, p.school_id
           from iam.users u join iam.profiles p on p.user_id = u.id
          where lower(u.email) = lower($1)`,
        [email],
      );
      if (found.rows.length !== 1) throw new Error(`STOP_S4: PROFILE_COUNT ${found.rows.length}`);
      return found.rows[0];
    }
    const readyA = await ensureSchool(tokenA, emailA, "Ecole A S4", linkedA);
    const readyB = await ensureSchool(tokenB, emailB, "Ecole B S4", linkedB);
    const schoolA = readyA.school_id;
    const schoolB = readyB.school_id;
    const profileA = readyA.profile_id;
    const profileB = readyB.profile_id;
    const owners = await db.query("select id, user_id, school_id from iam.profiles where id = any($1::uuid[])", [[profileA, profileB]]);
    const userA = owners.rows.find((row) => row.id === profileA)?.user_id;
    const userB = owners.rows.find((row) => row.id === profileB)?.user_id;
    if (!schoolA || !schoolB || schoolA === schoolB || profileA === profileB || !userA || !userB || userA === userB) {
      throw new Error("STOP_S4: SCHOOL_IDENTITY_NOT_DISTINCT");
    }
    console.log("SCHOOL_A_CREATED=YES");
    console.log("SCHOOL_B_CREATED=YES");
    console.log(`ADMIN_A=${emailA}`);
    console.log(`ADMIN_B=${emailB}`);

    const exchangeForged = await http(`${base}/auth/native/supabase/exchange`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
      body: JSON.stringify({ school_id: schoolB, profile_id: profileB, user_id: userB }),
    });
    if (exchangeForged.cookie || exchangeForged.body?.school_id || exchangeForged.body?.profile_id) {
      fail("api.auth_link_supabase_principal", "exchange body carries school B", JSON.stringify(exchangeForged.body), "password_change_required without school");
    }
    if (exchangeForged.status !== 200 || exchangeForged.body?.status !== "password_change_required") {
      fail("api.auth_resolve_session", "exchange after first profile", `${exchangeForged.status} ${exchangeForged.body?.status}`, "password_change_required");
    }
    const me = await http(`${base}/auth/native/me`);
    if (me.status === 200) fail("/auth/native/me", "no cookie after password gate", String(me.status), "401");
    const forgedSchool = await createSchool(tokenA, "Ecole forgee", { school_id: schoolB, profile_id: profileB, user_id: userB });
    if (forgedSchool.status !== 400) {
      fail("/auth/native/supabase/school", "client school_id profile_id user_id", String(forgedSchool.status), "400");
    }
    const garbage = await http(`${base}/auth/native/supabase/exchange`, {
      method: "POST",
      headers: { authorization: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4Iiwic2Nob29sX2lkIjoiZm9yZ2VkIn0.x", "content-type": "application/json" },
      body: JSON.stringify({ school_id: schoolB }),
    });
    if (garbage.status !== 401) fail("supabase verifier", "unsigned jwt with school_id", String(garbage.status), "401");
    console.log("PASSWORD_GATE_TEST=PASS");
    console.log("JWT_SCHOOL_ID_TRUSTED=NO");
    console.log("CLIENT_SCHOOL_ID_TRUSTED=NO");
    console.log("CLIENT_PROFILE_ID_TRUSTED=NO");
    console.log("CLIENT_USER_ID_TRUSTED=NO");

    const second = await createSchool(tokenA, "Ecole A bis");
    if (second.status === 201) fail("api.auth_supabase_principal_create_school", "second bootstrap school", "201", "409");
    await db.query("begin");
    await db.query("grant usage on schema auth to schoolsafe_auth");
    await db.query("grant execute on function auth.supabase_principal_bootstrap_allows(uuid) to schoolsafe_auth");
    await db.query("set local session authorization schoolsafe_auth");
    const allows = await db.query("select auth.supabase_principal_bootstrap_allows($1::uuid) as allowed", [schoolA]);
    await db.query("rollback");
    if (allows.rows[0].allowed !== false) fail("auth.supabase_principal_bootstrap_allows", "after first profile", String(allows.rows[0].allowed), "false");
    console.log("BOOTSTRAP_REUSABLE=NO");

    const planted = crypto.randomBytes(32).toString("hex");
    await db.query(
      `insert into auth.sessions (identity_id, profile_id, token_hash, expires_at)
       select i.id, $2::uuid, $3, now() + interval '5 minutes'
         from auth.identities i where i.user_id = $1::uuid limit 1`,
      [userA, profileA, planted],
    );
    const resolved = await db.query("select school_id, must_change from api.auth_resolve_session($1)", [planted]);
    if (resolved.rows.length !== 1 || resolved.rows[0].must_change !== true || resolved.rows[0].school_id !== schoolA) {
      fail("api.auth_resolve_session", "planted session while must_change_password", JSON.stringify(resolved.rows), "one row must_change true school A");
    }

    const force = await db.query(`
      select n.nspname || '.' || c.relname as name, c.relforcerowsecurity as force
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'school_id' and a.attnum > 0 and not a.attisdropped
       where c.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema')
       order by 1
    `);
    const missingForce = force.rows.filter((row) => row.force !== true);
    if (missingForce.length) fail(missingForce.map((row) => row.name).join(","), "FORCE RLS", "off", "on");
    console.log("FORCE_RLS_ENABLED=YES");
    console.log(`TABLES_WITH_SCHOOL_ID=${force.rows.length}`);

    const yearA = (await db.query("select id from app.academic_years where school_id = $1", [schoolA])).rows[0].id;
    const yearB = (await db.query("select id from app.academic_years where school_id = $1", [schoolB])).rows[0].id;
    const suffix = crypto.randomBytes(4).toString("hex");
    async function put(school, year, user, profile, tag) {
      const student = (await db.query(
        `insert into app.students (school_id, matricule, first_name, last_name, lifecycle_status)
         values ($1, $2, $3, 'S4', 'active') returning id`,
        [school, `s4-${tag}-${suffix}`, tag],
      )).rows[0].id;
      const guardian = (await db.query(
        `insert into app.student_guardians (school_id, student_id, guardian_type, full_name)
         values ($1, $2, 'tuteur', $3) returning id`,
        [school, student, tag],
      )).rows[0].id;
      const classId = (await db.query(
        "insert into app.classes (school_id, cycle_key, name) values ($1, 'primary', $2) returning id",
        [school, tag],
      )).rows[0].id;
      const rows = {
        "app.students": student,
        "app.student_guardians": guardian,
        "app.classes": classId,
      };
      const inserts = [
        ["app.alerts", `insert into app.alerts (school_id, source_module, alert_type, severity, title, message) values ($1,'s4','s4','info',$2,'s4') returning id`, [school, tag]],
        ["app.subjects", `insert into app.subjects (school_id, academic_year_id, code, name) values ($1,$2,$3,$4) returning id`, [school, year, `S4${tag}${suffix}`, tag]],
        ["app.fee_structures", `insert into app.fee_structures (school_id, academic_year_id, label, amount) values ($1,$2,$3,10) returning id`, [school, year, tag]],
        ["app.student_enrollments", `insert into app.student_enrollments (school_id, student_id, class_id, status, starts_on) values ($1,$2,$3,'active','2026-09-01') returning id`, [school, student, classId]],
        ["app.pickup_authorizations", `insert into app.pickup_authorizations (school_id, student_id, guardian_id, slot_no) values ($1,$2,$3,1) returning id`, [school, student, guardian]],
        ["app.student_emergency_contacts", `insert into app.student_emergency_contacts (school_id, student_id, slot_no, full_name, relation, phone) values ($1,$2,1,$3,'tuteur','+243810000001') returning id`, [school, student, tag]],
        ["app.student_health_profiles", `insert into app.student_health_profiles (student_id, school_id) values ($1,$2) returning student_id`, [student, school]],
        ["app.student_cards", `insert into app.student_cards (school_id, student_id, card_number, card_secret, signature) values ($1,$2,$3,'s4','s4') returning id`, [school, student, `card-${tag}-${suffix}`]],
        ["app.documents", `insert into app.documents (school_id, academic_year_id, type_code, sequence_number, document_code, created_by) values ($1,$2,'S4',1,$3,$4) returning id`, [school, year, `DOC-${tag}-${suffix}`, user]],
        ["devicehub.devices", `insert into devicehub.devices (school_id, code, vendor, model, serial_number) values ($1,$2,'s4','s4',$3) returning id`, [school, `dev-${tag}-${suffix}`, `ser-${tag}-${suffix}`]],
      ];
      for (const [table, sql, params] of inserts) {
        try {
          if (table === "app.student_cards") {
            await db.query("begin");
            await db.query("select api.set_request_context($1::uuid, $2::uuid, $3::uuid, gen_random_uuid())", [user, profile, school]);
          }
          const inserted = await db.query(sql, params);
          if (table === "app.student_cards") await db.query("commit");
          rows[table] = inserted.rows[0].id ?? inserted.rows[0].student_id;
        } catch (error) {
          if (table === "app.student_cards") await db.query("rollback");
          throw new Error(`STOP_S4: FIXTURE ${table} ${error.message}`);
        }
      }
      rows["app.schools"] = school;
      rows["iam.profiles"] = null;
      rows["iam.roles"] = (await db.query("select id from iam.roles where school_id = $1 and code = 'admin'", [school])).rows[0].id;
      rows["iam.role_permission_grants"] = (await db.query("select id from iam.role_permission_grants where school_id = $1 limit 1", [school])).rows[0].id;
      rows["app.school_settings"] = school;
      return rows;
    }
    const rowsA = await put(schoolA, yearA, userA, profileA, "A");
    const rowsB = await put(schoolB, yearB, userB, profileB, "B");
    rowsA["iam.profiles"] = profileA;
    rowsB["iam.profiles"] = profileB;

    const probes = [
      ["app.schools", "id", "name"],
      ["iam.profiles", "id", "display_name"],
      ["iam.roles", "id", "label"],
      ["iam.role_permission_grants", "id", "reason"],
      ["app.school_settings", "school_id", "lockdown_active"],
      ["app.students", "id", "first_name"],
      ["app.student_enrollments", "id", "status"],
      ["app.student_guardians", "id", "full_name"],
      ["app.pickup_authorizations", "id", "status"],
      ["app.student_emergency_contacts", "id", "full_name"],
      ["app.student_health_profiles", "student_id", "medical_notes"],
      ["app.fee_structures", "id", "label"],
      ["app.classes", "id", "name"],
      ["app.subjects", "id", "name"],
      ["app.student_cards", "id", "card_number"],
      ["app.documents", "id", "document_code"],
      ["app.alerts", "id", "title"],
      ["devicehub.devices", "id", "code"],
    ];

    async function withContext(user, profile, school, fn) {
      await db.query("begin");
      await db.query("set local role schoolsafe_owner");
      await db.query("select set_config('schoolsafe.preauth', 'off', true), set_config('schoolsafe.recovery_preauth', 'off', true)");
      await db.query("select api.set_request_context($1::uuid, $2::uuid, $3::uuid, gen_random_uuid())", [user, profile, school]);
      try {
        const value = await fn();
        await db.query("commit");
        return value;
      } catch (error) {
        await db.query("rollback");
        throw error;
      }
    }
    async function visible(user, profile, school, table, key, id) {
      return withContext(user, profile, school, async () => {
        const result = await db.query(`select count(*)::int as n from ${table} where ${key} = $1`, [id]);
        return result.rows[0].n;
      });
    }
    async function writeOwn(user, profile, school, table, column, key, id, value) {
      return withContext(user, profile, school, async () => {
        const result = await db.query(`update ${table} set ${column} = $2 where ${key} = $1`, [id, value]);
        return result.rowCount;
      });
    }

    for (const [table, key, column] of probes) {
      const readAA = await visible(userA, profileA, schoolA, table, key, rowsA[table]);
      const readAB = await visible(userA, profileA, schoolA, table, key, rowsB[table]);
      const readBB = await visible(userB, profileB, schoolB, table, key, rowsB[table]);
      const readBA = await visible(userB, profileB, schoolB, table, key, rowsA[table]);
      if (readAA !== 1 || readBB !== 1) fail(table, "legitimate read", `A${readAA} B${readBB}`, "1");
      if (readAB !== 0 || readBA !== 0) fail(table, "cross-school read", `AB${readAB} BA${readBA}`, "0");
      if (column !== "school_id") {
        const valueFor = (column, tag) => column === "lockdown_active" ? false : column === "status" ? "active" : `${tag}-${suffix}`;
        const crossValue = column === "lockdown_active" ? true : column === "status" ? "active" : `LEAK-${suffix}`;
        const own = await writeOwn(userA, profileA, schoolA, table, column, key, rowsA[table], valueFor(column, "S4A"));
        const cross = await writeOwn(userA, profileA, schoolA, table, column, key, rowsB[table], crossValue);
        const ownB = await writeOwn(userB, profileB, schoolB, table, column, key, rowsB[table], valueFor(column, "S4B"));
        const crossB = await writeOwn(userB, profileB, schoolB, table, column, key, rowsA[table], crossValue);
        if (own !== 1 || ownB !== 1) fail(table, "legitimate update", `A${own} B${ownB}`, "1");
        if (cross !== 0 || crossB !== 0) fail(table, "cross-school update", `AB${cross} BA${crossB}`, "0");
        const deleted = await withContext(userA, profileA, schoolA, async () => {
          const result = await db.query(`delete from ${table} where ${key} = $1`, [rowsB[table]]);
          return result.rowCount;
        });
        if (deleted !== 0) fail(table, "cross-school delete", String(deleted), "0");
        const still = await db.query(`select count(*)::int as n from ${table} where ${key} = $1`, [rowsB[table]]);
        if (still.rows[0].n !== 1) fail(table, "row of B after cross delete", String(still.rows[0].n), "1");
      }
    }
    await db.query("begin");
    await db.query("set local role schoolsafe_owner");
    await db.query("select api.set_request_context($1::uuid, $2::uuid, $3::uuid, gen_random_uuid())", [userA, profileA, schoolA]);
    let forgedInsert = "rejected";
    try {
      await db.query("insert into app.students (school_id, matricule, first_name, last_name) values ($1, $2, 'Forge', 'B')", [schoolB, `forge-${suffix}`]);
      forgedInsert = "inserted";
    } catch (error) {
      forgedInsert = error.code ?? error.message;
    }
    await db.query("rollback");
    const forgedCount = await db.query("select count(*)::int as n from app.students where school_id = $1 and first_name = 'Forge'", [schoolB]);
    if (forgedCount.rows[0].n !== 0) fail("app.students", "insert with school_id of B", forgedInsert, "rejected and zero rows in B");
    console.log("READ_A_TO_A=PASS");
    console.log("READ_A_TO_B=REFUSED");
    console.log("WRITE_A_TO_A=PASS");
    console.log("WRITE_A_TO_B=REFUSED");
    console.log("READ_B_TO_B=PASS");
    console.log("READ_B_TO_A=REFUSED");
    console.log("WRITE_B_TO_B=PASS");
    console.log("WRITE_B_TO_A=REFUSED");

    async function contextRefused(user, profile, school) {
      await db.query("begin");
      await db.query("set local role schoolsafe_owner");
      const result = await db.query(`
        do $t$
        begin
          perform api.set_request_context('${user}'::uuid, '${profile}'::uuid, '${school}'::uuid, gen_random_uuid());
          raise exception 'accepted';
        exception when insufficient_privilege then
          if iam.current_school_id() is not null then
            raise exception 'context leaked %', iam.current_school_id();
          end if;
        end
        $t$;
      `);
      await db.query("rollback");
      return result;
    }
    await contextRefused(userA, profileB, schoolB);
    await contextRefused(userA, profileA, schoolB);
    await contextRefused(userB, profileA, schoolA);
    console.log("SET_REQUEST_CONTEXT_CROSS_SCHOOL=REFUSED");

    const secondProfile = crypto.randomUUID();
    await db.query(
      `insert into iam.profiles (id, user_id, school_id, display_name, is_active)
       values ($1, $2, $3, 'A dans B', true)`,
      [secondProfile, userA, schoolB],
    );
    await db.query(
      `insert into iam.profile_roles (school_id, profile_id, role_id)
       select $1, $2, id from iam.roles where school_id = $1 and code = 'parent'`,
      [schoolB, secondProfile],
    );
    const stillHidden = await visible(userA, profileA, schoolA, "app.students", "id", rowsB["app.students"]);
    const switched = await visible(userA, secondProfile, schoolB, "app.students", "id", rowsB["app.students"]);
    const switchedAway = await visible(userA, secondProfile, schoolB, "app.students", "id", rowsA["app.students"]);
    if (stillHidden !== 0 || switched !== 1 || switchedAway !== 0) {
      fail("iam.profiles", "legitimate second profile", `hidden ${stillHidden} switched ${switched} away ${switchedAway}`, "0 / 1 / 0");
    }
    await contextRefused(userA, profileA, schoolB);
    console.log("MULTI_PROFILE_SWITCH=PASS");
    console.log(`TABLES_TESTED=${probes.map((row) => row[0]).join(",")}`);
    console.log("SECURITY_LEAK_FOUND=NO");
    console.log("S4_SUITE_PASS");
  } finally {
    stopServer();
    await db.end().catch(() => {});
  }
}

main().catch((error) => {
  if (!process.exitCode) process.exitCode = 1;
  if (!String(error.message).includes("STOP_S4")) console.error(`STOP_S4: ${error.message}`);
  else if (process.exitCode !== 2) console.error(error.message);
});
