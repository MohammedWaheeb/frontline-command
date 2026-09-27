import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {SessionController,type OfflineSession,type SessionStorage} from '../../src/runtime/session';
import {RuntimeEvents,type GameMap,type OfflineConfig,type SaveData,type SessionInfo} from '../../src/runtime/types';
import {RuntimeError} from '../../src/runtime/errors';
import type {ObserverConnection} from '../../src/runtime/observer';
const map:GameMap={id:'test',title:'Synthetic session fixture',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:32,height:32,tiles:[],spawns:[],shipment:{x:100,y:100},fields:[]};
const metadata={simulation:'test',protocol:1,content_hash:'test',map_version:'1',ruleset:'standard-v2',seed:1};
const config:OfflineConfig={map,seed:1,players:[{id:1,name:'One',faction:'US',team:1}]};
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
class FakeOffline extends RuntimeEvents implements OfflineSession{
 readonly mode='offline' as const;
 ready=Promise.resolve({adapter:'1',simulation:'test',protocol:1,go:'test',content_hash:'test'});
 current=create(PlayerSnapshotSchema,{tick:100,player:1,metadata:{simulation:'test',protocol:1,contentHash:'test',mapVersion:'1',ruleset:'standard-v2',seed:1n},outcome:{finished:false}});
 info:SessionInfo={adapter:'1',metadata,tick:100,local_players:[1],finished:false,replay:false,replay_start:0,replay_end:0};
 disposed=0;paused=true;loadFailure=false;saveGate?:Promise<SaveData>;
 async create(value:OfflineConfig){this.info={...this.info,metadata:{...metadata,ruleset:value.ruleset??'standard-v2'}};return this.info}
 async load(_data:Uint8Array,_players:number[]){if(this.loadFailure)throw new RuntimeError('save_corrupt','Fixture failure');return this.info}
 async loadReplay(_data:Uint8Array){this.info={...this.info,replay:true,replay_start:100,replay_end:200};return this.info}
 async restart(){this.info={...this.info,tick:0};this.current.tick=0;return this.info}
 async map(){return map}
 async save(){return this.saveGate??{data:new Uint8Array([1,2,3]),metadata:this.info.metadata!,tick:this.info.tick,hash:'test',local_players:[1]}}
 async exportReplay(){return new Uint8Array([4,5,6])}
 async inspect(_data:Uint8Array){return {metadata,tick:100}}
 async inspectReplay(_data:Uint8Array){return {metadata,start_tick:0,end_tick:100,players:[1]}}
 async sendOrders(){return 1}
 async pause(){this.paused=true}async resume(){this.paused=false}
 async setSpeed(){}async setPerspective(){return this.info}
 async seekReplay(tick:number){this.info={...this.info,tick};return this.info}
 dispose(){if(!this.disposed){this.disposed=1;this.clearListeners()}}
 tick(tick:number){this.info={...this.info,tick};this.current={...this.current,tick};this.emit({type:'snapshot',snapshot:this.current})}
}
function storage(){let autosaves=0,manuals=0;return {get autosaves(){return autosaves},get manuals(){return manuals},store:{async getSave(){return undefined},async getReplay(){return undefined},async putSave(id,name,save){manuals++;return {...save,id,name,kind:'manual',revision:1,updated:1}},async putReplay(id,name,data){return {id,name,data,revision:1,updated:1,metadata,start_tick:0,end_tick:100,players:[1],sha256:'test'}},async autosave(save,name='Auto'){autosaves++;return {...save,id:'auto',name,kind:'auto',revision:autosaves,updated:1}}} satisfies SessionStorage}}

test('failed replacement retains live match, successful replacement disposes it once',async()=>{
 const a=new FakeOffline(),bad=new FakeOffline(),good=new FakeOffline();bad.loadFailure=true;const all=[a,bad,good],data=storage();
 const controller=new SessionController({store:data.store,makeOffline:()=>all.shift()!});await controller.startSolo(config);await controller.flushAutosave();assert.equal(data.autosaves,1);
 await assert.rejects(()=>controller.loadSave({data:new Uint8Array([9]),metadata,tick:100,hash:'x',local_players:[1]}),{code:'save_corrupt'});
 assert.equal(controller.transport,a);assert.equal(a.disposed,0);assert.equal(bad.disposed,1);assert.equal(controller.state.phase,'active');
 await controller.startSolo(config);assert.equal(a.disposed,1);assert.equal(controller.transport,good);controller.dispose();assert.equal(good.disposed,1);assert.equal(controller.state.phase,'closed');
});

