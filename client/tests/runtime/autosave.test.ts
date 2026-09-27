import test from 'node:test';
import assert from 'node:assert/strict';
import {AutosaveCoordinator} from '../../src/runtime/autosave';
import {RuntimeError} from '../../src/runtime/errors';
import type {SaveData} from '../../src/runtime/types';
import type {LocalSave} from '../../src/runtime/storage';
const metadata={simulation:'test',protocol:1,content_hash:'fixture',map_version:'1',ruleset:'standard-v2',seed:42};
function harness(){
 let tick=0,captures=0,writes:LocalSave[]=[];let failure:RuntimeError|undefined;
 const coordinator=new AutosaveCoordinator({mode:'offline',async save(){captures++;return {data:new Uint8Array([1]),tick,hash:'fixture',metadata,local_players:[1]}}},{async autosave(save:SaveData,name='Autosave'){if(failure)throw failure;const record:LocalSave={...save,id:`autosave-${writes.length%3}`,name,kind:'auto',revision:1,updated:0};writes.push(record);return record}},{intervalTicks:100,retryTicks:10,maxRetryTicks:40});
 return {coordinator,writes,captures:()=>captures,setTick(value:number){tick=value},fail(error?:RuntimeError){failure=error},observe(value:number,checkpoint?:{id:string;name:string},session='run-1',replay=false){tick=value;return coordinator.observe({session,info:{tick,replay},checkpoint})}};
}
test('autosaves follow simulation ticks, save checkpoints once, and begin a new schedule on load',async()=>{
 const h=harness();await h.observe(0);await h.observe(99);assert.equal(h.writes.length,0);await h.observe(100);assert.equal(h.writes.length,1);
 await h.observe(101,{id:'bridge',name:'Bridge open'});await h.observe(102,{id:'bridge',name:'Bridge open'});assert.equal(h.writes.length,2);assert.equal(h.writes[1].name,'Bridge open');
 await h.observe(500,undefined,'loaded');await h.observe(599,undefined,'loaded');assert.equal(h.writes.length,2);await h.observe(600,undefined,'loaded');assert.equal(h.writes.length,3);h.coordinator.close();
});
test('failed checkpoint retries with simulation backoff and quota errors wait for explicit recovery',async()=>{
 const h=harness();h.fail(new RuntimeError('temporary_write','retry'));await h.observe(0,{id:'opening',name:'Opening'});assert.equal(h.coordinator.status.phase,'waiting');
 await h.observe(9);assert.equal(h.captures(),1);h.fail();await h.observe(10);assert.equal(h.writes.length,1);assert.equal(h.writes[0].name,'Opening');
 h.fail(new RuntimeError('storage_full','full'));await h.observe(110);assert.equal(h.coordinator.status.phase,'blocked');await h.observe(1000);assert.equal(h.captures(),2);h.fail();await h.coordinator.retry();assert.equal(h.writes.length,2);assert.equal(h.writes[1].tick,110);h.coordinator.close();
});
test('replay and online notifications never save; closing or replacing a session discards a captured old snapshot',async()=>{
 const h=harness();await h.observe(0,{id:'open',name:'Open'},'replay',true);await h.observe(500,undefined,'replay',true);assert.equal(h.captures(),0);
 let captures=0;const online=new AutosaveCoordinator({mode:'online',async save(){captures++;throw new Error('must not run')}},{async autosave(){throw new Error('must not run')}});await online.observe({session:'online',info:{tick:10000,replay:false},checkpoint:{id:'open',name:'Open'}});assert.equal(captures,0);online.close();
 let release!:(value:SaveData)=>void,writes=0;const pending=new Promise<SaveData>(resolve=>release=resolve);
 const c=new AutosaveCoordinator({mode:'offline',save:()=>pending},{async autosave(save){writes++;return {...save,id:'auto',kind:'auto',name:'Auto',revision:1,updated:0}}});
 const saving=c.observe({session:'old',info:{tick:0,replay:false},checkpoint:{id:'open',name:'Open'}});c.close();release({data:new Uint8Array([1]),tick:0,hash:'',metadata,local_players:[1]});await saving;assert.equal(writes,0);assert.equal(c.status.phase,'closed');h.coordinator.close();
});
test('concurrent tick notifications coalesce and never overlap writes',async()=>{
 let release!:()=>void,blocked=new Promise<void>(resolve=>release=resolve),tick=100,captures=0,writes=0,active=0;
 const coordinator=new AutosaveCoordinator({mode:'offline',async save(){captures++;return {data:new Uint8Array([1]),tick,hash:'',metadata,local_players:[1]}}},{async autosave(save){assert.equal(active++,0);await blocked;active--;writes++;return {...save,id:'auto',kind:'auto',name:'Auto',revision:1,updated:0}}},{intervalTicks:100});
 await coordinator.observe({session:'one',info:{tick:0,replay:false}});const first=coordinator.observe({session:'one',info:{tick:100,replay:false}});await Promise.resolve();tick=101;
 const second=coordinator.observe({session:'one',info:{tick:101,replay:false}});const third=coordinator.observe({session:'one',info:{tick:102,replay:false}});release();await Promise.all([first,second,third]);assert.equal(captures,1);assert.equal(writes,1);coordinator.close();
});

test('status callbacks may observe new ticks without reentrant captures and failed writes retain their exact snapshot',async()=>{
 let tick=0,captures=0,fail=true,coordinator!:AutosaveCoordinator;const stored:number[]=[];
 coordinator=new AutosaveCoordinator({mode:'offline',async save(){captures++;return {data:new Uint8Array([tick]),tick,hash:'',metadata,local_players:[1]}}},{async autosave(save){if(fail)throw new RuntimeError('temporary_write','retry');stored.push(save.data[0]);return {...save,id:'auto',kind:'auto',name:'Auto',revision:1,updated:0}}},{retryTicks:1,onStatus(status){if(status.phase==='saving')void coordinator.observe({session:'one',info:{tick,replay:false}})}});
 await coordinator.observe({session:'one',info:{tick:0,replay:false},checkpoint:{id:'open',name:'Open'}});tick=9;fail=false;await coordinator.observe({session:'one',info:{tick:9,replay:false}});assert.equal(captures,1);assert.deepEqual(stored,[0]);coordinator.close();
});
