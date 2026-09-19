import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const licenseDir = path.resolve(scriptsDir, "..");

const units = ["01_license.sql"];

const manifestUnits = [];
for (const [index, file] of units.entries()) {
  const bytes = await readFile(path.join(licenseDir, file));
  manifestUnits.push({
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  });
}

const manifest = {
  license_version: "schoolsafe-license-v1",
  requires_baseline: "schoolsafe-vps-v1",
  authority: "SchoolSafe Control signe (Ed25519) ; le backend revérifie chaque lecture ; fail-closed partout",
  units: manifestUnits,
};

await writeFile(path.join(licenseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  path.join(licenseDir, "manifest.sha256"),
  `${manifestUnits.map(({ sha256, file }) => `${sha256}  ${file}`).join("\n")}\n`,
  "utf8",
);

console.log(`Wrote deterministic checksums for ${manifestUnits.length} license units.`);
