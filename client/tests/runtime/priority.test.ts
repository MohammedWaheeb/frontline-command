import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,StateDeltaSchema,PriorityFrameSchema} from '../../src/protocol/frontline_pb';
import {applyPriority} from '../../src/runtime/priority';
import {applyDelta} from '../../src/runtime/snapshot';
const priority=(tick:number,removedEntities:number[])=>create(PriorityFrameSchema,{tick,removedEntities,results:[]});
const full=()=>create(PlayerSnapshotSchema,{player:1,tick:100,entities:[{id:2,owner:1,private:{cargo:4n}},{id:9,owner:2}],visible:[true,true],explored:[true,true]});
test('priority removes foreign actor immediately without mutating canonical snapshot or clock',()=>{
 const baseline=full(),current=applyPriority(baseline,priority(101,[9]));
 assert.deepEqual(current.entities.map(e=>e.id),[2]);assert.equal(current.tick,100);assert.equal(baseline.entities.length,2);assert.equal(current.entities[0],baseline.entities[0]);assert.equal(current.entities[0].private?.cargo,4n);
});
test('unchanged regained actor reconstructs from canonical full baseline',()=>{
 const baseline=full(),removed=applyPriority(baseline,priority(101,[9]));
 const delta=create(StateDeltaSchema,{baselineTick:100,state:{player:1,tick:102,visible:[true,true],explored:[true,true]}});
 assert.deepEqual(applyDelta(baseline,delta).entities.map(e=>e.id),[2,9]);assert.deepEqual(applyDelta(removed,delta).entities.map(e=>e.id),[2],'original current-as-baseline loses unchanged regain');
});
test('multiple removals remain immutable and idle or unknown IDs do not publish fake movement',()=>{
 const baseline=full(),a=applyPriority(baseline,priority(101,[9])),b=applyPriority(a,priority(102,[2]));
 assert.equal(applyPriority(a,priority(102,[])),a);assert.equal(applyPriority(a,priority(102,[999])),a);assert.equal(b.entities.length,0);assert.equal(a.entities.length,1);assert.equal(baseline.entities.length,2);
});
test('priority needs a full baseline and bounded positive removal IDs',()=>{
 assert.throws(()=>applyPriority(undefined,priority(101,[9])),{code:'baseline_mismatch'});assert.throws(()=>applyPriority(full(),priority(99,[9])),{code:'baseline_mismatch'});
 assert.throws(()=>applyPriority(full(),priority(101,[0])),{code:'invalid_priority'});assert.throws(()=>applyPriority(full(),priority(101,Array(2049).fill(9))),{code:'invalid_priority'});
});
