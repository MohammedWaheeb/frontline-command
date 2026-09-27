import {sha256Hex,randomUUID} from './crypto';
import {RuntimeError} from './errors';
export const PACK_PREFIX='frontline-pack-v1:';
export const READY_PATH='/__frontline_pack_ready__';
export interface PackFile{path:string;sha256:string;bytes:number}
export interface ContentPack{id:string;version:string;files:PackFile[]}
export interface InstalledPack{id:string;version:string;installedAt:number;files:number;bytes:number;cacheName:string}
export function offlineCapability(){return {supported:globalThis.isSecureContext===true&&'serviceWorker' in navigator&&'caches' in globalThis&&!!globalThis.crypto?.subtle,reason:globalThis.isSecureContext?'':'Offline caching requires localhost or HTTPS. An ordinary LAN address still supports connected multiplayer.'}}
export async function registerOfflineWorker(url='/service-worker.js'){
 if(!offlineCapability().supported)throw new RuntimeError('offline_unavailable',offlineCapability().reason||'This browser does not support offline game caching.');
 const registration=await navigator.serviceWorker.register(url,{scope:'/',updateViaCache:'none'});
 await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise<void>((resolve,reject)=>{
  const done=()=>{clearTimeout(timeout);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve()};
  const timeout=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);reject(new RuntimeError('offline_reload_required','Reload the game menu to finish enabling offline caching.'))},10000);
  navigator.serviceWorker.addEventListener('controllerchange',done);
 });
 return registration;
}
export async function installedPacks():Promise<InstalledPack[]>{
 if(!offlineCapability().supported)return [];
 const result:InstalledPack[]=[];
 for(const name of await caches.keys()){
  if(!name.startsWith(PACK_PREFIX))continue;
  const cache=await caches.open(name),marker=await cache.match(READY_PATH);
  if(!marker)continue;
  try{const value=await marker.json();if(typeof value.id==='string'&&typeof value.version==='string'&&Number.isFinite(value.installedAt)&&(await cache.keys()).length>=value.files+1)result.push({...value,cacheName:name})}catch{}
 }
 return result.sort((a,b)=>b.installedAt-a.installedAt);
}
async function readBounded(response:Response,expected:number):Promise<ArrayBuffer>{
 const length=response.headers.get('Content-Length');
 if(length!==null&&Number(length)>expected)throw new RuntimeError('content_size_mismatch','A content response exceeds its declared size.');
 if(!response.body)return new ArrayBuffer(0);
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>expected){await reader.cancel();throw new RuntimeError('content_size_mismatch','A content response exceeds its declared size.')}chunks.push(value)}}finally{reader.releaseLock()}
 const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength}return joined.buffer;
}
export async function installPack(pack:ContentPack,onProgress?:(progress:{complete:number;total:number;bytes:number})=>void,signal?:AbortSignal):Promise<InstalledPack>{
 if(!offlineCapability().supported)throw new RuntimeError('offline_unavailable',offlineCapability().reason||'Offline caching is unavailable in this browser.');
 if(!/^[\w.-]{1,100}$/.test(pack.id)||!/^[\w.-]{1,100}$/.test(pack.version)||pack.files.length<1||pack.files.length>16000)throw new RuntimeError('pack_invalid','The game content manifest is invalid.');
 const seen=new Set<string>();let expectedBytes=0;
 for(const file of pack.files){
  const url=new URL(file.path,location.origin);
  const publicAPI=/^\/api\/v1\/(content|maps(?:\/[^/]+)?|missions(?:\/[^/]+)?)$/.test(url.pathname);
  if(url.origin!==location.origin||url.username||url.password||url.hash||url.pathname.startsWith('/api/')&&!publicAPI||url.pathname===READY_PATH||seen.has(url.href)||!(/^[a-f0-9]{64}$/i.test(file.sha256))||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>128*1024*1024)throw new RuntimeError('pack_invalid','A content file is invalid, duplicated, private or outside this host.');
  seen.add(url.href);expectedBytes+=file.bytes;
 }
 if(expectedBytes>2*1024*1024*1024)throw new RuntimeError('pack_too_large','Install a smaller map or faction pack first.');
 const existing=(await installedPacks()).find(p=>p.id===pack.id&&p.version===pack.version);if(existing){onProgress?.({complete:pack.files.length,total:pack.files.length,bytes:existing.bytes});return existing}
 const name=PACK_PREFIX+pack.id+':'+pack.version+':'+randomUUID(),cache=await caches.open(name);let bytes=0,complete=0;
 try{
  for(const file of pack.files){
   if(signal?.aborted)throw new RuntimeError('download_canceled','The content download was canceled. Previously installed packs are preserved.');
   const url=new URL(file.path,location.origin);
   const response=await fetch(url,{cache:'no-store',credentials:'omit',signal,headers:{'X-Frontline-Pack-Download':'1'}});
   if(!response.ok||new URL(response.url).origin!==location.origin)throw new RuntimeError('content_download_failed',`A required content file could not be downloaded: ${url.pathname}`);
   const data=await readBounded(response,file.bytes);if(data.byteLength!==file.bytes)throw new RuntimeError('content_size_mismatch',`A required file has the wrong size: ${url.pathname}`);
   const digest=await sha256Hex(new Uint8Array(data));
   if(digest!==file.sha256.toLowerCase())throw new RuntimeError('content_corrupt',`A required file failed its integrity check: ${url.pathname}`);
   // These are verified, decoded, immutable bytes addressed by this manifest.
   // Network transfer encodings/lengths no longer describe this Response, and
   // Vary (notably Vite's Origin) would make ordinary module requests miss the
   // URL-only cache key used by the installer.
   const headers=new Headers(response.headers);
   headers.delete('Vary');headers.delete('Content-Encoding');headers.delete('Content-Length');
   await cache.put(url,new Response(data,{status:200,headers}));bytes+=data.byteLength;complete++;onProgress?.({complete,total:pack.files.length,bytes});
  }
  const installed={id:pack.id,version:pack.version,installedAt:Date.now(),files:pack.files.length,bytes,cacheName:name};
  // Marker-last makes incomplete downloads unavailable to the service worker.
  await cache.put(READY_PATH,new Response(JSON.stringify(installed),{headers:{'Content-Type':'application/json'}}));return installed;
 }catch(error){await caches.delete(name);if(error instanceof RuntimeError)throw error;throw new RuntimeError('content_cache_failed','The pack could not be cached. Check storage space and retry; installed packs are preserved.',true,error)}
}
export async function removePack(cacheName:string){if(!cacheName.startsWith(PACK_PREFIX))throw new RuntimeError('invalid_pack','Choose an installed Frontline pack.');return caches.delete(cacheName)}
