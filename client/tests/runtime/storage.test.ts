import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalStore} from '../../src/runtime/storage';
import type {SaveData} from '../../src/runtime/types';
const metadata={simulation:'test',protocol:1,content_hash:'fixture',map_version:'1',ruleset:'standard-v2',seed:42};
const save:SaveData={data:new TextEncoder().encode('{"rng":18446744073709551615}'),tick:145,hash:'fixture',metadata,local_players:[1]};
const inspect=async(data:Uint8Array)=>{if(!data.length)throw new Error('bad save');return {metadata,tick:145}};
test('concurrent save edits have exactly one winner and preserve the conflict',async()=>{
 const a=new LocalStore('save-cas',inspect),b=new LocalStore('save-cas',inspect);
 await a.putSave('manual','Original',save);
 const writes=await Promise.allSettled([a.putSave('manual','A',save,1),b.putSave('manual','B',save,1)]);
 assert.equal(writes.filter(v=>v.status==='fulfilled').length,1);const rejected=writes.find(v=>v.status==='rejected');assert.equal(rejected?.status==='rejected'&&rejected.reason.code,'save_conflict');
 assert.equal((await a.getSave('manual'))?.revision,2);await assert.rejects(()=>a.deleteSave('manual',1),{code:'save_conflict'});await a.close();await b.close();
});
test('three autosaves rotate atomically without consuming manual saves',async()=>{
 const store=new LocalStore('autosaves',inspect);await store.putSave('keep','Keep',save);
 for(let i=0;i<7;i++)await store.autosave(save,`Auto ${i}`);
 const records=await store.listSaves();assert.equal(records.length,4);assert.equal(records.filter(r=>r.kind==='auto').length,3);assert.equal((await store.getSave('keep'))?.name,'Keep');await store.close();
});
test('export/import preserves exact large integer bytes and previews existing records',async()=>{
 const store=new LocalStore('export',inspect);await store.putSave('manual','Saved',save);
 const blob=await store.exportSave('manual'),preview=await store.previewImport(blob);assert.deepEqual(preview.save.data,save.data);assert.equal(preview.current?.revision,1);
 await assert.rejects(()=>store.putSave(preview.id,preview.name,preview.save),{code:'save_conflict'});
 const backup=JSON.parse(await(await store.backup()).text());assert.equal(backup.saves[0].engine,new TextDecoder().decode(save.data));await store.close();
});
test('settings use a separate revision and failed validation leaves saves untouched',async()=>{
 const store=new LocalStore('settings',inspect);await store.putSetting('controls',{preset:'classic'});await assert.rejects(()=>store.putSetting('controls',{preset:'modern'}),{code:'settings_conflict'});
 assert.deepEqual((await store.setting('controls'))?.data,{preset:'classic'});await assert.rejects(()=>store.putSave('bad','Bad',{...save,data:new Uint8Array()}));assert.equal((await store.listSaves()).length,0);await store.close();
});
