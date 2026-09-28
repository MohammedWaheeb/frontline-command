import type {Settings} from '../app/settings';
import type {GameMap,Point} from '../runtime';
import type {EffectVariant} from '../content/effect-assets.mjs';

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
