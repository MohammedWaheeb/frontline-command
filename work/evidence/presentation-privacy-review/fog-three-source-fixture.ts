/** Private diagnostic: exact immutable fog sources, public synthetic map only. */
import {Application,Container,Mesh,MeshGeometry,Rectangle,Texture} from 'pixi.js';
import {TerrainBaker as Floor,type TerrainFragment} from '../../terrain-polish-review/inputs-v4/baseline-terrain';
import {TerrainBaker as Current} from '../../claude/presentation-polish-v1/fog-inputs/baseline-terrain';
import {TerrainBaker as Candidate} from '../../claude/presentation-polish-v1/fog-inputs/candidate-terrain';
import {TerrainSurface,surfaceFogOpacity} from '../../terrain-polish-review/inputs-v4/terrain-surface';
import type {GameMap} from '../../../client/src/runtime';

const W=1600,H=900,app=new Application();
await app.init({canvas:document.querySelector('canvas')!,width:W,height:H,resolution:1,backgroundAlpha:0,antialias:true,preference:'webgl'});app.stop();
const world=new Container();world.sortableChildren=true;app.stage.addChild(world);
const constructors={floor:Floor,current:Current,candidate:Candidate};
type Kind=keyof typeof constructors;
type Scene={kind:Kind;baker:Floor|Current|Candidate;surface:TerrainSurface;fragments:TerrainFragment[]};
let scenes:Scene[]=[];const disposals:unknown[]=[],classDisposals:unknown[]=[];
function check(value:unknown,message:string):asserts value{if(!value)throw Error(message)}
function makeMap(raised:boolean):GameMap{
 const size=35,map={id:'fog-three-source',title:'Public geometry diagnostic',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:size,height:size,tiles:Array.from({length:size*size},()=>({terrain:'open',height:0})),spawns:[],fields:[],shipment:{x:0,y:0}} as GameMap;
 if(raised)for(let y=0;y<size;y++)for(let x=0;x<size;x++){const t=map.tiles[y*size+x];t.height=x>=15&&x<=22&&y>=9&&y<=24?3:0;if(x===16||y===16){t.terrain='cliff';t.height=(x+y)%5}if(x===0||y===size-1){t.terrain='blocked';t.height=4}}
 Object.defineProperty(map,'entities',{get(){throw Error('Hidden entity access')}});return map;
}
function make(kind:Kind,map:GameMap){const baker=new constructors[kind](map,{} as never) as Floor,surface=new TerrainSurface(map),fragments:TerrainFragment[]=[];for(let y=0;y<3;y++)for(let x=0;x<3;x++)fragments.push(...baker.surfaceFragments(x,y,Texture.WHITE,surface));const scene={kind,baker,surface,fragments};scenes.push(scene);return scene}
function signature(scene:Scene){return JSON.stringify(scene.fragments.map(f=>({depth:f.depth,bounds:f.bounds,triangles:f.triangles,positions:[...f.mesh.geometry.positions],fogPositions:[...f.fog.geometry.positions],indices:[...f.mesh.geometry.indices]})))}
function disposeScenes(){world.removeChildren();for(const s of scenes){const owned=[...new Set(s.fragments.flatMap(f=>[f.fog.texture,f.mesh.texture]).filter(t=>t!==Texture.WHITE))];const geometries=s.fragments.flatMap(f=>[f.mesh.geometry,f.fog.geometry]);for(const f of s.fragments)f.dispose();s.baker.disposeSurfaceResources();disposals.push({kind:s.kind,meshes:s.fragments.every(f=>f.mesh.destroyed&&f.fog.destroyed),geometry:geometries.every(g=>g.buffers===null&&g.attributes===null),textures:owned.every(t=>t.destroyed)})}scenes=[]}
function bitvectors(map:GameMap,mode:string,visible:boolean[],explored:boolean[]){for(let i=0;i<map.tiles.length;i++){const x=i%map.width,y=Math.floor(i/map.width);visible[i]=mode==='clear'||mode==='edge'&&x<16||mode==='corner'&&x<16&&y<16;explored[i]=visible[i]||mode==='explored'||mode==='edge'&&x<19||mode==='corner'&&(x<16||y<16)}if(mode==='missing'){visible.length=0;explored.length=0}}
function camera(scene:Scene,zoom:number,offset:number){const p=scene.surface.projectGround({x:16000,y:16000});world.scale.set(zoom);world.position.set(W/2-p.x*zoom+offset,H/2-p.y*zoom+offset*.37)}
function alpha(){app.render();const rgba=app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(0,0,W,H)}).pixels,out=new Uint8Array(W*H);for(let i=0;i<out.length;i++)out[i]=rgba[i*4+3];return out}
function present(scene:Scene,zoom:number,offset:number){world.removeChildren();camera(scene,zoom,offset);for(const f of scene.fragments){f.setVisible(true);world.addChild(f.fog)}return alpha()}
/** Filtering indices isolates the unchanged production triangles; no UV,
 * position, shader, texture, opacity or ordering transformation is applied. */
