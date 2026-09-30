import type {CatalogIndex} from '../content/catalog';
import {credits,formatClock} from '../content/labels';
import type {CommandAffordances,Entity,PlayerSnapshot} from '../runtime/types';
import type {CommandRequest} from '../runtime/command-intent';
import {selectableOwnEntities} from '../runtime/interaction';

export type HaulerAction={kind:'field';id:number}|{kind:'depot';id:number}|{kind:'retreat';enabled:boolean};
export interface HaulerFieldChoice {id:number;remaining:bigint;seen:number;current:boolean;label:string}
export interface HaulerSelection {haulers:Entity[];ids:number[];allSelected:boolean;cargo:bigint;fieldPin:number|'mixed';depotPin:number|'mixed';retreat:boolean|'mixed'}
type HaulerCommand='gather'|'gather_depot'|'retreat_when_attacked';
const validID=(id:number)=>Number.isInteger(id)&&id>0&&id<=0xffffffff;
const endpointID=(id:number)=>id===0||validID(id);
const pointValid=(point:{x:number;y:number}|undefined)=>!!point&&Number.isInteger(point.x)&&Number.isInteger(point.y)&&point.x>=0&&point.y>=0&&point.x<=0x7fffffff&&point.y<=0x7fffffff;
function shared<T extends number|boolean>(values:T[]):T|'mixed'{return values.every(value=>value===values[0])?values[0]:'mixed'}

/** Disclosed exact-owner data only. A mixed selection is informative, never a
 * permission to silently send a setting to a filtered subset of the forces. */
export function haulerSelection(snapshot:PlayerSnapshot|undefined,catalog:Pick<CatalogIndex,'units'>,ids:readonly number[]):HaulerSelection|undefined{
 if(!snapshot||!ids.length)return;
 const owned=selectableOwnEntities(snapshot),unique=[...new Set(ids)],haulers=unique.flatMap(id=>{
  const entity=owned.find(entity=>entity.id===id&&entity.private);
  return entity&&catalog.units.get(entity.type)?.role==='hauler'?[entity]:[];
 });
 if(!haulers.length)return;
 return {haulers,ids:haulers.map(entity=>entity.id),allSelected:haulers.length===ids.length&&unique.length===ids.length&&ids.every(validID),cargo:haulers.reduce((sum,entity)=>sum+entity.private!.cargo,0n),fieldPin:shared(haulers.map(entity=>entity.private!.pinnedField)),depotPin:shared(haulers.map(entity=>entity.private!.pinnedDepot)),retreat:shared(haulers.map(entity=>entity.private!.retreatWhenAttacked))};
}

/** A current field overrides its last observation. Unseen observations retain
 * their disclosed value and timestamp; selecting one never refreshes its stock. */
export function haulerFields(snapshot:PlayerSnapshot):HaulerFieldChoice[]{
 const fields=new Map<number,HaulerFieldChoice>();
 const add=(field:{id:number;remaining:bigint;position?:{x:number;y:number}},seen:number,current:boolean)=>{
  if(!validID(field.id)||!pointValid(field.position)||field.remaining<0n||seen>snapshot.tick)return;
  fields.set(field.id,{id:field.id,remaining:field.remaining,seen,current,label:`Field ${field.id} · ${credits(field.remaining)} credits ${current?'remaining':`last seen at ${formatClock(seen)} (stale)`}`});
 };
 for(const field of snapshot.knownFields)add(field,field.seen,false);
 for(const field of snapshot.fields)add(field,snapshot.tick,true);
 return [...fields.values()].sort((a,b)=>a.id-b.id);
}

/** A depot option is an observed, completed, operating owned supply center.
 * This is an input affordance; Go still checks reachability and actual legality. */
export function haulerDepots(snapshot:PlayerSnapshot,catalog:Pick<CatalogIndex,'buildings'>):Entity[]{
 return snapshot.entities.filter(entity=>entity.owner===snapshot.player&&entity.private&&entity.private.hp>0n&&entity.complete&&entity.enabled&&pointValid(entity.position)&&catalog.buildings.get(entity.type)?.role==='supply').sort((a,b)=>a.id-b.id);
}
export function haulerCommandAvailable(selection:HaulerSelection|undefined,advice:CommandAffordances|undefined,player:number,kind:HaulerCommand):boolean{
 return !!selection?.allSelected&&advice?.player===player&&selection.ids.every(id=>advice.entities.some(entity=>entity.id===id&&entity.commands.includes(kind)));
}

/** Produce only canonical configuration intentions. Endpoint zero is explicit
 * automatic choice; neither depot nor retreat configuration can be queued. */
export function haulerRequest(snapshot:PlayerSnapshot,catalog:Pick<CatalogIndex,'units'|'buildings'>,ids:readonly number[],advice:CommandAffordances|undefined,action:HaulerAction):CommandRequest|undefined{
 const selection=haulerSelection(snapshot,catalog,ids);if(!selection?.allSelected)return;
 if(action.kind==='retreat'){
  if(typeof action.enabled!=='boolean'||!haulerCommandAvailable(selection,advice,snapshot.player,'retreat_when_attacked'))return;
  return {kind:'retreat_when_attacked',entities:[...selection.ids],queued:false,index:action.enabled?1:0};
 }
 if(!endpointID(action.id))return;
 if(action.kind==='field'){
  if(!haulerCommandAvailable(selection,advice,snapshot.player,'gather')||action.id!==0&&!haulerFields(snapshot).some(field=>field.id===action.id))return;
  return {kind:'gather',entities:[...selection.ids],queued:false,...(action.id?{target:{kind:'field' as const,id:action.id}}:{})};
 }
 if(action.kind==='depot'){
  if(!haulerCommandAvailable(selection,advice,snapshot.player,'gather_depot')||action.id!==0&&!haulerDepots(snapshot,catalog).some(depot=>depot.id===action.id))return;
  return {kind:'gather_depot',entities:[...selection.ids],queued:false,...(action.id?{target:{kind:'entity' as const,id:action.id}}:{})};
 }
}
export function sameHaulerSelection(expected:readonly number[],actual:readonly number[]):boolean{
 return expected.length===actual.length&&new Set(expected).size===expected.length&&new Set(actual).size===actual.length&&expected.every(id=>validID(id)&&actual.includes(id));
}
export function haulerQueueLabel(entity:Entity):string{
 const state=entity.private;if(!state)return 'Loading reservation unavailable';
 const position=state.harvestQueuePosition,length=state.harvestQueueLength;
 if(position>0&&length>=position)return `Loading reservation ${position} of ${length} (your haulers)`;
 return length>0?`No loading reservation · ${length} own reservations reported`:'No loading reservation reported';
}
export function haulerRouteLabel(entity:Entity,snapshot:PlayerSnapshot,catalog:Pick<CatalogIndex,'name'>):string{
 const state=entity.private;if(!state)return 'Route unavailable';
 const depot=snapshot.entities.find(value=>value.id===state.depot&&value.owner===snapshot.player);
 return `${state.field?`Field ${state.field}`:'No field assigned'} → ${depot?`${catalog.name(depot.type)} #${depot.id}`:state.depot?`Depot #${state.depot} (unavailable)`:'No depot assigned'}${state.retreating?' · retreating with cargo':''}`;
}
