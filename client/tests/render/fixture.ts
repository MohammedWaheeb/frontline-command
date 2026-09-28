import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import type {GameMap,PlayerSnapshot} from '../../src/runtime';

// Synthetic renderer acceptance geometry, not a shipping map or mission.
const map:GameMap={id:'render-fixture',title:'Renderer acceptance',author:'automated test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,
 tiles:Array.from({length:4096},()=>({terrain:'open',height:0})),
 spawns:[{position:{x:8000,y:8000}},{position:{x:56000,y:56000}}],shipment:{x:32000,y:32000},
 fields:[{id:1,position:{x:14000,y:8000},credits:36000000},{id:2,position:{x:49000,y:56000},credits:36000000}],
 stations:[{id:3,position:{x:32000,y:24000}}],objects:[{id:90,class:'light_prop',position:{x:18500,y:14500}}],required_packs:['2.0.0']};
const mission={id:'render-destruction',version:'1',title:'Renderer acceptance',map_id:map.id,faction:'US',mode:'tutorial',default_bases:true,
 players:[{id:1,faction:'US',name:'Observer',team:1,credits:6000000,controller:'human'},{id:2,faction:'IR',name:'Opponent',team:2,credits:6000000,controller:'script'}],
 initial:[{tag:'test-tank',type:'US.tank',owner:1,position:{x:17000,y:18500},count:1},{tag:'test-deployment',type:'SA.mobile_abm',owner:1,position:{x:15000,y:18000},count:1}],
 objectives:[{id:'timer',text:'Test duration',condition:{kind:'timer',tick:10000}}],triggers:[]};
