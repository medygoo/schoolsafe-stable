import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function listSqlFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["tests", "scripts", "review", "node_modules"].includes(entry.name)) {
        await listSqlFiles(full, out);
      }
    } else if (entry.name.endsWith(".sql") && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

// Exceptions justifiées : le prédicat EST la frontière d'école.
// - 02_provision_bridge.sql : provisionne app.schools elle-même
//   (insert ... values(v_school, ...) / update ... where id = v_school).
const ALLOWLIST = [
  { file: "database/access/v1/02_provision_bridge.sql", reason: "provisioning de l'école : le prédicat id = v_school est la frontière" },
];

test("aucune requête métier app.* sans contrainte school_id (sweep dépôt)", async () => {
  const files = await listSqlFiles(path.join(repoRoot, "database"));
  assert.ok(files.length >= 30, "sweep incomplet : trop peu de fichiers SQL");
  const failures = [];
  for (const file of files) {
    const relative = path.relative(repoRoot, file).replaceAll("\\", "/");
    const sql = await readFile(file, "utf8");
    const statements = sql
      .split(";")
      .filter((s) => /\b(from|join|update|into)\s+app\./i.test(s) && !/^\s*create table/i.test(s));
    const bad = statements.filter((s) => !/school_id/i.test(s));
    for (const statement of bad) {
      const allowed = ALLOWLIST.some((a) => a.file === relative);
      if (!allowed) {
        failures.push(`${relative} → ${statement.trim().slice(0, 120).replace(/\s+/g, " ")}`);
      }
    }
  }
  assert.deepEqual(failures, [], `requêtes métier sans school_id :\n${failures.join("\n")}`);
});
