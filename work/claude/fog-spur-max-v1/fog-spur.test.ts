// Source tests for the bounded MAX spur fill in candidate-terrain.ts. They
// compare the candidate with the frozen combined-candidate fog on the same
// fragments the baker builds. These are CPU vertex tests only: no GPU,
// appearance, privacy-floor or native claim is earned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainSurface,surfaceFogOpacity,compareSurfaceTriangles,type SurfaceTriangle} from '../../renderer-performance-v1/candidate/client/src/render/terrain-surface';
import {fogTopology,fogVertexAlphas,FOG_FAN_CENTRE_CAP,CHUNK} from './candidate-terrain';
import {fogTopology as frozenTopology,fogVertexAlphas as frozenAlphas} from '../../renderer-performance-v1/combined-candidate/client/src/render/terrain';

type Tile={terrain:string;height:number};
const map=(width:number,height:number,tile:(x:number,y:number)=>Tile=()=>({terrain:'open',height:0}))=>({width,height,tiles:Array.from({length:width*height},(_,i)=>tile(i%width,Math.floor(i/width)))});
const opacity=(tile:number,visible:readonly boolean[],explored:readonly boolean[])=>visible[tile]?0:explored[tile]?175:255;
const lcg=(seed:number)=>()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const CARDINAL=[[0,-1],[1,0],[0,1],[-1,0]] as const,CORNERS=[[0,0],[1,0],[1,1],[0,1]] as const;
function pointTiles(x:number,y:number,width:number,height:number){
 const tx=x/1000,ty=y/1000,x0=Math.max(0,Number.isInteger(tx)?tx-1:Math.floor(tx)),x1=Math.min(width-1,Math.floor(tx)),y0=Math.max(0,Number.isInteger(ty)?ty-1:Math.floor(ty)),y1=Math.min(height-1,Math.floor(ty)),out:number[]=[];
 for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++)out.push(j*width+i);
 return out;
}
/** The baker's own fragments: per chunk, front-facing, grouped by depth/kind/tier. */
function bakerFragments(surface:TerrainSurface){
 const out:SurfaceTriangle[][]=[];
 for(let cy=0;cy*CHUNK<surface.height;cy++)for(let cx=0;cx*CHUNK<surface.width;cx++){
  const x0=cx*CHUNK,y0=cy*CHUNK,x1=Math.min(x0+CHUNK,surface.width),y1=Math.min(y0+CHUNK,surface.height),groups=new Map<string,SurfaceTriangle[]>();
  for(const t of surface.triangles({left:x0*1000,top:y0*1000,right:x1*1000,bottom:y1*1000})){
   if(!t.frontFacing)continue;
   const tier=t.kind==='face'&&Math.max(...t.vertices.map(v=>v.height))-Math.min(...t.vertices.map(v=>v.height))>1?2:1;
   const key=`${t.depth.toFixed(6)}:${t.kind}:${tier}`;let g=groups.get(key);if(!g){g=[];groups.set(key,g)}g.push(t);
  }
  for(const g of [...groups.values()].sort((a,b)=>compareSurfaceTriangles(a[0],b[0])))out.push(g.sort(compareSurfaceTriangles));
 }
 return out;
}
/** Topologies built once per fragment, as the baker does. */
function prepare(surface:TerrainSurface){
 return bakerFragments(surface).map(triangles=>({triangles,candidate:fogTopology(triangles,surface.width,surface.height),frozen:frozenTopology(triangles,surface.width,surface.height)}));
}
type Prepared=ReturnType<typeof prepare>;
type Entry={triangle:SurfaceTriangle;alpha:number[];frozen:number[]};
/** Candidate and frozen alphas for every triangle, keyed by id. */
function evaluate(prepared:Prepared,visible:boolean[],explored:boolean[]){
 const byId=new Map<string,Entry>();
 for(const {triangles,candidate,frozen} of prepared){
  const out=new Float32Array(triangles.length*3),old=new Float32Array(triangles.length*3);
  fogVertexAlphas(triangles,candidate,Array.from(candidate.fogTiles,t=>opacity(t,visible,explored)),visible,explored,out);
  frozenAlphas(triangles,frozen,Array.from(frozen.fogTiles,t=>opacity(t,visible,explored)),visible,explored,old);
  triangles.forEach((t,i)=>byId.set(t.id,{triangle:t,alpha:[out[i*3],out[i*3+1],out[i*3+2]],frozen:[old[i*3],old[i*3+1],old[i*3+2]]}));
 }
 return byId;
}
/** Independent statement of the spec for one tile. */
function spur(tile:number,width:number,height:number,visible:boolean[],explored:boolean[]){
 const x=tile%width,y=Math.floor(tile/width);
 const corners=CORNERS.map(([dx,dy])=>Math.max(0,...pointTiles((x+dx)*1000,(y+dy)*1000,width,height).map(t=>opacity(t,visible,explored))));
 const joined=CARDINAL.some(([dx,dy])=>{const nx=x+dx,ny=y+dy;return nx>=0&&ny>=0&&nx<width&&ny<height&&visible[ny*width+nx]});
 return {corners,joined,filled:!!visible[tile]&&Math.min(...corners)>0&&joined,fill:Math.max(...corners)};
}
/** Exact oracle: filled fans are constant MAX corner, every other triangle is frozen. */
function checkAll(byId:Map<string,Entry>,width:number,height:number,visible:boolean[],explored:boolean[],label:string){
 let fills=0;
 for(const {triangle,alpha,frozen} of byId.values()){
  const base=surfaceFogOpacity(triangle,visible,explored),id=`${label} ${triangle.id}`;
  alpha.forEach((a,j)=>assert(a>=frozen[j],`${id} vertex ${j} reduced ${frozen[j]} -> ${a}`));
  if(base!==0||triangle.kind==='face'){assert.deepEqual(alpha,frozen,`${id}: protected triangle changed`);continue}
  const s=spur(triangle.tile,width,height,visible,explored);
  if(s.filled){assert.deepEqual(alpha,[s.fill,s.fill,s.fill],`${id}: spur not MAX-filled`);assert(s.fill===175||s.fill===255);fills++}
  else assert.deepEqual(alpha,frozen,`${id}: non-spur triangle changed`);
 }
 return fills;
}
const disk=(w:number,h:number,cx:number,cy:number,r:number)=>Array.from({length:w*h},(_,i)=>{const dx=i%w-cx,dy=Math.floor(i/w)-cy;return r>=0&&dx*dx+dy*dy<=r*r});

