import type {Entity} from '../runtime';
import type {CatalogUnit} from '../content/catalog';

// Explicit appearance aliases, never new simulation or flight phases.
const EMPTY_BASES=new Set(['parked','rearm','takeoff','landing','launch','recover','damaged','fire']);
export function canonicalAircraftPose(name:string):string{
 const base=name.endsWith('_empty')?name.slice(0,-6):name;
 return EMPTY_BASES.has(base)?base:name;
}
export function knownEmptyAircraft(entity:Entity,unit:CatalogUnit|undefined,viewer:number|undefined):boolean{
 return viewer!==undefined&&viewer===entity.owner&&unit?.armor==='air'&&!!unit.weapon&&entity.private?.ammo===0;
}
export function emptyAircraftPose(name:string):string|undefined{
 return EMPTY_BASES.has(name)?name+'_empty':undefined;
}
export function hasEmptyAircraftPayload(name:string):boolean{
 return name==='empty'||name==='crash'||canonicalAircraftPose(name)!==name;
}
