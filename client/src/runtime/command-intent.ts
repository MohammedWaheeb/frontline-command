import type {Entity, OrderIntent, PlayerSnapshot, Point} from './types';
import {currentVisibleEntity, sameSelection, selectableOwnEntities, type SelectionToken} from './interaction';

export const COMMAND_LIMITS={entitiesPerOrder:64,ordersPerBatch:32,queuedOrders:10,pointsPerOrder:6,plannedOrders:4096} as const;
export type TargetKind='ground'|'entity'|'field'|'station'|'salvage';
export type CommandTarget={kind:'ground';position:Point}|{kind:Exclude<TargetKind,'ground'>;id:number};
export interface CommandDescriptor {
 kind:string;
 targets:readonly TargetKind[];
 targetOptional?:boolean;
 selection:'group'|'single'|'each'|'none';
 queueable:boolean;
 /** Only equivalent movement/stance intentions may be split into 64-unit orders. */
 splittable?:boolean;
}
const command=(kind:string,targets:TargetKind[],selection:CommandDescriptor['selection']='group',queueable=true,splittable=false,targetOptional=false):CommandDescriptor=>({kind,targets,selection,queueable,splittable,targetOptional});
/** Wire/input shape only. Roster capabilities, costs, ranges and legal layers are not encoded here. */
export const STANDARD_COMMAND_DESCRIPTORS:readonly CommandDescriptor[]=[
 ...['move','attack_move','force_fire','aggressive','patrol'].map(kind=>command(kind,['ground'],'group',true,true)),
 command('attack',['entity'],'group',true,true),
 command('guard',['ground','entity'],'group',true,true),
 command('escort',['entity'],'group',true,true),
 ...['stop','hold'].map(kind=>command(kind,[],'group',true,true,true)),
 command('return',['entity'],'group',true,true,true),
 ...['repair','board'].map(kind=>command(kind,['entity'],'group',true,true)),
 command('resume',['entity'],'each',false,false),
 command('capture',['entity','station'],'group',true,true),
 command('unload',['ground'],'group',true,true),
 command('gather',['field'],'group',true,true,true),
 command('salvage',['salvage'],'group',true,true),
 command('rally',['ground'],'each',false,false),
 command('build',['ground'],'single',false,false),
 ...['train','research','cancel'].map(kind=>command(kind,[],'single',false,false,true)),
 ...['sell','power'].map(kind=>command(kind,[],'each',false,false,true)),
 ...['deploy','pack','repeat_sortie'].map(kind=>command(kind,[],'group',false,true,true)),
 command('ability',['ground','entity','station'],'group',false,false,true),
 command('ping',['ground'],'none',false,false),
 ...['surrender','surrender_vote','surrender_cancel','repair_reserve','convoy_hold','convoy_advance'].map(kind=>command(kind,[],'none',false,false,true)),
];
export interface CommandLegality {accepted:boolean;code:string;message?:string;certainty?:'checked'|'indeterminate'|'rejected'}
export interface CommandEnvironment {
 snapshot:PlayerSnapshot;
 /** Catalog/Go supplied capabilities. These are affordances, never proof of success. */
 supports:(entity:Entity,command:CommandDescriptor)=>boolean;
 descriptors?:readonly CommandDescriptor[];
 /** Advisory current-tick Go preview, if available. Online execution still revalidates. */
 validate?:(order:OrderIntent)=>CommandLegality|Promise<CommandLegality>;
 /** Sequential actual batch semantics; no more than 32 orders per call. */
 validateBatch?:(orders:OrderIntent[])=>CommandLegality[]|Promise<CommandLegality[]>;
 /** Alternatives at one tick, independent of one another; context commands only. */
 validateCandidates?:(orders:OrderIntent[])=>CommandLegality[]|Promise<CommandLegality[]>;
 /** Cancel an in-flight preview if targeting, selection, perspective or session changes. */
 isCurrent?:()=>boolean;
 selectable?:(entity:Entity)=>boolean;
}
export interface CommandRequest {kind:string;entities:readonly number[];target?:CommandTarget;queued?:boolean;type?:string;index?:number;points?:readonly Point[];allowPartial?:boolean}
export interface CommandIssue {code:string;message?:string;entities:number[]}
export interface CommandPlan {orders:OrderIntent[];batches:OrderIntent[][];issues:CommandIssue[];validation:'previewed'|'indeterminate'|'unverified';tick:number}

