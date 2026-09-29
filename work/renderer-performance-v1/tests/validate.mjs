import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build,transform} from '../../../client/node_modules/esbuild/lib/main.js';

const work=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(work,'../..'),out=path.join(work,'evidence');
await mkdir(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const pins=[];
async function inventory(dir,prefix=''){
 for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(entry.name==='node_modules')continue;
  const name=path.join(prefix,entry.name),file=path.join(dir,entry.name);
  if(entry.isDirectory()){await inventory(file,name);continue}
  const baseline=await readFile(file),candidate=await readFile(path.join(work,'candidate/client/src',name)),live=await readFile(path.join(root,'client/src',name));
  assert.deepEqual(live,baseline,`Live source drifted after snapshot: ${name}`);
  if(name!=='render/terrain.ts')assert.deepEqual(candidate,baseline,`Unexpected candidate delta: ${name}`);
  pins.push({path:`client/src/${name}`,bytes:baseline.length,sha256:sha(baseline),candidateSHA256:sha(candidate)});
 }
}
await inventory(path.join(work,'baseline/client/src'));
await writeFile(path.join(out,'source-lock.json'),JSON.stringify(pins,null,2)+'\n');
const loaded={};
for(const variant of ['baseline','candidate']){
 const target=path.join(out,`${variant}-terrain.mjs`);
 await build({entryPoints:[path.join(work,variant,'client/src/render/terrain.ts')],outfile:target,bundle:true,format:'esm',platform:'node',plugins:[{name:'installed-pixi',setup(b){b.onResolve({filter:/^pixi\.js$/},()=>({path:path.join(root,'client/node_modules/pixi.js/lib/index.mjs'),external:true}))}}]});
 loaded[variant]=await import(pathToFileURL(target).href);
}
const colorA=loaded.baseline.TerrainBaker.minimapColor,colorB=loaded.candidate.TerrainBaker.minimapColor;
const terrain=['open','road','rubble','cover','water','cliff','blocked','ramp','unrecognized',undefined];
let exactColorSamples=0;
for(const kind of terrain)for(const height of [undefined,0,1,2,3,4]){
 const map={width:1,height:1,tiles:[{terrain:kind,height}]};
 for(const [x,y] of [[0,0],[-1,0],[0,-1],[1,0],[0,1]]){
  const before=structuredClone(map),expected=colorA(map,x,y),actual=colorB(map,x,y);
  assert.deepEqual(actual,expected);assert.deepEqual(map,before);exactColorSamples++;
  actual[0]=-999;actual[1]=-998;actual[2]=-997;
  assert.deepEqual(colorB(map,x,y),expected,'Caller mutation must not mutate shared palette');
  assert.notEqual(colorB(map,x,y),colorB(map,x,y),'Return RGB tuple remains caller-owned');
 }
}
let exactRGBABytes=0;
const images=[];
for(const size of [96,256]){
 const map={width:size,height:size,tiles:Array.from({length:size*size},(_,i)=>({terrain:terrain[i%8],height:Math.floor(i/8)%5}))};
 const a=new Uint8ClampedArray(size*size*4),b=new Uint8ClampedArray(a.length);
 for(const color of [colorA,colorB]){
  const pixels=color===colorA?a:b;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const i=y*size+x,[r,g,blue]=color(map,x,y),k=i%3===0?1:i%3===1?.4:.04;
   pixels.set([r*k,g*k,blue*k,255],i*4);
  }
 }
 assert.deepEqual(a,b);exactRGBABytes+=a.length;
 images.push({size,bytes:a.length,sha256:sha(a),equal:true});
}
const terrainSource=await readFile(path.join(work,'baseline/client/src/render/terrain.ts'),'utf8');
const candidateSource=await readFile(path.join(work,'candidate/client/src/render/terrain.ts'),'utf8');
const originalMethod=terrainSource.slice(terrainSource.indexOf(' static minimapColor('));
const candidateMethod=candidateSource.slice(candidateSource.indexOf(' static minimapColor('));
assert.equal((originalMethod.match(/\bbase:/g)??[]).length,1);
assert(!candidateMethod.includes('const base:'));assert(candidateSource.includes('Readonly<Record<string,readonly [number,number,number]>>'));
// Execute the exact frozen admission/eviction method, replacing only raster
// allocation and Pixi attachment with counters. No browser, timing or GPU claim.
const sceneSource=await readFile(path.join(work,'baseline/client/src/render/battlefield.ts'),'utf8');
const start=sceneSource.indexOf(' private terrainFrame(){'),end=sceneSource.indexOf(' private readFeedback(',start);
assert(start>=0&&end>start);
const method=sceneSource.slice(start,end).replace(' private terrainFrame(){','function terrainFrame(){');
const js=(await transform(method,{loader:'ts',format:'esm'})).code;
const terrainFrame=new Function('CHUNK','clamp','toWorld',`${js};return terrainFrame;`)(16,(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),(x,y)=>({x:(x/32+y/16)/2*1000,y:(y/16-x/32)/2*1000}));
const chunkBytes=1028*556*4,rows=[];
function admission(size,width,height,zoom,cx,cy){
 let allocations=0,disposals=0,maxPerFrame=0;
 const camera={x:(cx-cy)*32,y:(cx+cy)*16,zoom};
 const r={app:{screen:{width,height}},camera,world:{x:width/2-camera.x*zoom,y:height/2-camera.y*zoom},options:{map:{width:size,height:size}},chunks:new Map(),terrainKey:'',frame:0,surface:{},ground:{addChild(){}},
  screenToIso(p){return {x:(p.x-this.world.x)/zoom,y:(p.y-this.world.y)/zoom}},
  baker:{chunksX:Math.ceil(size/16),chunksY:Math.ceil(size/16),bake(){allocations++;return {destroy(){disposals++}}},surfaceFragments(){return []}},
  disposeChunk(chunk){chunk.texture.destroy()}};
 for(let frame=0;frame<200;frame++){r.frame++;const before=allocations;terrainFrame.call(r);maxPerFrame=Math.max(maxPerFrame,allocations-before);if(r.terrainKey)break}
 assert(r.terrainKey);assert(maxPerFrame<=2);assert.equal(disposals,0);
 const count=r.chunks.size;
 for(const chunk of r.chunks.values())assert.equal(chunk.visible,true);
 return {count,frames:r.frame,maxPerFrame,nominalRGBABytes:count*chunkBytes};
}
for(const size of [96,256])for(const [width,height] of [[960,720],[1280,720],[1600,900],[1920,1080],[2560,1440],[3840,2160]])for(const zoom of [.45,1,1.8]){
 const centered=admission(size,width,height,zoom,size/2,size/2);
 let max=centered.count,at=[size/2,size/2];
 // Sweep one chunk period around the center. Exact admission is independent
// across map axes; this records a witnessed value, not an exhaustive maximum.
 for(let offset=0;offset<=16;offset+=.5){const result=admission(size,width,height,zoom,size/2+offset,size/2+offset);if(result.count>max){max=result.count;at=[size/2+offset,size/2+offset]}}
 rows.push({size,width,height,zoom,centered,witnessedMaximum:{chunks:max,cameraTiles:at,nominalRGBABytes:max*chunkBytes}});
}
const whole=rows.find(r=>r.size===256&&r.width===1920&&r.zoom===.45);assert.equal(whole.centered.count,256);
const layout=[];
for(const size of [96,256])for(const [windowWidth,height] of [[1280,720],[1600,900],[1920,1080],[2560,1440]])for(const uiScale of [1,1.5]){
 const sidebar=(windowWidth>=1500&&height>=840?300:248)*uiScale,width=windowWidth-sidebar;
 layout.push({size,windowWidth,height,uiScale,sidebar,canvasWidth:width,minZoom:admission(size,width,height,.45,size/2,size/2),normalZoom:admission(size,width,height,1,size/2,size/2)});
}
await build({entryPoints:[path.join(work,'baseline/client/src/render/terrain-surface.ts')],outfile:path.join(out,'baseline-surface.mjs'),bundle:true,format:'esm',platform:'node'});
const {TerrainSurface}=await import(pathToFileURL(path.join(out,'baseline-surface.mjs')).href);
const surface=new TerrainSurface({width:96,height:96,tiles:Array.from({length:96*96},()=>({terrain:'open',height:0}))});
const groups=new Map();let triangleCount=0;
for(const triangle of surface.triangles({left:16000,top:16000,right:32000,bottom:32000})){
 if(!triangle.frontFacing)continue;triangleCount++;
 const tier=triangle.kind==='face'&&Math.max(...triangle.vertices.map(v=>v.height))-Math.min(...triangle.vertices.map(v=>v.height))>1?'cliff_face_tier2':'cliff_face_tier1';
 const key=`${triangle.depth.toFixed(6)}:${triangle.kind}:${tier}`;
 if(!groups.has(key))groups.set(key,[]);groups.get(key).push(triangle);
}
const topologyBytes=[...groups.values()].reduce((sum,triangles)=>sum+Object.values(loaded.baseline.fogTopology(triangles,96,96)).reduce((n,typed)=>n+typed.byteLength,0),0);
const dependencyChecks=[...groups.values()].reduce((n,triangles)=>n+loaded.baseline.fogTopology(triangles,96,96).fogTiles.length,0);
assert.equal(triangleCount,1024);assert.equal(groups.size,62);
const flatChunk={triangles:triangleCount,fragments:groups.size,attachedGroundAndFogMeshes:groups.size*2,geometryTypedArrayBytes:triangleCount*3*20*2,fogTopologyTypedArrayBytes:topologyBytes,fogDependencyChecksPerSnapshot:dependencyChecks,note:'Exact flat interior chunk. No cliffs, actor/shadow nodes, JavaScript object memory or GPU driver overhead counted.'};
// Exact bounds method proves last painted position controls the early return.
// This reproduces a culling correctness concern without changing product code.
const bStart=sceneSource.indexOf(' bounds(entity:Entity):Rect|undefined{'),bEnd=sceneSource.indexOf(' private hit(',bStart);
assert(bStart>=0&&bEnd>bStart);
const boundsSource=sceneSource.slice(bStart,bEnd).replace(' bounds(entity:Entity):Rect|undefined{','function bounds(entity:Entity):Rect|undefined{');
const boundsJS=(await transform(boundsSource,{loader:'ts',format:'esm'})).code;
const bounds=new Function(`${boundsJS};return bounds;`)();
const entity={id:1,position:{x:0,y:0}},stale={left:-600,top:10,right:-550,bottom:50};
const actor={paintedBodyBounds:()=>({...stale})};
const scene={actors:new Map([[1,actor]]),camera:{zoom:1},world:{x:0,y:0}};
const firstBounds=bounds.call(scene,entity);
entity.position={x:32000,y:32000};
assert.deepEqual(bounds.call(scene,entity),firstBounds);
assert(firstBounds.right< -200);
const cullingConcern={status:'REPRODUCED_SOURCE_METHOD',lastPaintedBounds:firstBounds,changedAuthorizedPosition:entity.position,resultAfterMove:bounds.call(scene,entity),note:'Exact bounds early return plus frozen render gate. Not an actual rendered-match reproduction; no correction included.'};
const tsc=spawnSync(path.join(root,'client/node_modules/.bin/tsc'),['-p',path.join(work,'candidate/client/tsconfig.json'),'--noEmit'],{cwd:root,encoding:'utf8'});
await writeFile(path.join(out,'typecheck-app.log'),`${tsc.stdout??''}${tsc.stderr??''}`);assert.equal(tsc.status,0,tsc.stderr||tsc.stdout||'TypeScript failed');
const report={status:'PASS',scope:'Source-pinned Node exact-output and allocation/admission math; no browser, GPU, heap, FPS or benchmark measurement.',sourceFiles:pins.length,sourceLockSHA256:sha(await readFile(path.join(out,'source-lock.json'))),candidateDelta:['client/src/render/terrain.ts'],exactColorSamples,callerMutationSamples:exactColorSamples,exactRGBABytes,images,typecheck:{exitCode:tsc.status},chunk:{width:1028,height:556,bytes:chunkBytes,bakerResolution:1,sourceAdmissionMethodSHA256:sha(method)},flatChunk,rows,layout,cullingConcern,allocationOpportunity:[96,256].map(size=>({size,callsPerRepaint:size*size,removedObjectAndArrayLiteralEvaluationsPerRepaint:9*size*size,maximumRepaintsPerSecond:12.5,remainingReturnedTuplePerCall:1,note:'Source-level literal evaluations; JIT escape analysis/actual heap bytes are unmeasured.'})),limits:['The full162-role final package is unfinished.','Canvas/GPU format overhead, CPU backing copies and allocator retention are unmeasured.','No visual/raster regression course or real-browser resource run was launched.','The36-chunk limit is a soft inactive-chunk LRU cap; all conservatively admitted chunks are marked visible even if every fragment is culled.','Quality/DPR/UI scale are not inputs to the frozen admission method; use the actual CSS canvas size after layout.']};
await writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,sourceFiles:pins.length,exactColorSamples,exactRGBABytes,wholeMapWitness:whole,candidateDelta:report.candidateDelta},null,2));
