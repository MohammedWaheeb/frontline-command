import test from 'node:test';
import assert from 'node:assert/strict';
import {OnlineCommandAdvice,adviceLegality,adviceSupports} from '../../src/runtime/advice';
const connection={match_id:'match-one',player:1,token:'slot-secret',protocol:1,simulation:'test',content_hash:'test'};
const frame=(orders=0)=>({tick:123,player:1,player_commands:['ping'],entities:[{id:2,commands:['build'],abilities:[],builds:['power'],trains:[],research:[]}],results:Array.from({length:orders},(_,index)=>({player:1,sequence:0,index,accepted:true,code:'indeterminate',tick:123}))});

test('LAN advice uses only slot auth, preserves orders and exposes uncertainty',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(input,init)=>{assert.equal(String(input),'http://127.0.0.1:8080/api/v1/matches/match-one/advice');assert.deepEqual(init?.headers,{Authorization:'Bearer slot-secret','Content-Type':'application/json'});assert.equal(init?.redirect,'error');const body=JSON.parse(String(init?.body));assert.deepEqual(body.entities,[2]);assert.equal(body.orders[0].queued,true);assert.equal(body.orders[0].position.x,13000);assert.equal('$typeName' in body.orders[0],false);return Response.json(frame(1))};
  const advice=new OnlineCommandAdvice('http://127.0.0.1:8080',connection),orders=[{kind:'build',entities:[2],type:'power',position:{x:13000,y:13000},queued:true}],before=structuredClone(orders);
  const result=await advice.request([2],orders);assert.deepEqual(orders,before);assert.equal(adviceLegality(result.results[0]).certainty,'indeterminate');assert.equal(adviceLegality(result.results[0]).accepted,true);assert.equal(adviceSupports(result,{id:2,owner:1},{kind:'build'}),true);assert.equal(adviceSupports(result,{id:2,owner:2},{kind:'build'}),false);
 }finally{globalThis.fetch=original}
});
test('advice rejects wrong player, unexpected IDs, tick and result acceptance',async()=>{
 const original=globalThis.fetch;
 try{for(const mutate of [(data:any)=>data.player=2,(data:any)=>data.entities[0].id=999,(data:any)=>data.results[0].tick=122,(data:any)=>data.results[0].sequence=4,(data:any)=>data.results[0].accepted=false]){
  const data=frame(1);mutate(data);globalThis.fetch=async()=>Response.json(data);
  await assert.rejects(new OnlineCommandAdvice('http://localhost',connection).request([2],[{kind:'stop',entities:[2]}]),(e:any)=>e.code==='invalid_advice');
 }}finally{globalThis.fetch=original}
});
test('one advice request is pending and stale selection discards its response',async()=>{
 const original=globalThis.fetch;let finish!:(value:Response)=>void,current=true;
 try{
  globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
  const advice=new OnlineCommandAdvice('http://localhost',connection),pending=advice.request([2],[],{isCurrent:()=>current});
  await assert.rejects(advice.request([2]),(e:any)=>e.code==='advice_pending');current=false;finish(Response.json(frame()));await assert.rejects(pending,(e:any)=>e.code==='targeting_changed');
  advice.dispose();await assert.rejects(advice.request(),(e:any)=>e.code==='disposed');
 }finally{globalThis.fetch=original}
});
test('advice respects request bounds and propagates rate error without retries',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({code:'advice_rate_exceeded',message:'Wait for advice.'},{status:429})};const advice=new OnlineCommandAdvice('http://localhost',connection);
  await assert.rejects(advice.request(Array(65).fill(2)),(e:any)=>e.code==='command_limit');await assert.rejects(advice.request([2,2]),(e:any)=>e.code==='command_limit');assert.equal(calls,0);
  await assert.rejects(advice.request(),(e:any)=>e.code==='advice_rate_exceeded');assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});

