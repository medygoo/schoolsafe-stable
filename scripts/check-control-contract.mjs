import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {repositoryRoot} from './installation-plan.mjs';
const control=process.argv[2];
if(!control)throw Error('Supply an explicit read-only Control checkout path');
async function load(file){const result=await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
const [school,peer]=await Promise.all([load(path.join(repositoryRoot,'server/src/machine/hmac.ts')),load(path.resolve(control,'src/auth/hmac.ts'))]);
for(const vector of [
 {method:'POST',path:'/device-registrations',body:JSON.stringify({school_id:'synthetic-a',device_code:'A'})},
 {method:'GET',path:'/api/license/state?school_id=synthetic-a',body:'{}'},
 {method:'POST',path:'/machine/devicehub/events',body:JSON.stringify({device_id:'synthetic-b',metadata:{label:'Unicode \u00e9cole'}})}]){
 const input={...vector,timestamp:Math.floor(Date.now()/1000),secret:'synthetic-cross-repo-contract'};
 const signature=school.signRequest(input);assert.equal(signature,peer.signRequest(input));
 assert.equal(peer.verifyRequest({...input,signature}),true);assert.equal(school.verifyRequest({...input,signature}),true);
 assert.equal(school.verifyRequest({...input,signature,path:input.path+'/forged'}),false);
}
console.log('CROSS_REPO_HMAC PASS: 3 vectors against actual Control source');
