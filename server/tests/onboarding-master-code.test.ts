import {describe,it,expect,vi} from "vitest";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {buildNativeApp} from "../src/native-app.js";
import {parseEnv} from "../src/config/env.js";
const code="Synthetic-Master-Code-2026!";
const hash=createHash("sha256").update(code,"utf8").digest("hex");
const school={activation_code:code,admin:{first_name:"Ada",last_name:"Test"},identity:{name_fr:"School"},cycles:["primary"],academic_year:{label:"2026-2027",starts_on:"2026-09-01",ends_on:"2027-07-01"},contact:{},brand:{}};
function fixture(secret:string|null=hash){
 let failures=0,schools=0;
 const query=vi.fn(async(sql:string,params:unknown[])=>{
  if(sql.includes("auth_record_activation_attempt")) {
   if(failures>=5)return {rows:[{result:"limited"}]};
   if(!params[1]){failures++;return {rows:[{result:"denied"}]};}
   return {rows:[{result:"allowed"}]};
  }
  if(sql.includes("auth_activate_school"))return {rows:[{result:{school_id:"school-"+(++schools),profile_id:"profile-"+schools,status:"completed"}}]};
  return {rows:[]};
 });
 const app=buildNativeApp(parseEnv({NODE_ENV:"test",...(secret===null?{}:{SCHOOLSAFE_SCHOOL_ACTIVATION_CODE_SHA256:secret})}),{authPool:{query,end:vi.fn()},businessPool:{query:vi.fn(),end:vi.fn()}} as any);
 const activate=(activation_code=code,cookie="a".repeat(43))=>app.inject({method:"POST",url:"/auth/onboarding/school",headers:{cookie:"schoolsafe_onboarding="+cookie},payload:{...school,activation_code}});
 return {app,query,activate,failures:()=>failures,schools:()=>schools};
}
describe("reusable server-only master activation code",()=>{
 it.each(["", "not-a-hash", "A".repeat(64)])("fails closed for missing or malformed configuration %s",async secret=>{
  const f=fixture(secret);try{const r=await f.activate();expect(r.statusCode).toBe(503);expect(r.json().code).toBe("DEPENDENCY_UNAVAILABLE");expect(f.query).not.toHaveBeenCalled();}finally{await f.app.close();}
 });
 it("rejects missing environment without a default",async()=>{
  const env=parseEnv({NODE_ENV:"test"});expect((env as any).SCHOOLSAFE_SCHOOL_ACTIVATION_CODE_SHA256).toBeUndefined();
  const f=fixture(null);try{expect((await f.activate()).statusCode).toBe(503);expect(f.query).not.toHaveBeenCalled();}finally{await f.app.close();}
 });
 it("compares the exact UTF-8 bytes without trimming or normalizing the code",async()=>{
  const value="  École-test-秘密  ";
  const f=fixture(createHash("sha256").update(value,"utf8").digest("hex"));
  try{expect((await f.activate(value.trim())).statusCode).toBe(403);expect((await f.activate(value)).statusCode).toBe(201);}finally{await f.app.close();}
 });
 it("rejects five wrong codes, records only attempts, and blocks even the correct sixth code",async()=>{
  const f=fixture();try{
   for(let i=0;i<5;i++){const r=await f.activate("Wrong-Code-For-Test");expect(r.statusCode).toBe(403);expect(r.json().message).toBe("Code d’activation incorrect.");}
   expect(f.failures()).toBe(5);expect(f.schools()).toBe(0);
   const sixth=await f.activate();expect(sixth.statusCode).toBe(429);expect(sixth.json().code).toBe("RATE_LIMITED");expect(f.schools()).toBe(0);
  }finally{await f.app.close();}
 });
 it("allows the same master code for two schools without sending code or hash to SQL",async()=>{
  const f=fixture();try{
   const a=await f.activate(),b=await f.activate(code,"b".repeat(43));expect(a.statusCode).toBe(201);expect(b.statusCode).toBe(201);expect(a.json().school_id).not.toBe(b.json().school_id);
   expect(JSON.stringify(f.query.mock.calls)).not.toContain(code);expect(JSON.stringify(f.query.mock.calls)).not.toContain(hash);
   for(const [sql,params] of f.query.mock.calls.filter(([sql])=>sql.includes("auth_activate_school"))) {expect(params).toHaveLength(3);expect(sql).not.toContain("$4");}
  }finally{await f.app.close();}
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
