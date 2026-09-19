import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.resolve(scriptsDir, "..");

const units = [
  "01_roles.sql",
  "02_schemas.sql",
  "03_extensions.sql",
  "04_app_tables.sql",
  "05_iam.sql",
  "06_audit_ops.sql",
  "07_constraints_indexes.sql",
  "08_internal_functions.sql",
  "09_api_rpc.sql",
  "10_triggers.sql",
  "11_rls_acl.sql",
  "12_seed_permissions.sql",
  "13_verification.sql",
];

const manifestUnits = [];
for (const [index, file] of units.entries()) {
  const bytes = await readFile(path.join(baselineDir, file));
  manifestUnits.push({
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  });
}

const manifest = {
  baseline_version: "schoolsafe-vps-v1",
  postgres: {
    image: "postgres:17.11-bookworm",
    server_version_num: 170011,
  },
  target: "TEST only; from-zero database; no Cloud import",
  units: manifestUnits,
};

await writeFile(
  path.join(baselineDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

await writeFile(
  path.join(baselineDir, "manifest.sha256"),
  `${manifestUnits.map(({ sha256, file }) => `${sha256}  ${file}`).join("\n")}\n`,
  "utf8",
);

console.log(`Wrote deterministic checksums for ${manifestUnits.length} baseline units.`);
