import type {Entity,PlayerSnapshot} from '../runtime';
import type {CatalogUnit,CatalogIndex} from '../content/catalog';
import type {SpriteState} from './art';

export interface BuildingPresentation {role:string;lowPower:boolean;strategicProgress?:number;serviceActive:boolean;owned?:boolean}

/** Launch art can expose an empty rack only when Go already disclosed charges. */
export function actorEventStates(kind:string,entity:Entity,owned=false):string[]|undefined {
 if(kind==='weapon_fired')return ['fire','volley','launch'];
 if(kind==='interceptor_fired')return owned&&entity.private?.charges===0?['launch_empty','launch']:['launch'];
 if(kind==='strategic_activated')return ['activate'];
}

/** Cosmetic squad models; the Go actor retains its single health/damage pool. */
export function visibleSquadMembers(health:number,members:number):number{
  return Math.min(members,Math.max(0,Math.ceil(Math.max(0,Math.min(1000,health))*members/1000)));
}

/** Read only facts already disclosed in this player's snapshot. Enemy economy,
 * service assignments and ammunition are never inferred from allied/own data. */
export function buildingPresentations(snapshot:PlayerSnapshot,catalog:CatalogIndex):Map<number,BuildingPresentation>{
  const result=new Map<number,BuildingPresentation>();
  const serviceHomes=new Set(snapshot.entities.filter(e=>e.owner===snapshot.player&&e.landed&&e.state==='servicing'&&e.private?.home).map(e=>e.private!.home));
  for(const entity of snapshot.entities){
    const building=catalog.buildings.get(entity.type);if(!building)continue;
    const own=entity.owner===snapshot.player,economy=snapshot.economy;
    const progress=snapshot.players.find(p=>p.id===entity.owner)?.strategicProgress;
    result.set(entity.id,{role:building.role,owned:own,lowPower:own&&!!economy&&economy.powerDemand>economy.powerCapacity,serviceActive:own&&serviceHomes.has(entity.id),strategicProgress:building.role==='strategic'&&progress!==undefined&&progress>=0?progress:undefined});
  }
  return result;
}

/** Select only presentation states supported by the currently permitted Go actor. */
export function actorSpriteState(e:Entity,unit:CatalogUnit|undefined,moving:boolean,states:ReadonlyMap<string,SpriteState>,building?:BuildingPresentation,turning=0,receivingBoarder=false):SpriteState|undefined{
  const air=unit?.armor==='air';
  const loaded=!!e.private?.cargo||e.state==='returning_cargo';
  let names:string[]=[];
  if(['map.light_prop','map.heavy_prop','map.garrison'].includes(e.type))names=e.state==='destroyed'?['destroyed','wreck','rubble']:e.health<=500?['damaged','intact','idle']:['intact','idle'];
  else if(e.state==='destroyed')names=air?['crash','death','wreck']:['death','wreck','rubble'];
  else if(e.type==='map.supply_field')names=[e.state||'full'];
  else if(!e.complete)names=['construct','foundation'];
  else if(e.state==='selling')names=['sell','construct'];
  else if(!e.enabled)names=['disabled',...(loaded?['damaged_loaded']:[]),'damaged'];
  else if(e.state==='deploying')names=['deploy','deploy_build','idle'];
  else if(e.state==='packing')names=['pack','idle'];
  else if(building&&e.health<=250)names=['critical','damaged','idle'];
  else if(building&&e.health<=500)names=['damaged','idle'];
  else if(e.state==='low_power'||building?.lowPower)names=['lowpower','low_power','idle'];
  else if(e.state==='firing')names=['fire','launch','volley'];
  else if(e.state==='aiming')names=['aim','ready','idle'];
  else if(building&&e.state==='transit')names=['transfer_prep','idle'];
  else if(building&&(e.state==='unload'||e.state==='unload_exit_blocked'))names=['exit_open','idle'];
  else if(receivingBoarder&&(building||e.health>=450)&&['doors_open','exit_open'].some(name=>states.has(name)))names=building?['exit_open','doors_open','idle']:['doors_open','exit_open','idle'];
  else if(building&&e.state==='producing')names=['produce','idle'];
  else if(building?.serviceActive)names=['service_active','idle'];
  else if(building?.role==='abm'&&e.private)names=[`charges_${Math.max(0,Math.min(2,e.private.charges))}`,'idle'];
  else if(building?.strategicProgress!==undefined)names=building.strategicProgress>=1000?['ready','idle']:['charging','idle'];
  else if(building&&e.private?.passengers.length)names=['garrisoned','idle'];
  else if(e.concealed)names=['concealed_idle','cover','idle'];
  else if(e.state.includes('repair'))names=building?['repair_active','service_active','idle']:unit?.role==='medic'?['work_heal','work_repair','idle']:e.deployed?['deployed_work','work_repair','idle']:['work_repair','deployed_work','idle'];
  else if(e.state==='salvage')names=['work_salvage','channel','idle'];
  else if(e.state.includes('build'))names=['work_build','deploy_build','idle'];
  else if(e.state==='loading')names=['work_load','idle'];
  else if(e.state==='unloading')names=['work_unload','doors_open','idle'];
  else if(e.state==='unload'||e.state==='unload_exit_blocked')names=['doors_open','channel','idle'];
  else if(e.state==='designate'||e.state==='beacon')names=['channel','idle'];
  else if(e.state==='capture_exit_blocked')names=['idle'];
  else if(e.state.includes('captur'))names=['work_capture','channel','idle'];
  else if(e.state.includes('sabotage'))names=['work_sabotage','channel','idle'];
  else if(e.deployed&&unit?.role==='launcher'&&e.private)names=[e.private.charges===0?'ready_empty':e.private.charges>=2?'ready_two_charges':'ready','ready','deployed','idle'];
  else if(e.deployed)names=['deployed','ready','hulldown_idle','idle'];
  else if(air){
   if(e.landed)names=e.state==='servicing'?['rearm','parked','idle']:['parked','idle'];
   else if(e.health<450)names=['damaged','fly','hover'];
   else if(unit?.weapon&&e.private?.ammo===0)names=['empty','fly','hover'];
   else if(e.private?.orders[0]?.kind==='orbit')names=['orbit','hover','fly'];
   else if(moving&&Math.abs(turning)>1000)names=[turning>0?'bank_left':'bank_right','fly','move','hover'];
   else names=moving?['fly','move','hover']:['hover','fly'];
  }
  else if(moving)names=loaded?['move_loaded','move']:['move'];
  else if(e.health<450)names=loaded?['damaged_loaded','damaged','idle_loaded','idle']:['damaged','idle'];
  else if(loaded)names=['idle_loaded','idle'];
  else names=['idle','complete','full'];
  if(building?.role==='abm'&&building.owned&&e.private&&[0,1].includes(e.private.charges)){
   const structural=names[0]==='low_power'?'lowpower':names[0];
   if(['lowpower','disabled','damaged','critical'].includes(structural))names=[`${structural}_charges_${e.private.charges}`,...names];
  }
  for(const name of names){const state=states.get(name);if(state&&state.part!=='turret')return state}
  return [...states.values()].find(s=>s.part!=='turret'&&['idle','fly','hover','full','complete'].includes(s.name))??[...states.values()][0];
 }
