import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(scriptsDir, "..");

const files = ["01_devicehub_core.sql", "02_devicehub_rpc.sql", "03_attendance.sql"];
const units = await Promise.all(files.map(async (file, index) => {
  const bytes = await readFile(path.join(dir, file));
  return { order: index + 1, name: path.basename(file, ".sql").slice(3), file, sha256: sha256Sql(bytes) };
}));
const manifest = { devicehub_version: "schoolsafe-devicehub-v1", requires_baseline: "schoolsafe-vps-v1", units };
await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(path.join(dir, "manifest.sha256"), `${units.map(u => `${u.sha256}  ${u.file}`).join("\n")}\n`, "utf8");
console.log(`Wrote deterministic checksums for ${units.length} devicehub units.`);