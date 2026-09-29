import assert from 'node:assert/strict';

export function bootWorkers(observation){
 assert.equal(observation.overflow,false);assert.deepEqual(observation.errors,[]);
 assert.equal(observation.workers.length,1,'Exactly one boot Go validator in this fresh ordinary App');
 const worker=observation.workers[0];assert(worker.live&&worker.frames===0&&worker.pending===0,'Boot validator must be ready and have no simulation frames');
 for(const method of ['init','content'])assert(observation.rpc.some(r=>r.worker===worker.id&&r.method===method&&r.ok===true),'Successful boot validator '+method);
 assert(!observation.rpc.some(r=>r.worker===worker.id&&['create','load','loadReplay','submit'].includes(r.method)),'Boot validator acquired simulation work');
 return {ids:[worker.id],workers:structuredClone(observation.workers)};
}
export function bindSoloWorker(observation,baseline){
 assert.equal(observation.overflow,false);assert.deepEqual(observation.errors,[]);
 const creates=observation.rpc.filter(r=>r.method==='create');assert.equal(creates.length,1,'One original create request');
 const create=creates[0];assert(create.ok===true&&Number.isFinite(create.settledAt),'Create must settle successfully');
 assert(!baseline.ids.includes(create.worker),'Match must not reuse App validator');
 const worker=observation.workers.find(w=>w.id===create.worker);assert(worker?.live&&worker.frames>0,'Created match must deliver actual frames');
 assert.equal(observation.workers.filter(w=>!baseline.ids.includes(w.id)).length,1,'No unexplained new Go worker');
 assert.equal(observation.latest.worker,worker.id,'Current frame belongs to created match');
 assert.deepEqual(create.info.local_players,[observation.latest.player],'Created session local perspective');assert.equal(create.info.replay,false);
 return {worker:worker.id,createRequest:create.id,createdAt:worker.createdAt,createSettledAt:create.settledAt,localPlayers:[...create.info.local_players],info:structuredClone(create.info)};
}
export function verifyMenuWorkers(observation,baseline,session){
 assert.equal(observation.overflow,false);assert.deepEqual(observation.errors,[]);
 const expected=new Set([...baseline.ids,session.worker]);assert.equal(observation.workers.length,expected.size,'Unexpected worker inventory');
 for(const w of observation.workers){assert(expected.has(w.id),'Unaccounted Go worker');assert.equal(w.pending,0,'Worker pending work at menu');
  if(w.id===session.worker){assert.equal(w.live,false,'Match worker survived menu');assert(w.terminatedAt>=session.createSettledAt,'Termination must follow successful creation');assert.equal(w.pendingAtTerminate,0,'Successful course terminated pending match work');}
  else {assert(w.live,'App validator unexpectedly replaced/disposed');assert.equal(w.createdAt,baseline.workers.find(b=>b.id===w.id).createdAt);assert.equal(w.frames,0,'Validator delivered simulation frames');assert(!w.methods.some(m=>['create','load','loadReplay','submit'].includes(m)),'Validator acquired simulation');}
 }
 return {status:'passed',matchWorker:session.worker,retainedAppWorkers:[...baseline.ids],workers:structuredClone(observation.workers)};
}
export function verifyPaidSession(observation,session,point){
 assert.equal(observation.latest.worker,session.worker,'Paid current frame worker');
 assert.equal(observation.clock.worker,session.worker,'Pause clock worker');assert.equal(observation.clock.paused,true);
 const submissions=observation.requests.filter(r=>r.method==='submit');assert.equal(submissions.length,1,'Only one ordinary submitted batch');
 const submit=submissions[0];assert.equal(submit.worker,session.worker);assert.equal(submit.ok,true,'Original submit RPC settled');assert.equal(submit.batch.orders.length,1);
 assert.deepEqual(submit.batch.orders[0].position,point,'Clicked build point equals the reviewed actual preview point');
 const saved=observation.saves.at(-1);assert.equal(saved.worker,session.worker,'Normal save belongs to match');assert.equal(saved.hash,saved.envelopeSHA256,'Save response/envelope identity');
 assert(observation.rpc.some(r=>r.worker===session.worker&&r.id===saved.requestId&&r.method==='save'&&r.ok===true),'Successful original save response identity');
 assert(observation.results.some(r=>r.worker===session.worker&&r.sequence===submit.batch.sequence&&r.accepted),'Accepted result belongs to match');
 return {worker:session.worker,submitRequest:submit.id,saveRequest:saved.requestId,point};
}
// Stages run sequentially but an assertion in one never skips the others.
// Native resource/counterfactual observations must survive a failed UI gate.
export async function independentStages(stages,record){
 const results=[];
 for(const [name,run] of stages){const row={name,started:new Date().toISOString()};try{row.value=await run();row.status='passed'}catch(error){row.status='failed';row.error=String(error.stack??error)}row.ended=new Date().toISOString();results.push(row);await record(row)}
 return results;
}
