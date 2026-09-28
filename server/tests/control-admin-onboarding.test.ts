import {SchoolSafeError} from "../src/http/errors.js";
import {describe,it,expect,vi} from "vitest";
import {createAuthNativeService} from "../src/authnative/service.js";
import {createOnboardingSchoolService} from "../src/onboarding/school-service.js";
import {hashPassword} from "../src/authnative/passwords.js";
const id="11111111-1111-4111-8111-111111111111";
const school="22222222-2222-4222-8222-222222222222";
const profile="33333333-3333-4333-8333-333333333333";
const password="Control-QA!2026";
function fixture() {
 const state={school_id:null as string|null,status:"active",bound:false};
 const control={
  verify:vi.fn(async()=>({access_id:id,status:"active",school_id:null,email:"qa@schoolsafe.test",phone:null,onboarding_required:true})),
  status:vi.fn(async()=>({access_id:id,status:state.status,school_id:state.bound?state.school_id:null})),
  bind:vi.fn(async()=>{state.bound=true;})
 };
 const query=vi.fn(async(sql:string,_params:unknown[]):Promise<{rows:any[]}>=>{
  if(sql.includes("auth_is_locked"))return {rows:[{auth_is_locked:false}]};
  if(sql.includes("auth_control_resolve_identity"))return {rows:[{access_id:id,identity_id:id,user_id:id,school_id:state.school_id,profile_id:state.school_id?profile:null}]};
  if(sql.includes("auth_control_link"))return {rows:[{access_id:id,identity_id:id,user_id:id,school_id:state.school_id}]};
  if(sql.includes("auth_resolve_onboarding_session"))return {rows:[{result:{access_id:id,first_name:"",last_name:"",email:"qa@schoolsafe.test",phone:null,status:"onboarding"}}]};
  if(sql.includes("auth_activate_school")){state.school_id=school;return {rows:[{result:{access_id:id,school_id:school,profile_id:profile,status:"completed"}}]};}
  if(sql.includes("auth_create_onboarding_session")||sql.includes("auth_create_session"))return {rows:[{session_id:id,expires_at:"later"}]};
  if(sql.includes("auth_resolve_session"))return {rows:state.school_id?[{session_id:id,identity_id:id,user_id:id,profile_id:profile,school_id:school,must_change:false}]:[]};
  return {rows:[]};
 });
 const db={query} as any;
 return {state,control,query,auth:createAuthNativeService({db,control} as any),onboarding:createOnboardingSchoolService(db,control as any)};
}
const payload={admin:{first_name:"QA",last_name:"Admin"},identity:{name_fr:"QA School"},cycles:["primary"],academic_year:{label:"2026-2027",starts_on:"2026-09-01",ends_on:"2027-07-01"},contact:{},brand:{}};
describe("Control administrator onboarding",()=>{
 it("opens onboarding without copying a password into SQL",async()=>{
  const f=fixture(); const result=await f.auth.loginWithPassword("qa@schoolsafe.test",password);
  expect(result).toMatchObject({ok:true,onboarding:true});
  expect(f.control.verify).toHaveBeenCalledWith("qa@schoolsafe.test",password);
  expect(JSON.stringify(f.query.mock.calls)).not.toContain(password);
  expect(f.query.mock.calls.some(([sql])=>sql.includes("auth_create_direct_identity"))).toBe(false);
 });
 it("unknown Control and local login never creates an identity",async()=>{
  const f=fixture();f.control.verify.mockResolvedValue(null as any);
  expect(await f.auth.loginWithPassword("unknown@schoolsafe.test",password)).toMatchObject({ok:false,reason:"invalid_credentials"});
  expect(f.query.mock.calls.some(([sql])=>sql.includes("create_direct")||sql.includes("control_resolve_identity"))).toBe(false);
 });
 it("creates school without activation code and binds before workspace",async()=>{
  const f=fixture();const result=await f.onboarding.createSchool("onboarding",payload);
  expect(result).toMatchObject({school_id:school,status:"completed"});
  expect(f.control.bind).toHaveBeenCalledWith(id,school);
  expect(await f.auth.resolveSession(result.token)).toMatchObject({schoolId:school});
 });
 it("second login opens normal session, never onboarding again",async()=>{
  const f=fixture();f.state.school_id=school;
  expect(await f.auth.loginWithPassword("qa@schoolsafe.test",password)).toMatchObject({ok:true,onboarding:false,session:{schoolId:school}});
  expect(f.control.bind).toHaveBeenCalledWith(id,school);
  expect(f.query.mock.calls.some(([sql])=>sql.includes("create_onboarding_session"))).toBe(false);
 });
 it.each(["suspended","revoked"])("refuses %s sessions and revokes locally",async status=>{
  const f=fixture();f.state.school_id=school;f.state.status=status;
  expect(await f.auth.resolveSession("normal")).toBeNull();
  expect(f.query.mock.calls.some(([sql])=>sql.includes("auth_control_revoke_sessions"))).toBe(true);
  await expect(f.onboarding.createSchool("onboarding",payload)).rejects.toMatchObject({statusCode:403});
 });
 it("never accepts a bound school mismatch",async()=>{
  const f=fixture();f.state.school_id=school;
  f.control.verify.mockResolvedValue({access_id:id,status:"active",school_id:id,email:"qa@schoolsafe.test",phone:null,onboarding_required:false} as any);
  await expect(f.auth.loginWithPassword("qa@schoolsafe.test",password)).rejects.toMatchObject({statusCode:409});
 });
 it("commits school once during bind outage and repairs it on subsequent login",async()=>{
  const f=fixture();f.control.bind.mockRejectedValueOnce(new SchoolSafeError(503,"DEPENDENCY_UNAVAILABLE","Unavailable",true));
  expect(await f.onboarding.createSchool("onboarding",payload)).toMatchObject({school_id:school});
  expect(await f.auth.loginWithPassword("qa@schoolsafe.test",password)).toMatchObject({ok:true,onboarding:false});
  expect(f.control.bind).toHaveBeenCalledTimes(2);
  expect(f.query.mock.calls.filter(([sql])=>sql.includes("auth_activate_school"))).toHaveLength(1);
 });
 it.each(["suspended","revoked"])("does not admit or use local fallback when Control denies %s",async()=>{
  const f=fixture();f.control.verify.mockRejectedValue(new SchoolSafeError(403,"ACCESS_DENIED","Denied",false));
  await expect(f.auth.loginWithPassword("qa@schoolsafe.test",password)).rejects.toMatchObject({statusCode:403});
  expect(f.query.mock.calls.some(([sql])=>sql.includes("resolve_identity")||sql.includes("create_session"))).toBe(false);
 });
 it("fails closed on unavailable status without changing a managed session into local access",async()=>{
  const f=fixture();f.state.school_id=school;f.control.status.mockRejectedValue(new SchoolSafeError(503,"DEPENDENCY_UNAVAILABLE","Unavailable",true));
  await expect(f.auth.resolveSession("normal")).rejects.toMatchObject({statusCode:503});
  const noControl=createAuthNativeService({db:{query:f.query} as any});
  await expect(noControl.resolveSession("normal")).rejects.toMatchObject({statusCode:503});
 });
 it("keeps a local user on the existing password login",async()=>{
  const hash=await hashPassword("Local-QA!2026");
  const f=fixture();f.control.verify.mockResolvedValue(null as any);
  f.query.mockImplementation(async(sql:string)=>{
   if(sql.includes("auth_resolve_identity"))return {rows:[{identity_id:id,user_id:id,password_hash:hash,status:"active",must_change:false}]};
   if(sql.includes("auth_list_profiles"))return {rows:[{profile_id:profile}]};
   if(sql.includes("auth_create_session"))return {rows:[{session_id:id,expires_at:"later"}]};
   return {rows:[]};
  });
  expect(await f.auth.loginWithPassword("local@schoolsafe.test","Local-QA!2026")).toMatchObject({ok:true});
  expect(f.control.status).not.toHaveBeenCalled();
 });
});
