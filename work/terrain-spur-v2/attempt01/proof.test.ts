import test from 'node:test';
import assert from 'node:assert/strict';
import {Texture} from 'pixi.js';
import {TerrainSurface,surfaceFogOpacity,compareSurfaceTriangles,type SurfaceTriangle} from './inputs/terrain-surface';
import {TerrainBaker,fogTopology,fogVertexAlphas,type TerrainFragment} from './inputs/candidate-terrain';
import {fogTopology as oldTopology,fogVertexAlphas as oldAlphas} from './inputs/current-terrain';
const map=(width:number,height:number,raised=false)=>({width,height,tiles:Array.from({length:width*height},(_,i)=>({terrain:raised&&(i%width===16||Math.floor(i/width)===3)?'cliff':'open',height:raised?(i%width+Math.floor(i/width))%5:0}))});
const opacity=(t:number,v:readonly boolean[],e:readonly boolean[])=>v[t]?0:e[t]?175:255;
const directions=[[0,-1],[1,0],[0,1],[-1,0]],corners=[[0,0],[1,0],[1,1],[0,1]];
function cornerOpacity(x:number,y:number,w:number,h:number,v:boolean[],e:boolean[]){let alpha=0;for(let dy=-1;dy<=0;dy++)for(let dx=-1;dx<=0;dx++){const tx=x+dx,ty=y+dy;if(tx>=0&&tx<w&&ty>=0&&ty<h)alpha=Math.max(alpha,opacity(ty*w+tx,v,e))}return alpha}
function oracle(tile:number,w:number,h:number,v:boolean[],e:boolean[]){
 const x=tile%w,y=Math.floor(tile/w),a=corners.map(([dx,dy])=>cornerOpacity(x+dx,y+dy,w,h,v,e)),neighbors=directions.map(([dx,dy],direction)=>({x:x+dx,y:y+dy,direction})).filter(p=>p.x>=0&&p.x<w&&p.y>=0&&p.y<h&&v[p.y*w+p.x]),max=Math.max(...a);
 if(!v[tile]||Math.min(...a)===0||neighbors.length!==1)return {fill:0,a};
 const n=neighbors[0],other=corners.map(([dx,dy])=>cornerOpacity(n.x+dx,n.y+dy,w,h,v,e));
 return {fill:other.includes(0)&&a[n.direction]===max&&a[(n.direction+1)%4]===max?max:0,a};
}
function fragments(surface:TerrainSurface){const groups:SurfaceTriangle[][]=[];for(let cy=0;cy*16<surface.height;cy++)for(let cx=0;cx*16<surface.width;cx++){const by=new Map<string,SurfaceTriangle[]>();for(const t of surface.triangles({left:cx*16000,top:cy*16000,right:Math.min(cx*16+16,surface.width)*1000,bottom:Math.min(cy*16+16,surface.height)*1000})){if(!t.frontFacing)continue;const tier=t.kind==='face'&&Math.max(...t.vertices.map(v=>v.height))-Math.min(...t.vertices.map(v=>v.height))>1?2:1,key=`${t.depth.toFixed(6)}:${t.kind}:${tier}`;if(!by.has(key))by.set(key,[]);by.get(key)!.push(t)}for(const g of [...by.values()].sort((a,b)=>compareSurfaceTriangles(a[0],b[0])))groups.push(g.sort(compareSurfaceTriangles))}return groups}
function prepare(w:number,h:number,raised=false){return fragments(new TerrainSurface(map(w,h,raised))).map(triangles=>({triangles,next:fogTopology(triangles,w,h),old:oldTopology(triangles,w,h)}))}
function evaluate(prepared:ReturnType<typeof prepare>,w:number,h:number,v:boolean[],e:boolean[]){const entries=new Map<string,{triangle:SurfaceTriangle;actual:number[];old:number[];fill:number}>();for(const p of prepared){const actual=new Float32Array(p.triangles.length*3),old=new Float32Array(actual.length);fogVertexAlphas(p.triangles,p.next,Array.from(p.next.fogTiles,t=>opacity(t,v,e)),v,e,actual);oldAlphas(p.triangles,p.old,Array.from(p.old.fogTiles,t=>opacity(t,v,e)),v,e,old);p.triangles.forEach((triangle,i)=>{const a=[...actual.slice(i*3,i*3+3)],b=[...old.slice(i*3,i*3+3)],fill=triangle.kind==='top'&&surfaceFogOpacity(triangle,v,e)===0?oracle(triangle.tile,w,h,v,e).fill:0;assert.deepEqual(a,fill?[fill,fill,fill]:b,`Exact independent predicate ${triangle.id}`);a.forEach((n,j)=>assert(n>=b[j],`CPU vertex decrease ${triangle.id}`));entries.set(triangle.id,{triangle,actual:a,old:b,fill})})}return entries}
const disk=(w:number,h:number,cx:number,cy:number,r:number)=>Array.from({length:w*h},(_,i)=>(i%w-cx)**2+(Math.floor(i/w)-cy)**2<=r*r);
const random=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};

