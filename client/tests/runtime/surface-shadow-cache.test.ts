import test from 'node:test';
import assert from 'node:assert/strict';
import {Container,Texture,type Renderer} from 'pixi.js';
import {SurfaceShadows,type ShadowView,type ShadowPlate} from '../../src/render/surface-shadows';
import {TerrainSurface,projectSurfaceVertex} from '../../src/render/terrain-surface';
import {LEVEL_PX,toScreen,toWorld} from '../../src/render/iso';

const map=(width=32,height=28)=>({width,height,tiles:Array.from({length:width*height},(_,i)=>({terrain:i%13===0?'cliff':'road',height:(i*7+Math.floor(i/width))%5}))});
const view:ShadowView={left:-80,top:160,right:80,bottom:280,zoom:1};
const plate:ShadowPlate={id:1,origin:{x:4000,y:4000},scale:1,alpha:.5,frame:{texture:Texture.EMPTY,atlasTexture:Texture.EMPTY,anchorX:.5,anchorY:.5}};
function harness(){const layer=new Container(),renderer={resolution:1,render(){}} as unknown as Renderer,shadows=new SurfaceShadows(layer,renderer);return {layer,renderer,shadows,inner:shadows as any}}
interface Draw {depth:number;positions:number[];uvs:number[]}
/** Frozen pre-cache geometry algorithm. Quantize positions/flat coordinates
 * before UV generation exactly as the shipped renderer did. */
function legacy(surface:TerrainSurface,visible:readonly boolean[]|undefined,v:ShadowView,texture:{width:number;height:number}){
 const pad=64/v.zoom+surface.maxHeight*LEVEL_PX,left=v.left-pad,top=v.top-pad,right=v.right+pad,bottom=v.bottom+pad;
 const corners=[[left,top],[right,top],[right,bottom],[left,bottom]].map(([x,y])=>toWorld(x,y)),guard=surface.maxHeight*1000;
 const bounds={left:Math.max(0,Math.floor((Math.min(...corners.map(p=>p.x))-guard)/1000)*1000),top:Math.max(0,Math.floor((Math.min(...corners.map(p=>p.y))-guard)/1000)*1000),right:Math.min(surface.width*1000,Math.ceil((Math.max(...corners.map(p=>p.x))+guard)/1000)*1000),bottom:Math.min(surface.height*1000,Math.ceil((Math.max(...corners.map(p=>p.y))+guard)/1000)*1000)};
 const groups=new Map<number,{positions:number[];flat:number[]}>(),tiles=new Set<number>();
 for(const triangle of surface.triangles(bounds)){
  if(triangle.kind!=='top')continue;tiles.add(triangle.tile);if(visible&&!visible[triangle.tile])continue;
  let group=groups.get(triangle.depth);if(!group){group={positions:[],flat:[]};groups.set(triangle.depth,group)}
  for(const vertex of triangle.vertices){const p=projectSurfaceVertex(vertex),flat=toScreen(vertex.x,vertex.y);group.positions.push(p.x,p.y);group.flat.push(flat.x,flat.y)}
 }
 const draw:Draw[]=[];for(const [depth,data] of groups){const flat=new Float32Array(data.flat),uv=new Float32Array(data.positions.length);for(let i=0;i<uv.length;i+=2){uv[i]=(flat[i]-left)*v.zoom/texture.width;uv[i+1]=(flat[i+1]-top)*v.zoom/texture.height}draw.push({depth:depth+.00005,positions:[...new Float32Array(data.positions)],uvs:[...uv]})}
 return {draw:draw.sort((a,b)=>a.depth-b.depth),tiles};
}
function actual(inner:any):Draw[]{
 const draw:Draw[]=[];for(const group of inner.ground.values()){
  const {mesh}=group,g=mesh.geometry;
  assert.equal(g.positions.length/2,g.indices.length,'no hidden/unindexed vertices may enter Pixi batching');
  if(!g.indices.length){assert.equal(mesh.visible,false,'empty geometry must never use drawArrays');continue}
  assert.equal(mesh.visible,true);const positions:number[]=[],uvs:number[]=[];
  for(const index of g.indices){positions.push(g.positions[index*2],g.positions[index*2+1]);uvs.push(g.uvs[index*2],g.uvs[index*2+1])}
  draw.push({depth:mesh.zIndex,positions,uvs});
 }
 return draw.sort((a,b)=>a.depth-b.depth);
}
function check(shadows:SurfaceShadows,inner:any,surface:TerrainSurface,visible:readonly boolean[]|undefined,v=view){shadows.update([plate],surface,visible,v);assert.deepEqual(actual(inner),legacy(surface,visible,v,inner.texture).draw)}
const refs=(inner:any)=>new Map([...inner.ground].map(([depth,g]:any)=>[depth,{positions:g.mesh.geometry.positions,uvs:g.mesh.geometry.uvs,indices:g.mesh.geometry.indices,positionBuffer:g.positions?.buffer,flatBuffer:g.flat.buffer,uvBuffer:g.uvs?.buffer,indexBuffer:g.indices?.buffer}]));
function sameViews(inner:any,before:ReturnType<typeof refs>){for(const [depth,after] of refs(inner)){const old=before.get(depth)!;assert.equal(after.positions,old.positions);assert.equal(after.uvs,old.uvs);assert.equal(after.indices,old.indices)}}