test('production menu status remains independent, bounded and authorized',async()=>{
 const original=globalThis.fetch;
 try{
  const data:any=frame();data.entities[0].trains=['US.rig'];data.entities[0].production_status=[{kind:'build',type:'power',code:'indeterminate'},{kind:'train',type:'US.rig',code:'ok',waits_for:'insufficient_credits'}];
  globalThis.fetch=async()=>Response.json(data);
  const response=await new OnlineCommandAdvice('http://localhost',connection).request([2]);
  assert.deepEqual(response.entities[0].production_status,data.entities[0].production_status);
  for(const bad of [
   [{kind:'build',type:'secret-enemy-structure',code:'ok'}],
   [{kind:'build',type:'power',code:'ok',waits_for:'hidden_blocker'}],
   [{kind:'train',type:'US.rig',code:'queue_full',waits_for:'queued'}],
   [{kind:'build',type:'power',code:'indeterminate'},{kind:'build',type:'power',code:'indeterminate'}],
  ]){data.entities[0].production_status=bad;await assert.rejects(new OnlineCommandAdvice('http://localhost',connection).request([2]),(error:any)=>error.code==='invalid_advice')}
 }finally{globalThis.fetch=original}
});

test('ready offline environment prefetches selection-wide affordances then separates alternatives from final orders',async()=>{
 const {create}=await import('@bufbuild/protobuf'),{EntitySchema,PlayerSnapshotSchema}=await import('../../src/protocol/frontline_pb');
 const {createOfflineCommandEnvironment}=await import('../../src/runtime/advice'),{planContextCommand}=await import('../../src/runtime/command-intent');
 const snapshot=create(PlayerSnapshotSchema,{tick:100,player:1,players:[{id:1,team:1},{id:2,team:2}],entities:[1,2,3].map(value=>create(EntitySchema,{id:value,owner:value===3?2:1,type:'unit',health:1000,complete:true,position:{x:1000,y:1000},private:value===3?undefined:{hp:100n,maxHp:100n}}))});
 const calls:Array<{kind:string;count:number}>=[];
 const result=(orders:any[],candidate:boolean)=>Promise.resolve({tick:101,results:orders.map((order,index)=>({player:1,sequence:0,index,accepted:order.kind!=='capture',code:order.kind==='capture'?'invalid_capture_target':'indeterminate',tick:101}))});
 const runtime={affordances:async(ids:readonly number[])=>{calls.push({kind:'affordances',count:ids.length});return {tick:101,player:1,entities:ids.map(id=>({id,commands:['capture','attack'],abilities:[],builds:[],trains:[],research:[]})),player_commands:[]}},previewCandidates:(orders:any[])=>{calls.push({kind:'candidates',count:orders.length});return result(orders,true)},previewOrders:(orders:any[])=>{calls.push({kind:'sequential',count:orders.length});return result(orders,false)}};
 const before=structuredClone(snapshot),env=await createOfflineCommandEnvironment(runtime,snapshot,[1,2],{isCurrent:()=>true});
 const plan=await planContextCommand([1,2],{kind:'entity',id:3},env);
 assert.deepEqual(calls,[{kind:'affordances',count:2},{kind:'candidates',count:2},{kind:'candidates',count:2},{kind:'sequential',count:1}]);assert.equal(plan.orders[0].kind,'attack');assert.equal(plan.validation,'indeterminate');assert.deepEqual(snapshot,before);
});
test('ready environment guards session changes during affordance prefetch and batch validation',async()=>{
 const {create}=await import('@bufbuild/protobuf'),{EntitySchema,PlayerSnapshotSchema}=await import('../../src/protocol/frontline_pb'),{createOfflineCommandEnvironment}=await import('../../src/runtime/advice');
 const snapshot=create(PlayerSnapshotSchema,{tick:10,player:1,entities:[create(EntitySchema,{id:2,owner:1,health:1000,position:{x:1000,y:1000}})]});let current=true,finish!:(value:any)=>void;
 const runtime={affordances:()=>new Promise<any>(resolve=>finish=resolve),previewCandidates:async()=>({tick:10,results:[]}),previewOrders:async()=>({tick:10,results:[]})};
 const pending=createOfflineCommandEnvironment(runtime,snapshot,[2],{isCurrent:()=>current});current=false;finish({tick:10,player:1,entities:[{id:2,commands:['move'],abilities:[],builds:[],trains:[],research:[]}],player_commands:[]});await assert.rejects(pending,(error:any)=>error.code==='targeting_changed');
});
test('online environment shares a paced request budget and uses independent candidate mode before sequential final check',async()=>{
 const original=globalThis.fetch;
 const {create}=await import('@bufbuild/protobuf'),{EntitySchema,PlayerSnapshotSchema}=await import('../../src/protocol/frontline_pb'),{createOnlineCommandEnvironment}=await import('../../src/runtime/advice'),{planContextCommand}=await import('../../src/runtime/command-intent');
 const snapshot=create(PlayerSnapshotSchema,{tick:100,player:1,entities:[create(EntitySchema,{id:2,owner:1,health:1000,position:{x:1000,y:1000}})]});
 const calls:Array<{at:number;independent:boolean;entities:number[];orders:any[]}>=[];
 try{
  globalThis.fetch=async(_url,init)=>{const request=JSON.parse(String(init?.body));calls.push({at:performance.now(),...request});return Response.json({tick:101,player:1,player_commands:[],entities:request.entities.map((id:number)=>({id,commands:['move'],abilities:[],builds:[],trains:[],research:[]})),results:request.orders.map((_:unknown,index:number)=>({player:1,sequence:0,index,accepted:true,code:'ok',tick:101}))})};
  const source=new OnlineCommandAdvice('http://localhost',connection),env=await createOnlineCommandEnvironment(source,snapshot,[2],{isCurrent:()=>true}),plan=await planContextCommand([2],{kind:'ground',position:{x:3000,y:3000}},env);
  assert.equal(plan.orders[0].kind,'move');assert.deepEqual(calls.map(call=>call.independent),[false,true,false]);assert.deepEqual(calls.map(call=>call.orders.length),[0,1,1]);assert.ok(calls[1].at-calls[0].at>=240);assert.ok(calls[2].at-calls[1].at>=240);source.dispose();
 }finally{globalThis.fetch=original}
});

