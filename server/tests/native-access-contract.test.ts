import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const humanServices = [
  "studentsnative/service.ts",
  "financenative/service.ts",
  "pedagogynative/service.ts",
  "cardsnative/service.ts",
  "sessionnative/service.ts",
];

describe("native Access Law contract", () => {
  for (const relative of humanServices) {
    it(`${relative} does not execute human RPCs through the pool`, async () => {
      const source = await readFile(new URL(`../src/${relative}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/businessPool\.query\s*</);
      expect(source).toContain("withRequestContext");
    });
  }
});
