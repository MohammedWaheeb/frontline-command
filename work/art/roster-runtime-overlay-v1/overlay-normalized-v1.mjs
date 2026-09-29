// Private receipt-bound asset union. No rendering, source edits, server or shipping writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFile,lstat,mkdir,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareNormalizedMasks,applyNormalizedMasks,verifyNormalizedMasks} from './normalization-v1/apply.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
const sha=data=>createHash('sha256').update(data).digest('hex');
const safe=rel=>typeof rel==='string'&&!path.isAbsolute(rel)&&!rel.includes('\\')&&!rel.split('/').some(p=>!p||p==='.'||p==='..');
const digest=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
const read=rel=>{assert(safe(rel),`Unsafe relative path: ${rel}`);return readFile(path.join(repo,rel))};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const [flag,basePath,name,normalFlag,normalPath,hashFlag,normalSHA,...handoffPaths]=process.argv.slice(2);
assert.equal(flag,'--base-lock');assert(safe(basePath));const dry=name==='--check';
assert.equal(normalFlag,'--normalized-masks');assert.equal(hashFlag,'--normalized-sha256');assert(safe(normalPath)&&digest(normalSHA));
assert(dry||/^[a-z0-9][a-z0-9-]{0,63}$/.test(name??''),'New output name required');
assert(handoffPaths.length>0&&handoffPaths.length<=256,'Supply1–256 full-export handoffs');
assert.equal(new Set(handoffPaths).size,handoffPaths.length,'Duplicate handoff path');
const helperRoot='work/art/roster-runtime-overlay-v1/packaging-v3';
const helperLockBytes=await read(`${helperRoot}/lock.json`),helperLock=JSON.parse(helperLockBytes);
for(const [rel,hash] of Object.entries(helperLock.helpers)){assert(safe(rel)&&digest(hash));assert.equal(sha(await read(`${helperRoot}/${rel}`)),hash,rel)}
const baseLockBytes=await read(basePath),baseLock=JSON.parse(baseLockBytes);assert(safe(baseLock.base)&&baseLock.base.startsWith('work/art/'));
const base=path.join(repo,baseLock.base),baseProduct=path.join(base,'product');
const baseBuild=await readFile(path.join(base,'build.json')),basePackBytes=await readFile(path.join(baseProduct,'assets/packs/base.json')),baseIndexBytes=await readFile(path.join(baseProduct,'art/index.json'));
for(const [bytes,hash,label] of [[baseBuild,baseLock.base_build_sha256,'build'],[basePackBytes,baseLock.base_pack_sha256,'pack'],[baseIndexBytes,baseLock.base_art_index_sha256,'index']]){assert(digest(hash));assert.equal(sha(bytes),hash,`Frozen base ${label}`)}
const basePack=JSON.parse(basePackBytes),index=JSON.parse(baseIndexBytes),ids=new Set(),roles=new Set(),destinations=new Set(),sourceHashes=new Map(),assets=[];
async function pinned(rel,hash){
 assert(safe(rel)&&digest(hash),`Invalid pinned source ${rel}`);const physical=await realpath(path.join(repo,rel));assert(physical.startsWith(repo+path.sep));
 if(sourceHashes.has(physical))assert.equal(sourceHashes.get(physical),hash,`Ambiguous source hash ${rel}`);
 sourceHashes.set(physical,hash);assert((await lstat(path.join(repo,rel))).isFile(),`Non-file ${rel}`);
 const data=await read(rel);assert.equal(sha(data),hash,rel);return data;
}
for(const handoffPath of handoffPaths){
 const handoffBytes=await read(handoffPath),h=JSON.parse(handoffBytes),id=h.id;
 assert(/^(unit|building|prop)\.[A-Za-z0-9_.-]+$/.test(id??''),`Invalid asset ID ${id}`);assert(!ids.has(id),`Duplicate asset ID ${id}`);ids.add(id);
 assert(safe(h.stage)&&h.stage.startsWith('work/art/'),'Only isolated stages accepted');
 const stage=path.join(repo,h.stage),stagePhysical=await realpath(stage),specRel=h.spec??`${h.stage}/assets/pipeline/specs/${id}.json`;
 assert.equal(specRel,`${h.stage}/assets/pipeline/specs/${id}.json`,'Ambiguous spec source');
 const specBytes=await read(specRel),spec=JSON.parse(specBytes);assert.equal(spec.id,id);assert(typeof spec.model==='string'&&/^[a-z][a-z0-9_]*$/.test(spec.model));
 const role=spec.role_id??id;assert(/^[A-Za-z0-9_.-]+$/.test(role));assert(!roles.has(role),`Ambiguous UI role ${role}`);roles.add(role);
 const modelRel=h.reviewed_source??h.model;assert.equal(modelRel,`${h.stage}/assets/pipeline/blender/models/${spec.model}.py`,'Ambiguous model source');
 const receiptHashes=h.checks??h.receipts;assert(object(receiptHashes),'Missing pinned checks');
 const receiptData=new Map();for(const [rel,hash] of Object.entries(receiptHashes))receiptData.set(rel,await pinned(rel,hash));
 const prefix=path.posix.dirname(handoffPath).replace(/\/runtime-handoff$/,'');
 const nativeRel=`${prefix}/contacts/${id}/native-review.json`,checkRel=`${prefix}/check-${id}.json`,uiRel=`${prefix}/ui-check-${id}.json`,productionRel=`${prefix}/production-lock.json`;
 for(const rel of [nativeRel,checkRel,uiRel,productionRel])assert(receiptData.has(rel),`Missing required pinned receipt ${rel}`);
 const native=JSON.parse(receiptData.get(nativeRel));assert(native.accepted===true||native.accepted_bounded_export===true,'Native review not accepted');
 const check=JSON.parse(receiptData.get(checkRel)),ui=JSON.parse(receiptData.get(uiRel));assert.equal(check.failures,0,'Integrity failures');assert.equal(ui.failures,0,'UI failures');
 const production=JSON.parse(receiptData.get(productionRel));assert.equal(production.stage,h.stage,'Stage lock mismatch');
 const sourceMap=production.sources??production.sha256;assert(object(sourceMap),'Unsupported source lock');
 const sourceHash=rel=>sourceMap[rel.slice(h.stage.length+1)]??sourceMap[rel];
 const modelHash=h.model_sha256??sourceHash(modelRel),specHash=h.spec_sha256??sourceHash(specRel);
 if(sourceHash(modelRel))assert.equal(modelHash,sourceHash(modelRel),'Ambiguous model hashes');
 if(sourceHash(specRel))assert.equal(specHash,sourceHash(specRel),'Ambiguous spec hashes');
 const modelBytes=await pinned(modelRel,modelHash);await pinned(specRel,specHash);
 const poseCount=spec.states.reduce((n,s)=>n+s.frames*s.directions,0);assert(Number.isSafeInteger(poseCount)&&poseCount>0);
 if(h.poses!==undefined)assert.equal(h.poses,poseCount);if(h.state_pose_count!==undefined)assert.equal(h.state_pose_count,poseCount);if(check.poses!==undefined)assert.equal(check.poses,poseCount);
 const files=[];assert(object(h.files));
 for(const [rel,r] of Object.entries(h.files)){
  assert(safe(rel)&&safe(r.source)&&Number.isSafeInteger(r.bytes)&&r.bytes>=0);assert(!destinations.has(rel),`Duplicate output ${rel}`);destinations.add(rel);
  const uiPrefix=['portraits','icons/build'].some(folder=>['1x','2x'].some(scale=>['beauty','team'].some(layer=>rel===`ui/${folder}/${role}@${scale}.${layer}.png`)));
  assert(rel.startsWith(`sprites/${id}/`)||uiPrefix,`Unowned output ${rel}`);assert(/\.(png|json)$/.test(rel),'Unexpected export type');
  assert.equal(r.source,`${h.stage}/assets/build/${rel}`,'Ambiguous export source');assert((await realpath(path.join(repo,r.source))).startsWith(stagePhysical+path.sep));
  const data=await pinned(r.source,r.sha256);assert.equal(data.length,r.bytes,rel);files.push({rel,source:r.source,sha256:r.sha256,bytes:r.bytes});
 }
 const sideRel=`sprites/${id}/${id}.sprite.json`;assert(destinations.has(sideRel));const side=JSON.parse(await read(`${h.stage}/assets/build/${sideRel}`));
 assert.equal(side.id,id);assert.equal(side.role_id ?? side.id,role);assert.deepEqual(side.states,spec.states);assert.equal(side.frame_count,poseCount);
 const expected=new Set([sideRel]);
 for(const layers of Object.values(side.atlases))for(const descriptors of Object.values(layers))for(const descriptor of descriptors){
  assert(safe(descriptor)&&!descriptor.includes('/'));const rel=`sprites/${id}/${descriptor}`;assert(destinations.has(rel),`Missing descriptor ${rel}`);expected.add(rel);
  const atlas=JSON.parse(await read(`${h.stage}/assets/build/${rel}`));assert(safe(atlas.meta.image)&&!atlas.meta.image.includes('/'));const image=`sprites/${id}/${atlas.meta.image}`;assert(destinations.has(image),`Missing PNG ${image}`);expected.add(image);
 }
 for(const folder of ['portraits','icons/build'])for(const scale of ['1x','2x'])for(const layer of ['beauty','team'])expected.add(`ui/${folder}/${role}@${scale}.${layer}.png`);
 assert.deepEqual(new Set(files.map(f=>f.rel)),expected,'Export must exactly close over sprite/atlas/UI set');
 const blendRel=h.editable_blend??`${h.stage}/assets/source/blender/${id}.blend`;assert.equal(blendRel,`${h.stage}/assets/source/blender/${id}.blend`);
 const blend=await read(blendRel);assert(blend.length>1024);const blendHash=sha(blend);
 assets.push({id,role,poseCount,handoffPath,handoffBytes,h,modelRel,modelHash,modelBytes,specRel,specHash,specBytes,nativeRel,nativeBytes:receiptData.get(nativeRel),blendRel,blendHash,files});
}
const normalizationPlan=await prepareNormalizedMasks({repo,receiptPath:normalPath,receiptSHA256:normalSHA,handoffPaths});
const validation={check:'passed',base:baseLock.base,ids:[...ids],files:assets.reduce((n,a)=>n+a.files.length,0),bytes:assets.reduce((n,a)=>n+a.files.reduce((s,f)=>s+f.bytes,0),0),poses:assets.reduce((n,a)=>n+a.poseCount,0),normalization:{receipt:normalPath,sha256:normalSHA,ids:normalizationPlan.ids,masks:normalizationPlan.rows.length},writes:false};
if(dry){console.log(JSON.stringify(validation));process.exit(0)}
const out=path.join(here,'outputs',name),product=path.join(out,'product');await mkdir(path.dirname(out),{recursive:true});await mkdir(out);await mkdir(product);
await writeFile(path.join(out,'INCOMPLETE.md'),'Private asset union incomplete until build.json exists. Preserve partial evidence after failure.\n');
execFileSync('cp',['-cR',baseProduct+'/.',product]);
for(const entry of basePack.files){assert(entry.path.startsWith('/')&&safe(entry.path.slice(1)));const data=await readFile(path.join(product,entry.path.slice(1)));assert.equal(data.length,entry.bytes);assert.equal(sha(data),entry.sha256,entry.path)}
const receipts=[];
for(const a of assets){
 // Only this fresh private clone is cleaned; old asset pages cannot linger.
 await rm(path.join(product,'art/sprites',a.id),{recursive:true,force:true});
 for(const file of a.files){const dest=path.join(product,'art',file.rel);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(repo,file.source),dest);const data=await readFile(dest);assert.equal(data.length,file.bytes);assert.equal(sha(data),file.sha256)}
 index.sprites[a.id]=`sprites/${a.id}/${a.id}.sprite.json`;for(const field of ['portraits','buildIcons'])if(!index[field].includes(a.role))index[field].push(a.role);
 const evidence=path.join(out,'asset-evidence',a.id);await mkdir(evidence,{recursive:true});
 await writeFile(path.join(evidence,'handoff.json'),a.handoffBytes);await writeFile(path.join(evidence,path.basename(a.modelRel)),a.modelBytes);await writeFile(path.join(evidence,'spec.json'),a.specBytes);await writeFile(path.join(evidence,'native-review.json'),a.nativeBytes);
 receipts.push({id:a.id,pose_count:a.poseCount,handoff:a.handoffPath,handoff_sha256:sha(a.handoffBytes),model:a.modelRel,model_sha256:a.modelHash,spec:a.specRel,spec_sha256:a.specHash,editable_blend:a.blendRel,editable_blend_sha256:a.blendHash,files:a.files.map(f=>({path:`/art/${f.rel}`,sha256:f.sha256,bytes:f.bytes}))});
}
// Hand-off copies must happen first. No later asset copy may restore old masks.
const normalization=await applyNormalizedMasks({product,plan:normalizationPlan});
const normalized=new Map(normalization.files.map(f=>[f.path,f]));
for(const asset of receipts)for(const descriptor of asset.files){
 const change=normalized.get(descriptor.path),data=await readFile(path.join(product,descriptor.path.slice(1)));
 assert.equal(data.length,change?.bytes??descriptor.bytes);assert.equal(sha(data),change?.sha256??descriptor.sha256,`Final world/beauty/mask identity ${descriptor.path}`);
 if(change)Object.assign(descriptor,{original_sha256:descriptor.sha256,original_bytes:descriptor.bytes,sha256:change.sha256,bytes:change.bytes,transformation:'reviewed UI team-mask normalization'});
}
await writeFile(path.join(product,'art/index.json'),JSON.stringify(index));
await verifyNormalizedMasks({product,plan:normalizationPlan});
const {writeBasePack}=await import(pathToFileURL(path.join(repo,helperRoot,'helpers/client/scripts/ui/art-plugin.mjs')).href),pack=await writeBasePack(product);
// Generated pack version may change in the content index, but no authored field.
assert.equal(pack.id,'2.0.0');assert(/^content-v1-[a-f0-9]{64}$/.test(pack.version));
const oldContentBytes=await readFile(path.join(baseProduct,'content/index.json'));
const newContentBytes=await readFile(path.join(product,'content/index.json'));
const oldContent=JSON.parse(oldContentBytes),newContent=JSON.parse(newContentBytes);
const oldRows=(oldContent.packs??[]).filter(p=>p.id==='2.0.0'),newRows=(newContent.packs??[]).filter(p=>p.id==='2.0.0');
assert.equal(oldRows.length,1);assert.equal(newRows.length,1);assert.equal(newRows[0].version,pack.version);
newRows[0].version=oldRows[0].version;assert.deepEqual(newContent,oldContent,'Only generated content-index pack version may change');
const generatedContentIndex={path:'/content/index.json',before_sha256:sha(oldContentBytes),after_sha256:sha(newContentBytes),authored_fields_exact:true};
const permitted=new Set(['/art/index.json','/content/index.json',...receipts.flatMap(a=>a.files.map(f=>f.path))]),ownedOld=rel=>assets.some(a=>rel.startsWith(`/art/sprites/${a.id}/`));
const newFiles=new Map(pack.files.map(f=>[f.path,f])),oldFiles=new Map(basePack.files.map(f=>[f.path,f]));let unrelated=0;
for(const old of basePack.files)if(!permitted.has(old.path)&&!ownedOld(old.path)){assert.deepEqual(newFiles.get(old.path),old,`Unrelated entry changed ${old.path}`);unrelated++}
for(const entry of pack.files)assert(oldFiles.has(entry.path)||permitted.has(entry.path),`Unowned new entry ${entry.path}`);
assert.equal(sha(await readFile(path.join(baseProduct,'assets/packs/base.json'))),baseLock.base_pack_sha256);assert.equal(sha(await readFile(path.join(baseProduct,'art/index.json'))),baseLock.base_art_index_sha256);assert.equal(sha(await readFile(path.join(base,'build.json'))),baseLock.base_build_sha256);
const host=await readFile(path.join(base,'frontline'));await writeFile(path.join(out,'frontline'),host,{mode:0o755});await writeFile(path.join(out,'base-build.json'),baseBuild);
await writeFile(path.join(out,'build.json'),JSON.stringify({time:new Date().toISOString(),scope:'Fresh private full-export union with explicitly reviewed UI team-mask derivatives only. No actual gameplay, lifecycle, final visual, performance or shipping approval inferred.',base:baseLock.base,base_lock:basePath,base_lock_sha256:sha(baseLockBytes),base_build_sha256:baseLock.base_build_sha256,base_pack_sha256:baseLock.base_pack_sha256,host_sha256:sha(host),recipe_sha256:sha(await readFile(fileURLToPath(import.meta.url))),normalizer_sha256:sha(await readFile(path.join(here,'normalization-v1/apply.mjs'))),normalization,helper_lock_sha256:sha(helperLockBytes),assets:receipts,pack_version:pack.version,generated_content_index:generatedContentIndex,pack_sha256:sha(await readFile(path.join(product,'assets/packs/base.json'))),unrelated_base_pack_entries_exact:unrelated,base_unchanged:true},null,2)+'\n');
await writeFile(path.join(out,'INCOMPLETE.md'),'Private union complete; build.json pins exact evidence. Actual product acceptance remains pending.\n');console.log(out);
