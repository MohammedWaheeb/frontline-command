// Bakes authored terrain materials into isometric chunk textures. Materials
// are 512² periodic textures covering 4×4 tiles (docs/asset-pipeline.md), so the
// projection is applied at draw time and every chunk tiles seamlessly.
import {Texture,Mesh,MeshGeometry} from 'pixi.js';
import type {GameMap,Rect} from '../runtime';
import {HALF_H,HALF_W,LEVEL_PX} from './iso';
import type {ArtLibrary} from './art';
import {MATERIALS,materialFor,heightAt,terrainAt,type Material} from './terrain-materials';
import {TerrainSurface,projectSurfaceVertex,compareSurfaceTriangles,surfaceFogOpacity,type SurfaceTriangle} from './terrain-surface';
export {materialFor,heightAt,terrainAt} from './terrain-materials';

/** Cached opaque ground and matching fog geometry. The caller interleaves these
 * by ground depth with actors; owning chunk textures are released separately. */
export interface TerrainFragment {
 mesh:Mesh;fog:Mesh;triangles:readonly SurfaceTriangle[];depth:number;bounds:Readonly<Rect>;
 setFog(visible:readonly boolean[],explored:readonly boolean[]):void;
 setVisible(visible:boolean):void;
 dispose():void;
}

export const CHUNK=16;
const BLEED=2;
/** Current opacity of the most-fogged in-map tile whose closed square contains
 * this ground point: four tiles at a corner, two on an edge, one inside. Every
 * triangle sharing the point sees the same value, so fog stays seamless across
 * fragments and chunks. Off-map ground is never drawn and adds nothing. */
function pointFogOpacity(x:number,y:number,width:number,height:number,visible:readonly boolean[],explored:readonly boolean[]){
 const tx=x/1000,ty=y/1000,x0=Math.max(0,Number.isInteger(tx)?tx-1:Math.floor(tx)),x1=Math.min(width-1,Math.floor(tx)),y0=Math.max(0,Number.isInteger(ty)?ty-1:Math.floor(ty)),y1=Math.min(height-1,Math.floor(ty));
 let opacity=0;
 for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++){const tile=j*width+i;opacity=Math.max(opacity,visible[tile]?0:explored[tile]?175:255)}
 return opacity;
}
/** Fallback painted colours if a material image is missing (never silently blank). */
const FLAT:Record<Material,string>={sand:'#b59a6a',packed_earth:'#8f7852',gravel_wash:'#998c72',scrub_ground:'#7c7448',gravel:'#8a8272',rubble_ground:'#6f675c',asphalt:'#4a4843',shallow_water:'#64847b',deep_water:'#305e64',coast_sand:'#cbbb8e',ramp:'#937c59'};

