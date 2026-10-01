import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {OrderResultSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {OnlineTransport} from '../../src/runtime/online';
import type {RuntimeEvent,OrderResult} from '../../src/runtime/types';
const receipt=(sequence=1)=>({...create(OrderResultSchema,{player:1,sequence,index:0,tick:101,accepted:true,code:'applied'}),eligibleEntities:[2,7],appliedCount:2}) as OrderResult;
const transport=()=>new OnlineTransport('http://lan.test',{match_id:'match',player:1,token:'test-slot',protocol:1,simulation:'test',content_hash:'fixture'});
test('normal high-rate execution followed by terminal full repetition emits exactly once including capable IDs',()=>{
 const t=transport(),events:RuntimeEvent[]=[];t.subscribe(e=>events.push(e));const inner=t as any,r=receipt();
 inner.validateResults([r]);inner.publishResult(r);inner.publish({...create(PlayerSnapshotSchema,{player:1,tick:102}),results:[{...r,eligibleEntities:[2,7]}]});
 const results=events.filter(e=>e.type==='order-result');assert.equal(results.length,1);assert.equal(results[0].result,r);assert.deepEqual(results[0].result.eligibleEntities,[2,7]);assert.equal(results[0].result.appliedCount,2);assert.equal(inner.sequence,1);t.dispose();
});
test('distinct admission and execution stages are retained even at same tick',()=>{
 const t=transport(),events:RuntimeEvent[]=[];t.subscribe(e=>events.push(e));const inner=t as any,r=receipt();
 inner.publishResult({...r,code:'accepted',eligibleEntities:[],appliedCount:0});inner.publishResult(r);inner.publishResult({...r,code:'accepted',eligibleEntities:[],appliedCount:0});
 assert.deepEqual(events.filter(e=>e.type==='order-result').map(e=>e.result.code),['accepted','applied']);t.dispose();
});
test('foreign-owner result batch is rejected before any receipt emission',()=>{
 const t=transport(),events:RuntimeEvent[]=[];t.subscribe(e=>events.push(e));assert.throws(()=>(t as any).validateResults([receipt(),{...receipt(),player:2}]),{code:'wrong_perspective'});assert.equal(events.length,0);t.dispose();
});
test('receipt history is bounded across a long connection',()=>{
 const t=transport(),inner=t as any;for(let i=1;i<=1100;i++)inner.publishResult(receipt(i));assert.equal(inner.receipts.size,1024);assert.equal(inner.sequence,1100);t.dispose();
});
