import test from 'node:test';
import assert from 'node:assert/strict';
import {create,toBinary,fromBinary} from '@bufbuild/protobuf';
import {EnvelopeSchema,PlayerSnapshotSchema,StateDeltaSchema} from '../../src/protocol/frontline_pb';
import {applyDelta} from '../../src/runtime/snapshot';
import {milliUnits,sequenceAfter} from '../../src/runtime/fixed';
test('lost vision removes entity and replaces private state without mutating the prior frame',()=>{
 const previous=create(PlayerSnapshotSchema,{player:1,tick:100,entities:[{id:2,owner:1,private:{cargo:100n}},{id:9,owner:2}],visible:[true,true],explored:[true,true],warnings:[{kind:'raid'}]});
 const next=applyDelta(previous,create(StateDeltaSchema,{baselineTick:100,removedEntities:[9],state:{player:1,tick:104,entities:[{id:2,owner:1,private:{cargo:0n}}],visible:[true,false],explored:[true,true]}}));
 assert.deepEqual(next.entities.map(e=>e.id),[2]);assert.equal(next.entities[0].private?.cargo,0n);assert.equal(next.warnings.length,0);assert.equal(previous.entities.length,2);assert.equal(previous.entities[0].private?.cargo,100n);
 assert.throws(()=>applyDelta(next,create(StateDeltaSchema,{baselineTick:100,state:{player:1,tick:108}})),{code:'baseline_mismatch'});
});
test('protobuf retains large seed and currency values and new control/status fields',()=>{
 const envelope=create(EnvelopeSchema,{message:{case:'snapshot',value:{player:1,metadata:{seed:18446744073709551615n},economy:{credits:9007199254740993n,lastSequence:73},players:[{id:1,surrenderVote:true}]}}});
 const round=fromBinary(EnvelopeSchema,toBinary(EnvelopeSchema,envelope));assert.equal(round.message.case,'snapshot');if(round.message.case==='snapshot'){assert.equal(round.message.value.metadata?.seed,18446744073709551615n);assert.equal(round.message.value.economy?.credits,9007199254740993n);assert.equal(round.message.value.players[0].surrenderVote,true)}
 const status=create(EnvelopeSchema,{message:{case:'status',value:{paused:true,pauseVotes:[1,2],teammates:[{player:2,reconnectRemainingMs:120000}]}}});assert.deepEqual(fromBinary(EnvelopeSchema,toBinary(EnvelopeSchema,status)),status);
});
test('display conversion and reconnect sequence retain boundaries',()=>{assert.equal(milliUnits(123456n),123.456);assert.equal(milliUnits(-1001n),-1.001);assert.equal(sequenceAfter(12,90),91);assert.throws(()=>sequenceAfter(0xffffffff));assert.throws(()=>milliUnits(Number.MAX_SAFE_INTEGER+1))});
