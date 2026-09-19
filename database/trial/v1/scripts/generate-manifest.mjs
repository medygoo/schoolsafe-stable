import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const trialDir = path.resolve(scriptsDir, "..");

const units = ["01_trial.sql"];

const manifestUnits = [];
for (const [index, file] of units.entries()) {
  const bytes = await readFile(path.join(trialDir, file));
  manifestUnits.push({
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  });
}

const manifest = {
  trial_version: "schoolsafe-trial-v1",
  requires_baseline: "schoolsafe-vps-v1",
  constants: { trial_days: 14, grace_days: 7 },
  arbitration: "A1 conversion en place ; B1 grâce puis suppression (suppression = action opérateur, jamais automatique en v1)",
  units: manifestUnits,
};

await writeFile(path.join(trialDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  path.join(trialDir, "manifest.sha256"),
  `${manifestUnits.map(({ sha256, file }) => `${sha256}  ${file}`).join("\n")}\n`,
  "utf8",
);

console.log(`Wrote deterministic checksums for ${manifestUnits.length} trial units.`);
