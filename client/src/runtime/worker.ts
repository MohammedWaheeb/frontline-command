import {RuntimeError} from './errors';
import type {SessionInfo,Speed} from './types';
interface GoResult{ok:boolean;json?:string;bytes?:Uint8Array;error?:string}
interface GoAPI{[name:string]:(...args:unknown[])=>GoResult}
interface Scope {
 postMessage(message:unknown,transfer?:Transferable[]):void;
 addEventListener(type:'message',listener:(event:MessageEvent)=>void):void;
 importScripts(...urls:string[]):void;
 Go:new()=>{importObject:WebAssembly.Imports;run(instance:WebAssembly.Instance):Promise<void>};
 __frontlineGo?:GoAPI;__frontlineGoReady?:()=>void;
}
const scope=self as unknown as Scope;
let initialized=false,disposed=false,active=false,paused=true,speed:Speed=1,player=1,accumulator=0,last=performance.now(),lastFrame=0;
let info:SessionInfo|undefined;
function call(method:string,...args:unknown[]):any {
 const api=scope.__frontlineGo;
 if(!api||!api[method])throw new RuntimeError('worker_not_ready','The offline simulation is not ready.');
 const result=api[method](...args);
 if(!result.ok){try{throw RuntimeError.from(JSON.parse(result.error??'{}'))}catch(error){throw RuntimeError.from(error)}}
 const value=result.json===undefined?undefined:JSON.parse(result.json);
 if(result.bytes)return value===undefined?result.bytes:{...value,data:result.bytes};
 return value;
}
function clock(stalled=false){scope.postMessage({event:'clock',paused,speed,stalled})}
function frame(){
 if(!active)return;
 const bytes=call('view',player) as Uint8Array;
 scope.postMessage({event:'frame',bytes},[bytes.buffer as ArrayBuffer]);lastFrame=info?.tick??0;
}
async function init(config:{wasmURL:string;execURL:string}){
 if(initialized)throw new RuntimeError('already_initialized','This worker already owns a simulation runtime.');
 initialized=true;
 // Runtime and engine are packaged together; no CDN or AI service is involved.
 scope.importScripts(config.execURL);
 const go=new scope.Go();
 const ready=new Promise<void>((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new RuntimeError('worker_timeout','The offline engine did not start. Retry loading the local runtime.')),15000);
  scope.__frontlineGoReady=()=>{clearTimeout(timeout);resolve()};
 });
 const response=await fetch(config.wasmURL);
 if(!response.ok)throw new RuntimeError('runtime_missing','The Go simulation file is missing. Download the local game content first.');
 const instance=await WebAssembly.instantiate(await response.arrayBuffer(),go.importObject);
 void go.run(instance.instance).catch(error=>{if(!disposed){paused=true;scope.postMessage({event:'error',error:{code:'engine_fault',message:String(error),recoverable:false}})}});
 await ready;return call('version');
}
async function handle(method:string,args:any[]){
 if(disposed)throw new RuntimeError('disposed','The game worker has been closed.',false);
 switch(method){
 case 'init':return init(args[0]);
 case 'create':
  if(!Number.isSafeInteger(args[0].seed)||args[0].seed<1)throw new RuntimeError('invalid_seed','Choose a positive safe integer seed.');
  info=call('create',JSON.stringify(args[0]));active=true;player=info!.local_players[0];paused=true;accumulator=0;frame();clock();return info;
 case 'load':info=call('load',args[0],JSON.stringify(args[1]));active=true;player=info!.local_players[0];paused=true;accumulator=0;frame();clock();return info;
 case 'restart':info=call('restart');active=true;player=info!.local_players[0];paused=true;accumulator=0;frame();clock();return info;
 case 'loadReplay':info=call('loadReplay',args[0]);active=true;player=info!.local_players[0];paused=true;accumulator=0;frame();clock();return info;
 case 'seekReplay':info=call('seekReplay',args[0]);paused=true;accumulator=0;frame();clock();return info;
 case 'previewOrders':return call('previewOrders',player,args[0]);
 case 'candidates':return call('candidates',player,args[0]);
 case 'affordances':return call('affordances',player,JSON.stringify(args[0]));
 case 'submit':return call('submit',player,args[0]);
 case 'step':
  if(!paused)throw new RuntimeError('manual_step_running','Pause solo play before advancing it manually.');
  info=call('step',args[0]);frame();return info;
 case 'perspective':
  if(!info?.local_players.includes(args[0]))throw new RuntimeError('unauthorized_view','This player is not a local human.');
  player=args[0];frame();return info;
 case 'pause':paused=true;accumulator=0;clock();return;
 case 'resume':if(!active)throw new RuntimeError('no_match','No offline match is loaded.');paused=false;last=performance.now();accumulator=0;clock();return;
 case 'speed':if(![0.75,1,1.5].includes(args[0]))throw new RuntimeError('invalid_speed','Choose 0.75, 1 or 1.5 speed.');speed=args[0];clock();return;
 case 'view':return call('view',player);
 case 'validateMap':case 'validateMission':case 'content':case 'inspectReplay':case 'exportReplay':case 'replayCommands':case 'map':case 'save':case 'hash':case 'info':case 'inspect':return call(method,...args);
 case 'dispose':disposed=true;active=false;paused=true;clearInterval(timer);call('dispose');call('exit');return;
 default:throw new RuntimeError('invalid_method','Unknown worker operation.');
 }
}
let serial=Promise.resolve();
scope.addEventListener('message',event=>{
 const {id,method,args=[]}=event.data??{};
 if(!Number.isSafeInteger(id)||typeof method!=='string')return;
 serial=serial.then(async()=>{
  try{const result=await handle(method,args);scope.postMessage({id,ok:true,result})}
  catch(error){const e=RuntimeError.from(error);scope.postMessage({id,ok:false,error:{code:e.code,message:e.message,recoverable:e.recoverable,details:e.details}})}
 });
});
const timer=setInterval(()=>{
 const now=performance.now(),elapsed=now-last;last=now;
 if(!active||paused||disposed)return;
 // A throttled solo worker slows simulation time; it never jumps thousands of
 // ticks or modifies an online clock. The UI receives a visible stalled signal.
 const stalled=elapsed>1000;
 accumulator=Math.min(250,accumulator+Math.max(0,Math.min(elapsed,250))*speed);
 const ticks=Math.floor(accumulator/50);if(ticks===0)return;accumulator-=ticks*50;
 try{
  info=call('step',ticks);
  if((info?.tick??0)-lastFrame>=4||info?.finished)frame();
  if(info?.finished){paused=true;clock()}
  else if(stalled)clock(true);
 }catch(error){paused=true;const e=RuntimeError.from(error);scope.postMessage({event:'error',error:{code:e.code,message:e.message,recoverable:e.recoverable}});clock()}
},10);