function idValid(id:number){return Number.isInteger(id)&&id>0&&id<=0xffffffff}
function pointValid(point:Point){return Number.isInteger(point.x)&&Number.isInteger(point.y)&&point.x>=0&&point.y>=0&&point.x<=0x7fffffff&&point.y<=0x7fffffff}
function copyPoint(point:Point):Point{return {x:point.x,y:point.y}}
function uniqueIDs(ids:readonly number[]):number[]{return [...new Set(ids)].sort((a,b)=>a-b)}
function emptyPlan(env:CommandEnvironment,issues:CommandIssue[]=[]):CommandPlan{return {orders:[],batches:[],issues,validation:env.validateBatch||env.validate?'previewed':'unverified',tick:env.snapshot.tick}}
function issue(code:string,entities:readonly number[]=[],message?:string):CommandIssue{return {code,entities:[...entities],...(message?{message}: {})}}
function descriptorFor(env:CommandEnvironment,kind:string){return (env.descriptors??STANDARD_COMMAND_DESCRIPTORS).find(descriptor=>descriptor.kind===kind)}

function resolvedTarget(snapshot:PlayerSnapshot,target:CommandTarget):{id?:number;position:Point}|undefined{
 if(target.kind==='ground')return pointValid(target.position)?{position:copyPoint(target.position)}:undefined;
 if(!idValid(target.id))return undefined;
 let position:Point|undefined;
 switch(target.kind){
  case 'entity': position=currentVisibleEntity(snapshot,target.id)?.position;break;
  case 'field': position=snapshot.fields.find(field=>field.id===target.id)?.position;break;
  case 'station': position=snapshot.stations.find(station=>station.id===target.id)?.position;break;
  case 'salvage': position=snapshot.salvage.find(salvage=>salvage.id===target.id)?.position;break;
 }
 return position&&pointValid(position)?{id:target.id,position:copyPoint(position)}:undefined;
}

/** Frames already contain only authorized objects. Never resolve IDs from map objects or memory. */
export function resolveCommandTarget(snapshot:PlayerSnapshot,target:CommandTarget):{id?:number;position:Point}|undefined{return resolvedTarget(snapshot,target)}

function materialize(request:CommandRequest,ids:number[],resolved?:{id?:number;position:Point}):OrderIntent{
 const result:OrderIntent={kind:request.kind,entities:[...ids],queued:!!request.queued};
 if(resolved){result.position=copyPoint(resolved.position);if(resolved.id!==undefined)result.target=resolved.id}
 if(request.type!==undefined)result.type=request.type;
 if(request.index!==undefined)result.index=request.index;
 if(request.points)result.points=request.points.map(copyPoint);
 return result;
}

/** Splits complete intentions into transport frames; it never splits semantic abilities. */
export function batchOrders(orders:readonly OrderIntent[]):OrderIntent[][]{
 if(orders.length>COMMAND_LIMITS.plannedOrders)throw new RangeError('Too many planned orders');
 const batches:OrderIntent[][]=[];
 for(const input of orders){
  const ids=input.entities??[];
  if(ids.length>COMMAND_LIMITS.entitiesPerOrder||ids.some(id=>!idValid(id))||new Set(ids).size!==ids.length||(input.points?.length??0)>COMMAND_LIMITS.pointsPerOrder)throw new RangeError('Invalid order size or entity IDs');
  if(batches.length===0||batches[batches.length-1].length===COMMAND_LIMITS.ordersPerBatch)batches.push([]);
  batches[batches.length-1].push(structuredClone(input));
 }
 return batches;
}

/** One batch callback is one actual wire batch; candidate callbacks have independent semantics. */
async function checkOrders(orders:readonly OrderIntent[],env:CommandEnvironment,independent=false):Promise<CommandLegality[]|undefined>{
 const result:CommandLegality[]=[];
 const current=()=>!env.isCurrent||env.isCurrent();
 const batch=independent?env.validateCandidates:env.validateBatch;
 for(let i=0;i<orders.length;i+=COMMAND_LIMITS.ordersPerBatch){
  if(!current())return undefined;
  const chunk=orders.slice(i,i+COMMAND_LIMITS.ordersPerBatch);
  try{
   if(batch){
    const values=await batch(structuredClone(chunk));if(!current())return undefined;
    if(!Array.isArray(values)||values.length!==chunk.length||values.some(value=>typeof value?.accepted!=='boolean'||typeof value.code!=='string'))throw new Error('Invalid Go preview batch');
    result.push(...values.map(value=>({...value})));
   }else for(const order of chunk){
    if(!current())return undefined;
    const value=env.validate?await env.validate(structuredClone(order)):{accepted:true,code:'unverified'};
    if(!current())return undefined;
    result.push({...value});
   }
  }catch(error){if(!current())return undefined;throw error}
 }
 return current()?result:undefined;
}

