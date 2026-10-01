import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,type PlayerSnapshot} from '../../src/protocol/frontline_pb';
import {EnvironmentKnowledge,type EnvironmentItem} from '../../src/render/environment-state';
import type {GameMap} from '../../src/runtime/types';

// Actual module/schema controls. These snapshot masks and disclosed records are
// controlled source inputs, not earned Go views, normal-play/native evidence.
// Stage this unchanged file in a root-owned snapshot's client/tests/runtime.
const supply={x:5500,y:5500},shipment={x:15500,y:15500};
function publicMap():GameMap{return {id:'environment-history-module',version:'1',title:'Public module fixture',author:'test',format_version:1,ruleset:'standard-v2',width:32,height:32,
 tiles:Array.from({length:1024},()=>({terrain:'open'})),spawns:[],fields:[{id:1,position:{...supply},credits:1000}],stations:[],shipment:{...shipment},objects:[]};}
function frame(tick:number,player=1,visible=false,explored=true):PlayerSnapshot{return create(PlayerSnapshotSchema,{tick,player,visible:Array(1024).fill(visible),explored:Array(1024).fill(explored)});}
function remember(s:PlayerSnapshot,id:number,remaining:bigint,position=supply,seen=20){s.knownFields.push({$typeName:'frontline.v1.FieldObservation',id,position:{$typeName:'frontline.v1.Vec',...position},remaining,seen});return s;}
function current(s:PlayerSnapshot,id:number,remaining:bigint,position=supply){s.fields.push({$typeName:'frontline.v1.Field',id,position:{$typeName:'frontline.v1.Vec',...position},remaining});return s;}
function one(items:EnvironmentItem[],key='field:1'){const item=items.find(value=>value.key===key);assert(item,'A disclosed field item is present');return item;}
const tile=(p:{x:number;y:number})=>Math.floor(p.y/1000)*32+Math.floor(p.x/1000);

test('V01 cold saved/replay view restores an explored hidden last-known supply amount',()=>{
 const s=remember(frame(100),1,249n),before=structuredClone(s),item=one(new EnvironmentKnowledge(publicMap()).sync(s));
 assert.equal(item.state,'low');assert.equal(item.remaining,249n);assert.equal(item.remembered,true);assert.equal(item.visible,true);assert.equal(item.position.x,supply.x);assert.equal(item.position.y,supply.y);
 assert.deepEqual(s,before,'Reading authoritative history does not mutate its snapshot');
});

test('V02 cold dynamic cargo preserves its disclosed stock, depletion and exact position',()=>{
 for(const remaining of [6000000n,0n]){
  const s=remember(frame(100),42,remaining,shipment,80),items=new EnvironmentKnowledge(publicMap()).sync(s),item=one(items,'field-at:15500:15500');
  assert.equal(item.id,42);assert.equal(item.position.x,shipment.x);assert.equal(item.position.y,shipment.y);assert.equal(item.remaining,remaining);assert.equal(item.state,remaining===0n?'depleted':'high');
  assert.equal(item.remembered,true);assert.equal(item.visible,true);assert.equal(items.filter(value=>value.key==='field-at:15500:15500').length,1);
 }
});

test('V03 switching viewer clears foreign local facts and restores only returning viewer history',()=>{
 const k=new EnvironmentKnowledge(publicMap()),first=current(remember(frame(100,1,true),1,125n),1,125n);assert.equal(one(k.sync(first)).remaining,125n);
 const foreign=frame(100,2,false);let item=one(k.sync(foreign));assert.equal(item.state,'unknown');assert.equal(item.remaining,undefined);
 const returning=remember(frame(100,1,false),1,125n);item=one(k.sync(returning));assert.equal(item.remaining,125n);assert.equal(item.state,'low');assert.equal(item.remembered,true);
 foreign.tick=101;remember(foreign,1,900n,supply,10);assert.equal(one(k.sync(foreign)).remaining,900n,'Viewer2 uses its own older observation');
 returning.tick=102;assert.equal(one(k.sync(returning)).remaining,125n,'Viewer2 stock cannot replace Viewer1 history');
});

test('V04 rewind restores the earlier observation and removes future field memory',()=>{
 const k=new EnvironmentKnowledge(publicMap()),late=current(remember(frame(100,1,true),1,1n,supply,100),1,1n);assert.equal(one(k.sync(late)).state,'low');
 const earlier=remember(frame(50),1,900n,supply,20),item=one(k.sync(earlier));assert.equal(item.state,'full');assert.equal(item.remaining,900n);assert.equal(item.remembered,true);
 const beforeObservation=one(k.sync(frame(10)));assert.equal(beforeObservation.state,'unknown');assert.equal(beforeObservation.remaining,undefined);
});

test('V05 current visible fields retain precedence over stale disclosed history',()=>{
 const s=current(remember(frame(100,1,true),1,900n,supply,20),1,0n),item=one(new EnvironmentKnowledge(publicMap()).sync(s));
 assert.equal(item.state,'depleted');assert.equal(item.remaining,0n);assert.equal(item.remembered,false);assert.equal(item.visible,true);
});

test('V06 hidden current field records never update last-known stock',()=>{
 // Negative input guard also present in the existing environment-state tests:
 // a hidden live record is not a disclosure, even when supplied by this fixture.
 const k=new EnvironmentKnowledge(publicMap()),s=current(remember(frame(100),1,249n),1,0n);let item=one(k.sync(s));
 assert.equal(item.remaining,249n);assert.equal(item.state,'low');assert.equal(item.remembered,true);
 s.tick=101;s.fields[0].remaining=1000n;item=one(k.sync(s));assert.equal(item.remaining,249n);assert.equal(item.state,'low');
});

test('V07 never-explored public history remains invisible until exploration is disclosed',()=>{
 // Go globally announces shipment stock; knowledge is not terrain exploration.
 const s=remember(remember(frame(100,1,false,false),1,249n),42,6000000n,shipment,80),k=new EnvironmentKnowledge(publicMap());
 assert(!k.sync(s).some(item=>item.kind==='field'),'No supply node is created outside explored disclosure');
 s.tick=101;s.explored[tile(supply)]=true;let items=k.sync(s);assert.equal(one(items).remaining,249n);assert(!items.some(item=>item.key==='field-at:15500:15500'));
 s.tick=102;s.explored[tile(shipment)]=true;items=k.sync(s);assert.equal(one(items,'field-at:15500:15500').remaining,6000000n);assert(items.filter(item=>item.kind==='field').every(item=>item.remembered));
});
