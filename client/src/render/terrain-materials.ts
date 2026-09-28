import type {GameMap} from '../runtime';

export const MATERIALS=['sand','packed_earth','gravel_wash','scrub_ground','gravel','rubble_ground','asphalt','shallow_water','deep_water','coast_sand','ramp'] as const;
export type Material=typeof MATERIALS[number];
export const heightAt=(map:GameMap,x:number,y:number)=>x<0||y<0||x>=map.width||y>=map.height?0:(map.tiles[y*map.width+x]?.height??0);
export const terrainAt=(map:GameMap,x:number,y:number)=>x<0||y<0||x>=map.width||y>=map.height?'blocked':(map.tiles[y*map.width+x]?.terrain??'open');
const adjacent=[[1,0],[-1,0],[0,1],[0,-1]] as const;
function hash(x:number,y:number,seed:number){let h=(x*374761393+y*668265263+seed*1442695041)|0;h=(h^(h>>>13))*1274126177|0;return ((h^(h>>>16))>>>0)/4294967296}
function smoothNoise(x:number,y:number,scale:number,seed:number){
 const fx=x/scale,fy=y/scale,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy,s=(t:number)=>t*t*(3-2*t);
 const a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);
 return a+(b-a)*s(tx)+(c-a)*s(ty)+(a-b-c+d)*s(tx)*s(ty);
}
/** Public map presentation only. A cover texture never disguises open ground. */
export function materialFor(map:GameMap,x:number,y:number):Material{
 switch(terrainAt(map,x,y)){
  case 'road':return 'asphalt';
  case 'rubble':return 'rubble_ground';
  case 'cover':return 'scrub_ground';
  case 'water':return adjacent.some(([dx,dy])=>terrainAt(map,x+dx,y+dy)!=='water')?'shallow_water':'deep_water';
  case 'cliff':case 'blocked':return 'gravel';
  case 'ramp':return 'ramp';
 }
 if(adjacent.some(([dx,dy])=>terrainAt(map,x+dx,y+dy)==='water'))return 'coast_sand';
 // Low loose scree belongs only to passable open ground. It neither paints
 // infantry cover nor extends the adjacent impassable rock footprint.
 if(terrainAt(map,x,y)==='open'&&adjacent.some(([dx,dy])=>x+dx>=0&&y+dy>=0&&x+dx<map.width&&y+dy<map.height&&['cliff','blocked'].includes(terrainAt(map,x+dx,y+dy))))return 'gravel_wash';
 // Large, calm colour masses; small rocks/cracks belong to the authored textures.
 return smoothNoise(x,y,24,11)*.8+smoothNoise(x,y,9,5)*.2<.44?'packed_earth':'sand';
}
