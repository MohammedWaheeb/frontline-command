import {create,fromBinary,toBinary} from '@bufbuild/protobuf';
import {OrderBatchSchema,PlayerSnapshotSchema} from '../protocol/frontline_pb';
import {RuntimeError} from './errors';
import {sequenceAfter} from './fixed';
import {RuntimeEvents,type GameTransport,type OfflineConfig,type OrderIntent,type PlayerSnapshot,type RuntimeVersion,type SaveData,type SessionInfo,type Speed} from './types';
interface Pending {resolve:(value:any)=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>}
export class OfflineTransport extends RuntimeEvents implements GameTransport {
 readonly mode='offline' as const;
 current:PlayerSnapshot|undefined;
 version:RuntimeVersion|undefined;
 private worker:Worker;private pending=new Map<number,Pending>();private nextID=0;private sequence=0;private disposed=false;
 constructor(runtimeURL='/runtime/'){
  super();const base=new URL(runtimeURL,location.href);if(!base.pathname.endsWith('/'))base.pathname+='/';
  this.worker=new Worker(new URL('worker.js',base),{name:'Frontline Go simulation'});
  this.worker.onmessage=event=>this.receive(event.data);
  this.worker.onerror=()=>this.fault(new RuntimeError('worker_failed','The offline engine stopped. Your existing saves are preserved.',false));
  this.ready=this.rpc<RuntimeVersion>('init',{wasmURL:new URL('frontline.wasm',base).href,execURL:new URL('wasm_exec.js',base).href}).then(version=>{this.version=version;return version});
 }
 readonly ready:Promise<RuntimeVersion>;
 private receive(message:any){
  if(message.event==='frame'){
   try{this.current=fromBinary(PlayerSnapshotSchema,message.bytes);this.sequence=Math.max(this.sequence,this.current.economy?.lastSequence??0);this.emit({type:'snapshot',snapshot:this.current});for(const result of this.current.results)this.emit({type:'order-result',result})}
   catch(error){this.fault(RuntimeError.from(error))}return;
  }
  if(message.event==='clock'){this.emit({type:'clock',paused:message.paused,speed:message.speed,stalled:message.stalled});return}
  if(message.event==='error'){this.fault(RuntimeError.from(message.error));return}
  const pending=this.pending.get(message.id);if(!pending)return;
  clearTimeout(pending.timer);this.pending.delete(message.id);
  if(message.ok)pending.resolve(message.result);else pending.reject(RuntimeError.from(message.error));
 }
 private fault(error:RuntimeError){this.emit({type:'error',error});if(!error.recoverable){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear()}}
 private rpc<T=void>(method:string,...args:unknown[]):Promise<T>{
  if(this.disposed)return Promise.reject(new RuntimeError('disposed','The worker is closed.',false));
  const id=++this.nextID;
  return new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new RuntimeError('worker_timeout','The engine did not answer. Preserve your current save and retry.'))},30000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,method,args})});
 }
 async create(config:OfflineConfig){await this.ready;const info=await this.rpc<SessionInfo>('create',config);this.sequence=this.current?.economy?.lastSequence??0;return info}
 async sendOrders(orders:OrderIntent[]):Promise<number>{await this.ready;if(!orders.length||orders.length>32)throw new RuntimeError('command_limit','Send between one and 32 orders.');const sequence=sequenceAfter(this.sequence,this.current?.economy?.lastSequence);this.sequence=sequence;await this.rpc('submit',toBinary(OrderBatchSchema,create(OrderBatchSchema,{sequence,orders})));return sequence}
 pause(){return this.rpc('pause')}
 resume(){return this.rpc('resume')}
 setSpeed(speed:Speed){return this.rpc('speed',speed)}
 step(ticks:number){return this.rpc<SessionInfo>('step',ticks)}
 setPerspective(player:number){return this.rpc<SessionInfo>('perspective',player)}
 save(){return this.rpc<SaveData>('save')}
 hash(){return this.rpc<string>('hash')}
 info(){return this.rpc<SessionInfo>('info')}
 async inspect(data:Uint8Array){await this.ready;return this.rpc<{metadata:SaveData['metadata'];tick:number}>('inspect',data)}
 async load(data:Uint8Array,localPlayers:number[]){await this.ready;const info=await this.rpc<SessionInfo>('load',data,localPlayers);this.sequence=this.current?.economy?.lastSequence??0;return info}
 dispose(){if(this.disposed)return;this.disposed=true;this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new RuntimeError('disposed','The worker has been closed.',false))}this.pending.clear();this.current=undefined;this.clearListeners()}
}
