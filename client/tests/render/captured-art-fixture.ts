import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import type {GameMap,OrderIntent} from '../../src/runtime';
import type {ActorVisual} from '../../src/render/actors';
import {authoredArtId,physicalArtType} from '../../src/render/art-id';

// Only the initial mission arrangement is synthetic. Damage, capture channel,
// ownership, conversion outage, saved state and restoration all run in Go.
const map:GameMap={id:'captured-art',title:'Capture art integration',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,
 tiles:Array.from({length:4096},()=>({terrain:'open',height:0})),spawns:[{position:{x:8000,y:8000}},{position:{x:56000,y:56000}}],shipment:{x:32000,y:32000},fields:[{id:1,position:{x:14000,y:8000},credits:1000000}],required_packs:['2.0.0']};
const runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),errors:string[]=[];
let renderer:BattlefieldRenderer|undefined,targetID=0,opening:Awaited<ReturnType<typeof runtime.save>>;
const requests:Array<{type:string;faction?:string;id?:string}>=[],originalResolve=art.resolve.bind(art);
art.resolve=(type,faction,c)=>{const result=originalResolve(type,faction,c);requests.push({type,faction,id:result?.id});return result};
runtime.subscribe(event=>{if(event.type==='snapshot')renderer?.setSnapshot(event.snapshot);if(event.type==='error')errors.push(event.error.message)});
async function settle(){await renderer!.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,80));await art.settle()}
async function order(order:OrderIntent){await runtime.sendOrders([order]);await runtime.step(2)}
async function until(test:()=>boolean,limit=2400){for(let n=0;n<limit&&!test();n++)await runtime.step(2);if(!test())throw Error('Go condition did not finish: '+JSON.stringify({tick:runtime.current?.tick,target:runtime.current?.entities.find(e=>e.id===targetID)}))}
function inspect(){const entity=runtime.current!.entities.find(e=>e.id===targetID)!;if(!entity)throw Error('Target disappeared');const actor=(renderer as unknown as {actors:Map<number,ActorVisual>}).actors.get(targetID)!;
 const faction=runtime.current!.players.find(p=>p.id===entity.owner)?.faction;
 return {id:entity.id,owner:entity.owner,type:entity.type,health:entity.health,state:entity.state,enabled:entity.enabled,footprint:[entity.footprintWidth,entity.footprintHeight],footprintType:entity.footprintType,artKey:actor.artKey,desiredArt:authoredArtId(physicalArtType(entity),faction),sheet:(actor as unknown as {sheet?:{id:string}}).sheet?.id,missing:actor.missingArt,requests:requests.slice()};
}
const qa={errors,
 async start(type:string){renderer?.dispose();renderer=undefined;requests.length=0;
  const mission={id:'capture-art-mission',version:'1',title:'Capture art integration',map_id:map.id,faction:'US',mode:'tutorial',default_bases:true,
   players:[{id:1,faction:'US',name:'Capturer',team:1,credits:6000000,controller:'human'},{id:2,faction:'SY',name:'Owner',team:2,credits:6000000,controller:'script'}],
   initial:[{tag:'target',type,owner:2,position:{x:18000,y:14000},count:1},{tag:'attacker',type:'US.at',owner:1,position:{x:14000,y:14000},count:1},{tag:'engineer',type:'US.engineer',owner:1,position:{x:17500,y:10500},count:1}],
   objectives:[{id:'timer',text:'Capture test duration',condition:{kind:'timer',tick:100000}}],triggers:[]};
  await runtime.create({map,mission,seed:31,skip_countdown:true});targetID=runtime.current!.entities.find(e=>e.type===type&&e.owner===2)!.id;
  renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings:{...DEFAULT_SETTINGS,edgeScroll:false,screenShake:0},onGesture:()=>{},onError:e=>errors.push(e.message)});
  renderer.setSnapshot(runtime.current!);renderer.center({x:18000,y:14000});await settle();opening=await runtime.save();return {version:runtime.version,...inspect()};
 },
 async capture(){const attacker=runtime.current!.entities.find(e=>e.type==='US.at')!,engineer=runtime.current!.entities.find(e=>e.type==='US.engineer')!;
  await order({kind:'attack',entities:[attacker.id],target:targetID});await until(()=>{const e=runtime.current!.entities.find(e=>e.id===targetID);return !!e&&e.health<240});
  await order({kind:'move',entities:[attacker.id],position:{x:14000,y:24000}});await order({kind:'capture',entities:[engineer.id],target:targetID});
  await until(()=>runtime.current!.entities.some(e=>e.id===targetID&&e.owner===1));await settle();const captured=inspect();await runtime.step(200);await runtime.step(1);await settle();
  return {captured,operational:inspect(),tick:runtime.current!.tick};
 },
 async restore(){const saved=await runtime.save(),before=inspect();await runtime.load(saved.data,saved.local_players);await settle();const restored=inspect(),restoredHash=await runtime.hash();
  await runtime.load(opening.data,opening.local_players);await settle();return {before,restored,hash:saved.hash,restoredHash,rewound:inspect(),openingHash:opening.hash,rewoundHash:await runtime.hash()};
 },
 async dispose(){renderer?.dispose();renderer=undefined;runtime.dispose();await art.release();return {canvases:document.querySelectorAll('canvas').length,pages:art.statistics.residentPages}},
};Object.assign(window,{qa});document.body.dataset.ready='true';
