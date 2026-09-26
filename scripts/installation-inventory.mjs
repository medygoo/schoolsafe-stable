// Inventory and preflight only: this module never connects to a database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sha256Sql } from './migration-manifest.mjs';

export function installationInventory(root) {
  const sets = ['baseline', 'auth', 'access', 'finance', 'pedagogy', 'cards',
    'family', 'devicehub', 'dashboard', 'license', 'trial', 'projections', 'documents', 'setup'];
  const units = [];
  const versionPattern = /^v[1-9][0-9]*$/;

  for (const set of sets) {
    const setDir = path.join(root, 'database', set);
    if (!fs.existsSync(setDir) || !fs.statSync(setDir).isDirectory()) continue;

    const versions = fs.readdirSync(setDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && versionPattern.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));

    for (const version of versions) {
      const manifestPath = path.posix.join('database', set, version, 'manifest.json');
      const manifestAbs = path.join(root, manifestPath);
      if (!fs.existsSync(manifestAbs)) continue;

      const manifest = JSON.parse(fs.readFileSync(manifestAbs, 'utf8'));
      if (!Array.isArray(manifest.units)) continue;

      for (const unit of manifest.units) {
        const file = path.posix.join('database', set, version, unit.file);
        const absFile = path.join(root, file);
        assert.ok(fs.existsSync(absFile), `Missing SQL file ${file} declared in ${manifestPath}`);
        assert.equal(sha256Sql(fs.readFileSync(absFile)), unit.sha256, `SHA256 mismatch for ${file}`);
        units.push({
          set,
          file,
          manifest: manifestPath,
          orderInSet: unit.order,
          sha256: unit.sha256,
          status: 'DECLARED_IN_EXISTING_MANIFEST',
        });
      }
    }
  }

  // Historical special dispositions that are not in any manifest.
  const blocked = [
    {
      set: 'projections', file: 'database/projections/v1/02_student_list.sql',
      requires: ['baseline', 'auth', 'access'],
      blockers: [
        'student_create_draft declares required arguments after arguments with defaults (PostgreSQL 42P13).',
        'The planned enrollment status is absent from the canonical CHECK constraint.',
        'The school_id argument and per-student scope must be qualified before enabling these SECURITY DEFINER functions.',
      ],
    },
    {
      set: 'setup', file: 'database/setup/v1/01_setup_native.sql',
      requires: ['baseline', 'auth', 'access'],
      blockers: [
        'setup_create_admin omits the mandatory school_id in iam.profile_roles.',
        'The super_admin role lookup is not the canonical admin template/provisioning contract.',
        'Provisioning ACLs, RLS and the setup service contract require a dedicated security-qualified additive migration.',
      ],
    },
  ];
  for (const unit of blocked) {
    const absFile = path.join(root, unit.file);
    units.push({
      ...unit,
      sha256: sha256Sql(fs.readFileSync(absFile)),
      status: 'BLOCKED_REQUIRES_ADDITIVE_FIX',
      install: false,
    });
  }

  const resetFile = 'database/auth/v1/03_auth_reset.sql';
  const resetAbs = path.join(root, resetFile);
  if (fs.existsSync(resetAbs)) {
    units.push({
      set: 'auth',
      file: resetFile,
      sha256: sha256Sql(fs.readFileSync(resetAbs)),
      status: 'UNREGISTERED_REQUIRES_REVIEW',
      install: false,
      requires: ['baseline', 'auth'],
      blockers: ['Existing recovery unit outside the auth manifest; separate auth/security qualification required. No change authorized in the packaging lot.'],
    });
  }

  // Verify no duplicate entries.
  assert.equal(new Set(units.map(unit => unit.file)).size, units.length, 'Duplicate installation entry');

  // Discover all versioned SQL files and ensure each has a disposition.
  const discovered = [];
  const dbDir = path.join(root, 'database');
  for (const entry of fs.readdirSync(dbDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'installation') continue;
    const setDir = path.join(dbDir, entry.name);
    for (const versionEntry of fs.readdirSync(setDir, { withFileTypes: true })) {
      if (!versionEntry.isDirectory() || !versionPattern.test(versionEntry.name)) continue;
      const versionDir = path.join(setDir, versionEntry.name);
      for (const file of fs.readdirSync(versionDir)) {
        if (/^\d{2}_[a-z0-9_]+\.sql$/.test(file)) {
          discovered.push(`database/${entry.name}/${versionEntry.name}/${file}`);
        }
      }
    }
  }

  const unitFiles = new Set(units.map(u => u.file));
  const missing = discovered.filter(f => !unitFiles.has(f));
  assert.deepEqual(missing, [], `SQL files missing from installation inventory: ${missing.join(', ')}`);

  return {
    schema: 'schoolsafe-installation-inventory-v1',
    executable: false,
    status: 'BLOCKED_PENDING_FUNCTIONAL_SQL_QUALIFICATION',
    note: 'Inventory order is not a cross-set production execution plan. Existing per-set order is preserved. No automatic application or historical rewrite.',
    units,
  };
}