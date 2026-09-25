import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {sha256Sql} from '../../../scripts/migration-manifest.mjs';
const directory = new URL('./', import.meta.url);
const files = ['01_resolve_setup_authorization.sql', '02_bind_setup_resolver.sql'];
const units = files.map((file, index) => ({order: index + 1, file,
  sha256: sha256Sql(fs.readFileSync(new URL(file, directory)))}));
fs.writeFileSync(new URL('manifest.json', directory), JSON.stringify({schema: 'schoolsafe-migrations-v3', name: 'setup', version: 3, units}, null, 2) + '\n');
fs.writeFileSync(new URL('manifest.sha256', directory), units.map(u => `${u.sha256}  ${u.file}`).join('\n') + '\n');
const planPath = fileURLToPath(new URL('../../installation/v2/manifest.json', directory));
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
for (const {file, sha256} of units) {
  const sqlPath = `database/setup/v3/${file}`;
  const existing = plan.units.find(unit => unit.file === sqlPath);
  if (existing) existing.sha256 = sha256;
  else plan.units.push({order: plan.units.length + 1, file: sqlPath, sha256});
}
fs.writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
console.log('Setup v3 manifests registered; historical units preserved');
