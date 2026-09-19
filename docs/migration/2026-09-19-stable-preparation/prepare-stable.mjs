// Creates ONE new local copy. Refuses existing destinations. No Git/network/SQL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { selectFiles, selectedBytes, folder, metadata } from './selection.mjs';
import { scan } from './scan-selection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const destination = path.join(root, '.migration-staging/schoolsafe-stable');
assert.ok(!fs.existsSync(destination), 'Destination exists: preserve it; review before any new copy.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const selection = selectFiles(root);
const entries = selection.files.map(p => ({ path: p, ...selectedBytes(root, p) }));
const scanResult = scan(entries);
assert.equal(scanResult.findings.length + scanResult.literalCandidates.length + scanResult.metadataCandidates.length, 0,
  'Unresolved scan findings: run scan-selection.mjs; values will not be displayed.');
const original = JSON.parse(fs.readFileSync(path.join(root, 'docs/migration/2026-09-19-base-stable/files.json'), 'utf8'));
const allowedSourceChanges = new Set(['AGENTS.md', '.gitignore', '.dockerignore', 'Dockerfile',
  'scripts/check-migration-versions.mjs', 'docs/PROJECT_CONTEXT.md', 'docs/DECISIONS.md',
  'docs/CURRENT_HANDOFF.md', 'docs/superpowers/plans/2026-09-16-schoolsafe-functional-integration.md']);
for (const entry of entries) {
  const previous = original.files.find(f => f.path === entry.path);
  if (previous && !allowedSourceChanges.has(entry.path)) {
    assert.equal(hash(fs.readFileSync(path.join(root, entry.path))), previous.sha256, `Unexpected source change: ${entry.path}`);
  }
}
const records = entries.map(e => ({ path: e.path,
  sourceSha256: hash(fs.readFileSync(path.join(root, e.path))), sha256: hash(e.bytes),
  bytes: e.bytes.length, transformation: e.transformation,
  category: original.files.find(f => f.path === e.path)?.proposedDestination || 'MIGRATION_ADDITION' }));
const report = { schema: 'schoolsafe-stable-final-selection-v1', date: '2026-09-19',
  sourceCommit: original.sourceCommit, target: 'medygoo/schoolsafe-stable',
  status: 'LOCAL_COPY_ONLY_NO_PUSH_NO_DEPLOYMENT', sourceCounts: selection.sourceCounts,
  files: records, manifestArtifacts: metadata, totalSelectedPaths: records.length + metadata.length,
  excluded: selection.excluded, scan: scanResult,
  limits: ['Docker daemon unavailable: no Linux image build/run.',
    'SQL inventory complete; global installation blocked pending separate functional fixes.',
    'Existing Device Hub/family/cards alerts unchanged.', 'Full application and production not validated.'] };
fs.writeFileSync(path.join(root, metadata[0]), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
const paths = [...records.map(r => r.path), ...metadata].sort();
fs.writeFileSync(path.join(root, metadata[1]), `${paths.join('\n')}\n`, { flag: 'wx' });
const all = [...entries, ...metadata.map(p => ({ path: p, bytes: fs.readFileSync(path.join(root, p)) }))];
fs.mkdirSync(destination, { recursive: true });
for (const entry of all) {
  const target = path.resolve(destination, entry.path);
  assert.ok(target.startsWith(destination + path.sep));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, entry.bytes, { flag: 'wx' });
  assert.equal(hash(fs.readFileSync(target)), hash(entry.bytes), entry.path);
}
fs.writeFileSync(path.join(root, '.migration-staging/preparation-receipt.json'), JSON.stringify({
  date: report.date, destination, files: all.map(e => ({ path: e.path, sha256: hash(e.bytes) })),
}, null, 2) + '\n', { flag: 'wx' });
console.log(`Prepared ${all.length} files, 14 exclusions, 3 explicitly recorded text adaptations. No Git operation.`);
