import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalStore} from '../../src/runtime/storage';
import type {SaveData} from '../../src/runtime/types';

const metadata={simulation:'test',protocol:1,content_hash:'fixture',map_version:'1',ruleset:'standard-v2',seed:42},save:SaveData={data:new TextEncoder().encode('{"tick":16000}'),tick:16000,hash:'fixture',metadata,local_players:[1]};
const inspect=async()=>({metadata,tick:16000});let sequence=0;
function fixture(){const name=`summary-cache-${++sequence}`,store=new LocalStore(name,inspect),other=new LocalStore(name,inspect);return {name,store,other,async close(){await store.close();await other.close()}}}
function trackPayloads(){const original=globalThis.structuredClone;let bytes=0;globalThis.structuredClone=((value:any,options?:StructuredSerializeOptions)=>{if(value?.data instanceof Uint8Array)bytes+=value.data.byteLength;return original(value,options)}) as typeof structuredClone;return {bytes:()=>bytes,reset(){bytes=0},restore(){globalThis.structuredClone=original}}}

test('unchanged menu summary reads clone zero payload bytes and callers cannot mutate the cached metadata',async()=>{
 const f=fixture();let probe:ReturnType<typeof trackPayloads>|undefined;
 try{
  await f.store.putSave('one','One',save);await f.store.putSave('two','Two',{...save,map_id:'copper-junction'});
  probe=trackPayloads();const first=await f.store.listSaveSummaries();assert.ok(probe.bytes()>=save.data.length*2);first[0].name='Edited';first[0].metadata.simulation='Edited';first[0].local_players[0]=4;
  probe.reset();const next=await f.store.listSaveSummaries();assert.equal(probe.bytes(),0,'repeated HomeMenu refreshes must read keys/revisions rather than every save body');assert.equal(next.some(value=>value.name==='Edited'),false);assert.equal(next[0].metadata.simulation,'test');assert.deepEqual(next[0].local_players,[1]);assert.equal(next.find(value=>value.id==='two')?.map_id,'copper-junction');assert.equal('data' in next[0],false);
 }finally{probe?.restore();await f.close()}
});

test('cross-tab overwrite, delete, recreate and autosave rotation invalidate cached summaries through existing CAS revisions',async()=>{
 const f=fixture();try{
  await f.store.putSave('slot','Original',save);await f.store.listSaveSummaries();await f.other.putSave('slot','Changed',save,1);assert.equal((await f.store.listSaveSummaries())[0].name,'Changed');
  await f.other.deleteSave('slot',2);assert.deepEqual(await f.store.listSaveSummaries(),[]);await f.other.putSave('slot','Recreated',save);assert.equal((await f.store.listSaveSummaries())[0].revision,3);
  for(let index=0;index<4;index++){await f.other.autosave(save,`Auto ${index}`);const rows=await f.store.listSaveSummaries();assert.equal(rows.filter(row=>row.kind==='auto').length,Math.min(index+1,3));assert.equal(rows.find(row=>row.id===`autosave-${index%3}`)?.name,`Auto ${index}`)}
 }finally{await f.close()}
});

test('backup restore and explicit import invalidate a warmed summary cache without changing save bytes',async()=>{
 const f=fixture(),source=new LocalStore(`summary-source-${sequence}`,inspect);try{
  await source.putSave('incoming','Incoming',save);await f.store.listSaveSummaries();const preview=await f.other.previewBackup(await source.backup());await f.other.restoreBackup(preview,preview.entries.map(entry=>({key:entry.key,action:'restore',expectedRevision:0})));assert.equal((await f.store.listSaveSummaries())[0].name,'Incoming');
  await f.store.listSaveSummaries();const incoming=await f.other.previewImport(await source.exportSave('incoming'));await f.other.putSave('copied','Imported copy',incoming.save);assert.equal((await f.store.listSaveSummaries()).length,2);assert.deepEqual((await f.store.getSave('incoming'))?.data,save.data);
 }finally{await source.close();await f.close()}
});

test('untracked legacy rows are reread instead of trusting a missing revision and closing releases cached summaries',async()=>{
 const f=fixture();let probe:ReturnType<typeof trackPayloads>|undefined;
 try{
  await f.store.listSaveSummaries();const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(f.name,3);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const write=async(name:string)=>new Promise<void>((resolve,reject)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put({...save,id:'untracked',name,kind:'manual',revision:1,updated:1});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)});
  await write('Old import');await f.store.listSaveSummaries();await write('Older writer changed it');assert.equal((await f.store.listSaveSummaries())[0].name,'Older writer changed it');db.close();
  await f.other.deleteSave('untracked',1);await f.store.putSave('known','Known',save);await f.store.listSaveSummaries();await f.store.close();probe=trackPayloads();await f.store.listSaveSummaries();assert.ok(probe.bytes()>0,'a closed/reopened owner cannot retain payload-independent caches forever');
 }finally{probe?.restore();await f.close()}
});

test('damaged summary metadata remains listable and original save bytes stay exportable',async()=>{
 const f=fixture();try{
  await f.other.putSave('damaged','Recoverable original',save);const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(f.name,3);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put({...save,id:'damaged',name:'Recoverable original',kind:'manual',revision:1,updated:1,metadata:undefined,local_players:undefined});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)});db.close();
  const rows=await f.store.listSaveSummaries();assert.equal(rows[0].name,'Recoverable original');assert.equal(rows[0].metadata?.ruleset,undefined);assert.deepEqual(new Uint8Array(await (await f.store.exportSaveBytes('damaged')).arrayBuffer()),save.data);
 }finally{await f.close()}
});

test('a close racing the first database open cannot retain summaries for the reopened owner',async()=>{
 const f=fixture();let probe:ReturnType<typeof trackPayloads>|undefined;
 try{
  await f.other.putSave('known','Known',save);const reading=f.store.listSaveSummaries(),closing=f.store.close();await Promise.all([reading,closing]);probe=trackPayloads();await f.store.listSaveSummaries();assert.ok(probe.bytes()>0,'the next owner must cold-read once after close raced open');
 }finally{probe?.restore();await f.close()}
});
