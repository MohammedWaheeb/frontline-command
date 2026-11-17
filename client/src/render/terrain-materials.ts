import type {GameMap} from '../runtime';

/** Paint order: the first used material is the chunk base, later ones blend over it. */
export const MATERIALS=['sand','packed_earth','dry_riverbed','gravel_wash','scrub_ground','gravel','rubble_ground','concrete_slab','industrial_pavement','asphalt','shallow_water','deep_water','coast_sand','ramp'] as const;
export type Material=typeof MATERIALS[number];
export const heightAt=(map:GameMap,x:number,y:number)=>x<0||y<0||x>=map.width||y>=map.height?0:(map.tiles[y*map.width+x]?.height??0);
export const terrainAt=(map:GameMap,x:number,y:number)=>x<0||y<0||x>=map.width||y>=map.height?'blocked':(map.tiles[y*map.width+x]?.terrain??'open');
const adjacent=[[1,0],[-1,0],[0,1],[0,-1]] as const;
export function terrainHash(x:number,y:number,seed:number){let h=(x*374761393+y*668265263+seed*1442695041)|0;h=(h^(h>>>13))*1274126177|0;return ((h^(h>>>16))>>>0)/4294967296}
export function smoothNoise(x:number,y:number,scale:number,seed:number){
 const fx=x/scale,fy=y/scale,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy,s=(t:number)=>t*t*(3-2*t);
 const a=terrainHash(ix,iy,seed),b=terrainHash(ix+1,iy,seed),c=terrainHash(ix,iy+1,seed),d=terrainHash(ix+1,iy+1,seed);
 return a+(b-a)*s(tx)+(c-a)*s(ty)+(a-b-c+d)*s(tx)*s(ty);
}
const isRoad=(map:GameMap,x:number,y:number)=>terrainAt(map,x,y)==='road';
/** A road crossing, not merely a wide road: road runs at least three tiles out
 * along both axes. Roads narrower than seven tiles only satisfy this at junctions. */
export function roadJunction(map:GameMap,x:number,y:number){
 return isRoad(map,x,y)&&isRoad(map,x-3,y)&&isRoad(map,x+3,y)&&isRoad(map,x,y-3)&&isRoad(map,x,y+3);
}
function near(map:GameMap,x:number,y:number,radius:number,test:(x:number,y:number)=>boolean){
 for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(test(x+dx,y+dy))return true;
 return false;
}
/** Prepared base pad around each public start position (irregular, ~9 tiles). */
export function basePad(map:GameMap,x:number,y:number){
 const wobble=smoothNoise(x,y,3,41)*1.4;
 for(const spawn of map.spawns??[]){
  const sx=spawn.position.x/1000,sy=spawn.position.y/1000,d=Math.max(Math.abs(x+.5-sx),Math.abs(y+.5-sy));
  if(d<=3.4+wobble)return true;
 }
 return false;
}
/** Dry wash channels: thin meandering lines of cracked mud in some regions. */
export function dryWash(map:GameMap,x:number,y:number){
 if(smoothNoise(x,y,30,61)<.5)return false;
 const ridge=Math.abs(smoothNoise(x,y,17,23)-.5);
 return ridge<.035&&!near(map,x,y,2,(nx,ny)=>{const t=terrainAt(map,nx,ny);return t==='road'||t==='water'})&&!basePad(map,x,y);
}

/** Public map presentation only. A cover texture never disguises open ground;
 * open-ground dressings (pads, yards, dry washes) are all plainly passable ground. */
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
 if(basePad(map,x,y))return 'concrete_slab';
 // Industrial yards only beside true road crossings.
 if(near(map,x,y,2,(nx,ny)=>roadJunction(map,nx,ny)))return 'industrial_pavement';
 if(dryWash(map,x,y))return 'dry_riverbed';
 // Large, calm colour masses; small rocks/cracks belong to the authored textures.
 return smoothNoise(x,y,24,11)*.8+smoothNoise(x,y,9,5)*.2<.44?'packed_earth':'sand';
}

/** 4×4-tile farm plot origin test (non-seamless farmland material is drawn as
 * whole plots). Plots only sit on calm open sand/earth away from roads, rock,
 * water, pads and cover, in a few broad agricultural zones. */
export function farmPlot(map:GameMap,bx:number,by:number){
 if(bx%4!==0||by%4!==0)return false;
 if(smoothNoise(bx,by,26,77)<.68||terrainHash(bx,by,79)<.4)return false;
 for(let y=by-1;y<=by+4;y++)for(let x=bx-1;x<=bx+4;x++){
  if(x<0||y<0||x>=map.width||y>=map.height)return false;
  if(terrainAt(map,x,y)!=='open'||heightAt(map,x,y)!==heightAt(map,bx,by))return false;
  const m=materialFor(map,x,y);if(m!=='sand'&&m!=='packed_earth')return false;
 }
 return true;
}
