import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256Sql} from '../../../scripts/migration-manifest.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=file=>fs.readFileSync(path.join(root,file));
const digest=file=>sha256Sql(read(file));
const sets=['baseline','auth','access','finance','pedagogy','cards','family','devicehub','dashboard','license','trial','projections'];
const versions=['baseline','auth','finance','devicehub','projections','setup'];
for(const name of versions){
 const directory=`database/${name}/v2`;
 const files=fs.readdirSync(path.join(root,directory)).filter(f=>/^\d{2}_[a-z0-9_]+\.sql$/.test(f)).sort();
 const units=files.map((file,index)=>({order:index+1,file,sha256:digest(`${directory}/${file}`)}));
 fs.writeFileSync(path.join(root,directory,'manifest.json'),JSON.stringify({schema:'schoolsafe-migrations-v2',name,version:2,units},null,2)+'\n');
 fs.writeFileSync(path.join(root,directory,'manifest.sha256'),units.map(u=>`${u.sha256}  ${u.file}`).join('\n')+'\n');
}
const replacement={
 'database/finance/v1/02_finance_full.sql':'database/finance/v2/01_finance_full.sql',
 'database/devicehub/v1/01_devicehub_core.sql':'database/devicehub/v2/01_devicehub_core.sql',
 'database/devicehub/v1/02_devicehub_rpc.sql':'database/devicehub/v2/02_devicehub_rpc.sql',
 'database/projections/v1/02_student_list.sql':'database/projections/v2/01_student_list.sql',
 'database/setup/v1/01_setup_native.sql':'database/setup/v2/01_setup_native.sql',
 'database/auth/v1/03_auth_reset.sql':'database/auth/v2/01_auth_reset.sql',
};
const files=[];
for(const set of sets){
 const manifest=JSON.parse(read(`database/${set}/v1/manifest.json`));
 for(const unit of manifest.units){const old=`database/${set}/v1/${unit.file}`;files.push(replacement[old]??old);}
 if(set==='devicehub')files.push('database/devicehub/v2/03_machine_bindings.sql');
 if(set==='auth'){
  files.push(replacement['database/auth/v1/03_auth_reset.sql']);
  for(const f of [
   'database/auth/v2/02_identity_verification.sql',
   'database/auth/v2/03_webauthn_credentials.sql',
   'database/auth/v2/04_admin_recovery.sql',
  ])if(!files.includes(f))files.push(f);
 }
 if(set==='access')files.push(replacement['database/setup/v1/01_setup_native.sql']);
}
files.push(replacement['database/projections/v1/02_student_list.sql'],'database/baseline/v2/01_runtime_security.sql');

// Preserve the exact production 65-unit lineage. New migrations must append; never reorder history.
const historicalTail=[
 'database/documents/v1/01_document_sequences.sql',
 'database/documents/v1/02_documents.sql',
 'database/documents/v1/03_document_access.sql',
 'database/auth/v2/05_parent_recovery.sql',
 'database/auth/v2/06_admin_assisted_recovery.sql',
 'database/setup/v3/01_resolve_setup_authorization.sql',
 'database/setup/v3/02_bind_setup_resolver.sql',
 'database/auth/v3/01_inactive_school_auth_gate.sql',
 'database/setup/v4/01_registration_pending.sql',
 'database/auth/v4/01_auth_resolve_identity_preauth.sql',
 'database/setup/v5/01_registration_approval.sql',
 'database/auth/v5/01_account_registration_onboarding.sql',
 'database/auth/v6/01_direct_school_activation.sql',
 'database/auth/v7/01_control_admin_links.sql',
];
for(const f of historicalTail)if(!files.includes(f))files.push(f);
if(files.length!==65)throw new Error(`Historical installation lineage changed: expected 65 units, got ${files.length}`);

// B1 is additive to the production lineage: append the four studentrecord units after historical unit 65.
const studentrecord=JSON.parse(read('database/studentrecord/v1/manifest.json'));
for(const unit of studentrecord.units){
 const f=`database/studentrecord/v1/${unit.file}`;
 if(!files.includes(f))files.push(f);
}
if(files.length!==69)throw new Error(`B1 installation plan must contain 69 units, got ${files.length}`);

const manifest={schema:'schoolsafe-installation-v2',postgres:170011,
 units:files.map((file,index)=>({order:index+1,file,sha256:digest(file)})),
 superseded:Object.entries(replacement).map(([file,replacedBy])=>({file,sha256:digest(file),replacedBy}))};
fs.writeFileSync(path.join(root,'database/installation/v2/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`V2 manifests generated: ${manifest.units.length} executable units, ${manifest.superseded.length} preserved superseded units`);
