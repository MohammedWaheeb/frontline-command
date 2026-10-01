/** Isolated geometry/fog/input acceptance. Synthetic actors are visual probes;
 * this does not claim Go movement or stage-3 product integration. */
import {Application,Container,Graphics,Rectangle,Texture,Mesh,MeshGeometry} from 'pixi.js';
import {TerrainBaker,CHUNK,type TerrainFragment} from '../../src/render/terrain';
import {TerrainSurface,projectSurfaceVertex} from '../../src/render/terrain-surface';
import {ArtLibrary} from '../../src/render/art';
import type {GameMap,Point} from '../../src/runtime';

const canvas=document.getElementById('terrain') as HTMLCanvasElement;
const app=new Application();await app.init({canvas,width:1600,height:900,resolution:1,background:'#14130f',preference:'webgl',antialias:true});app.stop();
const world=new Container();world.sortableChildren=true;app.stage.addChild(world);
const art=new ArtLibrary();await art.init();
let baker:TerrainBaker|undefined,surface:TerrainSurface,map:GameMap,fragments:TerrainFragment[]=[],textures:Texture[]=[],focus:Point,zoom=1;
const clicks:unknown[]=[];
const probes:Graphics[]=[];
function synthetic():GameMap{
 const m:GameMap={id:'height-fixture',title:'Synthetic height acceptance',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:35,height:33,tiles:Array.from({length:35*33},()=>({terrain:'open',height:0})),spawns:[],fields:[],shipment:{x:0,y:0}};
 for(let y=8;y<=22;y++)for(let x=8;x<=22;x++)m.tiles[y*m.width+x]={terrain:x===8||y===8||x===22||y===22?'cliff':'open',height:3};
 // Four readable passages, including the common road-overwritten ramp pattern.
 for(let i=12;i<=17;i++)for(let j=6;j<=11;j++)for(const [x,y] of [[j,i],[28-j,i],[i,j],[i,28-j]])m.tiles[y*m.width+x]={terrain:i%2?'road':'ramp',height:j<8?0:j<10?1:2};
 m.tiles[5*m.width+5]={terrain:'cliff',height:0};m.tiles[6*m.width+27]={terrain:'blocked',height:4};
 return m;
}
function dispose(){world.removeChildren();for(const probe of probes)probe.destroy();probes.length=0;for(const fragment of fragments)fragment.dispose();for(const texture of textures)texture.destroy(true);baker?.disposeSurfaceResources();fragments=[];textures=[]}
function camera(z=zoom){zoom=z;const p=surface.projectGround(focus);world.scale.set(z);world.position.set(app.screen.width/2-p.x*z,app.screen.height/2-p.y*z)}
function screen(point:Point){const p=surface.projectGround(point);return {x:p.x*zoom+world.x,y:p.y*zoom+world.y}}
function fog(mode:string){
 const visible=map.tiles.map((_,i)=>mode==='visible'||mode==='edge'&&(i%map.width)<Math.floor(focus.x/1000)),explored=map.tiles.map((_,i)=>mode==='visible'||mode==='edge'&&(i%map.width)<Math.floor(focus.x/1000)+3);
 for(const fragment of fragments)fragment.setFog(visible,explored);return {visible,explored};
}
const pixels=()=>app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(0,0,app.screen.width,app.screen.height)}).pixels;
function compare(a:Uint8Array|Uint8ClampedArray,b:Uint8Array|Uint8ClampedArray){let changed=0,maxDelta=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);if(delta>1)changed++;maxDelta=Math.max(maxDelta,delta)}return {changedChannelsOverOne:changed,maxDelta}}
async function show(id:string,mode='visible'){
 dispose();map=id==='synthetic'||id==='stress'?synthetic():await(await fetch(`/maps/${id}.json`)).json();
 if(id==='stress')map.tiles.forEach((tile,i)=>{tile.height=(i*13+Math.floor(i/map.width)*7)%5;tile.terrain=i%11===0?'cliff':'road'});
 surface=new TerrainSurface(map);
 focus=id==='synthetic'||id==='stress'?{x:15500,y:15500}:id==='relay-heights'?{x:48500,y:55500}:{x:66500,y:65500};
 baker=new TerrainBaker(map,art);await baker.load();
 const cx=Math.floor(focus.x/1000/CHUNK),cy=Math.floor(focus.y/1000/CHUNK);
 const whole=id==='synthetic'||id==='stress';
 for(let y=whole?0:Math.max(0,cy-1);y<=(whole?baker.chunksY-1:Math.min(baker.chunksY-1,cy+1));y++)for(let x=whole?0:Math.max(0,cx-1);x<=(whole?baker.chunksX-1:Math.min(baker.chunksX-1,cx+1));x++){
  const texture=baker.bake(x,y,true);textures.push(texture);fragments.push(...baker.surfaceFragments(x,y,texture,surface));
 }
 const items=fragments.flatMap(f=>[f.mesh,f.fog]);fog(mode);const drawOrder=[];
 for(const z of [.45,1,1.8]){
  world.removeChildren();world.addChild(...items);camera(z);app.render();const normal=pixels();
  world.removeChildren();world.addChild(...[...items].reverse());app.render();drawOrder.push({zoom:z,...compare(normal,pixels())});
 }
 world.removeChildren();world.addChild(...items);camera(1);app.render();
 return {id,mode,chunks:textures.length,fragments:fragments.length,triangles:fragments.reduce((n,f)=>n+f.triangles.length,0),drawOrder,
  focus,centerHeight:surface.sampleGround(focus),matchingFogGeometry:fragments.every(f=>f.mesh.geometry.positions.every((v,i)=>v===f.fog.geometry.positions[i]))};
}
function inspect(point:Point){const p=screen(point),hit=surface.pickSurface({x:(p.x-world.x)/zoom,y:(p.y-world.y)/zoom});return {screen:p,height:surface.sampleGround(point),hit}}
canvas.addEventListener('click',event=>{const r=canvas.getBoundingClientRect(),p={x:(event.clientX-r.left-world.x)/zoom,y:(event.clientY-r.top-world.y)/zoom};clicks.push(surface.pickSurface(p))});
function probeOcclusion(){
 // A known visual probe behind the near side of a four-level cliff; current
 // all-terrain-before-actors rendering would leave every magenta pixel visible.
 dispose();map=synthetic();map.tiles.forEach(t=>{t.terrain='open';t.height=0});map.tiles[15*map.width+15]={terrain:'cliff',height:4};surface=new TerrainSurface(map);focus={x:15500,y:15500};
 return (async()=>{
  baker=new TerrainBaker(map,art);await baker.load();const texture=baker.bake(0,0,true);textures.push(texture);fragments.push(...baker.surfaceFragments(0,0,texture,surface));
  for(const f of fragments)world.addChild(f.mesh,f.fog);fog('visible');camera(1);
  const ground={x:14900,y:14900},p=surface.projectGround(ground),probe=new Graphics().rect(-8,-32,16,36).fill(0xff00ff);probes.push(probe);probe.position.set(p.x,p.y);probe.zIndex=ground.x+ground.y;world.addChild(probe);app.render();
  const count=()=>{const data=pixels();let n=0;for(let i=0;i<data.length;i+=4)if(data[i]>240&&data[i+1]<10&&data[i+2]>240)n++;return n};
  const depthSorted=count();probe.zIndex=Infinity;app.render();const forcedFront=count();probe.zIndex=ground.x+ground.y;app.render();
  // Pure pixel probe deliberately destroyed outside ordinary fragment ownership.
  return {depthSorted,forcedFront,occluded:depthSorted<forcedFront,point:ground,screen:screen(ground)};
 })();
}
function unknownProbe(){fog('unknown');app.render();const values=pixels();let nonDarkInterior=0;const p=screen(focus);for(let y=Math.round(p.y)-20;y<Math.round(p.y)+20;y++)for(let x=Math.round(p.x)-20;x<Math.round(p.x)+20;x++){const i=(y*app.screen.width+x)*4;if(values[i]>10||values[i+1]>11||values[i+2]>9)nonDarkInterior++}return {nonDarkInterior}}
function pickAudit(){
 // Render exact cached meshes using one flat ID per actual triangle. This
 // checks GPU frontmost ordering against the pure picker, not merely its math.
 const saved=world.removeChildren(),triangles=fragments.flatMap(f=>f.triangles),width=128,height=Math.ceil(triangles.length/128),palette=document.createElement('canvas');palette.width=width;palette.height=height;
 const ctx=palette.getContext('2d')!,image=ctx.createImageData(width,height);for(let i=0;i<triangles.length;i++){const id=i+1;image.data.set([id&255,(id>>8)&255,(id>>16)&255,255],i*4)}ctx.putImageData(image,0,0);
 const texture=Texture.from(palette);texture.source.scaleMode='nearest';const meshes:Mesh[]=[];let index=0;
 for(const fragment of fragments){
  const uvs=new Float32Array(fragment.triangles.length*6);for(let i=0;i<fragment.triangles.length;i++,index++)for(let j=0;j<3;j++){uvs[i*6+j*2]=(index%128+.5)/width;uvs[i*6+j*2+1]=(Math.floor(index/128)+.5)/height}
  const geometry=new MeshGeometry({positions:fragment.mesh.geometry.positions,uvs,indices:fragment.mesh.geometry.indices});geometry.batchMode='batch';
  const mesh=new Mesh({texture,geometry});mesh.position.copyFrom(fragment.mesh.position);mesh.zIndex=fragment.mesh.zIndex;meshes.push(mesh);world.addChild(mesh);
 }
 app.render();const data=pixels(),w=app.screen.width,h=app.screen.height,idAt=(x:number,y:number)=>{const i=(y*w+x)*4;return data[i]+data[i+1]*256+data[i+2]*65536};let checked=0;const mismatches:unknown[]=[];
 for(let y=3;y<h-3;y+=7)for(let x=3;x<w-3;x+=7){const id=idAt(x,y);if(!id||id>triangles.length||[-1,0,1].some(dy=>[-1,0,1].some(dx=>idAt(x+dx,y+dy)!==id)))continue;
  const actual=triangles[id-1],hit=surface.pickSurface({x:(x+.5-world.x)/zoom,y:(y+.5-world.y)/zoom});checked++;
  if(!hit||hit.triangle.id!==actual.id){if(mismatches.length<12)mismatches.push({x,y,actual:actual.id,picked:hit?.triangle.id})}
 }
 world.removeChildren();for(const mesh of meshes){mesh.geometry.destroy();mesh.destroy()}texture.destroy(true);world.addChild(...saved);app.render();return {checked,mismatches};
}
function cullAudit(){
 const previous={x:world.x,y:world.y,zoom},samples=[];
 for(const z of [.45,1,1.8])for(const offset of [{x:0,y:0},{x:-710,y:350},{x:740,y:-360},{x:-1400,y:-730},{x:1600,y:950}]){
  camera(z);world.x+=offset.x;world.y+=offset.y;
  for(const f of fragments)f.setVisible(true);app.render();const baseline=pixels();
  const view={left:(-world.x-2)/z,top:(-world.y-2)/z,right:(app.screen.width-world.x+2)/z,bottom:(app.screen.height-world.y+2)/z};let shown=0,shownVertices=0;
  for(const f of fragments){const b=f.bounds,visible=b.right>=view.left&&b.left<=view.right&&b.bottom>=view.top&&b.top<=view.bottom;f.setVisible(visible);if(visible){shown++;shownVertices+=f.mesh.geometry.positions.length/2}}
  app.render();samples.push({zoom:z,offset,total:fragments.length,shown,shownVertices,totalVertices:fragments.reduce((n,f)=>n+f.mesh.geometry.positions.length/2,0),...compare(baseline,pixels())});
 }
 for(const f of fragments)f.setVisible(true);zoom=previous.zoom;world.scale.set(zoom);world.position.set(previous.x,previous.y);app.render();return samples;
}
Object.assign(window,{qa:{show,inspect,clicks,screen,unknownProbe,probeOcclusion,pickAudit,cullAudit,resize:(width:number,height:number)=>{app.renderer.resize(width,height);camera();app.render()},dispose,stats:()=>({textures:textures.length,fragments:fragments.length,probes:probes.length}),surface:()=>surface}});
document.body.dataset.ready='true';
