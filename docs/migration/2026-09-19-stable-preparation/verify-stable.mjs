// Verify the prepared repository or an explicit local copy, read-only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { folder } from './selection.mjs';
import { scan } from './scan-selection.mjs';
const root = path.resolve(process.argv[2] || '.');
const report = JSON.parse(fs.readFileSync(path.join(root, folder, 'final-files.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of report.files) assert.equal(hash(fs.readFileSync(path.join(root, file.path))), file.sha256, file.path);
for (const file of report.excluded) assert.ok(!fs.existsSync(path.join(root, file.path)), `Excluded file present: ${file.path}`);
const expected = [...report.files.map(f => f.path), ...report.manifestArtifacts].sort();
assert.equal(new Set(expected).size, expected.length);
const actual = [];
function walk(directory, prefix = '') {
  for (const e of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!prefix && e.name === '.git') continue;
    assert.ok(!e.isSymbolicLink(), 'No links in prepared repository');
    const p = prefix + e.name;
    if (e.isDirectory()) walk(path.join(directory, e.name), p + '/');
    else actual.push(p);
  }
}
walk(root);
assert.deepEqual(actual.sort(), expected, 'Missing or unexpected files');
assert.deepEqual(fs.readFileSync(path.join(root, folder, 'final-files.txt'), 'utf8').trim().split('\n'), expected);
const result = scan(expected.map(p => ({ path: p, bytes: fs.readFileSync(path.join(root, p)) })));
assert.equal(result.findings.length + result.literalCandidates.length + result.metadataCandidates.length, 0);
console.log(JSON.stringify({ status: 'PASS', files: expected.length, excluded: report.excluded.length, scan: result }, null, 2));
