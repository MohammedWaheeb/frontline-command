import {RuntimeError} from './errors';
import type {EngineMetadata,SaveData} from './types';
export interface LocalSave extends SaveData{id:string;name:string;revision:number;updated:number;kind:'manual'|'auto';mission?:string}
export interface LocalSetting<T=unknown>{id:string;revision:number;updated:number;data:T}
export type SaveInspector=(data:Uint8Array)=>Promise<{metadata:EngineMetadata;tick:number}>;
function storageError(error:unknown){
 if(error instanceof RuntimeError)return error;
 const name=error && typeof error==='object'&&'name' in error?String(error.name):'';
 return new RuntimeError(name==='QuotaExceededError'?'storage_full':'storage_unavailable',name==='QuotaExceededError'?'Browser storage is full. Export a backup before choosing older files to remove.':'Browser storage could not be accessed. Existing files have not been overwritten.',true,error);
}
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(storageError(r.error))})}
function completed(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(storageError(tx.error));tx.onerror=()=>{/* abort reports the transaction error */}})}
function validName(id:string,name:string){if(typeof id!=='string'||typeof name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(id)||!name.trim()||name.length>100)throw new RuntimeError('invalid_save_name','Use a save name of 1–100 characters and a valid local ID.')}
function conflict(current:unknown){return new RuntimeError('save_conflict','This save has changed. Compare both versions before choosing which to keep.',true,{current})}
export class LocalStore {
 private db:Promise<IDBDatabase>|undefined;
 constructor(readonly name='frontline-command',private readonly inspect?:SaveInspector){}
 private open(){
  if(this.db)return this.db;
  this.db=new Promise<IDBDatabase>((resolve,reject)=>{
   if(!globalThis.indexedDB){reject(new RuntimeError('storage_unavailable','This browser does not provide local game storage.'));return}
   const r=indexedDB.open(this.name,1);let blocked=false;
   r.onupgradeneeded=()=>{for(const name of ['saves','settings','meta','replays','progress'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'})};
   r.onerror=()=>reject(storageError(r.error));
   r.onblocked=()=>{blocked=true;reject(new RuntimeError('storage_busy','Close another open game tab before changing the save database.'))};
   r.onsuccess=()=>{if(blocked){r.result.close();return}r.result.onversionchange=()=>r.result.close();resolve(r.result)};
  }).catch(error=>{this.db=undefined;throw error});return this.db;
 }
 async close(){if(this.db)(await this.db).close();this.db=undefined}
 async listSaves():Promise<LocalSave[]>{const db=await this.open();const values=await request(db.transaction('saves').objectStore('saves').getAll()) as LocalSave[];return values.sort((a,b)=>b.updated-a.updated||a.id.localeCompare(b.id))}
 async getSave(id:string):Promise<LocalSave|undefined>{const db=await this.open();return request(db.transaction('saves').objectStore('saves').get(id))}
 private async checked(save:SaveData){
  if(!this.inspect)throw new RuntimeError('validator_missing','Start the Go engine to validate a save before storing it.');
  if(!(save.data instanceof Uint8Array)||save.data.length>64*1024*1024||!Array.isArray(save.local_players)||save.local_players.length<1||save.local_players.length>4||new Set(save.local_players).size!==save.local_players.length||save.local_players.some(id=>!Number.isInteger(id)||id<1||id>4))throw new RuntimeError('save_invalid','The local save is malformed.');
  const inspected=await this.inspect(save.data);return {...save,data:save.data.slice(),metadata:inspected.metadata,tick:inspected.tick,local_players:[...save.local_players]};
 }
 async putSave(id:string,name:string,save:SaveData,expectedRevision=0):Promise<LocalSave>{
  validName(id,name);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new RuntimeError('invalid_revision','Choose the revision you reviewed before saving.');if(id.startsWith('autosave-'))throw new RuntimeError('reserved_save_id','Choose a manual save ID.');
  const checked=await this.checked(save),db=await this.open(),tx=db.transaction('saves','readwrite'),done=completed(tx);done.catch(()=>{});
  try{
   const store=tx.objectStore('saves'),current=await request(store.get(id)) as LocalSave|undefined;
   if((current?.revision??0)!==expectedRevision){tx.abort();throw conflict(current)}
   const result:LocalSave={...checked,id,name:name.trim(),kind:'manual',revision:expectedRevision+1,updated:Date.now()};store.put(result);await done;return result;
  }catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
 async autosave(save:SaveData,name='Autosave'):Promise<LocalSave>{
  const checked=await this.checked(save),db=await this.open(),tx=db.transaction(['saves','meta'],'readwrite'),done=completed(tx);done.catch(()=>{});
  try{
   const meta=tx.objectStore('meta'),counter=await request(meta.get('autosave-counter')) as {id:string;value:number}|undefined;
   const index=(counter?.value??0)%3,id=`autosave-${index}`,store=tx.objectStore('saves'),prior=await request(store.get(id)) as LocalSave|undefined;
   const result:LocalSave={...checked,id,name,kind:'auto',revision:(prior?.revision??0)+1,updated:Date.now()};store.put(result);meta.put({id:'autosave-counter',value:(counter?.value??0)+1});await done;return result;
  }catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
 async deleteSave(id:string,expectedRevision:number){
  const db=await this.open(),tx=db.transaction('saves','readwrite'),done=completed(tx);done.catch(()=>{});
  try{const store=tx.objectStore('saves'),current=await request(store.get(id)) as LocalSave|undefined;if(!current||current.revision!==expectedRevision){tx.abort();throw conflict(current)}store.delete(id);await done}
  catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
 async setting<T=unknown>(id:string):Promise<LocalSetting<T>|undefined>{const db=await this.open();return request(db.transaction('settings').objectStore('settings').get(id))}
 async putSetting<T>(id:string,data:T,expectedRevision=0):Promise<LocalSetting<T>>{
  if(!id||id.length>100||JSON.stringify(data).length>32768)throw new RuntimeError('settings_invalid','Settings exceed the local limit.');
  const db=await this.open(),tx=db.transaction('settings','readwrite'),done=completed(tx);done.catch(()=>{});
  try{const store=tx.objectStore('settings'),current=await request(store.get(id)) as LocalSetting|undefined;if((current?.revision??0)!==expectedRevision){tx.abort();throw new RuntimeError('settings_conflict','Settings changed in another tab. Compare the versions before saving.',true,{current})}const result={id,data,revision:expectedRevision+1,updated:Date.now()};store.put(result);await done;return result}
  catch(error){try{tx.abort()}catch{}throw storageError(error)}
 }
 async exportSave(id:string):Promise<Blob>{const record=await this.getSave(id);if(!record)throw new RuntimeError('save_missing','This local save no longer exists.');return new Blob([JSON.stringify({format:'frontline-local-save',version:1,id:record.id,name:record.name,local_players:record.local_players,hash:record.hash,engine:new TextDecoder('utf-8',{fatal:true}).decode(record.data)})],{type:'application/json'})}
 async previewImport(file:Blob):Promise<{id:string;name:string;save:SaveData;current?:LocalSave}>{
  if(file.size>96*1024*1024)throw new RuntimeError('save_too_large','The save export is larger than 96 MiB.');
  let value:any;try{value=JSON.parse(await file.text())}catch{throw new RuntimeError('save_corrupt','This file is not a readable local save export.')}
  if(value.format!=='frontline-local-save'||value.version!==1||typeof value.engine!=='string')throw new RuntimeError('save_incompatible','This export version is unsupported. Keep the file for a matching game version.');
  validName(value.id,value.name);
  const data=new TextEncoder().encode(value.engine);
  const save=await this.checked({data,local_players:value.local_players,hash:typeof value.hash==='string'?value.hash:'',tick:0,metadata:{} as EngineMetadata});
  return {id:value.id,name:value.name,save,current:await this.getSave(value.id)};
 }
 async backup():Promise<Blob>{const saves=await this.listSaves();return new Blob([JSON.stringify({format:'frontline-local-backup',version:1,created:Date.now(),saves:saves.map(record=>({...record,data:undefined,engine:new TextDecoder('utf-8',{fatal:true}).decode(record.data)}))})],{type:'application/json'})}
}
