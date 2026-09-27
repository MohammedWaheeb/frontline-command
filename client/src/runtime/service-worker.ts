// Nonvisual offline transport. Only explicitly verified completed content packs
// are readable here; profile tokens, multiplayer and saves are always network.
import {PACK_PREFIX,READY_PATH} from './cache';
interface LifecycleEvent{waitUntil(p:Promise<unknown>):void}
interface FetchEventLike extends LifecycleEvent{request:Request;respondWith(p:Promise<Response>):void}
const scope=self as unknown as {skipWaiting():Promise<void>;clients:{claim():Promise<void>};addEventListener(type:'install'|'activate',handler:(event:LifecycleEvent)=>void):void;addEventListener(type:'fetch',handler:(event:FetchEventLike)=>void):void;location:Location};
scope.addEventListener('install',event=>event.waitUntil(scope.skipWaiting()));
scope.addEventListener('activate',event=>event.waitUntil(scope.clients.claim()));
scope.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 const publicAPI=/^\/api\/v1\/(content|maps(?:\/[^/]+)?|missions(?:\/[^/]+)?)$/.test(url.pathname);
 if(request.method!=='GET'||url.origin!==scope.location.origin||request.headers.has('Authorization')||request.headers.has('X-Frontline-Pack-Download')||url.pathname.startsWith('/api/')&&!publicAPI)return;
 event.respondWith((async()=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);
  try{const response=await fetch(request,{signal:controller.signal});if(response.ok)return response;if(response.status!==503)return response}catch{}finally{clearTimeout(timeout)}
  const ready:Array<{cache:Cache;installedAt:number}>=[];
  for(const name of await caches.keys()){
   if(!name.startsWith(PACK_PREFIX))continue;
   const cache=await caches.open(name),marker=await cache.match(READY_PATH);
   if(marker){try{const data=await marker.json();ready.push({cache,installedAt:data.installedAt})}catch{}}
  }
  ready.sort((a,b)=>b.installedAt-a.installedAt);
  for(const pack of ready){
   const found=await pack.cache.match(request);if(found)return found;
   if(request.mode==='navigate'&&url.pathname==='/'){const index=await pack.cache.match('/index.html');if(index)return index}
  }
  return new Response('Required offline content is not cached. Reconnect to the local host and download this mode first.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 })());
});
