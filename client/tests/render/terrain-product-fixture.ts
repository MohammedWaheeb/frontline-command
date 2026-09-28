import {Rectangle,type Application} from 'pixi.js';
import {BattlefieldRenderer,type BattlefieldGesture} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import {TerrainSurface} from '../../src/render/terrain-surface';
import type {Entity,GameMap,OrderIntent,Point} from '../../src/runtime';
import type {ActorVisual} from '../../src/render/actors';
// Synthetic geometry: real Go admission, orders, production, visibility and saves.
// No authored mission or engine state is patched to obtain a result.
const syntheticMap:GameMap={id:'height-product-fixture',title:'Height integration acceptance',author:'automated test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,
 tiles:Array.from({length:4096},(_,i)=>{const x=i%64,y=Math.floor(i/64);return {terrain:x>=30&&x<=33&&y>=20&&y<=25?'cliff':'open',height:x>=30&&x<=33&&y>=20&&y<=25?4:x>=12&&x<=26&&y>=12&&y<=26?(x>=20?3:2):0}}),
 spawns:[{position:{x:16000,y:16000}},{position:{x:54000,y:54000}}],shipment:{x:32000,y:42000},
 fields:[{id:1,position:{x:34000,y:10000},credits:36000000},{id:2,position:{x:48000,y:54000},credits:36000000}],stations:[],objects:[],required_packs:['2.0.0']};
const authored=new URL(location.href).searchParams.has('authored');
const map:GameMap=authored?await (await fetch('/content/maps/us-04-broken-umbrella-layout.json')).json():syntheticMap;
const syntheticMission={id:'height-integration',version:'1',title:'Height integration acceptance',map_id:map.id,faction:'US',mode:'tutorial',default_bases:true,
 players:[{id:1,faction:'US',name:'Height observer',team:1,credits:6000000,controller:'human'},{id:2,faction:'IR',name:'Hidden opponent',team:2,credits:6000000,controller:'script'}],
 initial:[{tag:'service',type:'IR.drone_hub',owner:1,position:{x:24500,y:14500},count:1},{tag:'mixed-foundation',type:'power',owner:1,position:{x:20500,y:19500},count:1},{tag:'moving-tank',type:'US.tank',owner:1,position:{x:11500,y:23500},count:1},{tag:'moving-squad',type:'US.rifle',owner:1,position:{x:15500,y:25500},count:1},{tag:'flying-probe',type:'IR.strike',owner:1,position:{x:24500,y:19500},count:1}],
 objectives:[{id:'timer',text:'Renderer test duration',condition:{kind:'timer',tick:100000}}],triggers:[]};
