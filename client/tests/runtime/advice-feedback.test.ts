import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,PlayerSummarySchema,EntitySchema,VecSchema,EntityPrivateSchema} from '../../src/protocol/frontline_pb';
import {adviceFeedback} from '../../src/app/advice-feedback';
import {BattleController} from '../../src/app/battle-controller';
import {Observable} from '../../src/app/store';
import {RuntimeError} from '../../src/runtime/errors';
import type {Application} from '../../src/app/application';
import type {CommandAffordances,PlayerSnapshot} from '../../src/runtime/types';

function harness(){
 const errors:unknown[]=[],patches:Array<{notice?:string}>=[],sent:unknown[]=[];
 const state=new Observable<{notice?:string}>({});let resolve:()=>Promise<CommandAffordances>=async()=>({tick:10,player:1,player_commands:[],entities:[]});
 const app={state,sessions:{state:{id:'test-session',kind:'online'},transport:{mode:'online',sendOrders:async(orders:unknown)=>{sent.push(orders);return sent.length}},subscribe:()=>()=>{}},commandAdvice:()=>({cancel:()=>{},affordances:()=>resolve(),preview:async(orders:unknown[])=>({tick:11,results:orders.map((_order,index)=>({tick:11,player:1,sequence:0,index,accepted:true,code:'indeterminate'}))})}),patch:(patch:{notice?:string})=>{patches.push(patch);state.update(value=>({...value,...patch}))},error:(error:unknown)=>errors.push(error)} as unknown as Application;
 const controller=new BattleController(app,()=>{},()=>{});
 const view=create(PlayerSnapshotSchema,{tick:10,player:1,players:[create(PlayerSummarySchema,{id:1,team:1,faction:'US'})],entities:[create(EntitySchema,{id:1,owner:1,type:'US.rifle',position:create(VecSchema,{x:5000,y:5000}),health:1000,complete:true,enabled:true,private:create(EntityPrivateSchema,{hp:100000n})})]});
 // Controller integration unit test: this does not create or mutate a game.
 (controller as unknown as {snapshot:PlayerSnapshot}).snapshot=view;
 controller.selection.reconcile(view,'test-session');
 controller.state.update(value=>({...value,productionSource:2,production:[{type:'US.rifle',kind:'train',producer:2,available:true}]}));
 return {controller,state,errors,patches,sent,respond:(next:()=>Promise<CommandAffordances>)=>{resolve=next}};
}

test('only explicit recoverable advisor failures become nonblocking feedback',()=>{
 for(const code of ['advice_timeout','advice_busy','advice_rate_exceeded','advice_unavailable']){
  assert.equal(adviceFeedback(new RuntimeError(code,'Host response'),'background').kind,'temporary');
  assert.match((adviceFeedback(new RuntimeError(code,'Host response'),'command') as {message:string}).message,/Order not sent/);
 }
 for(const error of [new Error('Texture destroyed'),new RuntimeError('invalid_advice','Malformed response'),new RuntimeError('match_authentication_required','Sign in'),new RuntimeError('advice_timeout','Not recoverable',false),{code:{toString:()=>{throw Error('Do not coerce')}}},null])assert.equal(adviceFeedback(error,'background').kind,'error');
 assert.equal(adviceFeedback(new RuntimeError('targeting_changed','Canceled'),'background').kind,'ignore');
});

test('background timeout never opens global error dialog; stale production is disabled and later Go advice restores it',async()=>{
 const h=harness();h.respond(async()=>{throw new RuntimeError('advice_timeout','Command advice timed out.')});
 await h.controller.refresh();assert.deepEqual(h.errors,[]);assert.match(h.state.get().notice!,/Retrying/);assert.equal(h.controller.state.get().production[0].available,false);assert.equal(h.controller.state.get().production[0].reason,h.state.get().notice);
 await h.controller.refresh();assert.equal(h.patches.length,1,'Repeated failures must not repeatedly interrupt with notices');
 h.respond(async()=>({tick:11,player:1,player_commands:[],entities:[{id:2,commands:[],abilities:[],builds:[],trains:['US.rifle'],research:[],production_status:[{kind:'train',type:'US.rifle',code:'ok'}]}]}));
 await h.controller.refresh();assert.equal(h.controller.state.get().adviceUnavailable,undefined);assert.equal(h.controller.state.get().production[0].available,true);assert.equal(h.state.get().notice,undefined);assert.deepEqual(h.errors,[]);
});

test('recovery preserves newer unrelated notices and unrelated failures still reach global error path',async()=>{
 const h=harness();h.respond(async()=>{throw new RuntimeError('advice_busy','Busy')});await h.controller.refresh();h.state.set({notice:'Save stored.'});h.respond(async()=>({tick:12,player:1,entities:[],player_commands:[]}));await h.controller.refresh();assert.equal(h.state.get().notice,'Save stored.');
 const failure=new RuntimeError('invalid_advice','Malformed host reply');h.respond(async()=>{throw failure});await h.controller.refresh();assert.deepEqual(h.errors,[failure]);
});

test('a late failure for an obsolete selection does not change controls or notices',async()=>{
 const h=harness();let reject!:(error:unknown)=>void;h.respond(()=>new Promise((_resolve,r)=>{reject=r}));const pending=h.controller.refresh();
 h.controller.cancel();reject(new RuntimeError('advice_timeout','Late response'));await pending;assert.deepEqual(h.errors,[]);assert.deepEqual(h.patches,[]);assert.equal(h.controller.state.get().production[0].available,true);
});

test('explicit order advice failure sends nothing and never automatically resubmits the command',async()=>{
 const h=harness();h.respond(async()=>{throw new RuntimeError('advice_timeout','Timed out')});
 await h.controller.execute({kind:'stop',entities:[1]});assert.deepEqual(h.sent,[]);assert.deepEqual(h.errors,[]);assert.equal(h.controller.state.get().pending,false);assert.match(h.state.get().notice!,/Order not sent/);
 h.respond(async()=>({tick:11,player:1,player_commands:[],entities:[{id:1,commands:['stop'],abilities:[],builds:[],trains:[],research:[]}]}));
 await h.controller.refresh();assert.deepEqual(h.sent,[],'Recovering options must not replay a user order');
 await h.controller.execute({kind:'stop',entities:[1]});assert.equal(h.sent.length,1);assert.deepEqual(h.errors,[]);assert.equal(h.state.get().notice,undefined);
});
