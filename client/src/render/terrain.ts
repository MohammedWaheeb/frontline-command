// Bakes authored terrain materials into isometric chunk textures. Materials
// are 512² periodic textures covering 4×4 tiles (docs/asset-pipeline.md), so the
// projection is applied at draw time and every chunk tiles seamlessly.
import {Texture} from 'pixi.js';
import type {GameMap} from '../runtime';
import {HALF_H,HALF_W,LEVEL_PX} from './iso';
import type {ArtLibrary} from './art';

export const CHUNK=16;
type Material='sand'|'packed_earth'|'scrub_ground'|'gravel'|'rubble_ground'|'asphalt'|'concrete_slab'|'dry_riverbed';
const MATERIALS:Material[]=['sand','packed_earth','scrub_ground','gravel','rubble_ground','asphalt','concrete_slab','dry_riverbed'];
/** Fallback painted colours if a material image is missing (never silently blank). */
const FLAT:Record<Material,string>={sand:'#b59a6a',packed_earth:'#8f7852',scrub_ground:'#7c7448',gravel:'#8a8272',rubble_ground:'#6f675c',asphalt:'#4a4843',concrete_slab:'#8d8a82',dry_riverbed:'#9c8a68'};

function hash(x:number,y:number,seed=0){let h=(x*374761393+y*668265263+seed*1442695041)|0;h=(h^(h>>>13))*1274126177|0;return ((h^(h>>>16))>>>0)/4294967296}
function smoothNoise(x:number,y:number,scale:number,seed:number){
 const fx=x/scale,fy=y/scale,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
 const s=(t:number)=>t*t*(3-2*t);
 const a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);
 return a+(b-a)*s(tx)+(c-a)*s(ty)+(a-b-c+d)*s(tx)*s(ty);
}
/** Deterministic presentation material for a tile. Terrain rules come only from the map. */
export function materialFor(map:GameMap,x:number,y:number):Material{
 const t=map.tiles[y*map.width+x];if(!t)return 'sand';
 switch(t.terrain){
  case 'road':return 'asphalt';
  case 'rubble':return 'rubble_ground';
  case 'cover':return 'scrub_ground';
  case 'water':return 'dry_riverbed';
  case 'cliff':case 'blocked':return 'gravel';
  case 'ramp':return 'packed_earth';
 }
 const n=smoothNoise(x,y,7,11)*0.7+smoothNoise(x,y,3,5)*0.3;
 return n<0.38?'packed_earth':n>0.66?'scrub_ground':'sand';
}
export const heightAt=(map:GameMap,x:number,y:number)=>x<0||y<0||x>=map.width||y>=map.height?0:(map.tiles[y*map.width+x]?.height??0);
export const terrainAt=(map:GameMap,x:number,y:number)=>x<0||y<0||x>=map.width||y>=map.height?'blocked':(map.tiles[y*map.width+x]?.terrain??'open');