test('canceling a paced advice update prevents a second network request',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({tick:100,player:1,player_commands:[],entities:[],results:[]})};
  const advice=new OnlineCommandAdvice('http://localhost',connection);await advice.request();const pending=advice.request();advice.cancel();await assert.rejects(pending,(error:any)=>error.code==='targeting_changed');assert.equal(calls,1);advice.dispose();
 }finally{globalThis.fetch=original}
});

test('advice pacing starts after dispatch even when request setup is delayed',async t=>{
 const originalFetch=globalThis.fetch,OriginalURL=globalThis.URL;
 let now=1000,delayNextURL=false;
 const calls:number[]=[],delays:number[]=[];
 t.mock.method(performance,'now',()=>now);
 // Model a scheduling stall between the pacing check and fetch without a
 // busy-wait or dependency on the host machine's CPU load.
 globalThis.URL=class extends OriginalURL {
  constructor(input:string|URL,base?:string|URL){super(input,base);if(delayNextURL){now+=200;delayNextURL=false}}
 };
 t.mock.method(globalThis,'setTimeout',(callback:()=>void,delay=0)=>{
  delays.push(delay);queueMicrotask(()=>{now+=delay;callback()});return {} as ReturnType<typeof setTimeout>;
 });
 const source=new OnlineCommandAdvice('http://localhost',connection);
 try{
  globalThis.fetch=async()=>{calls.push(now);return Response.json({tick:100,player:1,player_commands:[],entities:[],results:[]})};
  delayNextURL=true;await source.request();await source.request();
  assert.deepEqual(calls,[1200,1460]);assert.deepEqual(delays,[260]);
 }finally{source.dispose();globalThis.fetch=originalFetch;globalThis.URL=OriginalURL}
});