test('S0 the recorded MIN-fill counterexample is preserved: MIN lowers vertices and an interior sample, MAX does not',()=>{
 // work/renderer-performance-browser-v1/prepared/fog-proposal-counterexample.json
 const rows=['E V E','E V E','U U E'].map(r=>r.split(' ')),w=3,h=3,surface=new TerrainSurface(map(w,h));
 const visible=rows.flat().map(c=>c==='V'),explored=rows.flat().map(c=>c!=='U'),byId=evaluate(prepare(surface),visible,explored);
 const recorded=[128,175,175,128,175,255,128,255,255,128,255,175];
 assert.deepEqual([0,1,2,3].flatMap(i=>byId.get(`t4.${i}`)!.frozen),recorded,'frozen fog reproduces the recorded actual alphas');
 const s=spur(4,w,h,visible,explored);assert.deepEqual(s.corners,[175,175,255,255]);assert(s.joined&&s.filled);
 const min=Math.min(...s.corners);assert(recorded.some(a=>a>min),'MIN fill would lower a 255 vertex to 175');
 for(let i=0;i<4;i++)assert.deepEqual(byId.get(`t4.${i}`)!.alpha,[255,255,255]);
 // East triangle [centre,NE,SE], weights (.25,.25,.5): frozen 203.25, MIN 175, MAX 255.
 const weights=[.25,.25,.5],east=byId.get('t4.1')!,sample=(a:number[])=>a.reduce((n,v,j)=>n+v*weights[j],0);
 assert.equal(sample(east.frozen),203.25);assert(min<sample(east.frozen));assert.equal(sample(east.alpha),255);
 checkAll(byId,w,h,visible,explored,'counterexample');
});

