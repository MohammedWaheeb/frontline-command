import {RuntimeError} from './errors';
import type {MatchConnection} from './online';
import type {CommandAffordances,EntityAffordance,OrderIntent,PlayerSnapshot,ProductionStatus} from './types';
import type {OfflineTransport} from './offline';
import type {CommandDescriptor,CommandLegality,CommandEnvironment} from './command-intent';

/** Accepted means an intention may be submitted. Only execution is authoritative. */
export interface AdviceOrderResult {player:number;sequence:number;index:number;accepted:boolean;code:string;tick:number}
export interface CommandAdvice extends CommandAffordances {results:AdviceOrderResult[]}
export interface AdviceOptions {signal?:AbortSignal;isCurrent?:()=>boolean;independent?:boolean}
export interface AdvisoryLegality extends CommandLegality {certainty:'checked'|'indeterminate'|'rejected'}
const id=(value:unknown):value is number=>Number.isInteger(value)&&Number(value)>0&&Number(value)<=0xffffffff;
const tick=(value:unknown):value is number=>Number.isInteger(value)&&Number(value)>=0&&Number(value)<=0xffffffff;
function invalid():never{throw new RuntimeError('invalid_advice','The host returned invalid command advice.')}
function stringList(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=256&&value.every(item=>typeof item==='string'&&item.length<=80)&&new Set(value).size===value.length}
function parseAdvice(value:any,player:number,entities:readonly number[],orderCount:number):CommandAdvice{
 if(!value||value.player!==player||!tick(value.tick)||!stringList(value.player_commands)||!Array.isArray(value.entities)||value.entities.length!==entities.length||!Array.isArray(value.results)||value.results.length!==orderCount)invalid();
 const seen=new Set<number>();const authorized=new Set(entities);
 const parsed:EntityAffordance[]=value.entities.map((entity:any)=>{
  if(!entity||!id(entity.id)||!authorized.has(entity.id)||seen.has(entity.id)||!stringList(entity.commands)||!stringList(entity.abilities)||!stringList(entity.builds)||!stringList(entity.trains)||!stringList(entity.research))invalid();
  const statuses:ProductionStatus[]=[];const statusKeys=new Set<string>();
  if(entity.production_status!==undefined){
   if(!Array.isArray(entity.production_status)||entity.production_status.length>256)invalid();
   for(const status of entity.production_status){
    const family=status?.kind==='build'?entity.builds:status?.kind==='train'?entity.trains:status?.kind==='research'?entity.research:undefined;
    const key=`${status?.kind}:${status?.type}`,code=(value:unknown)=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(value);
    if(!family||!family.includes(status.type)||statusKeys.has(key)||!code(status.code)||status.waits_for!==undefined&&(!code(status.waits_for)||status.code!=='ok'||status.kind==='build'))invalid();
    statusKeys.add(key);statuses.push({kind:status.kind,type:status.type,code:status.code,...status.waits_for!==undefined?{waits_for:status.waits_for}:{}});
   }
  }
  seen.add(entity.id);return {id:entity.id,commands:[...entity.commands],abilities:[...entity.abilities],builds:[...entity.builds],trains:[...entity.trains],research:[...entity.research],...entity.production_status!==undefined?{production_status:statuses}:{}};
 });
 const results:AdviceOrderResult[]=value.results.map((result:any,index:number)=>{
  if(!result||result.player!==player||result.index!==index||result.tick!==value.tick||result.sequence!==0||typeof result.accepted!=='boolean'||typeof result.code!=='string'||result.code.length>80||result.accepted!==(result.code==='ok'||result.code==='indeterminate'))invalid();
  return {player,index,sequence:0,tick:value.tick,accepted:result.accepted,code:result.code};
 });
 return {tick:value.tick,player,entities:parsed,player_commands:[...value.player_commands],results};
}
async function boundedJSON(response:Response):Promise<any>{
 if(!response.body)invalid();const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256*1024){await reader.cancel();invalid()}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{invalid()}
}

function adviceDelay(milliseconds:number,signal?:AbortSignal):Promise<void>{
 if(signal?.aborted)return Promise.reject(new RuntimeError('targeting_changed','The selection or targeting changed.'));
 if(milliseconds<=0)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const canceled=()=>{clearTimeout(timer);signal?.removeEventListener('abort',canceled);reject(new RuntimeError('targeting_changed','The selection or targeting changed.'))};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',canceled);resolve()},milliseconds);
  signal?.addEventListener('abort',canceled,{once:true});
 });
}

