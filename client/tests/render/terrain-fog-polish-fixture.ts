/** Source-isolated presentation fixture. No Go simulation or invented gameplay. */
import {Application,Container,Rectangle,Texture} from 'pixi.js';
import {TerrainBaker as Baseline,type TerrainFragment} from '../../../work/terrain-polish-review/inputs/baseline-terrain';
import {TerrainBaker as Candidate} from '../../../work/terrain-polish-review/inputs/candidate-terrain';
import {TerrainSurface} from '../../../work/terrain-polish-review/inputs/terrain-surface';
import type {GameMap} from '../../src/runtime';

const canvas=document.querySelector('canvas')!;
const app=new Application();await app.init({canvas,width:1600,height:900,resolution:1,backgroundAlpha:0,antialias:true,preference:'webgl'});app.stop();
const world=new Container();world.sortableChildren=true;app.stage.addChild(world);
const W=1600,H=900,images=new Map<string,Promise<HTMLImageElement>>();
const art={terrain(name:string){let pending=images.get(name);if(!pending){pending=new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error(`Required authored terrain image failed: ${name}`));image.src=`/art/terrain/${name}.png`});images.set(name,pending)}return pending}};
const disposals:unknown[]=[];
type Scene={baker:Baseline|Candidate;fragments:TerrainFragment[];textures:Texture[];surface:TerrainSurface;map:GameMap};
let scenes:Scene[]=[];
function makeMap(size=35,raised=false):GameMap{
 const map={id:'fog-presentation-probe',title:'Public geometry fixture',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:size,height:size,tiles:Array.from({length:size*size},()=>({terrain:'open',height:0})),spawns:[],fields:[],shipment:{x:0,y:0}} as GameMap;
 if(raised)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  // Mixed smooth slopes and cliff seams straddle x/y16 chunk boundaries.
  const t=map.tiles[y*size+x];t.height=x>=15&&x<=22&&y>=9&&y<=24?3:0;
  if(x===16||y===16){t.terrain='cliff';t.height=(x+y)%5}
  if(x===0||y===size-1){t.terrain='blocked';t.height=4}
 }
 return map;
}
async function make(kind:'baseline'|'candidate',map:GameMap,chunks:Array<[number,number]>,painted=false):Promise<Scene>{
 const baker=new (kind==='baseline'?Baseline:Candidate)(map,art as never),surface=new TerrainSurface(map),scene:Scene={baker,surface,map,fragments:[],textures:[]};scenes.push(scene);
 if(painted){await baker.load();await Promise.all(images.values())} // Do not count the product's optional material fallback as authored-art acceptance.
 for(const [x,y] of chunks){const texture=painted?baker.bake(x,y,true):Texture.WHITE;if(painted)scene.textures.push(texture);scene.fragments.push(...baker.surfaceFragments(x,y,texture,surface))}
 return scene;
}
function disposeScenes(){
 world.removeChildren();
 for(const scene of scenes){const fragments=scene.fragments.length,owned=[...new Set(scene.fragments.flatMap(f=>[f.fog.texture,f.mesh.texture]).filter(t=>t!==Texture.WHITE))];for(const f of scene.fragments)f.dispose();for(const t of scene.textures)t.destroy(true);scene.baker.disposeSurfaceResources();disposals.push({fragments,allMeshesDestroyed:scene.fragments.every(f=>f.mesh.destroyed&&f.fog.destroyed),allOwnedTexturesDestroyed:[...owned,...scene.textures].every(t=>t.destroyed)});scene.fragments=[];scene.textures=[]}
 scenes=[];
}
function setFog(scene:Scene,visible:boolean[],explored:boolean[]){for(const f of scene.fragments)f.setFog(visible,explored)}
function present(scene:Scene,zoom:number,offset:number,painted=false){
 world.removeChildren();for(const f of scene.fragments){f.setVisible(true);if(painted)world.addChild(f.mesh);world.addChild(f.fog)}
 const p=scene.surface.projectGround({x:16000,y:16000});world.scale.set(zoom);world.position.set(W/2-p.x*zoom+offset,H/2-p.y*zoom+offset*.37);app.render();
 return app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(0,0,W,H)}).pixels;
}
function alphaCompare(a:Uint8Array|Uint8ClampedArray,b:Uint8Array|Uint8ClampedArray){
 let lighter=0,unknownLost=0,baselineOpaque=0,maxDrop=0,clear=0;const samples:unknown[]=[];
 for(let i=3;i<a.length;i+=4){if(a[i]===255){baselineOpaque++;if(b[i]!==255)unknownLost++}if(a[i]===0&&b[i]===0)clear++;if(b[i]<a[i]){lighter++;maxDrop=Math.max(maxDrop,a[i]-b[i]);if(samples.length<8)samples.push({x:((i-3)/4)%W,y:Math.floor((i-3)/4/W),before:a[i],after:b[i]})}}
 return {lighter,unknownLost,baselineOpaque,maxDrop,clear,samples};
}
function signature(scene:Scene){return JSON.stringify(scene.fragments.map(f=>({depth:f.depth,bounds:f.bounds,triangles:f.triangles,positions:Array.from(f.mesh.geometry.positions),fogPositions:Array.from(f.fog.geometry.positions),indices:Array.from(f.mesh.geometry.indices)})))}
function bitvectors(map:GameMap,mode:string,visible:boolean[],explored:boolean[]){
 for(let i=0;i<map.tiles.length;i++){const x=i%map.width,y=Math.floor(i/map.width);visible[i]=mode==='clear'||mode==='edge'&&x<16||mode==='corner'&&x<16&&y<16;explored[i]=visible[i]||mode==='explored'||mode==='edge'&&x<19||mode==='corner'&&(x<16||y<16)}
 if(mode==='missing'){visible.length=0;explored.length=0}
}
async function compareCourse(raised:boolean){
 disposeScenes();const map=makeMap(35,raised),chunks:Array<[number,number]>=[];for(let y=0;y<3;y++)for(let x=0;x<3;x++)chunks.push([x,y]);
 const a=await make('baseline',map,chunks),b=await make('candidate',map,chunks),visible:boolean[]=[],explored:boolean[]=[],cases:unknown[]=[],geometryEqual=signature(a)===signature(b);
 const picking=[];for(const p of [{x:15500,y:15500},{x:16500,y:16500},{x:0,y:17000},{x:17000,y:35000}]){const screen=a.surface.projectGround(p);picking.push(JSON.stringify(a.surface.pickSurface(screen))===JSON.stringify(b.surface.pickSurface(screen)))}
 // Reuse and mutate the SAME bitvector objects, including empty→filled recovery.
 for(const mode of ['unknown','clear','explored','edge','corner','missing','clear','edge']){
  bitvectors(map,mode,visible,explored);setFog(a,visible,explored);setFog(b,visible,explored);
  for(const zoom of [.45,1,1.8])for(const offset of [0,.375]){
   const before=present(a,zoom,offset),after=present(b,zoom,offset),delta=alphaCompare(before,after);
   let clearNonzero=0;if(mode==='clear')for(let i=3;i<after.length;i+=4)if(after[i]!==0)clearNonzero++;
   // A fully-visible interior patch away from every fog boundary. Test actual
   // geometry pixels, not the transparent area outside the map.
   let interiorClear:unknown; if(['clear','edge','corner'].includes(mode)){const p=b.surface.projectGround({x:4500,y:4500}),x=Math.round(p.x*zoom+world.x),y=Math.round(p.y*zoom+world.y);if(x>=1&&y>=1&&x<W-1&&y<H-1){const alphas=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const index=((y+dy)*W+x+dx)*4+3;alphas.push([before[index],after[index]])}interiorClear={x,y,alphas,passed:alphas.every(pair=>pair[0]===0&&pair[1]===0)}}}
   cases.push({mode,zoom,offset,...delta,clearNonzero,interiorClear,allFogHidden:mode==='clear'?b.fragments.every(f=>!f.fog.visible):undefined});
  }
 }
 // Cached fragment visibility must retain current fog and recover on show.
 bitvectors(map,'unknown',visible,explored);for(const f of b.fragments)f.setVisible(false);setFog(b,visible,explored);const hidden=b.fragments.every(f=>!f.fog.visible&&!f.mesh.visible);for(const f of b.fragments)f.setVisible(true);const restored=b.fragments.every(f=>f.fog.visible&&f.mesh.visible);
 present(b,1,0);return {raised,chunks:chunks.length,fragments:a.fragments.length,triangles:a.fragments.reduce((n,f)=>n+f.triangles.length,0),geometryEqual,picking,cases,hidden,restored};
}
async function macro(kind:'baseline'|'candidate',fog=false){
 disposeScenes();const map=makeMap(35,true),scene=await make(kind,map,[[0,0],[1,0],[0,1],[1,1]],true),visible:boolean[]=[],explored:boolean[]=[];bitvectors(map,fog?'edge':'clear',visible,explored);setFog(scene,visible,explored);present(scene,1,0,true);return {kind,fog,images:images.size,scope:'Authored textures; subjective visual comparison only, no luminance/identity assertion'};
}
function cameraChunks(){
 // Exact public camera admission formula at1600x900, centred on256², zoom0.45:
 // screen padding600/440; conservative inverse; all wanted chunks survive eviction.
 const zoom=.45,values=[[-600,-440],[W+600,-440],[-600,H+440],[W+600,H+440]].map(([x,y])=>{const sx=(x-W/2)/zoom,sy=(y-H/2)/zoom;return {x:128000+(sx/32+sy/16)*500,y:128000+(sy/16-sx/32)*500}});
 const loX=Math.floor(Math.max(0,Math.min(...values.map(p=>p.x)))/16000),hiX=Math.floor(Math.min(255999,Math.max(...values.map(p=>p.x)))/16000),loY=Math.floor(Math.max(0,Math.min(...values.map(p=>p.y)))/16000),hiY=Math.floor(Math.min(255999,Math.max(...values.map(p=>p.y)))/16000),out:Array<[number,number]>=[];
 for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++)out.push([x,y]);return out;
}
async function cpu(kind:'baseline'|'candidate',extent:'retained36'|'minimumZoom',mode:'unknown'|'clear'|'frontier'){
 disposeScenes();const all=cameraChunks(),chunks=extent==='retained36'?all.slice(0,36):all,map=makeMap(256),scene=await make(kind,map,chunks),visible:boolean[]=[],explored:boolean[]=[],samples=[];
 const fill=(boundary:number)=>{for(let i=0;i<map.tiles.length;i++){const x=i%map.width;visible[i]=mode==='clear'||mode==='frontier'&&x<boundary;explored[i]=visible[i]||mode==='frontier'&&x<boundary+3}};
 fill(128);for(let i=0;i<scene.fragments.length;i++)scene.fragments[i].setVisible(i%2===0);
 for(let iteration=0;iteration<7;iteration++){fill(128+iteration%2);const start=performance.now();setFog(scene,visible,explored);const ms=performance.now()-start;if(iteration>=2)samples.push(ms)}
 let residentVisibleTiles=0,residentTiles=0;for(const [cx,cy]of chunks)for(let y=cy*16;y<(cy+1)*16;y++)for(let x=cx*16;x<(cx+1)*16;x++){residentTiles++;if(visible[y*map.width+x])residentVisibleTiles++}
 return {kind,extent,mode,chunks:chunks.length,fragments:scene.fragments.length,triangles:scene.fragments.reduce((n,f)=>n+f.triangles.length,0),residentVisibleTiles,residentTiles,hiddenFragments:scene.fragments.filter(f=>!f.mesh.visible).length,samples,conditions:'Shared-host diagnostic; current in-place bitvectors, no reference performance pass/fail threshold'};
}
function precision(){const gl=(app.renderer as unknown as {gl:WebGL2RenderingContext}).gl;return Object.fromEntries([['medium',gl.MEDIUM_FLOAT],['high',gl.HIGH_FLOAT]].map(([name,type])=>{const p=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,type as number)!;return [name,{precision:p.precision,rangeMin:p.rangeMin,rangeMax:p.rangeMax}]}))}
Object.assign(window,{fogPolishQA:{compareCourse,macro,cpu,precision,disposeScenes,stats:()=>({scenes:scenes.length,disposals}),dispose:()=>{disposeScenes();app.destroy(true,{children:true});return {canvases:document.querySelectorAll('canvas').length,disposals}}}});document.body.dataset.ready='true';
