import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import {tacticalPresentation} from '../../src/app/tactical-presentation';
import type {Faction,GameMap,OrderIntent,Point,SaveData} from '../../src/runtime';

// Explicit practice setup through recorded Go orders. Subsequent launches,
// spending, visibility, charging, transit and service remain ordinary Go rules.
// This is presentation acceptance, not a paid build-order or balance claim.
const map:GameMap={id:'tactical-overlay-fixture',title:'Synthetic tactical warning course',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,tiles:Array.from({length:4096},(_,i)=>({terrain:'open',height:i%64>=29&&i%64<=37&&Math.floor(i/64)>=24&&Math.floor(i/64)<=32?2:0})),spawns:[{position:{x:8000,y:8000}},{position:{x:56000,y:56000}}],shipment:{x:45000,y:36000},fields:[{id:1,position:{x:14000,y:8000},credits:36000000},{id:2,position:{x:49000,y:56000},credits:36000000}],required_packs:['2.0.0']};
const runtime=new OfflineTransport();await runtime.ready;const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),errors:string[]=[];
const renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings:{...DEFAULT_SETTINGS,screenShake:0},onGesture:e=>{if(e.kind==='click')gestures.push(e)},onError:e=>errors.push(e.message)});
const radar=document.getElementById('radar') as HTMLCanvasElement,gestures:unknown[]=[],receipts:unknown[]=[];
let selected:number[]=[],frozen:SaveData|undefined,liveReplay:Uint8Array|undefined,restoredReplay:Uint8Array|undefined,replayStage='',variant='',subscription=runtime.subscribe(event=>{if(event.type==='snapshot'){renderer.setSnapshot(event.snapshot);renderer.renderMinimap(radar)}if(event.type==='error')errors.push(event.error.message);if(event.type==='order-result')receipts.push(event.result)});
const out=()=>{const s=runtime.current!;return {tick:s.tick,player:s.player,version:runtime.version,model:tacticalPresentation(s,catalog,selected),diagnostics:renderer.tacticalDiagnostics,visibleEnemies:s.entities.filter(e=>e.owner!==0&&e.owner!==s.player).map(e=>e.id),labels:document.querySelectorAll('canvas').length,credits:s.economy?.credits.toString(),errors:[...errors]}};
async function settle(){renderer.renderMinimap(radar);await renderer.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,80));renderer.renderMinimap(radar)}
async function command(order:OrderIntent){const preview=await runtime.previewOrders([order]);if(!preview.results[0]?.accepted)throw Error(`Rejected ${JSON.stringify(order)}: ${JSON.stringify(preview)}`);await runtime.sendOrders([order]);await runtime.step(2)}
async function step(ticks:number){for(let left=ticks;left>0;left-=Math.min(100,left))await runtime.step(Math.min(100,left))}
async function waitFor(predicate:()=>boolean,limit=5000){for(let count=0;count<limit&&!predicate();count+=20)await runtime.step(20);if(!predicate())throw Error(`Condition expired in ${variant} at ${runtime.current!.tick}`)}
const owned=(type:string)=>runtime.current!.entities.filter(e=>e.owner===runtime.current!.player&&e.type===type);
async function spawn(type:string,x:number,y:number,owner=1){await command({kind:'practice_spawn',type,target:owner,index:1,position:{x,y}})}
async function prepare(faction:Faction){
 variant=faction;selected=[];renderer.setSelection([]);
 await runtime.create({map,ruleset:'practice-v1',players:[{id:1,name:'Overlay commander',faction,team:1,controller:'human'},{id:2,name:'Hidden opponent',faction:'US',team:2,controller:'human'}],seed:4201,skip_countdown:true});
 await command({kind:'practice_resources',target:1,index:100000});
 for(const x of [5000,10000,15000,20000,25000,30000])await spawn('power',x,44000);
 for(const [type,x,y] of [['barracks',22000,8000],['factory',24000,14000],['radar',29000,8000],['tech',33000,14000],['strategic',42000,14000]] as const)await spawn(type,x,y);
 await spawn(`${faction}.recon`,36500,28500);
 await command({kind:'hold',entities:owned(`${faction}.recon`).map(e=>e.id)});
 if(faction==='IR'){await spawn('IR.launcher',14500,24000);await command({kind:'deploy',entities:owned('IR.launcher').map(e=>e.id)})}
 if(faction==='SY'){await spawn('SY.safehouse',27500,24500);await spawn('SY.safehouse',40500,29500);await spawn('SY.rifle',24500,24500)}
 if(faction==='SA'){await spawn('SA.mobile_abm',32500,28500);await command({kind:'deploy',entities:owned('SA.mobile_abm').map(e=>e.id)})}
 await waitFor(()=>runtime.current!.players.find(p=>p.id===1)!.strategicProgress===1000);
 renderer.center({x:32500,y:28500});await settle();return out();
}
const points=[{x:32000,y:28000},{x:33500,y:28000},{x:32000,y:29500}];
const qa={runtime,renderer,errors,receipts,gestures,map,
 async prepare(faction:Faction){return prepare(faction)},
 async volley(){const launch=owned('IR.launcher')[0];selected=[launch.id];renderer.setSelection(selected);const before=runtime.current!.economy!.credits;await command({kind:'ability',type:'volley',entities:[launch.id],points:points.slice(0,2)});frozen=await runtime.save();liveReplay=await runtime.exportReplay();await settle();return {...out(),spent:(before-runtime.current!.economy!.credits).toString(),hash:frozen.hash}},
 async unknownEnemy(){const enemy=owned('IR.launcher')[0]?.id;await runtime.setPerspective(2);selected=enemy?[enemy]:[];renderer.setSelection(selected);const revealed=out();let foreign:unknown;if(enemy){try{foreign=await runtime.previewOrders([{kind:'move',entities:[enemy],position:{x:18000,y:18000}}])}catch(error){foreign={rejected:true,code:(error as {code?:string}).code}}}await step(152);renderer.center(points[0]);await settle();return {...out(),foreign,enemy,revealed}},
 async restoreVolley(){if(!frozen)throw Error('No volley checkpoint');await runtime.load(frozen.data,frozen.local_players);await runtime.setPerspective(1);selected=owned('IR.launcher').map(e=>e.id);renderer.setSelection(selected);await settle();return {...out(),hash:await runtime.hash(),expectedHash:frozen.hash}},
 async advance(ticks:number){await step(ticks);await settle();return out()},
 async cacheProof(){const before=renderer.tacticalDiagnostics;await new Promise(resolve=>setTimeout(resolve,250));const after=renderer.tacticalDiagnostics;return {before,after}},
 async pauseProof(){await runtime.pause();const before=out(),hash=await runtime.hash();await new Promise(resolve=>setTimeout(resolve,400));return {before,after:out(),hash,afterHash:await runtime.hash()}},
 async replayProof(){
  if(!frozen||!liveReplay)throw Error('No frozen volley');
  await runtime.load(frozen.data,frozen.local_players);await runtime.setPerspective(1);const restoredStart=runtime.current!.tick;await step(12);const restoredEnd=runtime.current!.tick,restoredHash=await runtime.hash();restoredReplay=await runtime.exportReplay();
  let restoredFailure:unknown,resumed:unknown;try{replayStage='load-restored-export';const info=await runtime.loadReplay(restoredReplay);replayStage='seek-restored-export-start';await runtime.seekReplay(info.replay_start);const startModel=out().model;replayStage='seek-restored-export-end';await runtime.seekReplay(info.replay_end);resumed={info,restoredStart,restoredEnd,startModel,endModel:out().model,hash:await runtime.hash(),expectedHash:restoredHash}}catch(error){restoredFailure={stage:replayStage,error:String(error)}}
  try{replayStage='load-live-export';await runtime.loadReplay(liveReplay);replayStage='seek-live-export';await runtime.seekReplay(frozen.tick);await runtime.setPerspective(1);await settle();const end={...out(),hash:await runtime.hash()};replayStage='rewind-live-export';await runtime.seekReplay(0);await settle();const start=out();replayStage='forward-live-export';await runtime.seekReplay(frozen.tick);await settle();return {restoredFailure,resumed,end,start,again:{...out(),hash:await runtime.hash()},expectedHash:frozen.hash,bytes:liveReplay.length}}catch(error){return {restoredFailure,failed:{stage:replayStage,error:String(error)}}}
 },
 exportArtifacts(){return {save:frozen?Array.from(frozen.data):[],live:liveReplay?Array.from(liveReplay):[],restored:restoredReplay?Array.from(restoredReplay):[],stage:replayStage}},

 async salvo(){await qa.restoreVolley();await step(220);const site=owned('strategic')[0],before=runtime.current!.economy!.credits;await command({kind:'ability',type:'strategic',entities:[site.id],points});await settle();return {...out(),spent:(before-runtime.current!.economy!.credits).toString()}},
 async scan(){const hq=owned('hq')[0];await command({kind:'ability',type:'recon_sweep',entities:[hq.id],position:points[0]});await settle();return out()},
 async skybreaker(){await command({kind:'ability',type:'strategic',entities:owned('strategic').map(e=>e.id),points,index:0});await settle();return out()},
 async shield(){const before=runtime.current!.economy!.credits;await command({kind:'ability',type:'strategic',entities:owned('SA.mobile_abm').map(e=>e.id)});await settle();return {...out(),spent:(before-runtime.current!.economy!.credits).toString()}},
 async raid(){const before=runtime.current!.economy!.credits;await command({kind:'ability',type:'strategic',entities:owned('SY.safehouse').map(e=>e.id)});renderer.center({x:33500,y:27000});await settle();return {...out(),spent:(before-runtime.current!.economy!.credits).toString()}},
 async transfer(){await step(245);const houses=owned('SY.safehouse'),rifle=owned('SY.rifle').find(e=>!e.private?.container&&e.private?.missionOrigin==='')!;await command({kind:'board',entities:[rifle.id],target:houses[0].id});await waitFor(()=>!!owned('SY.safehouse')[0].private?.passengers.length,800);await command({kind:'ability',type:'transfer',entities:[houses[0].id],target:houses[1].id});await step(61);renderer.center(houses[1].position!);await settle();return out()},
 async orders(){await prepare('US');const recon=owned('US.recon')[0],hq=owned('hq')[0];selected=[recon.id,hq.id];renderer.setSelection(selected);await command({kind:'move',entities:[recon.id],position:{x:32500,y:32500}});await command({kind:'attack_move',entities:[recon.id],position:{x:28000,y:32500},queued:true});await command({kind:'patrol',entities:[recon.id],points:[{x:28000,y:32500},{x:28000,y:38000}],position:{x:28000,y:38000},queued:true});await command({kind:'rally',entities:[hq.id],position:{x:28000,y:28000}});await command({kind:'ping',position:points[0],type:'danger'});renderer.center({x:30500,y:31500});await settle();return out()},
 async reduced(){const before=out();renderer.updateSettings({...DEFAULT_SETTINGS,reducedMotion:true,reducedFlashing:true,screenShake:0,palette:'cvd_safe'});await settle();return {before,after:out()}},
 async endgame(){variant='endgame';selected=[];renderer.setSelection([]);await runtime.create({map,ruleset:'practice-v1',players:[{id:1,name:'Overlay commander',faction:'US',team:1,controller:'human'},{id:2,name:'Hidden opponent',faction:'IR',team:2,controller:'human'}],seed:4201,skip_countdown:true});await step(Math.max(0,42000-runtime.current!.tick));renderer.center({x:56000,y:56000});await settle();return {...out(),snapshotIndicators:runtime.current!.indicators,foreignBuildings:runtime.current!.entities.filter(e=>e.owner===2),foreignExplored:runtime.current!.explored[56*64+56]}},
 async dispose(){subscription();renderer.dispose();runtime.dispose();await art.release();return {canvases:document.querySelectorAll('#field canvas').length,art:art.statistics,diagnostics:renderer.tacticalDiagnostics,errors}},
};
Object.assign(window,{qa});document.getElementById('pause')!.addEventListener('click',()=>runtime.pause());document.getElementById('step')!.addEventListener('click',()=>qa.advance(10));document.body.dataset.ready='true';
