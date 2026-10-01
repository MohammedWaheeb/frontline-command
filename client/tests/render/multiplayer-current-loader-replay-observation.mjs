// Observe method names only. Forward the original worker args and transfer list;
// do not read commands/replies, consume streams, call Go or change worker lifetime.
export function installReplayObservation(){
 const NativeWorker=window.Worker,counts={submit:0,seekReplay:0,loadReplay:0};
 window.Worker=new Proxy(NativeWorker,{construct(target,args,newTarget){
  const worker=Reflect.construct(target,args,newTarget);
  if(args[1]?.name==='Frontline Go simulation'){
   const send=worker.postMessage;
   worker.postMessage=function(...parameters){const method=parameters[0]?.method;if(Object.hasOwn(counts,method))counts[method]++;return Reflect.apply(send,this,parameters)};
  }
  return worker;
 }});
 Object.defineProperty(window,'currentReplayObservation',{value:()=>({...counts})});
}
