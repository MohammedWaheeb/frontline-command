import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const base=path.resolve('work/audio-generation-retry-v1'),file=path.join(base,'browser-chrome-03/browser.json'),bytes=await readFile(file),x=JSON.parse(bytes),t=x.nativeTraceAfterDispose;
assert.deepEqual(t.faults,[]);for(const key of ['overflow','pendingHashes','copiedBytes'])assert.equal(t[key],0);
const proof=t.records.map(record=>{
 const requests=x.requests.filter(value=>value.url===record.url&&value.method===record.method&&value.ordinal===record.ordinal);assert.equal(requests.length,1);
 const served=x.served.filter(value=>value.path===new URL(record.url).pathname)[record.ordinal-1];assert(served);
 const result={requestId:requests[0].id,url:record.url,method:record.method,ordinal:record.ordinal,servedId:served.id};
 if(served.held){
  assert(record.signalAbortOrder&&record.fetchError);assert.equal(record.bytesRead,0);assert(x.expectedIntentionalCancelRequestIds.includes(requests[0].id));
  Object.assign(result,{category:'controlled-pending-request-aborted',bytesRead:0,signalAbortOrder:record.signalAbortOrder,fetchError:record.fetchError,serverCanceledBeforeWrite:!!served.canceledBeforeWrite,serverEndCalled:!!served.finished});
 }else{
  assert.equal(record.status,200);assert.equal(record.redirected,false);assert.equal(record.responseURL,record.url);assert.equal(record.readerCount,1);assert.equal(record.readerMode,'default');assert(record.eofOrder);
  assert.equal(record.bytesRead,served.bytes);assert.equal(record.sha256,served.sha256);for(const key of ['fetchError','readError','hashError','hashOverflow'])assert(!record[key]);
  Object.assign(result,{category:'native-eof-and-exact-consumed-bytes',bytes:record.bytesRead,sha256:record.sha256,eofOrder:record.eofOrder});
 }
 result.rawRequestFailures=x.requestFailures.filter(value=>value.id===requests[0].id).map(value=>value.failure);
 if(result.rawRequestFailures.length&&!served.held)result.causation='Unexplained; exact bytes do not waive this diagnostic. Relative browser-failure/native-EOF ordering was not collected on one clock.';
 return result;
});
const receipt={scope:'Post-close independent audit; original receipt/result unchanged',functional:x.functional,strict:x.status,browser:x.browser,browserReceiptSHA256:createHash('sha256').update(bytes).digest('hex'),sourceLockSHA256:createHash('sha256').update(await readFile(path.join(base,'source-lock-v1.json'))).digest('hex'),finalTraceBudget:Object.fromEntries(Object.entries(t).filter(([key])=>key!=='records')),uniqueRequestAndBodyProof:proof,cleanup:x.cleanup.statistics,contextState:x.cleanup.closedContext,chromeExit:x.chromeExit,processCheck:'No task-specific browser or runner remained on post-close process inspection.',auditCorrection:'Initial manual audit incorrectly required both held server responses to close before writing. In actual Request13, release called server res.end after client fetch had already rejected. Client signal/rejection/zero consumed bytes is proven, server pre-write close is not claimed for Request13.'};
await writeFile(path.join(base,'evidence/browser-postclose-audit.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({records:proof.length,exactBodies:proof.filter(value=>value.category==='native-eof-and-exact-consumed-bytes').length,controlledCancellations:proof.filter(value=>value.category==='controlled-pending-request-aborted').length,strict:x.status}));
