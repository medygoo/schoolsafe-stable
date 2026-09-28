import {describe,it,expect,vi} from "vitest";
import {buildNativeApp} from "../src/native-app.js";
import {parseEnv} from "../src/config/env.js";

function fixture() {
 const authPool={query:vi.fn(async(sql:string,params:unknown[])=>{
  if(sql.includes("auth_is_locked"))return {rows:[{auth_is_locked:false}]};
  if(sql.includes("auth_create_direct_identity"))return {rows:[{identity_id:"direct",user_id:"user",password_hash:params[1],status:"active",must_change:false}]};
  if(sql.includes("auth_create_onboarding_session"))return {rows:[{session_id:"onboarding"}]};
  if(sql.includes("auth_resolve_identity"))return {rows:[]};
  if(sql.includes("auth_resolve_onboarding_identity"))return {rows:[]};
  return {rows:[]};
 }),end:vi.fn()};
 const app=buildNativeApp(parseEnv({NODE_ENV:"test",SETUP_TOKEN:"legacy-token",SCHOOLSAFE_APPROVER_EMAIL:"legacy@example.test",
  SCHOOLSAFE_APPROVAL_URL:"https://legacy.example.test",SCHOOLSAFE_GOOGLE_MAIL_URL:"https://legacy.example.test/mail",
  SCHOOLSAFE_GOOGLE_MAIL_SECRET:"synthetic-only",BREVO_API_KEY:"synthetic-only",BREVO_SENDER_EMAIL:"sender@example.test"}),
  {authPool,businessPool:{query:vi.fn(),end:vi.fn()}} as any);
 return {app,authPool};
}

describe("direct school activation entry",()=>{
 it.each([{origin:"https://evil.example"},{"sec-fetch-site":"cross-site"}])("refuses cross-origin login creation %j",async headers=>{
  const {app,authPool}=fixture();try {
   const response=await app.inject({method:"POST",url:"/auth/native/login",headers,payload:{login:"new@example.test",password:"Synthetic-Direct-2026!"}});
   expect(response.statusCode).toBe(403);expect(authPool.query).not.toHaveBeenCalled();expect(response.headers["set-cookie"]).toBeUndefined();
  }finally{await app.close()}
 });
 it("does not expose the retired approval endpoints even with legacy env configured",async()=>{
  const {app}=fixture();
  try {
   for(const url of ["/auth/registrations","/auth/registrations/review","/auth/registrations/decision"])
    expect((await app.inject({method:"POST",url,payload:{}})).statusCode).toBe(404);
  } finally {await app.close()}
 });

 it("refuses unknown login without creating an account or calling approval mail",async()=>{
  const {app,authPool}=fixture();
  try {
   const response=await app.inject({method:"POST",url:"/auth/native/login",payload:{login:"new@example.test",password:"Synthetic-Direct-2026!"}});
   expect(response.statusCode).toBe(401);
   expect(response.headers["set-cookie"]).toBeUndefined();
   expect(authPool.query.mock.calls.some(([sql])=>sql.includes("auth_create_direct_identity")||sql.includes("auth_create_onboarding_session"))).toBe(false);
   expect(authPool.query.mock.calls.some(([sql])=>sql.includes("registration_prepare")||sql.includes("google"))).toBe(false);
  } finally {await app.close()}
 });
});
