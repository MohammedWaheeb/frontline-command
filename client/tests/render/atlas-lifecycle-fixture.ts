// A captured authorized live-match actor, frozen shipping-art bytes, and explicit
// cache aging. No gameplay state or shipped asset is changed by this fixture.
import {Application,Container,Sprite} from 'pixi.js';
import {ArtLibrary} from '../../src/render/art';
import {ActorVisual} from '../../src/render/actors';
import {CatalogIndex} from '../../src/content/catalog';
import {toScreen} from '../../src/render/iso';
import type {PlayerSnapshot} from '../../src/runtime';
const app=new Application();await app.init({width:800,height:600,background:0x25281d,resolution:1,antialias:false});app.stop();document.body.appendChild(app.canvas);
const catalog=new CatalogIndex(await(await fetch('/catalog.json')).json()),snapshot:PlayerSnapshot=await(await fetch('/snapshot.json')).json(),entity=snapshot.entities.find(e=>e.type==='US.rifle'&&e.owner===1)!;
let clock=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
const art=new ArtLibrary();await art.init();const sheet=(await art.sheet('unit.US.rifle'))!,actor=new ActorVisual(entity,catalog,art,'US');await actor.ready;app.stage.addChild(actor.root);const p=toScreen(entity.position!.x,entity.position!.y);app.stage.position.set(400-p.x,300-p.y);
function textures(){const values:unknown[]=[];function visit(c:Container){if(c instanceof Sprite)values.push({visible:c.visible,destroyed:c.texture.destroyed,source:!!c.texture.source,style:!!c.texture.source?.style});for(const child of c.children)visit(child)}visit(actor.root);return values}
function paint(){actor.root.visible=true;actor.render(clock,0x73ad56,true,'always',false);app.renderer.render({container:app.stage});return {statistics:art.statistics,textures:textures()}}
let companion:ActorVisual|undefined;
Object.assign(window,{atlasQA:{
 async ready(){paint();await art.settle();return paint()},
 state(){return {statistics:art.statistics,textures:textures()}},
 async shared(){
  const other=snapshot.entities.find(e=>e.type==='US.rifle'&&e.owner===1&&e.id!==entity.id)!;
  companion=new ActorVisual(other,catalog,art,'US');await companion.ready;app.stage.addChild(companion.root);
  actor.root.visible=false;clock+=11001;companion.render(clock,0x73ad56,false,'always',false);
  sheet.evictBefore(clock-10000);app.renderer.render({container:app.stage});
  const result={statistics:art.statistics,sameSheet:await art.sheet('unit.US.rifle')===sheet};
  companion.dispose();companion=undefined;paint();return result;
 },
 async evict(){actor.root.visible=false;clock+=11001;sheet.evictBefore(clock-10000);await new Promise(r=>setTimeout(r,50));return {statistics:art.statistics,textures:textures()}},
 reappear(){return paint()},
 async settle(){await art.settle();return paint()},
 async rapid(){
  for(let i=0;i<4;i++){
   actor.root.visible=false;clock+=11001;sheet.evictBefore(clock-10000);paint();
   actor.root.visible=false;clock+=11001;sheet.evictBefore(clock-10000);await art.settle();paint();
  }
  return {statistics:art.statistics,textures:textures()};
 },
 async pressure(){
  for(const id of ['unit.US.tank','unit.US.rig','unit.IR.strike','unit.SA.mobile_abm','building.US.hq','building.US.factory']){
   const extra=(await art.sheet(id))!;
   for(const state of extra.states.values())for(const layer of ['beauty','shadow','team'])for(let d=0;d<state.directions;d++)for(let f=0;f<state.frames;f++)extra.frame(layer,state.name,d,f);
  }
  await art.settle();const loaded=art.statistics;
  actor.root.visible=false;clock+=11001;art.trim();await new Promise(r=>setTimeout(r,50));const evicted=art.statistics;
  const pending=paint();await art.settle();const restored=paint();return {loaded,evicted,pending,restored};
 },
 async missing(){const empty=new ArtLibrary();empty.index={format:1,sprites:{},terrain:[],portraits:[],chrome:[],icons:false,emblems:false};const absent=new ActorVisual(entity,catalog,empty,'US');await absent.ready;absent.render(clock,0x73ad56,false,'always',false);const result={missingArt:absent.missingArt,standIn:absent.standIn};absent.dispose();await empty.release();return result},
 async dispose(){actor.root.visible=false;clock+=11001;sheet.evictBefore(clock-10000);paint();actor.dispose();await art.release();const result={statistics:art.statistics};app.destroy(true,{children:true});return result},
 }});document.body.dataset.ready='true';
