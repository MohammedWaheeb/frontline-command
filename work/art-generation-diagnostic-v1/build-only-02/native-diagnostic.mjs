// Test-only passive observer. Original fetch arguments/read results preserved.
import {ConsumedBodyCDPLedger} from './helpers/native-consumed-body-cdp.mjs';
import {allArtConsumedBodyTrace,allArtBodyIntegrity} from './helpers/all-art-consumed-body-trace.mjs';
import {streamingSHA256} from './helpers/streaming-sha256.mjs';
const limits={limit:512,maxBody:1024*1024,maxTotal:32*1024*1024,maxActive:8,maxBlob:1024*1024,maxBlobRetained:2*1024*1024};
export async function installGenerationDiagnostic(page,{caseId,origin,stamp}){
 const session=await page.context().newCDPSession(page),info=await session.send('Target.getTargetInfo');
 if(info.targetInfo.type!=='page')throw Error('Native page target required');
 const observerURL=new URL('/__diagnostics__/generation-'+caseId+'.js',origin).href;
 const ledger=new ConsumedBodyCDPLedger({targetId:info.targetInfo.targetId,observerURL,limit:4096});
 for(const name of ['Runtime.executionContextCreated','Runtime.executionContextDestroyed','Runtime.executionContextsCleared','Runtime.bindingCalled','Debugger.scriptParsed','Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed'])session.on(name,value=>ledger.event(name,value,stamp()));
 for(const name of ['Runtime.enable','Debugger.enable','Network.enable','Page.enable'])await session.send(name);
 await session.send('Runtime.addBinding',{name:'__frontlineNativeResponseBinding'});
 const source=`(() => {
 const hashFactory=${streamingSHA256.toString()},observe=${allArtConsumedBodyTrace.toString()};
 const scope=${JSON.stringify(caseId)}+':'+crypto.randomUUID();
 const emit=payload=>window.__frontlineNativeResponseBinding(JSON.stringify({scope,...payload}));emit({type:'document',url:location.href});
 const observer=observe(window.fetch,{scope,hashFactory,baseURL:location.href,paths:['/upgrade/retired.txt','/upgrade/shared.txt','/upgrade/hold.bin'],...${JSON.stringify(limits)},onRecord:record=>emit({type:'record',record})});window.fetch=observer.fetch;
 const snapshot=reason=>emit({type:'snapshot',reason,snapshot:observer.snapshot()});window.__generationNativeTrace={finish:async reason=>{await observer.finish();snapshot(reason)}};
 window.addEventListener('pagehide',()=>snapshot('pagehide'));snapshot('installed');
 })();\n//# sourceURL=${observerURL}`;
 await session.send('Page.addScriptToEvaluateOnNewDocument',{source});
 return {ledger,source,limits,async capture(reason){try{const result=await session.send('Runtime.evaluate',{expression:`window.__generationNativeTrace.finish(${JSON.stringify(reason)})`,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);await session.send('Runtime.evaluate',{expression:'0',returnByValue:true})}catch(error){ledger.captureFailures.push({reason,error:String(error)})}}};
}
const groupKey=value=>JSON.stringify([value.scope,value.method,value.url]);
/** Narrow diagnostic only. Never changes strict failure status or infers the
 * cause of an ERR_ABORTED. The planned body is fixed per exact scenario, not
 * selected by matching whichever hash arrived. Server finish is not an input. */
export function reconcileGenerationDiagnostic({snapshots,playwrightFailures,planned}){
 const network=snapshots.flatMap(s=>s.network),traces=snapshots.flatMap(s=>s.traces),native=traces.flatMap(t=>t.records),failures=snapshots.flatMap(s=>s.failures);
 const faults=[...snapshots.flatMap(s=>s.faults),...snapshots.flatMap(s=>s.captureFailures),...traces.flatMap(t=>t.faults),...traces.filter(t=>t.overflow).map(()=>({reason:'observer-overflow'}))];
 if(new Set(traces.map(t=>t.scope)).size!==traces.length)faults.push({reason:'duplicate-document-scope'});
 const targets=network.filter(request=>planned.some(p=>request.stamp?.phase===p.phase&&new URL(request.url).pathname===p.path&&request.method==='GET'));
 const proofs=targets.map(request=>{
  const result={request,complete:false},plan=planned.find(p=>request.stamp?.phase===p.phase&&new URL(request.url).pathname===p.path);result.expected=plan;
  if(faults.length){result.reason='incomplete-trace';return result}
  if(!request.id||network.filter(r=>r.id===request.id).length!==1||failures.filter(f=>f.requestId===request.id).length>1||request.realm!=='window-fetch'||!request.scope||!request.proof){result.reason='native-request-identity-unproved';return result}
  const reads=native.filter(r=>groupKey(r)===groupKey(request)).sort((a,b)=>a.ordinal-b.ordinal),peers=network.filter(r=>groupKey(r)===groupKey(request));
  const serial=reads.every((r,i)=>r.ordinal===i+1&&(!i||r.startedOrder>(reads[i-1].eofOrder??reads[i-1].fetchErrorOrder??reads[i-1].readErrorOrder??reads[i-1].bodyMethodSettledOrder??reads[i-1].bodyMethodErrorOrder??reads[i-1].cancelSettledOrder??Infinity)));
  if(!serial||reads.length!==peers.length||peers.some(r=>r.realm!=='window-fetch')||new Set(peers.map(r=>r.ordinal)).size!==peers.length||peers.some(r=>!Number.isInteger(r.ordinal)||r.ordinal<1||r.ordinal>peers.length)){result.reason='ordinal-cardinality-or-overlap-ambiguous';return result}
  const read=reads.find(r=>r.ordinal===request.ordinal);result.native=read;
  if(!read||request.redirected!==false||request.status!==200||request.fromServiceWorker!==false||request.responseURL!==request.url){result.reason='response-provenance-unproved';return result}
  Object.assign(result,allArtBodyIntegrity(read,plan));
  result.failures=failures.filter(f=>f.requestId===request.id).map(f=>({failure:f,relativeEOFOrder:!Number.isInteger(read.cdpObserved?.eofOrder)?'unobserved':f.order<read.cdpObserved.eofOrder?'failure-before-native-eof':'failure-after-native-eof',cancellation:['signalAbortOrder','cancelOrder'].filter(key=>read[key]!==undefined).map(key=>({kind:key,nativeOrder:read[key],observedOrder:read.cdpObserved?.[key]}))}));
  return result;
 });
 const counts=values=>{const map=new Map();for(const value of values){const key=JSON.stringify([value.url,value.message??value.reason]);map.set(key,(map.get(key)??0)+1)}return [...map].sort(([a],[b])=>a.localeCompare(b))};
 const nativeCounts=counts(failures),playwrightCounts=counts(playwrightFailures),diagnosticsAgree=JSON.stringify(nativeCounts)===JSON.stringify(playwrightCounts);
 const exactBodyReports=proofs.filter(p=>p.complete).flatMap(p=>(p.failures??[]).filter(f=>f.failure.message==='net::ERR_ABORTED').map(f=>({requestId:p.request.id,phase:p.request.stamp.phase,nativeOrdinal:p.native.ordinal,bytes:p.native.bytesRead,sha256:p.native.sha256,...f,meaning:'Exact original consumed bytes reached native EOF for this uniquely identified request. Raw error remains; cancellation cause, successful decode and strict course pass are not inferred.'})));
 return {scope:'Three predefined abort scenarios only; passive bounded original-consumer observation, no response clone/replacement/retry or server-finished inference.',limits,faults,diagnosticsAgree,nativeCounts,playwrightCounts,proofs,exactBodyReports,allRawFailures:failures,unprovenRawFailures:failures.filter(f=>!exactBodyReports.some(p=>p.requestId===f.requestId)),missingPlannedScenarios:planned.filter(p=>!proofs.some(r=>r.request.stamp.phase===p.phase&&new URL(r.request.url).pathname===p.path)).map(p=>p.phase)};
}
