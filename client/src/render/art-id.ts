// Stable bindings between authoritative Go IDs and the approved art inventory.
// These rename presentation only; costs, footprints and rules stay in Go.
import type {Entity} from '../runtime/types';
type PhysicalIdentity=Pick<Entity,'type'|'footprintType'|'footprintWidth'|'footprintHeight'>;
/** Go keeps a captured building's original physical foundation. A larger new
 * producer role must not paint an oversized replacement across legal lanes. */
export function physicalArtType(entity:PhysicalIdentity):string{return entity.footprintWidth>0&&entity.footprintHeight>0&&entity.footprintType?entity.footprintType:entity.type}
export function actorArtKey(entity:PhysicalIdentity,faction?:string){return `${entity.type}|${physicalArtType(entity)}|${faction??''}`}
const BUILDING_SKINS:Readonly<Record<string,string>>={hq:'hq',power:'power',supply:'supply',barracks:'barracks',factory:'factory',radar:'radar',tech:'tech',depot:'repair_depot',outpost:'outpost',bunker:'bunker',turret:'gun_turret',aa_post:'aa_post',abm:'interceptor_battery',strategic:'strategic_site'};
const SPECIAL_BUILDINGS:Readonly<Record<string,string>>={'US.airfield':'US.airfield','IR.drone_hub':'IR.drone_hub','SY.workshop_air':'SY.air_workshop','SA.airfield':'SA.airfield','SY.safehouse':'SY.safehouse'};
const OBJECT_SKINS:Readonly<Record<string,string>>={light_prop:'destructible_wall_hp_light',heavy_prop:'destructible_wall_hp_heavy',garrison:'warehouse_garrisonable',energy_station:'supply_station_neutral'};

export function authoredArtId(type:string,ownerFaction?:string):string|undefined{
 const special=SPECIAL_BUILDINGS[type];if(special)return `building.${special}`;
 if(/^(US|IR|SY|SA)\./.test(type))return `unit.${type}`;
 if(type.startsWith('map.')){const role=type.slice(4);return `prop.${OBJECT_SKINS[role]??role}`}
 const skin=BUILDING_SKINS[type];
 return skin&&ownerFaction&&['US','IR','SY','SA'].includes(ownerFaction)?`building.${ownerFaction}.${skin}`:undefined;
}
