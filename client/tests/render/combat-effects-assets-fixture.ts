import {Application,Rectangle} from 'pixi.js';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,EventSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {CombatEffects} from '../../src/render/combat-effects';
import {TerrainSurface} from '../../src/render/terrain-surface';
import {DEFAULT_SETTINGS,type Settings} from '../../src/app/settings';
import type {GameMap,PlayerSnapshot,Point} from '../../src/runtime';

const errors:string[]=[],catalog=new CatalogIndex(await(await fetch('/catalog.json')).json());
const descriptor=(await(await fetch('/art/index.json')).json()).effects;
const map:GameMap={id:'synthetic-fx',title:'Synthetic FX atlas test',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:32,height:32,tiles:Array.from({length:1024},()=>({terrain:'open'})),spawns:[],fields:[],stations:[],shipment:{x:1000,y:1000}};
const surface=new TerrainSurface(map),app=new Application();await app.init({width:800,height:540,background:0x171a13,resolution:1,antialias:false});app.stop();document.body.appendChild(app.canvas);
let clock=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
const effects=new CombatEffects(catalog,map,error=>errors.push(error.message));await effects.init(descriptor);effects.root.position.set(400,55);app.stage.addChild(effects.root);
let settings:Settings={...DEFAULT_SETTINGS,artQuality:'high'},viewport={left:-400,right:400,top:-55,bottom:485},current:PlayerSnapshot;
const position={x:8000,y:8000};
function snapshot(tick:number,entries:Array<{id:number;position:Point;armor?:string;cover?:boolean}>=[]){return create(PlayerSnapshotSchema,{tick,player:1,players:[{id:1,team:1,faction:'US'},{id:2,team:2,faction:'IR'}],visible:Array(1024).fill(true),explored:Array(1024).fill(true),entities:entries.map(value=>({id:value.id,type:'IR.rifle',owner:2,health:900,enabled:true,complete:true,position:value.position})),events:entries.map(value=>Object.assign(create(EventSchema,{id:value.id,tick,kind:'impact',entity:value.id,owner:1,scope:'visible',position:value.position}),{combat:{weapon:'RIF',outcome:'hit',targetArmor:value.armor??'infantry',coverMitigated:!!value.cover}}))})}
function use(s:PlayerSnapshot,replace=false){current=s;effects.sync(s,[],replace)}
function draw(){effects.draw(surface,1,settings,viewport,()=>0);app.renderer.render({container:app.stage});return {tick:current?.tick,diagnostics:effects.diagnostics,errors:[...errors]}}
function sample(point=position){const p=surface.projectGround(point),data=app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(0,0,800,540)}),x=Math.round(p.x+400),y=Math.round(p.y+55);return Array.from(data.pixels.slice((y*800+x)*4,(y*800+x)*4+4))}
async function ready(){for(let i=0;i<3;i++){await effects.settle();draw()}return {...draw(),pixel:sample()}}
function baseline(tick:number){effects.reset();use(snapshot(tick))}
Object.assign(window,{combatAssetsQA:{
 start(){baseline(99);use(snapshot(100,[{id:1,position}]));return draw()},
 async metadata(){await effects.settle();return draw()},ready,
 state(){return {...draw(),pixel:sample()}},
 frame(){const old=current;use({...old,tick:101});return {...draw(),pixel:sample()}},
 variant(name:string){settings={...DEFAULT_SETTINGS,artQuality:name==='low'?'standard':'high',reducedMotion:name==='reducedMotion'||name==='reduced',reducedFlashing:name==='reducedFlashing'||name==='reduced'};return {...draw(),pixel:sample()}},
 cull(on:boolean){viewport=on?{left:3000,right:3400,top:3000,bottom:3400}:{left:-400,right:400,top:-55,bottom:485};return {...draw(),pixel:sample()}},
 async burst(){settings={...DEFAULT_SETTINGS,artQuality:'high'};baseline(199);use(snapshot(200,Array.from({length:688},(_,i)=>({id:i+1000,position:{x:3000+(i%26)*400,y:3000+Math.floor(i/26)*400}}))));return ready()},
 async pressure(){baseline(399);use(snapshot(400,[{id:3001,position,cover:true},{id:3002,position:{x:14000,y:8000},armor:'light'}]));return ready()},
 async holdPaused(){clock+=11001;await effects.trim();return draw()},
 async evictCulled(){viewport={left:150,right:350,top:250,bottom:450};draw();clock+=11001;await effects.trim();const evicted=effects.diagnostics;draw();await effects.settle();draw();return {evicted,...draw(),pixel:sample({x:14000,y:8000})}},
 async pendingDispose(){const late=new CombatEffects(catalog,map,error=>errors.push(error.message));await late.init(descriptor);late.sync(snapshot(500),[]);late.sync(snapshot(501,[{id:5001,position}]),[]);const render=()=>late.draw(surface,1,settings,{left:-400,right:400,top:-55,bottom:485},()=>0);render();await late.settle();render();const pending=late.diagnostics;await late.dispose();await late.settle();return {pending,disposed:late.diagnostics,destroyed:late.root.destroyed}},
 async dispose(){await effects.dispose();app.destroy(true,{children:true});return {diagnostics:effects.diagnostics,canvases:document.querySelectorAll('canvas').length,errors:[...errors]}},
 }});document.body.dataset.ready='true';