test('S1 all 19683 public 3x3 masks, flat and raised: exact oracle, protected triangles equal, no vertex drops',()=>{
 for(const raised of [false,true]){
  const w=3,h=3,surface=new TerrainSurface(map(w,h,(x,y)=>({terrain:'open',height:raised&&x===1&&y===1?1:raised&&x===2?2:0}))),prepared=prepare(surface);
  if(raised)assert(prepared.some(p=>p.triangles[0].kind==='face'),'raised fixture has face triangles');
  let centreVisible=0,filled=0,solitary=0;
  for(let mask=0;mask<19683;mask++){
   const state:number[]=[];for(let k=0,m=mask;k<9;k++,m=Math.floor(m/3))state.push(m%3);
   const visible=state.map(s=>s===2),explored=state.map(s=>s>=1),byId=evaluate(prepared,visible,explored);
   checkAll(byId,w,h,visible,explored,`mask ${state.join('')}`);
   if(!visible[4])continue;
   centreVisible++;
   const s=spur(4,w,h,visible,explored),fan=[0,1,2,3].map(i=>byId.get(`t4.${i}`)!);
   if(s.filled){
    filled++;
    // No connected no-clear-corner tile keeps a centre brighter than its corners.
    for(const {alpha} of fan)for(const c of s.corners)assert(alpha[0]>=c);
   }else if(!s.joined){solitary++;for(const {alpha,frozen} of fan)assert.deepEqual(alpha,frozen,'solitary sighting unchanged')}
  }
  assert.equal(centreVisible,6561);assert(filled>0&&solitary>0,'both branches exercised');
 }
});

test('S2 solitary sightings keep the capped centre in both fragments; diagonal-only contact is solitary',()=>{
 const w=7,h=7,surface=new TerrainSurface(map(w,h)),prepared=prepare(surface),tile=3*w+3;
 for(const remembered of [false,true]){
  const visible=Array.from({length:w*h},(_,i)=>i===tile),explored=visible.map(v=>v||remembered),byId=evaluate(prepared,visible,explored),edge=remembered?175:255;
  assert.notEqual(byId.get(`t${tile}.0`)!.triangle.depth,byId.get(`t${tile}.1`)!.triangle.depth);
  for(let i=0;i<4;i++)assert.deepEqual(byId.get(`t${tile}.${i}`)!.alpha,[FOG_FAN_CENTRE_CAP,edge,edge]);
  checkAll(byId,w,h,visible,explored,'lone');
 }
 // Checkerboard: every visible tile touches others only diagonally.
 const visible=Array.from({length:w*h},(_,i)=>(i%w+Math.floor(i/w))%2===0),explored=[...visible],byId=evaluate(prepared,visible,explored);
 assert.equal(checkAll(byId,w,h,visible,explored,'checkerboard'),0);
 for(const e of byId.values())assert.deepEqual(e.alpha,e.frozen);
 // Lone sightings on a map corner and edge.
 for(const t of [0,w-1,(h-1)*w+3]){const v=Array.from({length:w*h},(_,i)=>i===t),b=evaluate(prepared,v,[...v]);for(const e of b.values())assert.deepEqual(e.alpha,e.frozen,`lone ${t}`)}
});

test('S3 existing straight-edge coplanarity and interior-clear cases are exactly the frozen alphas',()=>{
 const w=8,h=8,surface=new TerrainSurface(map(w,h)),prepared=prepare(surface);
 for(const remembered of [false,true])for(const vertical of [false,true]){
  const visible=Array.from({length:w*h},(_,i)=>(vertical?i%w:Math.floor(i/w))>=3),explored=visible.map(v=>v||remembered),byId=evaluate(prepared,visible,explored);
  for(const e of byId.values())assert.deepEqual(e.alpha,e.frozen,`${e.triangle.id} straight edge changed`);
  if(!vertical)for(let x=1;x<w-1;x++)assert.equal(byId.get(`t${3*w+x}.0`)!.alpha[0],(remembered?175:255)/2);
 }
 const n=9,square=new TerrainSurface(map(n,n)),visible=Array.from({length:n*n},(_,i)=>{const x=i%n,y=Math.floor(i/n);return x>=2&&x<=6&&y>=2&&y<=6}),byId=evaluate(prepare(square),visible,[...visible]);
 for(const e of byId.values())assert.deepEqual(e.alpha,e.frozen);
 for(let y=3;y<=5;y++)for(let x=3;x<=5;x++)for(let i=0;i<4;i++)assert.deepEqual(byId.get(`t${y*n+x}.${i}`)!.alpha,[0,0,0]);
});

