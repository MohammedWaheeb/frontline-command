import {toJson} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,EntitySchema,EventSchema} from '../../src/protocol/frontline_pb';
import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import type {OrderIntent} from '../../src/runtime';
import {AudioDirector} from '../../src/audio/director';
import type {AudioMixer} from '../../src/audio/mixer';

const runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),errors:string[]=[];
let renderer:BattlefieldRenderer|undefined,caseName='',settings={...DEFAULT_SETTINGS,screenShake:0},replay:Uint8Array|undefined;
const subscription=runtime.subscribe(event=>{if(event.type==='presentation-reset')renderer?.resetFeedback();if(event.type==='snapshot')renderer?.setSnapshot(event.snapshot);if(event.type==='error')errors.push(event.error.message)});
async function settled(){if(!renderer)return;await renderer.whenAssetsReady();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));(renderer as any).app.renderer.render({container:(renderer as any).app.stage})}
function report(){return {attachments:[...((renderer as any)?.actors.values()??[])].map((a:any)=>({id:a.id,attachment:a.muzzleAttachment(1)})),decorations:[...((renderer as any)?.combat.sprites??[])].map(([key,n]:any)=>({key,x:n.sprite.x,y:n.sprite.y,rotation:n.sprite.rotation,frame:n.frame,variant:n.variant})),caseName,tick:runtime.current?.tick,diagnostics:renderer?.combatDiagnostics,cues:structuredClone((renderer as any)?.combat.cues??[]),snapshot:runtime.current?toJson(PlayerSnapshotSchema,runtime.current):undefined}}
async function command(order:OrderIntent){const result=await runtime.previewOrders([order]);if(!result.results[0]?.accepted)throw Error('Command rejected by preview: '+JSON.stringify(result));await runtime.sendOrders([order]);await runtime.step(1);if(!runtime.current?.results.at(-1)?.accepted)throw Error('Command rejected in Go: '+JSON.stringify({order,results:runtime.current?.results}))}
async function load(name:string){
 if(renderer){renderer.dispose();await renderer.whenEffectsReleased();renderer=undefined;await art.release()}
 const bytes=new Uint8Array(await(await fetch('/fixtures/'+name+'.start.save.json')).arrayBuffer());
 await runtime.load(bytes,[1]);const map=await runtime.map();caseName=name;
 renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings,onGesture:()=>{},onError:error=>errors.push(error.message)});
 renderer.setSnapshot(runtime.current!);
 const center=name.includes('abm')?{x:10000,y:12000}:{x:18250,y:16000};renderer.center(center);await settled();return report();
}
async function tickUntil(kind:string,max=60){for(let i=0;i<max;i++){await runtime.step(1);await settled();if(report().cues.some((c:any)=>kind==='cover'?c.cover:c.kind===kind))return report()}throw Error(`No ${kind} cue in ${caseName} after ${max} ticks`)}
const qa={
 runtime,errors,report,load,
 async destruction(type:string){
  const map=await runtime.map();map.tiles=map.tiles.map(tile=>({...tile,height:0}));
  renderer!.dispose();await renderer!.whenEffectsReleased();renderer=undefined;await art.release();
  await runtime.create({map,ruleset:'practice-v1',players:[{id:1,name:'One',faction:'US',team:1,controller:'human'},{id:2,name:'Two',faction:'IR',team:2,controller:'human'}],seed:569,skip_countdown:true});
  renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings,onGesture:()=>{},onError:error=>errors.push(error.message)});renderer.setSnapshot(runtime.current!);caseName='practice-destruction-'+type;renderer.center({x:18000,y:18000});
  if(catalog.units.get(type)?.armor==='air')await command({kind:'practice_spawn',type:'airfield',target:1,position:{x:28000,y:18000},index:1});
  const existing=new Set(runtime.current!.entities.map(e=>e.id));
  await command({kind:'practice_spawn',type,target:1,position:{x:18000,y:18000},index:1});await settled();
  const actor=runtime.current!.entities.find(e=>e.type===type&&!existing.has(e.id));if(!actor)throw Error('Practice actor absent: '+type);
  const before=toJson(EntitySchema,actor),height=(renderer as any).actors.get(actor.id).visualAltitude(performance.now(),settings.reducedMotion);
  await command({kind:'practice_remove',target:actor.id});await settled();
  const cue=report().cues.find((c:any)=>c.kind==='destroyed');if(!cue)throw Error('Practice removal produced no Go destruction event');
  const event=runtime.current!.events.find(e=>e.kind==='destroyed'&&e.entity===actor.id);
  return {before,height,event:event?toJson(EventSchema,event):undefined,elevation:(renderer as any).combat.elevations.get(cue.key),...report()};
 },
 async deathEdge(on:boolean){
  // Original death ground origin is576worldpx high. At1600x900, this puts it
  //100px below the viewport while the upper large-plume pixels still intersect.
  renderer!.center(on?{x:812.5,y:812.5}:{x:18000,y:18000});await settled();return report();
 },
 async muzzle(){await command({kind:'attack',entities:[6],target:7});return tickUntil('muzzle')},
 async tank(){
  const map=await runtime.map();renderer!.dispose();await renderer!.whenEffectsReleased();renderer=undefined;await art.release();
  await runtime.create({map,ruleset:'practice-v1',players:[{id:1,name:'One',faction:'US',team:1,controller:'human'},{id:2,name:'Two',faction:'IR',team:2,controller:'human'}],seed:568,skip_countdown:true});
  renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings,onGesture:()=>{},onError:error=>errors.push(error.message)});renderer.setSnapshot(runtime.current!);caseName='tank-practice';renderer.center({x:18250,y:16000});
  await command({kind:'practice_spawn',type:'US.tank',target:1,position:{x:16000,y:16000},index:1});
  await command({kind:'practice_spawn',type:'IR.tank',target:2,position:{x:20500,y:16000},index:1});
  const source=runtime.current!.entities.find(e=>e.type==='US.tank')!,target=runtime.current!.entities.find(e=>e.type==='IR.tank')!;
  await command({kind:'attack',entities:[source.id],target:target.id});
  const samples=[];
  for(let i=0;i<100;i++){await runtime.step(1);await settled();const r=report();samples.push(r);if(r.decorations.some(d=>d.key.startsWith('projectile:')))return {samples,final:r}}
  throw Error('No oriented real cannon body in100ticks');
 },
 async variant(name:string){settings={...settings,artQuality:name==='low'?'standard':'high',reducedMotion:name==='reducedMotion'||name==='reduced',reducedFlashing:name==='reducedFlashing'||name==='reduced'};renderer!.updateSettings(settings);await settled();return report()},
 async attack(){await command({kind:'attack',entities:[6],target:7});return tickUntil('hit')},
 tickUntil,
 async advance(ticks:number){await runtime.step(ticks);await settled();return report()},
 async pause(){const before=report(),hash=await runtime.hash();await new Promise(resolve=>setTimeout(resolve,350));await settled();return {before,after:report(),hash,afterHash:await runtime.hash()}},
 async reduced(){settings={...settings,reducedMotion:true,reducedFlashing:true};renderer!.updateSettings(settings);await settled();return report()},
 async normal(){settings={...settings,reducedMotion:false,reducedFlashing:false};renderer!.updateSettings(settings);await settled();return report()},
 async raised(){
  const map=await runtime.map();map.id='combat-raised-course';map.title='Raised combat course';
  map.tiles=map.tiles.map((tile,index)=>{const x=index%map.width,y=Math.floor(index/map.width),raised=x>=13&&x<=23&&y>=12&&y<=20;return {...tile,height:raised?2:0,terrain:x===20&&y===16?'cover':raised&&(x===23||y===20)?'cliff':tile.terrain}});
  renderer!.dispose();await renderer!.whenEffectsReleased();renderer=undefined;await art.release();
  await runtime.create({map,ruleset:'practice-v1',players:[{id:1,name:'One',faction:'US',team:1,controller:'human'},{id:2,name:'Two',faction:'IR',team:2,controller:'human'}],seed:567,skip_countdown:true});
  renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings,onGesture:()=>{},onError:error=>errors.push(error.message)});renderer.setSnapshot(runtime.current!);caseName='raised-practice';renderer.center({x:18250,y:16000});
  await command({kind:'practice_spawn',type:'US.rifle',target:1,position:{x:16000,y:16000},index:1});
  await command({kind:'practice_spawn',type:'IR.rifle',target:2,position:{x:20500,y:16000},index:1});
  const source=runtime.current!.entities.find(e=>e.type==='US.rifle')!,target=runtime.current!.entities.find(e=>e.type==='IR.rifle')!;
  await command({kind:'attack',entities:[source.id],target:target.id});return tickUntil('cover');
 },
 async restore(){const save=await runtime.save(),before=report();await runtime.load(save.data,save.local_players);await settled();return {before,after:report(),saveHash:save.hash,hash:await runtime.hash()}},
 async replay(){const end=await runtime.save();replay=await runtime.exportReplay();const info=await runtime.loadReplay(replay);await settled();const opening=report();await runtime.seekReplay(end.tick);await settled();return {start:info.replay_start,end:end.tick,opening,atEnd:report(),hash:await runtime.hash(),savedHash:end.hash}},
 async seek(tick:number){await runtime.seekReplay(tick);await settled();return report()},
 async cull(){renderer!.center({x:59000,y:59000});await settled();const far=report();renderer!.center({x:18250,y:16000});await settled();return {far,returned:report()}},
 async deathReset(){
  await load('ordinary');
  // Keep an ordinary owned sight provider near the fight so this lifecycle
  // course also works on the earlier candidate without owner-loss disclosure.
  await command({kind:'move',entities:[2],position:{x:16000,y:22000}});
  await command({kind:'attack',entities:[6],target:7});
  for(let i=0;i<400&&(renderer as any).deaths.length===0;i+=4){await runtime.step(4);await settled()}
  const corpses=(renderer as any).deaths.length;if(!corpses)throw Error('No visible ordinary combat death within400ticks: '+JSON.stringify(report()));
  const deathTick=runtime.current!.tick;await runtime.step(4);const save=await runtime.save(),recording=await runtime.exportReplay();
  await runtime.load(save.data,save.local_players);await settled();const afterLoad=(renderer as any).deaths.length,restored=await runtime.hash();
  await runtime.loadReplay(recording);await runtime.seekReplay(deathTick-4);await runtime.step(4);await settled();const replayCorpses=(renderer as any).deaths.length;
  await runtime.seekReplay(deathTick+4);await settled();return {deathTick,corpses,afterLoad,restored,saveHash:save.hash,replayCorpses,afterForwardSeek:(renderer as any).deaths.length};
 },
 async ownerCasualty(){
  await load('ordinary');
  // The production director receives actual authorized WASM snapshots. The
  // recording mixer checks event/caption dispatch; it is not listening QA.
  const calls:Array<{id:string;options?:unknown}>=[];
  const mixer={play:(id:string,options?:unknown)=>calls.push({id,options}),music:()=>{},continuous:()=>{},caption:()=>{},reset:()=>{},stopTransient:()=>{},clearCaptions:()=>{},afterSpeech:()=>{},manifest:undefined} as unknown as AudioMixer;
  const director=new AudioDirector(mixer,()=>catalog);director.snapshot(runtime.current!);
  const unsubscribe=runtime.subscribe(event=>{if(event.type==='presentation-reset')director.discontinuity();if(event.type==='snapshot')director.snapshot(event.snapshot)});
  try{
   await command({kind:'attack',entities:[6],target:7});
   for(let i=0;i<400&&!runtime.current!.events.some(e=>e.kind==='destroyed'&&e.owner===1);i++)await runtime.step(1);
   await settled();const snapshot=runtime.current!,lost=snapshot.events.find(e=>e.kind==='destroyed'&&e.owner===1);
   if(!lost?.position)throw Error('Missing ordinary last-sight owner casualty');
   const map=await runtime.map(),index=Math.floor(lost.position.y/1000)*map.width+Math.floor(lost.position.x/1000),visible=!!snapshot.visible[index];
   const after=report(),beforeDuplicate=calls.length;director.snapshot(snapshot);const afterDuplicate=calls.length;
   const save=await runtime.save();await runtime.load(save.data,save.local_players);await settled();
   return {tick:snapshot.tick,lost:{id:lost.id,kind:lost.kind,entity:lost.entity,owner:lost.owner,position:lost.position,combat:'combat' in lost?lost.combat:undefined},visible,after,corpses:(renderer as any).deaths.length,calls,beforeDuplicate,afterDuplicate,saveHash:save.hash,restoredHash:await runtime.hash()};
  }finally{unsubscribe();director.dispose()}
 },
 async context(){
  const r=renderer as any,gl=r.app.renderer.gl as WebGLRenderingContext,extension=gl?.getExtension('WEBGL_lose_context');if(!extension)throw Error('Context-loss extension unavailable');
  extension.loseContext();await new Promise(resolve=>setTimeout(resolve,120));extension.restoreContext();await new Promise(resolve=>setTimeout(resolve,250));await settled();return report();
 },
 async dispose(){subscription();const r=renderer!;r.dispose();await r.whenEffectsReleased();runtime.dispose();await art.release();return {canvases:document.querySelectorAll('canvas').length,combat:r.combatDiagnostics,art:art.statistics,errors}},
};
Object.assign(window,{combatQA:qa});await load('ordinary');document.body.dataset.ready='true';
