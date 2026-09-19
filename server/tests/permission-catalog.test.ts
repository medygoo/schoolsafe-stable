import { describe, expect, it } from "vitest";
import { loadPermissionCatalog } from "../src/access/permission-catalog.js";

const minimum = [
  "session.bootstrap",
  "school.class.read",
  "school.student.read",
  "school.guardian.read",
  "school.guardian.manage",
  "security.pickup.read",
  "security.pickup.manage",
  "finance.status.read",
  "sync.submit",
  "file.upload",
  "file.download",
  "notification.subscribe"
];

describe("permission catalog", () => {
  it("contient des identifiants uniques et stables", () => {
    const catalog = loadPermissionCatalog();
    expect(catalog.size).toBeGreaterThanOrEqual(minimum.length);
    for (const code of catalog) expect(code).toMatch(/^[a-z][a-z0-9._-]+$/);
    for (const code of minimum) expect(catalog.has(code)).toBe(true);
  });
});