test('all19683 public3x3 masks, flat/raised: independent predicate, protected faces/classes exact, CPU vertices never decrease',()=>{
 for(const raised of [false,true]){const p=prepare(3,3,raised);let fills=0,faces=0;for(let mask=0;mask<19683;mask++){const state=[];for(let n=mask,k=0;k<9;k++,n=Math.floor(n/3))state.push(n%3);const v=state.map(x=>x===2),e=state.map(x=>x>0);for(const x of evaluate(p,3,3,v,e).values()){if(x.fill)fills++;if(x.triangle.kind==='face')faces++}}assert(fills>0);if(raised)assert(faces>0)}
});

test('disks2..14 fill only leaf poles attached to a clear-corner neighbour; all other fans remain exact',()=>{
 const w=40,h=40,c=20,p=prepare(w,h);for(let r=2;r<=14;r++)for(const memory of [false,true]){const v=disk(w,h,c,c,r),e=v.map(x=>x||memory),entries=evaluate(p,w,h,v,e);let changed=0;for(const x of entries.values())if(x.fill)changed++;assert.equal(changed,16,`Exactly four complete pole fans for radius${r}`);for(const [x,y] of [[c,c-r],[c+r,c],[c,c+r],[c-r,c]])for(let t=0;t<4;t++)assert.deepEqual(entries.get(`t${y*w+x}.${t}`)!.actual,Array(3).fill(memory?175:255))}
});

test('narrow cardinal chains, bars, L bends, solitary and diagonal sightings remain unchanged',()=>{
 const w=12,h=12,p=prepare(w,h);const shapes=[[[5,5]],[[5,5],[6,6]],Array.from({length:8},(_,i)=>[i+2,5]),Array.from({length:8},(_,i)=>[5,i+2]),[[3,3],[4,3],[5,3],[5,4],[5,5]],Array.from({length:144},(_,i)=>[i%w,Math.floor(i/w)]).filter(([x,y])=>(x+y)%2===0)];
 for(const shape of shapes)for(const memory of [false,true]){const v=Array(w*h).fill(false);for(const [x,y] of shape)v[y*w+x]=true;for(const row of evaluate(p,w,h,v,v.map(x=>x||memory)).values())assert.deepEqual(row.actual,row.old)}
 // A T-junction has more than one visible cardinal neighbour and cannot fill.
 const v=Array(w*h).fill(false);for(const [x,y] of [[5,5],[4,5],[6,5],[5,4]])v[y*w+x]=true;const rows=evaluate(p,w,h,v,[...v]);for(let k=0;k<4;k++)assert.deepEqual(rows.get(`t65.${k}`)!.actual,rows.get(`t65.${k}`)!.old);
});

test('mixed175/255 shared-edge corners reject the fill; matching MAX corners retain their shared edge exactly',()=>{
 const w=7,h=7,tile=4*w+3,p=prepare(w,h),v=Array(w*h).fill(false);for(const [x,y] of [[3,4],[3,3],[2,3],[3,2],[2,2]])v[y*w+x]=true;
 for(const mixed of [0,1,2]){const e=[...v];if(mixed<2){e[4*w+2]=true;if(mixed===0){e[3*w+4]=true;e[4*w+4]=true}}const state=oracle(tile,w,h,v,e),rows=evaluate(p,w,h,v,e);assert.equal(state.fill,mixed===2?255:0);if(mixed===0)assert.deepEqual(state.a,[175,175,255,255]);if(mixed===1)assert.deepEqual(state.a,[175,255,255,255]);for(let k=0;k<4;k++){const row=rows.get(`t${tile}.${k}`)!;assert.deepEqual(row.actual,mixed===2?[255,255,255]:row.old)}if(mixed===2){assert.deepEqual(rows.get(`t${tile}.0`)!.actual.slice(1),rows.get(`t${tile}.0`)!.old.slice(1),'Shared north edge unchanged')}}
});

