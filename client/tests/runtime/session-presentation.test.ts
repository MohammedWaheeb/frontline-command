import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,MatchResultSchema,MatchStatusSchema,OutcomeSchema} from '../../src/protocol/frontline_pb';
import {battlefieldStatus,networkOperationPresentation} from '../../src/app/session-presentation';

const snapshot=create(PlayerSnapshotSchema,{player:1,tick:11138,players:[{id:1,team:1,defeated:true},{id:2,team:1},{id:3,team:2,defeated:true},{id:4,team:2}]});
test('an eliminated online commander has a frozen badge regardless of stale pause, without changing the permitted snapshot',()=>{
 const original=structuredClone(snapshot);
 for(const paused of [true,false])assert.equal(battlefieldStatus({kind:'online',paused,snapshot}).label,'FROZEN');
 assert.match(battlefieldStatus({kind:'online',paused:false,snapshot}).description,/no live battlefield updates/);
 const alive=create(PlayerSnapshotSchema,{player:2,players:snapshot.players});
 assert.equal(battlefieldStatus({kind:'online',paused:false,snapshot:alive}).label,'LIVE');
 assert.equal(battlefieldStatus({kind:'online',paused:false,snapshot:create(PlayerSnapshotSchema,{player:5,players:snapshot.players})}).label,'LIVE');
 assert.deepEqual(snapshot,original);
});
test('observer, paused and replay labels retain priority; only a real finished snapshot labels the battlefield ended',()=>{
 assert.equal(battlefieldStatus({kind:'observer',paused:true,snapshot}).label,'OBSERVER');
 assert.equal(battlefieldStatus({kind:'replay',paused:true,snapshot}).label,'PAUSED');
 assert.equal(battlefieldStatus({kind:'replay',paused:false,snapshot}).label,'REPLAY');
 assert.equal(battlefieldStatus({kind:'solo',paused:true,snapshot}).label,'PAUSED');
 const final=create(PlayerSnapshotSchema,{...snapshot,outcome:create(OutcomeSchema,{finished:true,winningTeam:1,tick:13475})});
 assert.equal(battlefieldStatus({kind:'online',paused:false,snapshot:final}).label,'ENDED');
 assert.equal(battlefieldStatus({kind:'replay',paused:false,snapshot:final}).label,'REPLAY');
});
test('terminal and disconnected menus never display old teammate, latency or shared-pause data as current',()=>{
 const state={connection:'connected' as const,tick:11138,status:create(MatchStatusSchema,{paused:true,teammates:[{player:1,connected:true}],pauseVotes:[1]})};
 assert.deepEqual(networkOperationPresentation(state),{label:'SHARED PAUSE',statusCurrent:true,tick:11138,timePrefix:''});
 for(const patch of [{eliminated:true},{connection:'closed' as const},{connection:'reconnecting' as const},{connection:'connecting' as const},{connection:'idle' as const},{lobbyUnavailable:true},{lobbyState:'completed' as const}])assert.equal(networkOperationPresentation({...state,...patch}).statusCurrent,false);
 assert.equal(networkOperationPresentation({...state,eliminated:true}).label,'FROZEN');
 assert.equal(networkOperationPresentation({...state,connection:'reconnecting'}).label,'RECONNECTING');
 assert.equal(networkOperationPresentation({...state,connection:'closed'}).timePrefix,'Last update · ');
 const result=create(MatchResultSchema,{matchId:'earned-operation',committed:true,outcome:{finished:true,tick:13475,winningTeam:1}});
 assert.deepEqual(networkOperationPresentation({...state,result,eliminated:true}),{label:'RESULT RECORDED',statusCurrent:false,tick:13475,timePrefix:'Result time · '});
 assert.equal(networkOperationPresentation({...state,result:{...result,committed:false}}).statusCurrent,false);
 assert.equal(state.tick,11138);assert.equal(state.status.teammates[0].connected,true);
});

test('an overloaded solo simulation reports a slowdown or a busy tick instead of looking live, and pause or end still win',()=>{
 const alive=create(PlayerSnapshotSchema,{player:1,players:[{id:1,team:1},{id:2,team:2}]});
 assert.equal(battlefieldStatus({kind:'solo',paused:false,snapshot:alive,pace:{rate:1,busy:false}}).label,'LIVE');
 assert.equal(battlefieldStatus({kind:'solo',paused:false,snapshot:alive,pace:{rate:.9,busy:false}}).label,'LIVE');
 const slowed=battlefieldStatus({kind:'solo',paused:false,snapshot:alive,pace:{rate:.55,busy:false}});
 assert.equal(slowed.label,'SLOWED');assert.match(slowed.description,/55% speed/);assert.match(slowed.description,/Nothing is skipped/);
 assert.equal(battlefieldStatus({kind:'solo',paused:false,snapshot:alive,pace:{rate:0,busy:true}}).label,'BUSY');
 assert.equal(battlefieldStatus({kind:'solo',paused:true,snapshot:alive,pace:{rate:0,busy:true}}).label,'PAUSED');
 const ended=create(PlayerSnapshotSchema,{player:1,players:alive.players,outcome:{finished:true,tick:9,winningTeam:1}});
 assert.equal(battlefieldStatus({kind:'solo',paused:false,snapshot:ended,pace:{rate:.4,busy:false}}).label,'ENDED');
 assert.equal(battlefieldStatus({kind:'solo',paused:false,snapshot:alive}).label,'LIVE');
});
