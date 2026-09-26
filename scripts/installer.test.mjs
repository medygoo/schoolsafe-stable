import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {planAdditiveUpgrade,renderAdditiveUpgrade} from './render-additive-upgrade.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateTarget,installSchoolDatabase} from './install-school-db.mjs';
import {loadInstallationPlan,transactionalSql,repositoryRoot} from './installation-plan.mjs';
const target='postgresql://bootstrap:synthetic-password@127.0.0.1:5432/schoolsafe_test_contract';
test('target must be explicit and match expected SchoolSafe database',()=>{
 for(const [url,name] of [[undefined,'schoolsafe'],[target,'schoolsafe'],[target,'control'],[target.replace('postgresql:','https:'),'schoolsafe_test_contract'],[target.replace('bootstrap:','schoolsafe_api:'),'schoolsafe_test_contract'],[target.replace(':synthetic-password',''),'schoolsafe_test_contract']])assert.throws(()=>validateTarget(url,name));
 assert.ok(validateTarget(target,'schoolsafe_test_contract'));
});
test('dry-run verifies all units without connecting even to an unavailable server',async()=>{
 const lines=[];const result=await installSchoolDatabase({connectionString:target,database:'schoolsafe_test_contract',mode:'dry-run',log:line=>lines.push(line)});
 assert.equal(result.status,'dry-run');assert.equal(result.units,loadInstallationPlan().units.length);assert.ok(!lines.join('\n').includes('synthetic-password'));
});
test('framing refuses additional transaction boundaries and psql execution',()=>{
 assert.throws(()=>transactionalSql('begin;\ncommit;\nbegin;\nselect 1;\ncommit;'));
 assert.throws(()=>transactionalSql('begin;\n\\! echo unsafe\ncommit;'));
});
test('checksums reject a tampered additive SQL unit',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'schoolsafe-manifest-test-'));
 try{fs.cpSync(path.join(repositoryRoot,'database'),path.join(directory,'database'),{recursive:true});
  fs.appendFileSync(path.join(directory,'database/setup/v2/01_setup_native.sql'),'\nselect 1;\n');assert.throws(()=>loadInstallationPlan(directory),/Checksum mismatch/);
 }finally{const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('schoolsafe-manifest-test-'));fs.rmSync(resolved,{recursive:true});}
});

