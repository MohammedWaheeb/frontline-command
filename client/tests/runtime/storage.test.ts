import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalStore} from '../../src/runtime/storage';
import {RuntimeError} from '../../src/runtime/errors';
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

test('backup restores saves/settings/progress/replays together with explicit decisions and exact bytes',async()=>{
 const replayInspect=async()=>({metadata,start_tick:0,end_tick:100,players:[1,2]});
 const source=new LocalStore('backup-complete-source',inspect,replayInspect),target=new LocalStore('backup-complete-target',inspect,replayInspect);
 await source.putSave('manual','Command post',save);await source.putSetting('controls',{preset:'classic'});await source.putProgress('campaign',{version:1,results:[],missions:{}});
 const bytes=new Uint8Array([0,255,1,2,128]);await source.putReplay('battle','Battle',bytes);
 const preview=await target.previewBackup(await source.backup());assert.equal(preview.entries.length,4);assert.equal(preview.preserveOriginal,false);
 const result=await target.restoreBackup(preview,preview.entries.map(entry=>({key:entry.key,action:'restore',expectedRevision:0})));
 assert.equal(result.restored.length,4);assert.deepEqual((await target.getSave('manual'))?.data,save.data);assert.deepEqual((await target.getReplay('battle'))?.data,bytes);
 assert.deepEqual((await target.setting('controls'))?.data,{preset:'classic'});assert.deepEqual((await target.progress('campaign'))?.data,{version:1,results:[],missions:{}});
 await assert.rejects(()=>target.restoreBackup(preview,[]),{code:'backup_preview_required'});await source.close();await target.close();
});

test('backup conflict aborts every selected write and keeps both versions available',async()=>{
 const source=new LocalStore('backup-conflict-source',inspect),target=new LocalStore('backup-conflict-target',inspect);
 await source.putSave('one','Incoming',save);await source.putSetting('controls',{preset:'classic'});await target.putSave('one','Local',save);
 const preview=await target.previewBackup(await source.backup());assert.equal(preview.entries[0].current?.name,'Local');
 await target.putSave('one','Newer local',save,1);
 const decisions=preview.entries.map(entry=>({key:entry.key,action:'restore' as const,expectedRevision:entry.current?.revision??0}));
 await assert.rejects(()=>target.restoreBackup(preview,decisions),{code:'backup_conflict'});
 assert.equal((await target.getSave('one'))?.name,'Newer local');assert.equal(await target.setting('controls'),undefined);
 const copy=await target.previewBackup(await source.backup());await target.restoreBackup(copy,copy.entries.map(entry=>entry.store==='saves'?{key:entry.key,action:'copy',id:'one-copy',expectedRevision:0}:{key:entry.key,action:'keep'}));
 assert.equal((await target.getSave('one-copy'))?.name,'Incoming');assert.equal((await target.getSave('one'))?.revision,2);await source.close();await target.close();
});

test('failed backup write rolls back earlier writes and never discards the source',async()=>{
 const source=new LocalStore('backup-abort-source',inspect),target=new LocalStore('backup-abort-target',inspect);
 await source.putSave('one','One',save);await source.putSetting('controls',{preset:'classic'});const file=await source.backup(),preview=await target.previewBackup(file);
 const original=IDBObjectStore.prototype.put;let writes=0;
 IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(++writes===2)throw new DOMException('full','QuotaExceededError');return original.apply(this,args)};
 try{await assert.rejects(()=>target.restoreBackup(preview,preview.entries.map(entry=>({key:entry.key,action:'restore',expectedRevision:0}))),{code:'storage_full'})}finally{IDBObjectStore.prototype.put=original}
 assert.equal((await target.listSaves()).length,0);assert.equal(await target.setting('controls'),undefined);assert.equal((await target.listRecoveryFiles()).length,0);
 await target.restoreBackup(preview,preview.entries.map(entry=>({key:entry.key,action:'restore',expectedRevision:0})));assert.equal((await target.listSaves()).length,1);await source.close();await target.close();
});

