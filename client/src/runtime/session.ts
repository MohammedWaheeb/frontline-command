import {OfflineTransport} from './offline';
import {OnlineTransport,type MatchConnection} from './online';
import {LocalStore,type LocalSave,type ReplayInspection} from './storage';
import {AutosaveCoordinator,type AutosaveStatus} from './autosave';
import {RuntimeError} from './errors';
import type {GameMap,GameTransport,OfflineConfig,RuntimeEvent,SaveData,SessionInfo,Speed} from './types';

export type SessionKind='solo'|'practice'|'replay'|'online';
export interface SessionState{phase:'menu'|'loading'|'active'|'closed';id?:string;kind?:SessionKind;map?:GameMap;info?:SessionInfo;loading?:SessionKind}
export type SessionEvent={type:'session';state:SessionState}|{type:'runtime';session:string;event:RuntimeEvent}|{type:'autosave';session:string;status:AutosaveStatus}|{type:'error';error:RuntimeError};
export type OfflineSession=Pick<OfflineTransport,'mode'|'current'|'ready'|'create'|'load'|'loadReplay'|'restart'|'map'|'save'|'exportReplay'|'inspect'|'inspectReplay'|'subscribe'|'sendOrders'|'pause'|'resume'|'dispose'|'setSpeed'|'setPerspective'|'seekReplay'>;
export type OnlineSession=Pick<OnlineTransport,'mode'|'current'|'connect'|'subscribe'|'sendOrders'|'pause'|'resume'|'dispose'>;
export type SessionStorage=Pick<LocalStore,'getSave'|'getReplay'|'putSave'|'putReplay'|'autosave'>;
export interface SessionOptions{
 runtimeURL?:string;databaseName?:string;store?:SessionStorage;
 makeOffline?:()=>OfflineSession;makeOnline?:(baseURL:string,connection:MatchConnection)=>OnlineSession;
 /** Claude's asset loader supplies this hook. It must observe cancellation. */
 prepare?:(input:{kind:SessionKind;map?:GameMap;config?:OfflineConfig},signal:AbortSignal)=>Promise<void>;
}
interface Active{id:string;kind:SessionKind;map:GameMap;info?:SessionInfo;transport:GameTransport;offline?:OfflineSession;unsubscribe:()=>void;autosave?:AutosaveCoordinator}
interface Launch{kind:SessionKind;generation:number;abort:AbortController;candidate?:GameTransport}

/** Nonvisual ownership of worker/socket lifetimes and persistence integration.
 * The prior session remains usable until a replacement has actually loaded. */