test('S4 raised/cliff random views: remembered, unknown and face vertices exact; only spur fans change',()=>{
 const w=37,h=21,rand=lcg(11),m=map(w,h,(x,y)=>({terrain:(x*7+y*3)%11===0?'cliff':'open',height:(x>18&&y>6)?2:(x+y)%9===0?1:0})),surface=new TerrainSurface(m),prepared=prepare(surface);
 let fills=0;
 for(let round=0;round<8;round++){
  const p=[.2,.45,.7,.9][round%4],visible=Array.from({length:w*h},()=>rand()<p),explored=visible.map(v=>v||rand()<.5);
  fills+=checkAll(evaluate(prepared,visible,explored),w,h,visible,explored,`round ${round}`);
 }
 assert(fills>0,'the fixture exercises spur fills');
});

test('S5 every cardinal neighbour the fill reads is a fogTiles dependency, at map edges and chunk seams',()=>{
 for(const [w,h] of [[37,21],[16,16],[17,33],[1,5],[5,1]] as const){
  const surface=new TerrainSurface(map(w,h,(x,y)=>({terrain:'open',height:(x+y)%5===0?1:0}))),prepared=prepare(surface),rand=lcg(w*97+h);
  for(const {triangles,candidate,frozen} of prepared){
   // Only the two scalars are new; every typed array is the frozen topology.
   assert.equal(candidate.fogWidth,w);assert.equal(candidate.fogHeight,h);
   for(const key of ['fogTiles','fogPoints','fogPointStart','fogPointSlots','fogFanCorners'] as const)assert.deepEqual(candidate[key],frozen[key]);
   const deps=new Set(candidate.fogTiles);
   for(const t of triangles){
    if(t.kind!=='top')continue;const x=t.tile%w,y=Math.floor(t.tile/w);
    for(const [dx,dy] of CARDINAL){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h)assert(deps.has(ny*w+nx),`${t.id}: cardinal ${nx},${ny} missing`)}
   }
   // Output depends only on fogTiles: scrambling every other tile changes nothing.
   for(let round=0;round<4;round++){
    const visible=Array.from({length:w*h},()=>rand()<.5),explored=visible.map(v=>v||rand()<.5),out=new Float32Array(triangles.length*3),again=new Float32Array(triangles.length*3);
    fogVertexAlphas(triangles,candidate,Array.from(candidate.fogTiles,t=>opacity(t,visible,explored)),visible,explored,out);
    const v2=visible.map((v,i)=>deps.has(i)?v:rand()<.5),e2=explored.map((e,i)=>deps.has(i)?e:rand()<.5);
    fogVertexAlphas(triangles,candidate,Array.from(candidate.fogTiles,t=>opacity(t,v2,e2)),v2,e2,again);
    assert.deepEqual(again,out);
   }
  }
 }
 // Two-tile spurs split by a chunk seam (x=16, x=32, y=16) or lying along a map
 // edge: each fan reads its partner from another fragment and fills.
 const w=40,h=40,surface=new TerrainSurface(map(w,h)),prepared=prepare(surface);
 for(const [a,b] of [[10*w+15,10*w+16],[10*w+31,10*w+32],[15*w+10,16*w+10],[20,w+20],[20*w,20*w+1]]){
  const visible=Array.from({length:w*h},(_,i)=>i===a||i===b),explored=[...visible],byId=evaluate(prepared,visible,explored);
  checkAll(byId,w,h,visible,explored,`seam ${a}/${b}`);
  for(const t of [a,b])for(let i=0;i<4;i++)assert.deepEqual(byId.get(`t${t}.${i}`)!.alpha,[255,255,255],`tile ${t} fan ${i}`);
 }
 // At a map corner the outer ground point touches only visible in-map tiles, so
 // the corner stays clear and the frozen feathering is kept.
 for(const [a,b] of [[39,w+39],[39*w+39,39*w+38]]){
  const visible=Array.from({length:w*h},(_,i)=>i===a||i===b),explored=[...visible],byId=evaluate(prepared,visible,explored);
  assert.equal(checkAll(byId,w,h,visible,explored,`corner ${a}/${b}`),0);
 }
});

