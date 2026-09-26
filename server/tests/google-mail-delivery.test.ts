import {describe,it,expect,vi,afterEach} from "vitest";
import {createHmac} from "node:crypto";
import {createGoogleMailDelivery} from "../src/onboarding/google-mail-delivery.js";
const secret="synthetic-test-secret-only";
const message={first_name:'<Ada & "',last_name:"Test >'",email:"ada@example.test",phone:"+243812345678",approvalLink:'https://example.test/?q="&x=1#account-approval=fake'};
afterEach(()=>vi.useRealTimers());
describe("Google mail protocol",()=>{
 it("signs exact canonical UTF8 fields, escapes HTML, contains no destination or secret",async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({ok:true,provider:"google-mail"})));
  const send=createGoogleMailDelivery({url:"https://google.example.test/exec",secret,fetch:fetcher});await send(message);await send(message);
  const [url,init]=fetcher.mock.calls[0];const body=JSON.parse(init.body);
  expect(url).toBe("https://google.example.test/exec");expect(init.method).toBe("POST");
  expect(Object.keys(body).sort()).toEqual(["v","kind","ts","nonce","subject","text","html","sig"].sort());
  expect(body.sig).toBe(createHmac("sha256",secret).update(JSON.stringify([body.v,body.kind,body.ts,body.nonce,body.subject,body.text,body.html]),"utf8").digest("hex"));
  expect(body.subject).toBe("SchoolSafe \u2014 nouveau compte \u00e0 approuver");expect(body.v).toBe(1);expect(body.kind).toBe("registration_approval");expect(Number.isInteger(body.ts)).toBe(true);expect(Math.abs(body.ts-Date.now()/1000)).toBeLessThan(2);
  expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(Buffer.from(body.nonce,"base64url")).toHaveLength(32);expect(JSON.parse(fetcher.mock.calls[1][1].body).nonce).not.toBe(body.nonce);
  expect(init.body).not.toContain(secret);expect(body.html).not.toContain(message.first_name);expect(body.html).toContain("&lt;Ada &amp; &quot;");expect(body.html).toContain("&gt;&#39;");expect(body.html).toContain("q=&quot;&amp;x=1");expect(body.text).toContain(message.approvalLink);
 });
 it.each([new Response("secret",{status:500}),new Response("bad json"),new Response('{}'),new Response('{"ok":false,"provider":"google-mail"}'),new Response('{"ok":true,"provider":"other"}')])("rejects unconfirmed responses without body leakage",async response=>{const send=createGoogleMailDelivery({url:"https://google.example.test",secret,fetch:vi.fn().mockResolvedValue(response)});await expect(send(message)).rejects.toThrow("Google mail delivery unavailable")});
 it("sanitizes fetch exceptions",async()=>{const send=createGoogleMailDelivery({url:"https://google.example.test",secret,fetch:vi.fn().mockRejectedValue(new Error(message.approvalLink))});await expect(send(message)).rejects.toThrow(/^Google mail delivery unavailable$/)});
 it.each(["fetch","body"])("aborts and bounds timeout during %s",async phase=>{
  vi.useFakeTimers();let signal:AbortSignal;
  const fetcher=vi.fn(async(_url,init)=>{signal=init.signal; if(phase==="fetch")return await new Promise(()=>{});return {ok:true,json:()=>new Promise(()=>{})}});
  const send=createGoogleMailDelivery({url:"https://google.example.test",secret,fetch:fetcher as any});
  const pending=expect(send(message)).rejects.toThrow(/^Google mail delivery unavailable$/);await vi.advanceTimersByTimeAsync(10000);await pending;expect(signal!.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it("requires HTTPS and nonempty secret",()=>{expect(()=>createGoogleMailDelivery({url:"http://google.example.test",secret})).toThrow();expect(()=>createGoogleMailDelivery({url:"https://google.example.test",secret:""})).toThrow()});
});
