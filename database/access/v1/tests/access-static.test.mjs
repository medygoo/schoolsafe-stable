import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const accessDir = path.resolve(here, "..");

async function readUnit(name) {
  return readFile(path.join(accessDir, name), "utf8");
}

// La matrice vit dans une constante jsonb unique : on l'extrait et on la parse.
async function matrix() {
  const sql = await readUnit("01_role_templates.sql");
  const match = sql.match(/v_matrix jsonb := '(\{[\s\S]*?\})'::jsonb;/);
  assert.ok(match, "constante v_matrix introuvable");
  return JSON.parse(match[1]);
}

test("access units are atomic and stop on error", async () => {
  for (const name of ["01_role_templates.sql", "02_provision_bridge.sql"]) {
    const sql = await readUnit(name);
    assert.match(sql, /\\set ON_ERROR_STOP on/);
    assert.equal((sql.match(/^begin;$/gim) ?? []).length, 1);
    assert.equal((sql.match(/^commit;$/gim) ?? []).length, 1);
  }
});

test("teacher: grade.read = assigned_classes, jamais own_children", async () => {
  const m = await matrix();
  const teacher = Object.fromEntries(m.teacher.map((r) => [r[0], r]));
  assert.equal(teacher["pedagogy.grade.read"][1], "assigned_classes");
  assert.equal(teacher["palmarques.read"][1], "assigned_classes");
  assert.equal(teacher["school.guardian.read"][1], "assigned_classes");
  assert.ok(m.teacher.every((r) => r[1] !== "own_children"));
});

test("parent: tout est own_children, sans exception", async () => {
  const m = await matrix();
  for (const code of ["pedagogy.grade.read", "palmarques.read", "finance.status.read", "finance.receipt.read", "security.pickup.read", "school.guardian.read"]) {
    const row = m.parent.find((r) => r[0] === code);
    assert.ok(row, `${code} absent du parent`);
    assert.equal(row[1], "own_children", `${code} doit être own_children`);
  }
});

test("guard: tout est assigned_portal", async () => {
  const m = await matrix();
  const scan = m.guard.find((r) => r[0] === "security.scan");
  assert.equal(scan[1], "assigned_portal");
  const events = m.guard.find((r) => r[0] === "security.events.read");
  assert.equal(events[1], "assigned_portal");
  assert.ok(m.guard.every((r) => r[1] === "assigned_portal" || ["none", "own"].includes(r[1])));
});

test("cashier: finance en school + annulation conditionnée 24h", async () => {
  const m = await matrix();
  const cashier = Object.fromEntries(m.cashier.map((r) => [r[0], r]));
  assert.equal(cashier["finance.status.read"][1], "school");
  assert.equal(cashier["finance.fee.read"][1], "school");
  assert.equal(cashier["finance.payment.cancel"][2], "within_cancellation_window");
  assert.deepEqual(cashier["finance.payment.cancel"][3], { max_age_hours: 24 });
});

test("direction et pedagogy: aucune portée own_children accidentelle", async () => {
  const m = await matrix();
  for (const role of ["school_head", "pedagogy"]) {
    assert.ok(m[role].every((r) => r[1] !== "own_children"), `${role} ne doit rien borner à own_children`);
    const gradeRead = m[role].find((r) => r[0] === "pedagogy.grade.read");
    if (gradeRead) assert.equal(gradeRead[1], "school");
  }
});

test("admin: snapshot figé des 63 codes explicites, aucune jointure aveugle", async () => {
  const sql = await readUnit("01_role_templates.sql");
  assert.doesNotMatch(sql, /cross join iam\.permissions/i);
  const m = await matrix();
  assert.equal(m.admin.length, 63, "admin doit figer exactement 63 permissions explicites");
  assert.ok(m.admin.some((r) => r[0] === "school.student.create"));
});

test("les quatre rôles manquants existent avec leurs matrices", async () => {
  const m = await matrix();
  for (const role of ["fee_control", "hr", "staff", "hikvision_admin"]) {
    assert.ok(Array.isArray(m[role]) && m[role].length >= 6, `${role} doit avoir au moins le bloc commun`);
  }
});

