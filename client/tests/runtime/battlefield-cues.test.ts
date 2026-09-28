import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,OutcomeSchema,EconomySchema} from '../../src/protocol/frontline_pb';
import {defeatCountdowns,memoryCaption,placementPower} from '../../src/app/battlefield-cues';

test('defeat countdowns follow the actual perspective and simulation tick, never the wall clock',()=>{
 const s=create(PlayerSnapshotSchema,{player:2,tick:701,players:[{id:1,name:'Alpha',defeatAt:1300},{id:2,name:'Bravo',defeatAt:1301},{id:3,defeatAt:701},{id:4,defeatAt:1200,defeated:true}]});
 const before=structuredClone(s);
 assert.deepEqual(defeatCountdowns(s),[{player:2,name:'Bravo',own:true,seconds:30},{player:1,name:'Alpha',own:false,seconds:30}]);
 assert.equal(defeatCountdowns({...s,tick:1281})[0].seconds,1);
 assert.equal(defeatCountdowns({...s,tick:1301}).length,0);
 assert.equal(defeatCountdowns({...s,player:1})[0].player,1);
 assert.deepEqual(s,before);
});
test('recovery, defeat, finished outcomes and absent/invalid deadlines clear warnings',()=>{
 const s=create(PlayerSnapshotSchema,{player:1,tick:100,players:[{id:1,defeatAt:700}]});
 assert.equal(defeatCountdowns(s).length,1);
 for(const deadline of [0,100,-1,NaN,Infinity])assert.deepEqual(defeatCountdowns({...s,players:[{...s.players[0],defeatAt:deadline}]}),[]);
 assert.deepEqual(defeatCountdowns({...s,players:[{...s.players[0],defeated:true}]}),[]);
 assert.deepEqual(defeatCountdowns({...s,outcome:create(OutcomeSchema,{finished:true})}),[]);
 assert.deepEqual(defeatCountdowns(undefined),[]);
});
test('memory captions preserve the observation timestamp across later ticks and reject future or malformed times',()=>{
 assert.equal(memoryCaption(0,100),'LAST SEEN 0:00');
 assert.equal(memoryCaption(14521,15000),'LAST SEEN 12:06');
 assert.equal(memoryCaption(14521,20000),'LAST SEEN 12:06');
 assert.equal(memoryCaption(120000,120001),'LAST SEEN 100:00');
 for(const [seen,tick] of [[101,100],[-1,100],[NaN,100],[10,Infinity],[1.2,100]])assert.equal(memoryCaption(seen,tick),undefined);
});

test('build power estimate includes both capacity and demand without altering current economy',()=>{
 const economy=create(EconomySchema,{powerCapacity:40,powerDemand:30});
 const b={power_capacity:50,power_demand:5} as Parameters<typeof placementPower>[0];
 assert.equal(placementPower(b,economy),'Power after build 35/90');
 assert.equal(placementPower({...b!,power_capacity:0,power_demand:20},economy),'Power after build 50/40');
 assert.equal(economy.powerCapacity,40);assert.equal(economy.powerDemand,30);
 assert.equal(placementPower(b,undefined),'Power estimate unavailable');
});
