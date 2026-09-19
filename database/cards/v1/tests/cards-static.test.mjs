import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const files = ["01_cards_native.sql", "02_cards_classes.sql"];

async function readUnits() {
  return Promise.all(files.map(async (file) => {
    const sql = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    return { file, sql };
  }));
}

test("enveloppe transactionnelle et rôle owner", async () => {
  for (const { file, sql } of await readUnits()) {
    assert.match(sql, /\\set ON_ERROR_STOP on/, `${file}: ON_ERROR_STOP manquant`);
    assert.match(sql, /^begin;$/m, `${file}: begin manquant`);
    assert.match(sql, /^commit;$/m, `${file}: commit manquant`);
    assert.match(sql, /set local role schoolsafe_owner/, `${file}: rôle owner manquant`);
  }
});

test("chaque fonction est definer avec search_path pg_catalog", async () => {
  for (const { file, sql } of await readUnits()) {
    const fnCount = (sql.match(/create or replace function/g) ?? []).length;
    assert.ok(fnCount > 0, `${file}: aucune fonction`);
    assert.equal((sql.match(/security definer/g) ?? []).length, fnCount, `${file}: definer manquant`);
    assert.equal((sql.match(/set search_path = pg_catalog/g) ?? []).length, fnCount, `${file}: search_path manquant`);
  }
});

test("grants vers schoolsafe_api uniquement, jamais public", async () => {
  for (const { file, sql } of await readUnits()) {
    assert.doesNotMatch(sql, /grant\s+[\s\S]{0,80}\s+to\s+public/i, `${file}: grant public interdit`);
    assert.match(sql, /to schoolsafe_api/, `${file}: grant schoolsafe_api manquant`);
  }
});

test("codes de permission canoniques uniquement", async () => {
  const legacy = /'(finance\.(?:fees|payments|reports|cashier|fee_control)|pedagogy\.(?:classes|subjects|assignments|grades|lessons|rankings)|cards\.print\.request)(?:\.[a-z_]+)?'/;
  for (const { file, sql } of await readUnits()) {
    assert.doesNotMatch(sql, legacy, `${file}: littéral legacy présent`);
  }
});

test("aucune requête métier app.* sans contrainte school_id", async () => {
  for (const { file, sql } of await readUnits()) {
    const statements = sql.split(";").filter((s) => /\b(from|join|update|into)\s+app\./i.test(s));
    assert.ok(statements.length > 0, `${file}: aucune requête métier`);
    for (const [index, statement] of statements.entries()) {
      assert.match(statement, /school_id/i, `${file}: requête ${index} sans school_id`);
    }
  }
});
