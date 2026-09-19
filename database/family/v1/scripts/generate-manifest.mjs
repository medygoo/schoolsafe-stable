import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const familyDir = path.resolve(scriptsDir, "..");

const files = ["01_pickup_authorizations.sql", "02_primary_transfer.sql", "03_pickup_confirmation.sql", "04_student_import.sql"];
const units = await Promise.all(files.map(async (file, index) => {
  const bytes = await readFile(path.join(familyDir, file));
  return {
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  };
}));
const manifest = {
  family_version: "schoolsafe-family-v1",
  requires_baseline: "schoolsafe-vps-v1",
  units,
};

await mkdir(path.join(familyDir, "tests"), { recursive: true });
await writeFile(
  path.join(familyDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
await writeFile(
  path.join(familyDir, "manifest.sha256"),
  `${units.map(u => `${u.sha256}  ${u.file}`).join("\n")}\n`,
  "utf8",
);
console.log(`Wrote deterministic checksums for ${units.length} family units.`);