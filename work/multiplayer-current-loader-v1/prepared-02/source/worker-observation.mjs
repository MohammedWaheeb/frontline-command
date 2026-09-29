// Test-only readonly accounting. Constructor/postMessage/terminate behavior and
// transfer lists are forwarded unchanged; no worker is reset or terminated here.
export function installWorkerObservation(expected){
 const NativeWorker=window.Worker,createObjectURL=URL.createObjectURL.bind(URL);
 const sources=new Map(),workers=[];let nextID=0;
 const pageInstance=String(performance.timeOrigin)+'-'+Math.random().toString(36);
 URL.createObjectURL=function(blob){
  const url=createObjectURL(blob);
  if(blob instanceof Blob&&/javascript/.test(blob.type)&&blob.size<=65536){
   const source={bytes:blob.size,role:'unknown',pending:undefined};
   source.pending=blob.text().then(text=>{source.role=text===expected.imageWorkerSource?'pixi-image-decoder':text===expected.probeWorkerSource?'pixi-image-probe':'unknown'},()=>{});
   sources.set(url,source);
  }
  return url;
 };
 window.Worker=new Proxy(NativeWorker,{construct(target,args,newTarget){
  const worker=Reflect.construct(target,args,newTarget),url=String(args[0]),name=args[1]?.name??'',pending=new Set();
  const entry={id:++nextID,url,name,active:true,messages:0,completed:0,messageIDs:[],pending,source:sources.get(url)};workers.push(entry);
  const postMessage=worker.postMessage.bind(worker),terminate=worker.terminate.bind(worker);
  worker.postMessage=function(...args){
   const result=postMessage(...args),payload=args[0];entry.messages++;
   if(payload?.id==='loadImageBitmap'&&Number.isSafeInteger(payload.uuid)){pending.add(payload.uuid);if(!entry.messageIDs.includes(payload.id))entry.messageIDs.push(payload.id)}
   return result;
  };
  worker.addEventListener('message',event=>{if(pending.delete(event.data?.uuid))entry.completed++});
  worker.terminate=function(){const result=terminate();entry.active=false;pending.clear();return result};
  return worker;
 }});
 Object.defineProperty(window,'rematchPageTelemetry',{value:async()=>{
  await Promise.all([...sources.values()].map(source=>source.pending));
  const entries=workers.map(entry=>({id:entry.id,url:entry.url,name:entry.name,active:entry.active,role:entry.name==='Frontline Go simulation'&&new URL(entry.url,location.href).origin===location.origin&&new URL(entry.url,location.href).pathname==='/runtime/worker.js'?'go-runtime':entry.source?.role??'unknown',sourceBytes:entry.source?.bytes,messages:entry.messages,completed:entry.completed,messageIDs:entry.messageIDs,pendingJobs:entry.pending.size}));
  return {pageInstance,timeOrigin:performance.timeOrigin,hardwareConcurrency:navigator.hardwareConcurrency,activeWorkers:entries.filter(entry=>entry.active).length,createdWorkers:entries.length,terminatedWorkers:entries.filter(entry=>!entry.active).length,workers:entries,heapUsed:performance.memory?.usedJSHeapSize};
 }});
}
