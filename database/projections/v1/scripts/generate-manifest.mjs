import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projDir = path.resolve(scriptsDir, "..");

const units = ["01_student_read.sql", "02_session_bootstrap.sql", "03_access_read.sql", "04_access_assignment_views.sql", "05_session_validity.sql", "07_targeted_denies.sql", "08_session_denial_contract.sql"];

const manifestUnits = [];
for (const [index, file] of units.entries()) {
  const bytes = await readFile(path.join(projDir, file));
  manifestUnits.push({
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  });
}

const manifest = {
  projections_version: "schoolsafe-projections-v1",
  requires_baseline: "schoolsafe-vps-v1",
  target: "one SchoolSafe database per environment (TEST/PROD); filtered reads only via api.*",
  units: manifestUnits,
};

await writeFile(path.join(projDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  path.join(projDir, "manifest.sha256"),
  `${manifestUnits.map(({ sha256, file }) => `${sha256}  ${file}`).join("\n")}\n`,
  "utf8",
);

console.log(`Wrote deterministic checksums for ${manifestUnits.length} projection units.`);
