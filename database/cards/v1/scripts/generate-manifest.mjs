import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Sql } from "../../../../scripts/migration-manifest.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const cardsDir = path.resolve(scriptsDir, "..");

const files = ["01_cards_native.sql", "02_cards_classes.sql", "03_cards_lifecycle.sql"];
const units = await Promise.all(files.map(async (file, index) => {
  const bytes = await readFile(path.join(cardsDir, file));
  return {
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  };
}));
const manifest = {
  cards_version: "schoolsafe-cards-v1",
  requires_baseline: "schoolsafe-vps-v1",
  units,
};

await writeFile(
  path.join(cardsDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

await writeFile(
  path.join(cardsDir, "manifest.sha256"),
  `${units.map(({ sha256, file }) => `${sha256}  ${file}`).join("\n")}\n`,
  "utf8",
);

console.log(`Wrote deterministic checksums for ${units.length} cards units.`);
