// Inventory and preflight only: this module never connects to a database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sha256Sql } from './migration-manifest.mjs';

export function installationInventory(root) {
  const sets = ['baseline', 'auth', 'access', 'finance', 'pedagogy', 'cards',
    'family', 'devicehub', 'dashboard', 'license', 'trial', 'projections', 'documents'];
  const units = [];
  for (const set of sets) {
    const manifestPath = `database/${set}/v1/manifest.json`;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
    for (const unit of manifest.units) {
      const file = `database/${set}/v1/${unit.file}`;
      assert.equal(sha256Sql(fs.readFileSync(path.join(root, file))), unit.sha256, file);
      units.push({ set, file, manifest: manifestPath, orderInSet: unit.order,
        sha256: unit.sha256, status: 'DECLARED_IN_EXISTING_MANIFEST' });
    }
  }
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
  for (const unit of blocked) units.push({ ...unit,
    sha256: sha256Sql(fs.readFileSync(path.join(root, unit.file))),
    status: 'BLOCKED_REQUIRES_ADDITIVE_FIX', install: false });
  const resetFile = 'database/auth/v1/03_auth_reset.sql';
  units.push({ set: 'auth', file: resetFile, sha256: sha256Sql(fs.readFileSync(path.join(root, resetFile))),
    status: 'UNREGISTERED_REQUIRES_REVIEW', install: false, requires: ['baseline', 'auth'],
    blockers: ['Existing recovery unit outside the auth manifest; separate auth/security qualification required. No change authorized in the packaging lot.'] });

  // Every versioned top-level SQL must have an explicit disposition.
  const discovered = [];
  for (const entry of fs.readdirSync(path.join(root, 'database'), { withFileTypes: true })) {
    const directory = path.join(root, 'database', entry.name, 'v1');
    if (!entry.isDirectory() || !fs.existsSync(directory)) continue;
    for (const file of fs.readdirSync(directory)) {
      if (/^\d{2}_[a-z0-9_]+\.sql$/.test(file)) discovered.push(`database/${entry.name}/v1/${file}`);
    }
  }
  assert.equal(new Set(units.map(unit => unit.file)).size, units.length, 'Duplicate installation entry');
  assert.deepEqual(units.map(unit => unit.file).sort(), discovered.sort(), 'SQL missing from installation inventory');
  return { schema: 'schoolsafe-installation-inventory-v1', executable: false,
    status: 'BLOCKED_PENDING_FUNCTIONAL_SQL_QUALIFICATION',
    note: 'Inventory order is not a cross-set production execution plan. Existing per-set order is preserved. No automatic application or historical rewrite.',
    units };
}
