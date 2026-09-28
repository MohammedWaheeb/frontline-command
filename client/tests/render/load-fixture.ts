import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import type {OrderIntent} from '../../src/runtime';
const opening=new Uint8Array(await (await fetch('/fixture/opening.json')).arrayBuffer());
const native=await (await fetch('/fixture/native.json')).json() as {ticks:number;initial_hash:string;final_hash:string;commands:Array<{tick:number;player:number;sequence:number;orders:OrderIntent[]}>};
const host=document.getElementById('field')!,errors:string[]=[],art=new ArtLibrary();
let runtime:OfflineTransport|undefined,renderer:BattlefieldRenderer|undefined;
const percentile=(values:number[],q:number)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))]??0;
async function run(index:number){
 runtime=new OfflineTransport();await runtime.ready;await runtime.load(opening,[1,2,3,4]);
 if(await runtime.hash()!==native.initial_hash)throw Error('Initial WASM/native state mismatch');
 const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),map=await runtime.map();
 renderer=await BattlefieldRenderer.create(host,{map,catalog,art,settings:DEFAULT_SETTINGS,onGesture:()=>{},onError:error=>errors.push(error.message)});
 runtime.subscribe(event=>{if(event.type==='snapshot')renderer?.setSnapshot(event.snapshot);if(event.type==='error')errors.push(event.error.message)});
 renderer.setSnapshot(runtime.current!);renderer.center({x:26000,y:28000});renderer.zoomBy(.6);await renderer.whenAssetsReady();
 const steps:number[]=[],frames:number[]=[],commandWork:number[]=[],visibleCounts:number[]=[];
 let measuring=true,lastFrame=performance.now(),frameID=0;
 const observe=(now:number)=>{if(measuring){frames.push(now-lastFrame);lastFrame=now;frameID=requestAnimationFrame(observe)}};frameID=requestAnimationFrame(observe);
 const begin=performance.now();
 for(let tick=0;tick<native.ticks;tick+=4){
  const requests=native.commands.filter(request=>request.tick===tick);
  if(requests.length){const t=performance.now();for(const request of requests){await runtime.setPerspective(request.player);const sequence=await runtime.sendOrders(request.orders);if(sequence!==request.sequence)throw Error(`Sequence mismatch ${sequence}/${request.sequence}`)}await runtime.setPerspective(1);commandWork.push(performance.now()-t)}
  const before=performance.now();await runtime.step(4);steps.push(performance.now()-before);visibleCounts.push(runtime.current!.entities.length);
  const deadline=begin+(tick+4)*50;await new Promise(resolve=>setTimeout(resolve,Math.max(0,deadline-performance.now())));
 }
 const elapsed=performance.now()-begin;measuring=false;cancelAnimationFrame(frameID);
 const hash=await runtime.hash();if(hash!==native.final_hash)throw Error(`Final WASM/native mismatch ${hash}/${native.final_hash}`);
 const saved=await runtime.save();await runtime.load(saved.data,saved.local_players);if(await runtime.hash()!==hash)throw Error('Maximum-load save restore mismatch');await renderer.whenAssetsReady();
 const internals=renderer as unknown as {actors:Map<number,unknown>;chunks:Map<string,unknown>;app:{renderer:{gl:WebGLRenderingContext}}};
 const gl=internals.app.renderer.gl,debug=gl.getExtension('WEBGL_debug_renderer_info');
 const graphics={vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):undefined};
 const summary={index,ticks:native.ticks,elapsedMs:elapsed,simulationRate:native.ticks/(elapsed/1000),graphics,stepBatch:4,roundtripMs:{p50:percentile(steps,.5),p95:percentile(steps,.95),p99:percentile(steps,.99),max:Math.max(...steps)},frameMs:{p50:percentile(frames,.5),p95:percentile(frames,.95),p99:percentile(frames,.99),over50:frames.filter(ms=>ms>50).length,total:frames.length},commandsMs:{p95:percentile(commandWork,.95),max:Math.max(...commandWork)},visibleEntities:{min:Math.min(...visibleCounts),max:Math.max(...visibleCounts)},renderedActors:internals.actors.size,terrainChunks:internals.chunks.size,art:art.statistics,missing:renderer.missingArt,hash,savedBytes:saved.data.byteLength,restored:true,errors:[...errors]};
 return summary;
}
async function dispose(){renderer?.dispose();renderer=undefined;runtime?.dispose();runtime=undefined;await art.release();return {canvases:host.querySelectorAll('canvas').length,art:art.statistics}}
Object.assign(window,{qa:{run,dispose}});document.body.dataset.ready='true';