test('S6 vision disks r=2..14: poles are MAX-filled and no connected no-clear-corner tile keeps a bright centre',()=>{
 const w=40,h=40,c=20,surface=new TerrainSurface(map(w,h)),prepared=prepare(surface);
 for(let r=2;r<=14;r++)for(const memory of ['none','ring','all'] as const){
  const visible=disk(w,h,c,c,r),explored=memory==='all'?Array(w*h).fill(true):memory==='ring'?disk(w,h,c,c,r+3):[...visible],byId=evaluate(prepared,visible,explored);
  checkAll(byId,w,h,visible,explored,`r${r} ${memory}`);
  for(let tile=0;tile<w*h;tile++){
   if(!visible[tile])continue;const s=spur(tile,w,h,visible,explored);
   if(!s.joined||Math.min(...s.corners)===0)continue;
   for(let i=0;i<4;i++){const a=byId.get(`t${tile}.${i}`)!.alpha;assert(a.every(v=>v===a[0]),`r${r} tile ${tile}: non-constant spur`);for(const k of s.corners)assert(a[0]>=k)}
  }
  for(const [px,py] of [[c,c-r],[c+r,c],[c,c+r],[c-r,c]]){
   const pole=py*w+px,e=byId.get(`t${pole}.0`)!;
   assert(e.frozen[0]<Math.min(e.frozen[1],e.frozen[2]),`r${r} pole had the detached bright centre before`);
   // Unknown surroundings fill at 255; remembered ones (ring/all) at 175.
   assert.equal(e.alpha[0],memory==='none'?255:175);
  }
 }
});

test('S7 in-place shrink/regrow through the memoized setFog model matches a fresh recompute',()=>{
 // Mirrors setFog's changed-tile memo (the closure itself needs Pixi and a DOM).
 const w=40,h=40,surface=new TerrainSurface(map(w,h,(x,y)=>({terrain:'open',height:x>=16&&x<24&&y>=12?1:0}))),fragments=bakerFragments(surface);
 const memo=fragments.map(triangles=>{
  const topology=fogTopology(triangles,w,h),{fogTiles}=topology,lastOpacity=new Uint8Array(fogTiles.length).fill(1),alphas=new Float32Array(triangles.length*3);let needed=true;
  const setFog=(visible:boolean[],explored:boolean[])=>{
   let changed=false;for(let k=0;k<fogTiles.length;k++){const o=opacity(fogTiles[k],visible,explored);if(o!==lastOpacity[k]){lastOpacity[k]=o;changed=true}}
   if(changed)needed=fogVertexAlphas(triangles,topology,lastOpacity,visible,explored,alphas);
  };
  setFog([],[]);return {triangles,setFog,alphas,needed:()=>needed};
 });
 const visible:boolean[]=Array(w*h).fill(false),explored:boolean[]=Array(w*h).fill(false),rand=lcg(5);
 const step=(label:string)=>{
  for(const f of memo){
   f.setFog(visible,explored);
   const out=new Float32Array(f.triangles.length*3),topology=fogTopology(f.triangles,w,h);
   const any=fogVertexAlphas(f.triangles,topology,Array.from(topology.fogTiles,t=>opacity(t,visible,explored)),visible,explored,out);
   assert.deepEqual(f.alphas,out,`${label}: memoized alphas stale`);assert.equal(f.needed(),any,`${label}: fogNeeded stale`);
  }
 };
 const setDisk=(r:number,cx=16,cy=16)=>{const d=disk(w,h,cx,cy,r);for(let i=0;i<w*h;i++){visible[i]=d[i];if(d[i])explored[i]=true}};
 for(const r of [2,5,9,14,9,4,2,-1,3,8,14]){setDisk(r);step(`disk ${r}`)}
 // Replay rewind: memory shrinks in place too, then regrows.
 explored.fill(false);setDisk(6);step('rewind');setDisk(12,20,15);step('regrow');
 // A neighbour alone flips a spur on and off across the chunk seam at x=16.
 visible.fill(false);visible[10*w+15]=true;step('lone');
 visible[10*w+16]=true;step('joined');visible[10*w+16]=false;step('split');
 for(let round=0;round<12;round++){for(let k=0;k<30;k++){const i=Math.floor(rand()*w*h);visible[i]=!visible[i];if(visible[i])explored[i]=true}step(`sparse ${round}`)}
});

test('S8 documented tradeoff: a one-tile-wide visible corridor is filled end to end at its darkest corner',()=>{
 const w=12,h=7,surface=new TerrainSurface(map(w,h)),visible=Array.from({length:w*h},(_,i)=>Math.floor(i/w)===3&&i%w>=2&&i%w<=9),explored=[...visible];
 const byId=evaluate(prepare(surface),visible,explored);checkAll(byId,w,h,visible,explored,'corridor');
 for(let x=2;x<=9;x++)for(let i=0;i<4;i++)assert.deepEqual(byId.get(`t${3*w+x}.${i}`)!.alpha,[255,255,255],`corridor tile ${x}`);
});
