import {describe,it,expect,vi} from "vitest";
import {createControlAdminClient} from "../src/authnative/control-client.js";
const id="11111111-1111-4111-8111-111111111111",school="22222222-2222-4222-8222-222222222222";
const secret="synthetic-bootstrap-secret",password="Synthetic-Password!2026";
const record={access_id:id,status:"active",school_id:null,email:"admin@example.test",phone:null,onboarding_required:true};
function fixture(status=200,body:unknown={data:record}){
 const fetcher=vi.fn(async()=>new Response(JSON.stringify(body),{status}));
 return {fetcher,client:createControlAdminClient("https://control.example.test",secret,fetcher as any)};
}
describe("server-only Control contract",()=>{
 it("uses the bootstrap header and canonical identity, without returning secrets",async()=>{
  const f=fixture(200,{data:{...record,password,password_hash:"private",secret}});
  expect(await f.client.verify("Admin@example.test",password)).toEqual(record);
  const args=f.fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(args[0]).toBe("https://control.example.test/internal/school-admin-access/verify");
  expect(args[1].headers).toMatchObject({"x-schoolsafe-bootstrap-secret":secret});
  expect(args[1].redirect).toBe("error");expect(JSON.parse(args[1].body as string)).toEqual({login:"Admin@example.test",password});
 });
 it("only AUTH_INVALID permits local password fallback",async()=>{
  expect(await fixture(401,{code:"AUTH_INVALID"}).client.verify("x",password)).toBeNull();
  await expect(fixture(401,{code:"BOOTSTRAP_INVALID"}).client.verify("x",password)).rejects.toMatchObject({statusCode:503});
 });
 it.each(["ACCESS_SUSPENDED","ACCESS_REVOKED"])("refuses %s without fallback",async code=>{
  await expect(fixture(403,{code}).client.verify("x",password)).rejects.toMatchObject({statusCode:403});
 });
 it.each([{}, {data:{...record,email:null}}, {data:{...record,onboarding_required:false}}, {data:{...record,school_id:"invalid"}}])("fails closed on malformed response %j",async body=>{
  await expect(fixture(200,body).client.verify("x",password)).rejects.toMatchObject({statusCode:503});
 });
 it("sanitizes transport failures and does not expose upstream messages",async()=>{
  const fetcher=vi.fn(async()=>{throw Error(secret+password);});
  const client=createControlAdminClient("https://control.example.test",secret,fetcher as any);
  await expect(client.verify("x",password)).rejects.toMatchObject({statusCode:503});
  try{await client.verify("x",password);}catch(e){expect(String(e)).not.toContain(secret);expect(String(e)).not.toContain(password);}
 });
 it.each(["http://public.example.test","https://user:password@control.example.test","invalid"])("does not send credentials to unsafe URL %s",async url=>{
  const f=fixture();await expect(createControlAdminClient(url,secret,f.fetcher as any).verify("x",password)).rejects.toMatchObject({statusCode:503});expect(f.fetcher).not.toHaveBeenCalled();
 });
 it("does not request Control when bootstrap secret is missing",async()=>{
  const f=fixture();await expect(createControlAdminClient("https://control.example.test","",f.fetcher as any).status(id)).rejects.toMatchObject({statusCode:503});expect(f.fetcher).not.toHaveBeenCalled();
 });
 it.each(["active","suspended","revoked"])("returns canonical %s status only",async status=>{
  const f=fixture(200,{data:{access_id:id,status,school_id:school,password_hash:"private",secret}});
  expect(await f.client.status(id)).toEqual({access_id:id,status,school_id:school});
 });
 it("rejects a status for another access",async()=>{
  await expect(fixture(200,{data:{access_id:school,status:"active",school_id:null}}).client.status(id)).rejects.toMatchObject({statusCode:503});
 });
 it("binds the exact access and school and refuses conflicts",async()=>{
  await expect(fixture(200,{data:{access_id:id,status:"active",school_id:school}}).client.bind(id,school)).resolves.toBeUndefined();
  await expect(fixture(409,{code:"SCHOOL_BIND_CONFLICT"}).client.bind(id,school)).rejects.toMatchObject({statusCode:409});
  await expect(fixture(503,{}).client.bind(id,school)).rejects.toMatchObject({statusCode:503});
 });
});
