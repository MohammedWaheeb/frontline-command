/** Prepared real native Session boundaries. Never changes a Go view, charge,
 * entity or visibility bit; only an actual current event can start a cue. */
import {Application,Container} from 'pixi.js';
import {fromBinary,toBinary,toJson} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {OfflineTransport} from '../../src/runtime/offline';
import {ArtLibrary,type SpriteSheet} from '../../src/render/art';
import {ActorVisual} from '../../src/render/actors';
import {BattlefieldRenderer} from '../../src/render/battlefield';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import type {GameMap,PlayerSnapshot,Entity} from '../../src/runtime';
type Quality='standard'|'high';type Viewer='owned'|'foreign';type Mode='load'|'seek'|'continuation';
type Point={stage:string;tick:number;hash:string;actor:number;charges:number;shot:boolean};
function check(v:unknown,m:string):asserts v{if(!v)throw Error(m)}
const sha=async(b:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b).buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');
const get=async(u:string)=>{const r=await fetch(u);check(r.ok,'Missing '+u);return new Uint8Array(await r.arrayBuffer())};
const parse=async(u:string)=>JSON.parse(new TextDecoder().decode(await get(u)));
const plan=await parse('/plan.json'),runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),errors:string[]=[];runtime.subscribe(e=>{if(e.type==='error')errors.push(e.error.message)});
const field=document.getElementById('field')!,label=document.getElementById('caption')!;
let art:ArtLibrary|undefined,renderer:BattlefieldRenderer|undefined,scenario='',quality:Quality='standard',disposed=false;
let contact:Application|undefined,probe:ActorVisual|undefined,probePoint:Point|undefined;
let finalArt:any;const actor=(id:number)=>((renderer as any).actors as Map<number,ActorVisual>).get(id)!;
async function releaseScene(){
 if(renderer){renderer.dispose();await(renderer as any).effectsReleased;renderer=undefined}
 probe?.dispose();probe=undefined;contact?.destroy(true,{children:true});contact=undefined;
 if(art){await art.dispose();finalArt={...art.statistics,generation:art.generationStatistics};check(finalArt.residentPages===0&&finalArt.pickingBytes===0,'Disposed atlas/picking bytes remain');art=undefined}
}
async function prepare(name:string,next:Quality){
 if(renderer&&scenario===name&&quality===next)return;
 await releaseScene();scenario=name;quality=next;art=new ArtLibrary();
 const map=await parse(`/native/${name}/map.json`) as GameMap;
 renderer=await BattlefieldRenderer.create(field,{map,catalog,art,settings:{...DEFAULT_SETTINGS,artQuality:quality,screenShake:0},onGesture:()=>{},onError:e=>errors.push(e.message)});(renderer as any).app.stop();
}
async function exact(point:Point,who:Viewer,mode:Mode,save?:Uint8Array){
 const snapshot=runtime.current!;check(snapshot.tick===point.tick,'Wrong authoritative boundary tick');check(await runtime.hash()===point.hash,'Native/WASM state hash mismatch');
 const delivery=plan.oracles[scenario][mode][point.stage][who],expected=fromBinary(PlayerSnapshotSchema,await get(delivery.url)),expectedSHA=await sha(toBinary(PlayerSnapshotSchema,expected)),actualSHA=await sha(toBinary(PlayerSnapshotSchema,snapshot));
 check(expectedSHA===delivery.wire_sha256,'Native Session oracle changed');
 if(actualSHA!==expectedSHA){(window as any).launcherWireMismatch={scenario,mode,stage:point.stage,who,actualSHA,expectedSHA,actual:toJson(PlayerSnapshotSchema,snapshot),expected:toJson(PlayerSnapshotSchema,expected)};throw Error('Native/WASM authorized Session wire differs')}
 const entity=snapshot.entities.find(e=>e.id===point.actor);check(entity,'Launcher absent from current authorized view');check(entity.type===plan.types[scenario],'Wrong public actor type');
 if(who==='foreign')check(!entity.private,'Foreign private fields leaked');else check(entity.private?.charges===point.charges,'Owned real charges differ');
 if(save)check(await sha((await runtime.save()).data)===await sha(save),'Load changed exact native save bytes');
 return snapshot;
}
async function load(point:Point,who:Viewer,mode:Mode){
 let prior:PlayerSnapshot|undefined;
 if(mode==='load'){const bytes=await get(`/native/${scenario}/${point.stage}.save.json`);await runtime.load(bytes,[1,2]);await runtime.pause();await runtime.setPerspective(who==='owned'?1:2);return {snapshot:await exact(point,who,mode,bytes),prior}}
 await runtime.loadReplay(await get(`/native/${scenario}/course.fcr`));await runtime.pause();
 await runtime.seekReplay(point.tick-(mode==='continuation'?1:0));await runtime.setPerspective(who==='owned'?1:2);
 if(mode==='continuation'){prior=runtime.current!;await runtime.step(1)}
 return {snapshot:await exact(point,who,mode),prior};
}
// Independent presentation contract. No call to the candidate pose helper.
function expectedPose(e:Entity,who:Viewer,shot:boolean,moving:boolean){
 let name=e.state==='deploying'?'deploy':e.state==='packing'?'pack':shot||e.state==='firing'?'fire':e.deployed?(who==='foreign'?'ready':e.private!.charges===0?'ready_empty':e.private!.charges===2?'ready_two_charges':'ready'):moving?'move':e.health<450?'damaged':'idle';
 if(who==='owned'){
  const charges=e.private!.charges;if(name==='fire'&&e.type==='IR.launcher'&&charges===1)return 'fire_charges_1';
  if(['idle','move','damaged','deploy','pack'].includes(name)&&(charges===0||e.type==='IR.launcher'&&charges===1))name+='_charges_'+charges;
 }
 return name;
}
async function painted(target:ActorVisual,pixi:Application,at:number){
 const inside=target as any,sheet=inside.sheet as SpriteSheet;check(sheet&&!target.standIn&&!target.missingArt&&!target.missingPayloadArt,'Required complete launcher art missing');
 const state=inside.state(at),frames=[];check(state,'No rendered state');
 for(const part of inside.parts)for(const layer of ['beauty','team']){
  const sprite=part[layer],pose=part.poses[layer];if(!sprite.visible)continue;check(pose,'Visible layer has no pose');
  const frame=sheet.frame(layer,pose.state,pose.direction,pose.frame);check(frame&&frame.texture===sprite.texture,'Stale or wrong pose texture');
  const pixels=pixi.renderer.extract.pixels(frame.texture),bytes=new Uint8Array(pixels.pixels);let alphaPixels=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])alphaPixels++;
  frames.push({layer,...pose,width:pixels.width,height:pixels.height,alphaPixels,pixelSHA256:await sha(bytes),source:sheet.sourceFrame(pose.state,pose.direction,pose.frame)});
 }
 check(frames.some(x=>x.layer==='beauty'&&x.alphaPixels>0),'No actual beauty pixels');
 return {state:state.name,frames,statistics:art!.statistics,body:target.paintedBodyBounds()};
}
async function renderPoint(point:Point,who:Viewer,mode:Mode,prior?:PlayerSnapshot){
 const snapshot=runtime.current!,entity=snapshot.entities.find(e=>e.id===point.actor)!;
 renderer!.resetFeedback();renderer!.setSnapshot(prior??snapshot);await renderer!.whenAssetsReady();renderer!.setSnapshot(snapshot);renderer!.setSelection([point.actor]);renderer!.center(entity.position!);await renderer!.whenAssetsReady();
 const a=actor(point.actor),moving=!!prior&&Math.hypot(entity.position!.x-prior.entities.find(e=>e.id===point.actor)!.position!.x,entity.position!.y-prior.entities.find(e=>e.id===point.actor)!.position!.y)>4;
 const shot=mode==='continuation'&&point.shot;if(shot)check(snapshot.events.some(e=>e.kind==='weapon_fired'&&e.entity===point.actor),'No actual Go shot for cue');
 let at=performance.now();if(shot)a.cue('weapon_fired',at,who==='owned');a.render(at,0x91b86c,true,'always',false);await art!.settle();at=performance.now();
 // Cue reset changes only the cosmetic clock after actual texture readiness.
 if(shot)a.cue('weapon_fired',at,who==='owned');a.render(at,0x91b86c,true,'always',false);(renderer as any).app.renderer.render({container:(renderer as any).app.stage});
 const result=await painted(a,(renderer as any).app,at),expected=expectedPose(entity,who,shot,moving);check(result.state===expected,`Expected ${expected}, got ${result.state}`);
 if(who==='foreign')check(!/_charges_|ready_empty|ready_two_charges/.test(result.state),'Foreign pixels reveal undisclosed charge count');
 if(['deploying','packing'].includes(entity.state))for(const f of result.frames){const state=((a as any).sheet as SpriteSheet).states.get(f.state)!;check(f.frame===Math.min(state.frames-1,Math.floor(entity.progress/1000*state.frames)),'Progress pose diverges from real Go progress')}
 return {...result,expected,moving,actualEventCue:shot};
}
const qa={
 async boundary(name:string,index:number,who:Viewer,next:Quality,mode:Mode){
  await prepare(name,next);const point=plan.courses[name][index] as Point;check(mode!=='continuation'||point.tick>0,'Cannot step before initial tick');
  const {snapshot,prior}=await load(point,who,mode),before=await sha(toBinary(PlayerSnapshotSchema,snapshot));const result=await renderPoint(point,who,mode,prior);
  check(before===await sha(toBinary(PlayerSnapshotSchema,snapshot)),'Renderer mutated authorized snapshot');label.textContent=`ACTUAL GO · ${name} · ${point.stage} · ${mode} · ${who} · ${next} · tick ${point.tick}`;
  return {scenario:name,stage:point.stage,tick:point.tick,hash:point.hash,viewer:snapshot.player,mode,...result};
 },
 async replay(name:string){
  scenario=name;await runtime.loadReplay(await get(`/native/${name}/course.fcr`));await runtime.pause();const records=[];
  for(const point of plan.courses[name] as Point[]){await runtime.seekReplay(point.tick);for(const who of ['owned','foreign'] as const){await runtime.setPerspective(who==='owned'?1:2);await exact(point,who,'seek');records.push({stage:point.stage,tick:point.tick,viewer:runtime.current!.player,hash:await runtime.hash()})}}
  return records;
 },
 async cull(id:number){
  const a=actor(id),point={...a.entity.position!},inside=a as any;check(a.root.visible,'Not initially visible');let calls=0;const original=inside.render;inside.render=function(...args:any[]){calls++;return original.apply(this,args)};
  const draw=()=>{(renderer as any).render();(renderer as any).app.renderer.render({container:(renderer as any).app.stage})};
  try{renderer!.center({x:63000,y:1000});await renderer!.whenAssetsReady();draw();check(!a.root.visible&&calls===0,'Offscreen actor rendered');const away={visible:a.root.visible,calls};renderer!.center(point);await renderer!.whenAssetsReady();draw();check(a.root.visible&&calls>0,'Actor did not reappear');return {away,returned:{visible:a.root.visible,calls}}}finally{inside.render=original}
 },
 async reduced(id:number){const a=actor(id),at=performance.now();a.render(at,0x91b86c,true,'always',true);const result=await painted(a,(renderer as any).app,at);check(!a.missingPayloadArt,'Reduced motion lost payload art');return result},
 async prepareDeferred(name:string,next:Quality){
  await releaseScene();scenario=name;quality=next;art=new ArtLibrary();art.configure(next);await art.init();
  const point=(plan.courses[name] as Point[]).find(p=>p.stage==='09-mobile-idle')!;check(point.charges===0,'Deferred case requires real empty mobile store');probePoint=point;
  await load(point,'foreign','load');contact=new Application();await contact.init({width:1600,height:900,resolution:1,background:0x191b14,antialias:false});contact.stop();field.appendChild(contact.canvas);
  probe=new ActorVisual(runtime.current!.entities.find(e=>e.id===point.actor)!,catalog,art,name.slice(0,2));probe.viewer=2;await probe.ready;const holder=new Container();holder.addChild(probe.root);contact.stage.addChild(holder);
  probe.render(performance.now(),0x91b86c,true,'always',false);await art.settle();probe.render(performance.now(),0x91b86c,true,'always',false);holder.position.set(800-probe.root.x,450-probe.root.y);contact.renderer.render({container:contact.stage});
  const result=await painted(probe,contact,performance.now());check(result.state==='idle','Foreign mobile actor must use generic idle');return result;
 },
 async startDeferred(){
  await runtime.setPerspective(1);await exact(probePoint!,'owned','load');probe!.viewer=1;probe!.clearFeedback();probe!.update(runtime.current!.entities.find(e=>e.id===probePoint!.actor)!,performance.now());probe!.render(performance.now(),0x91b86c,true,'always',false);
  const parts=(probe as any).parts;check(parts.every((p:any)=>!p.beauty.visible),'Pending empty page retained stale loaded body');contact!.renderer.render({container:contact!.stage});return {hiddenStaleBody:true};
 },
 async finishDeferred(){await art!.settle();probe!.render(performance.now(),0x91b86c,true,'always',false);contact!.renderer.render({container:contact!.stage});const result=await painted(probe!,contact!,performance.now());check(result.state==='idle_charges_0','Real empty page not displayed');return result},
 async dispose(){if(!disposed){await releaseScene();runtime.dispose();disposed=true}return {canvases:document.querySelectorAll('canvas').length,art:finalArt,errors}},
};
Object.assign(window,{launcherQA:qa});document.body.dataset.ready='true';
