// Bakes authored terrain materials into isometric chunk textures. Materials
// are 512² periodic textures covering 4×4 tiles (docs/asset-pipeline.md), so the
// projection is applied at draw time and every chunk tiles seamlessly.
import {Texture,Mesh,MeshGeometry} from 'pixi.js';
import type {GameMap,Rect} from '../runtime';
import {HALF_H,HALF_W,LEVEL_PX} from './iso';
import type {ArtLibrary} from './art';
import {MATERIALS,materialFor,heightAt,terrainAt,farmPlot,terrainHash,smoothNoise,type Material} from './terrain-materials';
import {TerrainSurface,projectSurfaceVertex,compareSurfaceTriangles,type SurfaceTriangle} from './terrain-surface';
import {FogField} from './fog-field';
export {materialFor,heightAt,terrainAt} from './terrain-materials';

/** Cached opaque ground and matching fog geometry. The caller interleaves these
 * by ground depth with actors; owning chunk textures are released separately. */
export interface TerrainFragment {
 mesh:Mesh;fog:Mesh;triangles:readonly SurfaceTriangle[];depth:number;bounds:Readonly<Rect>;
 /** Compatibility path: updates the shared fog field from these masks, then refreshes. */
 setFog(visible:readonly boolean[],explored:readonly boolean[]):void;
 /** Re-reads the shared fog field after TerrainBaker.updateFog. */
 refreshFog():void;
 setVisible(visible:boolean):void;
 dispose():void;
}

export const CHUNK=16;
const BLEED=2;
/** In-map tiles whose closed square contains this ground point: four at a
 * corner, two on an edge, one inside. The point's fog is the most-fogged of
 * them, so every triangle sharing the point sees the same value and fog stays
 * seamless across fragments and chunks. Off-map ground adds nothing. */
function pointFogTiles(x:number,y:number,width:number,height:number){
 const tx=x/1000,ty=y/1000,x0=Math.max(0,Number.isInteger(tx)?tx-1:Math.floor(tx)),x1=Math.min(width-1,Math.floor(tx)),y0=Math.max(0,Number.isInteger(ty)?ty-1:Math.floor(ty)),y1=Math.min(height-1,Math.floor(ty));
 const tiles:number[]=[];
 for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++)tiles.push(j*width+i);
 return tiles;
}
const indexArray=(values:readonly number[])=>values.every(n=>n<65536)?new Uint16Array(values):new Uint32Array(values);
/** Immutable fog topology for one fragment. `fogTiles` lists every tile its fog
 * reads: each triangle's tile and neighbour, and every tile touching each vertex.
 * Vertices at the same ground point share one tile run. Construction Maps, lists
 * and the `slot` closure live only in this call's scope, so a fragment's runtime
 * closures capture the returned typed arrays and nothing else from here.
 * `fogFanCorners` holds each top triangle's four tile-corner points (NW, NE, SE,
 * SW), keyed by ground x,y, because a fan's four triangles fall into two depth
 * fragments; face triangles hold unused zeros. */
