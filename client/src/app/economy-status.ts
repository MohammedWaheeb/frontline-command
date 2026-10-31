import type {Entity,PlayerSnapshot} from '../runtime/types';
import type {CatalogIndex} from '../content/catalog';
import {haulerFields} from './hauler-controls';
import {incomeWindowLabel,type RecentHaulerIncome} from './hauler-income-window';

type Position={x:number;y:number};
export interface HaulerStatus {
 id:number;name:string;state:'gathering'|'returning'|'idle_no_known_field'|'blocked'|'assigned';reason:string;
 field?:number;depot?:number;cargo:bigint;queuePosition:number;queueLength:number;position?:Position;
}
export interface PowerStatus {
 state:'normal'|'low'|'unavailable';capacity:number;demand:number;explanation:string;
 slowedBuildings:{id:number;name:string;effects:string[];position?:Position}[];
}
export interface EconomyStatus {
 incomeState:'starting_up'|'ready'|'unavailable';incomePerMinute?:bigint;incomeLabel:string;
 haulers:HaulerStatus[];fields:ReturnType<typeof haulerFields>;
 congestion:{field:number;haulerIDs:number[];message:string}[];power:PowerStatus;summary:string;
}
function haulerStatus(entity:Entity,catalog:CatalogIndex):HaulerStatus {
 const own=entity.private!;
 let state:HaulerStatus['state']='blocked',reason='Hauler idle — assign a supply field.';
 const order=own.orders[0]?.kind;
 if(own.retreating){
  state='returning';reason='Retreating to a supply center.';
 }else if(order&&order!=='gather'&&order!=='stop'&&order!=='hold'){
  state='assigned';reason=`Assigned another order: ${order.replaceAll('_',' ')}.`;
 }else if(entity.state==='no_known_supplies'){
  state='idle_no_known_field';reason='Hauler idle: no known supply field. Scout for supplies.';
 }else if(entity.state==='no_supply_center'){
  reason='No reachable operating supply center. Build or restore a supply center.';
 }else if(['returning_cargo','unloading'].includes(entity.state)||own.retreating){
  state='returning';reason=entity.state==='unloading'?'Delivering cargo.':own.retreating?'Retreating to a supply center.':'Returning cargo to a supply center.';
 }else if(order==='gather'&&['moving','turning'].includes(entity.state)){
  state=own.cargo>0n?'returning':'gathering';reason=own.cargo>0n?'Returning cargo to a supply center.':'Travelling to supplies.';
 }else if(['gathering','loading'].includes(entity.state)){
  state='gathering';reason=entity.state==='loading'?'Loading supplies.':own.harvestQueuePosition>1?'Waiting for the field loading bay.':'Travelling to supplies.';
 }else if(entity.state==='route_blocked'||entity.state==='blocked')reason='Hauler route blocked. Choose another route or field.';
 return {id:entity.id,name:catalog.name(entity.type),state,reason,field:own.field||undefined,depot:own.depot||undefined,cargo:own.cargo,queuePosition:own.harvestQueuePosition,queueLength:own.harvestQueueLength,...entity.position?{position:{x:entity.position.x,y:entity.position.y}}:{}};
}
/** Uses only disclosed owner state. Field values retain their observation age. */
export function economyStatus(snapshot:PlayerSnapshot,catalog:CatalogIndex,income?:RecentHaulerIncome):EconomyStatus {
 const owned=snapshot.entities.filter(entity=>entity.owner===snapshot.player&&entity.private&&entity.private.hp>0n&&!entity.private.container).sort((a,b)=>a.id-b.id);
 const haulers=owned.filter(entity=>catalog.units.get(entity.type)?.role==='hauler').map(entity=>haulerStatus(entity,catalog));
 const assigned=new Map<number,number[]>();
 for(const hauler of haulers)if(hauler.field&&hauler.state!=='assigned'){const ids=assigned.get(hauler.field)??[];ids.push(hauler.id);assigned.set(hauler.field,ids)}
 const congestion=[...assigned].filter(([,ids])=>ids.length>=3).sort(([a],[b])=>a-b).map(([field,haulerIDs])=>({field,haulerIDs,message:`${haulerIDs.length} haulers assigned to field ${field}. One loading bay serves each field; consider another field.`}));
 const capacity=snapshot.economy?.powerCapacity??0,demand=snapshot.economy?.powerDemand??0;
 const power:PowerStatus={state:!snapshot.economy?'unavailable':demand>capacity?'low':'normal',capacity,demand,explanation:!snapshot.economy?'Power information unavailable.':demand>capacity?`Low power: demand ${demand} exceeds capacity ${capacity}. Construction, production, research and aircraft rearming run at half speed; defenses and interception recharge slower; strategic charging stops. Build power or disable unused buildings.`:`Power demand ${demand} of ${capacity} capacity.`,slowedBuildings:[]};
 if(power.state==='low')for(const entity of owned){
  const rule=catalog.buildings.get(entity.type);if(!rule||!entity.enabled)continue;
  const effects:string[]=[];
  if(!entity.complete)effects.push('Construction at half speed');
  else {
   if(entity.private!.jobs.length)effects.push('Production and research at half speed');
   if(rule.service_slots>0)effects.push('Aircraft rearming at half speed');
   if(rule.weapon)effects.push('Weapon firing intervals doubled');
   if(rule.role==='abm')effects.push('Interceptor recharge times doubled');
   if(rule.role==='strategic')effects.push('Strategic charging stopped');
   if(rule.role==='hq')effects.push('Command Energy regeneration at half speed');
  }
  if(effects.length)power.slowedBuildings.push({id:entity.id,name:catalog.name(entity.type),effects,...entity.position?{position:{x:entity.position.x,y:entity.position.y}}:{}});
 }
 // Never reuse a rate from a prior seek or an undisclosed economy.
 const validIncome=!!snapshot.economy&&!!income&&income.amount>=0n&&income.windowTicks>0&&income.toTick===snapshot.tick&&income.fromTick>=0&&income.toTick-income.fromTick===income.windowTicks;
 const ready=validIncome&&income.coverage==='full'&&income.windowTicks>=1200;
 const incomeState:EconomyStatus['incomeState']=!snapshot.economy?'unavailable':ready?'ready':'starting_up';
 const incomePerMinute=ready?income.amount*1200n/BigInt(income.windowTicks):undefined;
 const supply=owned.some(entity=>entity.complete&&entity.enabled&&catalog.buildings.get(entity.type)?.role==='supply');
 const summary=!supply?'No operating supply center yet. Build or restore a supply center.':haulers.find(hauler=>hauler.state==='idle_no_known_field')?.reason??haulers.find(hauler=>hauler.state==='blocked')?.reason??(haulers.some(hauler=>hauler.state!=='assigned')?'Haulers working — deliveries add credits when cargo reaches a supply center.':haulers.length?'Haulers assigned to other orders. Assign gathering to resume income.':'No haulers available. Train a hauler at a supply center.');
 return {incomeState,...incomePerMinute!==undefined?{incomePerMinute}:{},incomeLabel:incomeState==='unavailable'?'Income unavailable':incomeWindowLabel(validIncome?income:undefined),haulers,fields:haulerFields(snapshot),congestion,power,summary};
}
