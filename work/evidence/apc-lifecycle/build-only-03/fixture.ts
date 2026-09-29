/** Actual Go saved-state boundaries + frozen production renderer/art. No world,
 * transport contents, owner, visibility or asset mutation. Browser qualification is
 * earned only when the separately owned runner executes this course. */
import {fromBinary,toBinary,toJson} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {OfflineTransport} from '../../src/runtime/offline';
import {ArtLibrary,type SpriteSheet} from '../../src/render/art';
import {ActorVisual} from '../../src/render/actors';
import {BattlefieldRenderer} from '../../src/render/battlefield';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import type {GameMap} from '../../src/runtime';

type Quality='standard'|'high';
type Point={stage:string;tick:number;hash:string;actor:number;owned:any;foreign:any};
function check(value:unknown,message:string):asserts value{if(!value)throw Error(message)}
const sha=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
const get=async(url:string)=>{const r=await fetch(url);check(r.ok,'Missing '+url);return new Uint8Array(await r.arrayBuffer())};
const parse=async(url:string)=>JSON.parse(new TextDecoder().decode(await get(url)));
const plan=await parse('/plan.json'),runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),errors:string[]=[];
runtime.subscribe(event=>{if(event.type==='error')errors.push(event.error.message)});
let art:ArtLibrary|undefined,renderer:BattlefieldRenderer|undefined,sceneType='',quality:Quality='standard',disposed=false;
const field=document.getElementById('field')!,label=document.getElementById('caption')!;
const actor=()=>((renderer as any).actors as Map<number,ActorVisual>).get(runtime.current!.entities.find(e=>e.type==='SY.apc'&&e.owner===1)!.id)!;
const render=()=>{(renderer as any).render();(renderer as any).app.renderer.render({container:(renderer as any).app.stage})};
async function releaseScene(){
 if(renderer){renderer.dispose();await(renderer as any).effectsReleased;renderer=undefined}
 if(art){await art.release();check(art.statistics.residentPages===0&&art.statistics.pickingBytes===0,'Scene kept atlas/picking bytes');art=undefined}
}
async function prepare(type:string,next:Quality){
 if(renderer&&sceneType===type&&quality===next)return;
 await releaseScene();sceneType=type;quality=next;art=new ArtLibrary();
 const map=await parse(`/native/${type}/map.json`) as GameMap;
 renderer=await BattlefieldRenderer.create(field,{map,catalog,art,settings:{...DEFAULT_SETTINGS,artQuality:quality,screenShake:0},onGesture:()=>{},onError:e=>errors.push(e.message)});
 (renderer as any).app.stop();
}
async function exact(point:Point,who:'owned'|'foreign',mode:'load'|'seek'|'continuation'='load',save?:Uint8Array){
 const snapshot=runtime.current!;check(snapshot.tick===point.tick,'Wrong WASM boundary tick');
 check(await runtime.hash()===point.hash,'Native/WASM state hash differs');
 const delivery=plan.oracles[sceneType][mode][point.stage][who];
 const expected=fromBinary(PlayerSnapshotSchema,await get(`/oracle/${sceneType}/${mode}-${point.stage}-${who}.pb`));
 check(await sha(toBinary(PlayerSnapshotSchema,expected))===delivery.wire_sha256,'Native delivery oracle bytes changed');
 const actualSHA=await sha(toBinary(PlayerSnapshotSchema,snapshot)),expectedSHA=await sha(toBinary(PlayerSnapshotSchema,expected));
 if(actualSHA!==expectedSHA){(window as any).apcWireMismatch={mode,stage:point.stage,tick:point.tick,who,actualSHA,expectedSHA,actual:toJson(PlayerSnapshotSchema,snapshot),expected:toJson(PlayerSnapshotSchema,expected)};throw Error('Native/WASM authorized wire differs')}
 const entity=snapshot.entities.find(e=>e.id===point.actor);check(entity,'APC not currently visible');
 if(who==='foreign')check(!entity.private,'Foreign private transport data leaked');else check(!!entity.private,'Owner private transport data absent');
 if(save){const current=await runtime.save();check(await sha(current.data)===await sha(save),'Restored save bytes differ')}
 return snapshot;
}
async function load(type:string,index:number,who:'owned'|'foreign'){
 const point=plan.courses[type][index] as Point;
 if(point.tick>0){
  // Actual replay execution earns current feedback and motion at this tick. Loading/seek installs
  // no historical feedback; choose the perspective BEFORE the ordinary Step.
  await runtime.loadReplay(await get(`/native/${type}/course.fcr`));await runtime.pause();
  await runtime.seekReplay(point.tick-1);await runtime.setPerspective(who==='owned'?1:2);
  const previous=runtime.current!;await runtime.step(1);
  return {point,previous,snapshot:await exact(point,who,'continuation')};
 }
 const save=await get(`/native/${type}/${point.stage}.save.json`);
 await runtime.load(save,[1,2]);await runtime.pause();await runtime.setPerspective(who==='owned'?1:2);
 return {point,snapshot:await exact(point,who,'load',save)};
}
async function painted(target:ActorVisual,pixi:any,at:number){
 const internal=target as any,sheet=internal.sheet as SpriteSheet;check(sheet&&!target.standIn&&!target.missingArt&&!target.missingPayloadArt,'Required APC art is incomplete');
 const state=internal.state(at);check(state,'No actual displayed state');const frames=[];
 for(const part of [...internal.parts,...(internal.turret?[internal.turret]:[])])for(const layer of ['beauty','team']){
  const sprite=part[layer],pose=part.poses[layer];if(!sprite.visible)continue;
  check(pose,'Visible layer lacks a pose');const frame=sheet.frame(layer,pose.state,pose.direction,pose.frame);check(frame&&frame.texture===sprite.texture,'Displayed texture is not its current pose');
  const pixels=pixi.renderer.extract.pixels(frame.texture),bytes=new Uint8Array(pixels.pixels);let alpha=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])alpha++;
  frames.push({layer,...pose,width:pixels.width,height:pixels.height,alphaPixels:alpha,pixelSHA256:await sha(bytes),source:sheet.sourceFrame(pose.state,pose.direction,pose.frame)});
 }
 check(frames.some(f=>f.layer==='beauty'&&f.alphaPixels>0),'Actual beauty pixels absent');
 return {state:state.name,frames,statistics:art!.statistics,body:target.paintedBodyBounds()};
}
async function renderPoint(point:Point,who:'owned'|'foreign',previous?:any){
 renderer!.resetFeedback();if(previous)renderer!.setSnapshot(previous);renderer!.setSnapshot(runtime.current!);renderer!.setSelection([point.actor]);renderer!.center(runtime.current!.entities.find(e=>e.id===point.actor)!.position!);
 await renderer!.whenAssetsReady();const a=actor(),at=performance.now();a.render(at,0x91b86c,true,'always',false);await art!.settle();a.render(at,0x91b86c,true,'always',false);(renderer as any).app.renderer.render({container:(renderer as any).app.stage});
 const result=await painted(a,(renderer as any).app,at);
 if(who==='foreign')check(!a.receivingBoarder,'Foreign receiver inferred owner-private boarding');
 if(sceneType==='ordinary'){
  if(['02-boarding-open','03-boarding-midpoint','10-reboard-open'].includes(point.stage)){check(a.receivingBoarder===(who==='owned'),'Board receiver permission differs');check(result.state===(who==='owned'?'doors_open':'idle'),'Receiver body pose differs from authorized boarding')}
  if(['07-unload-open','08-last-unload-tick'].includes(point.stage))check(result.state==='doors_open','Public unloading did not open doors');
  if(point.stage==='05-loaded-moving')check(result.state==='move','Actual adjacent moving frames did not animate travel');
  if(['01-closed','04-loaded-closed','09-unloaded-closed'].includes(point.stage))check(result.state==='idle','Closed APC did not display idle hull');
  if(point.stage==='14-damaged-closed')check(result.state==='damaged','Actual damaged idle APC did not display damaged hull');
 }
 if(sceneType==='blocked'&&['02-unload-start','03-blocked-exit','04-blocked-wait'].includes(point.stage))check(result.state==='doors_open','Blocked ordinary unload did not keep public doors open');
 return {...result,receiver:a.receivingBoarder,publicState:a.entity.state,health:a.entity.health};
}
const qa={
 async boundary(type:string,index:number,who:'owned'|'foreign',next:Quality){
  await prepare(type,next);const loaded=await load(type,index,who),{point,snapshot}=loaded,before=await sha(toBinary(PlayerSnapshotSchema,snapshot));
  const result=await renderPoint(point,who,'previous' in loaded?loaded.previous:undefined);check(before===await sha(toBinary(PlayerSnapshotSchema,snapshot)),'Renderer mutated authorized facts');
  label.textContent=`REAL GO APC · ${type} · ${point.stage} · ${who} · ${next} · tick ${point.tick}`;
  return {type,stage:point.stage,tick:point.tick,hash:point.hash,viewer:snapshot.player,...result};
 },
 async replay(type:string){
  const records=[];for(const point of plan.courses[type] as Point[])for(const who of ['owned','foreign'] as const){
   const save=await get(`/native/${type}/${point.stage}.save.json`);await runtime.load(save,[1,2]);await runtime.pause();await runtime.setPerspective(who==='owned'?1:2);await exact(point,who,'load',save);
   await runtime.loadReplay(await get(`/native/${type}/course.fcr`));await runtime.pause();await runtime.seekReplay(point.tick);await runtime.setPerspective(who==='owned'?1:2);await exact(point,who,'seek');records.push({stage:point.stage,tick:point.tick,viewer:runtime.current!.player,hash:await runtime.hash()});
  }return records;
 },
 async pause(){const before={hash:await runtime.hash(),tick:runtime.current!.tick};await runtime.pause();await new Promise(resolve=>setTimeout(resolve,150));const after={hash:await runtime.hash(),tick:runtime.current!.tick};check(before.hash===after.hash&&before.tick===after.tick,'Paused actual Go state advanced');return {before,after,scope:'Simulation pause; cosmetic animations intentionally may continue'}},
 async cull(){
  const a=actor(),point={...a.entity.position!},internal=a as any;check(a.root.visible,'Cull begins without visible APC');let calls=0;const original=internal.render;internal.render=function(...args:any[]){calls++;return original.apply(this,args)};
  try{renderer!.center({x:63000,y:1000});await renderer!.whenAssetsReady();render();check(!a.root.visible&&calls===0,'Offscreen APC still rendered');const away={visible:a.root.visible,renderCalls:calls};renderer!.center(point);await renderer!.whenAssetsReady();render();check(a.root.visible&&calls>0,'APC did not return after viewport cull');return {away,returned:{visible:a.root.visible,renderCalls:calls,paint:await painted(a,(renderer as any).app,performance.now())}}}finally{internal.render=original}
 },
 async dispose(){if(!disposed){await releaseScene();runtime.dispose();disposed=true}return {canvases:document.querySelectorAll('canvas').length,art:art?.statistics??{residentPages:0,residentBytes:0,pickingBytes:0},errors}},
};
Object.assign(window,{apcLifecycleQA:qa});document.body.dataset.ready='true';