test('unsupported backup and mixed incompatible save preserve exact originals for later recovery',async()=>{
 const store=new LocalStore('backup-unsupported',async data=>{if(new TextDecoder().decode(data)==='future')throw new RuntimeError('save_version','new engine needed');return inspect(data)});
 const unknown=new Blob(['{ "format":"frontline-local-backup", "version":900, "future":18446744073709551615 }']);
 const preview=await store.previewBackup(unknown);assert.equal(preview.supported,false);const result=await store.restoreBackup(preview,[]);
 assert.ok(result.recoveryId);assert.equal(await(await store.exportRecovery(result.recoveryId!)).text(),await unknown.text());
 const backup={format:'frontline-local-backup',version:2,saves:[{id:'old',name:'Old',kind:'manual',revision:1,updated:1,local_players:[1],engine:'future'}],settings:[{id:'controls',revision:1,updated:1,data:{preset:'classic'}}]};
 const mixed=new Blob([JSON.stringify(backup)]),second=await store.previewBackup(mixed);assert.equal(second.entries[0].status,'unsupported');assert.equal(second.preserveOriginal,true);
 const restored=await store.restoreBackup(second,second.entries.map(entry=>({key:entry.key,action:entry.status==='ready'?'restore':'keep',expectedRevision:0})));
 assert.equal(restored.restored.length,1);assert.equal(await(await store.exportRecovery(restored.recoveryId!)).text(),await mixed.text());assert.equal((await store.listRecoveryFiles()).length,2);await store.close();
});

test('preview mutations cannot bypass validation or overwrite a revision not reviewed',async()=>{
 const source=new LocalStore('backup-private-source',inspect),target=new LocalStore('backup-private-target',inspect);await source.putSave('one','Incoming',save);await target.putSave('one','Original',save);
 const preview=await target.previewBackup(await source.backup());preview.entries[0].incoming.name='Tampered';preview.entries[0].current!.revision=8;
 await assert.rejects(()=>target.restoreBackup(preview,[{key:'saves:0',action:'restore',expectedRevision:8}]),{code:'backup_preview_stale'});
 await target.restoreBackup(preview,[{key:'saves:0',action:'restore',expectedRevision:1}]);assert.equal((await target.getSave('one'))?.name,'Incoming');await source.close();await target.close();
});

test('replay validation is bounded, integrity checked, CAS protected, and corrupt files remain exportable',async()=>{
 let inspections=0;const store=new LocalStore('replay-checks',inspect,async()=>{inspections++;return {metadata,start_tick:0,end_tick:40,players:[1,2]}});
 const bytes=new Uint8Array([0,1,2,255]);const record=await store.putReplay('match','Match',bytes);assert.equal(record.sha256.length,64);bytes[0]=99;
 assert.deepEqual(new Uint8Array(await(await store.exportReplay('match')).arrayBuffer()),new Uint8Array([0,1,2,255]));
 await assert.rejects(()=>store.putReplay('match','Conflict',new Uint8Array([3])),{code:'replay_conflict'});await assert.rejects(()=>store.putReplay('empty','Empty',new Uint8Array()),{code:'replay_too_large'});assert.equal(inspections,2);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('replay-checks',3);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('replays','readwrite');tx.objectStore('replays').put({...record,data:new Uint8Array([7])});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)});db.close();
 await assert.rejects(()=>store.getReplay('match'),{code:'replay_corrupt'});assert.deepEqual(new Uint8Array(await(await store.exportReplay('match')).arrayBuffer()),new Uint8Array([7]));await store.close();
});

