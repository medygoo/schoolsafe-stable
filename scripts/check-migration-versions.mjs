import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "./migration-manifest.mjs";
import { installationInventory } from "./installation-inventory.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineVersion = "schoolsafe-vps-v1";
const sets = [
  { name: "baseline", versionKey: "baseline_version", version: baselineVersion },
  { name: "auth", versionKey: "auth_version", version: "schoolsafe-auth-v1", requiresBaseline: true },
  { name: "access", versionKey: "access_version", version: "schoolsafe-access-v1", requiresBaseline: true },
  { name: "finance", versionKey: "finance_version", version: "schoolsafe-finance-v1", requiresBaseline: true },
  { name: "pedagogy", versionKey: "pedagogy_version", version: "schoolsafe-pedagogy-v1", requiresBaseline: true },
  { name: "cards", versionKey: "cards_version", version: "schoolsafe-cards-v1", requiresBaseline: true },
  { name: "family", versionKey: "family_version", version: "schoolsafe-family-v1", requiresBaseline: true },
  { name: "devicehub", versionKey: "devicehub_version", version: "schoolsafe-devicehub-v1", requiresBaseline: true },
  { name: "dashboard", versionKey: "dashboard_version", version: "schoolsafe-dashboard-v1", requiresBaseline: true },
  { name: "license", versionKey: "license_version", version: "schoolsafe-license-v1", requiresBaseline: true },
  { name: "trial", versionKey: "trial_version", version: "schoolsafe-trial-v1", requiresBaseline: true },
  { name: "projections", versionKey: "projections_version", version: "schoolsafe-projections-v1", requiresBaseline: true },
];

let unitCount = 0;
for (const set of sets) {
  const directory = path.join(repoRoot, "database", set.name, "v1");
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  assert.equal(manifest[set.versionKey], set.version, `${set.name}: unexpected version`);
  if (set.requiresBaseline) {
    assert.equal(manifest.requires_baseline, baselineVersion, `${set.name}: baseline dependency mismatch`);
  }
  assert.ok(Array.isArray(manifest.units) && manifest.units.length > 0, `${set.name}: units missing`);

  const checksumLines = [];
  const seen = new Set();
  for (const [index, unit] of manifest.units.entries()) {
    assert.equal(unit.order, index + 1, `${set.name}: non-sequential order`);
    assert.match(unit.file, /^\d{2}_[a-z0-9_]+\.sql$/, `${set.name}: unsafe unit filename`);
    assert.equal(unit.name, path.basename(unit.file, ".sql").slice(3), `${set.name}: unit name mismatch`);
    assert.ok(!seen.has(unit.file), `${set.name}: duplicate unit ${unit.file}`);
    seen.add(unit.file);

    const bytes = await readFile(path.join(directory, unit.file));
    const digest = sha256Sql(bytes);
    assert.equal(digest, unit.sha256, `${set.name}: checksum mismatch for ${unit.file}`);
    checksumLines.push(`${digest}  ${unit.file}`);
    unitCount += 1;
  }

  const checksumFile = (await readFile(path.join(directory, "manifest.sha256"), "utf8"))
    .replace(/\r\n?/g, "\n")
    .trim();
  assert.equal(checksumFile, checksumLines.join("\n"), `${set.name}: manifest.sha256 mismatch`);
}

console.log(`Migration manifests: PASS (${sets.length} sets, ${unitCount} units)`);
const inventory = installationInventory(repoRoot);
assert.deepEqual(JSON.parse(await readFile(path.join(repoRoot, 'database/installation/manifest.json'), 'utf8')), inventory,
  'Installation inventory stale: run node database/installation/generate-manifest.mjs');
console.log('Installation inventory: PASS (46 units accounted for, 2 BLOCKED + 1 unqualified auth unit; not an executable installation)');
if (process.argv.includes('--require-installable')) {
  console.error('INSTALLATION_BLOCKED: 02_student_list.sql and 01_setup_native.sql require additive fixes; 03_auth_reset.sql requires separate qualification.');
  process.exitCode = 1;
}
