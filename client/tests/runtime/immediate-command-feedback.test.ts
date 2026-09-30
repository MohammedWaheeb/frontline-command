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

test('command pending feedback is synchronous while advisory permission remains unresolved',async()=>{
 const h=harness();let resolve!:(advice:CommandAffordances)=>void;h.respond(()=>new Promise(r=>{resolve=r}));
 const notifications:boolean[]=[];h.controller.state.subscribe(()=>notifications.push(h.controller.state.get().pending));
 const command=h.controller.execute({kind:'stop',entities:[1]});
 assert.equal(h.controller.state.get().pending,true,'Pending must be visible before any awaited advice');
 assert.equal(notifications.at(-1),true);assert.deepEqual(h.sent,[],'Pending cannot imply executed orders');
 for(let i=0;i<5&&!resolve;i++)await Promise.resolve();
 assert.equal(h.controller.state.get().pending,true);assert.deepEqual(h.sent,[]);
 resolve({tick:11,player:1,player_commands:[],entities:[{id:1,commands:['stop'],abilities:[],builds:[],trains:[],research:[]}]});
 await command;assert.equal(h.controller.state.get().pending,false);assert.equal(h.sent.length,1);assert.deepEqual(h.errors,[]);
});
