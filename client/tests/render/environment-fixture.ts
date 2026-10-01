import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import type {GameMap,OrderIntent} from '../../src/runtime';
import type {ActorVisual} from '../../src/render/actors';
const map:GameMap={id:'environment-integration',title:'Synthetic environment integration',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,
 tiles:Array.from({length:4096},()=>({terrain:'open',height:0})),spawns:[{position:{x:8000,y:8000}},{position:{x:56000,y:56000}}],shipment:{x:26000,y:26000},
 fields:[{id:1,position:{x:14000,y:8000},credits:1000000}],stations:[{id:2,position:{x:20000,y:12000}}],objects:[{id:90,class:'light_prop',position:{x:18500,y:14500}},{id:91,class:'heavy_prop',position:{x:24000,y:20000}},{id:92,class:'garrison',position:{x:26500,y:17500}}],required_packs:['2.0.0']};
const mission={id:'environment-test',version:'1',title:'Environment integration acceptance',map_id:map.id,faction:'US',mode:'tutorial',default_bases:true,
 players:[{id:1,faction:'US',name:'Resource observer',team:1,credits:6000000,controller:'human'},{id:2,faction:'IR',name:'Far opponent',team:2,credits:6000000,controller:'script'}],
 initial:[{tag:'depot',type:'supply',owner:1,position:{x:14000,y:13000},count:1},{tag:'hauler',type:'US.hauler',owner:1,position:{x:17500,y:12500},count:1},{tag:'tank',type:'US.tank',owner:1,position:{x:17000,y:18500},count:1},{tag:'engineer',type:'US.engineer',owner:1,position:{x:19500,y:10500},count:1}],
 objectives:[{id:'timer',text:'Environment test duration',condition:{kind:'timer',tick:100000}}],triggers:[]};
