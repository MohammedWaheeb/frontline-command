import {PACK_PREFIX,READY_PATH,MANIFEST_PATH} from './cache';
/** Network first except cache-only virtual metadata, then one completed
 * generation per pack ID. A removed file
 * cannot be resurrected from a retired generation after an offline upgrade. */
export async function offlineResponse(request:Request):Promise<Response>{
 // This reserved route is created only by the verified installer. A live
 // host has no such file and its 404 must not shadow installed metadata.
 if(new URL(request.url).pathname!==MANIFEST_PATH){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);
  try{const response=await fetch(request,{signal:controller.signal});if(response.ok)return response;if(response.status!==503)return response}catch{}finally{clearTimeout(timeout)}
 }
 const ready:Array<{id:string;cache:Cache;installedAt:number;name:string}>=[];
 for(const name of await caches.keys()){
  if(!name.startsWith(PACK_PREFIX))continue;
  const cache=await caches.open(name),marker=await cache.match(READY_PATH);
  if(marker)try{const data=await marker.json();if(typeof data.id==='string'&&Number.isFinite(data.installedAt)&&Number.isSafeInteger(data.files)&&data.files>0&&(await cache.keys()).length>=data.files+1+(data.metadataFiles===1?1:0))ready.push({id:data.id,cache,installedAt:data.installedAt,name})}catch{}
 }
 ready.sort((a,b)=>b.installedAt-a.installedAt||(a.name<b.name?-1:a.name>b.name?1:0));
 const seen=new Set<string>();
 for(const pack of ready){
  if(seen.has(pack.id))continue;seen.add(pack.id);
  const found=await pack.cache.match(request);if(found)return found;
  if(request.mode==='navigate'&&new URL(request.url).pathname==='/'){const index=await pack.cache.match('/index.html');if(index)return index}
 }
 return new Response('Required offline content is not cached. Reconnect to the local host and download this mode first.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
