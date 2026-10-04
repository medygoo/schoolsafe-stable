import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Fondation locale Supabase Open Source (LOT S1).
// GoTrue a sa propre base. Ce contrôle refuse l'exposition des schémas
// métier SchoolSafe, l'inscription publique et tout secret versionné.
// Il ne démarre pas Supabase et ne contacte pas le VPS.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "supabase", "config.toml");
const supabaseDir = path.join(root, "supabase");
const failures = [];

function fail(message) {
  failures.push(message);
}

function stripComments(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)#.*$/, ""))
    .join("\n");
}

function assignment(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, "m"));
  return match ? match[1].trim() : null;
}

function quotedList(raw) {
  if (!raw) return [];
  return [...raw.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

if (!existsSync(configPath)) {
  fail(`config introuvable : ${path.relative(root, configPath)}`);
} else {
  const raw = readFileSync(configPath, "utf8");
  const source = stripComments(raw);

  const version = assignment(source, "major_version");
  if (version !== "17") {
    fail(`PostgreSQL major_version doit être 17, obtenu : ${version ?? "absent"}`);
  }

  const signups = [...source.matchAll(/enable_signup\s*=\s*(true|false)/g)].map((match) => match[1]);
  if (signups.length === 0 || signups.some((value) => value !== "false")) {
    fail(`inscription publique doit être désactivée partout, obtenu : ${signups.join(", ") || "absent"}`);
  }

  const schemas = quotedList(assignment(source, "schemas"));
  const searchPath = quotedList(assignment(source, "extra_search_path"));
  const schemaPaths = quotedList(assignment(source, "schema_paths"));
  const forbidden = new Set(["app", "iam", "api"]);
  for (const name of [...schemas, ...searchPath]) {
    if (forbidden.has(name)) fail(`schéma métier SchoolSafe exposé : ${name}`);
  }
  if (schemas.length === 0) fail("aucun schéma API déclaré");
  for (const schemaPath of schemaPaths) {
    if (/(^|\/)(database|app|iam|api)(\/|$)/.test(schemaPath)) {
      fail(`chemin de schéma métier interdit : ${schemaPath}`);
    }
  }

  if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(raw)) {
    fail("jeton versionné détecté");
  }
  if (/service[_-]?role[_-]?key\s*=\s*"[^"]+"/i.test(raw)) {
    fail("clé service-role versionnée");
  }
  if (/179\.198\.195\.15|185\.207\.250\.178|sslip\.io|\/opt\/schoolsafe/i.test(raw)) {
    fail("configuration VPS de production détectée");
  }
  const urls = [...raw.matchAll(/https?:\/\/[^\s"#]+/g)].map((match) => match[0]);
  for (const url of urls) {
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url)) {
      fail(`URL non locale : ${url}`);
    }
  }
}

if (existsSync(supabaseDir)) {
  const stack = [supabaseDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry === "config.toml") continue;
      const text = readFileSync(full, "utf8");
      if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) {
        fail(`jeton versionné dans ${path.relative(root, full)}`);
      }
      if (/service[_-]?role[_-]?key\s*=\s*"[^"]+"/i.test(text)) {
        fail(`clé service-role dans ${path.relative(root, full)}`);
      }
    }
  }
}

if (failures.length > 0) {
  for (const message of failures) console.error(`SUPABASE_FOUNDATION FAIL: ${message}`);
  process.exit(1);
}

console.log("SUPABASE_FOUNDATION PASS: local config, PostgreSQL 17, signup closed, business schemas hidden");
