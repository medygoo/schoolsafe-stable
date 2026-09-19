const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const stylesheets = [
  "styles/screens/entry.css",
  "styles.css",
  "styles/design-tokens.css",
  "styles/components.css",
  "styles/dashboard.css",
  "styles/modules/pedagogy.css",
  "styles/modules/school.css",
  "styles/modules/security.css",
  "styles/modules/pilotage.css",
  "modules/safe/safe-assistant.css",
  "modules/cards/assets/cards.css",
];

function undersizedDeclarations(file, css) {
  const declarations = [];
  const expression = /font-size:\s*([\d.]+)(px|rem)/g;
  let match;

  while ((match = expression.exec(css))) {
    const sizeInPixels = match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
    if (sizeInPixels < 12) {
      declarations.push(`${file}:${match[1]}${match[2]}`);
    }
  }

  return declarations;
}

function main() {
  const undersized = stylesheets.flatMap((file) => {
    const css = fs.readFileSync(path.join(__dirname, file), "utf8");
    return undersizedDeclarations(file, css);
  });

  assert.deepEqual(
    undersized,
    [],
    `Les CSS actifs ne doivent plus définir de texte fonctionnel sous 12px : ${undersized.join(", ")}`,
  );
  const globalStyles = [
    "styles.css",
    "styles/modules/pedagogy.css",
    "styles/modules/school.css",
    "styles/modules/security.css",
    "styles/modules/pilotage.css",
  ]
    .map((file) => fs.readFileSync(path.join(__dirname, file), "utf8"))
    .join("\n");

  assert.match(
    globalStyles,
    /\.workspace-screen \.workspace-content :is\([\s\S]*?p,[\s\S]*?li,[\s\S]*?td,[\s\S]*?th,[\s\S]*?label,[\s\S]*?input,[\s\S]*?select,[\s\S]*?textarea[\s\S]*?\)\s*\{[\s\S]*?font-size:\s*14px/,
    "Le contenu fonctionnel, les tableaux et les champs doivent atteindre 14px.",
  );
  assert.match(
    globalStyles,
    /\.workspace-nav :is\(button, \.workspace-back\),[\s\S]*?\.pedagogy-tabs:not\(\.finance-tabs\) button,[\s\S]*?\.pilotage-tabs button[\s\S]*?\{[\s\S]*?font-size:\s*14px/,
    "La navigation et les onglets desktop doivent atteindre 14px.",
  );
  assert.match(
    globalStyles,
    /\.workspace-screen \.workspace-content h3\s*\{[\s\S]*?font-size:\s*16px/,
    "Les titres de section doivent conserver une hiérarchie à 16px minimum.",
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 768px\) \{[\s\S]*?\.pedagogy-tabs:not\(\.finance-tabs\) button,[\s\S]*?\.pilotage-tabs button\s*\{[\s\S]*?font-size:\s*12px/,
    "Les onglets mobiles doivent rester à 12px minimum avec une stratégie responsive dédiée.",
  );
  console.log("UI-VIS-01 active typography floor: PASS");
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
