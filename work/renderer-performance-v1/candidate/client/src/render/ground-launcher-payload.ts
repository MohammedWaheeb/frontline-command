import type {Entity} from '../runtime';
import type {CatalogUnit} from '../content/catalog';

const TYPES=new Set(['US.launcher','IR.launcher','SY.launcher','SA.launcher']);
const MOBILE=new Set(['idle','move','damaged','deploy','pack']);
export function isGroundLauncher(type:string,unit:CatalogUnit|undefined):boolean{
 return TYPES.has(type)&&unit?.role==='launcher'&&unit.armor!=='air';
}
/** Cosmetic variants use current post-shot charges; the Go event remains the
 * only trigger. Foreign/missing/invalid knowledge never grants a private pose. */
export function groundLauncherPose(entity:Entity,unit:CatalogUnit|undefined,viewer:number|undefined,name:string):string|undefined{
 if(viewer===undefined||viewer!==entity.owner||!isGroundLauncher(entity.type,unit))return;
 const charges=entity.private?.charges;
 if(charges!==0&&charges!==1&&charges!==2)return;
 if(entity.type!=='IR.launcher'&&charges===2)return;
 if(name==='fire'&&entity.type==='IR.launcher'&&charges===1)return 'fire_charges_1';
 if(MOBILE.has(name)&&(charges===0||entity.type==='IR.launcher'&&charges===1))return `${name}_charges_${charges}`;
}
export function canonicalGroundLauncherPose(name:string):string{
 const match=/^(idle|move|damaged|deploy|pack|fire)_charges_[01]$/.exec(name);
 return match?match[1]:name;
}
/** Safe async page fallback classes. A firing sequence may depict its departing
 * missile, so it cannot stand in for a later stationary payload count. */
export function groundLauncherPayloadKey(type:string,name:string):string{
 if(['fire','fire_charges_1','launch','volley'].includes(name))return 'cue:'+name;
 const partial=/_charges_([01])$/.exec(name);
 if(partial&&MOBILE.has(canonicalGroundLauncherPose(name)))return 'charge:'+partial[1];
 if(name==='ready_empty')return 'charge:0';
 if(name==='ready_two_charges')return 'charge:2';
 if(name==='ready')return 'charge:1';
 if(MOBILE.has(name))return 'charge:'+(type==='IR.launcher'?2:1);
 return 'other:'+name;
}
