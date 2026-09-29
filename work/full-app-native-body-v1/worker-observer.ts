// Test-only passive observation of the existing App's actual Go worker. No
// runtime calls, state injection, response/asset reads or download interception.
import {fromBinary,toJson} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,OrderBatchSchema} from 'pinned-frontline-protocol';
const data:any={workers:[],requests:[],results:[],saves:[],errors:[],latest:null,clock:null,overflow:false};
const append=(key:string,value:unknown,limit=1024)=>{if(data[key].length>=limit){data.overflow=true;return}data[key].push(value)};
const fail=(error:unknown)=>append('errors',{kind:'passive-observer',error:String(error)});
const stamp=()=>performance.now();let next=0;const seen=new Set<string>();
const Base=window.Worker;
class ObservedWorker extends Base{
 constructor(url:string|URL,options?:WorkerOptions){
  super(url,options);if(options?.name!=='Frontline Go simulation')return;
  const worker={id:++next,url:String(url),live:true,createdAt:stamp(),terminatedAt:0,pending:0,pendingAtTerminate:0},pending=new Map<number,any>();data.workers.push(worker);
  this.addEventListener('message',event=>{try{
   const m=event.data;
   if(m.event==='frame'){
    const j:any=toJson(PlayerSnapshotSchema,fromBinary(PlayerSnapshotSchema,m.bytes));
    data.latest={worker:worker.id,tick:j.tick??0,countdown:j.countdown??0,player:j.player,economy:j.economy,entities:j.entities??[],outcome:j.outcome};
    for(const result of j.results??[]){const key=JSON.stringify(result);if(!seen.has(key)){seen.add(key);append('results',result)}}return;
   }
   if(m.event==='clock'){data.clock={worker:worker.id,...m};return}
   if(m.event==='error'){append('errors',{kind:'runtime',error:m.error});return}
   const request=pending.get(m.id);if(!request)return;pending.delete(m.id);worker.pending=pending.size;
   if(!m.ok){append('errors',{kind:'rpc',method:request.method,error:m.error});return}
   if(request.method==='content')data.powerRule=m.result.buildings?.find((b:any)=>b.id==='power');
   if(request.method==='save'){
    const save=JSON.parse(new TextDecoder().decode(m.result.data)),player=data.latest?.player;
    // Inspect only the local owner's power records, not foreign save state.
    append('saves',{worker:worker.id,tick:m.result.tick,hash:m.result.hash,ownedPower:(save.entities??[]).filter((e:any)=>e.owner===player&&e.type==='power').map((e:any)=>({id:e.id,position:e.position,complete:e.complete,paid:e.paid}))},8);
   }
  }catch(error){fail(error)}});
  this.addEventListener('error',event=>append('errors',{kind:'worker',error:event.message}));
  const post=this.postMessage;
  this.postMessage=function(this:Worker,message:any,...rest:any[]){
   try{if(message?.method){
    if(pending.size>=256){data.overflow=true}else{const request:any={worker:worker.id,id:message.id,method:message.method,time:stamp()};pending.set(message.id,request);worker.pending=pending.size;
     if(message.method==='submit'){request.batch=toJson(OrderBatchSchema,fromBinary(OrderBatchSchema,message.args[0]));append('requests',request)}
     if(['create','pause','resume','save','dispose'].includes(message.method))append('requests',request);
    }
   }}catch(error){fail(error)}return Reflect.apply(post,this,[message,...rest]);
  } as Worker['postMessage'];
  const terminate=this.terminate;this.terminate=function(){worker.live=false;worker.terminatedAt=stamp();worker.pendingAtTerminate=pending.size;pending.clear();worker.pending=0;return Reflect.apply(terminate,this,[])};
 }
}
window.Worker=ObservedWorker;
(window as any).__nativeBodyWorkerQA={read:()=>data};
