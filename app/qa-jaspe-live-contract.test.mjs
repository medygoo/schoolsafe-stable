import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const client = await readFile(new URL("./modules/jaspe2d/jaspe2d.js", import.meta.url), "utf8");
const assistant = await readFile(new URL("./modules/safe/safe-assistant.js", import.meta.url), "utf8");

test("Jaspe client consumes the backend envelope", () => {
  assert.match(client, /data\.data && typeof data\.data\.reply === "string"/);
  assert.doesNotMatch(client, /typeof data\.reply === "string"/);
});

test("visible conversation calls backend AI online and retains offline fallback", () => {
  assert.match(assistant, /SchoolSafeJaspe2d\.chat\(raw\)/);
  assert.match(assistant, /Jaspe a besoin d'une connexion pour cette question/);
});
