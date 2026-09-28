import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {create,type MessageInitShape} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema,VecSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {actorStatus} from '../../src/app/actor-status';
import {reason} from '../../src/content/labels';

const catalog=new CatalogIndex(JSON.parse(readFileSync(resolve('../pkg/content/rules.json'),'utf8')));
const entity=(patch:MessageInitShape<typeof EntitySchema>={})=>create(EntitySchema,{id:1,owner:1,type:'US.fighter',position:create(VecSchema,{x:8000,y:8000}),health:1000,complete:true,enabled:true,state:'idle',...patch});
const snapshot=(tick=100)=>create(PlayerSnapshotSchema,{tick,player:1,economy:{powerCapacity:10,powerDemand:30},players:[{id:1,team:1},{id:2,team:1},{id:3,team:3}]});
const extended=(patch:MessageInitShape<typeof EntitySchema>,effects:Array<{kind:string;until:number}>)=>Object.assign(entity(patch),{effects});

test('actor effect deadlines use exact Go ticks including indefinite aura and expire without cooldown guesses',()=>{
 const e=extended({landed:true,private:{cooldowns:[{id:'decoy',until:999}]}},[{kind:'disperse',until:121},{kind:'shieldline',until:0},{kind:'relay',until:100}]);
 const before=structuredClone(e),a=actorStatus(e,snapshot(),catalog);
 assert.deepEqual(a.badges.map(b=>[b.id,b.seconds]),[['shieldline',undefined],['disperse',2]]);
 assert.equal(actorStatus(e,snapshot(120),catalog).badges.find(b=>b.id==='disperse')?.seconds,1);
 assert.ok(!actorStatus(e,snapshot(121),catalog).badges.some(b=>b.id==='disperse'));
 assert.deepEqual(actorStatus(e,snapshot(),catalog),a);assert.deepEqual(e,before);
});

test('only the owner receives magazine, ambush, service and emergency countdown information',()=>{
 const e=entity({private:{ammo:4,charges:2,ambushReady:true,home:0,orders:[{kind:'return'}]}});
 Object.assign(e.private!,{emergencyTakeoffUntil:141});
 const own=actorStatus(e,snapshot(),catalog);
 assert.deepEqual(own.ammunition,{label:'Ammo',current:4,capacity:6});
 assert.equal(own.badges.find(b=>b.id==='emergency_takeoff')?.seconds,3);
 assert.ok(own.badges.some(b=>b.id==='no_home')&&own.badges.some(b=>b.id==='return')&&own.badges.some(b=>b.id==='ambush'));
 for(const owner of [2,3]){
  const foreign=actorStatus({...e,owner},snapshot(),catalog);
  assert.deepEqual(foreign,{badges:[]});
 }
});

test('runtime without new metadata never starts an invented emergency timer or active buff',()=>{
 const e=entity({state:'emergency_takeoff',landed:true,private:{home:99,cooldowns:[{id:'rapid_sortie',until:999}]}});
 assert.deepEqual(actorStatus(e,snapshot(),catalog).badges,[{id:'emergency_takeoff',symbol:'↑',label:'Emergency takeoff',tone:'critical',priority:300}]);
 assert.deepEqual(actorStatus(e,snapshot(700),catalog).badges,actorStatus(e,snapshot(),catalog).badges);
});

test('a retained Return order does not label a landed aircraft as still returning',()=>{
 const e=entity({landed:true,state:'servicing',private:{home:5,orders:[{kind:'return'}]}}),status=actorStatus(e,snapshot(),catalog);
 assert.ok(status.badges.some(b=>b.id==='servicing'));assert.ok(!status.badges.some(b=>b.id==='return'));
 assert.ok(!actorStatus({...e,state:'landed'},snapshot(),catalog).badges.some(b=>b.id==='servicing'||b.id==='return'));
});

test('known public effects remain visible on foreign authorized actors without private economy',()=>{
 const e=extended({owner:3,type:'SA.tank',deployed:true},[{kind:'designated',until:160},{kind:'launch_reveal',until:150},{kind:'hull_down',until:0}]);
 assert.deepEqual(actorStatus(e,snapshot(),catalog).badges.map(b=>b.id),['designated','launch_reveal','hull_down']);
 const building=extended({owner:3,type:'factory',enabled:false},[{kind:'disabled',until:141}]);
 const badges=actorStatus(building,snapshot(),catalog).badges;
 assert.equal(badges.length,1);assert.equal(badges[0].seconds,3);assert.ok(!badges.some(b=>b.id==='low_power'));
});

test('channel progress and countdown come from Go state, and cancellation removes them',()=>{
 const e=entity({type:'US.engineer',state:'capture',channelUntil:145,progress:370});
 assert.deepEqual(actorStatus(e,snapshot(),catalog).channel,{label:'Capturing',progress:370,seconds:3});
 assert.equal(actorStatus({...e,state:'idle'},snapshot(),catalog).channel,undefined);
 assert.equal(actorStatus(e,snapshot(145),catalog).channel,undefined);
 assert.equal(actorStatus({...e,state:'capture_exit_blocked'},snapshot(),catalog).badges[0].id,'capture_exit_blocked');
});

