/** Geometry acceptance only: actual authored sprite plates and ActorVisual,
 * deliberately translated through a synthetic public surface. No Go play claim. */
import {Application,Container,Rectangle,Texture} from 'pixi.js';
import {ArtLibrary} from '../../src/render/art';
import {ActorVisual} from '../../src/render/actors';
import {SurfaceShadows,type ShadowPlate} from '../../src/render/surface-shadows';
import {TerrainBaker,type TerrainFragment} from '../../src/render/terrain';
import {TerrainSurface} from '../../src/render/terrain-surface';
import {CatalogIndex} from '../../src/content/catalog';
import type {Entity,GameMap,Point} from '../../src/runtime';
const app=new Application();await app.init({width:640,height:480,resolution:1,background:0x17150f,antialias:false,preference:'webgl'});app.stop();document.body.append(app.canvas);
const catalog=new CatalogIndex(await(await fetch('/catalog.json')).json()),world=new Container();world.sortableChildren=true;app.stage.addChild(world);
let shadows=new SurfaceShadows(world,app.renderer);
const updateShadows=(plates:readonly ShadowPlate[],visible?:readonly boolean[])=>shadows.update(plates,surface,visible,{left:-world.x/world.scale.x,top:-world.y/world.scale.y,right:(640-world.x)/world.scale.x,bottom:(480-world.y)/world.scale.y,zoom:world.scale.x});
function shadowsVisible(visible:boolean){const internals=shadows as unknown as {ground:Map<number,{mesh:Container}>;deck:{groups:Map<string,Container>}};for(const group of internals.ground.values())group.mesh.visible=visible;for(const mesh of internals.deck.groups.values())mesh.visible=visible}
let art:ArtLibrary|undefined,actor:ActorVisual|undefined,baker:TerrainBaker|undefined,surface:TerrainSurface,fragments:TerrainFragment[]=[],textures:Texture[]=[],source:Entity,clock=1000;
type ActorParts={parts:Array<{root:Container;shadowRoot:Container}>;groundShadows:Container;foundation:Container;bodyBottom:number};
const pixels=()=>Uint8Array.from(app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(0,0,640,480)}).pixels);
function difference(a:Uint8Array,b:Uint8Array){let pixels=0,maximum=0;for(let i=0;i<a.length;i+=4){let different=false;for(let j=0;j<4;j++){const delta=Math.abs(a[i+j]-b[i+j]);maximum=Math.max(maximum,delta);if(delta>1)different=true}if(different)pixels++}return {pixels,maximum}}
async function dispose(){shadows.clear();actor?.dispose();actor=undefined;for(const f of fragments)f.dispose();for(const t of textures)t.destroy(true);fragments=[];textures=[];baker?.disposeSurfaceResources();await art?.release();world.removeChildren();return art?.statistics}
async function prepare(type:string,quality:'standard'|'high',shape='flat'){
 await dispose();art=new ArtLibrary();art.configure(quality);await art.init();
 const fixture=await(await fetch(`/parking-fixtures/${type.startsWith('SY')?'SY-two':'US-six'}.json`)).json();source=fixture.view.entities.find((e:Entity)=>e.type===type);if(!source)throw Error('No actual source entity '+type);
 const map:GameMap={id:'sprite-depth-geometry',title:'Synthetic sprite depth',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:32,height:32,tiles:Array.from({length:1024},()=>({terrain:'open',height:0})),spawns:[],fields:[],shipment:{x:0,y:0}};
 if(shape==='cliff')map.tiles[16*32+16]={terrain:'cliff',height:4};
 if(shape==='plateau')map.tiles.forEach(tile=>tile.height=4);
 if(shape==='slope')for(let y=0;y<32;y++)for(let x=0;x<32;x++)map.tiles[y*32+x].height=x>=16?2:0;
 surface=new TerrainSurface(map);baker=new TerrainBaker(map,art);await baker.load();
 for(let y=0;y<2;y++)for(let x=0;x<2;x++){const texture=baker.bake(x,y,true);textures.push(texture);fragments.push(...baker.surfaceFragments(x,y,texture,surface))}
 for(const f of fragments){f.setFog(map.tiles.map(()=>true),map.tiles.map(()=>true));world.addChild(f.mesh,f.fog)}
 actor=new ActorVisual({...source,private:undefined,position:{...source.position!,x:16000,y:16000}},catalog,art,type.slice(0,2),surface);await actor.ready;world.addChild(actor.root);if(actor.terrainShadow)world.addChild(actor.terrainShadow);
 actor.useSurfaceShadows();
 actor.render(clock,0xcbb25c,false,'selected',true);await art.settle();actor.render(clock,0xcbb25c,false,'selected',true);
 return {type,quality,shape,standIn:actor.standIn,missingArt:actor.missingArt,statistics:art.statistics};
}
function sample(position:Point,zoom:number,layer:'body'|'shadow'|'combined'='body',screenY=260){
 if(!actor)throw Error('Prepare required');clock+=100;actor.update({...source,private:undefined,position:{...source.position!,...position}},clock-100);actor.render(clock,0xcbb25c,false,'selected',true,zoom);
 const internals=actor as unknown as ActorParts;
 actor.overlays.visible=false;internals.foundation.visible=false;actor.hideStatus();
 for(const part of internals.parts)part.root.visible=layer!=='shadow';internals.groundShadows.visible=false;
 const ground=actor.groundAnchor(clock,true);world.scale.set(zoom);world.position.set(320-ground.x*zoom,screenY-ground.y*zoom);
 const target=layer==='shadow'&&actor.terrainShadow?actor.terrainShadow:actor.root,depth=target.zIndex;
 updateShadows(layer!=='body'?actor.shadowPlates:[]);app.render();const sorted=pixels();shadowsVisible(false);if(layer!=='body')internals.groundShadows.visible=true;target.zIndex=Infinity;
 const shadowDepth=actor.terrainShadow?.zIndex;if(layer==='combined'&&actor.terrainShadow)actor.terrainShadow.zIndex=1e9;
 app.render();const front=pixels();target.visible=false;internals.groundShadows.visible=false;app.render();const absent=pixels();target.visible=true;target.zIndex=depth;if(actor.terrainShadow&&shadowDepth!==undefined)actor.terrainShadow.zIndex=shadowDepth;internals.groundShadows.visible=false;shadowsVisible(true);app.render();
 return {position,zoom,layer,depth,bodyBottom:internals.bodyBottom,clipped:difference(sorted,front),ink:difference(front,absent)};
}
async function geometry(){
 const results=[];
 for(const shape of ['cliff','slope']){
  await prepare('US.strike','standard',shape);sample({x:15900,y:15900},1,'shadow');const shaded=pixels(),stats=shadows.diagnostics;shadows.clear();app.render();const clear=pixels();let changed=0,faceLeaks=0;const levels=new Set<number>();
  for(let y=0;y<480;y++)for(let x=0;x<640;x++){const i=(y*640+x)*4;if(Math.max(...[0,1,2].map(c=>Math.abs(shaded[i+c]-clear[i+c])))<3)continue;changed++;const hit=surface.pickSurface({x:x+.5-world.x,y:y+.5-world.y});if(hit?.triangle.kind==='face')faceLeaks++;if(hit)levels.add(Math.round(hit.point.height*1000)/1000)}
  updateShadows(actor!.shadowPlates,Array(1024).fill(false));app.render();results.push({shape,changed,faceLeaks,levels:[...levels],unknown:difference(pixels(),clear),stats});
 }
 await prepare('US.strike','standard','plateau');for(const y of [470,490,510,530]){const value=sample({x:15500,y:15500},1.8,'shadow',y);results.push({shape:`plateau-edge-${y}`,expectedEmpty:y===530,changed:value.ink.pixels,faceLeaks:0,levels:[4],unknown:{pixels:0,maximum:0},clipped:value.clipped,stats:shadows.diagnostics})}
 return results;
}
async function lifecycle(){
 await prepare('US.strike','standard');sample({x:15500,y:15500},1,'combined');const before=pixels(),resident=art!.statistics,meshes=shadows.diagnostics;
 const sheet=(await art!.sheet('unit.US.strike'))!;sheet.evictBefore(Infinity);await new Promise(resolve=>setTimeout(resolve,30));actor!.render(clock,0xcbb25c,false,'selected',true);updateShadows(actor!.shadowPlates);app.render();const pending=shadows.diagnostics;
 await art!.settle();sample({x:15500,y:15500},1,'combined');const restored=difference(before,pixels());
 sheet.evictBefore(Infinity);await new Promise(resolve=>setTimeout(resolve,20));actor!.render(clock,0xcbb25c,false,'selected',true);updateShadows(actor!.shadowPlates);shadows.dispose();shadows=new SurfaceShadows(world,app.renderer);actor!.dispose();actor=undefined;await art!.release();app.render();return {resident,meshes,pending,restored,disposed:shadows.diagnostics,art:art!.statistics};
}
async function visibility(first:number[],second:number[]){
 await prepare('US.strike','standard');sample({x:15500,y:1000},1,'shadow');const a=Array.from({length:1024},(_,i)=>first.includes(i)),b=Array.from({length:1024},(_,i)=>second.includes(i));
 updateShadows(actor!.shadowPlates,a);app.render();const original=pixels();updateShadows(actor!.shadowPlates,b);app.render();const changed=pixels();shadows.clear();updateShadows(actor!.shadowPlates,b);app.render();return {changed:difference(original,changed),matchesFresh:difference(changed,pixels())};
}
async function budget(){await prepare('US.strike','standard');sample({x:15500,y:15500},1,'shadow');const samples=[];for(let i=0;i<3;i++){shadows.update(actor!.shadowPlates,surface,undefined,{left:-6000,top:-2500,right:6000,bottom:2500,zoom:1});app.render();samples.push(shadows.diagnostics)}return {samples}}
async function stress(){
 await prepare('US.strike','standard');const planes:ShadowPlate[]=[];let identity=1_000_000,index=0;
 const roster=[['unit.US.strike',64,'parked',13],['unit.US.rifle',336,'idle',0],['unit.US.tank',256,'idle',0],['building.US.hq',32,'idle',0]] as const;
 for(const [asset,count,state,direction] of roster){const sheet=(await art!.sheet(asset))!;sheet.frame('shadow',state,direction,0);await sheet.settle();const frame=sheet.frame('shadow',state,direction,0);if(!frame)throw Error('Missing stress shadow '+asset);
  for(let n=0;n<count;n++,index++){const center={x:4000+(index%26)*900,y:3500+Math.floor(index/26)*900};for(const [x,y] of sheet.meta.squad?.member_offsets_mt??[[0,0]])planes.push({id:identity++,frame,scale:sheet.pixelScale,origin:{x:center.x+x,y:center.y+y},alpha:.46})}
 }
 shadows.clear();const coldAt=performance.now();updateShadows(planes);const coldMs=performance.now()-coldAt,cold=shadows.diagnostics,samples=[];
 for(let i=0;i<40;i++){
  // One aircraft moves while every other plane stays still, then all mobile
  // actors move. Static-building clipping must remain cached in both cases.
  const moving=i<20?1:planes.length-32,next=planes.map((p,n)=>({...p,origin:{x:p.origin.x+(n<moving?(i+1)*7:0),y:p.origin.y}}));
  const at=performance.now();updateShadows(next);samples.push({phase:i<20?'one-moving':'mobile-moving',ms:performance.now()-at,...shadows.diagnostics});await new Promise(requestAnimationFrame);
 }
 return {scope:'Synthetic688-actor visible geometry stress; real unchanged shadow plates, no gameplay/performance certification',actors:index,plates:planes.length,coldMs,cold,samples};
}
async function deckStress(){
 await prepare('US.strike','standard');
 const sheet=(await art!.sheet('unit.US.strike'))!;sheet.frame('shadow','parked',13,0);await sheet.settle();const frame=sheet.frame('shadow','parked',13,0);if(!frame)throw Error('Missing actual strike shadow');
 // Sixteen separated synthetic service footprints, four real authored plates
 // per footprint. This is a clipping-cost test, not a legal Go match or FPS test.
 surface=new TerrainSurface({width:96,height:32,tiles:Array.from({length:96*32},()=>({terrain:'open',height:0}))});
 const planes:ShadowPlate[]=[];for(let home=0;home<16;home++){const x=6000+(home%8)*10000,y=6000+Math.floor(home/8)*10000,deck={left:x-2000,top:y-2000,right:x+2000,bottom:y+2000,height:2,depth:x+y+4000};for(const [dx,dy] of [[-900,-900],[900,-900],[-900,900],[900,900]])planes.push({id:2_000_000+planes.length,frame,scale:sheet.pixelScale,origin:{x:x+dx,y:y+dy},alpha:.46,deck})}
 shadows.clear();const start=performance.now();updateShadows(planes);const coldMs=performance.now()-start,cold=shadows.diagnostics,samples=[];
 for(let i=0;i<50;i++){const phase=i<10?'stationary':i<30?'one-moving':'six-moving',moving=i<10?0:i<30?1:6,next=planes.map((p,n)=>({...p,origin:{x:p.origin.x+(n<moving?(i+1)*5:0),y:p.origin.y}}));const at=performance.now();updateShadows(next);samples.push({phase,ms:performance.now()-at,...shadows.diagnostics});await new Promise(requestAnimationFrame)}
 return {scope:'64 actual authored shadow plates on16 synthetic known service decks; CPU clipping/update cost only',plates:planes.length,coldMs,cold,samples};
}
Object.assign(window,{spriteDepthQA:{prepare,sample,geometry,lifecycle,visibility,budget,stress,deckStress,dispose}});document.body.dataset.ready='true';
