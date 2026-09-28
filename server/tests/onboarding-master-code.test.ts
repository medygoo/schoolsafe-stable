import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {parseEnv} from "../src/config/env.js";
describe("activation code retirement",()=>{
 it("has no master code environment or UI field",()=>{
 expect(parseEnv({NODE_ENV:"test",SCHOOLSAFE_SCHOOL_ACTIVATION_CODE_SHA256:"a".repeat(64)})).not.toHaveProperty("SCHOOLSAFE_SCHOOL_ACTIVATION_CODE_SHA256");
 const app=readFileSync(new URL("../../app/app.js",import.meta.url),"utf8");
 expect(app).not.toMatch(/schoolActivationCode|activation_code/);
 });
 it("removes single-use setup dependency from V6",()=>{
  const sql=readFileSync(new URL("../../database/auth/v6/01_direct_school_activation.sql",import.meta.url),"utf8");
  expect(sql).not.toMatch(/setup_authorizations|resolve_school_setup_authorization|setup_token_hash|p_activation_hash|consumed_at/);
 });
 it("preserves historical labels",()=>{
  const app=readFileSync(new URL("../../app/app.js",import.meta.url),"utf8");
  const labels=JSON.parse(app.match(/var stepLabels = (\[[\s\S]*?\]);/)![1]);
  expect(labels).toEqual(["Identité","Cycles","Année scolaire","Coordonnées","Identité visuelle","Administrateur","Vérification"]);
 });
});
