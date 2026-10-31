import test from 'node:test';
import assert from 'node:assert/strict';
import {Application} from '../../src/app/application';
import {Observable} from '../../src/app/store';

test('R1-04: opening a rematch leaves the finished session before routing to the lobby',async()=>{
 const app=Object.create(Application.prototype) as any,events:string[]=[];
 app.state=new Observable({page:'command',session:{kind:'online',phase:'active'}});app.sessions={state:{kind:'online',phase:'active'}};
 app.leave=async()=>{events.push('leave');app.sessions.state={phase:'menu'};app.patch({page:'command',session:app.sessions.state})};
 app.state.subscribe(()=>events.push(app.state.get().page));await app.openNetworkLobby();assert.deepEqual(events,['leave','command','network']);assert.equal(app.sessions.state.kind,undefined);
});
test('R1-04: a failed leave preserves the result and never routes over the live session',async()=>{
 const app=Object.create(Application.prototype) as any;app.state=new Observable({page:'command',session:{kind:'online',phase:'active'}});app.sessions={state:{kind:'online',phase:'active'}};app.leave=async()=>{};
 await assert.rejects(app.openNetworkLobby(),{code:'session_active'});assert.equal(app.state.get().page,'command');assert.equal(app.sessions.state.kind,'online');
});
test('R1-04: accepting a rematch from menus routes directly without a redundant leave',async()=>{
 const app=Object.create(Application.prototype) as any;app.state=new Observable({page:'command',session:{phase:'menu'}});app.sessions={state:{phase:'menu'}};app.leave=()=>assert.fail('no session to leave');await app.openNetworkLobby();assert.equal(app.state.get().page,'network');
});
test('R1-01: public opponent presence preserves the existing team-only disconnect audio input',()=>{
 const app=Object.create(Application.prototype) as any,heard:number[][]=[];
 app.state=new Observable({page:'command',session:{kind:'online',phase:'active'}});
 app.network={state:new Observable({account:{profile:{id:'self'}},lobby:{slots:[{profile:'self',player:1,team:1},{profile:'ally',player:2,team:1},{profile:'enemy',player:3,team:2}]}})};
 app.audioDirector={status:(status:any)=>heard.push(status.teammates.map((peer:any)=>peer.player)),setPaused:()=>{}};
 app.sessionEvent({type:'runtime',session:'current',event:{type:'status',status:{paused:false,teammates:[{player:1,connected:true},{player:2,connected:false},{player:3,connected:false}]}}});
 assert.deepEqual(heard,[[1,2]]);
});
