import {buildNativeApp} from "../src/native-app.js";
import {parseEnv} from "../src/config/env.js";
import type {VerifiedPools} from "../src/db/startpools.js";
import {describe,it,expect,vi,afterEach} from "vitest";
import {createHash,randomBytes,randomUUID,createHmac} from "node:crypto";
import Fastify from "fastify";
import {createAuthNativeService} from "../src/authnative/service.js";
import {createSetupNativeService} from "../src/setup/service.js";
import {createRecoveryDelivery} from "../src/authnative/recovery-delivery.js";
import {registerDeviceHubMachineRoutes} from "../src/devicehub/machine-routes.js";
import {signRequest,verifyRequest} from "../src/machine/hmac.js";
import {createControlLicenseClient} from "../src/licensenative/control-client.js";
import type {AuthPool,BusinessPool} from "../src/db/pool.js";
import type {DeviceHubService} from "../src/devicehub/service.js";
afterEach(()=>vi.unstubAllGlobals());
describe("native installation v2",()=>{
 it("closes business routes when the licence public key is absent",async()=>{
  const businessQuery=vi.fn();const authPool={query:vi.fn().mockResolvedValue({rows:[{session_id:randomUUID(),identity_id:randomUUID(),user_id:randomUUID(),profile_id:randomUUID(),school_id:randomUUID(),must_change:false}]}),end:async()=>{}};
  const app=buildNativeApp(parseEnv({NODE_ENV:"test"}),{authPool,businessPool:{query:businessQuery,end:async()=>{}}} as unknown as VerifiedPools);
  try{const result=await app.inject({method:"GET",url:"/native/access/profiles",headers:{cookie:"schoolsafe_session=synthetic-session"}});expect(result.statusCode).toBe(403);expect(result.json().code).toBe("LICENSE_INACTIVE");expect(businessQuery).not.toHaveBeenCalled();}finally{await app.close();}
 });
 it("stages only through auth with a hashed capability and survives service restart",async()=>{
  const token=randomBytes(32).toString("hex");const query=vi.fn().mockResolvedValue({rows:[{result:{school_id:randomUUID(),academic_year_id:randomUUID(),profile_id:randomUUID()}}]});
  const auth={query} as unknown as AuthPool;const business={query:vi.fn()} as unknown as BusinessPool;
  const school={token,identity:{name_fr:"Synthetic",school_type:"test"},cycles:["primary" as const],academic_year:{label:"2026",starts_on:"2026-01-01",ends_on:"2026-12-31",periods:"Trimestres" as const},contact:{country:"test",province:"test",city:"test",website_mode:"test",public_news:"test",public_gallery:"test",public_honors:"test"},brand:{primary_color:"#000",accent_color:"#fff"}};
  await createSetupNativeService(auth,business,token).createSchool(school);
  await createSetupNativeService(auth,business,token).createAdmin({token,email:"test@example.test",password:randomBytes(16).toString("hex"),first_name:"Synthetic",last_name:"Admin"});
  expect(query.mock.calls[0][1][0]).toBe(createHash("sha256").update(token).digest("hex"));
  expect(JSON.stringify(query.mock.calls)).not.toContain(token);expect(query.mock.calls[1][0]).toContain("setup_complete_school");expect(business.query).not.toHaveBeenCalled();
 });
 it("issues no recovery when delivery is unavailable",async()=>{const query=vi.fn();await createAuthNativeService({query}).forgotPassword("test@example.test");expect(query).not.toHaveBeenCalled();});
 it("delivers a random recovery token and stores only its hash; reset hashes the token",async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{recovery_id:randomUUID(),email:"test@example.test",auth_reset_password:true}]});const delivery=vi.fn();const auth=createAuthNativeService({query},delivery);
  await auth.forgotPassword("test@example.test");const token=delivery.mock.calls[0][0].token;expect(token.length).toBeGreaterThanOrEqual(43);
  const digest=createHash("sha256").update(token).digest("hex");expect(query.mock.calls[0][1][1]).toBe(digest);
  await auth.resetPassword(token,"synthetic-password-hash");expect(query.mock.calls[1][1][0]).toBe(digest);
 });
 it("never uses a client-selected recovery origin",async()=>{
  const send=vi.fn().mockResolvedValue({status:"sent"});const deliver=createRecoveryDelivery({send},"https://school.example.test/reset");await deliver({email:"test@example.test",token:"synthetic-token"});
  expect(send.mock.calls[0][0].text).toContain("https://school.example.test/reset?token=synthetic-token");expect(()=>createRecoveryDelivery({send},"http://unsafe.test")).toThrow();
 });
 it("matches the Control production signing convention and closes malformed/replayed timestamps",()=>{
  const input={method:"post",path:"/device-registrations?test=1",timestamp:1800000000,body:JSON.stringify({school_id:"synthetic"}),secret:"synthetic-contract-secret"};
  const independent=createHmac("sha256",input.secret).update(["POST",input.path,"1800000000",input.body].join("\n")).digest("hex");
  expect(signRequest(input)).toBe(independent);expect(verifyRequest({...input,signature:independent,now:input.timestamp})).toBe(true);
  for(const timestamp of [NaN,Infinity,input.timestamp-301,input.timestamp+301,input.timestamp+0.5])expect(verifyRequest({...input,timestamp,signature:independent,now:input.timestamp})).toBe(false);
  expect(verifyRequest({...input,signature:independent+"00",now:input.timestamp})).toBe(false);
 });
 it("signs license GET using canonical headers, seconds, query path and empty JSON body",async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({signed_token:"synthetic.signed"})});vi.stubGlobal("fetch",fetcher);
  const config={url:"https://control.example.test",instanceId:"instance-a",hmacSecret:"synthetic-contract-secret"};
  expect(await createControlLicenseClient(config).fetchLicenseState("school-a")).toBe("synthetic.signed");
  const [url,options]=fetcher.mock.calls[0];const headers=options.headers;const timestamp=Number(headers["x-schoolsafe-timestamp"]);
  expect(timestamp).toBeLessThan(1e11);expect(headers["X-Control-Instance"]).toBeUndefined();
  expect(headers["x-schoolsafe-signature"]).toBe(signRequest({method:"GET",path:new URL(url).pathname+new URL(url).search,body:"{}",timestamp,secret:config.hmacSecret}));
 });
 it("maps two devices through the server registry and rejects client school injection",async()=>{
  const devices: string[]=[randomUUID(),randomUUID()],schools=[randomUUID(),randomUUID()];const ingestEvent=vi.fn().mockResolvedValue({accepted:true});
  const resolveContext=vi.fn(async(instance:string,device:string,requestId:string)=>{expect(instance).toBe("instance-a");const index=devices.indexOf(device);if(index<0)throw Error("unbound");return {schoolId:schools[index],userId:randomUUID(),profileId:randomUUID(),requestId};});
  const app=Fastify();registerDeviceHubMachineRoutes(app,{service:{ingestEvent} as unknown as DeviceHubService,hmacSecret:"synthetic-contract-secret",expectedInstanceId:"instance-a",resolveContext});
  try{for(let i=0;i<2;i++){
   const body={device_id:devices[i],raw_provider_event_id:"event-"+i,credential_type:"card",event_type:"check_in",occurred_at:new Date().toISOString()};
   const timestamp=Math.floor(Date.now()/1000);const headers={"x-schoolsafe-instance":"instance-a","x-schoolsafe-timestamp":String(timestamp),"x-schoolsafe-signature":signRequest({method:"POST",path:"/machine/devicehub/events",body:JSON.stringify(body),timestamp,secret:"synthetic-contract-secret"})};
   expect((await app.inject({method:"POST",url:"/machine/devicehub/events",headers,payload:body})).statusCode).toBe(200);expect(ingestEvent.mock.calls[i][0].schoolId).toBe(schools[i]);
   const forged={...body,school_id:schools[1-i]};headers["x-schoolsafe-signature"]=signRequest({method:"POST",path:"/machine/devicehub/events",body:JSON.stringify(forged),timestamp,secret:"synthetic-contract-secret"});
   expect((await app.inject({method:"POST",url:"/machine/devicehub/events",headers,payload:forged})).statusCode).not.toBe(200);
  }expect(resolveContext).toHaveBeenCalledTimes(2);}finally{await app.close();}
 });
});
