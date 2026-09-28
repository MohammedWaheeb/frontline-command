import {BattlefieldRenderer} from '../../client/src/render/battlefield';
import {ArtLibrary} from '../../client/src/render/art';
import {CatalogIndex,type Catalog} from '../../client/src/content/catalog';
import {DEFAULT_SETTINGS} from '../../client/src/app/settings';
import {OfflineTransport} from '../../client/src/runtime/offline';
import type {OrderIntent} from '../../client/src/runtime';

const opening=new Uint8Array(await (await fetch('/fixture/opening.json')).arrayBuffer());
const native=await (await fetch('/fixture/native.json')).json() as {
 ticks:number;initial_hash:string;final_hash:string;
 commands:Array<{tick:number;player:number;sequence:number;orders:OrderIntent[]}>;
 frames:Array<{tick:number;hash:string;entities:number;projectiles:number;events:number}>;
};
const host=document.getElementById('field')!,errors:string[]=[],art=new ArtLibrary();
let runtime:OfflineTransport|undefined,renderer:BattlefieldRenderer|undefined;
let boundary=0,segment=-1;
const percentile=(values:number[],q:number)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))]??0;
const distribution=(v:number[])=>({p50:percentile(v,.5),p95:percentile(v,.95),p99:percentile(v,.99),max:Math.max(0,...v)});
async function run(index:number){
 segment=index;boundary=0;
 runtime=new OfflineTransport();await runtime.ready;await runtime.load(opening,[1,2,3,4]);
 if(await runtime.hash()!==native.initial_hash)throw Error('Initial WASM/native state mismatch');
 const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),map=await runtime.map();
 renderer=await BattlefieldRenderer.create(host,{map,catalog,art,settings:DEFAULT_SETTINGS,onGesture:()=>{},onError:e=>errors.push(e.message)});
 const updates:number[]=[];let commanding=false;
 runtime.subscribe(event=>{
  if(event.type==='error')errors.push(event.error.message);
  // Four local commanders issue genuine orders. Their temporary perspective
  // changes are test plumbing, never foreign frames shown in player one's view.
  if(event.type==='snapshot'&&!commanding&&event.snapshot.player===1){
   const t=performance.now();renderer!.setSnapshot(event.snapshot);updates.push(performance.now()-t);
  }
 });
 renderer.setSnapshot(runtime.current!);renderer.center({x:16000,y:16000});renderer.zoomBy(.6);await renderer.whenAssetsReady();
 const steps:number[]=[],frames:number[]=[],commands:number[]=[],observations:unknown[]=[],events=new Map<number,{kind:string;tick:number}>();
 let measuring=true,lastFrame=performance.now(),frameID=0,sent=0;
 const observe=(now:number)=>{if(measuring){frames.push(now-lastFrame);lastFrame=now;frameID=requestAnimationFrame(observe)}};
 frameID=requestAnimationFrame(observe);
 const begin=performance.now();
 try{
  for(let tick=0;tick<native.ticks;tick+=4){
   const requests=native.commands.filter(request=>request.tick===tick);
   if(requests.length){
    const t=performance.now();commanding=true;
    try{for(const request of requests){
     await runtime.setPerspective(request.player);
     const sequence=await runtime.sendOrders(request.orders);
     if(sequence!==request.sequence)throw Error(`Sequence mismatch ${sequence}/${request.sequence}`);sent++;
    }await runtime.setPerspective(1)}finally{commanding=false}
    commands.push(performance.now()-t);
   }
   const before=performance.now();await runtime.step(4);steps.push(performance.now()-before);
   const current=runtime.current!,expected=native.frames[tick/4];boundary=current.tick;
   if(current.tick!==expected.tick||current.entities.length!==expected.entities||current.projectiles.length!==expected.projectiles||current.events.length!==expected.events)
    throw Error(`Owner boundary differs from native at ${current.tick}`);
   for(const event of current.events)events.set(event.id,{kind:event.kind,tick:event.tick});
   observations.push({tick:current.tick,entities:current.entities.length,projectiles:current.projectiles.length,events:current.events.length,
     combat:renderer.combatDiagnostics,tactical:renderer.tacticalDiagnostics});
   const deadline=begin+(tick+4)*50;await new Promise(resolve=>setTimeout(resolve,Math.max(0,deadline-performance.now())));
  }
 }finally{measuring=false;cancelAnimationFrame(frameID)}
 const elapsed=performance.now()-begin;
 if(sent!==72)throw Error(`Wrong batch count ${sent}`);
 const hash=await runtime.hash();if(hash!==native.final_hash)throw Error(`Final WASM/native mismatch ${hash}/${native.final_hash}`);
 const saved=await runtime.save();renderer.resetFeedback();await runtime.load(saved.data,saved.local_players);
 if(await runtime.hash()!==hash)throw Error('Combined-load save restore mismatch');
 await renderer.whenAssetsReady();
 if(renderer.combatDiagnostics.cues!==0)throw Error('Save restore replayed buffered combat cues');
 const internals=renderer as unknown as {app:{renderer:{gl:WebGLRenderingContext}}};
 const gl=internals.app.renderer.gl,debug=gl.getExtension('WEBGL_debug_renderer_info');
 return {index,ticks:native.ticks,sent,hash,savedBytes:saved.data.byteLength,restored:true,elapsedMs:elapsed,
  simulationRate:native.ticks/(elapsed/1000),withinDiagnosticBudget:elapsed<=native.ticks*50+50,
  scope:'Shared-host functional combined course; no quiet timing or complete-art acceptance.',
  graphics:{vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):undefined},
  stepsMs:distribution(steps),frameMs:{...distribution(frames),over50:frames.filter(v=>v>50).length,count:frames.length},
  commandMs:distribution(commands),snapshotUpdatesMs:{...distribution(updates),count:updates.length},
  ownerEvents:[...events.entries()].map(([id,event])=>({id,...event})),observations,
  art:art.statistics,missing:renderer.missingArt,errors:[...errors]};
}
async function dispose(){
 const old=renderer;old?.dispose();renderer=undefined;runtime?.dispose();runtime=undefined;
 await old?.whenEffectsReleased();await art.release();
 return {canvases:host.querySelectorAll('canvas').length,art:art.statistics,fx:old?.combatDiagnostics};
}
Object.assign(window,{qa:{run,dispose,get progress(){return {segment,boundary}}}});
document.body.dataset.ready='true';
