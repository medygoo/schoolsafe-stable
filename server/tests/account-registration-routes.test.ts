import {describe,it,expect,vi} from "vitest";
import {buildNativeApp} from "../src/native-app.js";
import {parseEnv} from "../src/config/env.js";
describe("retired account approval routes",()=>{
 it.each(["/auth/registrations","/auth/registrations/review","/auth/registrations/decision"])("does not expose %s even with old configuration",async url=>{
  const query=vi.fn(),send=vi.spyOn(globalThis,"fetch");
  const app=buildNativeApp(parseEnv({NODE_ENV:"test",SCHOOLSAFE_GOOGLE_MAIL_URL:"https://old.example.test",SCHOOLSAFE_GOOGLE_MAIL_SECRET:"unused",SCHOOLSAFE_APPROVAL_URL:"https://old.example.test"}),{authPool:{query,end:vi.fn()},businessPool:{query,end:vi.fn()}} as any);
  try {for(const method of ["GET","POST"] as const) expect((await app.inject({method,url,...(method==="POST"?{payload:{token:"a".repeat(43)}}:{})})).statusCode).toBe(404);expect(query).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();}
  finally{await app.close();send.mockRestore()}
 });
});
