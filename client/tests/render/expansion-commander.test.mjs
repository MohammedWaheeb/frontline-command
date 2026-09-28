import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ExpansionCommander,strategicReserve} from './expansion-commander.mjs';
const catalog=JSON.parse(readFileSync(new URL('../../../pkg/content/rules.json',import.meta.url)));
const map=JSON.parse(readFileSync(new URL('../../../content/maps/dry-river.json',import.meta.url)));
function harness(){
 const base=map.spawns[0].position,entities=['hq','power','supply','barracks','US.rig'].map((type,i)=>({id:i+1,type,owner:1,complete:true,enabled:true,health:1000,position:{...base},private:{orders:[],jobs:[],cargo:'0'}}));
 const view={tick:1000,player:1,countdown:0,players:[{id:1,team:1,faction:'US'},{id:2,team:2,faction:'SA'}],economy:{credits:1700000,supply:0,reservedSupply:0,powerCapacity:140,powerDemand:30,tier:1,upgrades:[]},entities,fields:map.fields.map(f=>({...f,remaining:f.credits})),stations:[],visible:Array(map.width*map.height).fill(true),outcome:{finished:false}};
 const sent=[],previews=[];const c=new ExpansionCommander({player:1,map,catalog,view:()=>view,send:async(orders,note)=>{sent.push({orders,note});return orders.map(()=>({accepted:true,code:'ok'}))},advice:async(_ids,orders)=>{previews.push(orders);return {results:orders.map(()=>({accepted:true,code:'indeterminate'}))}}});return {c,view,sent,previews,base};
}
test('factory reserve is exact catalog cost and prevents optional spending below its price',async()=>{
 const h=harness(),intent=h.c.construction(h.view,h.c.context(h.view));assert.equal(intent.type,'factory');assert.equal(strategicReserve(catalog,intent),1800000);
 await h.c.economy(h.view,h.c.context(h.view));assert.deepEqual(h.sent,[]);
 h.view.economy.credits=1800000;await h.c.economy(h.view,h.c.context(h.view));assert.equal(h.sent[0].orders[0].kind,'build');assert.equal(h.sent[0].orders[0].type,'factory');
});
test('qualifying target is attacked promptly at both early and late ticks with identical public observations',async()=>{
 for(const tick of [150,30000]){const h=harness();h.view.tick=tick;h.view.entities.push({id:8,type:'US.rifle',owner:1,health:1000,position:{x:45000,y:64000},private:{orders:[],jobs:[]}},{id:9,type:'barracks',owner:2,health:300,complete:true,position:{x:47000,y:64000}});await h.c.combat(h.view,h.c.context(h.view));assert(h.sent.some(x=>x.orders.some(o=>o.kind==='attack'&&o.target===9)));assert(h.sent.every(x=>x.orders.every(o=>!o.entities.includes(9))))}
});
test('a damaged unit withdraws only when real owned support exists; no hidden target lookup',async()=>{
 const h=harness();h.view.entities.push({id:8,type:'US.tank',owner:1,health:300,position:{x:50000,y:60000},private:{orders:[],jobs:[]}},{id:9,type:'US.repair',owner:1,health:1000,position:h.base,private:{orders:[],jobs:[]}});
 await h.c.combat(h.view,h.c.context(h.view));assert(h.sent.some(x=>x.orders.some(o=>o.kind==='move'&&o.entities[0]===8)));assert(h.sent.some(x=>x.orders.some(o=>o.kind==='repair'&&o.target===8)));
});
test('unseen expansion never authorizes a forward build and Go rejection rotates candidate',async()=>{
 const h=harness();h.view.entities.push(...['factory','radar'].map((type,i)=>({id:10+i,type,owner:1,complete:true,health:1000,position:h.base,private:{orders:[],jobs:[]}})));h.view.economy.credits=4000000;h.view.visible.fill(false);assert.equal(h.c.construction(h.view,h.c.context(h.view)),undefined);
 h.view.visible.fill(true);const rig=h.view.entities[4],intent={type:'power',center:h.base};h.c.send=async orders=>{h.sent.push({orders});return [{accepted:false,code:'occupied'}]};await h.c.construct(intent,rig,h.view);h.view.tick+=60;await h.c.construct(intent,rig,h.view);assert.notDeepEqual(h.sent[0].orders[0].position,h.sent[1].orders[0].position);
});
test('placement cooldown expiry cannot starve a never-tried candidate and restart a capture channel',async()=>{
 const h=harness(),intent={type:'power',center:h.base};h.c.send=async orders=>{h.sent.push({orders});return [{accepted:false,code:'occupied'}]};await h.c.construct(intent,h.view.entities[4],h.view);h.view.tick+=1000;await h.c.construct(intent,h.view.entities[4],h.view);assert.notDeepEqual(h.sent[0].orders[0].position,h.sent[1].orders[0].position);
 const capturing={id:15,owner:1,health:1000,channel:'capture',private:{orders:[]}};h.view.entities.push(capturing);const before=h.sent.length;await h.c.command(capturing,{kind:'capture',target:7},'test');assert.equal(h.sent.length,before);
});
test('forward scouting maintains actual expansion sight until the owned outpost is complete',async()=>{
 const h=harness();h.view.entities.push({id:12,type:'US.recon',owner:1,health:1000,position:h.base,private:{orders:[],jobs:[]}});await h.c.scouting(h.view,h.c.context(h.view));assert.equal(h.sent[0].orders[0].kind,'guard');assert.deepEqual(h.sent[0].orders[0].position,h.c.context(h.view).expansion.position);
});
test('public blocked feedback changes crossing approach without affecting nearby exposed-target finishing',()=>{
 const h=harness(),unit={id:20,position:h.base,state:'moving'};
 const a=h.c.crossingWaypoint(unit,map.spawns[1].position,1000),b=h.c.crossingWaypoint({...unit,state:'blocked'},map.spawns[1].position,1200);assert.notEqual(a.y,b.y);assert.equal(h.c.crossingWaypoint(unit,{x:h.base.x+5000,y:h.base.y},1200),undefined);
});
test('arrival short of the exact far crossing center completes the waypoint instead of holding the army forever',()=>{
 const h=harness(),unit={id:12,position:h.base,state:'moving'};h.c.crossingWaypoint(unit,map.spawns[1].position,1000);assert.equal(h.c.crossingWaypoint({...unit,position:{x:80499,y:27637},state:'idle'},map.spawns[1].position,1200),undefined);
});
test('cleared enemy base redirects scouting toward disclosed memory without targeting an unseen ID',()=>{
 const h=harness(),c=h.c.context(h.view),army=[{position:c.enemyBase}],remembered={id:99,type:'factory',owner:2,position:{x:90000,y:30000}};h.view.memory=[remembered];const p=h.c.searchDestination(h.view,c,army);assert.deepEqual(p,remembered.position);assert.equal(p.target,undefined);
});
test('a source lost during a prior awaited command is not submitted from the earlier loop snapshot',async()=>{
 const h=harness(),stale={id:77,type:'US.rifle',owner:1,health:1000,private:{orders:[]}};await h.c.command(stale,{kind:'attack_move',position:map.spawns[1].position},'test');assert.equal(h.sent.length,0);
 const skipped=[];h.c.record=entry=>skipped.push(entry);await h.c.issue([{kind:'research',entities:[77],type:'weapons_training'}],'test');assert.equal(h.sent.length,0);assert.equal(skipped[0].kind,'stale-intention');
});
const failedCourse=new URL('../../../work/multiplayer-combat/expansion-rematch-2026-09-28T22-23-52.445Z/',import.meta.url);
const capturedViews=JSON.parse(readFileSync(new URL('policy-abort-views.json',failedCourse)));
const capturedCommanders=JSON.parse(readFileSync(new URL('policy-abort-commanders.json',failedCourse)));
function capturedHarness(player){
 const view=structuredClone(capturedViews[player-1]),sent=[];
 const c=new ExpansionCommander({player,map,catalog,view:()=>view,send:async(orders,note)=>{sent.push({orders,note});return orders.map(()=>({accepted:true,code:'ok'}))},advice:async(_ids,orders)=>({results:orders.map(()=>({accepted:true,code:'ok'}))})});
 c.searches=new Map(capturedCommanders[player-1].searches);return {c,view,sent};
}
test('actual failed-course owner view cancels only the blocked ordinary queue head before requesting an emergency rig',async()=>{
 const h=capturedHarness(1),factory=h.view.entities.find(e=>e.owner===1&&e.type==='factory');assert.equal(factory.state,'prerequisite_lost');assert.equal(factory.private.jobs[0].work,538);
 await h.c.economy(h.view,h.c.context(h.view));assert.deepEqual(h.sent[0].orders,[{kind:'cancel',entities:[factory.id],index:0}]);
 // This callback fixture checks policy sequencing only; Go owns real refunds,
 // prerequisites and emergency production in the separately measured preflight.
 factory.private.jobs=[];await h.c.economy(h.view,h.c.context(h.view));assert.deepEqual(h.sent[1].orders,[{kind:'train',entities:[factory.id],type:'US.rig'}]);
});
test('emergency recovery does not cancel a productive job, disabled producer or existing emergency rig',async()=>{
 for(const variant of ['productive','disabled','emergency']){const h=capturedHarness(1),factory=h.view.entities.find(e=>e.owner===1&&e.type==='factory');if(variant==='productive')factory.state='producing';if(variant==='disabled')factory.enabled=false;if(variant==='emergency')factory.private.jobs[0].emergency=true;await h.c.economy(h.view,h.c.context(h.view));assert.deepEqual(h.sent,[],variant)}
});
test('actual exhausted endgame search visits finite public fog frontiers instead of repeating the six known locations',()=>{
 const h=capturedHarness(2),c=h.c.context(h.view),army=c.own.filter(e=>catalog.units.find(u=>u.id===e.type)?.weapon),knownPoints=new Set(h.c.searches.keys()),targets=new Set();
 assert.equal(c.seen.length,0);assert.equal(h.view.indicators.length,0);assert(h.view.memory.every(e=>e.owner===0));
 let frontierCount=0;for(let y=4;y<map.height;y+=8)for(let x=4;x<map.width;x+=8)if(!['blocked','cliff'].includes(map.tiles[y*map.width+x].terrain)&&!h.view.visible[y*map.width+x])frontierCount++;
 assert(frontierCount>0&&frontierCount<=256);
 for(let i=0;i<frontierCount;i++){
  const p=h.c.searchDestination(h.view,c,army),key=`${p.x}:${p.y}`,index=Math.floor(p.y/1000)*map.width+Math.floor(p.x/1000);
  assert(!knownPoints.has(key));assert(!targets.has(key));assert(!h.view.visible[index]);assert(!['blocked','cliff'].includes(map.tiles[index].terrain));assert.equal(p.target,undefined);
  assert.deepEqual(h.c.searchDestination(h.view,c,army),p,'An unseen destination must not churn before its current-view inspection');
  targets.add(key);h.view.visible[index]=true;h.view.explored[index]=true;h.view.tick++;
 }
 assert.equal(targets.size,frontierCount);assert([...targets].some(key=>{const[x,y]=key.split(':').map(Number);return Math.hypot(x-8500,y-64500)<9000}),'Search eventually inspects west of the old HQ without reading the hidden factory');
});