export class SessionController{
 readonly store:SessionStorage;
 private active:Active|undefined;private launching:Launch|undefined;private generation=0;private closed=false;
 private validator:OfflineSession|undefined;private ownedStore:LocalStore|undefined;private listeners=new Set<(event:SessionEvent)=>void>();
 private readonly makeOffline:()=>OfflineSession;private readonly makeOnline:(baseURL:string,connection:MatchConnection)=>OnlineSession;
 constructor(private readonly options:SessionOptions={}){
  this.makeOffline=options.makeOffline??(()=>new OfflineTransport(options.runtimeURL));
  this.makeOnline=options.makeOnline??((base,connection)=>new OnlineTransport(base,connection));
  this.store=options.store??(this.ownedStore=new LocalStore(options.databaseName,data=>this.inspect(data),data=>this.inspectReplay(data)));
 }
 get transport():GameTransport|undefined{return this.active?.transport}
 get state():SessionState{return {phase:this.closed?'closed':this.launching?'loading':this.active?'active':'menu',id:this.active?.id,kind:this.active?.kind,map:this.active?.map,info:this.active?.info?structuredClone(this.active.info):undefined,loading:this.launching?.kind}}
 subscribe(listener:(event:SessionEvent)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
 private emit(event:SessionEvent){for(const listener of this.listeners){try{listener(event)}catch(error){console.error('Frontline session subscriber failed',error)}}}
 private announce(){this.emit({type:'session',state:this.state})}
 private alive(){if(this.closed)throw new RuntimeError('disposed','This session controller is closed.',false)}
 private begin(kind:SessionKind):Launch{
  this.alive();this.cancelLaunch(false);const launch:Launch={generation:++this.generation,abort:new AbortController(),kind};this.launching=launch;this.announce();return launch;
 }
 private currentLaunch(launch:Launch){if(this.closed||this.launching!==launch||launch.abort.signal.aborted)throw new RuntimeError('launch_canceled','This game launch was canceled.');}
 cancelLaunch(announce=true){const old=this.launching;if(!old)return;this.launching=undefined;old.abort.abort();old.candidate?.dispose();if(announce)this.announce()}
 private release(active:Active|undefined){if(!active)return;active.unsubscribe();active.autosave?.close();active.transport.dispose()}
 private install(launch:Launch,kind:SessionKind,map:GameMap,transport:GameTransport,info?:SessionInfo,offline?:OfflineSession){
  this.currentLaunch(launch);
  const previous=this.active,id=`session-${launch.generation}`;
  const active:Active={id,kind,map:structuredClone(map),info,transport,offline,unsubscribe:()=>{}};
  this.active=active;this.launching=undefined;
  if(offline&&kind!=='replay')active.autosave=new AutosaveCoordinator(offline,this.store,{onStatus:status=>{if(this.active===active)this.emit({type:'autosave',session:id,status})}});
  active.unsubscribe=transport.subscribe(event=>{
   if(this.active!==active)return;
   if(event.type==='snapshot'&&active.info){active.info={...active.info,tick:event.snapshot.tick,finished:event.snapshot.outcome?.finished===true||active.info.replay&&event.snapshot.tick>=active.info.replay_end};this.observe(active)}
   this.emit({type:'runtime',session:id,event});
  });
  this.release(previous);this.announce();this.observe(active,true);
  if(transport.current)this.emit({type:'runtime',session:id,event:{type:'snapshot',snapshot:transport.current}});
 }
 private observe(active:Active,opening=false){
  if(!active.autosave||!active.info)return;
  const progress=active.transport.current?.mission;
  const checkpoint=progress?.checkpoint?{id:`${progress.checkpointTick}:${progress.checkpoint}`,name:progress.checkpoint}:opening?{id:'opening',name:active.kind==='practice'?'Practice start':'Opening checkpoint'}:undefined;
  void active.autosave.observe({session:active.id,info:active.info,checkpoint}).catch(cause=>this.emit({type:'error',error:RuntimeError.from(cause)}));
 }
 private failed(launch:Launch,error:unknown):never{
  launch.candidate?.dispose();if(this.launching===launch){this.launching=undefined;this.announce();if(!launch.abort.signal.aborted)this.emit({type:'error',error:RuntimeError.from(error)})}
  if(launch.abort.signal.aborted)throw new RuntimeError('launch_canceled','This game launch was canceled.');throw error;
 }
 private async offlineLaunch(kind:SessionKind,load:(runtime:OfflineSession)=>Promise<SessionInfo>,config?:OfflineConfig){
  const launch=this.begin(kind);
  try{
   if(config){await this.options.prepare?.({kind,map:config.map,config},launch.abort.signal);this.currentLaunch(launch)}
   const runtime=this.makeOffline();launch.candidate=runtime;await runtime.ready;this.currentLaunch(launch);
   const info=await load(runtime);this.currentLaunch(launch);const map=await runtime.map();this.currentLaunch(launch);
   const actualKind:SessionKind=info.replay?'replay':info.metadata?.ruleset==='practice-v1'?'practice':'solo';
   if(!config){await this.options.prepare?.({kind:actualKind,map},launch.abort.signal);this.currentLaunch(launch)}
   this.install(launch,actualKind,map,runtime,info,runtime);return this.state;
  }catch(error){return this.failed(launch,error)}
 }
 startSolo(config:OfflineConfig){const copy=structuredClone(config);return this.offlineLaunch(copy.ruleset==='practice-v1'?'practice':'solo',runtime=>runtime.create(copy),copy)}
 continueSave(id:string){return this.offlineLaunch('solo',async runtime=>{const record=await this.store.getSave(id);if(!record)throw new RuntimeError('save_missing','This local save no longer exists.');return runtime.load(record.data,record.local_players)})}
 loadSave(save:SaveData){const data=save.data.slice(),players=[...save.local_players];return this.offlineLaunch(save.metadata.ruleset==='practice-v1'?'practice':'solo',runtime=>runtime.load(data,players))}
 openStoredReplay(id:string){return this.offlineLaunch('replay',async runtime=>{const record=await this.store.getReplay(id);if(!record)throw new RuntimeError('replay_missing','This local replay no longer exists.');return runtime.loadReplay(record.data)})}
 playReplay(bytes:Uint8Array){const data=bytes.slice();return this.offlineLaunch('replay',runtime=>runtime.loadReplay(data))}
 async joinOnline(baseURL:string,connection:MatchConnection,map:GameMap){
  const launch=this.begin('online');
  try{await this.options.prepare?.({kind:'online',map},launch.abort.signal);this.currentLaunch(launch);const online=this.makeOnline(baseURL,{...connection});launch.candidate=online;await online.connect();this.currentLaunch(launch);if(online.current?.metadata?.mapVersion!==map.version)throw new RuntimeError('map_version_mismatch','The loaded map version differs from the host match. Reload its content before reconnecting.');this.install(launch,'online',map,online);return this.state}
  catch(error){return this.failed(launch,error)}
 }
 async restart(){
  const old=this.active;if(!old?.offline||old.kind==='replay')throw new RuntimeError('restart_unavailable','Restart is available only in a solo or practice match.');
  return this.offlineLaunch(old.kind,async runtime=>{const snapshot=await old.offline!.save();await runtime.load(snapshot.data,snapshot.local_players);return runtime.restart()});
 }
 async saveManual(id:string,name:string,expectedRevision=0):Promise<LocalSave>{
  const active=this.active;if(!active?.offline||active.kind==='replay')throw new RuntimeError('save_unavailable','Manual saves are available only in live solo or practice play.');
  const snapshot=await active.offline.save();if(this.active!==active)throw new RuntimeError('session_changed','The active match changed before saving.');return this.store.putSave(id,name,snapshot,expectedRevision);
 }
 async archiveReplay(id:string,name:string,expectedRevision=0){const active=this.active;if(!active?.offline)throw new RuntimeError('replay_unavailable','Download the authoritative server replay for an online match.');const bytes=await active.offline.exportReplay();if(this.active!==active)throw new RuntimeError('session_changed','The active match changed before replay export.');return this.store.putReplay(id,name,bytes,expectedRevision)}
 pause(){if(!this.active)throw new RuntimeError('no_match','No match is loaded.');return this.active.transport.pause()}
 resume(){if(!this.active)throw new RuntimeError('no_match','No match is loaded.');return this.active.transport.resume()}
 setSpeed(speed:Speed){if(!this.active?.offline)throw new RuntimeError('standard_online_speed','Online simulation speed is controlled by the host.');return this.active.offline.setSpeed(speed)}
 setPerspective(player:number){if(!this.active?.offline)throw new RuntimeError('online_perspective','An online commander cannot change player perspective.');return this.active.offline.setPerspective(player)}
 async seekReplay(tick:number){const active=this.active;if(active?.kind!=='replay'||!active.offline)throw new RuntimeError('no_replay','No replay is loaded.');const info=await active.offline.seekReplay(tick);if(this.active===active){active.info=info;this.announce()}return info}
 async retryAutosave(){await this.active?.autosave?.retry()}
 async flushAutosave(){await this.active?.autosave?.flush()}
 /** The UI owns the explicit quit/surrender/save choice before calling leave. */
 leave(){this.cancelLaunch(false);this.release(this.active);this.active=undefined;this.validator?.dispose();this.validator=undefined;this.announce()}
 private async inspector(){
  this.alive();if(!this.validator)this.validator=this.makeOffline();const validator=this.validator;
  try{await validator.ready;if(this.closed||this.validator!==validator)throw new RuntimeError('inspection_canceled','The validation worker was closed. Retry the import.');return validator}
  catch(error){if(this.validator===validator){validator.dispose();this.validator=undefined}throw error}
 }
 async inspect(data:Uint8Array){return (await this.inspector()).inspect(data)}
 async inspectReplay(data:Uint8Array):Promise<ReplayInspection>{return (await this.inspector()).inspectReplay(data)}
 dispose(){if(this.closed)return;this.leave();this.closed=true;this.announce();this.listeners.clear();void this.ownedStore?.close().catch(error=>console.error('Frontline local storage close failed',error));this.ownedStore=undefined}
}
