import {create,fromBinary,toBinary} from '@bufbuild/protobuf';
import {EnvelopeSchema,type Envelope,type PlayerSnapshot} from '../protocol/frontline_pb';
import {RuntimeError} from './errors';
import {sequenceAfter} from './fixed';
import {applyDelta,assertSnapshot} from './snapshot';
import {RuntimeEvents,type GameTransport,type OrderIntent,type ConnectionPhase} from './types';
export interface MatchConnection{match_id:string;player:number;token:string;protocol:number;simulation:string;content_hash:string}
export class OnlineTransport extends RuntimeEvents implements GameTransport {
 readonly mode='online' as const;current:PlayerSnapshot|undefined;phase:ConnectionPhase='idle';
 terminalReason:'player_eliminated'|'reconnect_expired'|undefined;
 private socket:WebSocket|undefined;private epoch=0;private sequence=0;private disposed=false;private stopped=false;private finished=false;
 private retryTimer:ReturnType<typeof setTimeout>|undefined;private pingTimer:ReturnType<typeof setInterval>|undefined;
 private reconnectAt=0;private attempt=0;private nonce=0;private pings=new Map<number,number>();
 constructor(readonly baseURL:string,readonly connection:MatchConnection){super()}
 private change(phase:ConnectionPhase){this.phase=phase;this.emit({type:'connection',phase,remainingMs:this.reconnectAt?Math.max(0,120000-(Date.now()-this.reconnectAt)):undefined})}
 connect():Promise<void>{this.stopped=false;return this.open(false)}
 private open(resume:boolean):Promise<void>{
  if(this.disposed)return Promise.reject(new RuntimeError('disposed','The connection is closed.',false));
  const epoch=++this.epoch;if(this.retryTimer)clearTimeout(this.retryTimer);this.socket?.close();
  const url=new URL(`/api/v1/matches/${encodeURIComponent(this.connection.match_id)}/socket`,this.baseURL);
  url.protocol=url.protocol==='https:'?'wss:':'ws:';
  this.change(resume?'reconnecting':'connecting');
  const socket=new WebSocket(url);this.socket=socket;socket.binaryType='arraybuffer';
  return new Promise<void>((resolve,reject)=>{
   let settled=false;
   const finish=(error?:unknown)=>{if(settled)return;settled=true;clearTimeout(timeout);error?reject(error):resolve()};
   const timeout=setTimeout(()=>{finish(new RuntimeError('connect_timeout','The host did not answer. Check the LAN address or reconnect.'));socket.close()},15000);
   socket.onopen=()=>{
    if(epoch!==this.epoch)return;
    const hello={protocol:this.connection.protocol,simulation:this.connection.simulation,contentHash:this.connection.content_hash,token:this.connection.token,matchId:this.connection.match_id};
    const message=resume?create(EnvelopeSchema,{message:{case:'resume',value:{hello,lastTick:this.current?.tick??0}}}):create(EnvelopeSchema,{message:{case:'hello',value:hello}});
    socket.send(toBinary(EnvelopeSchema,message));
   };
   socket.onmessage=event=>{
    if(epoch!==this.epoch||this.disposed)return;
    try{
     if(!(event.data instanceof ArrayBuffer))throw new RuntimeError('invalid_frame','The host returned a nonbinary game message.',false);
     const incoming=fromBinary(EnvelopeSchema,new Uint8Array(event.data));
     const message=incoming.message;
     switch(message.case){
      case 'snapshot':
       assertSnapshot(message.value,this.connection.player,this.connection);this.emit({type:'presentation-reset'});this.publish(message.value);
       this.reconnectAt=0;this.attempt=0;this.change('connected');this.startPings();finish();break;
      case 'delta':{const next=applyDelta(this.current,message.value);assertSnapshot(next,this.connection.player,this.connection);this.publish(next);break}
      case 'orderResult':this.emit({type:'order-result',result:message.value});break;
      case 'status':this.emit({type:'status',status:message.value});break;
      case 'result':this.finished=message.value.committed||message.value.void;this.emit({type:'result',result:message.value});break;
      case 'error':{const error=new RuntimeError(message.value.code,message.value.message,message.value.recoverable);if(error.code==='player_eliminated'||error.code==='reconnect_expired'){this.terminalReason=error.code;this.stopped=true;this.change('closed');finish(error);socket.close();break}this.emit({type:'error',error});if(!error.recoverable){this.stopped=true;finish(error);socket.close()}break}
      case 'ping':{const started=this.pings.get(message.value.nonce);if(started!==undefined){this.pings.delete(message.value.nonce);this.emit({type:'latency',milliseconds:performance.now()-started})}break}
      default:throw new RuntimeError('unexpected_frame','The host returned an unsupported game message.',false);
     }
    }catch(error){const e=RuntimeError.from(error);this.emit({type:'error',error:e});finish(e);if(!e.recoverable)this.stopped=true;socket.close()}
   };
   socket.onerror=()=>{ /* Browser close event supplies the retry boundary. */ };
   socket.onclose=event=>{
    if(epoch!==this.epoch)return;
    if(this.pingTimer)clearInterval(this.pingTimer);this.pings.clear();
    finish(new RuntimeError('connection_lost','Connection to the host was interrupted. Existing unit orders continue.'));
    if(this.disposed||this.stopped||this.finished||event.code===1008){this.change('closed');return}
    if(!this.reconnectAt)this.reconnectAt=Date.now();
    this.scheduleReconnect();
   };
  });
 }
 private publish(snapshot:PlayerSnapshot){this.current=snapshot;this.sequence=Math.max(this.sequence,snapshot.economy?.lastSequence??0);this.emit({type:'snapshot',snapshot});for(const result of snapshot.results)this.emit({type:'order-result',result})}
 private scheduleReconnect(){
  const remaining=120000-(Date.now()-this.reconnectAt);
  if(remaining<=0){this.stopped=true;this.change('closed');this.emit({type:'error',error:new RuntimeError('reconnect_expired','The two-minute reconnect window has ended. Open the match result or delayed observer view.',false)});return}
  this.change('reconnecting');const delay=Math.min(5000,250*2**Math.min(this.attempt++,5),remaining);
  this.retryTimer=setTimeout(()=>{void this.open(true).catch(()=>{/* onclose controls retry */})},delay);
 }
 private startPings(){if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer=setInterval(()=>{if(this.phase!=='connected')return;const nonce=++this.nonce;this.pings.set(nonce,performance.now());if(this.pings.size>8)this.pings.delete(this.pings.keys().next().value!);this.send(create(EnvelopeSchema,{message:{case:'ping',value:{nonce}}}))},10000)}
 private send(envelope:Envelope){if(this.disposed||this.phase!=='connected'||this.socket?.readyState!==WebSocket.OPEN)throw new RuntimeError('not_connected','Reconnect to the host before issuing an order.');this.socket.send(toBinary(EnvelopeSchema,envelope))}
 async sendOrders(orders:OrderIntent[]):Promise<number>{if(!orders.length||orders.length>32)throw new RuntimeError('command_limit','Send between one and 32 orders.');const sequence=sequenceAfter(this.sequence,this.current?.economy?.lastSequence);this.send(create(EnvelopeSchema,{message:{case:'orders',value:{sequence,orders}}}));this.sequence=sequence;return sequence}
 async pause(){this.send(create(EnvelopeSchema,{message:{case:'control',value:{action:'pause'}}}))}
 async resume(){this.send(create(EnvelopeSchema,{message:{case:'control',value:{action:'resume'}}}))}
 /** Reauthenticate a replacement socket; no uncertain commands are resent. */
 reconnect(){if(this.terminalReason)return Promise.reject(new RuntimeError(this.terminalReason,this.terminalReason==='player_eliminated'?'Your commander was eliminated. Join an authorized observer view or wait for the final result.':'The reconnect window has ended. Review the result or join an authorized observer view.',false));this.stopped=false;if(!this.reconnectAt)this.reconnectAt=Date.now();return this.open(true)}
 dispose(){if(this.disposed)return;this.disposed=true;this.stopped=true;++this.epoch;if(this.retryTimer)clearTimeout(this.retryTimer);if(this.pingTimer)clearInterval(this.pingTimer);this.socket?.close(1000,'client closed');this.change('closed');this.clearListeners()}
}
