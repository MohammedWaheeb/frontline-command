import {NativeResponseCDPLedger} from './native-response-cdp.mjs';
import {consumedBodyTrace,consumedBodyIntegrity} from './native-consumed-body-trace.mjs';
import {allArtConsumedBodyTrace,allArtBodyIntegrity} from './all-art-consumed-body-trace.mjs';
import {streamingSHA256} from './streaming-sha256.mjs';
export class ConsumedBodyCDPLedger extends NativeResponseCDPLedger {
 event(name,value,stamp){super.event(name,value,stamp);if(name==='Runtime.bindingCalled'&&value.name==='__frontlineNativeResponseBinding'){try{const p=JSON.parse(value.payload),d=this.documents.get(p.scope);if(p.type==='snapshot'&&d&&p.snapshot?.accounting)d.accounting=p.snapshot.accounting}catch{/* Parent records malformed messages. */}}}
 snapshot(){const s=super.snapshot();for(const t of s.traces)t.accounting=this.documents.get(t.scope)?.accounting;return s}
 record(doc,record,streamed=false){super.record(doc,record,streamed);if(streamed&&record?.sha256){const r=doc.records.get(JSON.stringify([record.url,record.method,record.ordinal]));if(r&&r.cdpObserved.hashOrder===undefined)r.cdpObserved.hashOrder=this.order}}
}
export async function installConsumedBodyCDP(page,{caseId,origin,paths,allArt=false,stamp=()=>({})}){
 const session=await page.context().newCDPSession(page),info=await session.send('Target.getTargetInfo');if(info.targetInfo.type!=='page')throw Error('Page target required');
 const observerURL=new URL(`__diagnostics__/consumed-body-${caseId}.js`,origin+'/').href,ledger=new ConsumedBodyCDPLedger({targetId:info.targetInfo.targetId,observerURL});
 for(const name of ['Runtime.executionContextCreated','Runtime.executionContextDestroyed','Runtime.executionContextsCleared','Runtime.bindingCalled','Debugger.scriptParsed','Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed'])session.on(name,value=>ledger.event(name,value,stamp()));
 for(const name of ['Runtime.enable','Debugger.enable','Network.enable','Page.enable'])await session.send(name);await session.send('Runtime.addBinding',{name:'__frontlineNativeResponseBinding'});
 const source=`(() => {
 const hashFactory=${streamingSHA256.toString()};const observe=${(allArt?allArtConsumedBodyTrace:consumedBodyTrace).toString()};const scope=${JSON.stringify(caseId)}+':'+crypto.randomUUID();
 const emit=payload=>window.__frontlineNativeResponseBinding(JSON.stringify({scope,...payload}));emit({type:'document',url:location.href});
 const observer=observe(window.fetch,{scope,hashFactory,baseURL:location.href,paths:${JSON.stringify(paths)},onRecord:record=>emit({type:'record',record})});window.fetch=observer.fetch;
 const snapshot=reason=>emit({type:'snapshot',reason,snapshot:observer.snapshot()});window.__consumedBodyTrace={finish:async reason=>{await observer.finish();snapshot(reason)}};
 window.addEventListener('pagehide',()=>snapshot('pagehide'));snapshot('installed');
 })();\n//# sourceURL=${observerURL}`;
 await session.send('Page.addScriptToEvaluateOnNewDocument',{source});
 return {ledger,source,async capture(reason){try{const r=await session.send('Runtime.evaluate',{expression:`window.__consumedBodyTrace.finish(${JSON.stringify(reason)})`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);await session.send('Runtime.evaluate',{expression:'0',returnByValue:true})}catch(error){ledger.captureFailures.push({reason,error:String(error)})}}};
}
const key=x=>JSON.stringify([x.scope,x.method,x.url]);
export function reconcileConsumedBodies({snapshot,served,serverAdvice=[]}){
 const native=snapshot.traces.flatMap(t=>t.records),proofs=[],faults=[...snapshot.faults,...snapshot.captureFailures,...snapshot.traces.flatMap(t=>t.faults),...snapshot.traces.filter(t=>t.overflow).map(()=>({reason:'native-trace-overflow'})),...serverAdvice.filter(r=>r.trace_overflow).map(()=>({reason:'server-trace-overflow'}))];
 for(const read of native){
  const row={native:read,complete:false},group=native.filter(r=>key(r)===key(read)).sort((a,b)=>a.ordinal-b.ordinal),peers=snapshot.network.filter(r=>key(r)===key(read));proofs.push(row);
  if(faults.length){row.reason='trace-incomplete';continue}
  const serial=group.every((r,i)=>r.ordinal===i+1&&(!i||r.startedOrder>(group[i-1].eofOrder??group[i-1].fetchErrorOrder??group[i-1].readErrorOrder??group[i-1].bodyMethodSettledOrder??group[i-1].bodyMethodErrorOrder??group[i-1].cancelSettledOrder??Infinity)));
  if(!serial||peers.length!==group.length||peers.some(r=>r.realm!=='window-fetch')||new Set(peers.map(r=>r.ordinal)).size!==peers.length){row.reason='request-ordinal-or-realm-ambiguous';continue}
  const request=peers.find(r=>r.ordinal===read.ordinal);if(!request||request.redirected||request.status!==200||request.fromServiceWorker!==false||request.responseURL!==read.url){row.reason='response-provenance-incomplete';continue}row.request=request;
  let expected=served.get(read.url);
  if(read.method==='POST'){
   const url=new URL(read.url),server=serverAdvice.filter(r=>r.method==='POST'&&r.path===url.pathname);row.server=server.find(r=>r.ordinal===read.ordinal);
   if(url.search||server.length!==group.length||!row.server||row.server.query_present||!row.server.handler_returned||row.server.write_error||row.server.status!==200||row.server.content_encoding){row.reason='server-advice-provenance-incomplete';continue}
   expected={bytes:row.server.bytes,sha256:row.server.sha256};
  }
  Object.assign(row,(read.hashImplementation?allArtBodyIntegrity:consumedBodyIntegrity)(read,expected));row.expected=expected;
  row.failures=snapshot.failures.filter(f=>f.requestId===request.id).map(f=>({failure:f,observedOrder:!Number.isInteger(read.cdpObserved?.eofOrder)?'native-eof-unobserved':f.order<read.cdpObserved.eofOrder?'network-failure-before-native-eof':'network-failure-after-native-eof',nativeCancellationObserved:['signalAbortOrder','cancelOrder'].filter(field=>read[field]!==undefined).map(field=>({field,nativeOrder:read[field],cdpObservedOrder:read.cdpObserved?.[field]}))}));
 }
 const knownNativeReports=proofs.filter(p=>p.complete).flatMap(p=>(p.failures??[]).filter(f=>f.failure.message==='net::ERR_ABORTED').map(f=>({requestId:p.request.id,proof:p,diagnostic:f,completion:p.native.completion??'explicit-native-reader',meaning:'Original native consumed bytes and completion match the immutable/server-written body. Raw platform diagnostic retained; no cancellation cause or successful decode inferred.'})));
 return {proofs,knownNativeReports,rawFailures:snapshot.failures,faults,meaning:'Separate data-integrity facts only. This does not change the original strict course or waive unobserved/incomplete requests.'};
}

// Only the deliberately faulting, uniquely addressed controls can account for
// these exact browser diagnostics. App resources and unrelated errors never do.
export function explicitControlDiagnostics({controls,consoleErrors,failures}){
 const codes={network:'net::ERR_EMPTY_RESPONSE',truncated:'net::ERR_CONTENT_LENGTH_MISMATCH',cancel:'net::ERR_ABORTED'};
 const proven=(url,message)=>controls.some(c=>c.url===url&&c.error&&codes[c.kind]===message);
 const expectedConsole=[],unexpectedConsole=[];
 for(const entry of consoleErrors){const prefix='Failed to load resource: ';const code=entry.message.startsWith(prefix)?entry.message.slice(prefix.length):'';(proven(entry.location?.url,code)?expectedConsole:unexpectedConsole).push(entry)}
 const expectedNetwork=[],otherNetwork=[];
 for(const entry of failures)(proven(entry.url,entry.message)?expectedNetwork:otherNetwork).push(entry);
 return {expectedConsole,unexpectedConsole,expectedNetwork,otherNetwork};
}
