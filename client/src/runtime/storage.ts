import {sha256Hex as digest,randomUUID} from './crypto';
import {REVISION_STORE,upgradeRevisions,reserveRevision} from './idb-revisions';
import {RuntimeError} from './errors';
import {validateCampaignProgress,type CampaignProgress} from './progress';
import {COMMANDER_PROGRESS_ID,validateCommanderProgress,mergeCommanderProgress,type CommanderProgress} from './commander-progress';
import type {EngineMetadata,SaveData,ReplayLobby} from './types';

export interface LocalSave extends SaveData{id:string;name:string;revision:number;updated:number;kind:'manual'|'auto';mission?:string}
export type LocalSaveSummary=Omit<LocalSave,'data'>&{bytes:number};
export interface LocalSetting<T=unknown>{id:string;revision:number;updated:number;data:T}
export interface LocalProgress<T=unknown> extends LocalSetting<T>{schema_version:1}
export type SaveInspector=(data:Uint8Array)=>Promise<{metadata:EngineMetadata;tick:number}>;
export interface ReplayInspection{metadata:EngineMetadata;start_tick:number;end_tick:number;players:number[];lobby?:ReplayLobby}
export type ReplayInspector=(data:Uint8Array)=>Promise<ReplayInspection>;
export interface LocalReplay extends ReplayInspection{id:string;name:string;revision:number;updated:number;sha256:string;data:Uint8Array}
export interface RecoveryFile{id:string;name:string;created:number;reason:string;data:Blob}
interface StoredRecoveryFile extends Omit<RecoveryFile,'data'>{data:Uint8Array|Blob;mime?:string}
export type BackupStore='saves'|'settings'|'progress'|'replays';
export interface BackupRecordSummary{id:string;name?:string;revision:number;updated:number;tick?:number;metadata?:EngineMetadata;data?:unknown}
export interface BackupEntry{key:string;store:BackupStore;incoming:BackupRecordSummary;current?:BackupRecordSummary;status:'ready'|'unsupported'|'invalid';message?:string}
export interface BackupPreview{version:number;supported:boolean;created?:number;entries:BackupEntry[];preserveOriginal:boolean;message?:string}
export type RestoreDecision={key:string;action:'keep'}|{key:string;action:'restore'|'copy';id?:string;name?:string;expectedRevision:number};
export interface RestoreResult{restored:Array<{store:BackupStore;id:string;revision:number}>;kept:number;recoveryId?:string}
type StoredRecord=LocalSave|LocalSetting|LocalProgress|LocalReplay;
interface PreviewState{file:Blob;records:Map<string,StoredRecord>;entries:BackupEntry[];supported:boolean;preserveOriginal:boolean}
const MAX_SAVE=64*1024*1024,MAX_REPLAY=64*1024*1024,MAX_BACKUP=256*1024*1024,MAX_RECORDS=10000;
const stores:BackupStore[]=['saves','settings','progress','replays'];
const previews=new WeakMap<BackupPreview,PreviewState>();

