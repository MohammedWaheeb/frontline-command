/** Actual Go saved-state boundaries + frozen production renderer/art. No world,
 * ammunition, owner, visibility or asset mutation. Browser qualification is
 * earned only when the separately owned runner executes this course. */
import {Application,Container} from 'pixi.js';
import {fromJson,toBinary,toJson} from '@bufbuild/protobuf';
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
let contact:Application|undefined,probe:ActorVisual|undefined,probePoint:Point|undefined;
const field=document.getElementById('field')!,label=document.getElementById('caption')!;
const actor=()=>((renderer as any).actors as Map<number,ActorVisual>).get(runtime.current!.entities.find(e=>e.type===sceneType&&e.owner===1)!.id)!;
const render=()=>{(renderer as any).render();(renderer as any).app.renderer.render({container:(renderer as any).app.stage})};
async function releaseScene(){
 if(renderer){renderer.dispose();await(renderer as any).effectsReleased;renderer=undefined}
 if(probe){probe.dispose();probe=undefined}
 if(contact){contact.destroy(true,{children:true});contact=undefined}
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
 const expected=fromJson(PlayerSnapshotSchema,delivery.view);
 check(await sha(toBinary(PlayerSnapshotSchema,expected))===delivery.wire_sha256,'Native delivery oracle bytes changed');
 const actualSHA=await sha(toBinary(PlayerSnapshotSchema,snapshot)),expectedSHA=await sha(toBinary(PlayerSnapshotSchema,expected));
 if(actualSHA!==expectedSHA){(window as any).payloadWireMismatch={mode,stage:point.stage,tick:point.tick,who,actualSHA,expectedSHA,actual:toJson(PlayerSnapshotSchema,snapshot),expected:toJson(PlayerSnapshotSchema,expected)};throw Error('Native/WASM authorized wire differs')}
 const entity=snapshot.entities.find(e=>e.id===point.actor);check(entity,'Aircraft not currently visible');
 if(who==='foreign')check(!entity.private,'Foreign private payload leaked');else check(!!entity.private,'Owner private payload absent');
 if(save){const current=await runtime.save();check(await sha(current.data)===await sha(save),'Restored save bytes differ')}
 return snapshot;
}
async function load(type:string,index:number,who:'owned'|'foreign'){
 const point=plan.courses[type][index] as Point;
 if(point.stage==='02-final-round'){
  // Actual replay execution earns the shot at this tick. Loading/seek installs
  // no historical feedback; choose the perspective BEFORE the ordinary Step.
  await runtime.loadReplay(await get(`/native/${type}/course.fcr`));await runtime.pause();
  await runtime.seekReplay(point.tick-1);await runtime.setPerspective(who==='owned'?1:2);
  await runtime.step(1);
  return {point,snapshot:await exact(point,who,'continuation')};
 }
 const save=await get(`/native/${type}/${point.stage}.save.json`);
 await runtime.load(save,[1,2]);await runtime.pause();await runtime.setPerspective(who==='owned'?1:2);
 return {point,snapshot:await exact(point,who,'load',save)};
}
async function painted(target:ActorVisual,pixi:any,at:number){
 const internal=target as any,sheet=internal.sheet as SpriteSheet;check(sheet&&!target.standIn&&!target.missingArt&&!target.missingPayloadArt,'Required aircraft art is incomplete');
 const state=internal.state(at);check(state,'No actual displayed state');const frames=[];
 for(const part of internal.parts)for(const layer of ['beauty','team']){
  const sprite=part[layer],pose=part.poses[layer];if(!sprite.visible)continue;
  check(pose,'Visible layer lacks a pose');const frame=sheet.frame(layer,pose.state,pose.direction,pose.frame);check(frame&&frame.texture===sprite.texture,'Displayed texture is not its current pose');
  const pixels=pixi.renderer.extract.pixels(frame.texture),bytes=new Uint8Array(pixels.pixels);let alpha=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])alpha++;
  frames.push({layer,...pose,width:pixels.width,height:pixels.height,alphaPixels:alpha,pixelSHA256:await sha(bytes),source:sheet.sourceFrame(pose.state,pose.direction,pose.frame)});
 }
 check(frames.some(f=>f.layer==='beauty'&&f.alphaPixels>0),'Actual beauty pixels absent');
 return {state:state.name,frames,statistics:art!.statistics,body:target.paintedBodyBounds()};
}
async function renderPoint(point:Point,who:'owned'|'foreign'){
 renderer!.resetFeedback();renderer!.setSnapshot(runtime.current!);renderer!.setSelection([point.actor]);renderer!.center(runtime.current!.entities.find(e=>e.id===point.actor)!.position!);
 await renderer!.whenAssetsReady();const a=actor();
 // The event is a real current Go shot. Replaying its short cosmetic cue after
 // the atlas settles makes the screenshot independent of PNG decode latency.
 const shot=runtime.current!.events.find(e=>e.kind==='weapon_fired'&&e.entity===point.actor);
 let at=performance.now();if(point.stage==='02-final-round'){check(shot,'Real shot missing from authorized view');a.cue(shot.kind,at,who==='owned');a.render(at,0x91b86c,true,'always',false);await art!.settle();at=performance.now();a.cue(shot.kind,at,who==='owned')}
 a.render(at,0x91b86c,true,'always',false);(renderer as any).app.renderer.render({container:(renderer as any).app.stage});
 const result=await painted(a,(renderer as any).app,at),empty=result.state==='empty'||result.state.endsWith('_empty');
 if(who==='owned')check(empty===(point.stage!=='01-initial-one-round'&&point.stage!=='10-refilled'),'Owned payload appearance disagrees with actual ammunition');
 else check(!empty,'Foreign appearance inferred private ammunition');
 if(point.stage==='02-final-round')check(result.state===(who==='owned'?'fire_empty':'fire'),'Final shot did not use correct actual payload cue');
 return result;
}
const qa={
 async boundary(type:string,index:number,who:'owned'|'foreign',next:Quality){
  await prepare(type,next);const {point,snapshot}=await load(type,index,who),before=await sha(toBinary(PlayerSnapshotSchema,snapshot));
  const result=await renderPoint(point,who);check(before===await sha(toBinary(PlayerSnapshotSchema,snapshot)),'Renderer mutated authorized facts');
  label.textContent=`REAL GO BOUNDARY · ${type} · ${point.stage} · ${who} · ${next} · tick ${point.tick}`;
  return {type,stage:point.stage,tick:point.tick,hash:point.hash,viewer:snapshot.player,...result};
 },
 async replay(type:string){
  await runtime.loadReplay(await get(`/native/${type}/course.fcr`));await runtime.pause();const records=[];
  for(const point of plan.courses[type] as Point[]){await runtime.seekReplay(point.tick);for(const who of ['owned','foreign'] as const){await runtime.setPerspective(who==='owned'?1:2);await exact(point,who,'seek');records.push({stage:point.stage,tick:point.tick,viewer:runtime.current!.player,hash:await runtime.hash()})}}
  return records;
 },
 async cull(){
  const a=actor(),point={...a.entity.position!},internal=a as any;check(a.root.visible,'Cull begins without visible aircraft');let calls=0;const original=internal.render;
  internal.render=function(...args:any[]){calls++;return original.apply(this,args)};
  try{renderer!.center({x:63000,y:1000});await renderer!.whenAssetsReady();render();check(!a.root.visible&&calls===0,'Offscreen aircraft still rendered');const away={visible:a.root.visible,renderCalls:calls};renderer!.center(point);await renderer!.whenAssetsReady();render();check(a.root.visible&&calls>0,'Aircraft did not return after real viewport cull');return {away,returned:{visible:a.root.visible,renderCalls:calls,paint:await painted(a,(renderer as any).app,performance.now())}}}
  finally{internal.render=original}
 },
 async prepareDeferred(type:string,next:Quality){
  await releaseScene();sceneType=type;quality=next;art=new ArtLibrary();art.configure(next);await art.init();
  const {point}=await load(type,4,'foreign');probePoint=point;
  contact=new Application();await contact.init({width:1600,height:900,resolution:1,background:0x191b14,antialias:false});contact.stop();field.appendChild(contact.canvas);
  probe=new ActorVisual(runtime.current!.entities.find(e=>e.id===point.actor)!,catalog,art,type.slice(0,2));probe.viewer=2;await probe.ready;
  const holder=new Container();holder.addChild(probe.root);contact.stage.addChild(holder);
  probe.render(performance.now(),0x91b86c,true,'always',false);await art.settle();probe.render(performance.now(),0x91b86c,true,'always',false);holder.position.set(800-probe.root.x,450-probe.root.y);contact.renderer.render({container:contact.stage});
  const result=await painted(probe,contact,performance.now());check(result.state==='rearm','Foreign disabled-service fixture did not show generic service');return result;
 },
 async startDeferred(){
  await runtime.setPerspective(1);await exact(probePoint!,'owned');probe!.viewer=1;probe!.clearFeedback();probe!.update(runtime.current!.entities.find(e=>e.id===probePoint!.actor)!,performance.now());probe!.render(performance.now(),0x91b86c,true,'always',false);
  const parts=(probe as any).parts;check(parts.every((p:any)=>!p.beauty.visible),'Pending empty page retained loaded body');contact!.renderer.render({container:contact!.stage});return {hiddenLoadedBody:true,statistics:art!.statistics};
 },
 async finishDeferred(){
  await art!.settle();probe!.render(performance.now(),0x91b86c,true,'always',false);contact!.renderer.render({container:contact!.stage});const result=await painted(probe!,contact,performance.now());check(result.state==='rearm_empty','Empty service page failed to replace foreign generic body');
  const sheet=(probe as any).sheet as SpriteSheet,direction=(probe as any).parts[0].poses.beauty.direction,pair=[];
  for(const state of ['rearm','rearm_empty'])sheet.frame('beauty',state,direction,0);await art!.settle();
  for(const state of ['rearm','rearm_empty']){const frame=sheet.frame('beauty',state,direction,0);check(frame,'Payload pair frame absent');const pixels=contact!.renderer.extract.pixels(frame.texture);pair.push({state,direction,index:0,width:pixels.width,height:pixels.height,pixelSHA256:await sha(new Uint8Array(pixels.pixels))})}
  check(pair[0].pixelSHA256!==pair[1].pixelSHA256,'Full authored loaded/empty service pixels are identical');
  return {...result,sameDirectionAndFramePayloadPair:pair};
 },
 async dispose(){if(!disposed){await releaseScene();runtime.dispose();disposed=true}return {canvases:document.querySelectorAll('canvas').length,art:art?.statistics??{residentPages:0,residentBytes:0,pickingBytes:0},errors}},
};
Object.assign(window,{payloadFullQA:qa});document.body.dataset.ready='true';