const runtime=new OfflineTransport();await runtime.ready;await runtime.create({map,mission,seed:42,skip_countdown:true});
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),gestures:unknown[]=[],host=document.getElementById('field')!;
const renderer=await BattlefieldRenderer.create(host,{map,catalog,art,settings:DEFAULT_SETTINGS,onGesture:event=>gestures.push(event),onError:error=>console.error(error)});
let feedbackPeak=0;
runtime.subscribe(event=>{if(event.type==='snapshot'){renderer.setSnapshot(event.snapshot);feedbackPeak=Math.max(feedbackPeak,(renderer as unknown as {shake:{strength:number}}).shake.strength)}});
renderer.setSnapshot(runtime.current!);renderer.setSelection(runtime.current!.entities.filter(entity=>entity.owner===1&&['hq','US.rig'].includes(entity.type)).map(entity=>entity.id));
await renderer.whenAssetsReady();
const opening=await runtime.save();
let lastSnapshot:PlayerSnapshot=runtime.current!;
const qa={runtime,renderer,art,gestures,map,catalog,
 async buildingAnimation(){
  await runtime.create({map,mission:{...mission,id:'render-buildings',initial:[
   {tag:'test-power',type:'power',owner:1,position:{x:18000,y:15000},count:1},
   ...[18000,28000,38000].map((x,i)=>({tag:`test-factory-${i}`,type:'factory',owner:1,position:{x,y:8000},count:1}))
  ]},seed:42,skip_countdown:true});
  const power=runtime.current!.entities.find(e=>e.owner===1&&e.type==='power')!,hq=runtime.current!.entities.find(e=>e.owner===1&&e.type==='hq')!;
  const sample=async(id:number)=>{
   await renderer.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,100));await art.settle();
   const actor=(renderer as unknown as {actors:Map<number,{state:(now:number)=>{name:string;frames:number};frameIndex:(state:unknown,now:number)=>number;sheet:{sourceFrame:(state:string,direction:number,index:number)=>unknown}} >}).actors.get(id)!;
   const state=actor.state(performance.now()),frame=actor.frameIndex(state,performance.now());
   return {state:state.name,frames:state.frames,frame,source:actor.sheet.sourceFrame(state.name,0,frame),progress:runtime.current!.entities.find(e=>e.id===id)!.progress};
  };
  await runtime.sendOrders([{kind:'train',entities:[hq.id],type:'US.rig'}]);await runtime.step(2);const production=await sample(hq.id);
  await runtime.sendOrders([{kind:'power',entities:[power.id],index:0}]);await runtime.step(2);
  const lowpower=await sample(hq.id),disabled=await sample(power.id),economy=runtime.current!.economy!;
  await runtime.sendOrders([{kind:'power',entities:[power.id],index:1}]);await runtime.step(2);
  await runtime.sendOrders([{kind:'sell',entities:[power.id]}]);await runtime.step(51);const selling=await sample(power.id);
  renderer.center(power.position!);return {production,lowpower,disabled,selling,demand:economy.powerDemand,capacity:economy.powerCapacity};
 },
 async deploymentAnimation(){
  await qa.rewind();const id=runtime.current!.entities.find(entity=>entity.type==='SA.mobile_abm')!.id;
  const sample=async()=>{
   await renderer.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,120));await art.settle();
   const actor=(renderer as unknown as {actors:Map<number,{state:(now:number)=>{name:string;frames:number};frameIndex:(state:unknown,now:number)=>number;sheet:{sourceFrame:(state:string,direction:number,index:number)=>unknown}} >}).actors.get(id)!;
   const state=actor.state(performance.now()),frame=actor.frameIndex(state,performance.now()),entity=runtime.current!.entities.find(entity=>entity.id===id)!;
   return {state:state.name,frame,frames:state.frames,source:actor.sheet.sourceFrame(state.name,0,frame),progress:entity.progress,tick:runtime.current!.tick};
  };
  await runtime.sendOrders([{kind:'deploy',entities:[id]}]);await runtime.step(31);const deploy=await sample();await runtime.step(40);
  await runtime.sendOrders([{kind:'pack',entities:[id]}]);await runtime.step(21);const pack=await sample();return {deploy,pack};
 },
 async destroyObject(){
  const tank=runtime.current!.entities.find(entity=>entity.type==='US.tank')!,object=runtime.current!.entities.find(entity=>entity.type==='map.light_prop')!;
  if(!tank||!object)throw Error('visible real Go combat fixture missing');
  await runtime.sendOrders([{kind:'attack',entities:[tank.id],target:object.id}]);
  const shots:Array<{id:number;tick:number;cue:boolean;duplicateStable:boolean}>=[];
  for(let i=0;i<250&&!runtime.current!.rubble.includes(90);i++){
   await runtime.step(4);
   for(const event of runtime.current!.events){
    if(event.kind!=='weapon_fired'||event.entity!==tank.id||shots.some(shot=>shot.id===event.id))continue;
    const actor=(renderer as unknown as {actors:Map<number,{action?:{names:string[];at:number}}>}).actors.get(tank.id)!;
    const at=actor.action?.at;renderer.setSnapshot(runtime.current!);
    shots.push({id:event.id,tick:event.tick,cue:actor.action?.names.includes('fire')??false,duplicateStable:at===actor.action?.at});
   }
  }
  if(!runtime.current!.rubble.includes(90))throw Error('actual Go destruction not observed');
  lastSnapshot=runtime.current!;
  return {feedbackPeak,rubble:[...runtime.current!.rubble],tick:runtime.current!.tick,visibleObject:runtime.current!.entities.some(entity=>entity.id===object.id),shots};
 },
 async rewind(){feedbackPeak=0;await runtime.load(opening.data,opening.local_players);return {tick:runtime.current!.tick,rubble:[...runtime.current!.rubble]}},
 async feedbackAccessibility(){
  const results=[];
  for(const setting of [{reducedMotion:true},{reducedFlashing:true},{screenShake:0}]){
   await qa.rewind();renderer.updateSettings({...DEFAULT_SETTINGS,...setting});
   const result=await qa.destroyObject();results.push({setting,peak:result.feedbackPeak});
  }
  renderer.updateSettings(DEFAULT_SETTINGS);await qa.rewind();return results;
 },
 async repeatedDisposal(){
  renderer.dispose();await art.release();
  for(let i=0;i<4;i++){const next=await BattlefieldRenderer.create(host,{map,catalog,art,settings:DEFAULT_SETTINGS,onGesture:()=>{}});next.setSnapshot(lastSnapshot);await next.whenAssetsReady();next.dispose();await art.release();if(art.statistics.residentPages!==0)throw Error("scene retained sprite textures")}
  runtime.dispose();await art.release();return {canvases:host.querySelectorAll('canvas').length,art:art.statistics};
 },
 diagnostics(){
  // Test-only inspection verifies that known Go rubble, rather than global map
  // changes, reaches presentation and that rewind removes future knowledge.
  const internals=renderer as unknown as {presentationMap:GameMap;actors:Map<number,unknown>;deaths:unknown[]};
  return {art:art.statistics,tile:internals.presentationMap.tiles[14*64+18].terrain,sourceTile:map.tiles[14*64+18].terrain,actors:internals.actors.size,deaths:internals.deaths.length,missing:renderer.missingArt};
 }
};
(window as unknown as {qa:typeof qa}).qa=qa;
document.body.dataset.ready='true';