/** Returns intentions and explicit reasons. It never spends, mutates a snapshot or sends a command. */
export async function planCommand(request:CommandRequest,env:CommandEnvironment):Promise<CommandPlan>{
 const plan=emptyPlan(env),descriptor=descriptorFor(env,request.kind);
 const reject=(code:string,ids:readonly number[]=request.entities,message?:string)=>emptyPlan(env,[issue(code,ids,message)]);
 if(env.isCurrent&&!env.isCurrent())return reject('targeting_changed');
 if(!descriptor)return reject('unknown_command');
 if(request.entities.length>4096||request.entities.some(id=>!idValid(id)))return reject('invalid_selection');
 if(request.type!==undefined&&(typeof request.type!=='string'||request.type.length>80)||request.index!==undefined&&(!Number.isInteger(request.index)||request.index<0||request.index>1000000))return reject('invalid_order');
 if(request.points&&((request.points.length>COMMAND_LIMITS.pointsPerOrder)||request.points.some(point=>!pointValid(point))))return reject('invalid_points');
 if(request.queued&&!descriptor.queueable)return reject('cannot_queue');
 if(request.kind==='return'&&request.target&&request.queued)return reject('rebase_not_queueable');
 if(!request.target&&!descriptor.targetOptional)return reject('target_required');
 if(request.target&&!descriptor.targets.includes(request.target.kind))return reject('invalid_target_kind');
 const resolved=request.target?resolvedTarget(env.snapshot,request.target):undefined;
 if(request.target&&!resolved)return reject(request.target.kind==='ground'?'invalid_position':'target_not_visible');
 const available=new Map(selectableOwnEntities(env.snapshot,env.selectable).map(entity=>[entity.id,entity]));
 const ids=descriptor.selection==='none'?[]:uniqueIDs(request.entities),selected:Entity[]=[];
 for(const id of ids){
  const entity=available.get(id);
  if(!entity){plan.issues.push(issue('not_controllable',[id]));continue}
  if(!env.supports(entity,descriptor)){plan.issues.push(issue('unsupported_command',[id]));continue}
  if(request.queued&&(entity.private?.orders.length??0)>=COMMAND_LIMITS.queuedOrders){plan.issues.push(issue('queue_full',[id]));continue}
  selected.push(entity);
 }
 if(plan.issues.length&&!request.allowPartial)return {...plan,orders:[],batches:[]};
 if(descriptor.selection!=='none'&&selected.length===0){if(!plan.issues.length)plan.issues.push(issue('selection_empty'));return plan}
 if(descriptor.selection==='single'&&selected.length!==1)return reject('one_selection_required');
 const selection=selected.map(entity=>entity.id),orders:OrderIntent[]=[];
 if(descriptor.selection==='none')orders.push(materialize(request,[],resolved));
 else if(descriptor.selection==='each')for(const id of selection)orders.push(materialize(request,[id],resolved));
 else {
  if(selection.length>COMMAND_LIMITS.entitiesPerOrder&&(!descriptor.splittable||request.kind==='return'&&request.target))return reject('selection_limit',selection);
  for(let i=0;i<selection.length;i+=COMMAND_LIMITS.entitiesPerOrder)orders.push(materialize(request,selection.slice(i,i+COMMAND_LIMITS.entitiesPerOrder),resolved));
 }
 const advice=await checkOrders(orders,env);
 if(!advice)return reject('targeting_changed');
 for(let i=0;i<orders.length;i++){
  const legality=advice[i],order=orders[i];
  if(!legality.accepted){plan.issues.push(issue(legality.code,order.entities??[],legality.message));continue}
  if(legality.code==='indeterminate'||legality.certainty==='indeterminate')plan.validation='indeterminate';
  plan.orders.push(order);
 }
 // Separate current-tick previews do not reserve resources across wire batches.
 if(orders.length>COMMAND_LIMITS.ordersPerBatch&&plan.validation==='previewed')plan.validation='indeterminate';
 if(plan.issues.length&&!request.allowPartial)plan.orders=[];
 plan.batches=batchOrders(plan.orders);
 return plan;
}

export type TargetRelationship='own'|'allied'|'hostile'|'neutral'|'unknown';
export function targetRelationship(snapshot:PlayerSnapshot,entity:Entity):TargetRelationship{
 if(entity.owner===snapshot.player)return 'own';
 if(entity.owner===0)return 'neutral';
 const us=snapshot.players.find(player=>player.id===snapshot.player),them=snapshot.players.find(player=>player.id===entity.owner);
 if(!us||!them)return 'unknown';
 return us.team===them.team?'allied':'hostile';
}

