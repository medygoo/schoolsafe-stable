import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { generateAdminRecoveryCode, createAdminRecoveryService } from '../src/authnative/admin-recovery.js';
import { createAuthNativeService, type AuthDatabase } from '../src/authnative/service.js';
import { registerAuthNativeRoutes } from '../src/authnative/routes.js';
import { buildApp } from '../src/app.js';

const read = (file: string) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
function fixture(rows: Record<string, unknown>[] = []) {
  const calls: {sql: string; params: unknown[]}[] = [];
  const db: AuthDatabase = { async query<T>(sql: string, params: unknown[]) {
    calls.push({sql, params});
    return {rows: (sql.includes('auth_recovery_normalize_phone') ? [{auth_recovery_normalize_phone:'+243812345678'}] : rows) as T[]};
  }};
  const service = createAuthNativeService({db});
  const app = Fastify();
  registerAuthNativeRoutes(app, {service, cookieSecure: false});
  return {app, service, calls};
}

describe('Recovery R2', () => {
  it('generates exactly ten decimal digits', () => {
    for (let n=0;n<100;n++) expect(generateAdminRecoveryCode()).toMatch(/^\d{10}$/);
  });
  it('uses the official sixty minute TTL and five attempts', () => {
    expect(createAdminRecoveryService().config).toEqual({codeTtlMs: 3600000, maxAttempts: 5});
  });
  it('does not expose the database through the service', () => {
    expect(fixture().service).not.toHaveProperty('db');
    expect(read('server/src/native-app.ts')).not.toContain('authService as any');
  });
  it('migration 06 evolves the canonical table without redefining it', () => {
    const sql=read('database/auth/v2/06_admin_assisted_recovery.sql');
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS auth.admin_recovery_codes/i);
    expect(sql).not.toContain('generated_by_profile_id');
    expect(sql).not.toMatch(/WHERE used_at IS NULL AND expires_at > now\(\)/i);
  });
  it('requires an authenticated session for admin generation', async () => {
    const {app,calls}=fixture();
    const res=await app.inject({method:'POST',url:'/auth/recovery/admin/generate',payload:{targetProfileId:'00000000-0000-4000-8000-000000000002'}});
    expect(res.statusCode).toBe(401); expect(calls).toHaveLength(0); await app.close();
  });
  it.each(['abcdefghij','12345','12345678901','12345 7890','１２３４５６７８９０'])('rejects non-decimal admin code %s before querying', async code => {
    const {app,calls}=fixture(); await app.inject({method:'POST',url:'/auth/recovery/admin/redeem',payload:{login:'+243812345678',code}});
    expect(calls).toHaveLength(0); await app.close();
  });
  it('accepts a leading zero and issues only an opaque token in one SQL call', async () => {
    const {app,calls}=fixture([{auth_redeem_admin_recovery_code:true}]);
    const res=await app.inject({method:'POST',url:'/auth/recovery/admin/redeem',payload:{login:'+243812345678',code:'0123456789'}});
    expect(res.statusCode).toBe(200); expect(res.json().reset_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.json()).not.toHaveProperty('identity_id'); expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toHaveLength(3);
    expect(calls[0]?.params[2]).toMatch(/^[a-f0-9]{64}$/);
    expect(calls[0]?.params).not.toContain(res.json().reset_token); await app.close();
  });
  it('returns the same public refusal for an unmatched parent', async () => {
    const {app}=fixture([{auth_recover_parent_account:false}]);
    const res=await app.inject({method:'POST',url:'/auth/recover/parent',payload:{parentFullName:'Test Parent',phoneNumber:'+243812345678',childFullName:'Test Child',className:'Class A'}});
    expect(res.statusCode).toBe(400); expect(res.json().message).toBe('Les informations saisies ne permettent pas de confirmer votre identité.'); await app.close();
  });
  it('passes only a token digest and canonical attempt fingerprint to the parent function', async () => {
    const {app,calls}=fixture([{auth_recover_parent_account:true}]);
    const res=await app.inject({method:'POST',url:'/auth/recover/parent',payload:{parentFullName:'Test Parent',phoneNumber:'243812345678',childFullName:'Test Child',className:'Class A'}});
    expect(res.statusCode).toBe(200); expect(calls).toHaveLength(2);
    expect(calls[1].params[4]).toBe(createHash('sha256').update(res.json().reset_token).digest('hex'));
    expect(calls[1].params[5]).toBe(createHash('sha256').update('recovery-parent-v1\n+243812345678').digest('hex'));
    expect(calls.every(c=>c.sql.startsWith('select * from api.'))).toBe(true); await app.close();
  });
  it('does not allow browser-supplied administrative identity or school', async () => {
    const {app,calls}=fixture([{session_id:'session',profile_id:'00000000-0000-4000-8000-000000000001'}]);
    await app.inject({method:'POST',url:'/auth/recovery/admin/generate',headers:{cookie:'schoolsafe_session=test'},payload:{targetProfileId:'00000000-0000-4000-8000-000000000002',adminProfileId:'forged',schoolId:'forged'}});
    expect(calls).toHaveLength(1); expect(calls[0].sql).toContain('auth_resolve_session'); await app.close();
  });
  it('generates a code only after server-session target resolution', async () => {
    const actor='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002',identity='00000000-0000-4000-8000-000000000003';
    const {app,calls}=fixture([{profile_id:actor,auth_resolve_admin_recovery_target:identity,auth_admin_generate_recovery_code:'CODE_GENERATED'}]);
    const response=await app.inject({method:'POST',url:'/auth/recovery/admin/generate',headers:{cookie:'schoolsafe_session=opaque'},payload:{targetProfileId:target}});
    expect(response.statusCode).toBe(200);expect(response.json().code).toMatch(/^\d{10}$/);expect(response.json().expiresInMinutes).toBe(60);
    expect(calls[1].params).toEqual([actor,target]);expect(calls[2].params).toEqual([actor,identity,createHash('sha256').update(response.json().code).digest('hex')]);
    expect(response.body).not.toContain(identity);await app.close();
  });
  it('refuses a target rejected by PostgreSQL without generating a code', async () => {
    const {app,calls}=fixture([{profile_id:'00000000-0000-4000-8000-000000000001',auth_resolve_admin_recovery_target:null}]);
    const response=await app.inject({method:'POST',url:'/auth/recovery/admin/generate',headers:{cookie:'schoolsafe_session=opaque'},payload:{targetProfileId:'00000000-0000-4000-8000-000000000002'}});
    expect(response.statusCode).toBe(403);expect(calls).toHaveLength(2);expect(response.json()).not.toHaveProperty('codeHash');await app.close();
  });
  it.each(['/auth/recover/parent','/auth/recover/profile','/auth/recovery/admin/redeem'])('does not expose proof or database errors for %s', async url => {
    const output=vi.spyOn(console,'log').mockImplementation(()=>{});
    const errors=vi.spyOn(console,'error').mockImplementation(()=>{});
    const db: AuthDatabase={async query(){throw new Error('SYNTHETIC_DATABASE_SECRET');}};
    const app=buildApp({authNative:{service:createAuthNativeService({db}),cookieSecure:false}});
    try {
      const payload=url.endsWith('parent')?{parentFullName:'Synthetic Private Parent',phoneNumber:'+243812345678',childFullName:'Synthetic Private Child',className:'Class A'}:url.endsWith('profile')?{fullName:'Synthetic Private User',phoneNumber:'+243812345678',schoolName:'Synthetic School',roleName:'admin'}:{login:'+243812345678',code:'0123456789'};
      const response=await app.inject({method:'POST',url,payload});
      expect(response.statusCode).toBe(500);expect(response.body).not.toMatch(/SYNTHETIC_DATABASE_SECRET|0123456789|Synthetic Private|243812345678/);
      expect(output).not.toHaveBeenCalled();expect(errors).not.toHaveBeenCalled();
    } finally {await app.close();output.mockRestore();errors.mockRestore();}
  });
  it('does not send an arbitrary plaintext password to PostgreSQL', async () => {
    const {service,calls}=fixture([{auth_reset_password:true}]);
    await service.resetPassword('opaque-token','argon-hash','Strong unrelated password');
    expect(calls[0].params).toEqual([createHash('sha256').update('opaque-token').digest('hex'),'argon-hash',null]);
    await service.resetPassword('opaque-token','argon-hash','243812345678');
    expect(calls[1].params[2]).toBe('243812345678');
  });
  it.each(['0812/345/678','[+243] 812-345-678','00 243 / 812 / 345 / 678'])('checks canonical phone password even with separators: %s', async password => {
    const {service,calls}=fixture([{auth_reset_password:false}]);
    expect(await service.resetPassword('opaque-token','argon-hash',password)).toBe(false);
    expect(calls[0].params[2]).toBe(password);
  });
  it('uses the existing browser auth client with cookies and no persistent token storage', async () => {
    const requests: {url: string; options: {body: string; credentials: string}}[]=[];
    const window: {location: {hostname: string; origin: string}; SchoolSafeAuthNative?: Record<string,(...args: string[])=>Promise<unknown>>}={location:{hostname:'example.test',origin:'https://example.test'}};
    const storage={setItem(){throw new Error('Recovery may not persist credentials');}};
    runInNewContext(read('app/modules/authnative/auth-native.js'),{window,localStorage:storage,sessionStorage:storage,fetch:async(url:string,options:{body:string;credentials:string})=>{requests.push({url,options});return {ok:true,json:async()=>({reset_token:'opaque'})};}});
    const client=window.SchoolSafeAuthNative!;
    await client.recoverParent('Parent','Phone','Child','Class');
    await client.recoverProfile('User','Phone','School','teacher');
    await client.redeemAdminRecoveryCode('Phone','0123456789');
    await client.reset('opaque','Strong password');
    expect(requests.map(r=>r.url)).toEqual(['/auth/recover/parent','/auth/recover/profile','/auth/recovery/admin/redeem','/auth/native/reset'].map(p=>'https://example.test'+p));
    expect(requests.every(r=>r.options.credentials==='include')).toBe(true);
    expect(JSON.parse(requests[2].options.body)).toEqual({login:'Phone',code:'0123456789'});
  });
  it.each(['admin','teacher','cashier','guard','hr','staff'])('supports autonomous recovery for %s', async roleName => {
    const {app,calls}=fixture([{auth_recover_profile_account:true}]);
    const res=await app.inject({method:'POST',url:'/auth/recover/profile',payload:{fullName:'Test User',phoneNumber:'+243812345678',schoolName:'Test School',roleName}});
    expect(res.statusCode).toBe(200); expect(res.json().reset_token).toBeTruthy();
    expect(calls).toHaveLength(1); expect(calls[0]?.sql).toContain('api.auth_recover_profile_account'); await app.close();
  });
  it.each(['12345678','password','password123','azertyui','qwertyui','11111111'])('rejects trivial reset password %s', async password => {
    const {app,calls}=fixture([{auth_reset_password:true}]);
    const res=await app.inject({method:'POST',url:'/auth/native/reset',payload:{token:'a'.repeat(43),password}});
    expect(res.statusCode).toBe(400); expect(calls).toHaveLength(0); await app.close();
  });
  it('keeps all recovery HTTP calls in the existing auth client', () => {
    const source=read('app/app.js'); const start=source.indexOf('document.getElementById("forgotPassword").addEventListener');
    const block=source.slice(start,source.indexOf('\n  });', start)+7);
    expect(block).not.toMatch(/apiPost\(/); expect(block).not.toContain('getRecoveryMethods');
    expect(block).toContain('recoverParent'); expect(block).toContain('recoverProfile');
    expect(block).toContain('redeemAdminRecoveryCode');
  });
});
