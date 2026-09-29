import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {limits} from './observer.mjs';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const budgets=Object.freeze({preflightMs:120000,courseMs:240000,closeMs:15000,maxFiles:16000,maxPackBytes:2*1024**3,maxControlBytes:256,maxPlacementPoints:24,maxEvents:32768});
const prefix='/__native_body_controls__/';
const body=Buffer.from('native original consumer control\n');
export const controls=Object.freeze(['valid','truncated','network','wrong-hash'].map(kind=>Object.freeze({kind,path:prefix+kind,bytes:body.length,sha256:hash(kind==='wrong-hash'?Buffer.from('expected body differs from wire!\n'):body)})));
export const controlBody=body;
export const isControl=url=>{try{return controls.some(c=>new URL(url).pathname===c.path)}catch{return false}};
export function verifyConfig(c){
 assert.equal(c.format,1);for(const key of ['product','artifact','protocolFile','executable'])assert.equal(typeof c[key],'string',key);
 for(const key of ['artifactSHA256','packSHA256','protocolSHA256','executableSHA256'])assert.match(c[key],/^[a-f0-9]{64}$/,key);
 assert.equal(c.map,'copper-junction');assert.equal(c.quality,'standard');
 assert.equal(typeof c.artScope,'string');assert(c.artScope.length>10,'Explicit current art limitations are required');return c;
}
export function verifyAdmission({config,artifact,packBytes}){
 verifyConfig(config);assert.equal(hash(packBytes),config.packSHA256,'Selected pack digest');
 assert.equal(artifact.product_pack?.packSHA256,config.packSHA256,'Root ordinary-build artifact must name this exact pack');
 assert(artifact.source_inputs?.sha256&&artifact.presentation_inputs,'Ordinary make-build source identities required');
 const pack=JSON.parse(packBytes);assert(Array.isArray(pack.files)&&pack.files.length>0&&pack.files.length<=budgets.maxFiles);
 let bytes=0;const names=new Set();for(const file of pack.files){
  assert(typeof file.path==='string'&&file.path.startsWith('/')&&!file.path.startsWith('//')&&!/[\\%?#]/.test(file.path)&&!file.path.split('/').some((p,i)=>i&&(!p||p==='.'||p==='..')),'Safe exact pack URL');
  assert(!names.has(file.path),'Duplicate pack path');names.add(file.path);assert(Number.isSafeInteger(file.bytes)&&file.bytes>=0);assert.match(file.sha256,/^[a-f0-9]{64}$/);bytes+=file.bytes;
  if(file.path.startsWith('/art/'))assert(file.bytes<=limits.maxBody,'Art body exceeds observed per-body ceiling');
 }
 assert(bytes<=budgets.maxPackBytes);assert.equal(artifact.product_pack.files,pack.files.length);assert.equal(artifact.product_pack.bytes,bytes);
 for(const p of ['/runtime/frontline.wasm','/runtime/worker.js','/runtime/version.json','/art/index.json','/content/index.json'])assert(names.has(p),'Missing '+p);
 assert(![...names].some(p=>p.startsWith(prefix)),'Control route collides with product');
 return {pack,bytes,files:pack.files.length,limits,budgets};
}
export function withoutControlBodies(snapshot){return {...snapshot,network:snapshot.network.filter(r=>!isControl(r.url)),failures:snapshot.failures.filter(r=>!isControl(r.url)),traces:snapshot.traces.map(t=>({...t,records:t.records.filter(r=>!isControl(r.url))}))};}
export function verifyControlProofs(audit,results){
 assert.equal(results.length,controls.length);const facts=[];
 for(const c of controls){
  const result=results.find(r=>r.kind===c.kind);assert(result,c.kind);const proofs=audit.reconciliation.proofs.filter(p=>p.native.url===result.url);assert.equal(proofs.length,1,'One original control request '+c.kind);const proof=proofs[0];
  if(c.kind==='valid')assert(proof.complete,'Valid control must have unique native EOF and exact body');
  else {assert.equal(proof.complete,false,'Fault control was incorrectly proved '+c.kind);if(c.kind==='wrong-hash'){assert.equal(result.eof,true);assert.equal(proof.reason,'native-body-hash-mismatch')}else assert(result.error&&!result.eof,'Transfer fault must not acquire EOF');}
  facts.push({kind:c.kind,url:result.url,complete:proof.complete,reason:proof.reason,requestId:proof.request?.id});
 }return facts;
}
export function paidPowerProof(observation,opening){
 const player=opening.player,initial=new Set(opening.entities.filter(e=>e.owner===player&&e.type==='power').map(e=>e.id));
 const submissions=observation.requests.filter(r=>r.method==='submit').flatMap(r=>r.batch.orders.map((o,index)=>({request:r,order:o,index}))).filter(x=>x.order.kind==='build'&&x.order.type==='power');
 assert.equal(submissions.length,1,'Exactly one UI-submitted power build');const sent=submissions[0];
 const receipt=observation.results.find(r=>r.player===player&&r.sequence===sent.request.batch.sequence&&(r.index??0)===sent.index);assert(receipt?.accepted,'Authoritative accepted power receipt');
 const complete=observation.latest.entities.filter(e=>e.owner===player&&e.type==='power'&&e.complete&&!initial.has(e.id));assert.equal(complete.length,1,'One new completed owner power');
 const saved=observation.saves.at(-1);assert(saved?.hash&&saved.tick>=receipt.tick,'Normal UI save after order');
 const paid=saved.ownedPower.find(e=>e.id===complete[0].id);assert(paid?.complete&&paid.paid>0,'Actual saved owner power paid amount');assert.equal(paid.paid,observation.powerRule.cost,'Saved paid amount equals actual Go catalog cost');
 assert.deepEqual(paid.position,sent.order.position,'Saved power at the submitted point');
 return {sequence:sent.request.batch.sequence,receipt,power:complete[0],paid:paid.paid,catalogCost:observation.powerRule.cost,save:{tick:saved.tick,hash:saved.hash},point:sent.order.position};
}
