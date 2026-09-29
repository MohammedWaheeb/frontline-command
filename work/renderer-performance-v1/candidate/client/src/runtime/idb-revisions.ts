import {RuntimeError} from './errors';

export const REVISION_STORE='revisions';
interface RevisionRecord{key:[string,string];revision:number}
function valid(value:number){return Number.isSafeInteger(value)&&value>=0}
/** Seed live records during the existing database's atomic upgrade; retain every original record. */
export function upgradeRevisions(db:IDBDatabase,tx:IDBTransaction,stores:Array<{name:string;key?:string}>){
 if(db.objectStoreNames.contains(REVISION_STORE))return;
 const ledger=db.createObjectStore(REVISION_STORE,{keyPath:'key'});
 for(const store of stores){const cursor=tx.objectStore(store.name).openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;const value=row.value,id=value[store.key??'id'];if(typeof id==='string'&&valid(value.revision)&&value.revision>0)ledger.put({key:[store.name,id],revision:value.revision});row.continue()}}
}
/** Caller must include REVISION_STORE in the same readwrite transaction as its CAS and write/delete. */
export async function reserveRevision(tx:IDBTransaction,scope:string,id:string,current:number,advance=true):Promise<number>{
 const ledger=tx.objectStore(REVISION_STORE),prior=await new Promise<RevisionRecord|undefined>((resolve,reject)=>{const r=ledger.get([scope,id]);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 if(!valid(current)||prior&&!valid(prior.revision))throw new RuntimeError('revision_corrupt','This record has unreadable revision metadata. Preserve it for recovery.');
 const maximum=Math.max(current,prior?.revision??0);
 if(advance&&maximum===Number.MAX_SAFE_INTEGER)throw new RuntimeError('revision_exhausted','This file has reached its revision limit. Copy it to a different ID.');
 const revision=maximum+(advance?1:0);if(revision>0)ledger.put({key:[scope,id],revision});return revision;
}
