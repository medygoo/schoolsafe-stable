// Packaging regression: actual batch/ZIP code, synthetic pool/R2/Control adapters.
import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import type { BusinessPool } from '../src/db/pool.js';
import { createCardsBatchService } from '../src/cardsnative/batches.js';
import { uploadBuffer } from '../src/storage/r2.js';
import { pushCardPrintBatch } from '../src/control-app/client.js';

vi.mock('../src/storage/r2.js', () => ({
  createR2Client: vi.fn(() => ({})), uploadBuffer: vi.fn(async () => {}),
  getSignedDownloadUrl: vi.fn(async (_client: unknown, _bucket: string, key: string) => 'https://synthetic.invalid/' + key),
}));
vi.mock('../src/control-app/client.js', () => ({
  pushCardPrintBatch: vi.fn(async () => ({ id: 'synthetic-control-batch' })),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const context = { userId: 'synthetic-user', profileId: 'synthetic-profile', schoolId: 'synthetic-school', requestId: 'synthetic-request' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');

it('keeps recto/verso PNG bytes, hashes, school_id, version and the existing Control batch contract', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const client = { release() {}, async query(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    if (sql.includes('select r.id request_id')) return { rows: [{ request_id: 'synthetic-request', student_id: 'synthetic-student', student_name: 'Synthetic pupil', matricule: 'SYNTHETIC-001', card_number: 'SYNTHETIC-CARD', format: 'badge', version: 2, front_r2_key: 'front.png', back_r2_key: 'back.png' }] };
    if (sql.includes('coalesce(max')) return { rows: [{ n: 3 }] };
    if (sql.includes('select name from app.schools')) return { rows: [{ name: 'Synthetic school' }] };
    return { rows: [] };
  } };
  const pool = { connect: async () => client } as unknown as BusinessPool;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(png))));
  const service = createCardsBatchService(pool,
    { endpoint: 'https://synthetic.invalid', accessKeyId: 'test-key', secretAccessKey: 'test-secret', bucket: 'synthetic-cards' },
    { url: 'https://synthetic.invalid', instanceId: 'synthetic-instance', hmacSecret: 'test-secret' });
  const result = await service.buildBatch(context, { status: 'submitted' });
  expect(calls[0].sql).toBe('BEGIN');
  expect(calls[1].sql).toContain('api.set_request_context');
  expect(calls[1].params.slice(0, 3)).toEqual([context.userId, context.profileId, context.schoolId]);
  const selection = calls.find(c => c.sql.includes('select r.id request_id'))!;
  expect(selection.sql).toContain('r.school_id = $1');
  expect(selection.params).toEqual([context.schoolId, 'submitted']);
  expect(calls.at(-1)?.sql).toBe('COMMIT');
  const upload = vi.mocked(uploadBuffer).mock.calls[0];
  expect(upload[1]).toBe('synthetic-cards');
  expect(upload[2]).toMatch(/^cards\/synthetic-school\/batches\/.*\/v3\/cards.zip$/);
  expect(upload[4]).toBe('application/zip');
  const zip = upload[3];
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8), size = zip.readUInt32LE(offset + 18);
    const nameSize = zip.readUInt16LE(offset + 26), extraSize = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameSize).toString();
    const start = offset + 30 + nameSize + extraSize, payload = zip.subarray(start, start + size);
    expect([0, 8]).toContain(method);
    entries.set(name, method === 8 ? inflateRawSync(payload) : payload);
    offset = start + size;
  }
  expect(entries.size).toBe(3);
  expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
  expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  expect(zip.readUInt16LE(zip.length - 12)).toBe(3);
  const manifest = JSON.parse(entries.get('manifest.json')!.toString());
  expect(manifest).toMatchObject({ school_id: context.schoolId, version: 3, card_count: 1 });
  const card = manifest.cards[0];
  expect(entries.get(card.front_file)).toEqual(png);
  expect(entries.get(card.back_file)).toEqual(png);
  expect(card.front_sha256).toBe(hash(png)); expect(card.back_sha256).toBe(hash(png));
  expect(result.zip_sha256).toBe(hash(zip));
  expect(result.control_batch_id).toBe('synthetic-control-batch');
  expect(vi.mocked(pushCardPrintBatch).mock.calls[0][1]).toMatchObject({ school_id: context.schoolId, version: 3, card_count: 1, zip_sha256: hash(zip), r2_key: result.r2_key });
});
it('still rejects a batch when R2 is not configured', async () => {
  const connect = vi.fn();
  await expect(createCardsBatchService({ connect } as unknown as BusinessPool).buildBatch(context, {})).rejects.toThrow('R2');
  expect(connect).not.toHaveBeenCalled();
});
