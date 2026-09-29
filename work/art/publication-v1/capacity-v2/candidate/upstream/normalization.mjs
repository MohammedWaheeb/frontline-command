// Private assembly transform. Only explicitly reviewed team-mask bytes change.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,realpath,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';

const sha=data=>createHash('sha256').update(data).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const safe=value=>typeof value==='string'&&!path.isAbsolute(value)&&!value.includes('\\')&&!value.split('/').some(p=>!p||p==='.'||p==='..');
const mask=value=>/^ui\/(?:portraits|icons\/build)\/[A-Za-z0-9_.-]+@(1x|2x)\.team\.png$/.test(value);
const prepared=new WeakMap();

async function file(root,rel,expected){
 assert(safe(rel)&&digest(expected),`Invalid pinned path ${rel}`);
 const absolute=path.join(root,rel),stat=await lstat(absolute);
 assert(stat.isFile()&&!stat.isSymbolicLink(),`Expected regular file ${rel}`);
 assert((await realpath(absolute)).startsWith(await realpath(root)+path.sep),`Escaping source ${rel}`);
 const bytes=await readFile(absolute);assert.equal(sha(bytes),expected,`SHA mismatch: ${rel}`);return bytes;
}
function fingerprint(plan){return sha(Buffer.from(JSON.stringify(plan)))}

export async function prepareNormalizedMasks({repo,receiptPath,receiptSHA256,handoffPaths}){
 assert(safe(receiptPath)&&digest(receiptSHA256));assert(Array.isArray(handoffPaths)&&handoffPaths.length>0&&handoffPaths.length<=256);
 const receiptBytes=await file(repo,receiptPath,receiptSHA256),receipt=JSON.parse(receiptBytes);
 assert(Array.isArray(receipt.files)&&receipt.files.length>0&&receipt.files.length<=1024,'Invalid normalization rows');
 assert(Array.isArray(receipt.failures)&&receipt.failures.length===0,'Normalization receipt failed');
 assert(Array.isArray(receipt.handoffs)&&receipt.handoffs.length>0,'Missing reviewed handoffs');
 const selected=new Map(),pins=[];
 for(const rel of handoffPaths){
  assert(safe(rel));const bytes=await readFile(path.join(repo,rel)),hash=sha(bytes),h=JSON.parse(bytes);
  await file(repo,rel,hash);assert(typeof h.id==='string'&&!selected.has(h.id),'Duplicate selected handoff');
  selected.set(h.id,{path:rel,sha256:hash,data:h});pins.push({path:rel,sha256:hash});
 }
 const reviewed=new Map();
 for(const h of receipt.handoffs){
  assert(typeof h.id==='string'&&!reviewed.has(h.id),'Duplicate reviewed handoff');
  const current=selected.get(h.id);assert(current,`Missing selected handoff ${h.id}`);
  assert.equal(current.path,h.path,`Stale handoff path: ${h.id}`);
  assert.equal(current.sha256,h.sha256,`Stale handoff identity: ${h.id}`);reviewed.set(h.id,current);
 }
 const seen=new Set(),rows=[];
 for(const row of receipt.files){
  assert(reviewed.has(row.id),`Unreviewed normalization ID ${row.id}`);
  assert(safe(row.destination)&&mask(row.destination)&&!seen.has(row.destination),'Invalid/duplicate team-mask destination');seen.add(row.destination);
  for(const key of ['alpha_changed_pixels','coverage_changed_pixels','non_gray_pixels'])assert.equal(row[key],0,`Failed mask invariant ${key}`);
  const h=reviewed.get(row.id).data,original=h.files?.[row.destination];assert(original,`Mask absent from selected handoff: ${row.destination}`);
  assert.equal(original.source,row.original_source,'Original mask source mismatch');assert.equal(original.sha256,row.original_sha256,'Original mask descriptor mismatch');
  assert(Number.isSafeInteger(original.bytes)&&original.bytes>=0);const originalBytes=await file(repo,original.source,original.sha256);assert.equal(originalBytes.length,original.bytes);
  const beautyPath=row.destination.replace('.team.png','.beauty.png'),beauty=h.files[beautyPath];assert(beauty,'Missing paired beauty descriptor');
  const beautyBytes=await file(repo,beauty.source,beauty.sha256);assert.equal(beautyBytes.length,beauty.bytes);
  assert(safe(row.candidate)&&row.candidate.startsWith(path.posix.dirname(receiptPath)+'/candidate/'),'Candidate outside reviewed receipt');
  const candidate=await file(repo,row.candidate,row.candidate_sha256);
  rows.push({id:row.id,destination:row.destination,original_source:original.source,original_sha256:original.sha256,original_bytes:original.bytes,candidate:row.candidate,candidate_sha256:row.candidate_sha256,candidate_bytes:candidate.length,beauty:beautyPath,beauty_source:beauty.source,beauty_sha256:beauty.sha256,beauty_bytes:beauty.bytes});
 }
 for(const [id,current] of reviewed){
  const required=Object.keys(current.data.files).filter(mask).sort();assert.equal(required.length,4,`Reviewed role must have four original team masks: ${id}`);
  assert.deepEqual(rows.filter(r=>r.id===id).map(r=>r.destination).sort(),required,`Incomplete reviewed masks: ${id}`);
 }
 const plan={receipt:receiptPath,receipt_sha256:receiptSHA256,handoffs:pins,ids:[...reviewed.keys()],rows};
 prepared.set(plan,{repo,fingerprint:fingerprint(plan)});return plan;
}

