import {describe, expect, it} from 'vitest';
import {generateKeyPairSync, sign} from 'node:crypto';
import {computeLicenseState, verifyLicenseToken} from '../src/licensenative/license.js';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({type:'spki',format:'pem'}).toString();
const payload = {license_id:'test-perpetual', school_id:'33333333-3333-4333-8333-333333333333',
  status:'active' as const, issued_at:'2026-09-29T00:00:00Z', expires_at:null, perpetual:true, grace_days:0};
function token(data:unknown) {
  const body=Buffer.from(JSON.stringify(data)).toString('base64url');
  return body+'.'+sign(null,Buffer.from(body),keys.privateKey).toString('base64url');
}
describe('explicit signed perpetual licenses',()=>{
  it('stays active without fabricating an expiry date',()=>{
    const verified=verifyLicenseToken(token(payload),publicKey)!;
    expect(verified).not.toBeNull();
    expect(computeLicenseState(verified,new Date('2126-01-01'),new Date())).toBe('active');
  });
  it.each(['suspended','revoked'] as const)('still enforces %s',status=>{
    const verified=verifyLicenseToken(token({...payload,status}),publicKey)!;
    expect(computeLicenseState(verified,new Date(),new Date())).toBe(status);
  });
  it('refuses a missing marker, missing date or contradictory expiry',()=>{
    for(const data of [{...payload,perpetual:undefined},{...payload,expires_at:undefined},
      {...payload,perpetual:false},{...payload,grace_days:1},{...payload,expires_at:'2030-01-01T00:00:00Z'}]) {
      expect(verifyLicenseToken(token(data),publicKey)).toBeNull();
    }
  });
  it('does not grant perpetual access when a dated token is altered',()=>{
    const dated={...payload,perpetual:undefined,expires_at:'2027-01-01T00:00:00Z'};
    const signature=token(dated).split('.')[1];
    expect(verifyLicenseToken(Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+signature,publicKey)).toBeNull();
    expect(verifyLicenseToken(token(dated),publicKey)?.expires_at).toBe(dated.expires_at);
  });
});