const runtime=new OfflineTransport();await runtime.ready;await runtime.create({map,mission,seed:31,skip_countdown:true});const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog),art=new ArtLibrary(),errors:string[]=[];
const renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings:{...DEFAULT_SETTINGS,edgeScroll:false,screenShake:0},onGesture:()=>{},onError:error=>errors.push(error.message)});
runtime.subscribe(event=>{if(event.type==='snapshot')renderer.setSnapshot(event.snapshot);if(event.type==='error')errors.push(event.error.message)});renderer.setSnapshot(runtime.current!);renderer.center({x:18000,y:14000});await renderer.whenAssetsReady();const opening=await runtime.save();
const internals=renderer as unknown as {actors:Map<number,ActorVisual>;environment:{count:number;nodes:Map<string,{item:unknown;root:{visible:boolean;alpha:number};sheet?:{id:string};beauty:{visible:boolean};shadow:{visible:boolean}}>}};
const nodes=()=>[...internals.environment.nodes].map(([key,n])=>({key,item:n.item,sheet:n.sheet?.id,visible:n.root.visible,alpha:n.root.alpha,beauty:n.beauty.visible}));
async function settle(){await renderer.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,100));await art.settle()}
async function order(order:OrderIntent){const preview=await runtime.previewOrders([order]);if(!preview.results[0]?.accepted)throw Error('Order rejected '+JSON.stringify({order,preview}));await runtime.sendOrders([order]);await runtime.step(2)}
async function until(test:()=>boolean,limit=1800){for(let n=0;n<limit&&!test();n++)await runtime.step(4);if(!test())throw Error('Go scenario condition did not complete')}
const qa={errors,map,
 async inspect(){await settle();return {version:runtime.version,nodes:nodes(),missing:renderer.missingArt,tick:runtime.current!.tick}},
 async capture(){const engineer=runtime.current!.entities.find(e=>e.type==='US.engineer')!,station=runtime.current!.stations.find(s=>s.position?.x===20000&&s.position?.y===12000)!;await order({kind:'capture',entities:[engineer.id],target:station.id});await until(()=>runtime.current!.stations.some(s=>s.id===station.id&&s.owner===1));await settle();return {tick:runtime.current!.tick,station:runtime.current!.stations.find(s=>s.id===station.id),nodes:nodes()}},
 async destroy(){const tank=runtime.current!.entities.find(e=>e.type==='US.tank')!,states:unknown[]=[];
  for(const id of [90,91]){const target=runtime.current!.entities.find(e=>e.type===`map.${id===90?'light_prop':'heavy_prop'}`);if(!target)throw Error('Target not visible');await order({kind:'attack',entities:[tank.id],target:target.id});for(let n=0;n<500&&!runtime.current!.rubble.includes(id);n++){await runtime.step(4);await settle();const e=runtime.current!.entities.find(e=>e.id===target.id);if(e&&e.health<=500){const a=internals.actors.get(e.id)! as unknown as {state:(now:number)=>{name:string}|undefined};states.push({id,health:e.health,pose:a.state(performance.now())?.name})}}if(!runtime.current!.rubble.includes(id))throw Error('Actual weapon destruction not observed')}
  await new Promise(resolve=>setTimeout(resolve,2600));await settle();return {tick:runtime.current!.tick,states,rubble:runtime.current!.rubble,nodes:nodes()};
 },
 async revealShipment(){const tank=runtime.current!.entities.find(e=>e.type==='US.tank')!;await order({kind:'move',entities:[tank.id],position:{x:26000,y:24000}});await until(()=>!!runtime.current!.visible[26*64+26]);renderer.center(map.shipment);await settle();return {tick:runtime.current!.tick,nodes:nodes(),fields:runtime.current!.fields.map(f=>({...f,remaining:f.remaining.toString()}))}},
 async shipment(){const tank=runtime.current!.entities.find(e=>e.type==='US.tank')!,hauler=runtime.current!.entities.find(e=>e.type==='US.hauler')!;await order({kind:'move',entities:[tank.id],position:{x:26000,y:24000}});await order({kind:'gather',entities:[hauler.id],target:1});const fieldStates=new Set<string>();
  for(let n=0;n<2600;n++){await runtime.step(4);const field=internals.environment.nodes.get('field:1') as unknown as {item:{state:string}}|undefined;if(field)fieldStates.add(field.item.state);if(runtime.current!.fields.some(f=>f.id!==1&&f.remaining>0n))break}
  const dynamic=runtime.current!.fields.filter(f=>f.id!==1);if(!dynamic.some(f=>f.remaining>0n))throw Error('Real shipment did not arrive');renderer.center(map.shipment);await settle();return {tick:runtime.current!.tick,fieldStates:[...fieldStates],dynamic:dynamic.map(f=>({...f,remaining:f.remaining.toString()})),nodes:nodes()};
 },
 async fog(){const ids=runtime.current!.entities.filter(e=>e.owner===1&&['US.tank','US.engineer'].includes(e.type)).map(e=>e.id);await order({kind:'move',entities:ids,position:{x:7000,y:15000}});await until(()=>!runtime.current!.visible[20*64+24]);renderer.center({x:24000,y:20000});await settle();return {visible:runtime.current!.visible[20*64+24],rubble:runtime.current!.rubble,nodes:nodes()}},
 async restore(){const current=await runtime.save(),hash=await runtime.hash();await runtime.load(current.data,current.local_players);await settle();const restored=await runtime.hash();await runtime.load(opening.data,opening.local_players);renderer.center({x:18000,y:14000});await settle();return {hash,restored,openingHash:opening.hash,rewoundHash:await runtime.hash(),nodes:nodes(),rubble:runtime.current!.rubble}},
 async dispose(){renderer.dispose();runtime.dispose();await art.release();return {environment:internals.environment.count,canvases:document.querySelectorAll('canvas').length,art:art.statistics}},
};Object.assign(window,{qa});document.body.dataset.ready='true';