test('a slower canceled launch cannot overwrite the latest session',async()=>{
 const gate=deferred<void>(),a=new FakeOffline(),b=new FakeOffline();let prepares=0;const all=[a,b],data=storage();
 const controller=new SessionController({store:data.store,makeOffline:()=>all.shift()!,prepare:async()=>{if(++prepares===1)await gate.promise}});
 const old=controller.startSolo(config),oldResult=assert.rejects(old,{code:'launch_canceled'});
 await controller.startSolo(config);const current=controller.transport;gate.resolve();await oldResult;
 assert.equal(controller.transport,current);assert.equal(controller.state.phase,'active');controller.dispose();
});

test('replay skips autosave, has read-only save/restart controls, and releases worker on menu',async()=>{
 const replay=new FakeOffline(),data=storage(),controller=new SessionController({store:data.store,makeOffline:()=>replay});
 await controller.playReplay(new Uint8Array([1]));replay.tick(150);await controller.flushAutosave();assert.equal(data.autosaves,0);assert.equal(controller.state.kind,'replay');
 await assert.rejects(()=>controller.saveManual('s','S'),{code:'save_unavailable'});await assert.rejects(()=>controller.restart(),{code:'restart_unavailable'});
 await controller.seekReplay(175);assert.equal(controller.state.info?.tick,175);controller.leave();assert.equal(replay.disposed,1);assert.equal(controller.state.phase,'menu');
});

test('manual save cannot write a newly selected session under an old request',async()=>{
 const a=new FakeOffline(),b=new FakeOffline(),all=[a,b],data=storage(),controller=new SessionController({store:data.store,makeOffline:()=>all.shift()!});
 await controller.startSolo(config);await controller.flushAutosave();const gate=deferred<SaveData>();a.saveGate=gate.promise;
 const writing=controller.saveManual('manual','Manual'),rejected=assert.rejects(writing,{code:'session_changed'});await controller.startSolo(config);
 gate.resolve({data:new Uint8Array([1]),metadata,tick:100,hash:'old',local_players:[1]});await rejected;assert.equal(data.manuals,0);controller.dispose();
});

test('new restart session has a new autosave identity and remains paused until UI resumes',async()=>{
 const a=new FakeOffline(),b=new FakeOffline(),all=[a,b],data=storage(),controller=new SessionController({store:data.store,makeOffline:()=>all.shift()!});
 await controller.startSolo({...config,ruleset:'practice-v1'});const first=controller.state.id;await controller.flushAutosave();await controller.restart();await controller.flushAutosave();
 assert.notEqual(controller.state.id,first);assert.equal(controller.state.info?.tick,0);assert.equal(b.paused,true);assert.equal(data.autosaves,2);await controller.resume();assert.equal(b.paused,false);controller.dispose();
});

test('observer replacement is read-only, may buffer without a snapshot, and never creates autosaves',async()=>{
 class FakeObserver extends RuntimeEvents{
  readonly mode='online' as const;current=undefined;disposed=false;
  async connect(){}async sendOrders():Promise<number>{throw new RuntimeError('observer_read_only','Read only')}
  async pause(){throw new RuntimeError('observer_read_only','Read only')}async resume(){throw new RuntimeError('observer_read_only','Read only')}
  dispose(){this.disposed=true;this.clearListeners()}
 }
 const observer=new FakeObserver(),data=storage(),controller=new SessionController({store:data.store,makeObserver:()=>observer});
 const connection:ObserverConnection={match_id:'test',player:1,token:'a'.repeat(64),delay_ticks:2400,read_only:true,protocol:1,simulation:'test',content_hash:'test',map_version:'1'};
 await controller.joinObserver('http://lan.test',connection,map);assert.equal(controller.state.kind,'observer');assert.equal(controller.state.phase,'active');assert.equal(controller.transport?.current,undefined);await controller.flushAutosave();assert.equal(data.autosaves,0);
 await assert.rejects(()=>controller.saveManual('observer','Not a save'),{code:'save_unavailable'});await assert.rejects(()=>controller.restart(),{code:'restart_unavailable'});await assert.rejects(()=>controller.pause(),{code:'observer_read_only'});controller.leave();assert.equal(observer.disposed,true);
});
