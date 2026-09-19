import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export const folder = 'docs/migration/2026-09-19-stable-preparation';
export const privatePath = p => /(?:^|\/)(?:\.git|\.claude|\.worktrees|node_modules|\.env(?:\.[^/]*)?|credentials\.json|secrets\.json)(?:\/|$)|\.(?:pem|key|p12|pfx|log|dump|backup)$/.test(p)
  || p.endsWith('/SECRETS_APPLICATION.md');
export const portraits = Array.from({ length: 6 }, (_, i) => `app/login-kid-${i + 1}.jpg`);
export const metadata = [`${folder}/final-files.json`, `${folder}/final-files.txt`];

export function selectFiles(root) {
  const base = JSON.parse(fs.readFileSync(path.join(root, 'docs/migration/2026-09-19-base-stable/files.json'), 'utf8'));
  const excluded = base.files.filter(f => f.proposedDestination === 'EXCLURE')
    .map(f => ({ path: f.path, reason: f.reason }));
  excluded.push(...portraits.map(p => ({ path: p, reason: 'Image usage not established; see IMAGES.md. Original retained.' })));
  const selected = base.files.filter(f => ['SCHOOLSAFE', 'ARCHIVE'].includes(f.proposedDestination) && !portraits.includes(f.path)).map(f => f.path);
  const additions = [
    'scripts/qa-stable-auth.mjs',
    'scripts/stable-packaging.test.mjs', 'scripts/installation-inventory.mjs',
    'scripts/test-stable-installation-postgres.mjs', 'database/installation/README.md',
    'database/installation/generate-manifest.mjs', 'database/installation/manifest.json',
  ];
  for (const directory of ['docs/migration/2026-09-19-base-stable', folder]) {
    for (const name of fs.readdirSync(path.join(root, directory))) {
      const p = `${directory}/${name}`;
      assert.ok(fs.lstatSync(path.join(root, p)).isFile(), `Unexpected directory/link: ${p}`);
      if (!metadata.includes(p)) additions.push(p);
    }
  }
  const files = [...new Set([...selected, ...additions])].sort();
  assert.equal(selected.length, 747, 'Validated source selection changed');
  assert.equal(excluded.length, 14, 'Review exclusions explicitly');
  for (const p of files) {
    assert.ok(!privatePath(p), `Private path cannot be copied: ${p}`);
    assert.ok(!p.startsWith('/') && !p.split('/').includes('..'), `Unsafe path: ${p}`);
    assert.ok(fs.lstatSync(path.join(root, p)).isFile(), `No links: ${p}`);
  }
  return { files, excluded, sourceCounts: { SCHOOLSAFE: 731, CONTROL: 0, ARCHIVE: 16, EXCLURE: 14 } };
}

export function selectedBytes(root, p) {
  const original = fs.readFileSync(path.join(root, p));
  if (p === 'app/app.js') {
    let content = original.toString('utf8');
    for (const name of ['loginImages', 'schoolMediaLibrary']) {
      const pattern = new RegExp(`  var ${name} = \\[\\r?\\n[\\s\\S]*?\\r?\\n  \\];`);
      const replacement = `  var ${name} = []; // Stable: portraits withheld pending usage evidence.`;
      assert.ok(pattern.test(content) || content.includes(replacement), `Photo reference shape changed: ${name}`);
      content = content.replace(pattern, replacement);
    }
    assert.ok(!/login-kid-\d\.jpg/.test(content));
    return { bytes: Buffer.from(content), transformation: 'Only the two unused decorative portrait arrays are emptied; original source untouched.' };
  }
  if (p === 'app/index.html') {
    const content = original.toString('utf8');
    const reference = 'class="auth-image visible" src="./login-kid-1.jpg"';
    assert.ok(content.includes(reference) || content.includes('id="authImageA" class="auth-image" hidden'), 'Photo markup changed');
    return { bytes: Buffer.from(content.replace(reference, 'class="auth-image" hidden')),
      transformation: 'Only decorative photo source removed and its node hidden; auth/JASPE markup retained.' };
  }
  if (p === '.gitignore') {
    const additions = '\n# Stable migration exclusions: no private files or unqualified portraits.\n.claude/\napp/login-kid-*.jpg\ndatabase/baseline/v1/review/SECRETS_APPLICATION.md\n';
    return { bytes: original.toString('utf8').endsWith(additions) ? original : Buffer.concat([original, Buffer.from(additions)]),
      transformation: 'Extra safeguards in the new repository only.' };
  }
  return { bytes: original, transformation: null };
}