/** Context priority is an input convention; each candidate still requires capabilities and Go approval. */
export function contextualCandidates(entity:Entity,target:CommandTarget,snapshot:PlayerSnapshot):string[]{
 switch(target.kind){
  case 'ground':return ['rally','move'];
  case 'field':return ['gather'];
  case 'station':return ['capture'];
  case 'salvage':return ['salvage'];
  case 'entity':{
   const hit=currentVisibleEntity(snapshot,target.id);
   if(!hit)return [];
   if(entity.id===hit.id&&entity.private?.passengers.length)return ['unload'];
   const relation=targetRelationship(snapshot,hit);
   if(relation==='own')return hit.complete?['return','repair','board','guard']:['resume','repair','board','guard'];
   if(relation==='allied')return ['board','escort','guard'];
   if(relation==='hostile'||relation==='neutral')return ['capture','attack','board'];
   return [];
  }
 }
}

/** Mixed forces retain their applicable contextual actions; unsupported units never chase an enemy. */
export async function planContextCommand(entities:readonly number[],target:CommandTarget,env:CommandEnvironment,options:{queued?:boolean;candidates?:typeof contextualCandidates}={}):Promise<CommandPlan>{
 const plan=emptyPlan(env),resolved=resolvedTarget(env.snapshot,target);
 const stale=()=>emptyPlan(env,[issue('targeting_changed',entities)]);
 if(env.isCurrent&&!env.isCurrent())return stale();
 if(entities.length===0)return emptyPlan(env,[issue('selection_empty')]);
 if(!resolved)return emptyPlan(env,[issue('target_not_visible',entities)]);
 if(entities.length>4096||entities.some(id=>!idValid(id)))return emptyPlan(env,[issue('invalid_selection',entities)]);
 if(env.validateBatch&&!env.validateCandidates&&!env.validate)return emptyPlan(env,[issue('independent_preview_required',entities)]);
 const own=new Map(selectableOwnEntities(env.snapshot,env.selectable).map(entity=>[entity.id,entity]));
 const probes:OrderIntent[]=[],choices:Array<{id:number;indices:number[];last?:CommandIssue}>=[];
 // Shape/capability checks prepare all alternatives before any gameplay call.
 const shapeOnly:CommandEnvironment={...env,validate:undefined,validateBatch:undefined,validateCandidates:undefined};
 for(const id of uniqueIDs(entities)){
  if(env.isCurrent&&!env.isCurrent())return stale();
  const entity=own.get(id);
  if(!entity){plan.issues.push(issue('not_controllable',[id]));continue}
  const choice:{id:number;indices:number[];last?:CommandIssue}={id,indices:[]};choices.push(choice);
  for(const kind of (options.candidates??contextualCandidates)(entity,target,env.snapshot)){
   const descriptor=descriptorFor(env,kind);
   if(!descriptor||!env.supports(entity,descriptor))continue;
   const commandTarget=kind==='unload'&&target.kind==='entity'&&target.id===entity.id?{kind:'ground' as const,position:resolved.position}:target;
   const attempt=await planCommand({kind,entities:[id],target:commandTarget,queued:options.queued},shapeOnly);
   if(env.isCurrent&&!env.isCurrent())return stale();
   if(!attempt.orders.length){choice.last=attempt.issues[0];continue}
   if(probes.length>=COMMAND_LIMITS.plannedOrders)return emptyPlan(env,[issue('candidate_limit',entities)]);
   choice.indices.push(probes.length);probes.push(attempt.orders[0]);
  }
 }
 // Probe the highest remaining priority together. Only rejected commanders
 // enter a later round, so an army's successful attack never also probes board.
 const chosen=new Map<number,OrderIntent>();
 let pending=choices.filter(choice=>choice.indices.length).map(choice=>({choice,cursor:0}));
 while(pending.length){
  const proposed=pending.map(({choice,cursor})=>probes[choice.indices[cursor]]);
  const candidateAdvice=await checkOrders(proposed,env,true);if(!candidateAdvice)return stale();
  const next:typeof pending=[];
  for(let i=0;i<pending.length;i++){
   const item=pending[i],legality=candidateAdvice[i];
   if(legality.accepted){chosen.set(item.choice.id,proposed[i]);continue}
   item.choice.last=issue(legality.code,[item.choice.id],legality.message);
   if(item.cursor+1<item.choice.indices.length)next.push({choice:item.choice,cursor:item.cursor+1});
  }
  pending=next;
 }
 const accepted:OrderIntent[]=[];
 for(const choice of choices){const order=chosen.get(choice.id);if(order)accepted.push(order);else plan.issues.push(choice.last??issue('no_context_command',[choice.id]))}
 // Coalesce only explicitly equivalent group commands. Single-producer and
 // semantic commands retain separate intentions. This is input shape, not rules.
 const combined=new Map<string,OrderIntent[]>(),selected:OrderIntent[]=[];
 for(const order of accepted){
  const descriptor=descriptorFor(env,order.kind??'');
  if(!descriptor?.splittable||descriptor.selection!=='group'){selected.push(order);continue}
  const key=JSON.stringify({...order,entities:[]}),groups=combined.get(key)??[];
  if(!groups.length||(groups[groups.length-1].entities?.length??0)>=COMMAND_LIMITS.entitiesPerOrder)groups.push({...order,entities:[]});
  groups[groups.length-1].entities!.push(...order.entities??[]);combined.set(key,groups);
 }
 for(const orders of combined.values())selected.push(...orders);
 // Independent probes cannot approve combined spending, source assignments or
 // reservations. Recheck every final wire batch sequentially, even singletons.
 const finalAdvice=await checkOrders(selected,env);if(!finalAdvice)return stale();
 for(let i=0;i<selected.length;i++){
  const legality=finalAdvice[i];
  if(!legality.accepted){plan.issues.push(issue(legality.code,selected[i].entities??[],legality.message));continue}
  if(legality.code==='indeterminate'||legality.certainty==='indeterminate')plan.validation='indeterminate';
  plan.orders.push(selected[i]);
 }
 if(selected.length>COMMAND_LIMITS.ordersPerBatch&&plan.validation==='previewed')plan.validation='indeterminate';
 plan.batches=batchOrders(plan.orders);
 return plan;
}

