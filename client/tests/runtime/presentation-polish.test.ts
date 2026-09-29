import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainSurface,surfaceFogOpacity,type SurfaceTriangle} from '../../src/render/terrain-surface';
import {fogTopology,fogVertexAlphas,FOG_FAN_CENTRE_CAP} from '../../src/render/terrain';
import {memoryLabelSize} from '../../src/render/battlefield';

type Tile={terrain:string;height:number};
const map=(width:number,height:number,tile:(x:number,y:number)=>Tile=()=>({terrain:'open',height:0}))=>({width,height,tiles:Array.from({length:width*height},(_,i)=>tile(i%width,Math.floor(i/width)))});
const opacity=(tile:number,visible:readonly boolean[],explored:readonly boolean[])=>visible[tile]?0:explored[tile]?175:255;
/** Front-facing triangles split into the same depth/kind fragments the baker draws. */
function fragments(surface:TerrainSurface){
 const groups=new Map<string,SurfaceTriangle[]>();
 for(const t of surface.triangles()){if(!t.frontFacing)continue;const key=`${t.depth.toFixed(6)}:${t.kind}`;const g=groups.get(key)??[];g.push(t);groups.set(key,g)}
 return [...groups.values()];
}
/** Production path for one fragment: topology, then current tile opacities per slot. */
function alphas(triangles:readonly SurfaceTriangle[],width:number,height:number,visible:boolean[],explored:boolean[]){
 const topology=fogTopology(triangles,width,height),tiles=Array.from(topology.fogTiles,tile=>opacity(tile,visible,explored)),out=new Float32Array(triangles.length*3);
 const any=fogVertexAlphas(triangles,topology,tiles,visible,explored,out);
 return {out,any,topology};
}
/** Pre-change reference: every vertex takes the darkest in-map tile touching its ground point. */
function legacy(triangle:SurfaceTriangle,width:number,height:number,visible:boolean[],explored:boolean[]){
 const base=surfaceFogOpacity(triangle,visible,explored);if(base!==0)return triangle.vertices.map(()=>base);
 return triangle.vertices.map(v=>{let alpha=0;for(const tile of pointTiles(v.x,v.y,width,height))alpha=Math.max(alpha,opacity(tile,visible,explored));return alpha});
}
function pointTiles(x:number,y:number,width:number,height:number){
 const tx=x/1000,ty=y/1000,x0=Math.max(0,Number.isInteger(tx)?tx-1:Math.floor(tx)),x1=Math.min(width-1,Math.floor(tx)),y0=Math.max(0,Number.isInteger(ty)?ty-1:Math.floor(ty)),y1=Math.min(height-1,Math.floor(ty)),out:number[]=[];
 for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++)out.push(j*width+i);
 return out;
}
/** Every fragment's alphas keyed by triangle id. */
function alphasById(surface:TerrainSurface,visible:boolean[],explored:boolean[]){
 const byId=new Map<string,{triangle:SurfaceTriangle;alpha:number[]}>();
 for(const group of fragments(surface)){const {out}=alphas(group,surface.width,surface.height,visible,explored);group.forEach((t,i)=>byId.set(t.id,{triangle:t,alpha:[out[i*3],out[i*3+1],out[i*3+2]]}))}
 return byId;
}
/** Fan planes of one tile, alpha as a function of ground x,y: all 12 vertices on triangle 0's plane. */
function assertCoplanarFan(byId:ReturnType<typeof alphasById>,tile:number){
 const fan=[0,1,2,3].map(i=>byId.get(`t${tile}.${i}`)!);
 const [a,b,c]=fan[0].triangle.vertices.map((v,j)=>({x:v.x/1000,y:v.y/1000,z:fan[0].alpha[j]}));
 const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z,nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
 for(const {triangle,alpha} of fan)triangle.vertices.forEach((v,j)=>{
  const plane=a.z-(nx*(v.x/1000-a.x)+ny*(v.y/1000-a.y))/nz;
  assert(Math.abs(alpha[j]-plane)<=1,`${triangle.id} vertex ${j}: ${alpha[j]} is off the fan plane ${plane} by more than 1/255`);
 });
}
const lcg=(seed:number)=>()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;

test('F1 straight fog edges make each boundary fan coplanar, removing the centre-to-corner crease',()=>{
 const w=8,h=8,surface=new TerrainSurface(map(w,h));
 for(const hidden of ['unknown','remembered'] as const){
  const visible=Array.from({length:w*h},(_,i)=>Math.floor(i/w)>=3),explored=visible.map(v=>v||hidden==='remembered'),byId=alphasById(surface,visible,explored);
  const edge=hidden==='unknown'?255:175;
  for(let x=1;x<w-1;x++){
   const tile=3*w+x;assertCoplanarFan(byId,tile);
   assert.equal(byId.get(`t${tile}.0`)!.alpha[0],edge/2,'centre = mean of (edge,edge,0,0)');
  }
  // A vertical straight edge is coplanar too.
  const vVisible=Array.from({length:w*h},(_,i)=>i%w>=3),vById=alphasById(surface,vVisible,vVisible.map(v=>v||hidden==='remembered'));
  for(let y=1;y<h-1;y++)assertCoplanarFan(vById,y*w+3);
 }
});

