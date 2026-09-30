import {RuntimeError} from './errors';
import type {SaveData,SessionInfo} from './types';
import type {LocalSave} from './storage';

export interface AutosaveSource{readonly mode:'offline'|'online';save():Promise<SaveData>}
export interface AutosaveSink{autosave(save:SaveData,name?:string):Promise<LocalSave>}
export interface AutosaveCheckpoint{id:string;name:string}
export interface AutosaveObservation{session:string;info:Pick<SessionInfo,'tick'|'replay'>;checkpoint?:AutosaveCheckpoint}
export interface AutosaveStatus{phase:'idle'|'saving'|'saved'|'waiting'|'blocked'|'closed';session?:string;lastSavedTick?:number;nextAttemptTick?:number;error?:RuntimeError;save?:LocalSave}
export interface AutosaveOptions{intervalTicks?:number;retryTicks?:number;maxRetryTicks?:number;onStatus?:(status:AutosaveStatus)=>void}
interface Candidate{session:string;generation:number;tick:number;checkpoint?:AutosaveCheckpoint;snapshot?:SaveData}

/** Drives safe snapshots from simulation ticks. It never advances or pauses the engine. */
export class AutosaveCoordinator{
 private session:string|undefined;private generation=0;private lastSavedTick:number|undefined;private nextAttemptTick=0;
 private seenCheckpoints=new Set<string>();private pending:Candidate|undefined;private retryCandidate:Candidate|undefined;private active:Candidate|undefined;private running:Promise<void>|undefined;
 private closed=false;private blocked=false;private failures=0;private latestTick=0;private current:AutosaveStatus={phase:'idle'};
 private readonly interval:number;private readonly retryBase:number;private readonly maxRetry:number;
 constructor(private readonly source:AutosaveSource,private readonly sink:AutosaveSink,private readonly options:AutosaveOptions={}){
  this.interval=options.intervalTicks??1200;this.retryBase=options.retryTicks??100;this.maxRetry=options.maxRetryTicks??1200;
  if([this.interval,this.retryBase,this.maxRetry].some(value=>!Number.isSafeInteger(value)||value<1)||this.maxRetry<this.retryBase)throw new RuntimeError('autosave_configuration','Autosave tick intervals must be positive whole numbers.');
 }
 get status():AutosaveStatus{return {...this.current}}
 private publish(status:AutosaveStatus){this.current=status;try{this.options.onStatus?.({...status})}catch{/* A presentation listener cannot interrupt persistence. */}}
 /** Supply a new unique session token on every create/load/restart, including a replay load. */
 observe(observation:AutosaveObservation):Promise<void>{
  if(this.closed)return Promise.resolve();
  const {session,info,checkpoint}=observation;
  if(typeof session!=='string'||!session||session.length>200||!Number.isSafeInteger(info.tick)||info.tick<0)throw new RuntimeError('autosave_observation','Autosave needs a session ID and valid simulation tick.');
  if(checkpoint&&(!checkpoint.id||checkpoint.id.length>200||!checkpoint.name.trim()||checkpoint.name.length>100))throw new RuntimeError('autosave_checkpoint','Checkpoint IDs and labels must be valid.');
  if(session!==this.session){this.session=session;this.generation++;this.lastSavedTick=undefined;this.nextAttemptTick=info.tick+this.interval;this.latestTick=info.tick;this.failures=0;this.blocked=false;this.seenCheckpoints.clear();this.pending=undefined;this.retryCandidate=undefined;this.publish({phase:'idle',session})}
  this.latestTick=info.tick;
  if(this.source.mode!=='offline'||info.replay){this.generation++;this.pending=undefined;this.retryCandidate=undefined;this.publish({phase:'idle',session:this.session,lastSavedTick:this.lastSavedTick});return this.running??Promise.resolve()}
  // A newly loaded session starts its periodic schedule at the loaded tick. An
  // explicit opening checkpoint can still request an immediate snapshot.
  const freshCheckpoint=checkpoint&&!this.seenCheckpoints.has(checkpoint.id)&&checkpoint.id!==this.retryCandidate?.checkpoint?.id&&!(this.active?.generation===this.generation&&checkpoint.id===this.active.checkpoint?.id)?checkpoint:undefined;
  const candidate:Candidate={session,generation:this.generation,tick:info.tick,checkpoint:freshCheckpoint};
  // Keep the failed captured bytes independently from one waiting checkpoint.
  // Notifications during backoff or a storage block must not erase either one.
  if(this.blocked||this.failures>0){if(freshCheckpoint)this.pending=candidate;if(this.blocked||info.tick<this.nextAttemptTick)return this.running??Promise.resolve();return this.start()}
  if(!freshCheckpoint&&this.pending===undefined&&info.tick<this.nextAttemptTick)return this.running??Promise.resolve();
  // Preserve a pending checkpoint when ordinary tick notifications arrive.
  this.pending={...candidate,checkpoint:freshCheckpoint??this.pending?.checkpoint};
  return this.start();
 }
 private start():Promise<void>{
  if(this.running)return this.running;
  this.running=Promise.resolve().then(()=>this.drain()).finally(()=>{this.running=undefined;if(this.pending&&!this.closed&&!this.blocked&&this.failures===0)return this.start()});return this.running;
 }
 private async drain(){
  while((this.retryCandidate||this.pending)&&!this.closed&&!this.blocked){
   const candidate=this.retryCandidate??this.pending!;if(!this.retryCandidate)this.pending=undefined;
   if(candidate.generation!==this.generation)continue;
   this.active=candidate;
   this.publish({phase:'saving',session:this.session,lastSavedTick:this.lastSavedTick});
   try{
    const snapshot=candidate.snapshot??await this.source.save();
    if(this.closed||candidate.generation!==this.generation)continue;
    if(!Number.isSafeInteger(snapshot.tick)||snapshot.tick<candidate.tick)throw new RuntimeError('autosave_stale','The snapshot predates the requested checkpoint. Try saving again.');
    candidate.snapshot=structuredClone(snapshot);
    const saved=await this.sink.autosave(snapshot,candidate.checkpoint?.name??'Autosave');
    if(this.closed||candidate.generation!==this.generation)continue;
    this.lastSavedTick=saved.tick;this.nextAttemptTick=saved.tick+this.interval;this.failures=0;this.retryCandidate=undefined;
    if(candidate.checkpoint)this.seenCheckpoints.add(candidate.checkpoint.id);
    // Ticks received while writing are covered by this snapshot or by the new
    // interval. Keep only a different explicitly requested checkpoint.
    const queued=this.pending as Candidate|undefined;
    if(queued&&(!queued.checkpoint||this.seenCheckpoints.has(queued.checkpoint.id)))this.pending=undefined;
    this.publish({phase:'saved',session:this.session,lastSavedTick:saved.tick,nextAttemptTick:this.nextAttemptTick,save:saved});
   }catch(cause){
    if(this.closed||candidate.generation!==this.generation)continue;
    const error=RuntimeError.from(cause);this.failures++;
    this.nextAttemptTick=this.latestTick+Math.min(this.maxRetry,this.retryBase*2**Math.min(this.failures-1,10));
    this.blocked=['storage_full','storage_unavailable','validator_missing'].includes(error.code)||!error.recoverable;
    // Retry this exact snapshot before capturing the independently queued one.
    this.retryCandidate=candidate;
    this.publish({phase:this.blocked?'blocked':'waiting',session:this.session,lastSavedTick:this.lastSavedTick,nextAttemptTick:this.nextAttemptTick,error});break;
   }finally{this.active=undefined}
  }
 }
 /** Call after the player frees storage or resolves a displayed recovery issue. */
 retry():Promise<void>{
  if(this.closed)return Promise.resolve();this.blocked=false;this.nextAttemptTick=this.latestTick;return this.start();
 }
 /** Wait for an in-flight write; does not manufacture a new snapshot. */
 flush():Promise<void>{return this.running??Promise.resolve()}
 /** Existing committed autosaves remain; a snapshot still being captured is discarded. */
 close(){if(this.closed)return;this.closed=true;this.generation++;this.pending=undefined;this.retryCandidate=undefined;this.publish({phase:'closed',session:this.session,lastSavedTick:this.lastSavedTick})}
}
