import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build,transform} from '../../../client/node_modules/esbuild/lib/main.js';
const priority=process.argv.includes('--priority'),course=priority?'terrain-priority':'terrain-admission';
const work=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(work,'../..'),base=path.join(work,'baseline/client/src/render'),candidate=path.join(work,priority?'terrain-priority-candidate/client/src/render':'terrain-admission-candidate/client/src/render');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),bytesPerChunk=1028*556*4;
const source={},method={},bakers={};
for(const variant of ['baseline','candidate']){
 const dir=variant==='baseline'?base:candidate;
 source[variant]={scene:await readFile(path.join(dir,'battlefield.ts'),'utf8'),terrain:await readFile(path.join(dir,'terrain.ts'),'utf8')};
 const s=source[variant].scene,start=s.indexOf(' private terrainFrame(){'),end=s.indexOf(' private readFeedback(',start);assert(start>=0&&end>start);
 const body=s.slice(start,end).replace(' private terrainFrame(){','function terrainFrame(){'),js=(await transform(body,{loader:'ts',format:'esm'})).code;
 method[variant]=new Function('CHUNK','clamp','toWorld',`${js};return terrainFrame;`)(16,(v,a,b)=>Math.max(a,Math.min(b,v)),(x,y)=>({x:(x/32+y/16)/2*1000,y:(y/16-x/32)/2*1000}));
 const target=path.join(work,'evidence',`${variant}-${priority?'priority':'admission'}-terrain.mjs`);
 await build({entryPoints:[path.join(base,'terrain.ts')],outfile:target,bundle:true,format:'esm',platform:'node',plugins:[{name:'frozen-terrain',setup(b){b.onResolve({filter:/^pixi\.js$/},()=>({path:path.join(root,'client/node_modules/pixi.js/lib/index.mjs'),external:true}));b.onLoad({filter:/render\/terrain\.ts$/},()=>({contents:source[variant].terrain,loader:'ts'}))}}]});
 bakers[variant]=(await import(pathToFileURL(target).href)).TerrainBaker;
}
assert.equal(source.baseline.scene,await readFile(path.join(root,'client/src/render/battlefield.ts'),'utf8'));
assert.equal(source.baseline.terrain,await readFile(path.join(root,'client/src/render/terrain.ts'),'utf8'));
// Every original terrain method is byte-exact; the only terrain delta is a new
// geometric envelope helper. The scene delta is inside terrainFrame alone.
const addition=source.candidate.terrain.slice(source.candidate.terrain.indexOf(' /** Projected envelope'),source.candidate.terrain.indexOf(' /** Returns a texture'));
assert.equal(source.candidate.terrain.replace(addition,''),source.baseline.terrain);
const sStart=source.baseline.scene.indexOf(' private terrainFrame(){'),sEnd=source.baseline.scene.indexOf(' private readFeedback(',sStart),cStart=source.candidate.scene.indexOf(' private terrainFrame(){'),cEnd=source.candidate.scene.indexOf(' private readFeedback(',cStart);
assert.equal(source.candidate.scene.slice(0,cStart)+source.candidate.scene.slice(cEnd),source.baseline.scene.slice(0,sStart)+source.baseline.scene.slice(sEnd));
await build({entryPoints:[path.join(base,'terrain-surface.ts')],outfile:path.join(work,'evidence/admission-surface.mjs'),bundle:true,format:'esm',platform:'node'});
const {TerrainSurface,projectSurfaceVertex}=await import(pathToFileURL(path.join(work,'evidence/admission-surface.mjs')).href);
const overlaps=(a,b)=>a.right>=b.left&&a.left<=b.right&&a.bottom>=b.top&&a.top<=b.bottom;
function mapOf(width,height,kind){return {width,height,tiles:Array.from({length:width*height},(_,i)=>{const x=i%width,y=Math.floor(i/width);if(kind==='flat4')return {terrain:'open',height:4};if(kind==='smooth')return {terrain:'ramp',height:(x+2*y)%5};if(kind==='cliff')return {terrain:'cliff',height:(x+y)%2?4:0};if(kind==='edge')return {terrain:x===0||y===0||x===width-1||y===height-1?'blocked':'open',height:x===0||y===0||x===width-1||y===height-1?4:0};return {terrain:'open',height:0}})}}
let verifiedVertices=0,verifiedTriangles=0,verifiedChunks=0;
const envelopeCases=[];
for(const [width,height] of [[1,1],[15,17],[16,16],[17,31],[31,32],[63,65],[96,96],[256,256]])for(const kind of ['flat0','flat4','smooth','cliff','edge']){
 const map=mapOf(width,height,kind),surface=new TerrainSurface(map),baker=new bakers.candidate(map,{});let chunks=0,vertices=0,triangles=0;
 for(let cy=0;cy<baker.chunksY;cy++)for(let cx=0;cx<baker.chunksX;cx++){
  const envelope=baker.chunkBounds(cx,cy,surface.maxHeight),rect={left:cx*16000,top:cy*16000,right:Math.min((cx+1)*16,width)*1000,bottom:Math.min((cy+1)*16,height)*1000};chunks++;
  for(const triangle of surface.triangles(rect)){
   if(!triangle.frontFacing)continue;triangles++;
   for(const vertex of triangle.vertices){const p=projectSurfaceVertex(vertex);assert(p.x>=envelope.left-1e-7&&p.x<=envelope.right+1e-7&&p.y>=envelope.top-1e-7&&p.y<=envelope.bottom+1e-7,JSON.stringify({width,height,kind,cx,cy,vertex,p,envelope}));vertices++}
  }
 }
 verifiedChunks+=chunks;verifiedTriangles+=triangles;verifiedVertices+=vertices;envelopeCases.push({width,height,kind,chunks,triangles,vertices});
}
// Flat actual fragment bounds define required visible chunks. No visible AABB
// group from the original terrain geometry may be missing from the candidate.
function blueprints(map,surface){
 const all=new Map();
 for(let cy=0;cy<Math.ceil(map.height/16);cy++)for(let cx=0;cx<Math.ceil(map.width/16);cx++){
  const groups=new Map(),rect={left:cx*16000,top:cy*16000,right:Math.min((cx+1)*16,map.width)*1000,bottom:Math.min((cy+1)*16,map.height)*1000};
  for(const t of surface.triangles(rect)){
   if(!t.frontFacing)continue;
   const tier=t.kind==='face'&&Math.max(...t.vertices.map(v=>v.height))-Math.min(...t.vertices.map(v=>v.height))>1?'cliff_face_tier2':'cliff_face_tier1',key=`${t.depth.toFixed(6)}:${t.kind}:${tier}`;
   let b=groups.get(key);if(!b){b={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};groups.set(key,b)}
   for(const v of t.vertices){const p=projectSurfaceVertex(v);b.left=Math.min(b.left,p.x);b.right=Math.max(b.right,p.x);b.top=Math.min(b.top,p.y);b.bottom=Math.max(b.bottom,p.y)}
  }
  all.set(`${cx}:${cy}`,[...groups.values()]);
 }
 return all;
}
function createScene(map,surface,variant,width,height,zoom,blueprint){
 const realBaker=new bakers.candidate(map,{});let allocations=0,disposals=0;
 const scene={app:{screen:{width,height}},world:{x:0,y:0},camera:{zoom},options:{map},surface,chunks:new Map(),terrainKey:'',frame:0,ground:{addChild(){}},
  screenToIso(p){return {x:(p.x-this.world.x)/zoom,y:(p.y-this.world.y)/zoom}},
  baker:{chunksX:realBaker.chunksX,chunksY:realBaker.chunksY,chunkBounds:realBaker.chunkBounds.bind(realBaker),bake(){allocations++;return {destroy(){disposals++}}},surfaceFragments(cx,cy){return blueprint.get(`${cx}:${cy}`).map(bounds=>({bounds,mesh:{},fog:{},setFog(){},setVisible(shown){this.shown=shown}}))}},
  disposeChunk(chunk){chunk.texture.destroy()}};
 function move(cx,cy,shakeX=0,shakeY=0){
  scene.world.x=width/2-(cx-cy)*32*zoom+shakeX;scene.world.y=height/2-(cx+cy)*16*zoom+shakeY;
  const view={left:(-scene.world.x-2)/zoom,top:(-scene.world.y-2)/zoom,right:(width-scene.world.x+2)/zoom,bottom:(height-scene.world.y+2)/zoom};
  const required=[...blueprint].filter(([,bounds])=>bounds.some(b=>overlaps(b,view))).map(([key])=>key);
  let firstVisibleFrame,fullVisibleFrame,maxBakes=0;const before=allocations,disposedBefore=disposals;
  for(let frame=1;frame<=200;frame++){
   scene.frame++;const b=allocations;method[variant].call(scene);maxBakes=Math.max(maxBakes,allocations-b);
   const count=required.filter(key=>scene.chunks.has(key)).length;
   if(count>0&&firstVisibleFrame===undefined)firstVisibleFrame=frame;
   if(count===required.length&&fullVisibleFrame===undefined)fullVisibleFrame=frame;
   if(scene.terrainKey)break;
  }
  assert(scene.terrainKey);assert(maxBakes<=2);assert(fullVisibleFrame!==undefined,`Missing visible chunk: ${variant}`);
  for(const key of required){const chunk=scene.chunks.get(key);assert(chunk.visible);for(const fragment of chunk.fragments)assert.equal(fragment.shown,overlaps(fragment.bounds,view))}
  return {cameraTiles:[cx,cy],shake:[shakeX,shakeY],requiredVisibleChunks:required.length,firstVisibleFrame,fullVisibleFrame,allocated:allocations-before,disposed:disposals-disposedBefore,activeChunks:[...scene.chunks.values()].filter(c=>c.visible).length,residentChunks:scene.chunks.size,nominalRGBABytes:scene.chunks.size*bytesPerChunk,maxBakes};
 }
 return {move};
}
const rows=[],panCourses=[];
for(const size of [96,256]){
 const map=mapOf(size,size,'flat0'),surface=new TerrainSurface(map),blueprint=blueprints(map,surface);
 for(const [windowWidth,height] of [[1280,720],[1600,900],[1920,1080],[2560,1440]])for(const uiScale of [1,1.5])for(const zoom of [.45,1,1.8]){
  const width=windowWidth-(windowWidth>=1500&&height>=840?300:248)*uiScale,variants={};
  for(const variant of ['baseline','candidate'])variants[variant]=createScene(map,surface,variant,width,height,zoom,blueprint).move(size/2,size/2);
  rows.push({size,windowWidth,height,uiScale,canvasWidth:width,zoom,...variants});
 }
 for(const variant of ['baseline','candidate']){
  const scene=createScene(map,surface,variant,1620,1080,.45,blueprint),positions=[[size/2,size/2],[8,8],[size-8,8],[size-8,size-8],[8,size-8],[size/2,size/2]];
  panCourses.push({size,variant,positions:positions.map(([x,y],i)=>scene.move(x,y,i%2?3:-3,i%2?-3:3))});
 }
}
const report={status:'PASS',scope:'Frozen exact admission method with real public TerrainSurface geometry and counted bake/disposal stubs. First-visible latency is render-call count under the unchanged two-bake cap, never milliseconds/FPS. No browser/raster/GPU acceptance.',priority,delta:['client/src/render/battlefield.ts','client/src/render/terrain.ts'],sourceSHA256:Object.fromEntries(Object.entries(source).map(([variant,files])=>[variant,Object.fromEntries(Object.entries(files).map(([key,text])=>[key,sha(text)]))])),verifiedChunks,verifiedTriangles,verifiedVertices,envelopeCases,rows,panCourses,limits:['Original600/440CSS prefetch margins remain; minimumzoom residency can still exceed36chunks.',priority?'Viewport-first admission changes chunk creation order. Equal-zIndex painter ties and native shared-edge raster equivalence require browser validation.':'Y/x scan order is unchanged and can delay center coverage behind offscreen prefetch.','Actual browser raster seams/fog and pan/loading behavior are still unrun.','Fog, bake, surface geometry, picking and all other original terrain code are byte-exact.']};
await writeFile(path.join(work,`evidence/${course}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,verifiedChunks,verifiedTriangles,verifiedVertices,samples:rows.filter(r=>r.size===256&&r.zoom===.45&&r.uiScale===1)},null,2));
