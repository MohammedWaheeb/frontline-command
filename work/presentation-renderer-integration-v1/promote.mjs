// Coordinator-approved bounded integration; preserve old source and exact inputs.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';import path from 'node:path';
const root=process.cwd(),here=path.resolve('work/presentation-renderer-integration-v1'),out=path.join(here,'promotion-01'),sha=b=>createHash('sha256').update(b).digest('hex');
const input=JSON.parse(await readFile(path.join(here,'checks-01/inputs.json'))),validation=JSON.parse(await readFile(path.join(here,'checks-01/result.json')));assert.equal(validation.status,'passed');assert(validation.exactCandidateAndLiveInputs);assert.equal(input.changes.length,7);
const proofFiles=['work/ui-polish-native-v1/review.json','work/renderer-performance-browser-v1/native-review.json','work/renderer-performance-browser-v1/supplement-review.json','work/renderer-performance-browser-v1/PROMOTION.md','work/presentation-renderer-integration-v1/checks-01/result.json'];
const proofs={};for(const p of proofFiles)proofs[p]=sha(await readFile(p));
const rr=JSON.parse(await readFile(proofFiles[2]));assert.equal(rr.status,'BOUNDED_NATIVE_GATES_PASS_STRICT_RAW_RECEIPTS_REMAIN_FAILED');for(const row of rr.sources){const c=input.changes.find(c=>c.path==='client/src/render/'+row.name);assert(c);assert.equal(c.before,row.baselineSHA256);assert.equal(c.after,row.candidateSHA256)}
const ui=JSON.parse(await readFile(proofFiles[0]));assert.equal(ui.functional,'passed');assert.equal(ui.checks,56);assert.equal(ui.strictOverall,'failed');
async function guard(base,pins){for(const[p,h]of Object.entries(pins))assert.equal(sha(await readFile(path.join(base,p))),h,'Guard '+p)}
await guard(root,input.pins);await guard(input.source,input.after);for(const c of input.changes)assert.equal(sha(await readFile(c.source)),c.after,c.source);
await mkdir(out);const receipt={started:new Date().toISOString(),status:'preparing',scope:'Bounded7source integration only; original strict browser failures remain, Go/art unchanged, no MAXfog or final release acceptance.',proofs,changes:input.changes,copied:[]};
for(const c of input.changes){const dest=path.join(out,'before',c.path);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,await readFile(c.path),{flag:'wx'})}
try{
 await guard(root,input.pins);for(const[p,h]of Object.entries(proofs))assert.equal(sha(await readFile(p)),h,p);
 for(const c of input.changes){assert.equal(sha(await readFile(c.path)),c.before);const bytes=await readFile(c.source);assert.equal(sha(bytes),c.after);const temp=path.resolve(c.path+'.reviewed-integration');await writeFile(temp,bytes,{flag:'wx'});await rename(temp,path.resolve(c.path));receipt.copied.push(c.path)}
 await guard(root,input.after);receipt.status='integrated';receipt.all247InputsExact=true;
}catch(error){receipt.status='failed';receipt.failure=String(error.stack??error);for(const p of receipt.copied.reverse()){const c=input.changes.find(c=>c.path===p);assert.equal(sha(await readFile(p)),c.after,'Concurrent edit prevents rollback');await writeFile(p,await readFile(path.join(out,'before',p)))}receipt.rolledBack=true;process.exitCode=1}
finally{receipt.finished=new Date().toISOString();await writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,copied:receipt.copied,failure:receipt.failure}))}
