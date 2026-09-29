/** Actual private consumer/installer diagnostics; no Go world or fake responses. */
import {ArtLibrary,type SpriteSheet,type FrameSet} from '../../src/render/art';
import {installPack,installedPacks,registerOfflineWorker,removePack,PACK_PREFIX,type ContentPack} from '../../src/runtime/cache';
const detail=(error:any)=>({code:String(error?.code??error?.name??'unknown'),message:String(error?.message??error)});
type Frame={state:string;direction:number;index:number};
type Entry={art:ArtLibrary;sheet?:SpriteSheet;errors:ReturnType<typeof detail>[];last?:FrameSet};
const libraries=new Map<string,Entry>(),controllers=new Map<string,AbortController>(),results=new Map<string,unknown>();
let unlock:(()=>void)|undefined;
const bitmaps:ImageBitmap[]=[],blobs=new Map<string,number>();
const originalBitmap=globalThis.createImageBitmap.bind(globalThis),originalURL=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL);
globalThis.createImageBitmap=(async(...args:any[])=>{const bitmap=await (originalBitmap as any)(...args);bitmaps.push(bitmap);return bitmap}) as typeof createImageBitmap;
URL.createObjectURL=(source:Blob|MediaSource)=>{const url=originalURL(source);blobs.set(url,source instanceof Blob?source.size:0);return url};
URL.revokeObjectURL=url=>{blobs.delete(url);originalRevoke(url)};
const resources=()=>({bitmapCreated:bitmaps.length,bitmapLive:bitmaps.filter(b=>b.width>0||b.height>0).length,blobURLs:blobs.size,blobBytes:[...blobs.values()].reduce((a,b)=>a+b,0),canvases:document.querySelectorAll('canvas').length});
async function pixels(source:CanvasImageSource,width:number,height:number){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(source,0,0);const data=ctx.getImageData(0,0,width,height).data,digest=await crypto.subtle.digest('SHA-256',data);canvas.width=canvas.height=0;return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const get=(name:string)=>{const entry=libraries.get(name);if(!entry)throw Error('Missing library '+name);return entry};
const stats=(entry:Entry)=>({statistics:entry.art.statistics,generation:entry.art.generationIdentity,generationStatistics:entry.art.generationStatistics,errors:entry.errors,resources:resources()});
let cacheHold:{path:string;original:typeof Cache.prototype.match;release:()=>void;entered:boolean}|undefined;
const qa={
 resources,
 async register(){await registerOfflineWorker();return {controller:navigator.serviceWorker.controller?.scriptURL,secure:isSecureContext,locks:typeof navigator.locks?.request==='function'}},
 async state(){return {installed:await installedPacks(),names:await caches.keys()}},
 async remove(name:string){return removePack(name)},
 async read(url:string){const response=await fetch(url,{cache:'no-store'});return {status:response.status,text:await response.text()}},
 async install(pack:ContentPack,name='install'){const controller=new AbortController();controllers.set(name,controller);try{return {ok:true,value:await installPack(pack,undefined,controller.signal)}}catch(error){return {ok:false,error:detail(error)}}finally{controllers.delete(name)}},
 startInstall(pack:ContentPack,name:string){results.delete(name);void qa.install(pack,name).then(value=>results.set(name,value))},
 result(name:string){return results.get(name)},
 abort(name:string){controllers.get(name)?.abort()},
 async canceled(pack:ContentPack){const controller=new AbortController();controller.abort();try{await installPack(pack,undefined,controller.signal);return {ok:true}}catch(error){return {ok:false,error:detail(error)}}},
 async quota(pack:ContentPack,path:string){const original=Cache.prototype.put;let injected=0;Cache.prototype.put=async function(request:RequestInfo|URL,response:Response){const url=new URL(request instanceof Request?request.url:String(request),location.origin);if(url.pathname===path){injected++;throw new DOMException('Explicit diagnostic Cache.put quota injection','QuotaExceededError')}return original.call(this,request,response)};try{return {...await qa.install(pack),injected}}finally{Cache.prototype.put=original}},
 async holdLock(id:string){let entered!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve});void navigator.locks.request(PACK_PREFIX+'activate:'+id,async()=>{entered();await new Promise<void>(resolve=>{unlock=resolve})});await ready;return true},
 releaseLock(){unlock?.();unlock=undefined},
 async locks(){return navigator.locks.query()},
 holdCache(path:string){if(cacheHold)throw Error('Cache boundary already held');const original=Cache.prototype.match;let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve});cacheHold={path,original,release,entered:false};Cache.prototype.match=async function(request:RequestInfo|URL,options?:CacheQueryOptions){const response=await original.call(this,request,options),url=new URL(request instanceof Request?request.url:String(request),location.origin);if(cacheHold&&url.pathname===cacheHold.path){cacheHold.entered=true;await wait}return response};return true},
 cacheHeld(){return cacheHold?.entered===true},
 releaseCache(){if(cacheHold){Cache.prototype.match=cacheHold.original;cacheHold.release();cacheHold=undefined}},
 async create(name:string,id:string){if(libraries.has(name))throw Error('Duplicate library');const entry:Entry={art:new ArtLibrary(),errors:[]};entry.art.onError=error=>entry.errors.push(detail(error));libraries.set(name,entry);entry.sheet=await entry.art.sheet(id);if(!entry.sheet)throw Error('Actual ArtLibrary failed: '+JSON.stringify(entry.errors));return {...stats(entry),meta:entry.sheet.meta}},
 async frame(name:string,frame:Frame){const entry=get(name),sheet=entry.sheet!;sheet.frame('beauty',frame.state,frame.direction,frame.index);await sheet.settle();const value=sheet.frame('beauty',frame.state,frame.direction,frame.index);entry.last=value;if(!value)return {ok:false,...stats(entry)};const source=value.atlasTexture.source;return {ok:true,sha256:await pixels(source.resource as CanvasImageSource,source.pixelWidth,source.pixelHeight),picking:typeof value.containsAlpha==='function',...stats(entry)}},
 startFrame(name:string,frame:Frame,key:string){results.delete(key);void qa.frame(name,frame).then(value=>results.set(key,value)).catch(error=>results.set(key,{ok:false,error:detail(error)}))},
 async image(name:string,path:string){try{const entry=get(name),value=await entry.art.image(path);return {ok:true,sha256:await pixels(value,value.naturalWidth,value.naturalHeight),...stats(entry)}}catch(error){return {ok:false,error:detail(error),resources:resources()}}},
 evict(name:string){const entry=get(name);entry.sheet!.evictBefore(Infinity);return {...stats(entry),oldPickingLive:entry.last?.containsAlpha?.(0,0,10000)??false}},
 async dispose(name:string){const entry=get(name);await entry.art.dispose();return {...stats(entry),oldPickingLive:entry.last?.containsAlpha?.(0,0,10000)??false}},
 async disposeAll(){const snapshots=[];for(const name of libraries.keys())snapshots.push({name,...await qa.dispose(name)});return {libraries:snapshots,resources:resources()}},
 async reference(path:string){const response=await fetch(path,{cache:'no-store'}),bytes=await response.arrayBuffer();if(!response.ok)throw Error('Reference unavailable');const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));try{return await pixels(bitmap,bitmap.width,bitmap.height)}finally{bitmap.close()}},
};
Object.assign(window,{generationQA:qa});