export function commonCommands(ids:readonly number[],env:CommandEnvironment):CommandDescriptor[]{
 const own=new Map(selectableOwnEntities(env.snapshot,env.selectable).map(entity=>[entity.id,entity]));
 const selected=uniqueIDs(ids).map(id=>own.get(id));
 if(!selected.length||selected.some(entity=>!entity))return [];
 return (env.descriptors??STANDARD_COMMAND_DESCRIPTORS).filter(descriptor=>descriptor.selection!=='none'&&(descriptor.selection!=='single'||selected.length===1)&&selected.every(entity=>env.supports(entity!,descriptor)));
}

export interface TargetedCommand {kind:string;type?:string;index?:number;queued?:boolean}
export type TargetingChoice={status:'pending';remaining:number}|{status:'canceled'}|{status:'ready';request:CommandRequest;generation:number};
/** Locks ability identity and selection across multi-point targeting and asynchronous previews. */
export class CommandTargeting {
 private active:{command:TargetedCommand;selection:SelectionToken;count:number;points:Point[];ready:boolean}|undefined;
 private generation=0;
 get targeting(){return this.active!==undefined}
 get points():Point[]{return this.active?.points.map(point=>({...point}))??[]}
 begin(command:TargetedCommand,selection:SelectionToken,pointCount=1):void{
  if(!command.kind||!Number.isInteger(pointCount)||pointCount<1||pointCount>COMMAND_LIMITS.pointsPerOrder)throw new RangeError('Invalid targeting request');
  this.generation++;this.active={command:structuredClone(command),selection:structuredClone(selection),count:pointCount,points:[],ready:false};
 }
 cancel():void{this.generation++;this.active=undefined}
 reconcile(selection:SelectionToken):boolean{if(this.active&&!sameSelection(this.active.selection,selection))this.cancel();return this.targeting}
 current(generation:number,selection:SelectionToken):boolean{return !!this.active&&this.generation===generation&&sameSelection(this.active.selection,selection)}
 choose(target:CommandTarget,selection:SelectionToken,queued?:boolean):TargetingChoice{
  if(!this.reconcile(selection)||!this.active||this.active.ready)return {status:'canceled'};
  const active=this.active;
  if(active.count>1){
   if(target.kind!=='ground'||!pointValid(target.position))return {status:'pending',remaining:active.count-active.points.length};
   active.points.push({...target.position});this.generation++;
   if(active.points.length<active.count)return {status:'pending',remaining:active.count-active.points.length};
  }
  active.ready=true;this.generation++;
  return {status:'ready',generation:this.generation,request:{...active.command,entities:[...active.selection.ids],target:active.count>1?{kind:'ground',position:{...active.points[0]}}:structuredClone(target),queued:queued??active.command.queued,...active.count>1?{points:active.points.map(point=>({...point}))}: {}}};
 }
}