export class TerrainBaker {
 private patterns=new Map<string,HTMLImageElement|undefined>();
 private faceTextures=new Map<string,Texture>();private fogRamp?:Texture;
 constructor(private readonly map:GameMap,private readonly art:ArtLibrary,readonly resolution=1){}
 async load(){await Promise.all([...MATERIALS,'ground_macro','road_asphalt_decal','cliff_face_tier1','cliff_face_tier2'].map(async m=>{try{this.patterns.set(m,await this.art.terrain(m))}catch{this.patterns.set(m,undefined)}}))}
 chunkOrigin(cx:number,cy:number){const x0=cx*CHUNK,y0=cy*CHUNK;return {x:(x0-(y0+CHUNK))*HALF_W-BLEED,y:(x0+y0)*HALF_H-BLEED}}
 get chunksX(){return Math.ceil(this.map.width/CHUNK)}
 get chunksY(){return Math.ceil(this.map.height/CHUNK)}
 /** Returns a texture whose top-left sits at chunkOrigin(cx,cy) in world px. */
 bake(cx:number,cy:number,raised=false):Texture{
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
   // luminance instead of multiplying every pixel down to half brightness. Kept
   // subtle: stronger macro reads as stains on flat sand and hides infantry.
   ctx.globalCompositeOperation='overlay';ctx.globalAlpha=.35;ctx.fillStyle=pattern;ctx.fillRect(x0-1,y0-1,CHUNK+2,CHUNK+2);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  // Elevation: plateaus lighten, escarpment faces fall toward the camera.
  for(let y=Math.max(0,y0-1);y<=y0+CHUNK&&y<this.map.height;y++)for(let x=Math.max(0,x0-1);x<=x0+CHUNK&&x<this.map.width;x++){
   const h=heightAt(this.map,x,y),terrain=terrainAt(this.map,x,y);
   if(h>0){ctx.fillStyle=`rgba(255,236,196,${Math.min(0.2,h*0.05)})`;ctx.fillRect(x,y,1,1)}
   if(terrain==='cliff'||terrain==='blocked'){ctx.fillStyle='rgba(40,34,26,0.45)';ctx.fillRect(x,y,1,1)}
   if(terrain==='road')this.roadEdges(ctx,x,y);
   for(const [dx,dy] of (raised?[]:[[1,0],[0,1]]) as Array<readonly [number,number]>){
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
 /** Additive stage-2 API. Flat product mesh stays available until projection,
  * actor anchors, picking and fog are switched together by the integration owner. */
 surfaceFragments(cx:number,cy:number,texture:Texture,surface:TerrainSurface):TerrainFragment[]{
  const x0=cx*CHUNK,y0=cy*CHUNK,x1=Math.min(x0+CHUNK,this.map.width),y1=Math.min(y0+CHUNK,this.map.height),origin=this.chunkOrigin(cx,cy);
  if(x0<0||y0<0||x0>=this.map.width||y0>=this.map.height||surface.width!==this.map.width||surface.height!==this.map.height)throw new Error('Invalid surface chunk');
  const groups=new Map<string,SurfaceTriangle[]>();
  for(const triangle of surface.triangles({left:x0*1000,top:y0*1000,right:x1*1000,bottom:y1*1000})){
   if(!triangle.frontFacing)continue;
   const tier=triangle.kind==='face'&&Math.max(...triangle.vertices.map(v=>v.height))-Math.min(...triangle.vertices.map(v=>v.height))>1?'cliff_face_tier2':'cliff_face_tier1';
   const key=`${triangle.depth.toFixed(6)}:${triangle.kind}:${tier}`;let group=groups.get(key);if(!group){group=[];groups.set(key,group)}group.push(triangle);
  }
  if(!this.fogRamp){
   // Texel i has alpha i. Constant-u triangles sample their own texel; clamped
   // addressing keeps extrapolated u on visible triangles at or above texel 0.
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=1;const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(256,1);
   for(let alpha=0;alpha<256;alpha++)pixels.data.set([8,9,7,alpha],alpha*4);ctx.putImageData(pixels,0,0);
   this.fogRamp=Texture.from(canvas);this.fogRamp.source.scaleMode='linear';
  }
  return [...groups.values()].sort((a,b)=>compareSurfaceTriangles(a[0],b[0])).map(triangles=>{
   // Small depth fragments stay on Pixi's batch path; explicit batch mode also
   // supports a long diagonal without falling out at the 100-vertex auto limit.
   triangles.sort(compareSurfaceTriangles);const first=triangles[0],positions:number[]=[],uvs:number[]=[],indices:number[]=[],fogUVs=new Float32Array(triangles.length*6);
   const face=first.kind==='face',tier=Math.max(...first.vertices.map(v=>v.height))-Math.min(...first.vertices.map(v=>v.height))>1?'cliff_face_tier2':'cliff_face_tier1';
   for(const triangle of triangles)for(const vertex of triangle.vertices){
    const p=projectSurfaceVertex(vertex),flatX=(vertex.x-vertex.y)/1000*HALF_W,flatY=(vertex.x+vertex.y)/1000*HALF_H;
    positions.push(p.x-origin.x,p.y-origin.y);indices.push(indices.length);
    if(face)uvs.push((vertex.x+vertex.y)/4000,(4-vertex.height)/4);
    else uvs.push((flatX-origin.x)*this.resolution/texture.width,(flatY-origin.y)*this.resolution/texture.height);
   }
   let material=texture;
   if(face){
    let cached=this.faceTextures.get(tier);if(!cached){const image=this.patterns.get(tier);if(image){cached=Texture.from(image);cached.source.addressMode='repeat';cached.source.scaleMode='linear'}else{
     const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#665342';ctx.fillRect(0,0,2,2);cached=Texture.from(canvas);
    }this.faceTextures.set(tier,cached)}material=cached;
   }
   const geometry=new MeshGeometry({positions:new Float32Array(positions),uvs:new Float32Array(uvs),indices:new Uint32Array(indices)});geometry.batchMode='batch';
   const mesh=new Mesh({texture:material,geometry});mesh.position.set(origin.x,origin.y);mesh.zIndex=first.depth;
   if(face)mesh.tint=first.vertices[0].x===first.vertices[1].x&&first.vertices[1].x===first.vertices[2].x?0xb8b09f:0x999183;
   const fogGeometry=new MeshGeometry({positions:new Float32Array(positions),uvs:fogUVs,indices:new Uint32Array(indices)});fogGeometry.batchMode='batch';
   const fog=new Mesh({texture:this.fogRamp!,geometry:fogGeometry});fog.position.copyFrom(mesh.position);fog.zIndex=first.depth+.0001;
   // Exact projected geometry bounds include every raised top and cliff face.
   // They cull only fragments wholly outside the viewport, never hidden-world data.
   const bounds:Rect={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
   for(let i=0;i<positions.length;i+=2){bounds.left=Math.min(bounds.left,positions[i]+origin.x);bounds.right=Math.max(bounds.right,positions[i]+origin.x);bounds.top=Math.min(bounds.top,positions[i+1]+origin.y);bounds.bottom=Math.max(bounds.bottom,positions[i+1]+origin.y)}
   let shown=true,fogNeeded=true;
   const setFog=(visible:readonly boolean[],explored:readonly boolean[])=>{
    // Explored (175) and unknown (255) triangles keep one constant old opacity on
    // all three vertices, so no sample can differ from before: antialiased MSAA
    // evaluates Pixi's non-centroid vUV at the pixel centre, which may lie outside
    // the triangle, and a varying vUV would then extrapolate below every vertex.
    // Only visible (0) triangles feather, each vertex taking the darkest tile
    // touching that ground point; any extrapolation below 0 clamps to texel 0.
    // The explored/unknown boundary therefore stays hard, while fog softens only
    // into currently visible ground, and all-clear triangles stay exactly clear.
    const {width,height}=this.map;let any=false;
    for(let i=0;i<triangles.length;i++){const triangle=triangles[i],base=surfaceFogOpacity(triangle,visible,explored);for(let j=0;j<3;j++){const v=triangle.vertices[j],alpha=base!==0?base:pointFogOpacity(v.x,v.y,width,height,visible,explored);any ||= alpha!==0;fogUVs[i*6+j*2]=alpha===0?0:(alpha+.75)/256;fogUVs[i*6+j*2+1]=.5}}
    fogNeeded=any;fog.visible=shown&&any;fogGeometry.attributes.aUV.buffer.update();
   };
   setFog([],[]);
   return {mesh,fog,triangles,depth:first.depth,bounds,setFog,setVisible(visible:boolean){shown=visible;mesh.visible=visible;fog.visible=visible&&fogNeeded},dispose(){geometry.destroy();fogGeometry.destroy();mesh.destroy();fog.destroy()}};
  });
 }
 /** Only after all raised fragments have been detached/disposed. */
 disposeSurfaceResources(){for(const texture of this.faceTextures.values())texture.destroy(true);this.faceTextures.clear();this.fogRamp?.destroy(true);this.fogRamp=undefined}
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