export class TerrainBaker {
 private patterns=new Map<Material,HTMLImageElement|undefined>();
 constructor(private readonly map:GameMap,private readonly art:ArtLibrary,readonly resolution=1){}
 async load(){for(const m of MATERIALS){try{this.patterns.set(m,await this.art.terrain(m))}catch{this.patterns.set(m,undefined)}}}
 chunkOrigin(cx:number,cy:number){const x0=cx*CHUNK,y0=cy*CHUNK;return {x:(x0-(y0+CHUNK))*HALF_W,y:(x0+y0)*HALF_H}}
 get chunksX(){return Math.ceil(this.map.width/CHUNK)}
 get chunksY(){return Math.ceil(this.map.height/CHUNK)}
 /** Returns a texture whose top-left sits at chunkOrigin(cx,cy) in world px. */
 bake(cx:number,cy:number):Texture{
  const r=this.resolution,W=CHUNK*2*HALF_W,H=CHUNK*2*HALF_H+4*LEVEL_PX;
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(W*r);canvas.height=Math.ceil(H*r);
  const ctx=canvas.getContext('2d')!;const x0=cx*CHUNK,y0=cy*CHUNK,origin=this.chunkOrigin(cx,cy);
  // iso transform: tile (x,y) → px, relative to this chunk's origin
  const iso=(c:CanvasRenderingContext2D)=>c.setTransform(HALF_W*r,HALF_H*r,-HALF_W*r,HALF_H*r,-origin.x*r,-origin.y*r);
  const used=new Set<Material>();
  for(let y=y0-1;y<=y0+CHUNK;y++)for(let x=x0-1;x<=x0+CHUNK;x++)if(x>=0&&y>=0&&x<this.map.width&&y<this.map.height)used.add(materialFor(this.map,x,y));
  // Base: dominant ground, then each material through a bilinear-softened tile mask.
  const order=MATERIALS.filter(m=>used.has(m));
  for(const [i,m] of order.entries()){
   const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;const lc=layer.getContext('2d')!;
   iso(lc);this.fillMaterial(lc,m,x0-1,y0-1,CHUNK+2);
   if(i>0){
    const mask=document.createElement('canvas');mask.width=CHUNK+4;mask.height=CHUNK+4;const mc=mask.getContext('2d')!;
    const img=mc.createImageData(CHUNK+4,CHUNK+4);
    for(let ty=0;ty<CHUNK+4;ty++)for(let tx=0;tx<CHUNK+4;tx++){const x=x0-2+tx,y=y0-2+ty;const on=x>=0&&y>=0&&x<this.map.width&&y<this.map.height&&materialFor(this.map,x,y)===m;img.data[(ty*(CHUNK+4)+tx)*4+3]=on?255:0}
    mc.putImageData(img,0,0);
    lc.globalCompositeOperation='destination-in';lc.imageSmoothingEnabled=true;lc.imageSmoothingQuality='high';
    // mask pixel centre = tile centre, so offset by −1.5 tiles
    lc.drawImage(mask,x0-2.5+0.5,y0-2.5+0.5,CHUNK+4,CHUNK+4);
   }
   ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(layer,0,0);
  }
  iso(ctx);
  // Elevation: plateaus lighten, escarpment faces fall toward the camera.
  for(let y=y0;y<y0+CHUNK&&y<this.map.height;y++)for(let x=x0;x<x0+CHUNK&&x<this.map.width;x++){
   const h=heightAt(this.map,x,y),terrain=terrainAt(this.map,x,y);
   if(h>0){ctx.fillStyle=`rgba(255,236,196,${Math.min(0.2,h*0.05)})`;ctx.fillRect(x,y,1,1)}
   if(terrain==='water'){ctx.fillStyle='rgba(38,58,56,0.72)';ctx.fillRect(x,y,1,1);ctx.fillStyle='rgba(120,150,140,0.12)';ctx.fillRect(x+0.1,y+0.1,0.8,0.08)}
   if(terrain==='cliff'||terrain==='blocked'){ctx.fillStyle='rgba(40,34,26,0.45)';ctx.fillRect(x,y,1,1)}
   if(terrain==='ramp'){ctx.fillStyle='rgba(255,230,180,0.08)';ctx.fillRect(x,y,1,1);ctx.strokeStyle='rgba(60,48,32,0.35)';ctx.lineWidth=0.04;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(x+i/4,y);ctx.lineTo(x+i/4,y+1);ctx.stroke()}}
   if(terrain==='road'){ctx.strokeStyle='rgba(210,190,140,0.10)';ctx.lineWidth=0.05;ctx.strokeRect(x+0.05,y+0.05,0.9,0.9)}
   for(const [dx,dy] of [[1,0],[0,1]] as const){
    const hn=heightAt(this.map,x+dx,y+dy);if(hn>=h)continue;const drop=(h-hn)*LEVEL_PX/HALF_H;
    ctx.fillStyle='rgba(28,22,16,0.55)';
    if(dx)ctx.fillRect(x+1,y,Math.min(0.6,drop*0.35),1);else ctx.fillRect(x,y+1,1,Math.min(0.6,drop*0.35));
    ctx.strokeStyle='rgba(255,236,196,0.35)';ctx.lineWidth=0.05;ctx.beginPath();if(dx){ctx.moveTo(x+1,y);ctx.lineTo(x+1,y+1)}else{ctx.moveTo(x,y+1);ctx.lineTo(x+1,y+1)}ctx.stroke();
   }
  }
  // Map edge: dark bevel so the playable diamond reads as a board.
  ctx.fillStyle='rgba(0,0,0,0.35)';
  if(x0+CHUNK>=this.map.width)ctx.fillRect(this.map.width-0.15,y0,0.15,CHUNK);
  if(y0+CHUNK>=this.map.height)ctx.fillRect(x0,this.map.height-0.15,CHUNK,0.15);
  // Clip outside the map.
  ctx.globalCompositeOperation='destination-in';ctx.fillStyle='#000';ctx.fillRect(0,0,this.map.width,this.map.height);
  ctx.globalCompositeOperation='source-over';
  const texture=Texture.from(canvas);texture.source.scaleMode='linear';
  return texture;
 }
 private fillMaterial(ctx:CanvasRenderingContext2D,m:Material,x:number,y:number,size:number){
  const img=this.patterns.get(m);
  if(img){const pattern=ctx.createPattern(img,'repeat')!;pattern.setTransform(new DOMMatrix([1/128,0,0,1/128,0,0]));ctx.fillStyle=pattern}
  else ctx.fillStyle=FLAT[m];
  ctx.fillRect(x,y,size,size);
 }
 /** Minimap colour per tile, from the same materials. */
 static minimapColor(map:GameMap,x:number,y:number){
  const t=terrainAt(map,x,y),h=heightAt(map,x,y);
  const base:Record<string,[number,number,number]>={open:[128,110,76],road:[74,72,66],rubble:[98,90,80],cover:[104,100,62],water:[44,62,60],cliff:[70,62,50],blocked:[58,52,44],ramp:[120,102,72]};
  const [r,g,b]=base[t]??base.open;const k=1+h*0.07;return [Math.min(255,r*k)|0,Math.min(255,g*k)|0,Math.min(255,b*k)|0] as const;
 }
}