test('shadow cache exactly matches old indexed coordinates, UVs, depths and packed vertex count across fog and camera changes',()=>{
 const {shadows,inner}=harness(),m=map(),surface=new TerrainSurface(m),all=Array(m.tiles.length).fill(true),hidden=all.map(()=>false),sparse=all.map((_,i)=>i%3===0),edge=all.map((_,i)=>i%m.width===0||i%m.width===m.width-1);
 try{
  for(const visible of [undefined,hidden,all,sparse,edge,hidden,undefined])check(shadows,inner,surface,visible);
  for(const v of [{...view,left:view.left+.001,right:view.right+.001},{...view,left:180,right:340,top:320,bottom:440},{...view,zoom:.45},{...view,zoom:1.8},{left:-420,right:420,top:-280,bottom:520,zoom:1}])for(const visible of [sparse,all,hidden,undefined])check(shadows,inner,surface,visible,v);
  const changed=structuredClone(m);changed.tiles[5].height=4-changed.tiles[5].height;check(shadows,inner,new TerrainSurface(changed),sparse);
 }finally{shadows.dispose()}
});

test('fog-only changes avoid triangle generation and reuse compact buffer storage; unchanged/offscreen fog reuses views',()=>{
 const {shadows,inner}=harness(),m=map(),surface=new TerrainSurface(m),all=Array(m.tiles.length).fill(true);let topCalls=0,edgeCalls=0;
 const top=surface.topTriangles.bind(surface),edges=surface.edgeFaces.bind(surface);surface.topTriangles=tile=>{topCalls++;return top(tile)};surface.edgeFaces=tile=>{edgeCalls++;return edges(tile)};
 try{
  shadows.update([plate],surface,all,view);const before=refs(inner),calls=topCalls;assert(calls>0);assert.equal(edgeCalls,0,'shadow geometry never needs edge faces');
  shadows.update([plate],surface,[...all],view);sameViews(inner,before);assert.equal(topCalls,calls);
  const covered=legacy(new TerrainSurface(m),undefined,view,inner.texture).tiles,outside=all.findIndex((_,i)=>!covered.has(i));assert(outside>=0);
  const offscreen=[...all];offscreen[outside]=false;shadows.update([plate],surface,offscreen,view);sameViews(inner,before);assert.equal(topCalls,calls);
  const inside=[...offscreen];inside[[...covered][0]]=false;shadows.update([plate],surface,inside,view);assert.equal(topCalls,calls);assert.equal(edgeCalls,0);
  for(const [depth,after] of refs(inner)){const old=before.get(depth)!;assert.equal(after.positionBuffer,old.positionBuffer);assert.equal(after.flatBuffer,old.flatBuffer);assert.equal(after.uvBuffer,old.uvBuffer);assert.equal(after.indexBuffer,old.indexBuffer)}
  assert.deepEqual(actual(inner),legacy(new TerrainSurface(m),inside,view,inner.texture).draw);
 }finally{shadows.dispose()}
});

test('clear, no-ground, texture resize, terrain replacement and disposal invalidate all cached geometry safely',()=>{
 const {shadows,inner,renderer,layer}=harness(),m=map(),visible=Array(m.tiles.length).fill(true);let surface=new TerrainSurface(m);
 try{
  check(shadows,inner,surface,visible);const first=inner.texture;shadows.clear();assert(first.destroyed);assert.equal(inner.ground.size,0);check(shadows,inner,surface,visible);
  const second=inner.texture;shadows.update([],surface,visible,view);assert(second.destroyed);assert.equal(inner.ground.size,0);check(shadows,inner,surface,visible);
  const third=inner.texture;(renderer as any).resolution=2;check(shadows,inner,surface,visible);assert(third.destroyed);
  check(shadows,inner,surface,visible,{...view,right:480,bottom:720});
  const next=structuredClone(m);next.tiles.forEach(tile=>tile.height=0);surface=new TerrainSurface(next);check(shadows,inner,surface,visible);
 }finally{const texture=inner.texture;shadows.dispose();assert(texture.destroyed);assert.equal(inner.ground.size,0);assert.equal(layer.children.length,0);assert.equal(inner.texture,undefined);assert.equal(inner.surface,undefined);assert.equal(Texture.EMPTY.destroyed,false)}
});