test('F1 fully visible interiors stay exactly clear and an all-visible fragment needs no fog',()=>{
 const w=9,h=9,surface=new TerrainSurface(map(w,h));
 const visible=Array.from({length:w*h},(_,i)=>{const x=i%w,y=Math.floor(i/w);return x>=2&&x<=6&&y>=2&&y<=6}),explored=[...visible],byId=alphasById(surface,visible,explored);
 for(let y=3;y<=5;y++)for(let x=3;x<=5;x++)for(let i=0;i<4;i++)assert.deepEqual(byId.get(`t${y*w+x}.${i}`)!.alpha,[0,0,0],`tile ${x},${y} has all nine surrounding tiles visible`);
 const all=Array(w*h).fill(true);for(const group of fragments(surface))assert.equal(alphas(group,w,h,all,all).any,false);
});

test('F1 unknown/remembered vertices are unchanged, visible vertices never drop, and only fan centres rise (capped)',()=>{
 // Heights and cliffs add edge-face triangles; a pseudo-random public view mixes all three states.
 const w=14,h=12,rand=lcg(7),m=map(w,h,(x,y)=>({terrain:(x*7+y*3)%11===0?'cliff':'open',height:(x>6&&y>4)?2:(x+y)%9===0?1:0})),surface=new TerrainSurface(m);
 for(let round=0;round<6;round++){
  const visible=Array.from({length:w*h},()=>rand()<.45),explored=visible.map(v=>v||rand()<.5),byId=alphasById(surface,visible,explored);
  let raised=0;
  for(const {triangle,alpha} of byId.values()){
   const before=legacy(triangle,w,h,visible,explored),base=surfaceFogOpacity(triangle,visible,explored);
   if(base!==0){assert.deepEqual(alpha,before,`${triangle.id}: ${base} triangle changed`);assert(alpha.every(a=>a===base));continue}
   alpha.forEach((a,j)=>assert(a>=before[j],`${triangle.id} vertex ${j} reduced ${before[j]} -> ${a}`));
   if(triangle.kind==='face'){assert.deepEqual(alpha,before,`${triangle.id}: face fog changed`);continue}
   assert.deepEqual(alpha.slice(1),before.slice(1),`${triangle.id}: corner changed`);
   assert(alpha[0]<=Math.max(before[0],FOG_FAN_CENTRE_CAP));if(alpha[0]>before[0])raised++;
  }
  assert(raised>0,'the fixture exercises raised centres');
 }
});

test('F1 a lone visible tile becomes a flat capped patch, identical across depth fragments',()=>{
 const w=7,h=7,surface=new TerrainSurface(map(w,h)),tile=3*w+3,visible=Array.from({length:w*h},(_,i)=>i===tile),explored=[...visible];
 const byId=alphasById(surface,visible,explored);
 // Fan triangles 0/3 and 1/2 fall into different depth fragments; each reads all four corners.
 assert.notEqual(byId.get(`t${tile}.0`)!.triangle.depth,byId.get(`t${tile}.1`)!.triangle.depth);
 for(let i=0;i<4;i++)assert.deepEqual(byId.get(`t${tile}.${i}`)!.alpha,[FOG_FAN_CENTRE_CAP,255,255]);
});

test('F1 topology reads every tile the far corners touch, so changed-tile memoization sees them; geometry untouched',()=>{
 const w=6,h=6,surface=new TerrainSurface(map(w,h,(x,y)=>({terrain:'open',height:x>2?1:0}))),tile=2*w+2,triangle=surface.topTriangles(tile)[0],before=structuredClone(triangle);
 const topology=fogTopology([triangle],w,h),tiles=new Set(topology.fogTiles);
 for(const [dx,dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]])assert(tiles.has(tile+dy*w+dx),`tile ${dx},${dy} missing from the fog dependency set`);
 assert.deepEqual(triangle,before);
 // Only the diagonal (3,3) changes: the NW-NE triangle's centre must follow it.
 const visible=Array(w*h).fill(true),explored=[...visible];
 const clear=alphas([triangle],w,h,visible,explored).out[0];visible[3*w+3]=false;
 assert.equal(clear,0);assert.equal(alphas([triangle],w,h,visible,explored).out[0],175/4);
 explored[3*w+3]=false;assert.equal(alphas([triangle],w,h,visible,explored).out[0],255/4);
});

test('F5 last-seen tag follows the UI scale and never falls below 11px',()=>{
 assert.equal(memoryLabelSize(.85),11);assert.equal(memoryLabelSize(1),12);assert.equal(memoryLabelSize(1.5),18);assert.equal(memoryLabelSize(Number.NaN),12);
 for(let s=.85;s<=1.5;s+=.05)assert(memoryLabelSize(s)>=11);
});
