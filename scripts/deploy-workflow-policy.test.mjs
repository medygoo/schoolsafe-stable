import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowUrl = new URL('../.github/workflows/deploy-production.yml', import.meta.url);

function indentation(line) {
  return line.match(/^\s*/)[0].length;
}

function topLevelOnTriggers(source) {
  const lines = source.split(/\r?\n/);
  const onIndex = lines.findIndex(line => /^on:\s*(?:#.*)?$/.test(line));
  assert.notEqual(onIndex, -1, 'DEPLOY_POLICY: top-level on: block is required');

  const triggers = [];
  for (let i = onIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (indentation(line) === 0) break;
    const match = line.match(/^  ([A-Za-z0-9_-]+):(?:\s|$)/);
    if (match) triggers.push(match[1]);
  }
  return triggers;
}

function blockAfter(source, headerPattern, indent) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex(line => headerPattern.test(line));
  assert.notEqual(start, -1, 'DEPLOY_POLICY: required workflow block is missing');

  const selected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() && indentation(line) <= indent) break;
    selected.push(line);
  }
  return selected.join('\n');
}

export function validateDeployWorkflow(source) {
  assert.deepEqual(
    topLevelOnTriggers(source),
    ['workflow_dispatch'],
    'DEPLOY_POLICY: production deployment must use workflow_dispatch only'
  );

  assert.doesNotMatch(
    source,
    /\bworkflow_run\b/,
    'DEPLOY_POLICY: workflow_run automatic deployment is forbidden'
  );

  const dispatchBlock = blockAfter(source, /^  workflow_dispatch:\s*$/, 2);
  assert.match(dispatchBlock, /^    inputs:\s*$/m, 'DEPLOY_POLICY: workflow_dispatch inputs are required');

  const shaBlock = blockAfter(source, /^      sha:\s*$/, 6);
  assert.match(shaBlock, /^        required:\s*true\s*$/m, 'DEPLOY_POLICY: exact SHA input must be required');
  assert.match(shaBlock, /^        type:\s*string\s*$/m, 'DEPLOY_POLICY: SHA input must be a string');

  assert.match(
    source,
    /vars\.SCHOOLSAFE_DEPLOY_ENABLED\s*==\s*'true'/,
    'DEPLOY_POLICY: SCHOOLSAFE_DEPLOY_ENABLED kill switch is required'
  );

  const shaInputUses = source.match(/COMMIT_SHA:\s*\$\{\{\s*inputs\.sha\s*\}\}/g) ?? [];
  assert.ok(shaInputUses.length >= 2, 'DEPLOY_POLICY: validation and deployer must both use inputs.sha');

  assert.ok(
    source.includes('test "$(git rev-parse origin/production)" = "$COMMIT_SHA"'),
    'DEPLOY_POLICY: requested SHA must equal checked-out production HEAD'
  );

  assert.ok(
    source.includes('git/ref/heads/production') &&
      source.includes('--jq .object.sha') &&
      source.includes('= "$COMMIT_SHA"'),
    'DEPLOY_POLICY: requested SHA must equal GitHub production HEAD'
  );

  assert.ok(
    source.includes('actions/workflows/ci.yml/runs?branch=production&event=push&head_sha=${COMMIT_SHA}&status=success&per_page=1'),
    'DEPLOY_POLICY: successful production CI for the exact SHA is required'
  );

  assert.ok(
    source.includes('test "$successful_runs" -ge 1'),
    'DEPLOY_POLICY: deploy must stop when no successful CI exists'
  );
}

test('production deployment policy is manual, exact-SHA and CI-gated', () => {
  const source = fs.readFileSync(workflowUrl, 'utf8');
  assert.doesNotThrow(() => validateDeployWorkflow(source));
});

test('policy rejects a workflow_run automatic deployment trigger', () => {
  const source = fs.readFileSync(workflowUrl, 'utf8');
  const automatic = source.replace(
    /on:\r?\n[\s\S]*?\r?\npermissions:/,
    'on:\n  workflow_run:\n    workflows: ["CI"]\n    types: [completed]\n\npermissions:'
  );
  assert.notEqual(automatic, source, 'DEPLOY_POLICY_TEST: fixture mutation must apply');
  assert.throws(
    () => validateDeployWorkflow(automatic),
    /workflow_dispatch only/,
    'DEPLOY_POLICY_TEST: automatic workflow_run must be rejected'
  );
});
