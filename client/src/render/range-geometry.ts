import type {Point} from '../runtime/types';
import type {TacticalSelection,TacticalWeaponRange} from '../app/tactical-presentation';
import {tacticalCircle} from './tactical-geometry';

export type RangeMode='off'|'weapon'|'sight'|'detection';
export const RANGE_MODES:readonly RangeMode[]=['off','weapon','sight','detection'];
export interface RangeOutline {kind:'weapon'|'minimum'|'sight'|'detection';points:Point[];caption:string}

/** Advisory reach to a point target, offset from the disclosed firing footprint.
 * Actual target extent, line of sight, stance/ammo and legality remain in Go. */
export function weaponReach(center:Point,origin:TacticalWeaponRange['origin'],distance:number):Point[]{
 if(!Number.isFinite(distance)||distance<0||!Number.isFinite(center.x)||!Number.isFinite(center.y))return [];
 if(origin.kind==='circle')return Number.isFinite(origin.radius)&&origin.radius>=0?tacticalCircle(center,distance+origin.radius):[];
 if(!Number.isFinite(origin.width)||!Number.isFinite(origin.height)||origin.width<=0||origin.height<=0)return [];
 const w=origin.width/2,h=origin.height/2,points:Point[]=[];
 const corners=[{x:w,y:h,angle:0},{x:-w,y:h,angle:Math.PI/2},{x:-w,y:-h,angle:Math.PI},{x:w,y:-h,angle:Math.PI*1.5}];
 const arcSteps=Math.max(8,Math.min(64,Math.ceil(distance*Math.PI/2/500)));
 for(const [index,corner] of corners.entries()){
  for(let i=0;i<=arcSteps;i++){const angle=corner.angle+i/arcSteps*Math.PI/2;points.push({x:center.x+corner.x+Math.cos(angle)*distance,y:center.y+corner.y+Math.sin(angle)*distance})}
  const next=corners[(index+1)%4],angle=corner.angle+Math.PI/2,start=points.at(-1)!,end={x:center.x+next.x+Math.cos(angle)*distance,y:center.y+next.y+Math.sin(angle)*distance};
  const steps=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.y-start.y)/500));
  for(let i=1;i<steps;i++)points.push({x:start.x+(end.x-start.x)*i/steps,y:start.y+(end.y-start.y)*i/steps});
 }
 return points;
}

export function selectionRange(item:TacticalSelection,mode:RangeMode):RangeOutline[]{
 if(mode==='weapon'){
  const r=item.weaponRange;if(!r)return [];
  const result:RangeOutline[]=[{kind:'weapon',points:weaponReach(item.position,r.origin,r.maximum),caption:`WEAPON ${r.maximum/1000}t · REFERENCE`}];
  if(r.minimum>0)result.push({kind:'minimum',points:weaponReach(item.position,r.origin,r.minimum),caption:`MINIMUM ${r.minimum/1000}t`});
  return result.filter(value=>value.points.length>0);
 }
 if(mode==='sight'||mode==='detection'){
  const r=item.ranges;if(!r)return [];const radius=mode==='sight'?r.sightRadius:r.detectionRadius;
  if(!Number.isFinite(radius)||radius<=0)return [];
  return [{kind:mode,points:tacticalCircle(item.position,radius),caption:mode==='sight'?`${r.airborneSight?'AIR SIGHT':'SIGHT'} ${radius/1000}t${r.airborneSight?'':' · TERRAIN LIMITS'}`:`DETECTION ${radius/1000}t · SIGHT REQUIRED`}];
 }
 return [];
}
