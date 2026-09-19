import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

test("SQL hashes are identical for LF and CRLF working trees", async () => {
  const { sha256Sql } = await import("./migration-manifest.mjs");
  const expected = createHash("sha256").update("select 1;\n", "utf8").digest("hex");

  assert.equal(sha256Sql(Buffer.from("select 1;\n")), expected);
  assert.equal(sha256Sql(Buffer.from("select 1;\r\n")), expected);
});

test("the repository migration check is read-only and passes", () => {
  const result = spawnSync(process.execPath, ["scripts/check-migration-versions.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS \(12 sets, 43 units\)/);
});
