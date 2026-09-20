import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sha256Sql,normalizeSql} from './migration-manifest.mjs';
export const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const safeFile=/^database\/[a-z]+\/v[12]\/\d{2}_[a-z0-9_]+\.sql$/;
export function loadInstallationPlan(root=repositoryRoot){
 const plan=JSON.parse(fs.readFileSync(path.join(root,'database/installation/v2/manifest.json'),'utf8'));
 assert.equal(plan.schema,'schoolsafe-installation-v2');assert.equal(plan.postgres,170011);
 const dispositions=new Set();const active=new Set(plan.units.map(u=>u.file));
 for(const [index,unit] of plan.units.entries())assert.equal(unit.order,index+1,'Non-sequential installation order');
 for(const unit of [...plan.units,...plan.superseded]){
  assert.match(unit.file,safeFile,'Unsafe SQL path');assert.ok(!dispositions.has(unit.file),'Duplicate SQL disposition');dispositions.add(unit.file);
  assert.equal(sha256Sql(fs.readFileSync(path.join(root,unit.file))),unit.sha256,`Checksum mismatch: ${unit.file}`);
  if(unit.replacedBy)assert.ok(active.has(unit.replacedBy),`Missing replacement: ${unit.file}`);
 }
 const discovered=[];const manifested=new Set();
 for(const module of fs.readdirSync(path.join(root,'database'),{withFileTypes:true})){
  if(!module.isDirectory()||module.name==='installation')continue;
  for(const version of fs.readdirSync(path.join(root,'database',module.name),{withFileTypes:true})){
   if(!version.isDirectory()||!/^v\d+$/.test(version.name))continue;
   const dir=`database/${module.name}/${version.name}`;
   for(const name of fs.readdirSync(path.join(root,dir)))if(/^\d{2}_[a-z0-9_]+\.sql$/.test(name))discovered.push(`${dir}/${name}`);
   if(!fs.existsSync(path.join(root,dir,'manifest.json')))continue;
   const manifest=JSON.parse(fs.readFileSync(path.join(root,dir,'manifest.json'),'utf8'));
   const lines=[];
   for(const [index,unit] of manifest.units.entries()){
    assert.equal(unit.order,index+1);assert.match(unit.file,/^\d{2}_[a-z0-9_]+\.sql$/);
    const file=`${dir}/${unit.file}`;assert.ok(!manifested.has(file));manifested.add(file);
    assert.equal(sha256Sql(fs.readFileSync(path.join(root,file))),unit.sha256,`Manifest checksum: ${file}`);
    lines.push(`${unit.sha256}  ${unit.file}`);
   }
   assert.equal(fs.readFileSync(path.join(root,dir,'manifest.sha256'),'utf8').replace(/\r\n/g,'\n').trim(),lines.join('\n'));
   const activeOrdered=plan.units.filter(u=>u.file.startsWith(dir+'/')).map(u=>u.file);
   const declaredOrdered=manifest.units.map(u=>`${dir}/${u.file}`).filter(f=>active.has(f));
   assert.deepEqual(activeOrdered,declaredOrdered,`Manifest order changed: ${dir}`);
  }
 }
 assert.deepEqual([...dispositions].sort(),discovered.sort(),'Unaccounted versioned SQL');
 assert.ok(plan.units.every(u=>manifested.has(u.file)),'Executable SQL outside a manifest');
 return {...plan,digest:createHash('sha256').update(JSON.stringify(plan)).digest('hex')};
}
export function transactionalSql(source){
 let sql=normalizeSql(source).replace(/^\\set ON_ERROR_STOP on\s*\n/,'');
 assert.ok(!/^\\/m.test(sql),'Unsupported psql directive');
 assert.match(sql,/^begin;\s*$/im);assert.match(sql,/commit;\s*$/i);
 sql=sql.replace(/^begin;\s*$/im,'').replace(/commit;\s*$/i,'');
 assert.ok(!/^(?:begin|commit|rollback)\s*;/im.test(sql),'Nested transaction control is unsupported');
 return sql;
}
