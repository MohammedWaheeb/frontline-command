// Actual immutable current53/catalog56 inputs; mutations only in this run's scratch.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareNormalizedMasks,applyNormalizedMasks,verifyNormalizedMasks} from './apply.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../../..');
const name=process.argv[2];assert(/^[a-z0-9-]+$/.test(name??''),'Use a new evidence name');
const out=path.join(here,name);await mkdir(out);const rel=p=>path.relative(repo,p).split(path.sep).join('/');
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=async p=>sha(await readFile(p));
const receiptPath='work/art/ui-team-normalization-audit-v1/normalized-current53-v1/result.json';
const receiptSHA256='2131210ccd1bfbe8a54dbb950629c19e964bead726f96249ea1bde7112fc36e6';
const catalogPath='work/art/roster-runtime-overlay-v1/catalog-v56-v1/result.json',catalog=JSON.parse(await readFile(path.join(repo,catalogPath)));
const handoffPaths=catalog.assets.map(a=>a.handoff),args={repo,receiptPath,receiptSHA256,handoffPaths};
const result={scope:'Nonvisual preparation and bounded temporary-file transformation only. No full product build, browser, art rendering, accepted recipe mutation or source-art mutation.',started:new Date().toISOString(),checks:[],status:'running'};
const protectedPaths=[receiptPath,catalogPath,'work/art/roster-runtime-overlay-v1/overlay-v3.mjs','work/art/roster-runtime-overlay-v1/packaging-v3/lock.json',...handoffPaths];
const originals=JSON.parse(await readFile(path.join(repo,receiptPath)));
protectedPaths.push(...originals.files.flatMap(r=>[r.original_source,r.candidate]));
const before=Object.fromEntries(await Promise.all([...new Set(protectedPaths)].map(async p=>[p,await hash(path.join(repo,p))])));
async function check(name,fn){await fn();result.checks.push({name,passed:true});console.log('PASS',name)}
let plan,product;
try{
 await check('current53 receipt prepares 212 exact masks against all56 selected handoffs',async()=>{
  for(const row of catalog.assets)assert.equal(await hash(path.join(repo,row.handoff)),row.handoff_sha256);
  plan=await prepareNormalizedMasks(args);assert.equal(plan.ids.length,53);assert.equal(plan.rows.length,212);assert.equal(plan.rows.filter(r=>r.destination.includes('@2x.')).length,106);
  result.preparation={ids:plan.ids,masks:plan.rows.length,selectedHandoffs:handoffPaths.length,receiptSHA256,uncovered:catalog.assets.filter(r=>!plan.ids.includes(r.id)).map(r=>r.id)};
 });
 await check('actual stale US rifle handoff is rejected',async()=>{
  const old='work/art/legacy-us-rifle-ui-v1/runtime-handoff.json';
  const altered=handoffPaths.map(p=>catalog.assets.find(r=>r.handoff===p).id==='unit.US.rifle'?old:p);
  await assert.rejects(prepareNormalizedMasks({...args,handoffPaths:altered}),/Stale handoff path: unit.US.rifle/);
 });
 async function alteredReceipt(label,alter){
  const dir=path.join(out,label);await mkdir(dir);const r=structuredClone(originals);await alter(r,dir);
  const target=path.join(dir,'result.json');await writeFile(target,JSON.stringify(r));return {...args,receiptPath:rel(target),receiptSHA256:await hash(target)};
 }
 await check('same-path changed handoff identity is rejected',async()=>{
  const a=await alteredReceipt('bad-handoff',async r=>{r.handoffs.find(h=>h.id==='unit.US.rifle').sha256='0'.repeat(64)});
  await assert.rejects(prepareNormalizedMasks(a),/Stale handoff identity: unit.US.rifle/);
 });
 await check('mismatched original descriptor cannot accept a reviewed derivative',async()=>{
  const a=await alteredReceipt('bad-original',async r=>{r.files[0].original_sha256='0'.repeat(64)});
  await assert.rejects(prepareNormalizedMasks(a),/Original mask descriptor mismatch/);
 });
 await check('corrupt candidate bytes are rejected',async()=>{
  const a=await alteredReceipt('bad-candidate',async(r,dir)=>{
   const target=path.join(dir,'candidate',r.files[0].destination);await mkdir(path.dirname(target),{recursive:true});
   const bytes=Buffer.from(await readFile(path.join(repo,r.files[0].candidate)));bytes[bytes.length-1]^=1;
   await writeFile(target,bytes);r.files[0].candidate=rel(target);
  });await assert.rejects(prepareNormalizedMasks(a),/SHA mismatch:/);
 });
 await check('original targets must exist before normalization',async()=>{
  const parent=path.join(out,'temporary-overlay');product=path.join(parent,'product');await mkdir(product,{recursive:true});await writeFile(path.join(parent,'INCOMPLETE.md'),'Private asset union incomplete until build.json exists.');
  await assert.rejects(applyNormalizedMasks({product,plan}),/ENOENT/);
 });
 // Original real UI PNGs only. World controls are a real prop descriptor and
 // real catalogue sidecar; they are not changed or interpreted as gameplay.
 const world=['assets/build/sprites/prop.palm/prop.palm.sprite.json','assets/build/sprites/unit.US.rig/unit.US.rig.sprite.json'];
 for(const r of plan.rows)for(const [source,destination] of [[r.original_source,r.destination],[r.beauty_source,r.beauty]]){
  const dest=path.join(product,'art',destination);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(repo,source),dest);
 }
 for(const source of world){const dest=path.join(product,'art',source.slice('assets/build/'.length));await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(repo,source),dest)}
 const controls=[...new Set(plan.rows.map(r=>'art/'+r.beauty)),...world.map(p=>'art/'+p.slice('assets/build/'.length))];
 const controlsBefore=Object.fromEntries(await Promise.all(controls.map(async p=>[p,await hash(path.join(product,p))])));
 const maskHashes=async()=>Object.fromEntries(await Promise.all(plan.rows.map(async r=>[r.destination,await hash(path.join(product,'art',r.destination))])));
 await check('wrong original output mask rejects before any derivative is written',async()=>{
  const r=plan.rows.at(-1),dest=path.join(product,'art',r.destination),bytes=await readFile(dest);await writeFile(dest,Buffer.concat([bytes,Buffer.from([0])]));
  const masksBefore=await maskHashes();await assert.rejects(applyNormalizedMasks({product,plan}),/SHA mismatch:/);assert.deepEqual(await maskHashes(),masksBefore);await writeFile(dest,bytes);
 });
 await check('sealed product cannot be edited',async()=>{
  const marker=path.join(path.dirname(product),'build.json');await writeFile(marker,'{}');await assert.rejects(applyNormalizedMasks({product,plan}),/Refuse an already sealed product/);await rm(marker);
 });
 await check('apply after handoff copies preserves all beauty/world controls',async()=>{
  const applied=await applyNormalizedMasks({product,plan});await verifyNormalizedMasks({product,plan});assert.equal(applied.files.length,212);
  for(const [p,want] of Object.entries(controlsBefore))assert.equal(await hash(path.join(product,p)),want,p);
  result.applied={masks:applied.files.length,beautyAndWorldControls:Object.keys(controlsBefore).length,output:rel(product),allFinalMaskHashes:await maskHashes()};
 });
 await check('late original handoff copy is detected before pack generation',async()=>{
  const r=plan.rows.find(r=>r.id==='unit.US.rifle'&&r.destination.includes('@2x.'));assert.notEqual(r.original_sha256,r.candidate_sha256);
  await copyFile(path.join(repo,r.original_source),path.join(product,'art',r.destination));await assert.rejects(verifyNormalizedMasks({product,plan}),/SHA mismatch:/);
  await copyFile(path.join(repo,r.candidate),path.join(product,'art',r.destination));await verifyNormalizedMasks({product,plan});
 });
 await check('mutated prepared plans are rejected',async()=>{
  const old=plan.rows[0].candidate_sha256;plan.rows[0].candidate_sha256='0'.repeat(64);await assert.rejects(verifyNormalizedMasks({product,plan}),/Normalization plan changed/);plan.rows[0].candidate_sha256=old;
 });
 await check('every protected original and accepted overlay remains exact',async()=>{
  for(const [p,want] of Object.entries(before))assert.equal(await hash(path.join(repo,p)),want,p);
  result.protectedInputs=before;
 });
 result.status='passed';
}catch(error){result.status='failed';result.error={message:String(error),stack:error.stack};process.exitCode=1}
finally{
 result.finished=new Date().toISOString();result.helpers={};for(const p of ['apply.mjs','verify.mjs','../overlay-normalized-v1.mjs'])result.helpers[p]=await hash(path.join(here,p));
 await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
 // Keep the small mutated receipt/PNG controls; discard the disposable 426-file
 // UI copy only after its hashes and outcome are recorded. No product created.
 if(result.status==='passed'&&product)await rm(path.dirname(product),{recursive:true});
 console.log(JSON.stringify({status:result.status,checks:result.checks.length,receipt:rel(path.join(out,'result.json'))}));
}
