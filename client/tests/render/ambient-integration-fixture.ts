import {toJson} from '@bufbuild/protobuf';
import {EntitySchema,EventSchema} from '../../src/protocol/frontline_pb';
import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import {defeatCountdowns,placementPower} from '../../src/app/battlefield-cues';
import type {GameMap,OrderIntent} from '../../src/runtime';
import type {RangeMode} from '../../src/render/range-geometry';

// Actual Go practice placement plus ordinary movement/building/harvesting,
// damage, selling and capture. No snapshot/HP/event injection. Presentation
// acceptance only: manual Go steps do not certify economy or endurance.
const map:GameMap={id:'ambient-course',title:'Ambient presentation course',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,tiles:Array.from({length:4096},()=>({terrain:'open'})),spawns:[{position:{x:8000,y:8000}},{position:{x:56000,y:56000}}],shipment:{x:22000,y:10000},fields:[{id:1,position:{x:14000,y:8000},credits:1000}],stations:[{id:900,position:{x:22000,y:22000}}],required_packs:['2.0.0']};
const runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),errors:string[]=[],receipts:unknown[]=[];
let renderer:BattlefieldRenderer|undefined,settings={...DEFAULT_SETTINGS,screenShake:0},caseName='',subject=0,source=0;
const subscription=runtime.subscribe(event=>{if(event.type==='presentation-reset')renderer?.resetFeedback();if(event.type==='snapshot')renderer?.setSnapshot(event.snapshot);if(event.type==='error')errors.push(event.error.message)});
const current=()=>runtime.current!,owned=(type:string)=>current().entities.filter(e=>e.owner===current().player&&e.type===type);
const ambient=()=>[...((renderer as any)?.combat.ambient.values??[])];
const has=(id:string)=>ambient().some(cue=>cue.effect===id);
function report(){return {caseName,tick:current().tick,subject,source,diagnostics:renderer?.combatDiagnostics,ambient:structuredClone(ambient()),decorations:[...((renderer as any)?.combat.sprites??[])].map(([key,node]:any)=>({key,effect:node.sheet.id,x:node.sprite.x,y:node.sprite.y,variant:node.variant,frame:node.frame})),entities:current().entities.map(e=>toJson(EntitySchema,e)),events:current().events.map(e=>toJson(EventSchema,e)),defeat:defeatCountdowns(current()),memory:current().memory.map(m=>({id:m.id,seen:m.seen,type:m.type,position:m.position})),memoryLabels:((renderer as any)?.memoryLabels??[]).map((text:any)=>text.text),ranges:(renderer as any)?.tacticalOverlay.diagnostics,errors:[...errors]}}
async function settled(){if(!renderer)return;await renderer.whenAssetsReady();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));(renderer as any).app.renderer.render({container:(renderer as any).app.stage})}
async function command(order:OrderIntent){const preview=await runtime.previewOrders([order]);if(!preview.results[0]?.accepted)throw Error('Go preview rejected '+JSON.stringify({order,results:preview.results}));await runtime.sendOrders([order]);await runtime.step(1);const result=current().results.at(-1);receipts.push({tick:current().tick,order,result});if(!result?.accepted)throw Error('Go execution rejected '+JSON.stringify({order,result}))}
async function spawn(type:string,x:number,y:number,owner=1){const before=new Set(current().entities.map(e=>e.id));await command({kind:'practice_spawn',type,target:owner,index:1,position:{x,y}});const entity=current().entities.find(e=>!before.has(e.id)&&e.type===type&&e.owner===owner);if(!entity)throw Error('Spawn is not currently disclosed: '+type);return entity.id}
async function until(predicate:()=>boolean,max:number,step=1){for(let n=0;n<max&&!predicate();n+=step)await runtime.step(Math.min(step,max-n));if(!predicate())throw Error(`Condition not reached in ${caseName} at ${current().tick}`)}
async function start(name:string,ruleset='practice-v1',courseMap=map){
 if(renderer){renderer.dispose();await renderer.whenEffectsReleased();renderer=undefined;await art.release()}
 await runtime.create({map:courseMap,ruleset,seed:577,skip_countdown:true,players:[{id:1,name:'Amber',faction:'US',team:1,controller:'human'},{id:2,name:'Olive',faction:'IR',team:2,controller:'human'}]});
 settings={...DEFAULT_SETTINGS,screenShake:0};caseName=name;subject=source=0;
 renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map:courseMap,catalog,art,settings,onGesture:()=>{},onError:error=>errors.push(error.message)});renderer.setSnapshot(current());renderer.center({x:14000,y:14000});
}
async function paidBuilding(type:string,x:number,y:number){const faction=current().players.find(p=>p.id===current().player)!.faction;await command({kind:'build',entities:[owned(`${faction}.rig`)[0].id],type,position:{x,y}});await until(()=>owned(type).some(e=>e.complete),1500,10);return owned(type).find(e=>e.complete)!.id}
async function paidUnit(type:string,producer:number){await command({kind:'train',entities:[producer],type});await until(()=>owned(type).length>0,1200,10);return owned(type)[0].id}
async function moveTo(id:number,x:number,y:number){await command({kind:'move',entities:[id],position:{x,y}});await until(()=>{const p=current().entities.find(e=>e.id===id)?.position;return !!p&&Math.hypot(p.x-x,p.y-y)<500},2400,10)}
async function center(x:number,y:number){renderer!.center({x,y});await settled();return report()}
async function damage(type:string){await start('ordinary damage '+type);subject=await spawn(type,30000,26000);await spawn('US.recon',24500,26000);source=await spawn('IR.tank',35500,26000,2);await until(()=>has(type==='power'?'fx.building.fire_damaged':'fx.unit.smoke_damaged'),1200);return center(30000,26000)}
const qa={runtime,errors,receipts,report,
 async movement(){await start('movement');subject=await spawn('US.hauler',22000,18000);await command({kind:'move',entities:[subject],position:{x:26000,y:18000}});await until(()=>has('fx.unit.dust_trail'),60);return center(24000,18000)},
 async stop(){await command({kind:'stop',entities:[subject]});await runtime.step(1);await settled();return report()},
 async rotor(){await start('rotor');await spawn('US.airfield',25000,20000);subject=await spawn('US.airlift',31000,24000);return center(31000,24000)},
 async construction(){await start('paid construction');subject=owned('US.rig')[0].id;await command({kind:'build',entities:[subject],type:'power',position:{x:10000,y:14000}});await until(()=>has('fx.building.construction_dust'),600);return center(10000,14000)},
 async sell(){await until(()=>owned('power').some(e=>e.complete),1500,10);subject=owned('power')[0].id;await command({kind:'sell',entities:[subject]});await until(()=>has('fx.building.sell_dust'),100);return center(10000,14000)},
 async damagedUnit(){return damage('US.hauler')},
 async damagedBuilding(){return damage('power')},
 async critical(){const building=current().entities.some(e=>e.id===subject&&catalog.buildings.has(e.type));await until(()=>has(building?'fx.building.smoke_critical':'fx.unit.fire_critical'),1200);await settled();return report()},
 async wreck(){await until(()=>has('fx.unit.wreck_smoke'),1200);await settled();return report()},
 async depleted(){await start('resource depletion');await spawn('supply',10000,14000);const hauler=await spawn('US.hauler',15500,9000);await command({kind:'gather',entities:[hauler]});await until(()=>has('fx.environment.depletion_dust'),1500);return center(14000,8000)},
 async shipment(){await until(()=>has('fx.environment.shipment_arrival'),3700,20);return center(22000,10000)},
 async capture(){await start('station capture');subject=await spawn('US.engineer',21000,22000);const station=current().stations.find(station=>station.position?.x===22000&&station.position.y===22000);if(!station)throw Error('Station is not currently disclosed');await command({kind:'capture',entities:[subject],target:station.id});await until(()=>has('fx.environment.supply_station_capture'),200);return center(22000,22000)},
 async clarity(){
  await start('battlefield clarity');subject=await spawn('US.artillery',18000,18000);const scout=await spawn('US.recon',22000,18000);source=await spawn('hq',30000,18000,2);await runtime.step(20);await command({kind:'practice_remove',target:scout});await runtime.step(1);renderer!.setSelection([subject]);
  if(!current().memory.some(m=>m.id===source)||current().entities.some(e=>e.id===source))throw Error('Go did not establish hidden building memory');
  return center(24000,18000);
 },
 async range(mode:RangeMode){renderer!.setRangeMode(mode);await settled();return report()},
 async placement(valid:boolean){const rig=owned('US.rig')[0],building=catalog.buildings.get('power')!,position=valid?{x:10000,y:14000}:{x:8000,y:8000};const preview=await runtime.previewOrders([{kind:'build',entities:[rig.id],type:'power',position}]);const result=preview.results[0];renderer!.setPlacement({type:'power',width:building.width,height:building.height,position,valid:result?.code==='indeterminate'?undefined:result?.accepted&&result.code==='ok'});await center(position.x,position.y);return {preview,estimate:placementPower(building,current().economy),ghost:{visible:(renderer as any).placementGhost.root.visible,children:(renderer as any).placementGhost.root.children.length},...report()}},
 async clearPlacement(){renderer!.setPlacement(undefined);await settled();return {visible:(renderer as any).placementGhost.root.visible,...report()}},
 async rejectOccupiedPlacement(){const order:OrderIntent={kind:'build',entities:[owned('US.rig')[0].id],type:'power',position:{x:8000,y:8000}};await runtime.sendOrders([order]);await runtime.step(1);const result=current().results.at(-1);receipts.push({tick:current().tick,order,result});if(result?.accepted||result?.code!=='occupied')throw Error('Expected actual Go occupied-site rejection: '+JSON.stringify(result));await settled();return {result,...report()}},
 async defeat(){
  // Practice intentionally disables elimination. Earn this warning in a new
  // standard match through paid production, sales and real hostile damage.
  const standardMap={...map,id:'defeat-recovery-course',title:'Defeat recovery course',spawns:[{position:{x:8000,y:8000}},{position:{x:30000,y:18000}}]};
  await start('standard defeat and capture recovery','standard-v2',standardMap);
  await paidBuilding('power',10000,14000);const homeBarracks=await paidBuilding('barracks',14000,14000),rig=owned('US.rig')[0].id;
  subject=await paidUnit('US.engineer',homeBarracks);const support=await paidUnit('US.at',homeBarracks);await moveTo(subject,33000,20000);
  await runtime.setPerspective(2);await paidBuilding('power',30000,24000);source=await paidBuilding('barracks',36000,20000);const rifle=await paidUnit('IR.rifle',source);await moveTo(rifle,40000,26000);
  await runtime.setPerspective(1);await moveTo(support,40000,16000);await command({kind:'attack',entities:[support],target:source});await until(()=>{const target=current().entities.find(e=>e.id===source);return !!target&&target.health<250},1800);await moveTo(support,48000,9000);
  await moveTo(rig,35000,26000);await command({kind:'sell',entities:[homeBarracks]});await command({kind:'sell',entities:[owned('hq')[0].id]});await until(()=>!owned('hq').length&&!owned('barracks').length,100);
  await runtime.setPerspective(2);await command({kind:'attack',entities:[rifle],target:rig});await runtime.setPerspective(1);await until(()=>defeatCountdowns(current()).some(d=>d.own),1800);
  await runtime.setPerspective(2);await command({kind:'move',entities:[rifle],position:{x:58000,y:48000}});await runtime.setPerspective(1);
  if(!current().entities.some(e=>e.id===source&&e.owner===2))throw Error('Recovery barracks is not currently disclosed');return center(34000,21000);
 },
 async recovery(){await command({kind:'capture',entities:[subject],target:source});await until(()=>!defeatCountdowns(current()).some(d=>d.own),500);if(!owned('barracks').some(e=>e.id===source))throw Error('Capture did not restore a qualifying building');await settled();return report()},
 async variant(name:string){settings={...DEFAULT_SETTINGS,screenShake:0,artQuality:name==='low'?'standard':'high',reducedMotion:name==='reducedMotion'||name==='reduced',reducedFlashing:name==='reducedFlashing'||name==='reduced'};renderer!.updateSettings(settings);await settled();return report()},
 async paused(){await runtime.pause();const before=report(),hash=await runtime.hash();await new Promise(resolve=>setTimeout(resolve,350));return {before,after:report(),hash,afterHash:await runtime.hash()}},
 async restore(){const save=await runtime.save(),before=report();await runtime.load(save.data,save.local_players);await settled();return {before,after:report(),hash:await runtime.hash(),saveHash:save.hash}},
 async exportSave(){const save=await runtime.save();return {format:'frontline-local-save',version:1,id:'battlefield-clarity',name:'Battlefield clarity course',local_players:save.local_players,hash:save.hash,engine:new TextDecoder().decode(save.data)}},
 async replay(){const save=await runtime.save(),bytes=await runtime.exportReplay();const info=await runtime.loadReplay(bytes);await settled();const opening=report();await runtime.seekReplay(save.tick);await settled();return {opening,atEnd:report(),hash:await runtime.hash(),savedHash:save.hash,start:info.replay_start,end:save.tick,bytes:Array.from(bytes)}},
 async advance(n:number){while(n>0){const step=Math.min(n,20);await runtime.step(step);n-=step}await settled();return report()},
 async dispose(){subscription();renderer?.dispose();await renderer?.whenEffectsReleased();const combat=renderer?.combatDiagnostics;runtime.dispose();await art.release();return {canvases:document.querySelectorAll('canvas').length,art:art.statistics,combat,errors:[...errors],receipts}},
};
Object.assign(window,{ambientQA:qa});document.body.dataset.ready='true';
