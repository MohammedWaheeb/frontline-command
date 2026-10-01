import type {CatalogIndex} from './catalog';
import type {PlayerSnapshot} from '../runtime/types';
import type {ProductionChoice} from '../app/battle-controller';

export type RequirementState='met'|'missing'|'unfinished'|'disabled'|'unavailable'|'unknown';
export interface BuildingRequirement {
 role:string;name:string;type?:string;state:RequirementState;
 active:number[];unfinished:number[];disabled:number[];unavailable:number[];
}
export interface BuildingPrerequisiteModel {
 type:string;name:string;requirements:BuildingRequirement[];
 technology:{reported:number|undefined;tier2:BuildingRequirement[];tier3:BuildingRequirement[]};
 lowPower:boolean|undefined;
 check:{state:'blocked'|'site'|'unavailable';message:string};
}
type BuildChoice=Pick<ProductionChoice,'type'|'kind'|'available'|'reason'|'waitsFor'>;

/** Names and own-view explanations only. Go retains availability and execution.
 * A building has role prerequisites, not a building-tier field. */
export function buildingRequirement(snapshot:PlayerSnapshot,catalog:CatalogIndex,role:string):BuildingRequirement {
 const faction=snapshot.players.find(player=>player.id===snapshot.player)?.faction;
 const definitions=[...catalog.buildings.values()].filter(building=>!building.id.startsWith('map.')&&building.role===role&&(!building.faction||building.faction===faction));
 const definition=definitions.find(building=>building.faction===faction)??definitions.find(building=>!building.faction);
 const result:BuildingRequirement={role,type:definition?.id,name:definition?.name??role,state:'unknown',active:[],unfinished:[],disabled:[],unavailable:[]};
 if(!definition)return result;
 for(const entity of snapshot.entities){
  // Health is a normalized display value and can be zero on a living actor.
  // Use current owner private HP; never enemy, remembered or footprint types.
  if(entity.owner!==snapshot.player||!entity.private||entity.private.hp<=0n)continue;
  const building=catalog.buildings.get(entity.type);
  if(!building||building.id.startsWith('map.')||building.role!==role)continue;
  if(entity.private.container){result.unavailable.push(entity.id);continue}
  if(!entity.complete)result.unfinished.push(entity.id);
  else if(!entity.enabled)result.disabled.push(entity.id);
  else result.active.push(entity.id);
 }
 result.state=result.active.length?'met':result.disabled.length?'disabled':result.unfinished.length?'unfinished':result.unavailable.length?'unavailable':'missing';
 return result;
}

export function requirementStateLabel(requirement:BuildingRequirement):string {
 switch(requirement.state){
  case 'met':return 'completed and enabled';
  case 'missing':return 'missing';
  case 'unfinished':return 'unfinished';
  case 'disabled':return 'disabled or sabotaged';
  case 'unavailable':return 'unavailable';
  default:return 'host check required';
 }
}

export function requirementActionKind(requirement:BuildingRequirement):'none'|'build'|'finish'|'enable'|'wait'|'host_check' {
 switch(requirement.state){
  case 'met':return 'none';
  case 'missing':return 'build';
  case 'unfinished':return 'finish';
  case 'disabled':return 'enable';
  case 'unavailable':return 'wait';
  default:return 'host_check';
 }
}

export function requirementAction(requirement:BuildingRequirement):string {
 switch(requirementActionKind(requirement)){
  case 'none':return requirement.name+' meets this prerequisite.';
  case 'build':return 'Build '+requirement.name+'.';
  case 'finish':return 'Finish '+requirement.name+' with an engineering rig.';
  case 'enable':return 'Select '+requirement.name+' and enable it when available. A timed sabotage effect must end before it becomes active.';
  case 'wait':return requirement.name+' is not currently active. The host checks when it can satisfy this prerequisite.';
  default:return 'The host checks the '+requirement.name+' prerequisite. No building type is inferred.';
 }
}

/** Preserve the real advice blocker. A satisfied prerequisite is not a promise
 * of funds, a free structure slot, a usable rig or a legal visible foundation. */
export function buildCheck(choice:BuildChoice):BuildingPrerequisiteModel['check'] {
 if(!choice.available)return {state:choice.reason?'blocked':'unavailable',message:choice.reason??'Availability unavailable'};
 return {state:'site',message:'Choose a visible legal site. The host checks placement when the order executes.'};
}

export function buildingPrerequisites(snapshot:PlayerSnapshot|undefined,catalog:CatalogIndex,choice:BuildChoice):BuildingPrerequisiteModel|undefined {
 if(!snapshot||choice.kind!=='build')return undefined;
 const faction=snapshot.players.find(player=>player.id===snapshot.player)?.faction,building=catalog.buildings.get(choice.type);
 if(!faction||!building||building.id.startsWith('map.')||building.faction&&building.faction!==faction)return undefined;
 const requirement=(role:string)=>buildingRequirement(snapshot,catalog,role),radar=requirement('radar'),tech=requirement('tech');
 const reported=snapshot.economy?.tier;
 return {
  type:building.id,name:building.name,requirements:building.prerequisites.map(requirement),
  technology:{reported:reported===1||reported===2||reported===3?reported:undefined,tier2:[radar],tier3:[radar,tech]},
  lowPower:snapshot.economy?snapshot.economy.powerDemand>snapshot.economy.powerCapacity:undefined,
  check:buildCheck(choice),
 };
}
