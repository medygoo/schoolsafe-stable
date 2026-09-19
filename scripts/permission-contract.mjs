import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "node:fs/promises";

const ALLOWED_SCOPES = new Set([
  "none", "school", "own", "own_children", "assigned_classes",
  "assigned_subjects", "assigned_portal", "assigned_fee_classes",
]);

export async function loadPermissionCatalog(rootDir) {
  const entries = JSON.parse(await readFile(path.join(rootDir, "shared/permissions.json"), "utf8"));
  const catalog = new Map();
  for (const entry of entries) {
    if (!entry?.code || !entry?.label || !ALLOWED_SCOPES.has(entry.scope)) {
      throw new Error(`Invalid permission entry: ${JSON.stringify(entry)}`);
    }
    if (entry.authority && !["school", "control"].includes(entry.authority)) {
      throw new Error(`Invalid permission authority: ${entry.code}`);
    }
    if (catalog.has(entry.code)) throw new Error(`Duplicate permission code: ${entry.code}`);
    catalog.set(entry.code, entry);
  }
  return catalog;
}

export async function scanAuthorizationLiterals(rootDir) {
  const uses = [];
  const patterns = ["database/**/*.sql", "server/src/**/*.ts"];
  const matcher = /(?:require_access|can_access|requirePermission)\(\s*["']([^"']+)["']/g;
  for (const pattern of patterns) {
    for await (const relative of glob(pattern, { cwd: rootDir })) {
      const source = await readFile(path.join(rootDir, relative), "utf8");
      for (const match of source.matchAll(matcher)) {
        uses.push({
          code: match[1],
          file: relative.replaceAll("\\", "/"),
          line: source.slice(0, match.index).split(/\r?\n/).length,
        });
      }
    }
  }
  return uses;
}

export async function assertCanonicalPermissions(rootDir) {
  const catalog = await loadPermissionCatalog(rootDir);
  const unknown = (await scanAuthorizationLiterals(rootDir))
    .filter(use => !catalog.has(use.code) && !use.code.startsWith("test."));
  if (unknown.length) {
    throw new Error(unknown.map(use => `${use.file}:${use.line} ${use.code}`).join("\n"));
  }
}
