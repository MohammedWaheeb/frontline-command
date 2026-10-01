import type {Entity,PlayerSnapshot,Point} from '../runtime';

export interface OwnerInterception {
 radius:number;capacity:number;active:boolean;ready:boolean;
 rechargeRequired:number;rechargeRate:number;nextChargeTicks?:number;fireReadyAt:number;
 assignments:Array<{projectile:number;impact:Point;interceptAt:number}>;
}
export interface OwnerRanges {
 sightRadius:number;detectionRadius:number;airborneSight:boolean;buildRadius:number;
 interception?:OwnerInterception;
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const uint=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=0x7fffffff;

/** Optional owner-private presentation. Absent old-runtime data has no guessed
 * replacement. These values never decide order legality or reveal fog. */
export function ownerRanges(entity:Entity,snapshot:PlayerSnapshot):OwnerRanges|undefined {
 if(entity.owner!==snapshot.player||!entity.private||entity.private.container||entity.health<=0||entity.state==='destroyed')return;
 const raw=(entity.private as typeof entity.private&{ranges?:unknown}).ranges;
 if(!record(raw)||!uint(raw.sightRadius)||!uint(raw.detectionRadius)||!uint(raw.buildRadius)||typeof raw.airborneSight!=='boolean')return;
 const out:OwnerRanges={sightRadius:raw.sightRadius,detectionRadius:raw.detectionRadius,airborneSight:raw.airborneSight,buildRadius:raw.buildRadius};
 const d=raw.interception;
 if(d===undefined||d===null)return out;
 if(!record(d)||!uint(d.radius)||d.radius===0||!uint(d.capacity)||d.capacity===0||typeof d.active!=='boolean'||typeof d.ready!=='boolean'||!uint(d.rechargeRequired)||d.rechargeRequired===0||!uint(d.rechargeRate)||!uint(d.fireReadyAt)||!Array.isArray(d.assignments))return out;
 if(d.nextChargeTicks!==undefined&&(!uint(d.nextChargeTicks)||d.nextChargeTicks===0||!d.active||d.rechargeRate===0))return out;
 if(d.ready&&(!d.active||entity.private.charges<=0||d.fireReadyAt>snapshot.tick))return out;
 const assignments:OwnerInterception['assignments']=[],seen=new Set<number>();
 // A descriptor may link only an actual currently public impact warning. It
 // never recovers a hidden body position or pairs nearby visual events.
 for(const value of d.assignments.slice(0,64)){
  if(!record(value)||!uint(value.projectile)||value.projectile===0||seen.has(value.projectile)||!uint(value.interceptAt)||value.interceptAt<=snapshot.tick||!record(value.impact)||!uint(value.impact.x)||!uint(value.impact.y))continue;
  const projectile=snapshot.projectiles.find(p=>p.id===value.projectile&&p.warning&&p.interceptable);
  if(!projectile?.impact||projectile.impact.x!==value.impact.x||projectile.impact.y!==value.impact.y)continue;
  assignments.push({projectile:value.projectile,impact:{x:value.impact.x,y:value.impact.y},interceptAt:value.interceptAt});seen.add(value.projectile);
 }
 out.interception={radius:d.radius,capacity:d.capacity,active:d.active,ready:d.ready,rechargeRequired:d.rechargeRequired,rechargeRate:d.rechargeRate,...d.nextChargeTicks!==undefined?{nextChargeTicks:d.nextChargeTicks as number}:{},fireReadyAt:d.fireReadyAt,assignments};
 return out;
}
