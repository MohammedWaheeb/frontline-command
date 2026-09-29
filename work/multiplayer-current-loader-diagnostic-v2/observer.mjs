// Test-only before-navigation observer. No product/host patch, response clone,
// second body read, routing interception, retry or diagnostic suppression.
import {ConsumedBodyCDPLedger,reconcileConsumedBodies} from './helpers/native-consumed-body-cdp.mjs';
import {allArtConsumedBodyTrace} from './helpers/all-art-consumed-body-trace.mjs';
import {streamingSHA256} from './helpers/streaming-sha256.mjs';
export const limits=Object.freeze({limit:16384,maxBody:8*1024*1024,maxTotal:768*1024*1024,maxActive:16,maxBlob:8*1024*1024,maxBlobRetained:16*1024*1024});
export function publicURL(value){try{const url=new URL(value);if(url.pathname.startsWith('/api/')){url.search='';url.hash=''}return url.href}catch{return String(value)}}
export async function installCurrentLoaderObserver(page,{origin,stamp}){
 const session=await page.context().newCDPSession(page),{targetInfo}=await session.send('Target.getTargetInfo');if(targetInfo.type!=='page')throw Error('Page target required');
 const observerURL=new URL('/__diagnostics__/current-loader-native-reader.js',origin).href;
 const ledger=new ConsumedBodyCDPLedger({targetId:targetInfo.targetId,observerURL,limit:32768});
 for(const name of ['Runtime.executionContextCreated','Runtime.executionContextDestroyed','Runtime.executionContextsCleared','Runtime.bindingCalled','Debugger.scriptParsed','Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed'])session.on(name,value=>{
  // API queries are never evidence in this static-asset diagnostic. Preserve the
  // exact full URL for immutable static assets; do not retain credentials.
  if(name==='Network.requestWillBeSent')value={...value,request:{...value.request,url:publicURL(value.request.url)}};
  if(name==='Network.responseReceived')value={...value,response:{...value.response,url:publicURL(value.response.url)}};
  ledger.event(name,value,stamp());
 });
 for(const name of ['Runtime.enable','Debugger.enable','Network.enable','Page.enable'])await session.send(name);
 await session.send('Runtime.addBinding',{name:'__frontlineNativeResponseBinding'});
 const source=`(() => {
 const observe=${allArtConsumedBodyTrace.toString()},hashFactory=${streamingSHA256.toString()};
 const scope='current-loader:'+crypto.randomUUID(),emit=value=>window.__frontlineNativeResponseBinding(JSON.stringify({scope,...value}));emit({type:'document',url:location.href});
 const observer=observe(window.fetch,{scope,baseURL:location.href,hashFactory,paths:['/content/index.json','/assets/packs/base.json'],...${JSON.stringify(limits)},onRecord:record=>emit({type:'record',record})});window.fetch=observer.fetch;
 const snapshot=reason=>emit({type:'snapshot',reason,snapshot:observer.snapshot()});
 window.__currentLoaderNativeTrace={capture:async reason=>{await observer.finish();snapshot(reason)}};window.addEventListener('pagehide',()=>snapshot('pagehide'));snapshot('installed');
 })();\n//# sourceURL=${observerURL}`;
 await session.send('Page.addScriptToEvaluateOnNewDocument',{source});
 return {ledger,source,limits,async capture(reason){try{const response=await session.send('Runtime.evaluate',{expression:`window.__currentLoaderNativeTrace.capture(${JSON.stringify(reason)})`,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.text);await session.send('Runtime.evaluate',{expression:'0',returnByValue:true})}catch(error){ledger.captureFailures.push({reason,error:String(error)})}}};
}
const counts=values=>{const result=new Map();for(const value of values){const key=JSON.stringify([value.url,value.message]);result.set(key,(result.get(key)??0)+1)}return [...result].sort(([a],[b])=>a.localeCompare(b))};
export function auditCurrentLoaderBodies({snapshot,manifest,origin,packDescriptor,playwrightFailures=[],pageErrors=[],consoleErrors=[],httpErrors=[]}){
 // Expected identity is selected once before launch, never by the observed hash.
 const served=new Map([...manifest.files,packDescriptor].map(file=>[new URL(file.path,origin).href,{bytes:file.bytes,sha256:file.sha256}]));
 const reconciliation=reconcileConsumedBodies({snapshot,served,serverAdvice:[]});
 // The earlier helper's ordinal join is necessary but this successor also pins
 // the actual target/context proof and globally unique request identity.
 for(const proof of reconciliation.proofs){const request=proof.request,p=request?.proof;
  if(proof.complete&&(!request.id||!request.nativeRequestId||request.id!==`${p?.targetId}:${request.nativeRequestId}`||snapshot.network.filter(r=>r.id===request.id).length!==1||!p?.executionContextUniqueId||!Number.isInteger(p?.executionContextId)||!p?.frameId||p.frameId!==request.frameId||!p?.observerURL)){
   proof.complete=false;proof.reason='native-request-identity-unproved';
  }
 }
 reconciliation.knownNativeReports=reconciliation.knownNativeReports.filter(report=>report.proof.complete);
 const isStatic=proof=>proof.native.method==='GET'&&served.has(proof.native.url);
 const staticProofs=reconciliation.proofs.filter(isStatic);
 const supported=staticProofs.filter(proof=>['explicit-native-reader','native-arrayBuffer-fulfilled','native-bytes-fulfilled','native-blob-fulfilled'].includes(proof.native.completion));
 const supportedIncomplete=supported.filter(proof=>!proof.complete);
 const identityComplete=supported.filter(proof=>proof.complete&&proof.request?.id);
 const nativeCounts=counts(snapshot.failures),pwCounts=counts(playwrightFailures),diagnosticsAgree=JSON.stringify(nativeCounts)===JSON.stringify(pwCounts);
 const accounting=snapshot.traces.map(trace=>({scope:trace.scope,...trace.accounting}));
 const accountingFaults=accounting.flatMap(a=>!a.limits||a.activeHashes!==0||a.retainedResponseChunkBytes!==0||a.retainedBlobBytes!==0||a.pendingBlobProofs!==0||a.peakActiveHashes>limits.maxActive||a.totalHashedBytes>limits.maxTotal?[{scope:a.scope,reason:'observer-accounting-incomplete-or-exceeded'}]:[]);
 const faults=[...reconciliation.faults,...accountingFaults];
 const rawStatus=pageErrors.length||consoleErrors.length||httpErrors.length||snapshot.failures.length||playwrightFailures.length||faults.length||!diagnosticsAgree?'failed':'passed';
 const bodyStatus=faults.length?'failed':supportedIncomplete.length?'incomplete':identityComplete.length?'passed-for-supported-static-readers':'no-original-static-proof';
 const coveredIDs=new Set(identityComplete.map(proof=>proof.request.id));
 return {scope:'Same-run original static payload integrity only. All raw failures retain their strict status. No server-response completion, cancellation cause, decode or full-match inference.',limits,bodyStatus,rawStatus,diagnosticsAgree,nativeCounts,playwrightCounts:pwCounts,faults,accounting,reconciliation,
  coverage:{staticObserved:staticProofs.length,supported:supported.length,complete:identityComplete.length,supportedIncomplete:supportedIncomplete.map(proof=>({url:proof.native.url,ordinal:proof.native.ordinal,reason:proof.reason})),unsupported:staticProofs.filter(proof=>!supported.includes(proof)).map(proof=>({url:proof.native.url,ordinal:proof.native.ordinal,completion:proof.native.completion,reason:proof.reason})),unobservedRequests:snapshot.network.filter(request=>!coveredIDs.has(request.id)).map(request=>({requestId:request.id,url:request.url,type:request.type,realm:request.realm,reason:'No unique supported original static-body proof; includes browser-native and dynamic responses.'}))},
  exactBodyFailureFacts:reconciliation.knownNativeReports.filter(value=>served.has(value.proof.native.url)&&value.proof.native.method==='GET'),
  allRawFailures:snapshot.failures,unprovedRawFailures:snapshot.failures.filter(failure=>!coveredIDs.has(failure.requestId))};
}
