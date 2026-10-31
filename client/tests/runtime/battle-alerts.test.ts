import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,EventSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {selectBattleAlerts,selectBattleStatusAlerts} from '../../src/app/battle-alerts';
import type {CommandAffordances} from '../../src/runtime/types';
const catalog=new CatalogIndex({version:'test',units:[{id:'US.hauler',name:'Hauler',role:'hauler',cost:900000},{id:'US.rifle',name:'Rifle squad',role:'rifle',cost:300000}],buildings:[{id:'barracks',name:'Barracks',role:'barracks'}],upgrades:[],weapons:[]} as unknown as Catalog);
function snapshot(tick=0){return create(PlayerSnapshotSchema,{player:1,tick,economy:{credits:300000n,powerCapacity:40,powerDemand:20},entities:[{id:1,type:'barracks',owner:1,complete:true,enabled:true,position:{x:1000,y:2000},private:{hp:1500000n}},{id:2,type:'US.hauler',owner:1,state:'no_known_supplies',position:{x:3000,y:4000},private:{hp:900000n}},{id:3,type:'US.rifle',owner:1,complete:true,position:{x:5000,y:6000},private:{hp:300000n}}]})}
function advice(tick:number):CommandAffordances{return {tick,player:1,player_commands:[],entities:[{id:1,commands:['train'],abilities:[],builds:[],trains:['US.rifle'],research:[],production_status:[{kind:'train',type:'US.rifle',code:'ok'}]}]}}
test('idle hauler and low power alerts use owner state, location and tick throttles',()=>{
 const s=snapshot();s.economy!.powerDemand=60;s.entities.push({...s.entities[1],id:9,owner:2});
 const first=selectBattleStatusAlerts(s,catalog),before=structuredClone(first.state);
 assert.deepEqual(first.alerts.map(value=>value.kind),['idle_hauler','low_power']);
 assert.deepEqual(first.alerts[0].position,{x:3000,y:4000});
 const same=selectBattleStatusAlerts(s,catalog,first.state);assert.deepEqual(same.alerts,[]);assert.deepEqual(first.state,before);
 const next=selectBattleStatusAlerts({...s,tick:599},catalog,same.state);assert.equal(next.alerts.length,0);
 assert.equal(selectBattleStatusAlerts({...s,tick:600},catalog,next.state).alerts.length,2);
 assert.equal(selectBattleStatusAlerts({...s,tick:201},catalog,first.state).latestActionable,undefined);
});
test('production requires fifteen continuously affordable seconds, current queue and fresh Go advice',()=>{
 let state=selectBattleStatusAlerts(snapshot(),catalog,undefined,advice(0)).state;
 for(let tick=60;tick<=300;tick+=60){const result=selectBattleStatusAlerts(snapshot(tick),catalog,state,advice(tick));state=result.state;assert.equal(result.alerts.filter(value=>value.kind==='idle_production').length,tick===300?1:0)}
 assert.deepEqual(selectBattleStatusAlerts(snapshot(300),catalog,state,advice(300)).alerts,[]);
 const stale=selectBattleStatusAlerts(snapshot(400),catalog,state,advice(300));assert.equal(stale.state.idleSince['idle_production:1'],undefined);
 const restarted=selectBattleStatusAlerts(snapshot(401),catalog,stale.state,advice(401));assert.equal(restarted.state.idleSince['idle_production:1'],401);
 const queue=snapshot(402);queue.entities[0].private!.jobs.push({} as never);assert.equal(selectBattleStatusAlerts(queue,catalog,restarted.state,advice(402)).state.idleSince['idle_production:1'],undefined);
 const poor=snapshot(402);poor.economy!.credits=299999n;assert.equal(selectBattleStatusAlerts(poor,catalog,restarted.state,advice(402)).state.idleSince['idle_production:1'],undefined);
 for(const changed of [{...advice(402),player:2},advice(403),{...advice(402),entities:[{...advice(402).entities[0],production_status:[{kind:'train' as const,type:'US.rifle',code:'ok',waits_for:'supply_blocked'}]}]}])assert.equal(selectBattleStatusAlerts(snapshot(402),catalog,restarted.state,changed).state.idleSince['idle_production:1'],undefined);
});
test('base attacks classify buildings; unit losses require disclosed authoritative own destruction',()=>{
 const initial=selectBattleStatusAlerts(snapshot(),catalog);
 const s=snapshot(100);s.entities=s.entities.filter(value=>value.id!==3);s.events=create(PlayerSnapshotSchema,{events:[{id:1,tick:100,kind:'under_attack',owner:1,entity:2,position:{x:3000,y:4000}},{id:2,tick:100,kind:'under_attack',owner:1,entity:1,position:{x:1000,y:2000}},{id:3,tick:100,kind:'destroyed',owner:1,entity:3,position:{x:5000,y:6000}},{id:4,tick:100,kind:'destroyed',owner:2,entity:99}]}).events;
 const result=selectBattleStatusAlerts(s,catalog,initial.state);
 assert.deepEqual(result.alerts.map(value=>value.kind),['base_under_attack','unit_lost']);assert.equal(result.latestActionable?.entity,3);
 assert.deepEqual(selectBattleStatusAlerts(s,catalog,result.state).alerts,[]);
 const missing=selectBattleStatusAlerts({...snapshot(101),entities:[]},catalog,initial.state);assert.equal(missing.alerts.some(value=>value.kind==='unit_lost'),false);
});
test('attack and casualty throttles use event categories and ignore stale/future/other-owner events',()=>{
 const s=snapshot(100);s.events=[create(EventSchema,{id:1,tick:100,kind:'under_attack',owner:1,entity:1})];
 const first=selectBattleStatusAlerts(s,catalog);
 const next={...s,tick:101,events:[create(EventSchema,{id:2,tick:101,kind:'under_attack',owner:1,entity:1,position:{x:7000,y:8000}})]};
 const suppressed=selectBattleStatusAlerts(next,catalog,first.state);assert.equal(suppressed.alerts.some(value=>value.kind==='base_under_attack'),false);assert.deepEqual(suppressed.latestActionable?.position,{x:7000,y:8000});
 const later=selectBattleStatusAlerts({...next,tick:300,events:[{...next.events[0],id:3,tick:300}]},catalog,suppressed.state);assert.equal(later.alerts.some(value=>value.kind==='base_under_attack'),true);
 const stale=selectBattleStatusAlerts({...s,tick:400},catalog);assert.equal(stale.alerts.some(value=>value.kind==='base_under_attack'),false);
 assert.equal(selectBattleStatusAlerts({...s,tick:99},catalog).alerts.some(value=>value.kind==='base_under_attack'),false);
 assert.equal(selectBattleStatusAlerts({...s,player:2},catalog,first.state).alerts.length,0);
});
test('resetting on perspective change or backward seek prevents inherited clocks; finished games stop idle nudges',()=>{
 const initial=selectBattleStatusAlerts(snapshot(100),catalog,undefined,advice(100));
 const rewind=selectBattleStatusAlerts(snapshot(0),catalog,initial.state,advice(0));assert.equal(rewind.state.idleSince['idle_production:1'],0);
 const end=snapshot(101);end.outcome=create(PlayerSnapshotSchema,{outcome:{finished:true}}).outcome;assert.deepEqual(selectBattleStatusAlerts(end,catalog,initial.state,advice(101)).alerts,[]);
});
test('existing event-only selector keeps severity ordering and newest actionable event for Space',()=>{
 const events=create(PlayerSnapshotSchema,{events:[{id:1,tick:20,kind:'missile_warning',position:{x:1,y:1}},{id:2,tick:40,kind:'construction_complete',position:{x:2,y:2}}]}).events;
 const result=selectBattleAlerts(events);assert.equal(result.visible[0].event.id,1);assert.equal(result.latestActionable?.event.id,2);
});