function presentClass(scene:Scene,zoom:number,offset:number,visible:boolean[],explored:boolean[],wanted:175|255){
 world.removeChildren();camera(scene,zoom,offset);const meshes:Mesh[]=[],geometries:MeshGeometry[]=[];let triangles=0;
 for(const f of scene.fragments){const indices:number[]=[];f.triangles.forEach((t,i)=>{if(surfaceFogOpacity(t,visible,explored)===wanted){triangles++;indices.push(...f.fog.geometry.indices.slice(i*3,i*3+3))}});if(!indices.length)continue;
  const geometry=new MeshGeometry({positions:f.fog.geometry.positions.slice(),uvs:f.fog.geometry.uvs.slice(),indices:new Uint32Array(indices)});geometry.batchMode='batch';const mesh=new Mesh({geometry,texture:f.fog.texture});mesh.position.copyFrom(f.fog.position);mesh.zIndex=f.fog.zIndex;meshes.push(mesh);geometries.push(geometry);world.addChild(mesh);
 }
 const pixels=alpha();world.removeChildren();for(const m of meshes)m.destroy();for(const g of geometries)g.destroy();classDisposals.push({meshes:meshes.every(m=>m.destroyed),geometry:geometries.every(g=>g.buffers===null&&g.attributes===null)});return {pixels,triangles};
}
function pair(a:Uint8Array,b:Uint8Array){let lower=0,opaqueLost=0,maxDrop=0,different=0,nonzero=0;for(let i=0;i<a.length;i++){if(a[i])nonzero++;if(a[i]!==b[i])different++;if(b[i]<a[i]){lower++;maxDrop=Math.max(maxDrop,a[i]-b[i])}if(a[i]===255&&b[i]!==255)opaqueLost++}return {lower,opaqueLost,maxDrop,different,nonzero}}
function vertices(current:Scene,candidate:Scene,visible:boolean[],explored:boolean[]){let protectedTriangles=0,changedVisibleCentres=0;const classes={remembered:0,unknown:0,visible:0};for(let f=0;f<current.fragments.length;f++){const a=current.fragments[f],b=candidate.fragments[f];a.triangles.forEach((t,i)=>{const base=surfaceFogOpacity(t,visible,explored);classes[base===0?'visible':base===175?'remembered':'unknown']++;for(let j=0;j<3;j++){const at=a.fog.geometry.uvs[i*6+j*2],bt=b.fog.geometry.uvs[i*6+j*2];if(base){check(at===bt,'Protected triangle changed UV');check(at===Math.fround((base+.75)/256),'Protected triangle is not constant opacity')}else{check(bt>=at,'Visible vertex alpha lowered');if(bt!==at){check(t.kind==='top'&&j===0,'Change outside visible top centre');changedVisibleCentres++}}}if(base)protectedTriangles++})}return {protectedTriangles,changedVisibleCentres,classes}}
async function course(raised:boolean){
 disposeScenes();const map=makeMap(raised),a=make('floor',map),b=make('current',map),c=make('candidate',map),visible:boolean[]=[],explored:boolean[]=[],cases:unknown[]=[];
 const geometryEqual=signature(a)===signature(b)&&signature(b)===signature(c);check(geometryEqual,'Geometry differs');
 for(const mode of ['unknown','clear','explored','edge','corner','missing','clear','edge']){
  bitvectors(map,mode,visible,explored);for(const s of scenes)for(const f of s.fragments)f.setFog(visible,explored);const vertexProof=vertices(b,c,visible,explored);
  for(const zoom of [.45,1,1.8])for(const offset of [0,.375]){
   const floor=present(a,zoom,offset),current=present(b,zoom,offset),candidate=present(c,zoom,offset);
   const floorCurrent=pair(floor,current),floorCandidate=pair(floor,candidate),currentCandidate=pair(current,candidate),isolated:Record<string,unknown>={},classPixels:Record<string,Uint8Array>={};
   for(const [name,wanted] of [['remembered',175],['unknown',255]] as const){const fa=presentClass(a,zoom,offset,visible,explored,wanted),fb=presentClass(b,zoom,offset,visible,explored,wanted),fc=presentClass(c,zoom,offset,visible,explored,wanted);check(fa.triangles===fb.triangles&&fb.triangles===fc.triangles,'Isolated triangle sets differ');isolated[name]={triangles:fa.triangles,floorCurrent:pair(fa.pixels,fb.pixels),floorCandidate:pair(fa.pixels,fc.pixels),currentCandidate:pair(fb.pixels,fc.pixels)};classPixels[name]=fa.pixels}
   // Preserve EVERY observed current→candidate decrease with all three actual
   // full-image values and original protected-class coverage. No causal waiver.
   const drops:number[][]=[];for(let i=0;i<floor.length;i++)if(candidate[i]<current[i])drops.push([i%W,Math.floor(i/W),floor[i],current[i],candidate[i],classPixels.remembered[i],classPixels.unknown[i]]);
   let clearNonzero=0;if(mode==='clear')for(const value of candidate)if(value)clearNonzero++;
   cases.push({mode,zoom,offset,vertexProof,floorCurrent,floorCandidate,currentCandidate,isolated,clearNonzero,drops});
  }
 }
 bitvectors(map,'unknown',visible,explored);for(const f of c.fragments){f.setVisible(false);f.setFog(visible,explored)}const hidden=c.fragments.every(f=>!f.fog.visible&&!f.mesh.visible);for(const f of c.fragments)f.setVisible(true);const restored=c.fragments.every(f=>f.fog.visible&&f.mesh.visible);
 return {raised,geometryEqual,hidden,restored,fragments:a.fragments.length,triangles:a.fragments.reduce((n,f)=>n+f.triangles.length,0),cases};
}
function dispose(){disposeScenes();app.destroy({removeView:true},{children:true,texture:false,textureSource:false});return {canvases:document.querySelectorAll('canvas').length,disposals,classDisposals:classDisposals.length,allClassDisposals:classDisposals.every((v:any)=>v.meshes&&v.geometry)}}
Object.assign(window,{fogThreeQA:{course,dispose}});document.body.dataset.ready='true';