test('official additive renderer accepts the historical 48-unit lineage without replay',()=>{
 const ledger=historicalLedger();
 const result=spawnSync(process.execPath,['scripts/render-additive-upgrade.mjs','--installed-units','48'],{input:JSON.stringify(ledger),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/begin;/);
 assert.match(result.stdout,/pg_advisory_xact_lock/);
 assert.match(result.stdout,/01_resolve_setup_authorization/);
 assert.doesNotMatch(result.stdout,/create role schoolsafe_owner/);
});

function historicalLedger(){
 const historical={"units":[{"order":1,"file":"database/baseline/v1/01_roles.sql","sha256":"10448f25fb7925391c66d872a11d13d2876667dddeaaa39e8ec785868c72e5fe"},{"order":2,"file":"database/baseline/v1/02_schemas.sql","sha256":"d588efaaa03f385db9f50db873e3b05321647cf39254f8ea822040c863d7ae40"},{"order":3,"file":"database/baseline/v1/03_extensions.sql","sha256":"d5614193bee6785294eaf2febae32480f41b53cc50b20406a2142222cc865528"},{"order":4,"file":"database/baseline/v1/04_app_tables.sql","sha256":"e03e05a26f196bfa657c62971740af6d52522a3885fe3ec184abc60122fe8465"},{"order":5,"file":"database/baseline/v1/05_iam.sql","sha256":"87fc9522b8b530e2c09858de46deaaf43570893472c2810b062f1ff044edf7d5"},{"order":6,"file":"database/baseline/v1/06_audit_ops.sql","sha256":"b21c242218945cfea044a5ae8c75694df930eca42b6ded3bea7520e9d3c2e661"},{"order":7,"file":"database/baseline/v1/07_constraints_indexes.sql","sha256":"7ffde1d41c06cbce867ea2f287fcb9223c0ecd76815c3f2afa8226672fc8ec89"},{"order":8,"file":"database/baseline/v1/08_internal_functions.sql","sha256":"63422301ad2b9ccc6dfad079fe2c88d302e53f1ad7c20cf757a8f0ec64905ca2"},{"order":9,"file":"database/baseline/v1/09_api_rpc.sql","sha256":"e7fbcfda47b59ff00a712e222b56f1af6ed75d904f4f5b6c14e869c62b9cf49f"},{"order":10,"file":"database/baseline/v1/10_triggers.sql","sha256":"6690f7698c55b4903a81a56066fadd8383421904724429ee34aa8a726a831ab7"},{"order":11,"file":"database/baseline/v1/11_rls_acl.sql","sha256":"484e65146d0c43009c8261f52dea6a005c9fd2c521d835478206d0f9b79e9e04"},{"order":12,"file":"database/baseline/v1/12_seed_permissions.sql","sha256":"bfbc080d4a1c4502cd849eb00f6cc6a4ed1cf1a790ff680a26e817158da4c13a"},{"order":13,"file":"database/baseline/v1/13_verification.sql","sha256":"9ae19b0d309ce76c483434e1484dae89e5ea572a02a001b84fc7502cb9e842d2"},{"order":14,"file":"database/auth/v1/01_auth_tables.sql","sha256":"6dd18006c8dc8577b8365b9ffbf18a967bafab75fa195b167b7056fab40d1baf"},{"order":15,"file":"database/auth/v1/02_auth_api.sql","sha256":"840130b333cf4452f6208006bd222b926d75041409806b8f5028d504e86b1e4b"},{"order":16,"file":"database/auth/v2/01_auth_reset.sql","sha256":"f6771b3be729b460b36fced4f8c0fd1018c6b106539db30c89873db5d24fb764"},{"order":17,"file":"database/access/v1/01_role_templates.sql","sha256":"ced0935d0ee562c1cd636dc6d8856d13d54338b9a976488fc71b428648e2e9c8"},{"order":18,"file":"database/access/v1/02_provision_bridge.sql","sha256":"00c330fbc921d8fa4608b822b9308cecfb377c053f4c6bed720e166727a6a87e"},{"order":19,"file":"database/access/v1/03_control_context.sql","sha256":"9dfa8fb501d7d289d6abfea18901627da49721b8d6e1d3c0364f3d0018e0e1f5"},{"order":20,"file":"database/access/v1/04_role_assignments.sql","sha256":"620f15afe2acd333ec2a93a24b6dbcc8378df4e20002872d1354d844f1d58c98"},{"order":21,"file":"database/access/v1/05_custom_roles.sql","sha256":"8afe995795f077424f696b3bc1bf409c865cf6bdc6a5b065f74003e959f8407c"},{"order":22,"file":"database/setup/v2/01_setup_native.sql","sha256":"f80ee95787fb9ce5abfc98ebf29f5acfeb4288311b3b553f9e87e5ca96d85d71"},{"order":23,"file":"database/finance/v1/01_finance_native.sql","sha256":"20818f9e0b8bbbfa4654a0ae100dcdff139f0e644b509bd8d38f4e2dde3faaa6"},{"order":24,"file":"database/finance/v2/01_finance_full.sql","sha256":"868ebf90c455f5c340e2b8cf4d5b01917a927b73e0571be1c932e0fbec598136"},{"order":25,"file":"database/pedagogy/v1/01_pedagogy_native.sql","sha256":"0f776de51eab1b8b43fd2eeb85610662f12f97a2dfcd8fb89f548268c79284ff"},{"order":26,"file":"database/cards/v1/01_cards_native.sql","sha256":"60cdf6b2281a233cd87a98163c412222eba3cfa619cc0e6a3fe5a22dadaf83e9"},{"order":27,"file":"database/cards/v1/02_cards_classes.sql","sha256":"bf05067d5689239bf39132e27497797db4436ddfd342c263de191e399a6395c0"},{"order":28,"file":"database/cards/v1/03_cards_lifecycle.sql","sha256":"402b98723c4242bf8b04af9b27f720792303c72b0d5701914fb2351a4af7f8c4"},{"order":29,"file":"database/family/v1/01_pickup_authorizations.sql","sha256":"bfb0f539c5c1a3d141727560cd2bad9ca11a4f3394a1cf5484ca3660083946ac"},{"order":30,"file":"database/family/v1/02_primary_transfer.sql","sha256":"07d7b912afb5eaa531bb75a5971e33baf35e0e0e1b17c7cbce3962e7d25ab28f"},{"order":31,"file":"database/family/v1/03_pickup_confirmation.sql","sha256":"e10139ea6ff02bb0ad81a31f20567ff2976637831ea40a906a572960a50c1d93"},{"order":32,"file":"database/family/v1/04_student_import.sql","sha256":"94a361704366d293536b40a89767654aa5b6e62e69caec89c453e19ef2a1fd9a"},{"order":33,"file":"database/devicehub/v2/01_devicehub_core.sql","sha256":"3c882a5216dbb2aae7a601bc05ca57e0c545bd17c69914ca209d016409b48673"},{"order":34,"file":"database/devicehub/v2/02_devicehub_rpc.sql","sha256":"e47a359ff51a5779baf48c4a454606dd252c8891d510ddddec6a6ba6b1652727"},{"order":35,"file":"database/devicehub/v1/03_attendance.sql","sha256":"ac9ab222d31dc49be9585e5f231f859b73baa9582e38029963c3fe07195d1524"},{"order":36,"file":"database/devicehub/v2/03_machine_bindings.sql","sha256":"e2c3c8056cc65e17bcbfbeded4159dbb14156bc645badab31bb64b67dbd4cdab"},{"order":37,"file":"database/dashboard/v1/01_dashboard.sql","sha256":"b8d9e72b66fe404e44e7b6ea9d3acee75f6118e647e2c71be8d3077a154d5e18"},{"order":38,"file":"database/license/v1/01_license.sql","sha256":"b21e4ad7d5c2550419014890d23c305913aad433ca60e48fadf0d6b4004d8ee1"},{"order":39,"file":"database/trial/v1/01_trial.sql","sha256":"d87c8017900e2dbbc53dc444d01678b4e459f22b96ba77c462aef63ebd073ba4"},{"order":40,"file":"database/projections/v1/01_student_read.sql","sha256":"56af4a67429b647470bf29897308dd04890454509fccf652cee288451dec5237"},{"order":41,"file":"database/projections/v1/02_session_bootstrap.sql","sha256":"d59d9684276b662273f443d36831ababf547437ec89ca853ca64ba88427b94c7"},{"order":42,"file":"database/projections/v1/03_access_read.sql","sha256":"f10a7d3c6d5a15e96393c654ebd72eabb6ee7019d1345830737742c73edd4b54"},{"order":43,"file":"database/projections/v1/04_access_assignment_views.sql","sha256":"4ce603d95511cbf16b19a7833487ba6b94114087626571986bfcbc83e812c55e"},{"order":44,"file":"database/projections/v1/05_session_validity.sql","sha256":"132062f3bcdb6dafe306bf88db078152b7ac0e2e293804abab3439b17cd00d8b"},{"order":45,"file":"database/projections/v1/07_targeted_denies.sql","sha256":"80a0702410b542f55bd25fd49536b706a7c1c94e88e30c1af067deeb674e446b"},{"order":46,"file":"database/projections/v1/08_session_denial_contract.sql","sha256":"a523c7e0d012511e5130a8238bcde4db4a6c8fb48878d40b7f9c161ee03841e5"},{"order":47,"file":"database/projections/v2/01_student_list.sql","sha256":"be296b495d703929d7525364dc3fd6c021ed8f2ffa8353d567814d3f739012c0"},{"order":48,"file":"database/baseline/v2/01_runtime_security.sql","sha256":"6fb0a95db48f0c7142603f88ef747565fa756dc4e7fdb68cf0f7b8f95ae96d18"}]};
 const ledger=historical.units.map(u=>({unit_order:u.order,file_name:u.file,sha256:u.sha256}));
 return ledger;
}

test('additive ledger preserves history and appends missing identities in current plan order',()=>{
 const installed=historicalLedger(),plan=loadInstallationPlan();
 const result=planAdditiveUpgrade(installed,plan);
 assert.equal(result.historical,true);assert.equal(result.missing.length,plan.units.length-installed.length);
 const next=[...installed,...result.missing.map((u,i)=>({unit_order:49+i,file_name:u.file,sha256:u.sha256}))];
 assert.equal(planAdditiveUpgrade(next,plan).missing.length,0);
 assert.doesNotMatch(renderAdditiveUpgrade({installed:next}),/-- APPLY/);
});

test('upgrade refuses altered historical checksum, missing file, duplicate, reversed order and downgrade',()=>{
 const plan=loadInstallationPlan();
 const altered=historicalLedger();altered[3].sha256='0'.repeat(64);
 assert.throws(()=>planAdditiveUpgrade(altered,plan),/UPGRADE_REFUSED/);
 const missing=historicalLedger();missing[3].file_name='database/absent/v1/01_absent.sql';
 assert.throws(()=>planAdditiveUpgrade(missing,plan),/UPGRADE_REFUSED/);
 const duplicate=historicalLedger();duplicate[3]={...duplicate[2],unit_order:4};
 assert.throws(()=>planAdditiveUpgrade(duplicate,plan),/UPGRADE_REFUSED/);
 const reordered=historicalLedger();[reordered[2],reordered[3]]=[{...reordered[3],unit_order:3},{...reordered[2],unit_order:4}];
 assert.throws(()=>planAdditiveUpgrade(reordered,plan),/UPGRADE_REFUSED/);
 const reversedPlan=structuredClone(plan);[reversedPlan.units[2].order,reversedPlan.units[3].order]=[4,3];
 assert.throws(()=>planAdditiveUpgrade(historicalLedger(),reversedPlan),/UPGRADE_REFUSED/);
 assert.throws(()=>planAdditiveUpgrade(historicalLedger(),{units:plan.units.slice(0,47)}),/DOWNGRADE_REFUSED/);
 assert.throws(()=>planAdditiveUpgrade([],plan),/UPGRADE_REFUSED/);
});
