/** Full authored aircraft pages; no simulation, invented entity or asset bytes.
 * The two actor consumers below come from one preserved Go-authorized view. */
import {Application,Container,Sprite,Text,type Texture} from 'pixi.js';
import {fromJson} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {ArtLibrary,type SpriteSheet,type FrameSet} from '../../src/render/art';
import {ActorVisual} from '../../src/render/actors';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';

interface Ref {key:string;state:string;direction:number;index:number;rect:{x:number;y:number;w:number;h:number};anchor?:{x:number;y:number}}
interface Page {id:string;layer:string;url:string;width:number;height:number;bytes:number;refs:Ref[]}
interface Plan {ids:string[];qualities:Record<'standard'|'high',{pages:Page[];states:Array<{id:string;name:string;source:string;directions:number;frames:number;layers:string[]}>}>}
const plan=await(await fetch('/plan.json')).json() as Plan;
const catalog=new CatalogIndex(await(await fetch('/catalog.json')).json() as Catalog);
const snapshot=fromJson(PlayerSnapshotSchema,await(await fetch('/fighters.view.json')).json());
const app=new Application();await app.init({width:1600,height:900,resolution:1,background:0x191b14,antialias:false});app.stop();document.body.appendChild(app.canvas);
let art=new ArtLibrary(),quality:'standard'|'high'='standard',sheets=new Map<string,SpriteSheet>(),actors:ActorVisual[]=[],disposed=false;
let pendingSheet:SpriteSheet|undefined,pendingPage:Page|undefined,releasePromise:Promise<void>|undefined;
function check(value:unknown,message:string):asserts value{if(!value)throw Error(message)}
const stats=()=>({...art.statistics});
const clear=()=>{for(const actor of actors)actor.dispose();actors=[];for(const child of app.stage.removeChildren())child.destroy({children:true})};
const paint=()=>app.renderer.render({container:app.stage});
const pageFrame=(sheet:SpriteSheet,page:Page,ref=page.refs[0])=>sheet.frame(page.layer,ref.state,ref.direction,ref.index);
async function waitUnloads(){for(const sheet of sheets.values())await Promise.all((sheet as any).pages.map((page:any)=>page.unloading))}
async function evictAll(){clear();for(const sheet of sheets.values())sheet.evictBefore(performance.now()+1);await waitUnloads();check(stats().residentPages===0&&stats().pickingBytes===0,'Page eviction left textures/picking data');paint()}
function rgba(texture:Texture){const p=app.renderer.extract.pixels(texture);let alpha=0;for(let i=3;i<p.pixels.length;i+=4)if(p.pixels[i]>0)alpha++;return {width:p.width,height:p.height,alphaPixels:alpha}}
function addLabel(text:string,x:number,y:number){const label=new Text({text,style:{fontFamily:'Arial',fontSize:14,fill:0xe1c890}});label.position.set(x,y);app.stage.addChild(label)}
function addFrame(frame:FrameSet,x:number,y:number,scale:number){const sprite=new Sprite(frame.texture);sprite.anchor.set(frame.anchorX,frame.anchorY);sprite.position.set(x,y);sprite.scale.set(scale);app.stage.addChild(sprite);return sprite}
function liveTextures(root:Container){const result:Array<{destroyed:boolean;source:boolean}>=[];const visit=(node:Container)=>{if(node instanceof Sprite&&node.visible)result.push({destroyed:node.texture.destroyed,source:!!node.texture.source});for(const child of node.children)visit(child)};visit(root);return result}
const qa={
 stats,
 async begin(next:'standard'|'high'){
  clear();await art.release();art=new ArtLibrary();quality=next;art.configure(quality);await art.init();sheets=new Map();
  for(const id of plan.ids){const [a,b]=await Promise.all([art.sheet(id),art.sheet(id)]);check(a&&a===b,'Same library duplicated an aircraft sheet');sheets.set(id,a)}
  check(stats().residentPages===0&&stats().residentBytes===0,'Metadata load eagerly admitted PNGs');
  let knownFrames=0;for(const state of plan.qualities[quality].states){const sheet=sheets.get(state.id)!;check(sheet.has(state.name),'Published state/alias missing');for(const layer of state.layers)for(let d=0;d<state.directions;d++)for(let f=0;f<state.frames;f++){check(sheet.hasFrame(layer,state.name,d,f),'Published frame unreachable');knownFrames++}}
  return {quality,statistics:stats(),knownFrames,scale:[...sheets.values()].map(s=>({id:s.id,scale:s.scale,pixelScale:s.pixelScale}))};
 },
 async page(index:number){
  const page=plan.qualities[quality].pages[index],sheet=sheets.get(page.id)!;check(stats().residentPages===0,'Page walk must begin without resident pages');
  check(pageFrame(sheet,page)===undefined,'First atlas request was not lazy');await art.settle();const first=pageFrame(sheet,page);check(first,'Real page failed to load');
  check(stats().residentPages===1&&stats().residentBytes===page.bytes,'Page walk admitted unrelated atlas bytes');
  let checked=0;for(const ref of page.refs){const frame=pageFrame(sheet,page,ref);check(frame&&frame.atlasTexture===first.atlasTexture,'Frame lost shared page texture');check(frame===pageFrame(sheet,page,ref),'Same crop was duplicated');check(frame.texture.width===ref.rect.w&&frame.texture.height===ref.rect.h,'Atlas crop dimensions differ');check(frame.texture.frame.x===ref.rect.x&&frame.texture.frame.y===ref.rect.y,'Atlas crop position differs');check(frame.anchorX===(ref.anchor?.x??.5)&&frame.anchorY===(ref.anchor?.y??.5),'Atlas anchor differs');checked++}
  const pixels=rgba(first.texture),before=stats(),old=first;await evictAll();check(old.texture.destroyed,'Retired crop texture survived');check(!old.containsAlpha||!old.containsAlpha(0,0,0),'Retired crop retained picking opacity');
  return {index,url:page.url,id:page.id,layer:page.layer,checked,pixels,before,after:stats()};
 },
 async contact(index:number){
  await evictAll();const state=plan.qualities[quality].states[index],sheet=sheets.get(state.id)!,direction=Math.min(11,state.directions-1),frame=Math.floor((state.frames-1)/2);
  for(const layer of state.layers)sheet.frame(layer,state.name,direction,frame);await art.settle();
  addLabel(`Full authored aircraft atlas · ${quality} · ${state.id} · ${state.name} · d${direction} f${frame} · native 1× world scale`,20,20);
  let alpha=0;const frames=[];for(const layer of ['shadow','beauty','team'])if(state.layers.includes(layer)){const value=sheet.frame(layer,state.name,direction,frame);check(value,'Contact layer missing');const sprite=addFrame(value,800,450,sheet.pixelScale);if(layer==='shadow')sprite.alpha=.46;if(layer==='team')sprite.tint=0x91b86c;const p=rgba(value.texture);if(layer==='beauty')alpha=p.alphaPixels;frames.push({layer,...p,anchorX:value.anchorX,anchorY:value.anchorY})}
  check(alpha>0,'Representative real beauty crop is empty');paint();return {state,quality,direction,frame,frames,statistics:stats()};
 },
 async pressure(){
  await evictAll();const budget=(quality==='high'?384:192)*1024*1024,pages=plan.qualities[quality].pages,admitted:Page[]=[];
  for(const page of pages){pageFrame(sheets.get(page.id)!,page);await art.settle();check(pageFrame(sheets.get(page.id)!,page),'Pressure page missing');admitted.push(page);if(stats().residentBytes>budget)break}
  const peak=stats();check(peak.residentBytes>budget,'Real pages did not cross the production soft-trim threshold');check(peak.residentBytes<=budget+Math.max(...pages.map(p=>p.bytes)),'Pressure admitted more than one page beyond threshold');
  // Touch all current pages together. Actual elapsed time, not an injected clock,
  // then tests the production ten-second idle rule while the renderer is stopped.
  for(const page of admitted)pageFrame(sheets.get(page.id)!,page);const touchedAt=performance.now(),old=pageFrame(sheets.get(admitted[0].id)!,admitted[0])!;
  art.trim();await waitUnloads();check(stats().residentBytes===peak.residentBytes,'Fresh pages were evicted');
  await new Promise(resolve=>setTimeout(resolve,10050));const idleMilliseconds=performance.now()-touchedAt;art.trim();await waitUnloads();const evicted=stats();check(evicted.residentPages===0&&evicted.pickingBytes===0,'Idle pressure did not release all pages');check(old.texture.destroyed,'Eviction kept old crop');
  check(pageFrame(sheets.get(admitted[0].id)!,admitted[0])===undefined,'Evicted page did not re-enter lazy state');await art.settle();const reloaded=pageFrame(sheets.get(admitted[0].id)!,admitted[0]);check(reloaded&&!reloaded.texture.destroyed&&reloaded!==old,'Evicted real page did not reload');
  const result={budget,peak,admitted:admitted.map(p=>p.url),idleMilliseconds,evicted,reloaded:stats()};await evictAll();return result;
 },
 async sharedActors(){
  await evictAll();const source=snapshot.entities.filter(e=>e.owner===snapshot.player&&e.type==='US.fighter'&&e.health>0).slice(0,2);check(source.length===2,'Actual Go view lacks two owned fighters');
  const before=JSON.stringify(source,(_,v)=>typeof v==='bigint'?v.toString():v);actors=source.map(e=>new ActorVisual(e,catalog,art,'US'));await Promise.all(actors.map(a=>a.ready));
  const sheet=sheets.get('unit.US.fighter')!;check(actors.every(a=>(a as any).sheet===sheet),'Actual actors did not share the same sheet');
  for(const [i,actor]of actors.entries()){actor.viewer=snapshot.player;const holder=new Container();holder.addChild(actor.root);app.stage.addChild(holder);actor.render(performance.now(),0x91b86c,true,'always',true);holder.position.set(450+i*650-actor.root.x,480-actor.root.y)}
  await art.settle();for(const actor of actors)actor.render(performance.now(),0x91b86c,true,'always',true);paint();
  const initial=stats(),textures=actors.flatMap(a=>liveTextures(a.root));check(textures.length>0&&textures.every(t=>!t.destroyed&&t.source),'Actual shared actors retained invalid textures');
  check(JSON.stringify(source,(_,v)=>typeof v==='bigint'?v.toString():v)===before,'Actor test changed authorized entity data');
  return {tick:snapshot.tick,viewer:snapshot.player,ids:source.map(e=>e.id),sameSheet:true,statistics:initial,textures,scope:'Two actual owner-authorized Go fighter entities; no fabricated private ammunition/owner state. No airlift actor lifecycle claim.'};
 },
 retireOne(){check(actors.length===2,'Shared actor pair required');const initial=stats(),retired=actors.shift()!;retired.dispose();actors[0].render(performance.now(),0x91b86c,true,'always',true);paint();check(stats().residentBytes===initial.residentBytes,'One actor disposed the shared sheet');check(liveTextures(actors[0].root).every(t=>!t.destroyed&&t.source),'Surviving actor lost textures');return {survivor:actors[0].id,statistics:stats()}},
 async invalid(){await evictAll();const sheet=sheets.get('unit.US.fighter')!,samples=[sheet.frame('beauty','nonexistent',0,0),sheet.frame('beauty','fly',99,0),sheet.frame('beauty','fly',0,-1),sheet.frame('beauty','fly',0,999),sheet.frame('nonexistent','fly',0,0)];check(samples.every(v=>v===undefined),'Invalid frame lookup returned art');check(await art.sheet('unit.not_a_real_asset')===undefined,'Unknown asset invented a sheet');await art.settle();check(stats().residentPages===0,'Invalid lookup requested PNGs');return {checks:samples.length+1,statistics:stats()}},
 async pendingStart(){await evictAll();pendingPage=plan.qualities[quality].pages[0];pendingSheet=sheets.get(pendingPage.id)!;check(!pageFrame(pendingSheet,pendingPage),'Pending frame was already resident');return {url:pendingPage.url,statistics:stats()}},
 beginRelease(){releasePromise=art.release();return {started:true}},
 async finishRelease(){await releasePromise;check(stats().residentPages===0&&stats().pickingBytes===0,'Pending release leaked texture/picking data');check(!pageFrame(pendingSheet!,pendingPage!),'Closed pending sheet returned a frame');return {statistics:stats(),staleFrame:false}},
 async failedLoad(){await evictAll();const page=plan.qualities[quality].pages[0],sheet=sheets.get(page.id)!;check(!pageFrame(sheet,page),'Failure probe must start lazy');await art.settle();check(!pageFrame(sheet,page),'Controlled failed PNG returned a texture');const internal=(sheet as any).pages.find((p:any)=>p.url===page.url);check(internal.failed&&!internal.texture&&!internal.alpha&&internal.frames.size===0,'Failed real page retained usable state');check(stats().residentPages===0&&stats().pickingBytes===0,'Failed page retained residency');return {url:page.url,failed:true,statistics:stats()}},
 async dispose(){if(!disposed){clear();await art.release();app.destroy(true,{children:true});disposed=true}return {statistics:stats(),canvases:document.querySelectorAll('canvas').length}},
};
Object.assign(window,{aircraftAtlasQA:qa});document.body.dataset.ready='true';
