import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {LocalStore} from '../../src/runtime/storage';
import {TutorialInputMemory} from '../../src/app/tutorial-memory';
test('tutorial gesture memory merges tab updates, survives restart, isolates mission versions and never grants campaign progress',async()=>{
 const store=new LocalStore(`tutorial-memory-${crypto.randomUUID()}`,async()=>{throw Error('No simulation save should be requested')});
 try{const a=new TutorialInputMemory(store),b=new TutorialInputMemory(store);await Promise.all([a.record('tutorial-1','1','single_select'),b.record('tutorial-1','1','box_select'),a.record('tutorial-1','1','stop')]);assert.deepEqual(await new TutorialInputMemory(store).read('tutorial-1','1'),['box_select','single_select','stop']);assert.deepEqual(await a.read('tutorial-1','2'),[]);assert.deepEqual(await a.read('tutorial-2','1'),[]);await a.record('tutorial-1','1','victory');assert.deepEqual(await a.read('tutorial-1','1'),['box_select','single_select','stop']);assert.equal(await store.progress('campaign'),undefined)}finally{await store.close()}
});
test('incompatible tutorial memory stays preserved',async()=>{
 let writes=0;const data={version:2,mission:'tutorial-1',missionVersion:'1',skills:[]};const memory=new TutorialInputMemory({setting:async()=>({id:'x',revision:3,updated:1,data}) as any,putSetting:async()=>{writes++;throw Error('Must preserve')}});
 await assert.rejects(()=>memory.read('tutorial-1','1'),/incompatible/);await assert.rejects(()=>memory.record('tutorial-1','1','stop'),/incompatible/);assert.equal(writes,0);assert.equal(data.version,2);
});
