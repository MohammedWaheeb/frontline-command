import type {Settings} from '../app/settings';
import type {GameMap,Point} from '../runtime';
import type {EffectVariant} from '../content/effect-assets.mjs';
import {toScreen} from './iso';

/** Position in projected world pixels; artwork points along local screen +X. */
export interface CombatAttachment extends Point {rotation:number}

/** Crop origin may lie far below a tall smoke plume. Cull its rotated artwork,
 * not a fixed-radius point, before requesting a texture page. */
export function effectFrameVisible(frame:{w:number;h:number;origin:readonly number[]},scale:number,p:Point,rotation:number,view:{left:number;right:number;top:number;bottom:number}):boolean {
 const left=-frame.origin[0]*scale,top=-frame.origin[1]*scale,right=left+frame.w*scale,bottom=top+frame.h*scale,c=Math.cos(rotation),s=Math.sin(rotation);
 const xs=[left*c-top*s,right*c-top*s,left*c-bottom*s,right*c-bottom*s],ys=[left*s+top*c,right*s+top*c,left*s+bottom*c,right*s+bottom*c];
 return p.x+Math.max(...xs)>=view.left&&p.x+Math.min(...xs)<=view.right&&p.y+Math.max(...ys)>=view.top&&p.y+Math.min(...ys)<=view.bottom;
}

/** The displayed sprite heading, rather than a target or an unpainted turn. */
export function muzzleRotation(direction:number,directions:number):number|undefined {
 if(!Number.isInteger(direction)||!Number.isInteger(directions)||directions<2||direction<0||direction>=directions)return;
 const a=direction/directions*Math.PI*2,p=toScreen(Math.cos(a),Math.sin(a));
 return Math.atan2(p.y,p.x);
}

/** A visible body supplies no future endpoint or elevation. Orient only from
 * successive disclosed positions, and never bridge a currently hidden pocket. */
export function projectileRotation(samples:ReadonlyArray<{tick:number;position:Point}>,map:Pick<GameMap,'width'|'height'>,visible:readonly boolean[]):number|undefined {
 const last=samples.at(-1);if(!last)return;
 for(let i=samples.length-2;i>=0;i--){
  const previous=samples[i];
  if(previous.tick>=last.tick||!visibleTrace(previous.position,last.position,map,visible))return;
  const d=toScreen(last.position.x-previous.position.x,last.position.y-previous.position.y);
  if(d.x!==0||d.y!==0)return Math.atan2(d.y,d.x);
 }
}

export function combatEffectVariant(settings:Pick<Settings,'reducedMotion'|'reducedFlashing'|'artQuality'>):EffectVariant {
 return settings.reducedMotion&&settings.reducedFlashing?'reduced':settings.reducedMotion?'reducedMotion':settings.reducedFlashing?'reducedFlashing':settings.artQuality==='standard'?'low':'standard';
}
/** Only join known samples through tiles that are currently visible. No straight
 * segment may bridge an unknown pocket simply because its endpoints are known. */
export function visibleTrace(a:Point,b:Point,map:Pick<GameMap,'width'|'height'>,visible:readonly boolean[]):boolean {
 if(![a.x,a.y,b.x,b.y].every(Number.isFinite))return false;
 const known=(x:number,y:number)=>x>=0&&y>=0&&x<map.width&&y<map.height&&!!visible[y*map.width+x];
 let x=Math.floor(a.x/1000),y=Math.floor(a.y/1000);const endX=Math.floor(b.x/1000),endY=Math.floor(b.y/1000);
 if(!known(x,y)||!known(endX,endY))return false;
 const dx=b.x-a.x,dy=b.y-a.y,sx=Math.sign(dx),sy=Math.sign(dy),stepX=dx===0?Infinity:1000/Math.abs(dx),stepY=dy===0?Infinity:1000/Math.abs(dy);
 let tx=dx===0?Infinity:((x+(sx>0?1:0))*1000-a.x)/dx,ty=dy===0?Infinity:((y+(sy>0?1:0))*1000-a.y)/dy;
 // Exact tile traversal, including both neighbors when crossing a corner.
 // Fixed-distance samples could miss a thin hidden sliver along a diagonal.
 for(let n=0;n<=map.width+map.height+2;n++){
  if(x===endX&&y===endY)return true;
  if(tx<ty){x+=sx;tx+=stepX}else if(ty<tx){y+=sy;ty+=stepY}else{if(!known(x+sx,y)||!known(x,y+sy))return false;x+=sx;y+=sy;tx+=stepX;ty+=stepY}
  if(!known(x,y))return false;
 }
 return false;
}
