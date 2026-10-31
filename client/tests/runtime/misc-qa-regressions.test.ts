import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {TutorialGuide} from '../../src/ui/TutorialGuide';
import {Observable} from '../../src/app/store';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import type {Application} from '../../src/app/application';
import type {BattleController} from '../../src/app/battle-controller';
import {SessionController,type OfflineSession} from '../../src/runtime/session';
import {LocalStore} from '../../src/runtime/storage';
import {RuntimeEvents,type GameMap,type OfflineConfig,type SessionInfo} from '../../src/runtime/types';

const steps=[{id:'select',kind:'select',text:'Select one unit, then drag-select the squad'},
 {id:'group',kind:'control_group',text:'Store and recall your squad'},
 {id:'move',kind:'move',objective:'destination'},
 {id:'stop',kind:'stop',text:'Stop your squad'},
 {id:'rally',kind:'rally',text:'Set a rally point'},
 {id:'board',kind:'board',text:'Board the transport'},
 {id:'unload',kind:'unload',text:'Unload the transport'}];
function guide(learned:string[],destination=false){
 const state=new Observable({settings:DEFAULT_SETTINGS,session:{id:'session-1',kind:'solo'},index:{missions:[{id:'tutorial-01',mode:'tutorial'}]},snapshot:{mission:{id:'tutorial-01',objectives:[{id:'destination',complete:destination,text:'Move to the destination'}]}}});
 const app={state} as unknown as Application,control={state:new Observable({learned})} as unknown as BattleController;
 // Render the real component with loaded presentation steps and explicit hook
 // peers. No effects, fetch, React DOM mounting or browser behavior is claimed.
 const internals=(React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,old=internals.H;let slot=0;
 internals.H={useSyncExternalStore(_subscribe:unknown,get:()=>unknown){return get()},useState(){return [slot++===0?steps:false,()=>{}]},useEffect(){}};
 let element:React.ReactNode;try{element=TutorialGuide({app,control})}finally{internals.H=old}
 return renderToStaticMarkup(element);
}

test('M3-08: completing later inputs early leaves the counter on the displayed first instruction',()=>{
 for(const learned of [[],['stop'],['stop','rally','board','unload','group_store','group_recall']]){
  const html=guide(learned,true);assert.match(html,/FIELD INSTRUCTION 1\/7/);assert.ok(html.includes(`<p>${steps[0].text}</p>`));
 }
 assert.match(guide(['single_select','stop']),/FIELD INSTRUCTION 1\/7/,'both selection inputs are required');
});

test('M3-08: counter follows the next authored instruction across out-of-order and objective completion',()=>{
 const selected=['single_select','box_select','stop','rally','board','unload'];
 const group=guide(selected);assert.match(group,/FIELD INSTRUCTION 2\/7/);assert.ok(group.includes(`<p>${steps[1].text}</p>`));
 const grouped=[...selected,'group_store','group_recall'];
 const move=guide(grouped);assert.match(move,/FIELD INSTRUCTION 3\/7/);assert.ok(move.includes('<p>Move to the destination</p>'));
 assert.equal(guide(grouped,true),'','all completed instructions hide the guide');
 const last=guide(['single_select','box_select','group_store','group_recall','stop','rally','board'],true);
 assert.match(last,/FIELD INSTRUCTION 7\/7/);assert.ok(last.includes(`<p>${steps[6].text}</p>`));
});

const map:GameMap={id:'copper-junction',title:'Copper Junction',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:32,height:32,tiles:[],spawns:[],shipment:{x:1,y:1},fields:[]};
const metadata={simulation:'test',protocol:1,content_hash:'test',map_version:'1',ruleset:'standard-v2',seed:1};
const config:OfflineConfig={map,seed:1,players:[{id:1,name:'One',faction:'US',team:1}]};
class Offline extends RuntimeEvents implements OfflineSession{
 readonly mode='offline' as const;ready=Promise.resolve({adapter:'1',simulation:'test',protocol:1,go:'test',content_hash:'test'});
 current=create(PlayerSnapshotSchema,{tick:0,player:1});
 info:SessionInfo={adapter:'1',metadata,tick:0,local_players:[1],finished:false,replay:false,replay_start:0,replay_end:0};
 loaded?:Uint8Array;
 constructor(readonly battlefield:GameMap=map,mission?:{id:string;title:string;checkpoint?:string}){super();if(mission)this.current.mission=create(PlayerSnapshotSchema,{mission}).mission}
 async create(value:OfflineConfig){this.info.metadata={...metadata,ruleset:value.ruleset??'standard-v2'};return this.info}
 async load(data:Uint8Array){this.loaded=data;return this.info}
 async loadReplay(){this.info.replay=true;return this.info}
 async restart(){return this.info}async map(){return this.battlefield}
 async save(){return {data:new Uint8Array([1,2,3]),metadata:this.info.metadata!,tick:this.info.tick,hash:'test',local_players:[1]}}
 async exportReplay(){return new Uint8Array([4])}async inspect(){return {metadata,tick:this.info.tick}}async inspectReplay(){return {metadata,start_tick:0,end_tick:100,players:[1]}}
 async sendOrders(){return 1}async pause(){}async resume(){}async setSpeed(){}async setPerspective(){return this.info}async seekReplay(){return this.info}
 dispose(){this.clearListeners()}
 tick(tick:number,checkpoint?:string){this.info.tick=tick;this.current.tick=tick;if(this.current.mission&&checkpoint!==undefined){this.current.mission.checkpoint=checkpoint;this.current.mission.checkpointTick=tick}this.emit({type:'snapshot',snapshot:this.current})}
}
let database=0;
function session(runtime:Offline){
 const store=new LocalStore(`misc-qa-${++database}`,async()=>({metadata:runtime.info.metadata!,tick:runtime.info.tick}));
 const control=new SessionController({store,makeOffline:()=>runtime});return {store,control};
}

test('M3-09: map opening and periodic labels retain the existing autosave rotation keys',async()=>{
 const runtime=new Offline(),{store,control}=session(runtime);
 try{
  await control.startSolo(config);await control.flushAutosave();
  assert.equal((await store.getSave('autosave-0'))?.name,'Copper Junction — Opening checkpoint');
  for(const tick of [1200,2400,3600]){runtime.tick(tick);await control.flushAutosave()}
  const saves=await store.listSaves();assert.deepEqual(saves.map(save=>save.id).sort(),['autosave-0','autosave-1','autosave-2']);
  assert.ok(saves.every(save=>save.name==='Copper Junction — Autosave'));assert.equal((await store.getSave('autosave-0'))?.revision,2);
 }finally{control.dispose();await store.close()}
});

test('M3-09: mission opening, checkpoint and periodic names use the mission display title',async()=>{
 const runtime=new Offline(map,{id:'tutorial-01',title:'Fieldcraft',checkpoint:'opening'}),{store,control}=session(runtime);
 try{
  await control.startSolo({...config,ruleset:'campaign-v1'});await control.flushAutosave();assert.equal((await store.getSave('autosave-0'))?.name,'Fieldcraft — opening');
  runtime.tick(100,'Squad assembled');await control.flushAutosave();assert.equal((await store.getSave('autosave-1'))?.name,'Fieldcraft — Squad assembled');
  runtime.tick(1300);await control.flushAutosave();assert.equal((await store.getSave('autosave-2'))?.name,'Fieldcraft — Autosave');
  runtime.tick(1301);await control.flushAutosave();assert.equal((await store.getSave('autosave-0'))?.revision,1,'the same checkpoint ID must not save twice');
 }finally{control.dispose();await store.close()}
});

test('M3-09: practice names include the battlefield and historical autosave IDs still load unchanged',async()=>{
 const runtime=new Offline(),{store,control}=session(runtime);
 try{
  await store.autosave(await runtime.save(),'OPENING');
  await control.continueSave('autosave-0');await control.flushAutosave();
  assert.deepEqual(runtime.loaded,new Uint8Array([1,2,3]));assert.equal((await store.getSave('autosave-0'))?.name,'OPENING');
  await control.startSolo({...config,ruleset:'practice-v1'});await control.flushAutosave();
  assert.equal((await store.getSave('autosave-2'))?.name,'Copper Junction — Practice start');assert.equal(control.state.kind,'practice');
 }finally{control.dispose();await store.close()}
});

test('M3-09: long display titles stay inside the existing save-name limit',async()=>{
 const runtime=new Offline({...map,title:'A'.repeat(100)}),{store,control}=session(runtime);
 try{
  await control.startSolo(config);await control.flushAutosave();const save=await store.getSave('autosave-0');
  assert.ok(save);assert.equal(save.name.length,100);assert.ok(save.name.startsWith('A'.repeat(100)));
 }finally{control.dispose();await store.close()}
});