/**
 * Slot-token advice for LAN play. Never sends orders, retries, profile tokens or
 * observed enemy IDs as the selected entities. Batch up to 32 proposed orders
 * in one request; do not poll this endpoint per animation frame.
 */
export class OnlineCommandAdvice {
 private pending:AbortController|undefined;private disposed=false;private nextRequestAt=0;
 private readonly baseURL:string;private readonly connection:MatchConnection;
 constructor(baseURL:string,connection:MatchConnection){this.baseURL=new URL(baseURL).origin;this.connection={...connection}}
 async request(entities:readonly number[]=[],orders:readonly OrderIntent[]=[],options:AdviceOptions={}):Promise<CommandAdvice>{
  if(this.disposed)throw new RuntimeError('disposed','Command advice is closed.',false);
  if(this.pending)throw new RuntimeError('advice_pending','Wait for the current command advice.');
  if(entities.length>64||entities.some(value=>!id(value))||new Set(entities).size!==entities.length||orders.length>32)throw new RuntimeError('command_limit','Advice accepts 64 owned entities and 32 orders.');
  if(options.signal?.aborted||options.isCurrent&&!options.isCurrent())throw new RuntimeError('targeting_changed','The selection or targeting changed.');
  // Explicit wire fields keep generated protobuf metadata out of strict JSON.
  const batch=orders.map(order=>({kind:order.kind??'',entities:[...(order.entities??[])],target:order.target??0,position:{x:order.position?.x??0,y:order.position?.y??0},type:order.type??'',queued:order.queued??false,index:order.index??0,points:(order.points??[]).map(point=>({x:point.x??0,y:point.y??0}))}));
  if(batch.some(order=>order.entities.length>64||order.points.length>6||order.type.length>80))throw new RuntimeError('command_limit','A proposed order exceeds the command limits.');
  const body=JSON.stringify({entities:[...entities],orders:batch,independent:!!options.independent});if(new TextEncoder().encode(body).length>64*1024)throw new RuntimeError('command_limit','The advice request exceeds 64 KiB.');
  const controller=new AbortController();this.pending=controller;
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(4000),...(options.signal?[options.signal]:[])]);
  try{
   // One source lives for the match, so affordances, candidates and final
   // previews share one budget. Delays are cancelable; failures are not retried.
   await adviceDelay(Math.max(0,this.nextRequestAt-performance.now()),signal);
   if(signal.aborted||options.isCurrent&&!options.isCurrent())throw new RuntimeError('targeting_changed','The selection or targeting changed.');
   this.nextRequestAt=performance.now()+260;
   const url=new URL(`/api/v1/matches/${encodeURIComponent(this.connection.match_id)}/advice`,this.baseURL);
   const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${this.connection.token}`,'Content-Type':'application/json'},body,signal,cache:'no-store',credentials:'omit',redirect:'error'});
   const result=await boundedJSON(response);
   if(signal.aborted||this.disposed||options.isCurrent&&!options.isCurrent())throw new RuntimeError('targeting_changed','The selection or targeting changed.');
   if(!response.ok)throw new RuntimeError(typeof result?.code==='string'?result.code:'advice_unavailable',typeof result?.message==='string'?result.message:'Command advice is unavailable.');
   return parseAdvice(result,this.connection.player,entities,orders.length);
  }catch(error){
   if(controller.signal.aborted||options.signal?.aborted||options.isCurrent&&!options.isCurrent())throw new RuntimeError('targeting_changed','The selection or targeting changed.');
   if(error instanceof RuntimeError)throw error;
   throw new RuntimeError('advice_unavailable','The host could not provide current command advice.',true,error);
  }finally{if(this.pending===controller)this.pending=undefined}
 }
 async affordances(entities:readonly number[],options?:AdviceOptions):Promise<CommandAffordances>{return this.request(entities,[],options)}
 async candidates(orders:readonly OrderIntent[],options?:AdviceOptions):Promise<Pick<CommandAdvice,'tick'|'results'>>{const {tick,results}=await this.request([],orders,{...options,independent:true});return {tick,results}}
 async preview(orders:readonly OrderIntent[],options?:AdviceOptions):Promise<Pick<CommandAdvice,'tick'|'results'>>{const {tick,results}=await this.request([],orders,{...options,independent:false});return {tick,results}}
 cancel(){this.pending?.abort()}
 dispose(){this.disposed=true;this.cancel()}
}
/** The caller must discard this list when session, ownership or selection changes. */
export function adviceSupports(affordances:CommandAffordances,entity:{id:number;owner:number},command:Pick<CommandDescriptor,'kind'>):boolean{return entity.owner===affordances.player&&affordances.entities.some(value=>value.id===entity.id&&value.commands.includes(command.kind))}
/** Indeterminate is suitable for submission, never for a green placement marker. */
export function adviceLegality(result:AdviceOrderResult):AdvisoryLegality{return {accepted:result.accepted,code:result.code,certainty:!result.accepted?'rejected':result.code==='indeterminate'?'indeterminate':'checked',...(result.code==='indeterminate'?{message:'The host will check placement, target state and other unresolved conditions when this order executes.'}:{})}}

/** Keep the guard bound to the current session, selection token and targeting generation. */
export interface CommandEnvironmentOptions {signal?:AbortSignal;isCurrent:()=>boolean}
type AdviceFrame=Pick<CommandAdvice,'tick'|'results'>;
interface EnvironmentSource {
 affordances(ids:readonly number[],options:CommandEnvironmentOptions):Promise<CommandAffordances>;
 preview(orders:OrderIntent[],options:CommandEnvironmentOptions):Promise<AdviceFrame>;
 candidates(orders:OrderIntent[],options:CommandEnvironmentOptions):Promise<AdviceFrame>;
}
async function commandEnvironment(source:EnvironmentSource,snapshot:PlayerSnapshot,ids:readonly number[],options:CommandEnvironmentOptions):Promise<CommandEnvironment>{
 const current=()=>!options.signal?.aborted&&options.isCurrent();
 const guard=()=>{if(!current())throw new RuntimeError('targeting_changed','The selection or targeting changed.')};
 guard();
 if(ids.length>4096||ids.some(value=>!id(value))||new Set(ids).size!==ids.length)throw new RuntimeError('invalid_selection','Choose distinct owned entities.');
 const frame=structuredClone(snapshot),selected=[...ids].sort((a,b)=>a-b),capabilities=new Map<number,EntityAffordance>();
 if(selected.some(value=>!frame.entities.some(entity=>entity.id===value&&entity.owner===frame.player)))throw new RuntimeError('not_controllable','The selection contains an unavailable entity.');
 // Selection-wide affordances are prefetched once, never per unit or per frame.
 for(let offset=0;offset<Math.max(1,selected.length);offset+=64){
  guard();const chunk=selected.slice(offset,offset+64),result=await source.affordances(chunk,options);guard();
  if(result.player!==frame.player||result.tick<frame.tick||result.entities.length!==chunk.length||new Set(result.entities.map(entity=>entity.id)).size!==chunk.length||result.entities.some(entity=>!chunk.includes(entity.id)||capabilities.has(entity.id)))invalid();
  for(const entity of result.entities)capabilities.set(entity.id,structuredClone(entity));
 }
 const validate=async(orders:OrderIntent[],independent:boolean):Promise<CommandLegality[]>=>{
  guard();if(orders.length>32)throw new RuntimeError('command_limit','Advice batches cannot exceed 32 orders.');
  const result=independent?await source.candidates(structuredClone(orders),options):await source.preview(structuredClone(orders),options);guard();
  if(result.tick<frame.tick||result.results.length!==orders.length)invalid();
  return result.results.map((entry,index)=>{
   if(entry.player!==frame.player||entry.index!==index||entry.sequence!==0||entry.tick!==result.tick||entry.accepted!==(entry.code==='ok'||entry.code==='indeterminate'))invalid();
   return adviceLegality(entry);
  });
 };
 return {snapshot:frame,isCurrent:current,supports:(entity,command)=>entity.owner===frame.player&&capabilities.get(entity.id)?.commands.includes(command.kind)===true,validateBatch:orders=>validate(orders,false),validateCandidates:orders=>validate(orders,true)};
}

/** Ready for planCommand/planContextCommand; no renderer or game-rule duplication. */
export function createOfflineCommandEnvironment(runtime:Pick<OfflineTransport,'affordances'|'previewOrders'|'previewCandidates'>,snapshot:PlayerSnapshot,ids:readonly number[],options:CommandEnvironmentOptions):Promise<CommandEnvironment>{
 return commandEnvironment({affordances:ids=>runtime.affordances(ids),preview:orders=>runtime.previewOrders(orders),candidates:orders=>runtime.previewCandidates(orders)},snapshot,ids,options);
}
/** Reuse one OnlineCommandAdvice for the match so its four-per-second budget is shared. */
export function createOnlineCommandEnvironment(advice:OnlineCommandAdvice,snapshot:PlayerSnapshot,ids:readonly number[],options:CommandEnvironmentOptions):Promise<CommandEnvironment>{
 return commandEnvironment(advice,snapshot,ids,options);
}
