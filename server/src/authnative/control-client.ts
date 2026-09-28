import { z } from "zod";
import { SchoolSafeError } from "../http/errors.js";
const statusSchema=z.object({access_id:z.string().uuid(),status:z.enum(["active","suspended","revoked"]),school_id:z.string().uuid().nullable()});
const verifiedSchema=statusSchema.extend({status:z.literal("active"),onboarding_required:z.boolean(),email:z.string().email().nullable(),phone:z.string().regex(/^\+243[0-9]{9}$/).nullable()}).refine(v=>!!(v.email||v.phone)&&v.onboarding_required===(v.school_id===null));
export type ControlAdminStatus=z.infer<typeof statusSchema>;
export type ControlAdminVerified=z.infer<typeof verifiedSchema>;
export interface ControlAdminClient {
 verify(login:string,password:string):Promise<ControlAdminVerified|null>;
 status(accessId:string):Promise<ControlAdminStatus>;
 bind(accessId:string,schoolId:string):Promise<void>;
}
export const controlUnavailable=()=>new SchoolSafeError(503,"DEPENDENCY_UNAVAILABLE","Service d’accès temporairement indisponible",true);
export function createControlAdminClient(url:string,secret:string,fetcher:typeof fetch=fetch):ControlAdminClient {
 async function request(path:string,body?:unknown) {
  try {
   const base=new URL(url);
   if(base.username||base.password||base.search||base.hash||!(base.protocol==="https:"||(base.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(base.hostname)))) throw controlUnavailable();
   if(!secret) throw controlUnavailable();
   const response=await fetcher(url.replace(/\/$/,"")+path,{method:body===undefined?"GET":"POST",
    redirect:"error",signal:AbortSignal.timeout(5000),headers:{"content-type":"application/json","x-schoolsafe-bootstrap-secret":secret},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
   const text=await response.text();if(text.length>16384)throw controlUnavailable();
   let data:any;try {data=JSON.parse(text);}catch {throw controlUnavailable();}
   return {status:response.status,body:data};
  }catch {throw controlUnavailable();}
 }
 return {
  async verify(login,password) {
   const r=await request("/internal/school-admin-access/verify",{login,password});
   if(r.status===401&&r.body?.code==="AUTH_INVALID")return null;
   if(r.status===403&&["ACCESS_SUSPENDED","ACCESS_REVOKED"].includes(r.body?.code))throw new SchoolSafeError(403,"ACCESS_DENIED","Accès administrateur suspendu ou révoqué",false);
   if(r.status!==200)throw controlUnavailable();
   const parsed=verifiedSchema.safeParse(r.body?.data);if(!parsed.success)throw controlUnavailable();
   return parsed.data;
  },
  async status(accessId) {
   const r=await request("/internal/school-admin-access/"+encodeURIComponent(accessId)+"/status");
   const parsed=statusSchema.safeParse(r.body?.data);
   if(r.status!==200||!parsed.success||parsed.data.access_id!==accessId)throw controlUnavailable();
   return parsed.data;
  },
  async bind(accessId,schoolId) {
   const r=await request("/internal/school-admin-access/"+encodeURIComponent(accessId)+"/bind-school",{school_id:schoolId});
   if(r.status===409)throw new SchoolSafeError(409,"VERSION_CONFLICT","Rattachement de l’école incohérent",false);
   if(r.status===403)throw new SchoolSafeError(403,"ACCESS_DENIED","Accès administrateur refusé",false);
   if(r.status!==200||r.body?.data?.access_id!==accessId||r.body?.data?.school_id!==schoolId)throw controlUnavailable();
  }
 };
}
