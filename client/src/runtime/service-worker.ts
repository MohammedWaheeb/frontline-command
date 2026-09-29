// Nonvisual offline transport. Only explicitly verified completed content packs
// are readable here; profile tokens, multiplayer and saves are always network.
import {offlineResponse} from './offline-response';
interface LifecycleEvent{waitUntil(p:Promise<unknown>):void}
interface FetchEventLike extends LifecycleEvent{request:Request;respondWith(p:Promise<Response>):void}
const scope=self as unknown as {skipWaiting():Promise<void>;clients:{claim():Promise<void>};addEventListener(type:'install'|'activate',handler:(event:LifecycleEvent)=>void):void;addEventListener(type:'fetch',handler:(event:FetchEventLike)=>void):void;location:Location};
scope.addEventListener('install',event=>event.waitUntil(scope.skipWaiting()));
scope.addEventListener('activate',event=>event.waitUntil(scope.clients.claim()));
scope.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 const publicAPI=/^\/api\/v1\/(content|maps(?:\/[^/]+)?|missions(?:\/[^/]+)?)$/.test(url.pathname);
 if(request.method!=='GET'||url.origin!==scope.location.origin||request.headers.has('Authorization')||request.headers.has('X-Frontline-Pack-Download')||url.pathname.startsWith('/api/')&&!publicAPI)return;
 event.respondWith(offlineResponse(request));
});
