import test from 'node:test';
import assert from 'node:assert/strict';
import {ModerationController,isLoopbackHost} from '../../src/app/moderation-controller';
const token='b'.repeat(64),report={id:'r1',owner:'reporter-one',match_id:'m1',tick:200,reason:'Review this incident',created:10,revision:0,decision:'pending'};
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}
test('operator credential remains memory-only, reviews use displayed revision and locking drops all evidence',async()=>{
 const old=fetch,requests:Array<{path:string;body:any;auth:string|null}>=[];let current={...report},reviews:any[]=[];
 globalThis.fetch=(async(input,init={})=>{const path=new URL(String(input)).pathname,body=init.body?JSON.parse(String(init.body)):undefined;requests.push({path,body,auth:new Headers(init.headers).get('Authorization')});if(path.endsWith('/reviews')){assert.equal(body.expected_revision,current.revision);const review={revision:++current.revision,decision:body.decision,note:body.note,reviewed:20};current={...current,decision:body.decision};reviews=[review];return json(review)}if(path.endsWith('/r1'))return json({report:current,reviews});return json({reports:[current],next_cursor:''})}) as typeof fetch;
 const controller=new ModerationController();try{controller.setHost('http://127.0.0.1:8080');assert.equal(await controller.unlock(token),true);assert.equal(JSON.stringify(controller).includes(token),false);await controller.select('r1');assert.equal(await controller.review('confirmed','Replay confirms the incident.'),true);assert.equal(controller.state.get().detail?.report.revision,1);assert.ok(requests.every(value=>value.auth===`Bearer ${token}`));controller.lock();assert.equal(controller.state.get().reports.length,0);assert.equal(controller.state.get().detail,undefined);assert.equal(controller.state.get().unlocked,false)}finally{controller.dispose();globalThis.fetch=old}
});
test('operator never sends credential to LAN or deceptively named hosts; malformed tokens stay local',async()=>{
 const old=fetch;let calls=0;globalThis.fetch=(async()=>{calls++;return json({reports:[],next_cursor:''})}) as typeof fetch;
 const controller=new ModerationController();try{for(const host of ['http://192.168.1.2:8080','http://localhost.example.test','https://127.0.0.1.example.test','https://user:secret@localhost']){assert.equal(isLoopbackHost(host),false);controller.setHost(host);assert.equal(await controller.unlock(token),false)}controller.setHost('http://[::1]:8080');assert.equal(await controller.unlock('Bearer '+token),false);assert.equal(calls,0)}finally{controller.dispose();globalThis.fetch=old}
});
test('locking during a pending privileged request discards its response and does not resurrect operator state',async()=>{
 const old=fetch;let resolve!:(response:Response)=>void;globalThis.fetch=(()=>new Promise<Response>(done=>resolve=done)) as typeof fetch;
 const controller=new ModerationController();try{controller.setHost('http://localhost:8080');const pending=controller.unlock(token);controller.lock();resolve(json({reports:[report],next_cursor:''}));assert.equal(await pending,false);assert.equal(controller.state.get().unlocked,false);assert.deepEqual(controller.state.get().reports,[])}finally{controller.dispose();globalThis.fetch=old}
});
test('stale review keeps concrete evidence and requires explicit reload; writes are never retried automatically',async()=>{
 const old=fetch;let writes=0;globalThis.fetch=(async(input,init={})=>{const path=new URL(String(input)).pathname;if(init.method==='POST'){writes++;return json({code:'review_conflict',message:'Reload this report.'},409)}return json(path.endsWith('/r1')?{report,reviews:[]}:{reports:[report],next_cursor:''})}) as typeof fetch;
 const controller=new ModerationController();try{controller.setHost('http://localhost:8080');await controller.unlock(token);await controller.select('r1');assert.equal(await controller.review('dismissed','Insufficient evidence.'),false);assert.equal(writes,1);assert.equal(controller.state.get().detail?.report.revision,0);assert.equal(controller.state.get().error?.code,'review_conflict')}finally{controller.dispose();globalThis.fetch=old}
});
test('revoked operator credential clears previously loaded private evidence on server denial',async()=>{
 const old=fetch;let revoked=false;globalThis.fetch=(async(input)=>revoked?json({code:'local_moderator_required',message:'Operator credential required.'},403):json(new URL(String(input)).pathname.endsWith('/r1')?{report,reviews:[]}:{reports:[report],next_cursor:''})) as typeof fetch;
 const controller=new ModerationController();try{controller.setHost('http://localhost:8080');await controller.unlock(token);await controller.select('r1');revoked=true;assert.equal(await controller.list(),false);assert.equal(controller.state.get().unlocked,false);assert.equal(controller.state.get().detail,undefined);assert.deepEqual(controller.state.get().reports,[])}finally{controller.dispose();globalThis.fetch=old}
});
