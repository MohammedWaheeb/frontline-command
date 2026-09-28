import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOperationPlans} from '../../src/runtime/operation-preview';
import {OnlineCommandAdvice} from '../../src/runtime/advice';
import {SkybreakerReview} from '../../src/app/strike-review';
import type {CommandRequest} from '../../src/runtime/command-intent';
import type {OrderIntent,OrderPreview} from '../../src/runtime/types';
const points=[{x:22000,y:20000},{x:23000,y:20000},{x:22000,y:21000}],order:OrderIntent={kind:'ability',type:'strategic',entities:[2],index:0,points};
const plan=()=>({order_index:0,kind:'skybreaker',edge:0,routes:points.map((impact,i)=>({entry:{x:601,y:18400+i*1600},drop:{x:22000,y:18400+i*1600},impact:{...impact},entry_at:101,release_at:341,impact_at:342,splash:2000}))});
const preview=():OrderPreview=>({tick:100,results:[{player:1,index:0,sequence:0,tick:100,accepted:true,code:'indeterminate'}],plans:parseOperationPlans([plan()],[order],100)});
const request:CommandRequest={kind:'ability',type:'strategic',entities:[2],index:0,points,target:{kind:'ground',position:points[0]}};

test('owner operation preview preserves all three exact Go routes and deadlines without retaining response aliases',()=>{
 const raw=[plan()],parsed=parseOperationPlans(raw,[order],100)!;assert.deepEqual(parsed,raw);raw[0].routes[0].entry.x=999;assert.equal(parsed[0].routes[0].entry.x,601);
 assert.equal(parseOperationPlans(undefined,[order],100),undefined);assert.deepEqual(parseOperationPlans([],[],100,true),[]);
});
test('operation preview rejects mismatched intent, duplicate plans, invalid coordinates/times and independent disclosure',()=>{
 for(const mutate of [
  (p:any)=>p.order_index=1,(p:any)=>p.kind='hidden-operation',(p:any)=>p.edge=1,(p:any)=>p.routes.pop(),
  (p:any)=>p.routes[0].impact.x++,(p:any)=>p.routes[0].entry.x=-1,(p:any)=>p.routes[0].drop.y=NaN,
  (p:any)=>p.routes[0].entry_at=100,(p:any)=>p.routes[0].release_at=99,(p:any)=>p.routes[0].splash=-1,
 ]){const bad=plan();mutate(bad);assert.throws(()=>parseOperationPlans([bad],[order],100),(e:any)=>e.code==='invalid_advice')}
 assert.throws(()=>parseOperationPlans([plan(),plan()],[order,order],100),(e:any)=>e.code==='invalid_advice');
 assert.throws(()=>parseOperationPlans([plan()],[order],100,true),(e:any)=>e.code==='invalid_advice');
 assert.throws(()=>parseOperationPlans([plan()],[{...order,type:'recon_sweep'}],100),(e:any)=>e.code==='invalid_advice');
});
test('LAN preview exposes plans only through validated sequential advice and never turns estimates into certainty',async()=>{
 const original=globalThis.fetch;const connection={match_id:'sky',player:1,token:'slot',protocol:1,simulation:'test',content_hash:'test'};
 try{
  globalThis.fetch=async()=>Response.json({player:1,entities:[],player_commands:[],...preview()});
  const advice=new OnlineCommandAdvice('http://localhost',connection);const result=await advice.preview([order]);assert.equal(result.plans?.[0].routes.length,3);assert.equal(result.results[0].code,'indeterminate');advice.dispose();
  await assert.rejects(new OnlineCommandAdvice('http://localhost',connection).candidates([order]),(e:any)=>e.code==='invalid_advice');
 }finally{globalThis.fetch=original}
});
test('strike review waits for advice, binds immutable targets, cancels stale responses and confirms only once',()=>{
 const review=new SkybreakerReview();let current=true;const original=structuredClone(request),id=review.begin(original,()=>current);original.points![0].x=1;
 assert.equal(review.consume(),undefined);assert.equal(review.state?.phase,'loading');
 review.complete(id,preview());assert.equal(review.state?.phase,'ready');assert.deepEqual(review.consume(),request);assert.equal(review.consume(),undefined);
 const stale=review.begin(request,()=>current);current=false;assert.equal(review.complete(stale,preview()),undefined);assert.equal(review.state,undefined);
 current=true;const old=review.begin(request,()=>true),latest=review.begin({...request,index:1},()=>true);assert.equal(review.complete(old,preview()),undefined);assert.equal((review.state as {edge:number}|undefined)?.edge,1);review.clear();assert.equal(review.complete(latest,preview()),undefined);
});
test('older runtimes and rejected previews cannot confirm a strike',()=>{
 const review=new SkybreakerReview();let id=review.begin(request,()=>true);review.complete(id,{...preview(),plans:undefined});assert.equal(review.state?.phase,'unavailable');assert.equal(review.consume(),undefined);
 id=review.begin(request,()=>true);review.complete(id,{...preview(),results:[{...preview().results[0],accepted:false,code:'not_visible'}]});assert.equal(review.state?.message,'not_visible');assert.equal(review.consume(),undefined);
});