test('required distance-two/diagonal dependencies extend old topology and determine a real memo output change',()=>{
 const w=7,h=7,tile=4*w+3,far=2*w+2,p=prepare(w,h),v=Array(w*h).fill(false);for(const [x,y] of [[3,4],[3,3],[2,3],[3,2],[2,2]])v[y*w+x]=true;const e=[...v],before=evaluate(p,w,h,v,e);v[far]=false;e[far]=false;const after=evaluate(p,w,h,v,e);let witnesses=0;
 for(const f of p){if(!f.triangles.some(t=>t.tile===tile)||f.old.fogTiles.includes(far))continue;assert(f.next.fogTiles.includes(far));assert(f.triangles.some(t=>JSON.stringify(before.get(t.id)!.actual)!==JSON.stringify(after.get(t.id)!.actual)));witnesses++}assert(witnesses>0,'Without expanded dependencies old memo would retain filled fan after far-corner visibility loss');assert.equal(before.get(`t${tile}.0`)!.fill,255);assert.equal(after.get(`t${tile}.0`)!.fill,0);
});

test('topology includes every read and excludes outside influence at map boundaries/chunk seams',()=>{
 const rng=random(92);for(const [w,h] of [[1,1],[1,5],[5,1],[7,7],[17,33],[37,21]])for(const p of prepare(w,h,true)){const deps=new Set(p.next.fogTiles);assert([...deps].every(t=>t>=0&&t<w*h));for(let round=0;round<3;round++){const v=Array.from({length:w*h},()=>rng()<.6),e=v.map(x=>x||rng()<.5),out=new Float32Array(p.triangles.length*3),again=new Float32Array(out.length),reads=new Set<number>();const track=(a:boolean[])=>new Proxy(a,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads.add(Number(key));return Reflect.get(target,key,receiver)}});fogVertexAlphas(p.triangles,p.next,Array.from(p.next.fogTiles,t=>opacity(t,v,e)),track(v),track(e),out);for(const tile of reads)assert(deps.has(tile));const v2=v.map((x,i)=>deps.has(i)?x:rng()<.5),e2=e.map((x,i)=>deps.has(i)?x:rng()<.5);fogVertexAlphas(p.triangles,p.next,Array.from(p.next.fogTiles,t=>opacity(t,v2,e2)),v2,e2,again);assert.deepEqual(again,out)}}
});

test('actual TerrainBaker setFog closure with real Pixi meshes updates in place through far dependency, shrink/regrow, and hidden states',()=>{
 const w=20,h=20,m=map(w,h,true),surface=new TerrainSurface(m),baker=new TerrainBaker(m as never,{} as never),privateBaker=baker as any;privateBaker.fogRamp=Texture.WHITE;privateBaker.faceTextures.set('cliff_face_tier1',Texture.WHITE);privateBaker.faceTextures.set('cliff_face_tier2',Texture.WHITE);
 const fs:TerrainFragment[]=[];for(let cy=0;cy<2;cy++)for(let cx=0;cx<2;cx++)fs.push(...baker.surfaceFragments(cx,cy,Texture.WHITE,surface));const v=Array(w*h).fill(false),e=Array(w*h).fill(false);let passes=0;
 try{const step=()=>{for(const f of fs){f.setFog(v,e);const topology=fogTopology(f.triangles,w,h),out=new Float32Array(f.triangles.length*3),any=fogVertexAlphas(f.triangles,topology,Array.from(topology.fogTiles,t=>opacity(t,v,e)),v,e,out),uv=[];for(const a of out)uv.push(a===0?0:Math.fround((a+.75)/256),.5);assert.deepEqual([...f.fog.geometry.uvs],uv);assert.equal(f.fog.visible,any)}passes++};
  for(const radius of [2,5,8,3,1,6]){const d=disk(w,h,10,10,radius);for(let i=0;i<v.length;i++){v[i]=d[i];e[i]||=v[i]}step()}e.fill(false);v.fill(false);step();
  for(const [x,y] of [[16,15],[16,14],[15,14],[16,13],[15,13]])v[y*w+x]=e[y*w+x]=true;step();v[13*w+15]=e[13*w+15]=false;step();v[13*w+15]=e[13*w+15]=true;step();
  for(const f of fs){f.setVisible(false);f.setFog(v,e);assert(!f.fog.visible&&!f.mesh.visible);f.setVisible(true)}step();assert.equal(passes,11);
 }finally{for(const f of fs)f.dispose();privateBaker.fogRamp=undefined;privateBaker.faceTextures.clear();baker.disposeSurfaceResources()}
 assert(fs.every(f=>f.mesh.destroyed&&f.fog.destroyed));
});

test('raised random masks preserve nonleaf/face/unknown/remembered data against frozen de219',()=>{
 const w=37,h=21,p=prepare(w,h,true),rng=random(323);let faces=0,fills=0;for(let round=0;round<12;round++){const v=Array.from({length:w*h},()=>rng()<[.2,.5,.75,.9][round%4]),e=v.map(x=>x||rng()<.5);for(const row of evaluate(p,w,h,v,e).values()){if(row.fill)fills++;if(row.triangle.kind==='face')faces++}}assert(faces>0&&fills>0);
});
