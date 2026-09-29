/** Browser-only transaction diagnostics. Calls frozen real installer/SW and
 * CacheStorage/Web Locks; no game world, fake Go response or production edit. */
import {installPack,installedPacks,registerOfflineWorker,removePack,PACK_PREFIX,READY_PATH,type ContentPack} from '../../src/runtime/cache';
import {ContentLibrary} from '../../src/runtime/content-library';
const controllers=new Map<string,AbortController>(),results=new Map<string,unknown>();
let releaseLock:(()=>void)|undefined,library:ContentLibrary|undefined,validatorCalls=0;
const detail=(e:any)=>({code:e?.code??e?.name??'unknown',message:String(e?.message??e)});
const qa={
 async register(){await registerOfflineWorker();return {script:navigator.serviceWorker.controller?.scriptURL,secure:isSecureContext,locks:typeof navigator.locks?.request==='function'}},
 async updateWorker(){const registration=await navigator.serviceWorker.getRegistration();if(!registration)throw Error('Worker registration missing');const old=navigator.serviceWorker.controller;let done!:()=>void;const changed=new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);reject(Error('Worker controller did not change'))},15000);done=()=>{if(navigator.serviceWorker.controller!==old){clearTimeout(timeout);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve()}};navigator.serviceWorker.addEventListener('controllerchange',done)});await registration.update();done();await changed;return {controllerChanged:true,script:navigator.serviceWorker.controller?.scriptURL}},
 async remove(name:string){return removePack(name)},
 async install(pack:ContentPack,name='install') {const c=new AbortController();controllers.set(name,c);try{return {ok:true,value:await installPack(pack,undefined,c.signal)}}catch(e){return {ok:false,error:detail(e)}}finally{controllers.delete(name)}},
 start(pack:ContentPack,name:string){results.delete(name);void qa.install(pack,name).then(result=>results.set(name,result));return name},
 result(name:string){return results.get(name)},abort(name:string){controllers.get(name)?.abort()},
 async canceled(pack:ContentPack){const c=new AbortController();c.abort();try{await installPack(pack,undefined,c.signal);return {ok:true}}catch(e){return {ok:false,error:detail(e)}}},
 async quota(pack:ContentPack,path:string){const original=Cache.prototype.put;let hits=0;Cache.prototype.put=async function(request:RequestInfo|URL,response:Response){const u=new URL(request instanceof Request?request.url:String(request),location.origin);if(u.pathname===path){hits++;throw new DOMException('Deliberate test Cache.put quota failure','QuotaExceededError')}return original.call(this,request,response)};try{return {...await qa.install(pack),injected:hits}}finally{Cache.prototype.put=original}},
 async hold(id:string){if(!navigator.locks?.request)throw Error('Web Locks unavailable');let entered!:()=>void;const ready=new Promise<void>(r=>{entered=r});void navigator.locks.request(PACK_PREFIX+'activate:'+id,async()=>{entered();await new Promise<void>(r=>{releaseLock=r})});await ready;return true},
 unlock(){releaseLock?.();releaseLock=undefined},
 async locks(){return navigator.locks.query()},
 async state(){return {installed:await installedPacks(),names:await caches.keys()}},
 async clear(){for(const name of await caches.keys())if(name.startsWith(PACK_PREFIX))await caches.delete(name)},
 async read(path:string){const r=await fetch(path,{cache:'no-store'}),data=new Uint8Array(await r.arrayBuffer());return {status:r.status,text:new TextDecoder().decode(data),bytes:data.length}},
 async retainIndex(){validatorCalls=0;library=new ContentLibrary({validator:{content:async()=>{throw Error('Tiny fixture has no Go validator')},validateMap:async()=>{validatorCalls++;throw Error('tiny_fixture_validation_boundary')},validateMission:async()=>{throw Error('Tiny fixture has no Go validator')}}});return library.loadIndex()},
 async retainedMap(id:string){try{await library!.loadMap(id);return {ok:true,validatorCalls}}catch(e){return {ok:false,error:detail(e),validatorCalls}}},
 async refreshIndex(){return library!.loadIndex()},
 async tie(names:string[],time:number){for(const name of names){if(!name.startsWith(PACK_PREFIX))throw Error('Not a game cache');const cache=await caches.open(name),response=await cache.match(READY_PATH);if(!response)throw Error('No completed cache');const marker=await response.json();marker.installedAt=time;await cache.put(READY_PATH,new Response(JSON.stringify(marker),{headers:{'Content-Type':'application/json'}}))}},
};
Object.assign(window,{offlineUpgradeQA:qa});
