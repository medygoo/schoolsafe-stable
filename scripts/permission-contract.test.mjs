import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPermissionCatalog,
  scanAuthorizationLiterals,
  assertCanonicalPermissions,
} from "./permission-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("shared permission codes are unique and structurally valid", async () => {
  const catalog = await loadPermissionCatalog(root);
  assert.ok(catalog.size >= 60);
  for (const [code, entry] of catalog) {
    assert.match(code, /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/);
    assert.ok(entry.label.trim().length > 0);
    assert.match(entry.scope, /^(none|school|own|own_children|assigned_classes|assigned_subjects|assigned_portal|assigned_fee_classes)$/);
  }
});

test("authorization literals include their exact source line", async () => {
  const uses = await scanAuthorizationLiterals(root);
  assert.ok(uses.some(use => use.file.endsWith("database/baseline/v1/09_api_rpc.sql")));
  assert.ok(uses.every(use => Number.isInteger(use.line) && use.line > 0));
});

test("every authorization literal belongs to the shared catalog", async () => {
  await assertCanonicalPermissions(root);
});
