import {describe,it,expect,vi,beforeAll} from "vitest";
import {createAuthNativeService} from "../src/authnative/service.js";
import {hashPassword} from "../src/authnative/passwords.js";
import {hashSessionToken} from "../src/authnative/tokens.js";
import {buildApp} from "../src/app.js";
let passwordHash:string;beforeAll(async()=>{passwordHash=await hashPassword("test-password-123")});
function fixture(status="active",normal=false){
 const query=vi.fn(async(sql:string,_params:unknown[])=>{
  if(sql.includes("auth_is_locked"))return {rows:[{auth_is_locked:false}]};
  if(sql.includes("auth_resolve_identity"))return {rows:normal?[{identity_id:"id",user_id:"user",status:"active",password_hash:passwordHash,must_change:false}]:[]};
  if(sql.includes("auth_resolve_onboarding_identity"))return {rows:status==="missing"?[]:[{identity_id:"id",user_id:"user",status,password_hash:passwordHash,must_change:false}]};
  if(sql.includes("auth_list_profiles"))return {rows:[{profile_id:"p1"},{profile_id:"p2"}]};
  if(sql.includes("auth_create_onboarding_session"))return {rows:[{session_id:"session",expires_at:"later"}]};
  return {rows:[]};
 });const service=createAuthNativeService({db:{query} as any});return {query,service};
}
describe("account-first native login",()=>{
 it("creates only a hashed one-hour onboarding session",async()=>{const f=fixture();const result=await f.service.loginWithPassword("ada@example.test","test-password-123",undefined,"127.0.0.1","ua",true);expect(result).toMatchObject({ok:true,onboarding:true});if(!result.ok)throw Error();const args=f.query.mock.calls.find(([s])=>s.includes("create_onboarding_session"))![1];expect(args).toEqual(["id",hashSessionToken(result.token),3600,"127.0.0.1","ua"]);expect(f.query.mock.calls.some(([s])=>s.includes("api.auth_create_session("))).toBe(false)});
 it.each(["missing","pending","rejected"])("does not authenticate %s identity",async status=>{const f=fixture(status);expect((await f.service.loginWithPassword("ada@example.test","test-password-123")).ok).toBe(false);expect(f.query.mock.calls.some(([s])=>s.includes("create_onboarding_session"))).toBe(false);expect(f.query.mock.calls.find(([s])=>s.includes("record_attempt"))![1][1]).toBe(false)});
 it("records wrong passwords and creates no session",async()=>{const f=fixture();expect((await f.service.loginWithPassword("ada@example.test","wrong-password")).ok).toBe(false);expect(f.query.mock.calls.find(([s])=>s.includes("record_attempt"))![1][1]).toBe(false)});
 it("preserves normal multi-profile choice and never falls back",async()=>{const f=fixture("active",true);expect(await f.service.loginWithPassword("ada@example.test","test-password-123")).toMatchObject({ok:false,reason:"profile_choice_required"});expect(f.query.mock.calls.some(([s])=>s.includes("onboarding"))).toBe(false)});
 it("sets a secure HttpOnly onboarding cookie and clears stale ordinary cookie",async()=>{const f=fixture();const app=buildApp({authNative:{service:f.service,cookieSecure:true}});try{const res=await app.inject({method:"POST",url:"/auth/native/login",headers:{cookie:"schoolsafe_session=old"},payload:{login:"ada@example.test",password:"test-password-123"}});expect(res.statusCode).toBe(200);expect(res.json()).toEqual({code:"ONBOARDING_REQUIRED"});const cookies=res.headers["set-cookie"] as string[];expect(cookies).toHaveLength(2);expect(cookies.some(c=>/^schoolsafe_onboarding=[A-Za-z0-9_-]+;/.test(c)&&c.includes("HttpOnly")&&c.includes("SameSite=Lax")&&c.includes("Path=/")&&c.includes("Secure")&&c.includes("Max-Age=3600"))).toBe(true);expect(cookies.some(c=>c.startsWith("schoolsafe_session=;")&&c.includes("Max-Age=0"))).toBe(true);expect(res.body).not.toContain("token")}finally{await app.close()}});
});

describe("onboarding login boundaries",()=>{
 it("does not resolve either identity when locked",async()=>{const f=fixture();f.query.mockResolvedValueOnce({rows:[{auth_is_locked:true}]} as any);expect(await f.service.loginWithPassword("ada@example.test","test-password-123")).toEqual({ok:false,reason:"locked"});expect(f.query).toHaveBeenCalledTimes(1)});
 it("sets no cookie for wrong onboarding password",async()=>{const f=fixture();const app=buildApp({authNative:{service:f.service,cookieSecure:false}});try{const res=await app.inject({method:"POST",url:"/auth/native/login",payload:{login:"ada@example.test",password:"wrong-password"}});expect(res.statusCode).toBe(401);expect(res.headers["set-cookie"]).toBeUndefined()}finally{await app.close()}});
 it("normal login clears old onboarding cookie and keeps ordinary session",async()=>{const f=fixture();const token="b".repeat(43);vi.spyOn(f.service,"loginWithPassword").mockResolvedValue({ok:true,token,session:{sessionId:"session",identityId:"id",userId:"user",profileId:"profile",schoolId:"school",mustChange:false,expiresAt:"later"}});const app=buildApp({authNative:{service:f.service,cookieSecure:false}});try{const res=await app.inject({method:"POST",url:"/auth/native/login",headers:{cookie:"schoolsafe_onboarding="+"a".repeat(43)},payload:{login:"ada@example.test",password:"test-password-123"}});expect(res.statusCode).toBe(200);expect(res.json().profile_id).toBe("profile");const cookies=res.headers["set-cookie"] as string[];expect(cookies).toHaveLength(2);expect(cookies.some(c=>c.startsWith("schoolsafe_onboarding=;")&&c.includes("Max-Age=0"))).toBe(true);expect(cookies.some(c=>c.startsWith("schoolsafe_session="+token)&&c.includes("Max-Age=43200"))).toBe(true)}finally{await app.close()}});
});

describe("onboarding completed account license context", () => {
  it("uses a PostgreSQL UUID request context when opening a licensed school", async () => {
    const {registerLicenseGate} = await import("../src/licensenative/gate.js");
    const app = buildApp();
    const identity = "10000000-0000-4000-8000-000000000001";
    let requestId = "";
    app.get("/native/lot3-session-proof", async () => ({ok: true}));
    registerLicenseGate(app, {
      authService: {resolveSession: async () => ({userId: identity, profileId: identity, schoolId: identity})} as any,
      licenseService: {readState: async (context: {requestId: string}) => {
        requestId = context.requestId;
        return {state: "active", payload: null};
      }} as any,
    });
    try {
      const response = await app.inject({url: "/native/lot3-session-proof", headers: {cookie: "schoolsafe_session=" + "a".repeat(43)}});
      expect(response.statusCode).toBe(200);
      expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    } finally { await app.close(); }
  });
});