test('schema upgrade preserves version-one saves and future databases are never downgraded',async()=>{
 const open=(name:string,version:number,upgrade?:(db:IDBDatabase)=>void)=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade?.(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 const db=await open('legacy-database',1,db=>{for(const name of ['saves','settings','meta','progress','replays'])db.createObjectStore(name,{keyPath:'id'})});
 await new Promise<void>(resolve=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').add({...save,id:'legacy',name:'Legacy',revision:3,updated:1,kind:'manual'});tx.oncomplete=()=>resolve()});db.close();
 const store=new LocalStore('legacy-database',inspect);assert.equal((await store.getSave('legacy'))?.revision,3);assert.deepEqual((await store.getSave('legacy'))?.data,save.data);await store.close();
 const future=await open('future-database',4,db=>db.createObjectStore('future'));future.close();const oldClient=new LocalStore('future-database',inspect);await assert.rejects(()=>oldClient.listSaves(),{code:'storage_incompatible'});const stillFuture=await open('future-database',4);assert.equal(stillFuture.objectStoreNames.contains('future'),true);stillFuture.close();
});

test('settings reject malformed JSON, byte limits and invalid revisions without replacing existing data',async()=>{
 const store=new LocalStore('settings-validation',inspect);await store.putSetting('controls',{preset:'classic'});const circular:any={};circular.self=circular;
 await assert.rejects(()=>store.putSetting('controls',circular,1),{code:'settings_invalid'});await assert.rejects(()=>store.putSetting('controls',undefined,1),{code:'settings_invalid'});await assert.rejects(()=>store.putSetting('controls','界'.repeat(15000),1),{code:'settings_invalid'});await assert.rejects(()=>store.putSetting('controls',{},-1),{code:'invalid_revision'});
 assert.deepEqual((await store.setting('controls'))?.data,{preset:'classic'});await store.close();
});

test('an unreadable backup can be kept byte for byte without replacing current records',async()=>{
 const store=new LocalStore('backup-unreadable',inspect);await store.putSave('one','One',save);const bytes=new Uint8Array([0xff,0,128,1]);const preview=await store.previewBackup(new Blob([bytes]));assert.equal(preview.supported,false);assert.match(preview.message!,/unreadable/);
 const result=await store.restoreBackup(preview,[]);assert.deepEqual(new Uint8Array(await(await store.exportRecovery(result.recoveryId!)).arrayBuffer()),bytes);assert.equal((await store.listSaves()).length,1);await store.close();
});

test('deleted save and replay IDs never reuse revisions across tabs and reopen',async()=>{
 const replayInspect=async()=>({metadata,start_tick:0,end_tick:40,players:[1]});let store=new LocalStore('aba-files',inspect,replayInspect);const other=new LocalStore('aba-files',inspect,replayInspect);
 const old=await store.putSave('slot','Old',save);await store.deleteSave('slot',old.revision);assert.equal(await store.getSave('slot'),undefined);await store.close();store=new LocalStore('aba-files',inspect,replayInspect);
 const created=await store.putSave('slot','Recreated',save,0);assert.equal(created.revision,2);await assert.rejects(()=>other.putSave('slot','Stale',save,old.revision),{code:'save_conflict'});await assert.rejects(()=>other.deleteSave('slot',old.revision),{code:'save_conflict'});assert.equal((await store.getSave('slot'))?.name,'Recreated');
 await store.putReplay('battle','Old',new Uint8Array([1]));await store.deleteReplay('battle',1);assert.equal((await store.putReplay('battle','New',new Uint8Array([2]),0)).revision,2);await assert.rejects(()=>other.putReplay('battle','Stale',new Uint8Array([3]),1),{code:'replay_conflict'});await assert.rejects(()=>other.deleteReplay('battle',1),{code:'replay_conflict'});await store.close();await other.close();
});
test('atomic backup CAS rejects delete/recreate races; backup restore and autosave respect tombstones',async()=>{
 const source=new LocalStore('aba-backup-source',inspect),target=new LocalStore('aba-backup-target',inspect);await source.putSave('slot','Incoming',save);await target.putSave('slot','Original',save);const file=await source.backup(),preview=await target.previewBackup(file);await target.deleteSave('slot',1);await target.putSave('slot','Recreated',save,0);
 await assert.rejects(()=>target.restoreBackup(preview,[{key:preview.entries[0].key,action:'restore',expectedRevision:1}]),{code:'backup_conflict'});await target.deleteSave('slot',2);const fresh=await target.previewBackup(file);const result=await target.restoreBackup(fresh,[{key:fresh.entries[0].key,action:'restore',expectedRevision:0}]);assert.equal(result.restored[0].revision,3);
 await target.autosave(save);await target.deleteSave('autosave-0',1);await target.autosave(save);await target.autosave(save);assert.equal((await target.autosave(save)).revision,2);await source.close();await target.close();
});
test('legacy revisions migrate to durable high-water marks without rewriting their bytes',async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('legacy-aba',2);r.onupgradeneeded=()=>{for(const name of ['saves','settings','progress','replays','meta','recovery'])r.result.createObjectStore(name,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise<void>(resolve=>{const tx=db.transaction(['saves','settings'],'readwrite');tx.objectStore('saves').put({...save,id:'slot',name:'Legacy',revision:27,updated:1,kind:'manual'});tx.objectStore('settings').put({id:'controls',data:{preset:'classic'},revision:8,updated:1});tx.oncomplete=()=>resolve()});db.close();const store=new LocalStore('legacy-aba',inspect);
 assert.deepEqual((await store.getSave('slot'))?.data,save.data);await store.deleteSave('slot',27);assert.equal((await store.putSave('slot','Again',save)).revision,28);assert.equal((await store.putSetting('controls',{},8)).revision,9);await store.close();
});
test('revision exhaustion fails safely and never wraps an existing save',async()=>{
 const store=new LocalStore('revision-limit',inspect);await store.putSave('slot','Initial',save);await store.close();const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('revision-limit',3);r.onsuccess=()=>resolve(r.result)});await new Promise<void>(resolve=>{const tx=db.transaction('revisions','readwrite');tx.objectStore('revisions').put({key:['saves','slot'],revision:Number.MAX_SAFE_INTEGER});tx.oncomplete=()=>resolve()});db.close();await assert.rejects(()=>store.putSave('slot','Overflow',save,1),{code:'revision_exhausted'});assert.equal((await store.getSave('slot'))?.name,'Initial');await store.close();
});

test('campaign backup validation preserves malformed story originals without replacing a supported local ledger',async()=>{
 const store=new LocalStore('backup-campaign-schema',inspect);const valid={version:1,results:[],missions:{}};await store.putProgress('campaign',valid);const file=new Blob([JSON.stringify({format:'frontline-local-backup',version:2,progress:[{id:'campaign',schema_version:1,revision:1,updated:1000,data:{version:1,results:['same','same'],missions:{}}}]})]);const preview=await store.previewBackup(file);assert.equal(preview.entries[0].status,'invalid');assert.equal(preview.preserveOriginal,true);await assert.rejects(()=>store.restoreBackup(preview,[{key:preview.entries[0].key,action:'restore',expectedRevision:1}]),{code:'backup_invalid_decision'});const result=await store.restoreBackup(preview,[{key:preview.entries[0].key,action:'keep'}]);assert.deepEqual((await store.progress('campaign'))?.data,valid);assert.equal(await (await store.exportRecovery(result.recoveryId!)).text(),await file.text());await store.close();
});

test('browser backup streams cursor records without retaining all raw archive payloads',async()=>{
 const store=new LocalStore('backup-cursor-bounds',inspect);for(let index=0;index<70;index++)await store.putSave(`save-${index}`,`Save ${index}`,save);await store.putProgress('campaign',{version:1,results:[],missions:{}});const original=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(){throw Error('Full-payload archive read forbidden during export')};let file:Blob;try{file=await store.backup()}finally{IDBObjectStore.prototype.getAll=original}const value=JSON.parse(await file!.text());assert.equal(value.saves.length,70);assert.ok(value.saves.every((record:any)=>record.engine==='{"rng":18446744073709551615}'));assert.deepEqual(value.progress[0].data,{version:1,results:[],missions:{}});assert.equal(value.settings.length,0);assert.equal(value.replays.length,0);await store.close();
});
