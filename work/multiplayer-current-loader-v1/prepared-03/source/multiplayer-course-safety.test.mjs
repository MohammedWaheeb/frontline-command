import test from 'node:test';
import assert from 'node:assert/strict';
import {reconnectCycle,courseWatchdog,onceAsync} from './multiplayer-course-safety.mjs';
import {assertHumanJourney,acceptanceCase} from './multiplayer-current-loader-contract.mjs';
const frames=()=>[1,2,3].map(player=>({snapshot:{tick:700,players:[{id:player,defeated:player===1}],outcome:{finished:false}}}));
test('dead first human is a failed requirement while both later survivors reconnect once',async()=>{
 const record={reconnects:[],ownershipRejections:[1,2,3].map(player=>({player,code:'not_owner'})),commandSummary:Object.fromEntries([1,2,3].map(player=>[player,{build:{accepted:1},train:{accepted:1},move:{accepted:1}}]))},called=[];
 const reconnect=async index=>{called.push(index+1);record.reconnects.push({player:index+1});return true};
 await reconnectCycle({frames:frames(),record,reconnect});assert.deepEqual(called,[2]);
 assert.deepEqual(record.reconnectAttempts.map(x=>x.status),['failed-inactive-before-reconnect','passed']);
 await reconnectCycle({frames:frames(),record,reconnect});await reconnectCycle({frames:frames(),record,reconnect});assert.deepEqual(called,[2,3]);
 assert.throws(()=>assertHumanJourney(acceptanceCase('3h1ai'),record),/Human 1 did not reconnect/);
});
test('lost human during attempt remains failed and later cycle still visits next survivor',async()=>{
 const record={},f=frames();f[0].snapshot.players[0].defeated=false;const calls=[];
 const reconnect=async index=>{calls.push(index);return index!==0};
 await reconnectCycle({frames:f,record,reconnect});await reconnectCycle({frames:f,record,reconnect});
 assert.equal(record.reconnectAttempts[0].status,'failed-inactive-during-reconnect');assert.deepEqual(calls,[0,1]);
});
test('reconnect exceptions retain failed attempt then propagate without fake success',async()=>{
 const record={};await assert.rejects(reconnectCycle({frames:frames(),record,reconnect:async()=>{throw Error('actual modal failure')}}),/actual modal/);
 assert.equal(record.reconnectAttempts[1].status,'failed-reconnect-error');assert.equal(record.reconnects,undefined);
});
function scheduler(){let callback,cleared=false;return{set:f=>(callback=f,1),clear:id=>{assert.equal(id,1);cleared=true},fire:()=>callback(),get cleared(){return cleared}}}
test('watchdog closes owned resources once even while main work never settles',async()=>{
 const s=scheduler(),calls=[],hang=new Promise(()=>{}),cleanup=onceAsync(async()=>{calls.push('context');await Promise.resolve();calls.push('browser');calls.push('host')});
 const w=courseWatchdog(3600000,cleanup,s);void hang;s.fire();assert(w.expired);
 await Promise.all([w.settled,cleanup(),cleanup()]);assert.deepEqual(calls,['context','browser','host']);assert.equal(w.error,undefined);
});
test('normal completion cancels watchdog, including an already queued timer callback',async()=>{
 const s=scheduler();let closes=0;const w=courseWatchdog(1,()=>closes++,s);w.cancel();s.fire();await w.settled;assert(s.cleared);assert.equal(w.expired,false);assert.equal(closes,0);
});
test('watchdog cleanup failure remains visible and expiry cannot be canceled into a pass',async()=>{
 const s=scheduler(),failure=Error('close failed'),w=courseWatchdog(1,async()=>{throw failure},s);s.fire();w.cancel();await w.settled;assert(w.expired);assert.equal(w.error,failure);
});
