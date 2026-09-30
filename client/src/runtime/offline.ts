import {create,fromBinary,toBinary} from '@bufbuild/protobuf';
import {OrderBatchSchema,PlayerSnapshotSchema,PriorityFrameSchema,type OrderResult} from '../protocol/frontline_pb';
import {RuntimeError} from './errors';
import {parseOperationPlans} from './operation-preview';
import type {CommandAffordances,ReplayLobby,Point,OrderPreview} from './types';
import {sequenceAfter} from './fixed';
import {applyPriority} from './priority';
import {RuntimeEvents,type GameTransport,type GameMap,type OfflineConfig,type OrderIntent,type PlayerSnapshot,type RuntimeVersion,type ReplayCommandPage,type SaveData,type SessionInfo,type Speed} from './types';
export interface EditorPreviewRequest {kind:'path'|'sight';unit_type:string;from:Point;to?:Point}
export interface EditorPreviewResult {kind:'path'|'sight';code:'ok'|'blocked_start'|'unreachable'|'adjusted_destination';layer:'ground'|'air';reachable?:boolean;path?:Point[];visible_tiles?:number[]}
interface Pending {resolve:(value:any)=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>}
export class OfflineTransport extends RuntimeEvents implements GameTransport {
 readonly mode='offline' as const;
 current:PlayerSnapshot|undefined;
 version:RuntimeVersion|undefined;
 private lastFull:PlayerSnapshot|undefined;private priorityTick=0;
 private worker:Worker;private pending=new Map<number,Pending>();private nextID=0;private sequence=0;private disposed=false;private replacements=0;
 constructor(runtimeURL='/runtime/'){
  super();const base=new URL(runtimeURL,location.href);if(!base.pathname.endsWith('/'))base.pathname+='/';
  this.worker=new Worker(new URL('worker.js',base),{name:'Frontline Go simulation'});
  this.worker.onmessage=event=>this.receive(event.data);
  this.worker.onerror=()=>this.fault(new RuntimeError('worker_failed','The offline engine stopped. Your existing saves are preserved.',false));
  this.ready=this.rpc<RuntimeVersion>('init',{wasmURL:new URL('frontline.wasm',base).href,execURL:new URL('wasm_exec.js',base).href}).then(version=>{this.version=version;return version});
 }
 readonly ready:Promise<RuntimeVersion>;
 private receive(message:any){
  if(this.disposed)return;
  if(message.event==='frame'){
   try{const snapshot=fromBinary(PlayerSnapshotSchema,message.bytes);this.validateResults(snapshot.results,snapshot.player);this.lastFull=this.current=snapshot;this.priorityTick=snapshot.tick;this.sequence=Math.max(this.sequence,snapshot.economy?.lastSequence??0);if(this.replacements>0)this.emit({type:'presentation-reset'});this.emit({type:'snapshot',snapshot});for(const result of snapshot.results)this.publishResult(result)}
   catch(error){this.fault(RuntimeError.from(error))}return;
  }
  if(message.event==='priority'){
   try{const frame=fromBinary(PriorityFrameSchema,message.bytes);this.validateResults(frame.results,this.lastFull?.player);if(frame.tick<this.priorityTick||frame.tick<(this.lastFull?.tick??0))return;const next=applyPriority(this.current,frame);this.priorityTick=frame.tick;if(next!==this.current){this.current=next;this.emit({type:'snapshot',snapshot:next,publication:'priority',priorityTick:frame.tick})}for(const result of frame.results)this.publishResult(result)}
   catch(error){this.fault(RuntimeError.from(error))}return;
  }
  if(message.event==='clock'){this.emit({type:'clock',paused:message.paused,speed:message.speed,stalled:message.stalled});return}
  if(message.event==='error'){this.fault(RuntimeError.from(message.error));return}
  const pending=this.pending.get(message.id);if(!pending)return;
  clearTimeout(pending.timer);this.pending.delete(message.id);
  if(message.ok)pending.resolve(message.result);else pending.reject(RuntimeError.from(message.error));
 }
 private validateResults(results:OrderResult[],player:number|undefined){for(const result of results)if(result.player!==player)throw new RuntimeError('wrong_perspective','The engine returned another player’s execution receipt.',false)}
 private publishResult(result:OrderResult){this.sequence=Math.max(this.sequence,result.sequence);this.emit({type:'order-result',result})}
 private fault(error:RuntimeError){if(this.disposed)return;this.emit({type:'error',error});if(!error.recoverable){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear()}}
 private rpc<T=void>(method:string,...args:unknown[]):Promise<T>{
  if(this.disposed)return Promise.reject(new RuntimeError('disposed','The worker is closed.',false));
  const id=++this.nextID;
  return new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new RuntimeError('worker_timeout','The engine did not answer. Preserve your current save and retry.'))},30000);this.pending.set(id,{resolve,reject,timer});try{this.worker.postMessage({id,method,args})}catch(error){clearTimeout(timer);this.pending.delete(id);reject(RuntimeError.from(error))}});
 }
 private async replace<T=SessionInfo>(method:string,...args:unknown[]):Promise<T>{
  // Worker messages are FIFO, but old scheduled frames can already be queued
  // when a seek/load request is sent. Reset immediately before each in-flight
  // frame until the worker's reply, including the actual replacement frame.
  this.replacements++;this.emit({type:'presentation-reset'});
  try{return await this.rpc<T>(method,...args)}finally{this.replacements--}
 }
 async create(config:OfflineConfig){await this.ready;const info=await this.replace('create',config);this.sequence=this.current?.economy?.lastSequence??0;return info}
 async restart(){await this.ready;const info=await this.replace('restart');this.sequence=this.current?.economy?.lastSequence??0;return info}
 async sendOrders(orders:OrderIntent[]):Promise<number>{await this.ready;if(!orders.length||orders.length>32)throw new RuntimeError('command_limit','Send between one and 32 orders.');const sequence=sequenceAfter(this.sequence,this.current?.economy?.lastSequence);this.sequence=sequence;await this.rpc('submit',toBinary(OrderBatchSchema,create(OrderBatchSchema,{sequence,orders})));return sequence}
 pause(){return this.rpc('pause')}
 resume(){return this.rpc('resume')}
 setSpeed(speed:Speed){return this.rpc('speed',speed)}
 step(ticks:number){return this.rpc<SessionInfo>('step',ticks)}
 setPerspective(player:number){return this.replace('perspective',player)}
 async content(){await this.ready;return this.rpc<Record<string,unknown>>('content')}
 async affordances(ids:readonly number[]=[]){await this.ready;if(ids.length>64||ids.some(id=>!Number.isInteger(id)||id<1||id>0xffffffff)||new Set(ids).size!==ids.length)throw new RuntimeError('invalid_selection','Choose up to 64 distinct owned entities.');return this.rpc<CommandAffordances>('affordances',[...ids])}
 async previewEditor(map:Uint8Array,request:EditorPreviewRequest){await this.ready;return this.rpc<EditorPreviewResult>('previewEditor',map,request)}
 async validateMap(data:Uint8Array){await this.ready;return this.rpc<GameMap>('validateMap',data)}
 async validateMission(map:Uint8Array,mission:Uint8Array){await this.ready;return this.rpc<Record<string,unknown>>('validateMission',map,mission)}
 async previewOrders(orders:OrderIntent[]):Promise<OrderPreview>{await this.ready;const result=await this.rpc<OrderPreview>('previewOrders',toBinary(OrderBatchSchema,create(OrderBatchSchema,{orders})));const plans=parseOperationPlans(result.plans,orders,result.tick);return {...result,...plans!==undefined?{plans}:{}}}
 async previewCandidates(orders:OrderIntent[]){await this.ready;return this.rpc<{tick:number;results:Array<{player:number;sequence:number;index:number;accepted:boolean;code:string;tick:number}>}>('candidates',toBinary(OrderBatchSchema,create(OrderBatchSchema,{orders})))}
 map(){return this.rpc<GameMap>('map')}
 async inspectReplay(data:Uint8Array){await this.ready;return this.rpc<{metadata:SaveData['metadata'];start_tick:number;end_tick:number;players:number[];lobby?:ReplayLobby}>('inspectReplay',data)}
 exportReplay(){return this.rpc<Uint8Array>('exportReplay')}
 async loadReplay(data:Uint8Array){await this.ready;return this.replace('loadReplay',data)}
 seekReplay(tick:number){return this.replace('seekReplay',tick)}
 replayCommands(offset=0,limit=100){return this.rpc<ReplayCommandPage>('replayCommands',offset,limit)}
 save(){return this.rpc<SaveData>('save')}
 hash(){return this.rpc<string>('hash')}
 info(){return this.rpc<SessionInfo>('info')}
 async inspect(data:Uint8Array){await this.ready;return this.rpc<{metadata:SaveData['metadata'];tick:number}>('inspect',data)}
 async load(data:Uint8Array,localPlayers:number[]){await this.ready;const info=await this.replace('load',data,localPlayers);this.sequence=this.current?.economy?.lastSequence??0;return info}
 dispose(){if(this.disposed)return;this.disposed=true;this.worker.onmessage=null;this.worker.onerror=null;this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new RuntimeError('disposed','The worker has been closed.',false))}this.pending.clear();this.lastFull=this.current=undefined;this.clearListeners()}
}
