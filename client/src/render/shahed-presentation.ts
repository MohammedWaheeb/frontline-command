import {toScreen} from './iso';

/** Exact identity only. No reusable aircraft art may impersonate this unit. */
export function isShahed(type:string):boolean{return type==='IR.shahed'}
export const SHAHED_ROLE_LABEL='One-way ground-impact drone';
/** Public static selection copy; never guesses commitment from private state. */
export function shahedSelectionTelemetry(type:string):string|undefined{return isShahed(type)?'One-way ground impact · Return/Recall only before commitment':undefined}
export const SHAHED_ICON_BODY='32,5 49,27 36,24 32,31 28,24 15,27';
export const SHAHED_ICON_IMPACT='M32 32v6m-3-3 3 3 3-3M23 40h18';

/** Explicit procedural marker, never native geometry or an authored sprite.
 * All local vertices fit inside radius 382mt: after projection and a 1px
 * outline they stay within the existing radius600 missing-aircraft bounds.
 * Facing and height come from the actor's existing public flight presentation. */
export function shahedFallbackGeometry(facing:number,altitude:number){
 const angle=facing*Math.PI/180000,cos=Math.cos(angle),sin=Math.sin(angle);
 const project=([x,y]:readonly [number,number])=>{
  const p=toScreen(x*cos-y*sin,x*sin+y*cos);
  return [p.x,p.y-altitude];
 };
 const body:readonly (readonly [number,number])[]=[[380,0],[-270,-270],[-90,-60],[-300,0],[-90,60],[-270,270]];
 const impact:readonly (readonly [number,number])[]=[[140,-60],[300,0],[140,60]];
 const [x,y]=project([-150,0]);
 // A small S keeps this marker distinguishable from the reusable strike drone.
 const idMark=[x+2,y-3,x-2,y-3,x-2,y,x+2,y,x+2,y+3,x-2,y+3];
 return {body:body.flatMap(project),impact:impact.flatMap(project),idMark};
}
