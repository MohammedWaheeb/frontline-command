import test from 'node:test';
import assert from 'node:assert/strict';
import {bootWorkers,bindSoloWorker,verifyMenuWorkers,verifyPaidSession,independentStages} from './lifecycle.mjs';
function fixture(){
 const boot={overflow:false,errors:[],workers:[{id:1,live:true,createdAt:100,frames:0,pending:0,methods:['init','content']}],rpc:[{worker:1,id:1,method:'init',ok:true},{worker:1,id:2,method:'content',ok:true}]};
 const baseline=bootWorkers(boot),active=structuredClone(boot);
 active.workers.push({id:2,live:true,createdAt:4000,frames:30,pending:0,methods:['init','create','resume']});active.latest={worker:2,player:1};
 active.rpc.push({worker:2,id:2,method:'create',ok:true,settledAt:4200,info:{local_players:[1],replay:false,tick:0}});
 return {boot,baseline,active};
}
test('boot validator and created match have separate method-proven ownership',()=>{
 const {baseline,active}=fixture(),session=bindSoloWorker(active,baseline);assert.equal(session.worker,2);
 active.workers[1].live=false;active.workers[1].terminatedAt=30000;active.workers[1].pendingAtTerminate=0;
 assert.equal(verifyMenuWorkers(active,baseline,session).status,'passed');assert.equal(active.workers[0].live,true);
});
test('failed create, validator session reuse, foreign frame and unexplained worker reject',()=>{
 for(const change of [v=>v.active.rpc.at(-1).ok=false,v=>v.active.rpc.at(-1).worker=1,v=>v.active.latest.worker=1,v=>v.active.latest.player=2,v=>v.active.workers.push({...v.active.workers[1],id:3})]){const v=fixture();change(v);assert.throws(()=>bindSoloWorker(v.active,v.baseline))}
});
test('live match, pending work, replaced validator and extra live worker never pass menu release',()=>{
 for(const change of [v=>v.active.workers[1].live=true,v=>v.active.workers[1].pendingAtTerminate=1,v=>v.active.workers[0].pending=1,v=>v.active.workers[0].live=false,v=>v.active.workers[0].frames=1,v=>v.active.workers.push({...v.active.workers[0],id:3})]){
  const v=fixture(),session=bindSoloWorker(v.active,v.baseline);Object.assign(v.active.workers[1],{live:false,terminatedAt:30000,pendingAtTerminate:0});change(v);assert.throws(()=>verifyMenuWorkers(v.active,v.baseline,session));
 }
});
test('cross-worker save/clock/result, changed preview point and wrong envelope hash reject',()=>{
 function paid(){const v=fixture(),session=bindSoloWorker(v.active,v.baseline),point={x:24000,y:66500};Object.assign(v.active,{clock:{worker:2,paused:true},requests:[{worker:2,id:8,method:'submit',ok:true,batch:{sequence:1,orders:[{position:point}]}}],saves:[{worker:2,requestId:9,hash:'abc',envelopeSHA256:'abc'}],results:[{worker:2,sequence:1,accepted:true}]});v.active.rpc.push({worker:2,id:9,method:'save',ok:true});return {...v,session,point}}
 const good=paid();assert.equal(verifyPaidSession(good.active,good.session,good.point).worker,2);
 for(const change of [v=>v.active.saves[0].worker=1,v=>v.active.clock.worker=1,v=>v.active.results[0].worker=1,v=>v.point={x:1,y:2},v=>v.active.saves[0].envelopeSHA256='wrong',v=>v.active.rpc.at(-1).ok=false,v=>v.active.requests.push(v.active.requests[0])]){const v=paid();change(v);assert.throws(()=>verifyPaidSession(v.active,v.session,v.point))}
});
test('independent control/resource stages run after an earlier failed lifecycle assertion',async()=>{
 const calls=[],records=[];const rows=await independentStages([['worker',async()=>{calls.push('worker');throw Error('real lifetime failure')}],['resources',async()=>{calls.push('resources');return {bytes:0}}],['controls',async()=>{calls.push('controls');return {incompleteBodyRejected:true}}],['final',async()=>{calls.push('final');return 1}]],r=>records.push(r));
 assert.deepEqual(calls,['worker','resources','controls','final']);assert.equal(rows[0].status,'failed');assert.match(rows[0].error,/real lifetime failure/);assert.equal(rows.slice(1).every(r=>r.status==='passed'),true);assert.deepEqual(records,rows);
});
