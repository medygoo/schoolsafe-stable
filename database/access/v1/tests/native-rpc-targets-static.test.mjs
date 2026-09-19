import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const finance1 = await readFile(new URL("../../../finance/v1/01_finance_native.sql", import.meta.url), "utf8");
const finance2 = await readFile(new URL("../../../finance/v1/02_finance_full.sql", import.meta.url), "utf8");
const pedagogy = await readFile(new URL("../../../pedagogy/v1/01_pedagogy_native.sql", import.meta.url), "utf8");

test("finance student operations authorize student and resolved class", () => {
  assert.match(finance1, /iam\.require_access\('finance\.fee\.read',\s*null,\s*p_student_id,\s*v_class_id\)/);
  assert.match(finance1, /iam\.require_access\('finance\.payment\.record',\s*null,\s*v_student_id,\s*v_class_id\)/);
});

test("fee control scan supplies campaign and assigned class", () => {
  assert.match(finance2, /'campaign_id',\s*p_campaign_id::text/);
  assert.match(finance2, /iam\.require_access\('finance\.control\.scan',[\s\S]*v_class_id[\s\S]*v_runtime_context\)/);
});

test("pedagogy writes authorize the exact class-subject pair", () => {
  assert.match(pedagogy, /iam\.require_access\('pedagogy\.assignment\.manage',\s*null,\s*null,\s*p_class_id,\s*p_subject_id\)/);
  assert.match(pedagogy, /iam\.require_access\('pedagogy\.grade\.manage',[\s\S]*v_class_id,\s*v_subject_id\)/);
  assert.match(pedagogy, /iam\.require_access\('pedagogy\.lesson-plan\.manage',\s*null,\s*null,\s*p_class_id,\s*p_subject_id\)/);
});
