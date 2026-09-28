// Bakes authored terrain materials into isometric chunk textures. Materials
// are 512² periodic textures covering 4×4 tiles (docs/asset-pipeline.md), so the
// projection is applied at draw time and every chunk tiles seamlessly.
import {Texture,Mesh,MeshGeometry} from 'pixi.js';
import type {GameMap} from '../runtime';
import {HALF_H,HALF_W,LEVEL_PX} from './iso';
import type {ArtLibrary} from './art';
import {MATERIALS,materialFor,heightAt,terrainAt,type Material} from './terrain-materials';
export {materialFor,heightAt,terrainAt} from './terrain-materials';

export const CHUNK=16;
const BLEED=2;
/** Fallback painted colours if a material image is missing (never silently blank). */
const FLAT:Record<Material,string>={sand:'#b59a6a',packed_earth:'#8f7852',scrub_ground:'#7c7448',gravel:'#8a8272',rubble_ground:'#6f675c',asphalt:'#4a4843',shallow_water:'#64847b',deep_water:'#305e64',coast_sand:'#cbbb8e',ramp:'#937c59'};

export class TerrainBaker {
 private patterns=new Map<string,HTMLImageElement|undefined>();
 constructor(private readonly map:GameMap,private readonly art:ArtLibrary,readonly resolution=1){}
 async load(){await Promise.all([...MATERIALS,'ground_macro','road_asphalt_decal'].map(async m=>{try{this.patterns.set(m,await this.art.terrain(m))}catch{this.patterns.set(m,undefined)}}))}
 chunkOrigin(cx:number,cy:number){const x0=cx*CHUNK,y0=cy*CHUNK;return {x:(x0-(y0+CHUNK))*HALF_W-BLEED,y:(x0+y0)*HALF_H-BLEED}}
 get chunksX(){return Math.ceil(this.map.width/CHUNK)}
 get chunksY(){return Math.ceil(this.map.height/CHUNK)}
 /** Returns a texture whose top-left sits at chunkOrigin(cx,cy) in world px. */
 bake(cx:number,cy:number):Texture{
  const r=this.resolution,W=CHUNK*2*HALF_W+2*BLEED,H=CHUNK*2*HALF_H+4*LEVEL_PX+2*BLEED;
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
  const macro=this.patterns.get('ground_macro');
  if(macro){
   const pattern=ctx.createPattern(macro,'repeat')!;pattern.setTransform(new DOMMatrix([32/macro.naturalWidth,0,0,32/macro.naturalHeight,0,0]));
   // The authored 128 grey is neutral, so overlay preserves the original base
   // luminance instead of multiplying every pixel down to half brightness.
   ctx.globalCompositeOperation='overlay';ctx.globalAlpha=.65;ctx.fillStyle=pattern;ctx.fillRect(x0-1,y0-1,CHUNK+2,CHUNK+2);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  // Elevation: plateaus lighten, escarpment faces fall toward the camera.
  for(let y=Math.max(0,y0-1);y<=y0+CHUNK&&y<this.map.height;y++)for(let x=Math.max(0,x0-1);x<=x0+CHUNK&&x<this.map.width;x++){
   const h=heightAt(this.map,x,y),terrain=terrainAt(this.map,x,y);
   if(h>0){ctx.fillStyle=`rgba(255,236,196,${Math.min(0.2,h*0.05)})`;ctx.fillRect(x,y,1,1)}
   if(terrain==='cliff'||terrain==='blocked'){ctx.fillStyle='rgba(40,34,26,0.45)';ctx.fillRect(x,y,1,1)}
   if(terrain==='road')this.roadEdges(ctx,x,y);
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
  const texture=Texture.from(canvas);texture.source.scaleMode='linear';
  return texture;
 }
 /** Two triangles own exactly this chunk's map tiles. The padded texture stays
  * opaque across shared edges; alpha-clipped rectangular sprites create seams
  * and camera-order-dependent overlaps when neighbouring chunks are blended. */
 mesh(cx:number,cy:number,texture:Texture){
  const x0=cx*CHUNK,y0=cy*CHUNK,x1=Math.min(x0+CHUNK,this.map.width),y1=Math.min(y0+CHUNK,this.map.height),origin=this.chunkOrigin(cx,cy);
  const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],positions=new Float32Array(corners.flatMap(([x,y])=>[(x-y)*HALF_W-origin.x,(x+y)*HALF_H-origin.y]));
  const uvs=new Float32Array(positions.map((value,i)=>value*this.resolution/(i%2?texture.height:texture.width)));
  const mesh=new Mesh({texture,geometry:new MeshGeometry({positions,uvs,indices:new Uint32Array([0,1,2,0,2,3])})});mesh.position.set(origin.x,origin.y);return mesh;
 }
 private roadEdges(ctx:CanvasRenderingContext2D,x:number,y:number){
  const image=this.patterns.get('road_asphalt_decal');if(!image)return;
  for(const [dx,dy,angle] of [[0,-1,Math.PI],[1,0,-Math.PI/2],[0,1,0],[-1,0,Math.PI/2]]){
   const next=terrainAt(this.map,x+dx,y+dy);if(!['open','rubble','cover','ramp'].includes(next))continue;
   // The painted shoulder remains within the road tile, never suggesting that
   // adjacent impassable ground is traversable. Global phase avoids edge seams.
   const phase=((dx?y:x)%4+4)%4;
   ctx.save();ctx.translate(x+.5,y+.5);ctx.rotate(angle);ctx.drawImage(image,phase*image.naturalWidth/4,0,image.naturalWidth/4,image.naturalHeight,-.5,.20,1,.3);ctx.restore();
  }
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
