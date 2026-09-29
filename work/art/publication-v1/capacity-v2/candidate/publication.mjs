// Private, receipt-bound staging only. No implicit live destination or build invocation.
import assert from 'node:assert/strict';
import {copyFile,mkdir,readFile,rename,rm,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {artPackageSources} from './upstream/client/scripts/ui/art-plugin.mjs';
import {prepareNormalizedMasks} from './upstream/normalization.mjs';
import {sha,safe,descriptor,verify,readJSON,inventory,verifyInventory,unique,absent,writeJSON,pin,contained} from './io.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOTS=['build','ui','fonts','audio','manifest'];
const ID=/^(unit|building|prop)\.[A-Za-z0-9_.-]+$/;
const ordered=a=>[...a].sort();
async function codePins(){
 const lock=JSON.parse(await readFile(path.join(HERE,'upstream-lock.json')));
 for(const f of lock.files)assert.equal((await pin(HERE,f.path)).sha256,f.sha256,`Frozen upstream changed ${f.path}`);
 return Promise.all(['publication.mjs','io.mjs','cli.mjs','universe.json','upstream-lock.json',...lock.files.map(x=>x.path)].map(p=>pin(HERE,p)));
}
async function tree(assets){const rows=[];for(const name of ROOTS){const p=path.join(assets,name);if(await absent(p))continue;await contained(assets,name);for(const f of await inventory(p))rows.push({...f,path:name+'/'+f.path})}return rows.sort((a,b)=>a.path.localeCompare(b.path))}
async function baseline(root,m){const rows=(await readJSON(root,m.baseline.inventory,'inventory')).files;unique(rows);assert(rows.every(f=>ROOTS.some(r=>f.path.startsWith(r+'/'))),'Unmanaged baseline path');const assets=await contained(root,m.baseline.assets);assert.deepEqual(await tree(assets),[...rows].sort((a,b)=>a.path.localeCompare(b.path)),'Baseline inventory changed');return rows}
function expectedIds(m,universe){
 assert(m.format===1&&m.reviewed===true,'Selection must be explicitly reviewed');assert(['fixture','subset','complete'].includes(m.scope));
 assert(Array.isArray(m.expectedIds)&&m.expectedIds.length>0&&m.expectedIds.length<=162);unique(m.expectedIds.map(id=>({id})),'id');assert(m.expectedIds.every(id=>ID.test(id)));
 unique(m.entries,'id');assert.deepEqual(ordered(m.entries.map(e=>e.id)),ordered(m.expectedIds),'Missing/extra selected ID');
 if(m.scope==='complete')assert.deepEqual(ordered(m.expectedIds),universe.expectedIds,'Complete publication requires exact162 IDs');
}
async function load(root,selection){
 const m=await readJSON(root,selection),universe=JSON.parse(await readFile(path.join(HERE,'universe.json')));expectedIds(m,universe);
 if(m.scope==='fixture')fixtureTarget(root,m);
 if(m.scope==='complete')assert.equal(m.baseline.assets,'assets');
 const dependencies=new Map();const add=async d=>{descriptor(d);const old=dependencies.get(d.path);if(old)assert.deepEqual(old,d,`Conflicting dependency ${d.path}`);await verify(root,d);dependencies.set(d.path,d);return d};
 await add(selection);await add(m.baseline.inventory);for(const d of m.provenance??[])await add(d);
 for(const f of JSON.parse(await readFile(path.join(HERE,'upstream-lock.json'))).files){const d=await pin(root,f.source);assert.equal(d.sha256,f.sha256,`Current production/helper differs from reviewed source ${f.source}`);await add(d)}
 const base=await baseline(root,m);for(const f of base)await add({...f,path:m.baseline.assets+'/'+f.path});
 const files=[],roles=new Set();
 for(const e of m.entries){
  assert(ID.test(e.id));let exports,side,role;for(const d of e.provenance??[])await add(d);
  if(e.kind==='handoff'){
   await add(e.handoff);const h=await readJSON(root,e.handoff);assert.equal(h.id,e.id);assert(safe(h.stage)&&h.stage.startsWith('work/art/'));
   for(const key of ['spec','model','editable','native','integrity','ui','production'])await add(e[key]);
   const spec=await readJSON(root,e.spec),production=await readJSON(root,e.production),native=await readJSON(root,e.native),integrity=await readJSON(root,e.integrity),ui=await readJSON(root,e.ui);
   assert(native.accepted===true||native.accepted_bounded_export===true,'Native review not accepted');assert.equal(integrity.failures,0,'Failed integrity check');assert.equal(ui.failures,0,'Failed UI check');
   assert.equal(production.stage,h.stage);assert.equal(spec.id,e.id);assert.equal(e.spec.path,h.spec??`${h.stage}/assets/pipeline/specs/${e.id}.json`);assert.equal(e.model.path,h.reviewed_source??h.model);assert.equal(e.editable.path,h.editable_blend??`${h.stage}/assets/source/blender/${e.id}.blend`);assert(e.editable.bytes>1024,'Editable source is incomplete');
   const sources=production.sources??production.sha256;assert(sources&&typeof sources==='object');
   for(const [rel,hash] of Object.entries(sources)){const p=rel.startsWith(h.stage+'/')?rel:h.stage+'/'+rel;assert(safe(p));const d=await pin(root,p);assert.equal(d.sha256,hash,`Production source changed ${p}`);await add(d)}
   for(const [rel,hash] of Object.entries(h.checks??h.receipts??{})){const d=await pin(root,rel);assert.equal(d.sha256,hash);await add(d)}
   const checks=h.checks??h.receipts;for(const key of ['native','integrity','ui','production'])assert.equal(checks?.[e[key].path],e[key].sha256,`Unbound ${key} receipt`);
   const sourceHash=d=>sources[d.path]??sources[d.path.slice(h.stage.length+1)];assert.equal(e.model.sha256,h.model_sha256??sourceHash(e.model));assert.equal(e.spec.sha256,h.spec_sha256??sourceHash(e.spec));
   if(sourceHash(e.model))assert.equal(e.model.sha256,sourceHash(e.model));if(sourceHash(e.spec))assert.equal(e.spec.sha256,sourceHash(e.spec));
   exports=Object.entries(h.files).map(([rel,d])=>{assert.equal(d.source,`${h.stage}/assets/build/${rel}`);return {id:e.id,path:rel,source:{path:d.source,bytes:d.bytes,sha256:d.sha256}}});
   for(const f of exports)await add(f.source);
   side=await readJSON(root,exports.find(f=>f.path===`sprites/${e.id}/${e.id}.sprite.json`)?.source);role=spec.role_id??e.id;
   assert.deepEqual(side.states,spec.states);const poses=spec.states.reduce((n,s)=>n+s.frames*s.directions,0);assert(Number.isSafeInteger(poses)&&poses>0);assert.equal(side.frame_count,poses);if(h.poses!==undefined)assert.equal(h.poses,poses);if(integrity.poses!==undefined)assert.equal(integrity.poses,poses);
  }else{
   assert.equal(e.kind,'legacy');await add(e.lineage);const audit=await readJSON(root,e.lineage);assert.deepEqual(audit.failures,[],'Failed lineage audit');
   const row=audit.assets.find(x=>x.id===e.id);assert(row,'Legacy ID not in accepted lineage');assert.deepEqual(row.raw_mismatches,[]);assert(row.spec_sidecar_states_exact===true);assert.deepEqual(e.acceptedLimits,row.source_lineage_limits??[],'Legacy scope must be explicit');
   for(const [p,h] of Object.entries(audit.inputs??{})){const d=await pin(root,p);assert.equal(d.sha256,h);await add(d)}
   for(const [p,h] of [[row.spec,row.spec_sha256],[row.preserved_model,row.model_sha256],[row.historical_check?.path,row.historical_check?.sha256],[row.historical_ui_check?.path,row.historical_ui_check?.sha256]])if(p){const d=await pin(root,p);assert.equal(d.sha256,h);await add(d)}
   // Legacy editable lineage may be incomplete: the reviewed manifest must say so.
   if(e.editable)await add(e.editable);else assert(e.editableScope==='not-certified-by-legacy-lineage');
   exports=[...Object.entries(row.sprite_files).map(([p,d])=>({path:p,...d})),...row.ui_files].map(d=>({id:e.id,path:d.path,source:{path:m.baseline.assets+'/build/'+d.path,bytes:d.bytes,sha256:d.sha256}}));
   for(const f of exports)await add(f.source);
   side=await readJSON(root,exports.find(f=>f.path===`sprites/${e.id}/${e.id}.sprite.json`)?.source);role=side.role_id??e.id;
  }
  assert.equal(side.id,e.id);assert.equal(side.role_id??side.id,role);assert(/^[A-Za-z0-9_.-]+$/.test(role));assert(!roles.has(role),'Duplicate UI role');roles.add(role);e.role=role;
  const world=new Set([`sprites/${e.id}/${e.id}.sprite.json`]);assert(side.atlases&&Object.keys(side.atlases).length,'Missing atlas graph');
  for(const layers of Object.values(side.atlases))for(const list of Object.values(layers))for(const atlas of list){assert(safe(atlas)&&!atlas.includes('/'));const rel=`sprites/${e.id}/${atlas}`,f=exports.find(x=>x.path===rel);assert(f,`Missing atlas ${rel}`);const a=await readJSON(root,f.source);assert(safe(a.meta.image)&&!a.meta.image.includes('/'));world.add(rel);world.add(`sprites/${e.id}/${a.meta.image}`)}
  const wanted=new Set(world);if(!e.id.startsWith('prop.'))for(const folder of ['portraits','icons/build'])for(const scale of e.kind==='handoff'?['1x','2x']:['2x'])for(const layer of ['beauty','team'])wanted.add(`ui/${folder}/${role}@${scale}.${layer}.png`);
  assert.deepEqual(new Set(exports.map(f=>f.path)),wanted,`Closed export file graph ${e.id}`);files.push(...exports);
 }
 unique(files);assert(Array.isArray(m.normalization.requiredIds),'Explicit normalization scope required');
 let normalization={rows:[],ids:[]};if(m.normalization.receipt){await add(m.normalization.receipt);normalization=await prepareNormalizedMasks({repo:root,receiptPath:m.normalization.receipt.path,receiptSHA256:m.normalization.receipt.sha256,handoffPaths:m.entries.filter(e=>e.kind==='handoff').map(e=>e.handoff.path)});for(const r of normalization.rows){await add(await pin(root,r.candidate));await add({path:r.original_source,sha256:r.original_sha256,bytes:r.original_bytes});await add({path:r.beauty_source,sha256:r.beauty_sha256,bytes:r.beauty_bytes})}}
 assert.deepEqual(ordered(normalization.ids),ordered(m.normalization.requiredIds),'Normalization scope incomplete');
 if(m.scope==='complete')assert.deepEqual(ordered(normalization.ids),ordered(m.entries.filter(e=>e.kind==='handoff'&&!e.id.startsWith('prop.')).map(e=>e.id)),'Complete publication requires all selected fresh UI normalization');
 return {m,base,files,normalization,dependencies:[...dependencies.values()]};
}
async function recheck(root,p){for(const d of p.dependencies)await verify(root,d);await baseline(root,p.m)}
function outputs(p){
 const rows=new Map(p.base.map(f=>[f.path,{...f}]));
 for(const e of p.m.entries.filter(e=>e.kind==='handoff'))for(const k of rows.keys())if(k.startsWith(`build/sprites/${e.id}/`))rows.delete(k);
 for(const f of p.files)rows.set('build/'+f.path,{path:'build/'+f.path,sha256:f.source.sha256,bytes:f.source.bytes});
 for(const r of p.normalization.rows)rows.set('build/'+r.destination,{path:'build/'+r.destination,sha256:r.candidate_sha256,bytes:r.candidate_bytes});
 const result=[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path));unique(result);return result;
}
async function graph(assets,p){
 const g=await artPackageSources(assets);assert.deepEqual(ordered(Object.keys(g.index.sprites)),ordered(p.m.expectedIds),'Actual advertised ID inventory');
 const roles=ordered(p.m.entries.filter(e=>!e.id.startsWith('prop.')).map(e=>e.role));assert.deepEqual(ordered(g.index.portraits),roles,'Portrait key inventory');assert.deepEqual(ordered(g.index.buildIcons),roles,'Cameo key inventory');
 const mapped=[];for(const s of g.sources){const rel=path.relative(assets,s.source);assert(safe(rel)&&safe(s.output)&&!/[?#%\x00-\x1f]/.test(s.output),'Unsafe/encoded output alias');mapped.push({path:s.output,source:rel,...await pin(assets,rel),output:s.output})}unique(mapped,'output');
 // Independently enumerate all selected world pages and runtime UI; plugin skips cannot pass.
 const expected=new Set(p.files.filter(f=>f.path.startsWith('sprites/')||f.path.includes('@2x.')).map(f=>'art/'+f.path));
 const selected=mapped.filter(f=>f.output.startsWith('art/sprites/')||f.output.startsWith('art/ui/portraits/')||f.output.startsWith('art/ui/icons/build/'));
 assert.deepEqual(new Set(selected.map(f=>f.output)),expected,'Actual runtime dependency closure');
 return {index:g.index,files:mapped.map(({source,path:ignored,...f})=>({...f,source})).sort((a,b)=>a.output.localeCompare(b.output))};
}
async function copy(root,d,dest){const source=await verify(root,d);await mkdir(path.dirname(dest),{recursive:true});await copyFile(source,dest);assert.deepEqual(await pin(path.dirname(dest),path.basename(dest)),{...d,path:path.basename(dest)});await verify(root,d)}
function privateOutput(root,out){const rel=path.relative(root,out);assert(safe(rel)&&rel.startsWith('work/art/publication-v1/'),'Output must remain in private publication directory')}
export async function prepare({root,selection,out,hook}){
 privateOutput(root,out);await contained(root,path.relative(root,out),{missing:true});assert(await absent(out),'Preserve existing preparation');await mkdir(out,{recursive:true});await contained(root,path.relative(root,out));const code=await codePins();
 await writeJSON(path.join(out,'state.json'),{status:'preparing',selection},{exclusive:true});
 try{
  const p=await load(root,selection);if(hook)assert.equal(p.m.scope,'fixture');await recheck(root,p);await hook?.('before-copy');await recheck(root,p);
  const assets=path.join(out,'assets');await mkdir(assets);for(const f of p.base)await copy(root,{...f,path:p.m.baseline.assets+'/'+f.path},path.join(assets,f.path));
  for(const e of p.m.entries.filter(e=>e.kind==='handoff'))await rm(path.join(assets,'build/sprites',e.id),{recursive:true,force:true});
  for(const f of p.files)await copy(root,f.source,path.join(assets,'build',f.path));
  await hook?.('before-normalization');
  for(const r of p.normalization.rows){await verify(assets,{path:'build/'+r.destination,sha256:r.original_sha256,bytes:r.original_bytes});await verify(assets,{path:'build/'+r.beauty,sha256:r.beauty_sha256,bytes:r.beauty_bytes});await copy(root,{path:r.candidate,sha256:r.candidate_sha256,bytes:r.candidate_bytes},path.join(assets,'build',r.destination))}
  await hook?.('after-copy');await recheck(root,p);const files=outputs(p);await verifyInventory(assets,files);const runtime=await graph(assets,p);await recheck(root,p);assert.deepEqual(await codePins(),code);
  const receipt={format:1,status:'prepared',selection,code,scope:p.m.scope,baseline:p.m.baseline,expectedIds:p.m.expectedIds,dependencies:p.dependencies,files,runtime,normalizationIds:p.normalization.ids};await writeJSON(path.join(out,'prepared.json'),receipt,{exclusive:true});await writeJSON(path.join(out,'state.json'),{status:'prepared'});return pin(out,'prepared.json');
 }catch(error){await writeJSON(path.join(out,'state.json'),{status:'failed',error:String(error)});throw error}
}
export async function check({root,out,prepared,write=true}){
 privateOutput(root,out);await contained(root,path.relative(root,out));const r=await readJSON(out,prepared,'publication');assert.equal(r.status,'prepared');assert.deepEqual(await codePins(),r.code,'Publication implementation changed');const p=await load(root,r.selection);await recheck(root,p);assert.deepEqual(p.dependencies,r.dependencies);assert.deepEqual(outputs(p),r.files);await verifyInventory(path.join(out,'assets'),r.files);assert.deepEqual(await graph(path.join(out,'assets'),p),r.runtime);await recheck(root,p);
 const result={format:1,status:'checked',prepared,selection:r.selection,filesSHA256:sha(Buffer.from(JSON.stringify(r.files))),runtimeSHA256:sha(Buffer.from(JSON.stringify(r.runtime)))};
 if(write){await writeJSON(path.join(out,'checked.json'),result,{exclusive:true});return pin(out,'checked.json')}return {r,p,result};
}
function fixtureTarget(root,m){assert(m.baseline.assets.startsWith('work/art/publication-v1/fixtures/')&&m.baseline.assets.endsWith('/assets'),'Fixture target must stay private')}
async function lockInfo(target){const lock=path.join(target,'.publication-lock');await mkdir(lock);return lock}
async function exactOrAbsent(p,files){if(await absent(p))return false;await verifyInventory(p,files);return true}
export async function promote({root,out,prepared,checked,boundary,hook}){
 const checkReceipt=await readJSON(out,checked,'publication');const {r,p,result}=await check({root,out,prepared,write:false});assert.deepEqual(checkReceipt,result,'Wrong check receipt');
 if(p.m.scope==='fixture')fixtureTarget(root,p.m);else{assert.equal(p.m.scope,'complete','Incomplete selection cannot promote');assert.equal(p.m.expectedIds.length,162);assert.equal(p.m.baseline.assets,'assets','Live destination is only repository assets');const b=await readJSON(root,boundary);assert(b.readersStopped===true&&b.writersStopped===true&&b.selectionSHA256===r.selection.sha256&&b.target==='assets/build','Explicit exclusive boundary receipt required');assert(typeof b.recordedBy==='string'&&b.recordedBy.length>0);assert(Number.isFinite(Date.parse(b.expiresAt))&&Date.parse(b.expiresAt)>Date.now(),'Exclusive boundary receipt expired')}
 if(hook)assert.equal(p.m.scope,'fixture','Fault hooks are test-only');
 const target=await contained(root,p.m.baseline.assets),stage=path.join(out,'assets/build');assert.equal((await lstat(stage)).dev,(await lstat(target)).dev,'Same-filesystem staging required');const lock=await lockInfo(target),token=path.basename(out)+'-'+process.pid;const live=path.join(target,'build'),backup=path.join(target,'.publication-backup-'+token),quarantine=path.join(target,'.publication-failed-'+token);
 const tx={format:1,pid:process.pid,root,out,prepared,checked,boundary,scope:p.m.scope,live,stage,backup,quarantine,oldFiles:p.base.filter(x=>x.path.startsWith('build/')).map(x=>({...x,path:x.path.slice(6)})),newFiles:r.files.filter(x=>x.path.startsWith('build/')).map(x=>({...x,path:x.path.slice(6)})),external:p.base.filter(x=>!x.path.startsWith('build/')),phase:'locked'};let journal=lock;
 try{
  await hook?.('after-lock-created');assert(await absent(backup)&&await absent(quarantine),'Backup collision');await writeJSON(path.join(lock,'transaction.json'),tx,{exclusive:true});await recheck(root,p);if(boundary)await verify(root,boundary);await verifyInventory(stage,tx.newFiles);await hook?.('before-old-rename');
  await rename(live,backup);tx.phase='old-moved';await writeJSON(path.join(lock,'transaction.json'),tx);await hook?.('after-old-rename');
  await rename(stage,live);tx.phase='new-installed';await writeJSON(path.join(lock,'transaction.json'),tx);await hook?.('after-new-rename');await verifyInventory(live,tx.newFiles);await verifyInventory(backup,tx.oldFiles);
  for(const d of tx.external)await verify(target,d);for(const d of p.dependencies)if(!d.path.startsWith(p.m.baseline.assets+'/build/'))await verify(root,d);if(boundary)await verify(root,boundary);
  tx.phase='commit-ready';await writeJSON(path.join(lock,'transaction.json'),tx);await hook?.('after-commit-journal');await writeJSON(path.join(out,'promotion.json'),{...tx,phase:'committed'},{exclusive:true});await hook?.('after-promotion-receipt');await rename(lock,path.join(out,'transaction-committed'));journal=path.join(out,'transaction-committed');await hook?.('after-journal-archived');return {...tx,phase:'committed'};
 }catch(error){
  // The durable decision is final. A failure to archive its lock must not roll it back.
  if(!await absent(path.join(out,'promotion.json'))){error.committed=true;throw error}
  try{await rollback(tx);tx.phase='rolled-back';await writeJSON(path.join(journal,'transaction.json'),tx);await rename(journal,path.join(out,'transaction-rolled-back'));await writeJSON(path.join(out,'promotion-failed.json'),{error:String(error),rollback:'passed',transaction:tx},{exclusive:true})}catch(recovery){try{await writeJSON(path.join(out,'promotion-failed.json'),{error:String(error),rollback:'manual-recovery-required',recovery:String(recovery),transaction:tx},{exclusive:true})}catch(recording){error.recordingFailure=String(recording)}error.recoveryFailure=String(recovery)}throw error;
 }
}
async function rollback(tx){
 // Decide from verified bytes, not a journal phase that a crash may precede.
 const liveExists=!await absent(tx.live),backupExists=!await absent(tx.backup);
 if(backupExists){await verifyInventory(tx.backup,tx.oldFiles);if(liveExists){await verifyInventory(tx.live,tx.newFiles);assert(await absent(tx.quarantine));await rename(tx.live,tx.quarantine)}await rename(tx.backup,tx.live)}
 else assert(liveExists,'Old build missing: manual recovery required');
 await verifyInventory(tx.live,tx.oldFiles);
}
export async function recover({root,out,prepared,checked}){
 privateOutput(root,out);const receipt=await readJSON(out,prepared,'publication'),proof=await readJSON(out,checked,'publication');assert.deepEqual(proof,{format:1,status:'checked',prepared,selection:receipt.selection,filesSHA256:sha(Buffer.from(JSON.stringify(receipt.files))),runtimeSHA256:sha(Buffer.from(JSON.stringify(receipt.runtime)))});assert.deepEqual(await codePins(),receipt.code);const selection=await readJSON(root,receipt.selection);
 if(selection.scope==='fixture')fixtureTarget(root,selection);else assert(selection.scope==='complete'&&selection.baseline.assets==='assets'&&selection.expectedIds.length===162);
 const target=await contained(root,selection.baseline.assets),lock=path.join(target,'.publication-lock');
 const recovered=path.join(out,'transaction-recovered'),committed=path.join(out,'transaction-committed');let journal=lock,already=false;
 if(await absent(lock)){if(!await absent(recovered)){journal=recovered;already=true}else if(!await absent(committed))journal=committed}
 assert(!await absent(path.join(journal,'transaction.json')),'Empty/orphan lock has no authenticated journal: preserve it for manual recovery, never steal');
 const tx=JSON.parse(await readFile(path.join(journal,'transaction.json'),'utf8'));
 assert(Number.isSafeInteger(tx.pid)&&tx.pid>0,'Invalid transaction owner');
 assert.equal(tx.root,root);assert.equal(tx.out,out);assert.deepEqual(tx.prepared,prepared);assert.deepEqual(tx.checked,checked);assert.equal(tx.live,path.join(target,'build'));assert.equal(tx.stage,path.join(out,'assets/build'));assert.equal(tx.backup,path.join(target,`.publication-backup-${path.basename(out)}-${tx.pid}`));assert.equal(tx.quarantine,path.join(target,`.publication-failed-${path.basename(out)}-${tx.pid}`));
 assert.deepEqual(tx.newFiles,receipt.files.filter(x=>x.path.startsWith('build/')).map(x=>({...x,path:x.path.slice(6)})));const base=await readJSON(root,selection.baseline.inventory,'inventory');assert.deepEqual(tx.oldFiles,base.files.filter(x=>x.path.startsWith('build/')).map(x=>({...x,path:x.path.slice(6)})));
 let alive=true;try{process.kill(tx.pid,0)}catch(e){if(e.code==='ESRCH')alive=false;else throw e}assert(!alive,'Transaction owner is still alive; do not steal its lock');
 if(!await absent(path.join(out,'promotion.json'))){
  const decision=JSON.parse(await readFile(path.join(out,'promotion.json'),'utf8'));assert.deepEqual(decision,{...tx,phase:'committed'},'Commit decision identity mismatch');await verifyInventory(tx.live,tx.newFiles);await verifyInventory(tx.backup,tx.oldFiles);for(const d of tx.external)await verify(target,d);
  if(journal===lock){assert(await absent(committed));await rename(lock,committed)}else assert.equal(journal,committed);return {...tx,phase:'committed'};
 }
 if(already){await verifyInventory(tx.live,tx.oldFiles);return {...tx,phase:'rolled-back'}}
 await rollback(tx);const recovery={status:'rolled-back',transaction:tx};const file=path.join(out,'recovery.json');if(await absent(file))await writeJSON(file,recovery,{exclusive:true});else assert.deepEqual(JSON.parse(await readFile(file,'utf8')),recovery,'Recovery receipt identity mismatch');await rename(journal,recovered);return {...tx,phase:'rolled-back'};
}
export async function captureBaseline(root,assets){assert(safe(assets));return {files:await tree(await contained(root,assets))}}