const mission=authored?await (await fetch('/content/missions/us-04-broken-umbrella.json')).json():syntheticMission;
const runtime=new OfflineTransport();await runtime.ready;await runtime.create({map,mission,seed:73,skip_countdown:true});
const surface=new TerrainSurface(map),catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),gestures:BattlefieldGesture[]=[],errors:string[]=[];
const renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings:{...DEFAULT_SETTINGS,edgeScroll:false,screenShake:0},onGesture:event=>gestures.push(event),onError:error=>errors.push(error.message)});
runtime.subscribe(event=>{if(event.type==='snapshot')renderer.setSnapshot(event.snapshot);if(event.type==='error')errors.push(event.error.message)});renderer.setSnapshot(runtime.current!);renderer.center({x:19500,y:21000});await renderer.whenAssetsReady();
const internals=renderer as unknown as {actors:Map<number,ActorVisual>;chunks:Map<string,unknown>;point:(point:Point)=>Point;project:(point:Point)=>Point;hit:(point:Point)=>unknown;app:Application};
const opening=await runtime.save();
function describe(entity:Entity){const actor=internals.actors.get(entity.id)!,p=actor.position(performance.now()),ground=actor.groundAnchor(performance.now());return {id:entity.id,type:entity.type,position:entity.position,ground,expectedGround:surface.projectGround(p),level:surface.sampleGround(p),depth:actor.groundDepth(performance.now()),altitude:actor.visualAltitude(performance.now()),bounds:renderer.bounds(entity),screen:internals.project(p),shadow:actor.terrainShadow?{x:actor.terrainShadow.x,y:actor.terrainShadow.y,z:actor.terrainShadow.zIndex}:undefined}}
async function command(order:OrderIntent){const preview=await runtime.previewOrders([order]);if(!preview.results[0]?.accepted)throw Error(`Rejected ${JSON.stringify(order)}: ${JSON.stringify(preview)}`);await runtime.sendOrders([order]);await runtime.step(2);return preview}
function bodyPixels(id:number){const actor=internals.actors.get(id)!,box=renderer.bounds(actor.entity)!;internals.app.render();const frame=new Rectangle(Math.floor(box.left-30),Math.floor(box.top-30),Math.ceil(box.right-box.left+60),Math.ceil(box.bottom-box.top+60)),pixels=()=>internals.app.renderer.extract.pixels({target:internals.app.stage,frame}).pixels;const before=Uint8Array.from(pixels());actor.root.visible=false;internals.app.render();const after=pixels();actor.root.visible=true;internals.app.render();let changed=0;for(let i=0;i<before.length;i+=4)if(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2])changed++;return changed}
async function settle(){await new Promise(resolve=>setTimeout(resolve,80));await renderer.whenAssetsReady()}
const qa={map,gestures,errors,
 async inspect(){await settle();return {info:await runtime.info(),version:runtime.version,tick:runtime.current!.tick,entities:runtime.current!.entities.filter(e=>e.owner===1&&!e.private?.container).map(describe),chunks:internals.chunks.size,unknownEntities:runtime.current!.entities.filter(e=>e.owner===2).length}},
 point(p:Point){return {world:p,screen:internals.project(p),level:surface.sampleGround(p)}},
 async foundation(){const entity=runtime.current!.entities.find(e=>e.type==='power')!,support=surface.footprintSurface(entity.position!,entity.footprintWidth,entity.footprintHeight);return {actor:describe(entity),support}},
 async move(){const tank=runtime.current!.entities.find(e=>e.type==='US.tank')!,before=describe(tank),destination={x:24500,y:25000};await command({kind:'move',entities:[tank.id],position:destination});const samples=[];for(let n=0;n<120;n++){await runtime.step(4);await settle();const e=runtime.current!.entities.find(e=>e.id===tank.id)!;samples.push(describe(e));if(Math.hypot(e.position!.x-destination.x,e.position!.y-destination.y)<600)break}const after=describe(runtime.current!.entities.find(e=>e.id===tank.id)!);return {before,destination,after,samples}},
 async build(){const rig=runtime.current!.entities.find(e=>e.type==='US.rig')!,before=runtime.current!.economy!.credits.toString(),position={x:20500,y:26500};renderer.setPlacement({type:'power',width:3,height:3,position,valid:true});const preview=await command({kind:'build',entities:[rig.id],type:'power',position});for(let n=0;n<300&&!runtime.current!.entities.some(e=>e.type==='power'&&e.position?.x===position.x&&e.complete);n++)await runtime.step(4);await settle();const entity=runtime.current!.entities.find(e=>e.type==='power'&&e.position?.x===position.x);if(!entity?.complete)throw Error('Paid construction did not finish: '+JSON.stringify({entities:runtime.current!.entities.filter(e=>e.owner===1).map(e=>({type:e.type,position:e.position,state:e.state,progress:e.progress,orders:e.private?.orders})),results:runtime.current!.results},(_,v)=>typeof v==='bigint'?v.toString():v));return {before,after:runtime.current!.economy!.credits.toString(),preview,actor:describe(entity)}},
 async authoredLanding(){const wing=runtime.current!.entities.find(e=>e.private?.missionOrigin==='initial:38')!,home=runtime.current!.entities.find(e=>e.private?.missionOrigin==='initial:36')!;if(!wing||!home)throw Error('US04 authored wing/base missing');await command({kind:'return',entities:[wing.id],target:home.id});for(let n=0;n<900;n++){await runtime.step(4);const e=runtime.current!.entities.find(e=>e.id===wing.id)!;if(e.landed&&e.state==='landed')break}await new Promise(resolve=>setTimeout(resolve,750));renderer.center(home.position!);await settle();const e=runtime.current!.entities.find(e=>e.id===wing.id)!;if(!e.landed)throw Error('US04 landing failed');return {aircraft:describe(e),home:describe(home),bodyPixels:bodyPixels(e.id),tick:runtime.current!.tick}},
 async flight(){
  const id=runtime.current!.entities.find(e=>e.type==='IR.strike')!.id;await command({kind:'return',entities:[id]});
  for(let n=0;n<700&&!runtime.current!.entities.find(e=>e.id===id)?.landed;n++)await runtime.step(4);
  if(!runtime.current!.entities.find(e=>e.id===id)?.landed)throw Error('Aircraft did not land on raised service base');
  await new Promise(resolve=>setTimeout(resolve,750));await settle();const landed=describe(runtime.current!.entities.find(e=>e.id===id)!);
  for(let n=0;n<700&&runtime.current!.entities.find(e=>e.id===id)?.state==='servicing';n++)await runtime.step(4);
  const beforeDeparture=describe(runtime.current!.entities.find(e=>e.id===id)!);await command({kind:'move',entities:[id],position:{x:9500,y:25500}});const departure=describe(runtime.current!.entities.find(e=>e.id===id)!);await new Promise(resolve=>setTimeout(resolve,750));await settle();
  const samples=[];for(let n=0;n<80;n++){await runtime.step(4);await settle();samples.push(describe(runtime.current!.entities.find(e=>e.id===id)!));if(samples.at(-1)!.position!.x<12000)break}
  return {landed,beforeDeparture,departure,samples,maxHeight:surface.maxHeight};
 },
 async save(){const hash=await runtime.hash(),save=await runtime.save();await runtime.load(save.data,save.local_players);await settle();return {hash,restored:await runtime.hash(),bytes:Array.from(save.data),localPlayers:save.local_players}},
 async reset(){await runtime.load(opening.data,opening.local_players);await settle()},
 focus(p:Point){renderer.center(p)},
 zoom(factor:number){renderer.zoomBy(factor)},
 async dispose(){renderer.dispose();runtime.dispose();await art.release();return {canvases:document.querySelectorAll('canvas').length,art:art.statistics}},
};
Object.assign(window,{qa});document.body.dataset.ready='true';
