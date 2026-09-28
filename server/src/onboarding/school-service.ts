import type { AuthDatabase } from "../authnative/service.js";
import {controlUnavailable, type ControlAdminClient} from "../authnative/control-client.js";
import {hashSessionToken,generateSessionToken} from "../authnative/tokens.js";
import {SchoolSafeError} from "../http/errors.js";
import {onboardingSchoolSchema} from "./school-schema.js";
export interface OnboardingIdentity {first_name:string;last_name:string;email:string|null;phone:string|null;status:"onboarding"}
export interface OnboardingSchoolResult {school_id:string;profile_id:string;status:"completed";token:string}
export function createOnboardingSchoolService(db:AuthDatabase,control?:ControlAdminClient) {
 async function resolve(token:string) {
  const result=await db.query<{result:(OnboardingIdentity & {access_id:string})|null}>("select api.auth_resolve_onboarding_session($1) result",[hashSessionToken(token)]);
  const row=result.rows[0]?.result;
  if(!row||row.status!=="onboarding"||!row.access_id)return null;
  if(!control)throw controlUnavailable();
  const status=await control.status(row.access_id);
  if(status.status!=="active") {
   await db.query("select api.auth_control_revoke_sessions($1)",[row.access_id]);
   throw new SchoolSafeError(403,"ACCESS_DENIED","Accès administrateur suspendu ou révoqué",false);
  }
  if(status.school_id)throw new SchoolSafeError(409,"VERSION_CONFLICT","École déjà rattachée",false);
  return row;
 }
 function translate(error:unknown):never {
  if(error instanceof SchoolSafeError)throw error;
  const code=(error as {code?:string})?.code;
  if(code==="42501")throw new SchoolSafeError(403,"ACCESS_DENIED","Session invalide ou expirée",false);
  if(["23514","22007","22008"].includes(code??""))throw new SchoolSafeError(400,"VALIDATION_INVALID","Donnée invalide",false);
  throw controlUnavailable();
 }
 return {
  async me(token:string):Promise<OnboardingIdentity|null> {
   try {const row=await resolve(token);return row?{first_name:row.first_name,last_name:row.last_name,email:row.email,phone:row.phone,status:"onboarding"}:null;}
   catch(error){return translate(error);}
  },
  async logout(token:string):Promise<void> {
   try {await db.query("select api.auth_revoke_onboarding_session($1)",[hashSessionToken(token)]);}catch(error){translate(error);}
  },
  async createSchool(token:string,input:unknown):Promise<OnboardingSchoolResult> {
   const payload=onboardingSchoolSchema.parse(input);
   try {
    const identity=await resolve(token);
    if(!identity)throw new SchoolSafeError(403,"ACCESS_DENIED","Session invalide ou expirée",false);
    const normal=generateSessionToken();
    const result=await db.query<{result:OnboardingSchoolResult & {access_id:string}}>(
     "select api.auth_activate_school($1,$2::jsonb,$3) result",[hashSessionToken(token),JSON.stringify(payload),hashSessionToken(normal)]);
    const row=result.rows[0]?.result;if(!row||row.status!=="completed"||row.access_id!==identity.access_id)throw controlUnavailable();
    try {await control!.bind(identity.access_id,row.school_id);}
    catch(error) {if(!(error instanceof SchoolSafeError)||error.statusCode!==503)throw error;}
    return {school_id:row.school_id,profile_id:row.profile_id,status:"completed",token:normal};
   }catch(error){return translate(error);}
  }
 };
}
export type OnboardingSchoolService=ReturnType<typeof createOnboardingSchoolService>;
