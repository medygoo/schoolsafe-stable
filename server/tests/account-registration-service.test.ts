import {describe,it,expect,vi} from "vitest";
import {createAccountRegistrationService} from "../src/onboarding/account-registration-service.js";
import {createApprovalService} from "../src/onboarding/approval-service.js";
import {accountRegistrationSchema} from "../src/onboarding/account-registration-schema.js";
import {verifyPassword} from "../src/authnative/passwords.js";
import {hashSessionToken} from "../src/authnative/tokens.js";
const payload={first_name:" Ada ",last_name:" Test ",email:"ADA@example.test",phone:"0812345678",password:"test-password-123"};
const reviewed={request_id:"request-1",first_name:"Ada",last_name:"Test",email:"ada@example.test",phone:"+243812345678",status:"pending"};
function fixture(failure?:string,code?:string){
 const query=vi.fn(async(sql:string,_params:unknown[])=>{
  if(failure&&sql.includes(failure)) throw Object.assign(new Error("sensitive database detail"),{code});
  if(sql.includes("review"))return {rows:[{result:reviewed}]};
  if(sql.includes("cancel"))return {rows:[{result:true}]};
  return {rows:[{result:{request_id:"request-1",status:"pending"}}]};
 });
 const delivery=vi.fn().mockResolvedValue(undefined);
 const service=createAccountRegistrationService({db:{query} as any,delivery,approvalUrl:"https://example.test/approval?x=1#old",ttlSeconds:604800});
 return {query,delivery,service};
}
describe("account registration",()=>{
 it.each(["first_name","last_name","email","phone","password"])("requires %s",key=>{const p={...payload};delete p[key as keyof typeof p];expect(accountRegistrationSchema.safeParse(p).success).toBe(false)});
 it.each([{first_name:" "},{last_name:"x".repeat(101)},{email:"bad"},{phone:"letters"},{password:"1234567"},{password:"x".repeat(65)},{recipient:"x"},{admin:{}},{confirmation:"x"}])("rejects invalid or extra input %j",change=>expect(accountRegistrationSchema.safeParse({...payload,...change}).success).toBe(false));
 it("hashes password separately, uses normalized review and fragment capability, clamps TTL",async()=>{
  const f=fixture();expect(await f.service.register(payload,"127.0.0.1")).toEqual({request_id:"request-1",status:"pending"});
  const prepare=f.query.mock.calls.find(([s])=>s.includes("prepare"))!;
  expect(JSON.parse(prepare[1][0] as string)).toEqual({first_name:"Ada",last_name:"Test",email:"ada@example.test",phone:"0812345678"});
  expect(await verifyPassword(prepare[1][1] as string,payload.password)).toBe(true);
  expect(JSON.stringify(f.query.mock.calls)).not.toContain(payload.password);
  expect(prepare[1][2]).toBe("127.0.0.1");
  const mail=f.delivery.mock.calls[0][0];expect(mail.phone).toBe(reviewed.phone);
  const url=new URL(mail.approvalLink);expect(url.search).toBe("?x=1");expect(url.hash).toMatch(/^#account-approval=[A-Za-z0-9_-]{43}$/);
  const raw=url.hash.split("=")[1];const issue=f.query.mock.calls.find(([s])=>s.includes("issue_approval"))!;
  expect(issue[1][1]).toBe(hashSessionToken(raw));expect(new Date(issue[1][2] as string).getTime()-Date.now()).toBeLessThanOrEqual(172800000);
  expect(f.query.mock.calls.at(-1)![0]).toContain("mark_email_sent");expect(JSON.stringify(f.query.mock.calls)).not.toContain(raw);
 });
 it("fails closed before preparing if delivery is unavailable",async()=>{const f=fixture();const s=createAccountRegistrationService({db:{query:f.query} as any});await expect(s.register(payload,"127.0.0.1")).rejects.toMatchObject({statusCode:503});expect(f.query).not.toHaveBeenCalled()});
 it.each(["issue_approval","review"])("compensates %s failure",async failure=>{const f=fixture(failure);await expect(f.service.register(payload,"127.0.0.1")).rejects.toMatchObject({statusCode:503});expect(f.query.mock.calls.at(-1)![0]).toContain("cancel_delivery_failure")});
 it("compensates unconfirmed delivery failure",async()=>{const f=fixture();f.delivery.mockRejectedValue(new Error("token secret"));await expect(f.service.register(payload,"127.0.0.1")).rejects.toMatchObject({statusCode:503});expect(f.query.mock.calls.at(-1)![0]).toContain("cancel_delivery_failure")});
 it("never compensates after confirmed delivery even when marking fails",async()=>{const f=fixture("mark_email_sent");await expect(f.service.register(payload,"127.0.0.1")).rejects.toMatchObject({statusCode:503});expect(f.query.mock.calls.some(([s])=>s.includes("cancel"))).toBe(false)});
 it.each([["23505",409],["P0001",429],["23514",400]])("maps preparation error %s generically",async(code,status)=>{const f=fixture("prepare",code as string);await expect(f.service.register(payload,"127.0.0.1")).rejects.toMatchObject({statusCode:status});expect(f.query).toHaveBeenCalledTimes(1)});
 it("cleanup failure remains a sanitized failure",async()=>{const f=fixture("cancel");f.delivery.mockRejectedValue(new Error("secret"));await expect(f.service.register(payload,"127.0.0.1")).rejects.toMatchObject({statusCode:503,message:"Inscription temporairement indisponible"})});
 it.each(["", "x", "a".repeat(42),"a".repeat(44),"!".repeat(43)])("denies malformed approval without SQL",async token=>{const f=fixture();await expect(createApprovalService({query:f.query} as any).review(token)).rejects.toMatchObject({statusCode:403,code:"ACCESS_DENIED"});expect(f.query).not.toHaveBeenCalled()});
 it("denies expired/consumed approval generically",async()=>{const f=fixture("review","42501");await expect(createApprovalService({query:f.query} as any).review("a".repeat(43))).rejects.toMatchObject({statusCode:403,code:"ACCESS_DENIED"})});
});

describe("registration compensation bounds",()=>{
 it("does not report success if compensation declines an approved race",async()=>{const f=fixture();f.query.mockImplementation(async sql=>{if(sql.includes("review"))return {rows:[{result:reviewed}]};if(sql.includes("cancel"))return {rows:[{result:false}]};return {rows:[{result:{request_id:"request-1",status:"pending"}}]}});f.delivery.mockRejectedValue(new Error("unconfirmed"));await expect(f.service.register(payload,"127.0.0.1")).rejects.toMatchObject({statusCode:503});expect(f.query.mock.calls.at(-1)![0]).toContain("cancel_delivery_failure")});
 it.each([0,-1,1.5,NaN])("fails closed for invalid TTL %s",async ttlSeconds=>{const f=fixture();await expect(createAccountRegistrationService({db:{query:f.query} as any,delivery:f.delivery,approvalUrl:"https://example.test",ttlSeconds}).register(payload,"127.0.0.1")).rejects.toMatchObject({statusCode:503});expect(f.query).not.toHaveBeenCalled()});
});