function storageError(error:unknown){
 if(error instanceof RuntimeError)return error;
 const name=error&&typeof error==='object'&&'name' in error?String(error.name):'';
 if(name==='VersionError')return new RuntimeError('storage_incompatible','This browser database was created by a newer game version. Use that version to export or recover it.');
 return new RuntimeError(name==='QuotaExceededError'?'storage_full':'storage_unavailable',name==='QuotaExceededError'?'Browser storage is full. Export a backup before choosing older files to remove.':'Browser storage could not be accessed. Existing files have not been overwritten.',true,error);
}
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(storageError(r.error))})}
function completed(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(storageError(tx.error));tx.onerror=()=>{/* abort reports the transaction error */}})}
function validID(id:string){if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(id))throw new RuntimeError('invalid_record_id','Use a local ID of 1–100 letters, numbers, dots, hyphens, or underscores.')}
function validName(id:string,name:string){validID(id);if(typeof name!=='string'||!name.trim()||name.length>100)throw new RuntimeError('invalid_save_name','Use a save name of 1–100 characters.')}
function revision(value:number){if(!Number.isSafeInteger(value)||value<0)throw new RuntimeError('invalid_revision','Choose the revision you reviewed before saving.')}
function conflict(current:unknown,kind='save'){return new RuntimeError(`${kind}_conflict`,'This local record has changed. Compare both versions before choosing which to keep.',true,{current})}
function jsonData<T>(data:T,maximum:number,code:string):T{
 let text:string|undefined;try{text=JSON.stringify(data)}catch{throw new RuntimeError(code,'This record must contain readable JSON data.')}
 if(text===undefined||new TextEncoder().encode(text).length>maximum)throw new RuntimeError(code,'This record exceeds the local data limit.');
 return JSON.parse(text) as T;
}
function safeTick(value:number){return Number.isSafeInteger(value)&&value>=0}
function summary(record:StoredRecord):BackupRecordSummary{
 const value:BackupRecordSummary={id:record.id,revision:record.revision,updated:record.updated};
 if('name' in record)value.name=record.name;
 if('tick' in record)value.tick=record.tick;
 if('metadata' in record)value.metadata=structuredClone(record.metadata);
 if(!('name' in record))value.data=structuredClone(record.data);
 return value;
}
function encodeBytes(data:Uint8Array){let result='';for(let start=0;start<data.length;start+=32768)result+=String.fromCharCode(...data.subarray(start,start+32768));return btoa(result)}
function decodeBytes(value:unknown,maximum:number){
 if(typeof value!=='string'||value.length>Math.ceil(maximum/3)*4||value.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new RuntimeError('replay_corrupt','This replay does not contain valid binary data.');
 const text=atob(value);if(text.length>maximum)throw new RuntimeError('replay_too_large','This replay is larger than 64 MiB.');return Uint8Array.from(text,c=>c.charCodeAt(0));
}
function incompatible(error:unknown){return /version|incompatible|unsupported|content/.test(error instanceof RuntimeError?error.code:'')}

export class LocalStore {
 private db:Promise<IDBDatabase>|undefined;
 constructor(readonly name='frontline-command',private readonly inspect?:SaveInspector,private readonly inspectReplay?:ReplayInspector){}
 private open(){
  if(this.db)return this.db;
  this.db=new Promise<IDBDatabase>((resolve,reject)=>{
   if(!globalThis.indexedDB){reject(new RuntimeError('storage_unavailable','This browser does not provide local game storage.'));return}
   const r=indexedDB.open(this.name,3);let blocked=false;
   r.onupgradeneeded=()=>{for(const name of [...stores,'meta','recovery'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});upgradeRevisions(r.result,r.transaction!,stores.map(name=>({name})))};
   r.onerror=()=>reject(storageError(r.error));
   r.onblocked=()=>{blocked=true;reject(new RuntimeError('storage_busy','Close another open game tab before changing the save database.'))};
   r.onsuccess=()=>{if(blocked){r.result.close();return}r.result.onversionchange=()=>{r.result.close();this.db=undefined};resolve(r.result)};
  }).catch(error=>{this.db=undefined;throw error});return this.db;
 }
 async close(){if(this.db)(await this.db).close();this.db=undefined}
 async listSaves():Promise<LocalSave[]>{const db=await this.open();const values=await request(db.transaction('saves').objectStore('saves').getAll()) as LocalSave[];return values.sort((a,b)=>b.updated-a.updated||a.id.localeCompare(b.id))}
 /** Lists archive metadata one cursor record at a time; never retains every engine payload. */
 async listSaveSummaries():Promise<LocalSaveSummary[]>{
  const db=await this.open();return new Promise((resolve,reject)=>{const values:LocalSaveSummary[]=[],transaction=db.transaction('saves'),request=transaction.objectStore('saves').openCursor();transaction.onabort=()=>reject(storageError(transaction.error));transaction.onerror=()=>reject(storageError(transaction.error));transaction.oncomplete=()=>resolve(values.sort((a,b)=>b.updated-a.updated||a.id.localeCompare(b.id)));request.onerror=()=>reject(storageError(request.error));request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const {data,...record}=cursor.value as LocalSave;values.push({...record,bytes:data.byteLength});cursor.continue()}});
 }
 async getSave(id:string):Promise<LocalSave|undefined>{const db=await this.open();return request(db.transaction('saves').objectStore('saves').get(id))}
 private async checked(save:SaveData){
  if(!this.inspect)throw new RuntimeError('validator_missing','Start the Go engine to validate a save before storing it.');
  if(!(save.data instanceof Uint8Array)||save.data.length===0||save.data.length>MAX_SAVE||!Array.isArray(save.local_players)||save.local_players.length<1||save.local_players.length>4||new Set(save.local_players).size!==save.local_players.length||save.local_players.some(id=>!Number.isInteger(id)||id<1||id>4))throw new RuntimeError('save_invalid','The local save is malformed.');
  // Copy before awaiting the validator: the caller cannot change the inspected bytes.
  const data=save.data.slice(),local_players=[...save.local_players],hash=typeof save.hash==='string'?save.hash:'';
  const inspected=await this.inspect(data.slice());if(!safeTick(inspected.tick))throw new RuntimeError('save_invalid','The save contains an invalid simulation tick.');
  return {data,local_players,hash,metadata:structuredClone(inspected.metadata),tick:inspected.tick};
 }
 async putSave(id:string,name:string,save:SaveData,expectedRevision=0):Promise<LocalSave>{
  validName(id,name);revision(expectedRevision);if(id.startsWith('autosave-'))throw new RuntimeError('reserved_save_id','Choose a manual save ID.');
  const checked=await this.checked(save);return this.putRecord('saves',{...checked,id,name:name.trim(),kind:'manual',revision:0,updated:0},expectedRevision) as Promise<LocalSave>;
 }
 async autosave(save:SaveData,name='Autosave'):Promise<LocalSave>{
  validName('autosave',name);const checked=await this.checked(save),db=await this.open(),tx=db.transaction(['saves','meta',REVISION_STORE],'readwrite'),done=completed(tx);done.catch(()=>{});
  try{
   const meta=tx.objectStore('meta'),counter=await request(meta.get('autosave-counter')) as {id:string;value:number}|undefined;
   const index=(counter?.value??0)%3,id=`autosave-${index}`,store=tx.objectStore('saves'),prior=await request(store.get(id)) as LocalSave|undefined;
   const result:LocalSave={...checked,id,name:name.trim(),kind:'auto',revision:await reserveRevision(tx,'saves',id,prior?.revision??0),updated:Date.now()};store.put(result);meta.put({id:'autosave-counter',value:(index+1)%3});await done;return result;
  }catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
 async deleteSave(id:string,expectedRevision:number){return this.deleteRecord('saves',id,expectedRevision)}
 async setting<T=unknown>(id:string):Promise<LocalSetting<T>|undefined>{const db=await this.open();return request(db.transaction('settings').objectStore('settings').get(id))}
 async putSetting<T>(id:string,data:T,expectedRevision=0):Promise<LocalSetting<T>>{
  validID(id);revision(expectedRevision);const checked=jsonData(data,32768,'settings_invalid');
  return this.putRecord('settings',{id,data:checked,revision:0,updated:0},expectedRevision) as Promise<LocalSetting<T>>;
 }
 async progress<T=unknown>(id:string):Promise<LocalProgress<T>|undefined>{const db=await this.open();return request(db.transaction('progress').objectStore('progress').get(id))}
 async putProgress<T>(id:string,data:T,expectedRevision=0):Promise<LocalProgress<T>>{
  validID(id);revision(expectedRevision);const checked=jsonData(data,256*1024,'progress_invalid');
  return this.putRecord('progress',{id,schema_version:1,data:checked,revision:0,updated:0},expectedRevision) as Promise<LocalProgress<T>>;
 }
 private async putRecord(storeName:BackupStore,record:StoredRecord,expectedRevision:number):Promise<StoredRecord>{
  const db=await this.open(),tx=db.transaction([storeName,REVISION_STORE],'readwrite'),done=completed(tx);done.catch(()=>{});
  try{const store=tx.objectStore(storeName),current=await request(store.get(record.id)) as StoredRecord|undefined;if((current?.revision??0)!==expectedRevision){tx.abort();throw conflict(current,storeName==='saves'?'save':storeName==='settings'?'settings':storeName==='replays'?'replay':'progress')}const result={...record,revision:await reserveRevision(tx,storeName,record.id,current?.revision??0),updated:Date.now()};store.put(result);await done;return result}
  catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
 private async deleteRecord(storeName:BackupStore,id:string,expectedRevision:number){
  validID(id);revision(expectedRevision);const db=await this.open(),tx=db.transaction([storeName,REVISION_STORE],'readwrite'),done=completed(tx);done.catch(()=>{});
  try{const store=tx.objectStore(storeName),current=await request(store.get(id)) as StoredRecord|undefined;if(!current||current.revision!==expectedRevision){tx.abort();throw conflict(current,storeName==='replays'?'replay':'save')}await reserveRevision(tx,storeName,id,current.revision,false);store.delete(id);await done}
  catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
 async exportSave(id:string):Promise<Blob>{const record=await this.getSave(id);if(!record)throw new RuntimeError('save_missing','This local save no longer exists.');return new Blob([JSON.stringify({format:'frontline-local-save',version:1,id:record.id,name:record.name,local_players:record.local_players,hash:record.hash,engine:new TextDecoder('utf-8',{fatal:true}).decode(record.data)})],{type:'application/json'})}
 async exportSaveBytes(id:string):Promise<Blob>{const record=await this.getSave(id);if(!record)throw new RuntimeError('save_missing','This local save no longer exists.');return new Blob([record.data.slice().buffer],{type:'application/octet-stream'})}
 async previewImport(file:Blob):Promise<{id:string;name:string;save:SaveData;current?:LocalSave}>{
  if(file.size>96*1024*1024)throw new RuntimeError('save_too_large','The save export is larger than 96 MiB.');
  let value:any;try{value=JSON.parse(await file.text())}catch{throw new RuntimeError('save_corrupt','This file is not a readable local save export.')}
  if(value?.format!=='frontline-local-save'||value.version!==1||typeof value.engine!=='string')throw new RuntimeError('save_incompatible','This export version is unsupported. Keep the file for a matching game version.');
  validName(value.id,value.name);const data=new TextEncoder().encode(value.engine);
  const save=await this.checked({data,local_players:value.local_players,hash:typeof value.hash==='string'?value.hash:'',tick:0,metadata:{} as EngineMetadata});
  return {id:value.id,name:value.name,save,current:await this.getSave(value.id)};
 }
 private async checkedReplay(data:Uint8Array):Promise<ReplayInspection&{data:Uint8Array;sha256:string}>{
  if(!this.inspectReplay)throw new RuntimeError('validator_missing','Start the Go engine to validate a replay before storing it.');
  if(!(data instanceof Uint8Array)||data.length===0||data.length>MAX_REPLAY)throw new RuntimeError('replay_too_large','Choose a nonempty replay no larger than 64 MiB.');
  const bytes=data.slice(),checked=await this.inspectReplay(bytes.slice());
  if(!safeTick(checked.start_tick)||!safeTick(checked.end_tick)||checked.end_tick<checked.start_tick||!Array.isArray(checked.players)||checked.players.length<1||checked.players.length>4||new Set(checked.players).size!==checked.players.length||checked.players.some(id=>!Number.isInteger(id)||id<1||id>4))throw new RuntimeError('replay_invalid','The replay timeline or player list is invalid.');
  return {...structuredClone(checked),data:bytes,sha256:await digest(bytes)};
 }
 async putReplay(id:string,name:string,data:Uint8Array,expectedRevision=0):Promise<LocalReplay>{
  validName(id,name);revision(expectedRevision);const checked=await this.checkedReplay(data);return this.putRecord('replays',{...checked,id,name:name.trim(),revision:0,updated:0},expectedRevision) as Promise<LocalReplay>;
 }
 async listReplays():Promise<Array<Omit<LocalReplay,'data'>>>{
  const db=await this.open();return new Promise((resolve,reject)=>{const values:Array<Omit<LocalReplay,'data'>>=[],transaction=db.transaction('replays'),request=transaction.objectStore('replays').openCursor();transaction.onabort=()=>reject(storageError(transaction.error));transaction.onerror=()=>reject(storageError(transaction.error));transaction.oncomplete=()=>resolve(values.sort((a,b)=>b.updated-a.updated||a.id.localeCompare(b.id)));request.onerror=()=>reject(storageError(request.error));request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const {data,...record}=cursor.value as LocalReplay;values.push(record);cursor.continue()}});
 }
 async getReplay(id:string):Promise<LocalReplay|undefined>{
  const db=await this.open(),record=await request(db.transaction('replays').objectStore('replays').get(id)) as LocalReplay|undefined;
  if(record&&await digest(record.data)!==record.sha256)throw new RuntimeError('replay_corrupt','This stored replay failed its integrity check. Export its original bytes for recovery.');return record;
 }
 async deleteReplay(id:string,expectedRevision:number){return this.deleteRecord('replays',id,expectedRevision)}
 async exportReplay(id:string):Promise<Blob>{const db=await this.open(),record=await request(db.transaction('replays').objectStore('replays').get(id)) as LocalReplay|undefined;if(!record)throw new RuntimeError('replay_missing','This replay no longer exists.');return new Blob([record.data.slice().buffer],{type:'application/octet-stream'})}
 async preserveRecovery(file:Blob,name:string,reason:string):Promise<RecoveryFile>{
  if(!(file instanceof Blob)||file.size>MAX_BACKUP)throw new RuntimeError('backup_too_large','Recovery files must be no larger than 256 MiB.');
  validName('recovery',name);if(typeof reason!=='string'||reason.length>2000)throw new RuntimeError('recovery_invalid','Provide a short description of the recovery file.');
  const record:RecoveryFile={id:`recovery-${randomUUID()}`,name:name.trim(),created:Date.now(),reason,data:file.slice()};
  const stored:StoredRecoveryFile={...record,data:new Uint8Array(await file.arrayBuffer()),mime:file.type};
  const db=await this.open(),tx=db.transaction('recovery','readwrite'),done=completed(tx);done.catch(()=>{});
  try{tx.objectStore('recovery').add(stored);await done;return record}catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
 async listRecoveryFiles():Promise<Array<Omit<RecoveryFile,'data'>&{bytes:number}>>{const db=await this.open(),records=await request(db.transaction('recovery').objectStore('recovery').getAll()) as StoredRecoveryFile[];return records.map(({data,mime,...record})=>({...record,bytes:data instanceof Blob?data.size:data.byteLength})).sort((a,b)=>b.created-a.created)}
 async exportRecovery(id:string):Promise<Blob>{const db=await this.open(),record=await request(db.transaction('recovery').objectStore('recovery').get(id)) as StoredRecoveryFile|undefined;if(!record)throw new RuntimeError('recovery_missing','This recovery file no longer exists.');return record.data instanceof Blob?record.data.slice():new Blob([record.data.slice().buffer],{type:record.mime??'application/octet-stream'})}
 async deleteRecovery(id:string){validID(id);const db=await this.open(),tx=db.transaction('recovery','readwrite'),done=completed(tx);done.catch(()=>{});try{tx.objectStore('recovery').delete(id);await done}catch(error){try{tx.abort()}catch{}throw storageError(error)}}
 async backup():Promise<Blob>{
  const db=await this.open();
  // Serialize one cursor record at a time into bounded Blob parts. A large
  // archive must fail before getAll/stringify can retain every engine payload.
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(stores),parts:Blob[]=[],encoder=new TextEncoder();let bytes=0,records=0,failed=false;
   const stop=(error:unknown)=>{if(failed)return;failed=true;try{tx.abort()}catch{}reject(storageError(error))};
   const append=(value:string)=>{bytes+=encoder.encode(value).byteLength;if(bytes>MAX_BACKUP)throw new RuntimeError('backup_too_large','This backup exceeds 256 MiB. Export individual saves and replays first.');parts.push(new Blob([value]))};
   tx.onabort=()=>stop(tx.error);tx.onerror=()=>{/* abort reports errors */};tx.oncomplete=()=>{if(!failed)resolve(new Blob(parts,{type:'application/json'}))};
   const readStore=(index:number)=>{
    try{if(index===stores.length){append('}');return}const name=stores[index];append(`,"${name}":[`);let first=true;const cursor=tx.objectStore(name).openCursor();
     cursor.onerror=()=>stop(cursor.error);cursor.onsuccess=()=>{try{const next=cursor.result;if(!next){append(']');readStore(index+1);return}if(++records>MAX_RECORDS)throw new RuntimeError('backup_too_large','This backup exceeds 10,000 records. Export individual saves and replays first.');const record=next.value as StoredRecord;let value:unknown=record;if(name==='saves'){const save=record as LocalSave;value={...save,data:undefined,engine:new TextDecoder('utf-8',{fatal:true}).decode(save.data)}}else if(name==='replays'){const replay=record as LocalReplay;value={...replay,data:undefined,binary:encodeBytes(replay.data)}}append((first?'':',')+JSON.stringify(value));first=false;next.continue()}catch(error){stop(error)}};
    }catch(error){stop(error)}
   };
   try{append(JSON.stringify({format:'frontline-local-backup',version:2,created:Date.now()}).slice(0,-1));readStore(0)}catch(error){stop(error)}
  });
 }
 async previewBackup(file:Blob):Promise<BackupPreview>{
  if(!(file instanceof Blob)||file.size>MAX_BACKUP)throw new RuntimeError('backup_too_large','Choose a backup no larger than 256 MiB.');
  let value:any,unreadable=false;try{value=JSON.parse(await file.text())}catch{unreadable=true}
  if(value?.format!=='frontline-local-backup'||![1,2].includes(value.version)){
   const preview:BackupPreview={version:Number.isInteger(value?.version)?value.version:0,supported:false,entries:[],preserveOriginal:true,message:unreadable?'This backup is unreadable. Retain its original bytes for recovery.':'This backup version is unsupported. Its original bytes can be retained for a matching game version.'};
   previews.set(preview,{file:file.slice(),records:new Map(),entries:[],supported:false,preserveOriginal:true});return preview;
  }
  let total=0;for(const name of stores){const values=value[name]??[];if(!Array.isArray(values)||total+values.length>MAX_RECORDS)throw new RuntimeError('backup_invalid','The backup has too many records or an invalid record list.');total+=values.length}
  const db=await this.open(),tx=db.transaction(stores),done=completed(tx);done.catch(()=>{});const currentLists=await Promise.all(stores.map(name=>request(tx.objectStore(name).getAll()))) as StoredRecord[][];await done;
  const current=new Map(stores.map((name,index)=>[name,new Map(currentLists[index].map(record=>[record.id,record]))]));
  const records=new Map<string,StoredRecord>(),entries:BackupEntry[]=[];let preserveOriginal=false;
  for(const store of stores){let index=0;for(const raw of value[store]??[]){const key=`${store}:${index++}`;let record:StoredRecord|undefined,error:unknown;
   try{
    if(!raw||typeof raw!=='object')throw new RuntimeError('backup_invalid','This record is malformed.');validID(raw.id);revision(raw.revision);if(raw.revision<1||!safeTick(raw.updated))throw new RuntimeError('backup_invalid','This record has invalid revision metadata.');
    if(store==='saves'){
     validName(raw.id,raw.name);if(typeof raw.engine!=='string'||!['manual','auto'].includes(raw.kind)||(raw.kind==='auto'?!/^autosave-[0-2]$/.test(raw.id):raw.id.startsWith('autosave-')))throw new RuntimeError('save_invalid','The save record is malformed.');
     const checked=await this.checked({data:new TextEncoder().encode(raw.engine),local_players:raw.local_players,hash:raw.hash,tick:0,metadata:{} as EngineMetadata});
     record={...checked,id:raw.id,name:raw.name,revision:raw.revision,updated:raw.updated,kind:raw.kind};
    }else if(store==='replays'){
     validName(raw.id,raw.name);const checked=await this.checkedReplay(decodeBytes(raw.binary,MAX_REPLAY));if(checked.sha256!==raw.sha256)throw new RuntimeError('replay_corrupt','This replay failed its integrity check.');record={...checked,id:raw.id,name:raw.name,revision:raw.revision,updated:raw.updated};
    }else{
     if(store==='progress'&&raw.schema_version!==1)throw new RuntimeError('progress_incompatible','This progress version needs a matching game version.');
     if(store==='progress'&&raw.id==='campaign')validateCampaignProgress(raw.data as CampaignProgress);
     if(store==='progress'&&raw.id===COMMANDER_PROGRESS_ID)validateCommanderProgress(raw.data);
     record={id:raw.id,revision:raw.revision,updated:raw.updated,data:jsonData(raw.data,store==='settings'?32768:256*1024,`${store}_invalid`),...(store==='progress'?{schema_version:1 as const}:{})};
    }
   }catch(cause){error=cause;preserveOriginal=true}
   const valid=record!==undefined,incoming=record?summary(record):{id:typeof raw?.id==='string'?raw.id:'invalid',name:typeof raw?.name==='string'?raw.name:undefined,revision:Number.isSafeInteger(raw?.revision)?raw.revision:0,updated:safeTick(raw?.updated)?raw.updated:0};
   const existing=current.get(store)?.get(incoming.id);entries.push({key,store,incoming,current:existing?summary(existing):undefined,status:valid?'ready':incompatible(error)?'unsupported':'invalid',message:error instanceof Error?error.message:undefined});if(record)records.set(key,record);
  }}
  const preview:BackupPreview={version:value.version,supported:true,created:safeTick(value.created)?value.created:undefined,entries,preserveOriginal};
  // Keep an independent plan; UI edits to the visible preview cannot bypass validation.
  previews.set(preview,{file:file.slice(),records,entries:structuredClone(entries),supported:true,preserveOriginal});return preview;
 }
 async restoreBackup(preview:BackupPreview,decisions:RestoreDecision[],recoveryName='Imported backup'):Promise<RestoreResult>{
  const state=previews.get(preview);if(!state)throw new RuntimeError('backup_preview_required','Preview this backup in the current session before restoring it.');
  if(!Array.isArray(decisions)||decisions.length!==state.entries.length)throw new RuntimeError('backup_decision_required','Choose whether to keep, restore, or copy every backup record.');
  const selected=new Map<string,RestoreDecision>();for(const decision of decisions){if(!decision||selected.has(decision.key))throw new RuntimeError('backup_invalid_decision','Choose each backup record exactly once.');selected.set(decision.key,decision)}
  const writes:Array<{store:BackupStore;record:StoredRecord;expected:number}>=[],targets=new Set<string>();let kept=0;
  for(const entry of state.entries){const decision=selected.get(entry.key);if(!decision)throw new RuntimeError('backup_decision_required','Choose a decision for every backup record.');if(decision.action==='keep'){kept++;continue}
   const source=state.records.get(entry.key);if(!source||!['copy','restore'].includes(decision.action))throw new RuntimeError('backup_invalid_decision','Unsupported or damaged records can only be preserved in the original recovery file.');
   revision(decision.expectedRevision);if(decision.action==='restore'&&decision.expectedRevision!==(entry.current?.revision??0))throw new RuntimeError('backup_preview_stale','Use the exact revision shown in the preview, or preview again.');const id=decision.id??source.id;validID(id);if(decision.action==='copy'&&(id===source.id||decision.expectedRevision!==0))throw new RuntimeError('backup_copy_id','A copy needs a different, unused local ID.');if(decision.action==='restore'&&id!==source.id)throw new RuntimeError('backup_restore_id','Use Copy to choose a different ID.');
   if(targets.has(`${entry.store}:${id}`))throw new RuntimeError('backup_duplicate_target','Two backup records cannot replace the same local record.');targets.add(`${entry.store}:${id}`);
   const record=structuredClone(source);record.id=id;
   if(entry.store==='progress'&&id===COMMANDER_PROGRESS_ID)validateCommanderProgress((record as LocalProgress).data);
   if('name' in record){record.name=decision.name??record.name;validName(id,record.name);record.name=record.name.trim()}
   if(entry.store==='saves'){const saved=record as LocalSave;if(decision.action==='copy'){if(id.startsWith('autosave-'))throw new RuntimeError('reserved_save_id','Copies require a manual save ID.');saved.kind='manual'}}
   writes.push({store:entry.store,record,expected:decision.expectedRevision});
  }
  let recovery:RecoveryFile|undefined;if(state.preserveOriginal){validName('recovery',recoveryName);recovery={id:`recovery-${randomUUID()}`,name:recoveryName.trim(),created:Date.now(),reason:state.supported?'Backup contains unsupported or damaged records; original bytes retained.':'Unsupported backup version; original bytes retained.',data:state.file.slice()}}
  const storedRecovery:StoredRecoveryFile|undefined=recovery?{...recovery,data:new Uint8Array(await recovery.data.arrayBuffer()),mime:recovery.data.type}:undefined;
  const db=await this.open(),tx=db.transaction([...stores,'recovery',REVISION_STORE],'readwrite'),done=completed(tx);done.catch(()=>{});
  try{
   const current=await Promise.all(writes.map(write=>request(tx.objectStore(write.store).get(write.record.id)))) as Array<StoredRecord|undefined>;
   for(let i=0;i<writes.length;i++)if((current[i]?.revision??0)!==writes[i].expected){tx.abort();throw new RuntimeError('backup_conflict','A local record changed after the preview. Preview again before restoring anything.',true,{store:writes[i].store,id:writes[i].record.id,current:current[i]?summary(current[i]!):undefined})}
   // Validate and merge all commander receipts before the first restore write.
   // Older backups must never erase known IDs and make an old final award twice.
   for(let i=0;i<writes.length;i++){const write=writes[i];if(write.store==='progress'&&write.record.id===COMMANDER_PROGRESS_ID){const prior=current[i] as LocalProgress<CommanderProgress>|undefined;if(prior&&prior.schema_version!==1)throw new RuntimeError('commander_progress_incompatible','Preserve the newer local mastery ledger before restoring this backup.');(write.record as LocalProgress<CommanderProgress>).data=mergeCommanderProgress(prior?.data,(write.record as LocalProgress<CommanderProgress>).data)}}
   const restored:RestoreResult['restored']=[];for(const write of writes){const record={...write.record,revision:await reserveRevision(tx,write.store,write.record.id,write.expected),updated:Date.now()};tx.objectStore(write.store).put(record);restored.push({store:write.store,id:record.id,revision:record.revision})}if(storedRecovery)tx.objectStore('recovery').add(storedRecovery);await done;previews.delete(preview);return {restored,kept,recoveryId:recovery?.id};
  }catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
}
