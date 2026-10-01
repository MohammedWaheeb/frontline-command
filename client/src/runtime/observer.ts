import {fromBinary} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,type PlayerSnapshot} from '../protocol/frontline_pb';
import {RuntimeError} from './errors';
import {RuntimeEvents,type ConnectionPhase,type GameTransport} from './types';
import {assertSnapshot} from './snapshot';

export interface ObserverGrant{token:string;player:number;delay_ticks:number;read_only:true}
export interface ObserverConnection extends ObserverGrant{match_id:string;protocol:number;simulation:string;content_hash:string;map_version:string}
export interface ObserverOptions{fetch?:typeof fetch;pollMs?:number}
/** Server-authorized perspective snapshots only. The credential can never submit orders. */
export class ObserverTransport extends RuntimeEvents implements GameTransport{
 readonly mode='online' as const;readonly readOnly=true;readonly matchID:string;readonly perspective:number;readonly delayTicks:number;
 current:PlayerSnapshot|undefined;phase:ConnectionPhase='idle';buffering=true;lastError:RuntimeError|undefined;
 #token:string;private readonly expected:Pick<ObserverConnection,'protocol'|'simulation'|'content_hash'|'map_version'>;
 private readonly fetcher:typeof fetch;private readonly interval:number;private timer?:ReturnType<typeof setTimeout>;private request?:AbortController;private epoch=0;private disposed=false;private failures=0;
 constructor(readonly baseURL:string,connection:ObserverConnection,options:ObserverOptions={}){
  super();const url=new URL(baseURL);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new RuntimeError('observer_host','Choose a valid local game host.');
  if(!connection||connection.read_only!==true||!Number.isInteger(connection.player)||connection.player<1||connection.player>4||!Number.isInteger(connection.delay_ticks)||![0,2400].includes(connection.delay_ticks)||!/^[a-f0-9]{64}$/.test(connection.token)||!connection.match_id||!connection.map_version)throw new RuntimeError('observer_grant','The host returned an invalid observer grant.');
  this.#token=connection.token;this.matchID=connection.match_id;this.perspective=connection.player;this.delayTicks=connection.delay_ticks;this.expected={protocol:connection.protocol,simulation:connection.simulation,content_hash:connection.content_hash,map_version:connection.map_version};
  this.fetcher=options.fetch??globalThis.fetch.bind(globalThis);this.interval=Math.max(200,options.pollMs??250);
 }
 private change(phase:ConnectionPhase){this.phase=phase;this.emit({type:'connection',phase})}
 private alive(){if(this.disposed)throw new RuntimeError('disposed','This observer feed is closed.',false)}
 async connect(){this.alive();const epoch=++this.epoch;this.stopPending();this.change(this.current?'reconnecting':'connecting');await this.poll(epoch,true)}
 reconnect(){return this.connect()}
 private stopPending(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.request?.abort();this.request=undefined}
 private schedule(epoch:number){if(this.disposed||epoch!==this.epoch||this.current?.outcome?.finished)return;this.timer=setTimeout(()=>void this.poll(epoch,false),Math.min(5000,this.interval*2**Math.min(this.failures,5)))}
 private async poll(epoch:number,initial:boolean){
  const abort=new AbortController();this.request=abort;
  try{
   const response=await this.fetcher(new URL(`/api/v1/matches/${encodeURIComponent(this.matchID)}/observer`,this.baseURL),{headers:{Authorization:`Bearer ${this.#token}`},cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
   if(this.disposed||epoch!==this.epoch)return;
   if(response.status===202){const value=await response.json();if(this.disposed||epoch!==this.epoch)return;if(value.code!=='observer_buffering'||value.delay_ticks!==this.delayTicks)throw new RuntimeError('observer_response','The host returned an inconsistent observer delay.',false);this.buffering=true;this.failures=0;this.lastError=undefined;this.change('connected');return}
   if(!response.ok){let value:{code?:string;message?:string}={};try{value=await response.json()}catch{}throw new RuntimeError(value.code??'observer_unavailable',value.message??'The observer feed is unavailable.',![401,403,404].includes(response.status))}
   if(!response.headers.get('Content-Type')?.startsWith('application/x-protobuf'))throw new RuntimeError('observer_response','The host returned an invalid observer snapshot.',false);
   const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>8*1024*1024)throw new RuntimeError('observer_response','The observer snapshot exceeds the supported size.',false);
   const snapshot=fromBinary(PlayerSnapshotSchema,bytes);assertSnapshot(snapshot,this.perspective,this.expected);
   if(snapshot.metadata?.mapVersion!==this.expected.map_version||snapshot.results.length||this.current&&snapshot.tick<this.current.tick)throw new RuntimeError('observer_response','The observer feed contains incompatible or out-of-order state.',false);
   if(this.disposed||epoch!==this.epoch)return;this.buffering=false;this.failures=0;this.lastError=undefined;this.current=snapshot;this.change('connected');this.emit({type:'snapshot',snapshot});
  }catch(cause){
   if(this.disposed||epoch!==this.epoch||abort.signal.aborted)return;
   const error=cause instanceof RuntimeError?cause:new RuntimeError('observer_connection','The observer feed was interrupted. Your last permitted view is retained.');
   this.failures++;this.lastError=error;this.change(error.recoverable?'reconnecting':'closed');if(!error.recoverable)this.emit({type:'error',error});
   if(!error.recoverable){this.epoch++;this.stopPending()}if(initial)throw error;
  }finally{if(this.request===abort)this.request=undefined;if(!initial||this.phase==='connected')this.schedule(epoch)}
 }
 async sendOrders():Promise<number>{throw new RuntimeError('observer_read_only','Observers cannot issue orders.')}
 async pause():Promise<void>{throw new RuntimeError('observer_read_only','Observers cannot pause a match.')}
 async resume():Promise<void>{throw new RuntimeError('observer_read_only','Observers cannot change a match clock.')}
 dispose(){if(this.disposed)return;this.disposed=true;this.epoch++;this.stopPending();this.#token='';this.change('closed');this.clearListeners()}
}
