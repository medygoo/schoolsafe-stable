import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.resolve(scriptsDir, "..");

const units = ["01_auth_tables.sql", "02_auth_api.sql"];

const manifestUnits = [];
for (const [index, file] of units.entries()) {
  const bytes = await readFile(path.join(authDir, file));
  manifestUnits.push({
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  });
}

const manifest = {
  auth_version: "schoolsafe-auth-v1",
  requires_baseline: "schoolsafe-vps-v1",
  target: "one SchoolSafe database per environment (TEST/PROD); schools share it with mandatory school_id isolation",
  units: manifestUnits,
};

await writeFile(
  path.join(authDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

await writeFile(
  path.join(authDir, "manifest.sha256"),
  `${manifestUnits.map(({ sha256, file }) => `${sha256}  ${file}`).join("\n")}\n`,
  "utf8",
);

console.log(`Wrote deterministic checksums for ${manifestUnits.length} auth units.`);
