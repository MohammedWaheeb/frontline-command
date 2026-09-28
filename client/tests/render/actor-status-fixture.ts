import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import {actorStatus} from '../../src/app/actor-status';
import type {Faction,GameMap,OrderIntent} from '../../src/runtime';

// All setup is recorded Go practice orders; effects, flight, channels and expiry
// use normal commands. This is a presentation course, not an economy playthrough.
const map:GameMap={id:'actor-status-course',title:'Actor status course',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,tiles:Array.from({length:4096},()=>({terrain:'open'})),spawns:[{position:{x:8000,y:8000}},{position:{x:56000,y:56000}}],shipment:{x:45000,y:36000},fields:[{id:1,position:{x:14000,y:8000},credits:36000000},{id:2,position:{x:49000,y:56000},credits:36000000}],required_packs:['2.0.0']};
const runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),errors:string[]=[],receipts:unknown[]=[];
const renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings:{...DEFAULT_SETTINGS,screenShake:0},onGesture:()=>{},onError:e=>errors.push(e.message)});
const subscription=runtime.subscribe(event=>{if(event.type==='snapshot')renderer.setSnapshot(event.snapshot);if(event.type==='error')errors.push(event.error.message);if(event.type==='order-result')receipts.push(event.result)});
const owned=(type:string)=>runtime.current!.entities.filter(e=>e.owner===1&&e.type===type),frame=()=>runtime.current!;
async function step(count:number){for(let left=count;left>0;left-=Math.min(100,left))await runtime.step(Math.min(100,left))}
async function command(order:OrderIntent){const preview=await runtime.previewOrders([order]);if(!preview.results[0]?.accepted)throw Error(`Rejected preview ${JSON.stringify(order)}`);await runtime.sendOrders([order]);await runtime.step(1);if(!frame().results.at(-1)?.accepted)throw Error(`Rejected execution ${JSON.stringify(frame().results)}`)}
async function spawn(type:string,x:number,y:number){await command({kind:'practice_spawn',type,target:1,position:{x,y},index:1})}
async function wait(predicate:()=>boolean,max=5000){for(let n=0;n<max&&!predicate();n+=10)await step(10);if(!predicate())throw Error(`Wait exceeded at ${frame().tick}`)}
async function settle(){await renderer.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,100))}
async function select(ids:number[],x:number,y:number){renderer.setSelection(ids);renderer.center({x,y});await settle()}
function model(){return frame().entities.map(e=>({id:e.id,type:e.type,owner:e.owner,state:e.state,position:e.position,status:actorStatus(e,frame(),catalog)}))}
function visual(){return [...((renderer as any).actors as Map<number,any>).values()].filter(a=>a.root.visible&&a.statusOverlay?.root.visible&&a.statusOverlay.diagnostics.labels>0).map(a=>{const b=a.statusOverlay.root.getBounds();return {id:a.id,labels:a.statusOverlay.diagnostics.labels,width:b.width,height:b.height}})}
async function prepare(faction:Faction){
 await runtime.create({map,ruleset:'practice-v1',players:[{id:1,name:'Status commander',faction,team:1,controller:'human'},{id:2,name:'Other commander',faction:'US',team:2,controller:'human'}],seed:930,skip_countdown:true});
 await command({kind:'practice_resources',target:1,index:100000});
 for(const x of [5000,10000,15000,20000,25000,30000])await spawn('power',x,44000);
 for(const [type,x,y] of [['barracks',22000,8000],['factory',24000,14000],['radar',29000,8000],['tech',33000,14000]] as const)await spawn(type,x,y);
 await wait(()=>frame().economy!.energy>=100000n);
}
const qa={runtime,renderer,errors,receipts,model,visual,
 async recall(){
  await prepare('IR');await spawn('IR.drone_hub',23000,26000);await spawn('IR.isr',27000,32000);
  const drone=owned('IR.isr')[0];await command({kind:'move',entities:[drone.id],position:{x:31000,y:31000}});
  await wait(()=>{const d=owned('IR.isr')[0];return Math.hypot(d.position!.x-31000,d.position!.y-31000)<500});
  await command({kind:'ability',type:'relay_boost',entities:[drone.id]});await command({kind:'ability',type:'drone_recall',entities:[drone.id]});
  await select([drone.id],30000,30000);return {tick:frame().tick,model:model(),visual:visual()};
 },
 async emergency(){
  await wait(()=>owned('IR.isr')[0].landed);const drone=owned('IR.isr')[0],home=owned('IR.drone_hub')[0];
  await command({kind:'practice_remove',target:home.id});await select([drone.id],drone.position!.x,drone.position!.y);
  const before=await runtime.save(),m=model();await runtime.load(before.data,before.local_players);await select([drone.id],drone.position!.x,drone.position!.y);
  return {tick:frame().tick,model:model(),savedModel:m,hash:await runtime.hash(),savedHash:before.hash,visual:visual()};
 },
 async expiry(){await step(41);await settle();return {tick:frame().tick,model:model()}},
 async foreign(){await command({kind:'practice_fog',index:1});await runtime.setPerspective(2);await settle();return {tick:frame().tick,model:model()}},
 async hull(){
  await prepare('SA');await spawn('SA.tank',28000,27000);const tank=owned('SA.tank')[0];await command({kind:'deploy',entities:[tank.id]});await wait(()=>owned('SA.tank')[0].deployed);
  await command({kind:'ability',type:'emergency_power',entities:owned('hq').map(e=>e.id)});await select([tank.id],28000,27000);
  return {tick:frame().tick,model:model(),visual:visual()};
 },
 async disperse(){
  await prepare('SY');await spawn('SY.rifle',28000,27000);await spawn('SY.recon',32000,27000);
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)await spawn('SY.rifle',27000+x*1400,29200+y*1400);
  await step(110);
  await command({kind:'ability',type:'disperse',entities:owned('hq').map(e=>e.id),position:{x:29000,y:27000}});
  const ids=[owned('SY.rifle')[0],owned('SY.recon')[0]].map(e=>e.id);await select(ids,30000,27000);return {tick:frame().tick,model:model(),visual:visual()};
 },
 async dense(){await select([...owned('SY.rifle'),...owned('SY.recon')].map(e=>e.id),29000,29000);return {tick:frame().tick,model:model(),visual:visual()}},
 async channel(){
  await prepare('US');await spawn('US.apc',28000,27000);await spawn('US.engineer',30000,27000);const apc=owned('US.apc')[0];
  const engineer=owned('US.engineer')[0];await command({kind:'board',entities:[engineer.id],target:apc.id});await wait(()=>owned('US.engineer')[0].state==='board',300);await step(10);
  await select([engineer.id],engineer.position!.x,engineer.position!.y);return {tick:frame().tick,model:model(),visual:visual()};
 },
 async paused(){await runtime.pause();const before=model(),hash=await runtime.hash();await new Promise(resolve=>setTimeout(resolve,400));return {before,after:model(),hash,afterHash:await runtime.hash()}},
 async reduced(){const before=model();renderer.updateSettings({...DEFAULT_SETTINGS,reducedMotion:true,reducedFlashing:true,screenShake:0,palette:'cvd_safe'});await settle();return {before,after:model(),visual:visual()}},
 async zoom(){const before=visual();renderer.zoomBy(.7);await settle();return {before,after:visual()}},
 async cull(){const before=visual();renderer.center({x:59000,y:59000});await settle();const far=visual();const engineer=owned('US.engineer')[0];renderer.center(engineer.position!);await settle();return {before,far,after:visual()}},
 async ammunition(){await spawn('US.airfield',26000,30000);await spawn('US.fighter',34000,31000);const fighter=owned('US.fighter')[0];await select([fighter.id],34000,31000);return {tick:frame().tick,model:model(),visual:visual()}},
 async dispose(){subscription();renderer.dispose();runtime.dispose();await art.release();return {canvases:document.querySelectorAll('canvas').length,art:art.statistics,errors}},
};
Object.assign(window,{qa});document.body.dataset.ready='true';
