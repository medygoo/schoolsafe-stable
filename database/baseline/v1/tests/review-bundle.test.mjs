import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildReviewBundle } from "../scripts/generate-review-bundle.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.resolve(here, "..");

const expectedFiles = [
  "01_roles.sql",
  "05_iam.sql",
  "07_constraints_indexes.sql",
  "08_internal_functions.sql",
  "09_api_rpc.sql",
  "10_triggers.sql",
  "11_rls_acl.sql",
  "12_seed_permissions.sql",
  "13_verification.sql",
  "tests/from-zero-access-law.test.sql",
  "scripts/run-from-zero-test.sh",
];

test("review bundle reports exact hashes, line counts, objects and risks for eleven files", async () => {
  const bundle = await buildReviewBundle(baselineDir);

  assert.equal(bundle.review, "DB-04B-R2");
  assert.deepEqual(bundle.files.map(({ file }) => file), expectedFiles);

  for (const entry of bundle.files) {
    const bytes = await readFile(path.join(baselineDir, entry.file));
    const source = bytes.toString("utf8");
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    const expectedLines = source === "" ? 0 : source.split(/\r?\n/).length - Number(source.endsWith("\n"));

    assert.equal(entry.sha256, expectedHash, `${entry.file} hash mismatch`);
    assert.equal(entry.lines, expectedLines, `${entry.file} line count mismatch`);
    assert.ok(Array.isArray(entry.objects_created));
    assert.ok(Array.isArray(entry.security_definer));
    assert.ok(Array.isArray(entry.grants));
    assert.ok(Array.isArray(entry.revokes));
    assert.ok(Array.isArray(entry.rls));
    assert.ok(entry.dependencies.length > 0, `${entry.file} must list dependencies`);
    assert.ok(entry.risks.length > 0, `${entry.file} must list risks`);
  }

  assert.equal(bundle.catalog.permissions, 60);
  assert.equal(bundle.catalog.scopes, 7);
  assert.ok(bundle.static_controls.length >= 12);
  assert.ok(
    bundle.static_controls.every(({ status }) => status === "PASS"),
    "every requested static control must pass",
  );
});