export async function applyNormalizedMasks({product,plan}){
 const verified=prepared.get(plan);assert(verified,'Use a prepared normalization plan');
 assert.equal(fingerprint(plan),verified.fingerprint,'Normalization plan changed');
 const parent=path.dirname(product);assert.equal(path.basename(product),'product','Expected private product directory');
 assert((await readFile(path.join(parent,'INCOMPLETE.md'),'utf8')).includes('Private asset union incomplete'),'Product must be an unfinished new overlay');
 await assert.rejects(lstat(path.join(parent,'build.json')),e=>e.code==='ENOENT','Refuse an already sealed product');
 await file(verified.repo,plan.receipt,plan.receipt_sha256);
 for(const h of plan.handoffs)await file(verified.repo,h.path,h.sha256);
 // Check every target before any mutation. The unsealed directory remains
 // explicitly incomplete after an IO failure; it is never a served product.
 for(const r of plan.rows){
  await file(verified.repo,r.original_source,r.original_sha256);await file(verified.repo,r.candidate,r.candidate_sha256);
  await file(product,'art/'+r.destination,r.original_sha256);await file(product,'art/'+r.beauty,r.beauty_sha256);
 }
 const changed=[];
 for(const r of plan.rows){
  const dest=path.join(product,'art',r.destination),temp=dest+'.normalized-pending-'+process.pid;
  try{await writeFile(temp,await file(verified.repo,r.candidate,r.candidate_sha256),{flag:'wx'});await rename(temp,dest)}finally{await rm(temp,{force:true})}
  const bytes=await file(product,'art/'+r.destination,r.candidate_sha256);assert.equal(bytes.length,r.candidate_bytes);
  await file(product,'art/'+r.beauty,r.beauty_sha256);
  changed.push({id:r.id,path:'/art/'+r.destination,original_sha256:r.original_sha256,original_bytes:r.original_bytes,sha256:r.candidate_sha256,bytes:r.candidate_bytes});
 }
 // Prove the original inputs remained unchanged; only the new clone was edited.
 for(const r of plan.rows){await file(verified.repo,r.original_source,r.original_sha256);await file(verified.repo,r.candidate,r.candidate_sha256)}
 return {receipt:plan.receipt,receipt_sha256:plan.receipt_sha256,ids:plan.ids,files:changed,scope:'Reviewed team-mask derivatives only; original handoffs, beauty and world bytes remain unchanged.'};
}

export async function verifyNormalizedMasks({product,plan}){
 const verified=prepared.get(plan);assert(verified,'Use a prepared normalization plan');
 assert.equal(fingerprint(plan),verified.fingerprint,'Normalization plan changed');
 for(const r of plan.rows){await file(product,'art/'+r.destination,r.candidate_sha256);await file(product,'art/'+r.beauty,r.beauty_sha256)}
}
