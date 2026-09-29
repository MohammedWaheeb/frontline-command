import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import {actorStatus} from '../../src/app/actor-status';
import {AudioDirector} from '../../src/audio/director';
import type {AudioMixer} from '../../src/audio/mixer';
import type {GameMap,OrderIntent} from '../../src/runtime';
import {aircraftServiceCourse} from './aircraft-service-course.mjs';

const map=await fetch('/course-map.json').then(r=>r.json()) as GameMap,mission=await fetch('/course-mission.json').then(r=>r.json());
const runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),errors:string[]=[],audioCalls:Array<{id:string;options?:unknown}>=[];
// This recorder exercises the real AudioDirector selection, not speaker output.
// No claim about decoded/playable announcer assets is made by this course.
const mixer={play:(id:string,options?:unknown)=>audioCalls.push({id,options}),music:()=>{},continuous:()=>{},caption:()=>{},reset:()=>{}} as unknown as AudioMixer;
const audio=new AudioDirector(mixer,()=>catalog);
const renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings:{...DEFAULT_SETTINGS,screenShake:0},onGesture:()=>{},onError:e=>errors.push(e.message)});
const subscription=runtime.subscribe(event=>{
 if(event.type==='snapshot'){renderer.setSnapshot(event.snapshot);audio.snapshot(event.snapshot)}
 if(event.type==='presentation-reset'){renderer.resetFeedback();audio.discontinuity()}
 if(event.type==='error')errors.push(event.error.message);
});
let stage:any,continueStage:(()=>void)|undefined,done=false,failure:string|undefined,caseNumber=0,audioStart=0;
const cases:Record<string,unknown>={},receipts:unknown[]=[];
const replays=new Map<string,Uint8Array>(),saves=new Map<string,{data:Uint8Array;local_players:number[]}>();
const settle=async()=>{await renderer.whenAssetsReady();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))};
const status=()=>runtime.current!.entities.map(entity=>({id:entity.id,type:entity.type,owner:entity.owner,state:entity.state,position:entity.position,status:actorStatus(entity,runtime.current!,catalog)}));
const visual=()=>[...((renderer as any).actors as Map<number,any>).values()].filter(a=>a.root.visible&&a.statusOverlay?.root.visible).map(a=>({id:a.id,...a.statusOverlay.diagnostics,text:a.statusOverlay.labels.filter((n:any)=>n.root.visible).map((n:any)=>n.text.text),bounds:(()=>{const b=a.statusOverlay.root.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height}})()}));
async function focus(id:number){const e=runtime.current!.entities.find(e=>e.id===id);if(!e?.position)throw Error('Current actor absent');renderer.setSelection([id]);renderer.center(e.position);await settle();return {visual:visual(),models:status().filter(e=>e.id===id)}}
const driver={
 get current(){return runtime.current!},
 async create(config:any){audio.operation(`service-course-${++caseNumber}`);await runtime.create(config);await runtime.pause()},
 async step(n:number){for(let left=n;left>0;left-=Math.min(left,100))await runtime.step(Math.min(left,100))},
 async orders(orders:OrderIntent[]){const preview=await runtime.previewOrders(orders);if(!preview.results.every(r=>r.accepted))throw Error(JSON.stringify(preview));const sequence=await runtime.sendOrders(orders);await runtime.step(1);const results=runtime.current!.results.filter(r=>r.sequence===sequence);receipts.push({sequence,orders,results});if(results.length!==orders.length||!results.every(r=>r.accepted))throw Error(JSON.stringify(results))},
 async finishCase(name:string){const replay=await runtime.exportReplay();replays.set(name,replay);saves.set(name,await runtime.save());cases[name]={tick:runtime.current!.tick,hash:await runtime.hash(),replayBytes:replay.byteLength}},
};
const qa={
 async start(){try{await aircraftServiceCourse(driver,{map,mission,onStage:async(value?:any)=>{
   if(!value)throw Error('The command course did not supply a stage.');
   await focus(value.ids[0]);stage={...value,hash:await runtime.hash(),models:status(),visual:visual(),audio:audioCalls.slice(audioStart)};audioStart=audioCalls.length;
   document.getElementById('caption')!.textContent=`Aircraft service course · ${value.name} · tick ${value.tick}`;
   await new Promise<void>(resolve=>continueStage=resolve);
  }});done=true}catch(error){failure=String((error as Error).stack??error);done=true}},
 read:()=>({stage,done,failure,cases,errors}),
 next(){stage=undefined;const resume=continueStage;continueStage=undefined;resume?.()},
 focus,
 async paused(){const hash=await runtime.hash(),before=status();await new Promise(resolve=>setTimeout(resolve,250));return {hash,afterHash:await runtime.hash(),before,after:status()}},
 async reduced(){const before=status();renderer.updateSettings({...DEFAULT_SETTINGS,reducedMotion:true,reducedFlashing:true,screenShake:0,palette:'cvd_safe'});await settle();return {before,after:status(),visual:visual()}},
 async saveRestore(){const saved=await runtime.save(),before=status();await runtime.load(saved.data,saved.local_players);await runtime.pause();await settle();return {before,after:status(),hash:saved.hash,restoredHash:await runtime.hash()}},
 async replay(name:string,tick:number){const bytes=replays.get(name);if(!bytes)throw Error('Replay not recorded');await runtime.loadReplay(bytes);await runtime.pause();await runtime.seekReplay(tick);await settle();return {tick:runtime.current!.tick,hash:await runtime.hash(),models:status()}},
 async restore(name:string){const saved=saves.get(name);if(!saved)throw Error('Save not recorded');await runtime.load(saved.data,saved.local_players);await runtime.pause();await settle();return {tick:runtime.current!.tick,hash:await runtime.hash(),models:status()}},
 async cull(id:number){const before=visual();renderer.center({x:map.width*1000-1000,y:1000});await settle();const away=visual();await focus(id);return {before,away,after:visual()}},
 async dispose(){subscription();renderer.dispose();runtime.dispose();audio.dispose();await art.release();return {canvases:document.querySelectorAll('canvas').length,art:art.statistics,errors,receipts:receipts.length}},
};
Object.assign(window,{serviceQA:qa});document.body.dataset.ready='true';