export function fogTopology(triangles:readonly SurfaceTriangle[],width:number,height:number){
 const slotOf=new Map<number,number>(),pointOf=new Map<string,number>(),tileList:number[]=[],pointStart:number[]=[0],pointSlots:number[]=[],vertexPoints:number[]=[],fanCorners:number[]=[];
 const slot=(tile:number)=>{let s=slotOf.get(tile);if(s===undefined){s=tileList.length;slotOf.set(tile,s);tileList.push(tile)}return s};
 const pointAt=(x:number,y:number)=>{
  const key=`${x},${y}`;let point=pointOf.get(key);
  if(point===undefined){point=pointStart.length-1;pointOf.set(key,point);for(const tile of pointFogTiles(x,y,width,height))pointSlots.push(slot(tile));pointStart.push(pointSlots.length)}
  return point;
 };
 for(const triangle of triangles){
  slot(triangle.tile);if(triangle.neighbor!==undefined)slot(triangle.neighbor);
  for(const v of triangle.vertices)vertexPoints.push(pointAt(v.x,v.y));
  if(triangle.kind==='top'){const x=triangle.tile%width,y=Math.floor(triangle.tile/width);for(const [dx,dy] of [[0,0],[1,0],[1,1],[0,1]])fanCorners.push(pointAt((x+dx)*1000,(y+dy)*1000))}
  else fanCorners.push(0,0,0,0);
 }
 return {fogTiles:Int32Array.from(tileList),fogPoints:indexArray(vertexPoints),fogPointStart:indexArray(pointStart),fogPointSlots:indexArray(pointSlots),fogFanCorners:indexArray(fanCorners)};
}
export type FogTopology=ReturnType<typeof fogTopology>;
/** Fallback painted colours if a material image is missing (never silently blank). */
const FLAT:Record<Material,string>={concrete_slab:'#8f8a7e',industrial_pavement:'#7f7b72',dry_riverbed:'#b5a27c',sand:'#b59a6a',packed_earth:'#8f7852',gravel_wash:'#998c72',scrub_ground:'#7c7448',gravel:'#8a8272',rubble_ground:'#6f675c',asphalt:'#4a4843',shallow_water:'#64847b',deep_water:'#305e64',coast_sand:'#cbbb8e',ramp:'#937c59'};

/** Shared read-only palette; each minimap sample still returns its own RGB tuple. */
const MINIMAP_BASE:Readonly<Record<string,readonly [number,number,number]>>={open:[128,110,76],road:[74,72,66],rubble:[98,90,80],cover:[104,100,62],water:[44,62,60],cliff:[70,62,50],blocked:[58,52,44],ramp:[120,102,72]};