test('actively gathering moving haulers and manual assignments never emit idle alerts from stale harvest states',()=>{
 for(const kind of ['gather','move','guard']){
  const s=snapshot();s.entities[1].state=kind==='gather'?'moving':'no_known_supplies';s.entities[1].private!.orders=create(PlayerSnapshotSchema,{entities:[{private:{orders:[{kind}]}}]}).entities[0].private!.orders;
  assert.equal(selectBattleStatusAlerts(s,catalog).alerts.some(alert=>alert.kind==='idle_hauler'),false);
 }
});

test('defeated perspective receives no idle or power nudges while the wider match continues',()=>{
 const s=snapshot(100);s.economy!.powerDemand=100;s.players=create(PlayerSnapshotSchema,{players:[{id:1,defeated:true},{id:2,defeated:false}]}).players;
 assert.deepEqual(selectBattleStatusAlerts(s,catalog,undefined,advice(100)).alerts,[]);
});

test('status feed lines stay compact while detailed economy explanations remain available',()=>{
 let s=snapshot(0);s.economy!.powerDemand=999;
 let result=selectBattleStatusAlerts(s,catalog,undefined,advice(0));const lines=result.alerts.map(alert=>alert.text);
 for(let tick=60;tick<=360;tick+=60){s=snapshot(tick);s.economy!.powerDemand=999;result=selectBattleStatusAlerts(s,catalog,result.state,advice(tick));lines.push(...result.alerts.map(alert=>alert.text))}
 assert.ok(lines.some(line=>line.includes('production available')));assert.ok(lines.some(line=>line.includes('Low power')));assert.ok(lines.every(line=>line.length<=48));
});
