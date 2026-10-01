import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {ownerRanges} from '../../src/app/owner-ranges';
import {actorStatus} from '../../src/app/actor-status';
import {CatalogIndex} from '../../src/content/catalog';
import {readFileSync} from 'node:fs';

const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
function fixture(){
 const entity=create(EntitySchema,{id:6,owner:1,type:'abm',health:1000,complete:true,enabled:true,private:{charges:1,chargeWork:10}});
 const ranges={sightRadius:9000,detectionRadius:3000,airborneSight:false,buildRadius:0,interception:{radius:14000,capacity:2,active:true,ready:false,rechargeRequired:960,rechargeRate:2,nextChargeTicks:475,fireReadyAt:120,assignments:[{projectile:99,impact:{x:18000,y:16000},interceptAt:110}]}};
 Object.assign(entity.private!,{ranges});
 const snapshot=create(PlayerSnapshotSchema,{tick:100,player:1,entities:[entity],players:[{id:1,team:1},{id:2,team:1},{id:3,team:3}],projectiles:[{id:99,owner:3,warning:true,interceptable:true,impact:{x:18000,y:16000},impactAt:130}]});
 return {entity,ranges,snapshot};
}
test('owner ranges keep exact Go values and only actual public assignments, detached from wire',()=>{
 const {entity,ranges,snapshot}=fixture(),before=structuredClone({entity,snapshot});
 const result=ownerRanges(entity,snapshot)!;assert.deepEqual(result,ranges);
 result.interception!.assignments[0].impact.x=1;
 assert.deepEqual({entity,snapshot},before);assert.equal(ownerRanges(entity,snapshot)!.interception!.assignments[0].impact.x,18000);
 assert.deepEqual(actorStatus(entity,snapshot,catalog).ammunition,{label:'Interceptors',current:1,capacity:2});
});
test('old runtimes, allies, enemies, embarked and destroyed actors never acquire guessed ranges',()=>{
 const {entity,snapshot}=fixture();
 for(const patch of [{owner:2},{owner:3},{health:0},{state:'destroyed'}])assert.equal(ownerRanges({...entity,...patch},snapshot),undefined);
 const legacy=create(EntitySchema,{id:6,owner:1,type:'abm',health:1000,private:{charges:1}});assert.equal(ownerRanges(legacy,snapshot),undefined);
 entity.private!.container=10;assert.equal(ownerRanges(entity,snapshot),undefined);
});
test('assignment links require matching live public warning and unexpired exact ID',()=>{
 for(const mutate of [
  (s:ReturnType<typeof fixture>)=>{s.snapshot.projectiles=[]},
  (s:ReturnType<typeof fixture>)=>{s.snapshot.projectiles[0].warning=false},
  (s:ReturnType<typeof fixture>)=>{s.snapshot.projectiles[0].interceptable=false},
  (s:ReturnType<typeof fixture>)=>{s.snapshot.projectiles[0].impact!.x++},
  (s:ReturnType<typeof fixture>)=>{s.ranges.interception.assignments[0].interceptAt=100},
  (s:ReturnType<typeof fixture>)=>{s.ranges.interception.assignments[0].projectile=98},
 ]){const s=fixture();mutate(s);assert.equal(ownerRanges(s.entity,s.snapshot)!.interception!.assignments.length,0)}
 const s=fixture();s.ranges.interception.assignments.push(s.ranges.interception.assignments[0]);assert.equal(ownerRanges(s.entity,s.snapshot)!.interception!.assignments.length,1);
});
test('zero perception is explicit, malformed metadata fails closed and paused/full time stays absent',()=>{
 const s=fixture();s.ranges.sightRadius=0;s.ranges.detectionRadius=0;assert.equal(ownerRanges(s.entity,s.snapshot)!.sightRadius,0);
 for(const patch of [{sightRadius:-1},{detectionRadius:NaN},{buildRadius:Infinity},{airborneSight:'false'}]){
  Object.assign(s.entity.private!,{ranges:{...s.ranges,...patch}});assert.equal(ownerRanges(s.entity,s.snapshot),undefined);
 }
 const raw={...s.ranges,interception:{...s.ranges.interception,active:false,ready:false,rechargeRate:0,nextChargeTicks:undefined}};
 Object.assign(s.entity.private!,{ranges:raw});assert.equal(ownerRanges(s.entity,s.snapshot)!.interception!.nextChargeTicks,undefined);
 raw.interception.nextChargeTicks=10 as never;assert.equal(ownerRanges(s.entity,s.snapshot)!.interception,undefined);
});
test('selection of a ready defense requires exact Go readiness consistent with its tick and charges',()=>{
 const s=fixture();s.ranges.interception.ready=true;assert.equal(ownerRanges(s.entity,s.snapshot)!.interception,undefined);
 s.ranges.interception.fireReadyAt=100;assert.equal(ownerRanges(s.entity,s.snapshot)!.interception!.ready,true);
 s.entity.private!.charges=0;assert.equal(ownerRanges(s.entity,s.snapshot)!.interception,undefined);
});