export class TerrainBaker {
 private patterns=new Map<string,HTMLImageElement|undefined>();
 private faceTextures=new Map<string,Texture>();
 /** One shared soft fog field and texture for every fragment of this map. */
 readonly fog:FogField;private fogCanvas?:HTMLCanvasElement;private fogImage?:ImageData;private fogTexture?:Texture;private fogUploaded=-1;
 constructor(private readonly map:GameMap,private readonly art:ArtLibrary,readonly resolution=1){this.fog=new FogField(map.width,map.height)}
 async load(){await Promise.all([...MATERIALS,'ground_macro','road_asphalt_decal','cliff_face_tier1','cliff_face_tier2','farmland_dry'].map(async m=>{try{this.patterns.set(m,await this.art.terrain(m))}catch{this.patterns.set(m,undefined)}}))}
 chunkOrigin(cx:number,cy:number){const x0=cx*CHUNK,y0=cy*CHUNK;return {x:(x0-(y0+CHUNK))*HALF_W-BLEED,y:(x0+y0)*HALF_H-BLEED}}
 get chunksX(){return Math.ceil(this.map.width/CHUNK)}
 get chunksY(){return Math.ceil(this.map.height/CHUNK)}
 /** Projected envelope of the chunk's owned geometry, including any public
  * height from zero through maxHeight. Partial edge chunks use their true tile
  * extent. Texture bleed cannot extend the triangle-clipped geometry. */
 chunkBounds(cx:number,cy:number,maxHeight:number):Rect{
  const x0=cx*CHUNK,y0=cy*CHUNK,x1=Math.min(x0+CHUNK,this.map.width),y1=Math.min(y0+CHUNK,this.map.height);
  return {left:(x0-y1)*HALF_W,top:(x0+y0)*HALF_H-maxHeight*LEVEL_PX,right:(x1-y0)*HALF_W,bottom:(x1+y1)*HALF_H};
 }
 /** Returns a texture whose top-left sits at chunkOrigin(cx,cy) in world px. */
 bake(cx:number,cy:number,raised=false):Texture{
  const r=this.resolution,W=CHUNK*2*HALF_W+2*BLEED,H=CHUNK*2*HALF_H+4*LEVEL_PX+2*BLEED;
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(W*r);canvas.height=Math.ceil(H*r);
  const ctx=canvas.getContext('2d')!;const x0=cx*CHUNK,y0=cy*CHUNK,origin=this.chunkOrigin(cx,cy);
  // iso transform: tile (x,y) → px, relative to this chunk's origin
  const iso=(c:CanvasRenderingContext2D)=>c.setTransform(HALF_W*r,HALF_H*r,-HALF_W*r,HALF_H*r,-origin.x*r,-origin.y*r);
  // One materialFor evaluation per tile (region padded by two tiles for masks).
  const G=CHUNK+4,grid:(Material|undefined)[]=new Array(G*G),cell=(x:number,y:number)=>grid[(y-y0+2)*G+(x-x0+2)];
  for(let ty=0;ty<G;ty++)for(let tx=0;tx<G;tx++){const x=x0-2+tx,y=y0-2+ty;grid[ty*G+tx]=x>=0&&y>=0&&x<this.map.width&&y<this.map.height?materialFor(this.map,x,y):undefined}
  const used=new Set<Material>();
  for(let y=y0-1;y<=y0+CHUNK;y++)for(let x=x0-1;x<=x0+CHUNK;x++){const m=cell(x,y);if(m)used.add(m)}
  // Base: dominant ground, then each material through a bilinear-softened tile mask.
  const order=MATERIALS.filter(m=>used.has(m));
  for(const [i,m] of order.entries()){
   const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;const lc=layer.getContext('2d')!;
   iso(lc);this.fillMaterial(lc,m,x0-1,y0-1,CHUNK+2);
   if(i>0){
    const mask=document.createElement('canvas');mask.width=CHUNK+4;mask.height=CHUNK+4;const mc=mask.getContext('2d')!;
    const img=mc.createImageData(CHUNK+4,CHUNK+4);
    for(let ty=0;ty<CHUNK+4;ty++)for(let tx=0;tx<CHUNK+4;tx++){const on=grid[ty*G+tx]===m;img.data[(ty*(CHUNK+4)+tx)*4+3]=on?255:0}
    mc.putImageData(img,0,0);
    lc.globalCompositeOperation='destination-in';lc.imageSmoothingEnabled=true;lc.imageSmoothingQuality='high';
    // mask pixel centre = tile centre, so offset by −1.5 tiles
    lc.drawImage(mask,x0-2.5+0.5,y0-2.5+0.5,CHUNK+4,CHUNK+4);
   }
   // Cool authored slabs are warmed toward the sand palette; cracked mud blends
   // partly into the ground beneath so dry washes read as texture, not tiles.
   if(m==='concrete_slab'||m==='industrial_pavement'){lc.save();lc.setTransform(1,0,0,1,0,0);lc.globalCompositeOperation='source-atop';lc.fillStyle='rgba(196,160,104,0.22)';lc.fillRect(0,0,layer.width,layer.height);lc.restore()}
   ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=m==='dry_riverbed'&&i>0?.62:1;ctx.drawImage(layer,0,0);ctx.globalAlpha=1;
  }
  iso(ctx);
  this.farmPlots(ctx,x0,y0);
  this.macroVariation(ctx,x0,y0);
  this.scatter(ctx,x0,y0,cell);
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
   // Contact occlusion at the foot of a raised face: the lower tile darkens
   // toward the escarpment so elevation reads at a glance.
   if(raised)for(const [dx,dy] of [[-1,0],[0,-1]] as const){
    const hn=heightAt(this.map,x+dx,y+dy);if(hn<=h)continue;const depth=Math.min(.55,.25+(hn-h)*.12);
    const g=dx?ctx.createLinearGradient(x,0,x+depth,0):ctx.createLinearGradient(0,y,0,y+depth);g.addColorStop(0,'rgba(22,17,12,0.55)');g.addColorStop(1,'rgba(22,17,12,0)');
    ctx.fillStyle=g;if(dx)ctx.fillRect(x,y,depth,1);else ctx.fillRect(x,y,1,depth);
   }
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
  const fogTexture=this.fogTextureFor(),fogU=1/this.map.width,fogV=1/this.map.height;
  return [...groups.values()].sort((a,b)=>compareSurfaceTriangles(a[0],b[0])).map(triangles=>{
   // Small depth fragments stay on Pixi's batch path; explicit batch mode also
   // supports a long diagonal without falling out at the 100-vertex auto limit.
   triangles.sort(compareSurfaceTriangles);const first=triangles[0],positions:number[]=[],uvs:number[]=[],indices:number[]=[],fogUVs=new Float32Array(triangles.length*6);
   const face=first.kind==='face',tier=Math.max(...first.vertices.map(v=>v.height))-Math.min(...first.vertices.map(v=>v.height))>1?'cliff_face_tier2':'cliff_face_tier1';
   let fv=0;
   for(const triangle of triangles)for(const vertex of triangle.vertices){
    const p=projectSurfaceVertex(vertex),flatX=(vertex.x-vertex.y)/1000*HALF_W,flatY=(vertex.x+vertex.y)/1000*HALF_H;
    positions.push(p.x-origin.x,p.y-origin.y);indices.push(indices.length);
    // Fog samples the shared tile-space field at this ground point, so every
    // triangle (top or cliff face) shares one continuous, feathered fog.
    fogUVs[fv++]=vertex.x/1000*fogU;fogUVs[fv++]=vertex.y/1000*fogV;
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
   const fog=new Mesh({texture:fogTexture,geometry:fogGeometry});fog.position.copyFrom(mesh.position);fog.zIndex=first.depth+.0001;
   // Exact projected geometry bounds include every raised top and cliff face.
   // They cull only fragments wholly outside the viewport, never hidden-world data.
   const bounds:Rect={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
   for(let i=0;i<positions.length;i+=2){bounds.left=Math.min(bounds.left,positions[i]+origin.x);bounds.right=Math.max(bounds.right,positions[i]+origin.x);bounds.top=Math.min(bounds.top,positions[i+1]+origin.y);bounds.bottom=Math.max(bounds.bottom,positions[i+1]+origin.y)}
   // Built once in module scope; only its typed arrays enter this closure scope.
   const topology=fogTopology(triangles,this.map.width,this.map.height),{fogTiles}=topology;
   // A fragment needs its fog mesh only while some texel it can sample is dark.
   const field=this.fog;let shown=true,fogNeeded=true;
   const refreshFog=()=>{
    let any=false;for(let k=0;k<fogTiles.length;k++)if(field.tileMax[fogTiles[k]]!==0){any=true;break}
    fogNeeded=any;fog.visible=shown&&any;
   };
   const setFog=(visible:readonly boolean[],explored:readonly boolean[])=>{this.updateFog(visible,explored);refreshFog()};
   refreshFog();
   return {mesh,fog,triangles,depth:first.depth,bounds,setFog,refreshFog,setVisible(visible:boolean){shown=visible;mesh.visible=visible;fog.visible=visible&&fogNeeded},dispose(){geometry.destroy();fogGeometry.destroy();mesh.destroy();fog.destroy()}};
  });
 }
 /** Only after all raised fragments have been detached/disposed. */
 disposeSurfaceResources(){for(const texture of this.faceTextures.values())texture.destroy(true);this.faceTextures.clear();this.fogTexture?.destroy(true);this.fogTexture=undefined;if(this.fogCanvas){this.fogCanvas.width=this.fogCanvas.height=0}this.fogCanvas=undefined;this.fogImage=undefined;this.fogUploaded=-1}
 /** Whole 4×4 farm plots (the farmland texture is not seamless), each a single
  * image with a thin berm. Plot origins are 4-aligned, so neighbouring chunks
  * draw identical plots inside their bleed. */
 private farmPlots(ctx:CanvasRenderingContext2D,x0:number,y0:number){
  const farm=this.patterns.get('farmland_dry');if(!farm)return;
  for(let by=Math.floor((y0-4)/4)*4;by<=y0+CHUNK;by+=4)for(let bx=Math.floor((x0-4)/4)*4;bx<=x0+CHUNK;bx+=4){
   if(!farmPlot(this.map,bx,by))continue;
   ctx.save();ctx.translate(bx+2,by+2);if(terrainHash(bx,by,83)<.5)ctx.rotate(Math.PI/2);
   ctx.globalAlpha=.82;ctx.drawImage(farm,-1.9,-1.9,3.8,3.8);ctx.globalAlpha=1;
   ctx.strokeStyle='rgba(72,54,32,0.38)';ctx.lineWidth=.07;ctx.strokeRect(-1.9,-1.9,3.8,3.8);
   ctx.restore();
  }
 }
 /** Broad luminance/warmth masses (±6 % / ±4 %) at 11–36 tile scales, so open
  * ground is never one flat sand tone. A tiny per-tile canvas is upscaled with
  * smoothing, then overlaid (128 is neutral). */
 private macroVariation(ctx:CanvasRenderingContext2D,x0:number,y0:number){
  const G=CHUNK+4,canvas=document.createElement('canvas');canvas.width=canvas.height=G;const c=canvas.getContext('2d')!,image=c.createImageData(G,G);
  for(let ty=0;ty<G;ty++)for(let tx=0;tx<G;tx++){
   const x=x0-2+tx,y=y0-2+ty,l=(smoothNoise(x,y,28,101)-.5)*1.4+(smoothNoise(x,y,11,103)-.5)*.6,w=(smoothNoise(x,y,36,107)-.5)*2,o=(ty*G+tx)*4;
   image.data[o]=128+l*15+w*10;image.data[o+1]=128+l*15;image.data[o+2]=128+l*15-w*10;image.data[o+3]=255;
  }
  c.putImageData(image,0,0);
  ctx.save();ctx.globalCompositeOperation='overlay';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,x0-2,y0-2,G,G);ctx.restore();
 }
 /** Sparse stylized ground scatter: pebble clusters, dry tufts, stains and
  * tyre ruts on open ground (about one per six tiles), oil spots on pads.
  * Deterministic per tile; drawn in tile space so it lies flat on the ground. */
 private scatter(ctx:CanvasRenderingContext2D,x0:number,y0:number,cell:(x:number,y:number)=>Material|undefined){
  ctx.save();
  for(let y=y0-2;y<=y0+CHUNK+1;y++)for(let x=x0-2;x<=x0+CHUNK+1;x++){
   const m=cell(x,y);if(!m||terrainAt(this.map,x,y)!=='open')continue;
   const roll=terrainHash(x,y,131),kind=terrainHash(x,y,137),ox=x+.2+terrainHash(x,y,139)*.6,oy=y+.2+terrainHash(x,y,149)*.6;
   if(m==='concrete_slab'||m==='industrial_pavement'){
    if(roll<.11){const g=ctx.createRadialGradient(ox,oy,0,ox,oy,.32);g.addColorStop(0,'rgba(24,22,20,0.34)');g.addColorStop(1,'rgba(24,22,20,0)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(ox,oy,.32,.24,kind*3,0,Math.PI*2);ctx.fill()}
    continue;
   }
   if(roll>=.17)continue;
   if(kind<.42){
    // Pebble cluster: dark body, warm sunlit rim toward the light (north-west).
    const count=3+Math.floor(terrainHash(x,y,151)*3);
    for(let i=0;i<count;i++){
     const px=ox+(terrainHash(x+i,y,157)-.5)*.34,py=oy+(terrainHash(x,y+i,163)-.5)*.34,r=.035+terrainHash(x+i,y+i,167)*.05;
     ctx.fillStyle='rgba(54,42,30,0.62)';ctx.beginPath();ctx.ellipse(px,py,r,r*.85,0,0,Math.PI*2);ctx.fill();
     ctx.fillStyle='rgba(232,210,166,0.42)';ctx.beginPath();ctx.ellipse(px-r*.3,py-r*.3,r*.55,r*.45,0,0,Math.PI*2);ctx.fill();
    }
   }else if(kind<.74){
    // Dry grass tuft: short olive strokes fanning toward screen-up (tile -x,-y).
    ctx.strokeStyle=kind<.58?'rgba(92,88,44,0.72)':'rgba(126,112,58,0.66)';ctx.lineWidth=.028;ctx.lineCap='round';
    const blades=5+Math.floor(terrainHash(x,y,173)*4);ctx.beginPath();
    for(let i=0;i<blades;i++){const a=-Math.PI*.75+(terrainHash(x+i,y,179)-.5)*1.5,len=.09+terrainHash(x,y+i,181)*.1;ctx.moveTo(ox,oy);ctx.lineTo(ox+Math.cos(a)*len,oy+Math.sin(a)*len)}
    ctx.stroke();
   }else if(kind<.9){
    const g=ctx.createRadialGradient(ox,oy,0,ox,oy,.42);g.addColorStop(0,'rgba(70,52,34,0.2)');g.addColorStop(1,'rgba(70,52,34,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(ox,oy,.42,.3,kind*6,0,Math.PI*2);ctx.fill();
   }else{
    // Tyre ruts: two faint parallel arcs crossing the tile.
    const a=terrainHash(x,y,191)*Math.PI,dx=Math.cos(a),dy=Math.sin(a),nx=-dy*.08,ny=dx*.08;
    ctx.strokeStyle='rgba(66,50,34,0.26)';ctx.lineWidth=.035;ctx.beginPath();
    for(const side of [-1,1]){ctx.moveTo(ox-dx*.7+nx*side,oy-dy*.7+ny*side);ctx.quadraticCurveTo(ox+nx*side+ny*.6,oy+ny*side-nx*.6,ox+dx*.7+nx*side,oy+dy*.7+ny*side)}
    ctx.stroke();
   }
  }
  ctx.restore();
 }
 /** Feeds the current authorized masks into the shared fog field and uploads
  * only when a texel changed. Call once per snapshot, then refreshFog() each
  * fragment. Returns whether the field changed. */
 updateFog(visible:readonly boolean[],explored:readonly boolean[]):boolean{
  const changed=this.fog.update(visible,explored);
  if(changed)this.uploadFog();
  return changed;
 }
 private fogTextureFor():Texture{
  if(!this.fogTexture){
   const canvas=document.createElement('canvas');canvas.width=this.fog.texWidth;canvas.height=this.fog.texHeight;const ctx=canvas.getContext('2d')!;
   this.fogCanvas=canvas;this.fogImage=ctx.createImageData(canvas.width,canvas.height);
   this.fog.writePixels(this.fogImage.data,{x0:0,y0:0,x1:canvas.width-1,y1:canvas.height-1});ctx.putImageData(this.fogImage,0,0);
   this.fogTexture=Texture.from(canvas);this.fogTexture.source.scaleMode='linear';this.fogTexture.source.addressMode='clamp-to-edge';this.fogUploaded=this.fog.version;
  }
  return this.fogTexture;
 }
 private uploadFog(){
  if(!this.fogTexture||!this.fogCanvas||!this.fogImage||this.fogUploaded===this.fog.version)return;
  const rect=this.fog.dirty??{x0:0,y0:0,x1:this.fog.texWidth-1,y1:this.fog.texHeight-1};
  this.fog.writePixels(this.fogImage.data,rect);
  this.fogCanvas.getContext('2d')!.putImageData(this.fogImage,0,0,rect.x0,rect.y0,rect.x1-rect.x0+1,rect.y1-rect.y0+1);
  this.fogTexture.source.update();this.fogUploaded=this.fog.version;
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
  const [r,g,b]=MINIMAP_BASE[t]??MINIMAP_BASE.open;const k=1+h*0.07;return [Math.min(255,r*k)|0,Math.min(255,g*k)|0,Math.min(255,b*k)|0] as const;
 }
}
