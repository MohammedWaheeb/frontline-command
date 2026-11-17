import test from 'node:test';
import assert from 'node:assert/strict';
import {Application,ContentBusyLabels} from '../../src/app/application';
import {Observable} from '../../src/app/store';

function harness(flush:()=>Promise<void>,autosave='saving'){
 const app=Object.create(Application.prototype) as any,state:{id?:string;kind?:string;phase:string}={id:'old',kind:'solo',phase:'active'};let leaves=0;
 app.busyLabels=new ContentBusyLabels();app.progressPending=new Map();app.recordOfflineProgress=()=>{};app.recordOnlineProgress=()=>{};
 app.state=new Observable({page:'command',session:state,paused:false,autosave});app.editor={finishTest:()=>false};
 app.sessions={get state(){return state},flushAutosave:flush,leave:()=>{leaves++;state.id=undefined;state.kind=undefined;state.phase='menu'}};
 return {app,state,leaves:()=>leaves};
}
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('Return to command center completes when an autosave never answers and reports the unfinished checkpoint',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve}),h=harness(()=>held);let finished=false;
 const leaving=h.app.leave().then(()=>{finished=true});await turn();assert.equal(h.leaves(),0);
 t.mock.timers.tick(5000);await turn();assert.equal(finished,true,'a stuck autosave cannot trap menu navigation indefinitely');await leaving;
 assert.equal(h.leaves(),1);assert.equal(h.app.state.get().busy,undefined);assert.equal(h.app.state.get().paused,true);assert.match(h.app.state.get().notice,/autosave.*(finish|pending)|checkpoint/i);
 const notice=h.app.state.get().notice;release();await turn();assert.equal(h.leaves(),1);assert.equal(h.app.state.get().notice,notice,'a late completion cannot change the new menu state');
});

test('a completed autosave leaves immediately and a failed autosave retains a clear preservation notice',async()=>{
 for(const phase of ['saved','blocked']){
  const h=harness(async()=>{},phase);await h.app.leave();assert.equal(h.leaves(),1);assert.equal(h.app.state.get().error,undefined);
  if(phase==='saved')assert.equal(h.app.state.get().notice,undefined);else assert.match(h.app.state.get().notice,/autosave.*(finish|pending)|checkpoint/i);
 }
});

test('a delayed leave cannot close a replacement operation while autosave is stalled',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=harness(()=>new Promise(()=>{}));let finished=false;
 const leaving=h.app.leave().then(()=>{finished=true});await turn();h.state.id='new';t.mock.timers.tick(5000);await turn();assert.equal(finished,true);await leaving;
 assert.equal(h.leaves(),0);assert.equal(h.state.id,'new');assert.equal(h.app.state.get().error?.code,'session_changed');assert.equal(h.app.state.get().busy,undefined);
});

test('a manual save completes after leaving but its Saved notice cannot enter another session',async()=>{
 let commit!:(record:{name:string})=>void;const committed=new Promise<{name:string}>(resolve=>{commit=resolve}),h=harness(async()=>{},'saved');
 h.app.sessions.saveManual=()=>committed;const saving=h.app.save('Demo checkpoint');await turn();await h.app.leave();h.state.id='new';h.state.kind='solo';h.state.phase='active';
 const record={name:'Demo checkpoint'};commit(record);assert.equal(await saving,record,'the explicit save request still completes');assert.notEqual(h.app.state.get().notice,'Saved: Demo checkpoint');
 const same=harness(async()=>{},'saved');same.app.sessions.saveManual=async()=>record;await same.app.save('Demo checkpoint');assert.equal(same.app.state.get().notice,'Saved: Demo checkpoint','the originating operation retains its saved confirmation');
});
