import {describe, expect, it} from 'vitest';
import {generateKeyPairSync, sign} from 'node:crypto';
import {computeLicenseStateV1, verifySignedLicenseV1, canonicalizePayloadV1} from '../src/licensenative/license.js';

const keys = generateKeyPairSync('ed25519');
const keyId = 'test-perpetual-key';
const publicKeyPem = keys.publicKey.export({type:'spki',format:'pem'}).toString();
const registry = new Map([[keyId, publicKeyPem]]);

const basePayload = {
  version: 1 as const,
  license_id: '33333333-3333-4333-8333-333333333333',
  school_id: 'school-perpetual-test',
  installation_id: '44444444-4444-4444-4444-444444444444',
  status: 'active' as const,
  plan: 'school-perpetual',
  modules: ['core'],
  issued_at: '2026-09-29T00:00:00.000Z',
  expires_at: null,
  perpetual: true,
  key_id: keyId,
};

function makeEnvelope(payload: Record<string, unknown>) {
  const canonical = canonicalizePayloadV1(payload);
  const signature = sign(null, Buffer.from(canonical, 'utf8'), keys.privateKey).toString('base64url');
  return { payload, signature };
}

describe('explicit signed perpetual licenses (Activation Service V1)', () => {
  it('stays active without fabricating an expiry date', () => {
    const verified = verifySignedLicenseV1(makeEnvelope(basePayload), registry)!;
    expect(verified).not.toBeNull();
    expect(computeLicenseStateV1(verified.payload, new Date('2126-01-01'))).toBe('active');
  });

  it.each(['suspended', 'revoked'] as const)('still enforces %s', status => {
    const verified = verifySignedLicenseV1(makeEnvelope({...basePayload, status}), registry)!;
    expect(computeLicenseStateV1(verified.payload, new Date())).toBe(status);
  });

  it('refuses a missing marker, missing date or contradictory expiry', () => {
    for (const data of [
      {...basePayload, perpetual: undefined},
      {...basePayload, expires_at: undefined},
      {...basePayload, perpetual: false},
      {...basePayload, expires_at: '2030-01-01T00:00:00.000Z'},
    ]) {
      expect(verifySignedLicenseV1(makeEnvelope(data), registry)).toBeNull();
    }
  });

  it('does not grant perpetual access when a dated token is altered', () => {
    const dated = {...basePayload, perpetual: false, expires_at: '2027-01-01T00:00:00.000Z'};
    const validDated = makeEnvelope(dated);
    // Tamper: swap payload to perpetual but keep dated signature → must fail
    const tampered = {payload: basePayload, signature: validDated.signature};
    expect(verifySignedLicenseV1(tampered, registry)).toBeNull();
    // Valid dated envelope still works
    const verifiedDated = verifySignedLicenseV1(validDated, registry);
    expect(verifiedDated?.payload.expires_at).toBe(dated.expires_at);
  });
});