test('charges use the actual Go catalog while ABM count does not invent a capacity',()=>{
 const launcher=entity({type:'IR.launcher',private:{charges:1,ammo:99}});
 assert.deepEqual(actorStatus(launcher,snapshot(),catalog).ammunition,{label:'Charges',current:1,capacity:2});
 const abm=entity({type:'SA.mobile_abm',private:{charges:3}});
 assert.deepEqual(actorStatus(abm,snapshot(),catalog).ammunition,{label:'Interceptors',current:3});
});

test('unknown/malformed/internal effects and contained or destroyed actors have no labels',()=>{
 const e=Object.assign(entity(),{effects:[{kind:'exit_lock',until:200},{kind:'future_private',until:200},{kind:'decoy',until:-1},{kind:'relay',until:Infinity},{kind:'disperse',until:'300'}]});
 assert.deepEqual(actorStatus(e,snapshot(),catalog),{badges:[]});
 for(const patch of [{state:'destroyed'},{health:0},{private:{container:55}}])assert.deepEqual(actorStatus(entity({...patch,enabled:false}),snapshot(),catalog),{badges:[]});
});

test('air production service wait is an owner-only unavailable badge, not a guessed capacity count',()=>{
 const own=entity({type:'US.airfield',state:'service_full',private:{jobs:[{type:'US.fighter',started:true,service:9}]}});
 assert.equal(actorStatus(own,snapshot(),catalog).badges.find(b=>b.id==='service_full')?.label,'Aircraft service unavailable');
 for(const owner of [2,3])assert.ok(!actorStatus({...own,owner},snapshot(),catalog).badges.some(b=>b.id==='service_full'));
 assert.ok(!actorStatus({...own,state:'producing'},snapshot(),catalog).badges.some(b=>b.id==='service_full'));
 assert.equal(reason('service_full'),'Aircraft service is unavailable. Check free slots and whether the service base is enabled.');
});

test('only the active Return order describes current return flight',()=>{
 for(const head of ['move','attack','unload']){
  const e=entity({landed:false,private:{home:5,orders:[{kind:head},{kind:'return'}]}});
  assert.ok(!actorStatus(e,snapshot(),catalog).badges.some(b=>b.id==='return'),head);
 }
 const returning=entity({landed:false,private:{home:5,orders:[{kind:'return'},{kind:'attack'}]}});
 assert.ok(actorStatus(returning,snapshot(),catalog).badges.some(b=>b.id==='return'));
});

test('current owned inactive home distinguishes paused service from low power and unknown home data',()=>{
 const aircraft=entity({landed:true,state:'servicing',private:{home:5,serviceWork:300,orders:[{kind:'return'}]}});
 const home=entity({id:5,type:'US.airfield',enabled:false}),s=snapshot();s.entities=[aircraft,home];
 const paused=actorStatus(aircraft,s,catalog);
 assert.equal(paused.badges.find(b=>b.id==='service_paused')?.label,'Service paused: base disabled');
 assert.ok(!paused.badges.some(b=>b.id==='servicing'));
 for(const replacement of [{...home,enabled:true},{...home,owner:2},{...home,health:0},{...home,type:'hq'}]){
  s.entities=[aircraft,replacement];const status=actorStatus(aircraft,s,catalog);
  assert.ok(!status.badges.some(b=>b.id==='service_paused'));assert.ok(status.badges.some(b=>b.id==='servicing'));
 }
 s.entities=[aircraft];assert.ok(!actorStatus(aircraft,s,catalog).badges.some(b=>b.id==='service_paused'));
 s.entities=[home];assert.ok(!actorStatus({...aircraft,owner:2},s,catalog).badges.some(b=>b.id==='service_paused'||b.id==='servicing'));
});

test('grounded emergency no-home warning remains distinct from takeoff deadline and airborne endurance',()=>{
 const e=entity({landed:true,state:'emergency_takeoff',private:{home:0,endurance:1200}});Object.assign(e.private!,{emergencyTakeoffUntil:140});
 const a=actorStatus(e,snapshot(),catalog);
 assert.equal(a.badges.find(b=>b.id==='emergency_takeoff')?.seconds,2);
 assert.ok(a.badges.some(b=>b.id==='no_home'));assert.equal(a.badges.find(b=>b.id==='no_home')?.seconds,undefined);
 assert.ok(!actorStatus({...e,private:{...e.private!,home:5}},snapshot(),catalog).badges.some(b=>b.id==='no_home'));
 const airborne={...e,landed:false,state:'flying',private:{...e.private!,emergencyTakeoffUntil:0}};
 assert.ok(actorStatus(airborne,snapshot(),catalog).badges.some(b=>b.id==='no_home'));
});