test("aucune permission future inventée (biométrie, audit.read)", async () => {
  const sql = await readUnit("01_role_templates.sql");
  assert.doesNotMatch(sql, /biometric\./i);
  assert.doesNotMatch(sql, /"audit\.read"/);
});

test("rejeu autoritaire: upsert des portées/conditions + suppression des obsolètes", async () => {
  const sql = await readUnit("01_role_templates.sql");
  assert.match(sql, /on conflict \(template_id, permission_id\) do update/);
  assert.match(sql, /delete from iam\.role_template_grants/);
  assert.match(sql, /jsonb_array_elements\(v_matrix -> v_role\)/);
});

test("référence: ENABLE RLS sans FORCE et sans policy (chemin owner definer préservé)", async () => {
  const sql = await readUnit("01_role_templates.sql");
  assert.match(sql, /no force row level security/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /(?<!no )force row level security/i);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /grant\s+\w+[\s\S]{0,80}on iam\.role_template/i);
});

test("le pont de provisioning est gouverné par Access_Law et audité", async () => {
  const sql = await readUnit("02_provision_bridge.sql");
  assert.match(sql, /iam\.require_access\('roles\.manage'\)/);
  assert.match(sql, /p_school_id <> v_school_id/);
  assert.match(sql, /audit\.write_event\(\s*'school\.roles\.provisioned'/);
  assert.match(sql, /insert into iam\.grant_scopes/);
  assert.match(sql, /insert into iam\.permission_conditions/);
  assert.match(sql, /grant execute on function api\.school_provision_roles\(uuid\) to schoolsafe_api/);
  assert.doesNotMatch(sql, /to public/i);
});

test("le rejeu au niveau école est autoritaire (sync + suppression stricte)", async () => {
  const sql = await readUnit("02_provision_bridge.sql");
  assert.match(sql, /update iam\.role_permission_grants/);
  assert.match(sql, /delete from iam\.grant_scopes where grant_id/);
  assert.match(sql, /delete from iam\.permission_conditions where grant_id/);
  assert.match(sql, /delete from iam\.role_permission_grants g[\s\S]*?not exists/);
});

test("bootstrap réservé à la session de migration, jamais aux rôles runtime", async () => {
  const sql = await readUnit("02_provision_bridge.sql");
  assert.match(sql, /session_user <> 'schoolsafe_migrator'/);
  assert.match(sql, /ops\.bootstrap_school/);
  assert.doesNotMatch(sql, /grant execute on function api\.school_bootstrap/);
  assert.doesNotMatch(sql, /require_access\('session\.bootstrap'\)/);
});

test("fee control utilise une portée métier isolée des enseignants", async () => {
  const m = await matrix();
  assert.equal(m.fee_control.find(r => r[0] === 'finance.control.scan')[1], 'assigned_fee_classes');
});

test("les grants pédagogiques reçoivent la paire classe+matière (règle Enseignant)", async () => {
  const sql = await readUnit("02_provision_bridge.sql");
  assert.match(sql, /'assigned_subjects', null/);
  assert.match(sql, /like 'pedagogy\.%'/);
});

test("native SQL uses only canonical finance, pedagogy and cards codes", async () => {
  const files = [
    "../../../finance/v1/01_finance_native.sql",
    "../../../finance/v1/02_finance_full.sql",
    "../../../pedagogy/v1/01_pedagogy_native.sql",
    "../../../cards/v1/01_cards_native.sql",
    "../../../cards/v1/02_cards_classes.sql",
  ];
  const legacy = /'(finance\.(?:fees|payments|reports|cashier|fee_control)|pedagogy\.(?:classes|subjects|assignments|grades|lessons|rankings)|cards\.print\.request)(?:\.[a-z_]+)?'/;
  for (const relative of files) {
    const sql = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(sql, legacy, relative);
  }
});
