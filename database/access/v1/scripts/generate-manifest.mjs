import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const accessDir = path.resolve(scriptsDir, "..");

const units = ["01_role_templates.sql", "02_provision_bridge.sql", "03_control_context.sql", "04_role_assignments.sql", "05_custom_roles.sql"];

const manifestUnits = [];
for (const [index, file] of units.entries()) {
  const bytes = await readFile(path.join(accessDir, file));
  manifestUnits.push({
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  });
}

const manifest = {
  access_version: "schoolsafe-access-v1",
  requires_baseline: "schoolsafe-vps-v1",
  target: "one SchoolSafe database per environment (TEST/PROD); role templates are global reference data",
  units: manifestUnits,
};

await writeFile(
  path.join(accessDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

await writeFile(
  path.join(accessDir, "manifest.sha256"),
  `${manifestUnits.map(({ sha256, file }) => `${sha256}  ${file}`).join("\n")}\n`,
  "utf8",
);

console.log(`Wrote deterministic checksums for ${manifestUnits.length} access units.`);
