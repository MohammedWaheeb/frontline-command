import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {installMultiplayerDiagnostics} from './multiplayer-passive-diagnostics.mjs';
async function fixture(type='page'){
 const session=new EventEmitter(),calls=[];session.send=async method=>{calls.push(method);return method==='Target.getTargetInfo'?{targetInfo:{type,targetId:'page-A'}}:{}};
 const page=new EventEmitter();page.context=()=>({newCDPSession:async()=>session});let phase='combat';
 const collector=await installMultiplayerDiagnostics(page,()=>({phase}));
 const request=(id,url)=>session.emit('Network.requestWillBeSent',{requestId:id,request:{url,method:'GET'},type:'Fetch',frameId:'frame-A',loaderId:'document-A'});
 const fail=(id,url)=>{session.emit('Network.loadingFailed',{requestId:id,errorText:'net::ERR_ABORTED',canceled:true});page.emit('requestfailed',{url:()=>url,failure:()=>({errorText:'net::ERR_ABORTED'})})};
 return {session,page,collector,calls,request,fail,setPhase:value=>phase=value};
}
test('passive collector uses only page Network events, retains exact static request identity and late close failures',async()=>{
 const f=await fixture(),url='http://localhost/art/sprites/a.png?variant=2';f.request('1',url);f.session.emit('Network.responseReceived',{requestId:'1',response:{status:200,fromServiceWorker:false}});
 assert.equal(f.collector.snapshot().failures.length,0);f.setPhase('closing-browser-and-host');f.fail('1',url);
 const r=f.collector.snapshot();assert.equal(r.diagnosticsAgree,true);assert.equal(r.failures[0].url,url);assert.equal(r.failures[0].id,'page-A:1');assert.equal(r.failures[0].status,200);assert.equal(r.failures[0].frameId,'frame-A');assert.equal(r.failures[0].loaderId,'document-A');assert.equal(r.failures[0].phase,'closing-browser-and-host');assert(r.failures[0].failureOrder>r.failures[0].responseOrder);assert.deepEqual(f.calls,['Target.getTargetInfo','Network.enable']);
});
test('successful native transport notification never classifies a subsequent failure as benign',async()=>{
 const f=await fixture(),url='http://localhost/content/a.json';f.request('1',url);f.session.emit('Network.loadingFinished',{requestId:'1'});f.fail('1',url);
 const r=f.collector.snapshot();assert.equal(r.failures.length,1);assert(r.failures[0].failureOrder>r.failures[0].finishedOrder);assert.equal(r.failures[0].classification,undefined);assert.equal(r.failures[0].nativeEOF,undefined);
});
test('API queries are not persisted and mismatched independent diagnostics fail reconciliation',async()=>{
 const f=await fixture(),url='http://localhost/api/v1/advice?token=secret';f.request('1',url);f.session.emit('Network.loadingFailed',{requestId:'1',errorText:'net::ERR_ABORTED'});
 let r=f.collector.snapshot();assert.equal(r.diagnosticsAgree,false);assert(!JSON.stringify(r).includes('secret'));assert.equal(r.failures[0].url,'http://localhost/api/v1/advice');
 f.page.emit('requestfailed',{url:()=>url,failure:()=>({errorText:'net::ERR_ABORTED'})});assert.equal(f.collector.snapshot().diagnosticsAgree,true);
 f.page.emit('requestfailed',{url:()=>url,failure:()=>({errorText:'net::ERR_ABORTED'})});assert.equal(f.collector.snapshot().diagnosticsAgree,false);
});
test('request ledger exhaustion is explicit and remains a strict collector fault',async()=>{
 const f=await fixture();for(let i=0;i<=100000;i++)f.request(String(i),'http://localhost/art/a.png');
 const r=f.collector.snapshot();assert.equal(r.requests,100000);assert.deepEqual(r.faults,['Request trace limit exceeded']);
});
test('non-page target cannot silently provide an unrelated trace',async()=>{await assert.rejects(fixture('worker'),/Expected page target/)});
