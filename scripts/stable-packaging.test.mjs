import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { scan } from '../docs/migration/2026-09-19-stable-preparation/scan-selection.mjs';

test('Docker preserves the server/app/shared sibling layout used by index.ts', () => {
  const recipe = fs.readFileSync('Dockerfile', 'utf8');
  assert.match(recipe, /WORKDIR \/app\/server/);
  assert.match(recipe, /COPY app\/ \/app\/app\//);
  assert.match(recipe, /COPY shared\/ \/app\/shared\//);
  assert.match(recipe, /COPY --from=builder \/app\/server\/dist\/ \.\/dist\//);
  assert.match(recipe, /CMD \["node", "dist\/src\/index.js"\]/);
});

test('the Docker context includes the permission catalogue and excludes local preparation', () => {
  const patterns = fs.readFileSync('.dockerignore', 'utf8').split(/\r?\n/);
  assert.ok(!patterns.includes('shared/'), 'shared/ is a runtime dependency');
  assert.ok(patterns.includes('.migration-staging/'));
  assert.ok(patterns.includes('.claude/'));
  assert.ok(patterns.includes('.worktrees/'));
});

test('Docker uses the current workspace lock, matching the server dependencies', () => {
  const recipe = fs.readFileSync('Dockerfile', 'utf8');
  assert.match(recipe, /COPY package.json package-lock.json \.\//);
  assert.match(recipe, /npm ci --workspace server --include-workspace-root=false/);
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const pkg = JSON.parse(fs.readFileSync('server/package.json', 'utf8'));
  assert.deepEqual(lock.packages.server.dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages.server.devDependencies, pkg.devDependencies);
});

test('installation accounts for both historical orphan SQL units without executing them', () => {
  const plan = JSON.parse(fs.readFileSync('database/installation/manifest.json', 'utf8'));
  assert.equal(plan.executable, false);
  assert.equal(plan.units.length, 46);
  assert.equal(plan.units.find(item => item.file === 'database/auth/v1/03_auth_reset.sql').install, false);
  for (const file of ['database/projections/v1/02_student_list.sql', 'database/setup/v1/01_setup_native.sql']) {
    const unit = plan.units.find(item => item.file === file);
    assert.equal(unit?.status, 'BLOCKED_REQUIRES_ADDITIVE_FIX', file);
    assert.match(unit.sha256, /^[a-f0-9]{64}$/);
    assert.ok(unit.requires.length && unit.blockers.length);
  }
  const projections = plan.units.filter(item => item.set === 'projections' && item.status === 'DECLARED_IN_EXISTING_MANIFEST');
  assert.equal(projections.at(-1).file, 'database/projections/v1/08_session_denial_contract.sql');
});

test('the final scanner flags secrets in tests and rejects new unreviewed literals', () => {
  const bytes = Buffer.from(['ghp', 'x'.repeat(36)].join('_'));
  assert.equal(scan([{ path: 'server/tests/example.test.ts', bytes }]).findings[0].rule, 'github-token');
  assert.equal(scan([{ path: '.env', bytes: Buffer.from('nothing') }]).findings[0].rule, 'private-path');
  assert.equal(scan([{ path: 'server/tests/setup.test.ts', bytes: Buffer.from('token: "' + 'changed-value-123456789' + '"') }]).literalCandidates.length, 1);
});
