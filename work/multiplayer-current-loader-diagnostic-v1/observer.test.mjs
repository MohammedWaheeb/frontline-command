import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {limits,auditCurrentLoaderBodies,publicURL} from './observer.mjs';
import {allArtConsumedBodyTrace} from './helpers/all-art-consumed-body-trace.mjs';
import {streamingSHA256} from './helpers/streaming-sha256.mjs';
const origin='http://127.0.0.1:12345',url=origin+'/art/page.png',hash=createHash('sha256').update('png-A').digest('hex'),descriptor={path:'/art/page.png',bytes:5,sha256:hash};
function fixture(){return {
 manifest:{files:[descriptor]},origin,packDescriptor:{path:'/assets/packs/base.json',bytes:2,sha256:createHash('sha256').update('{}').digest('hex')},
 snapshot:{faults:[],captureFailures:[],failures:[],network:[{id:'target:native1',nativeRequestId:'native1',scope:'doc1',method:'GET',url,ordinal:1,realm:'window-fetch',redirected:false,status:200,responseURL:url,fromServiceWorker:false,frameId:'frame1',proof:{targetId:'target',executionContextId:1,executionContextUniqueId:'unique',frameId:'frame1',observerURL:origin+'/observer.js'}}],traces:[{scope:'doc1',faults:[],overflow:0,records:[{scope:'doc1',url,method:'GET',ordinal:1,startedOrder:1,eofOrder:4,updatedOrder:5,completion:'explicit-native-reader',readerCount:1,readerMode:'default',bodyMethods:[],bytesRead:5,hashedBytes:5,sha256:hash,hashImplementation:'incremental-sha256-v1',status:200,redirected:false,responseURL:url,cdpObserved:{eofOrder:20}}],accounting:{activeHashes:0,retainedResponseChunkBytes:0,retainedBlobBytes:0,pendingBlobProofs:0,peakActiveHashes:1,totalHashedBytes:5,limits}}]}
 }}
test('requested hash/body/concurrency ceilings are explicit and finite',()=>{assert.equal(limits.maxBody,8*1024**2);assert.equal(limits.maxTotal,768*1024**2);assert.equal(limits.maxActive,16);assert.equal(limits.limit,16384)});
test('one exact original body may prove bytes while raw same-run abort remains failed',()=>{
 const value=fixture();value.snapshot.failures=[{requestId:'target:native1',url,message:'net::ERR_ABORTED',order:10}];value.playwrightFailures=[{url,message:'net::ERR_ABORTED'}];const result=auditCurrentLoaderBodies(value);
 assert.equal(result.rawStatus,'failed');assert.equal(result.bodyStatus,'passed-for-supported-static-readers');assert.equal(result.exactBodyFailureFacts.length,1);assert.equal(result.exactBodyFailureFacts[0].diagnostic.observedOrder,'network-failure-before-native-eof');assert.equal(result.allRawFailures.length,1);
});
test('wrong descriptor is never replaced by whichever bytes happened to match',()=>{const value=fixture();value.manifest.files=[{...descriptor,sha256:'f'.repeat(64)}];const result=auditCurrentLoaderBodies(value);assert.equal(result.coverage.complete,0);assert.equal(result.bodyStatus,'incomplete');assert.equal(result.exactBodyFailureFacts.length,0)});
test('EOF, realm, unique native ID, execution context, SW and nonoverlap are mandatory',()=>{
 for(const mutate of [v=>delete v.snapshot.traces[0].records[0].eofOrder,v=>v.snapshot.network[0].realm='unproven',v=>delete v.snapshot.network[0].proof,v=>v.snapshot.network.push({...v.snapshot.network[0]}),v=>v.snapshot.network[0].fromServiceWorker=true,v=>v.snapshot.traces[0].records.push({...v.snapshot.traces[0].records[0],ordinal:2,startedOrder:2})]){const value=fixture();mutate(value);const result=auditCurrentLoaderBodies(value);assert.equal(result.coverage.complete,0);assert.equal(result.exactBodyFailureFacts.length,0)}
});
test('unsupported native JSON remains listed, not turned into an original-byte proof',()=>{
 const value=fixture();value.snapshot.traces[0].records[0]={...value.snapshot.traces[0].records[0],completion:'native-json-fulfilled',readerCount:0,bodyMethods:['json'],unsupported:'native-json-does-not-expose-original-bytes'};
 const result=auditCurrentLoaderBodies(value);assert.equal(result.coverage.unsupported.length,1);assert.equal(result.coverage.complete,0);assert.equal(result.bodyStatus,'no-original-static-proof');
});
test('missing capture, overflow, open hashes and CDP/PW disagreement never pass strict diagnostics',()=>{
 for(const mutate of [v=>v.snapshot.captureFailures.push({reason:'closed-too-early'}),v=>v.snapshot.traces[0].overflow++,v=>v.snapshot.traces[0].accounting.activeHashes++,v=>v.playwrightFailures=[{url,message:'unpaired failure'}]]){const value=fixture();mutate(value);assert.equal(auditCurrentLoaderBodies(value).rawStatus,'failed')}
});
test('API query credentials are excluded; complete static URL identity is preserved',()=>{assert.equal(publicURL(origin+'/api/v1/matches/m?token=secret'),origin+'/api/v1/matches/m');assert.equal(publicURL(url+'?variant=1'),url+'?variant=1')});
test('original fetch/reader result identity is forwarded, with no clone or extra read',async()=>{
 let fetchCalls=0,readCalls=0;const chunk={value:new Uint8Array([1,2,3]),done:false},eof={value:undefined,done:true},reader={read(){readCalls++;return Promise.resolve(readCalls===1?chunk:eof)},cancel(){return Promise.resolve()}},response={status:200,url,redirected:false,body:{getReader(){return reader}}};
 const request={url},options={signal:new AbortController().signal};const observer=allArtConsumedBodyTrace(function(input,init){assert.equal(input,request);assert.equal(init,options);fetchCalls++;return Promise.resolve(response)},{...limits,scope:'unit',baseURL:origin,hashFactory:streamingSHA256});
 assert.equal(await observer.fetch(request,options),response);const actual=response.body.getReader();assert.equal(actual,reader);assert.equal(await actual.read(),chunk);assert.equal(await actual.read(),eof);await observer.finish();assert.equal(fetchCalls,1);assert.equal(readCalls,2);assert.equal(observer.snapshot().accounting.retainedResponseChunkBytes,0);
});
