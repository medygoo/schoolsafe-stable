import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startPreview } from './qa-static-preview.mjs';

const preview = await startPreview(process.env.SCHOOLSAFE_QA_ROOT || process.cwd());
const tests = process.argv.slice(2);
assert.ok(tests.length, 'Pass the browser QA scripts to run');
try {
  for (const file of tests) {
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--require', path.resolve('scripts/qa-local-network.cjs'), file], {
        stdio: 'inherit', env: { ...process.env, SCHOOLSAFE_URL: preview.url },
      });
      child.on('error', reject); child.on('exit', resolve);
    });
    assert.equal(status, 0, file);
  }
  assert.deepEqual([...preview.missing], [], 'No missing runtime asset in browser QA');
  console.log('PASS: browser QA used this checkout; no missing runtime asset; external requests blocked.');
} finally { await preview.close(); }
