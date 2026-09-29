// Test-only observation. No globals/prototypes are installed by this module.
// Forwarding promises preserve native result/error objects and rejection. They
// add observation microtasks, so this instrumentation is not timing evidence.
export function nativeResponseTrace(fetcher,{scope,baseURL,now=()=>performance.now(),limit=20000,onRecord=()=>{}}){
 if(!scope||!Number.isSafeInteger(limit)||limit<1)throw Error('A document scope and bounded trace limit are required.');
 const base=new URL(baseURL),records=[],ordinals=new Map(),faults=[];let order=0,overflow=0;
 const fault=error=>{if(faults.length<16)faults.push(String(error));else overflow++};
 const update=(record,fields)=>{Object.assign(record,fields,{updatedOrder:++order});try{onRecord({...record})}catch(error){fault(error)}};
 const observe=(promise,success,failure)=>promise.then(value=>{try{success(value)}catch(error){fault(error)}return value},error=>{try{failure(error)}catch(traceError){fault(traceError)}throw error});
 function fetch(input,init){
  // Native dispatch happens exactly once with its original arguments. Metadata
  // inspection failures affect trace eligibility, never the underlying request.
  const promise=Reflect.apply(fetcher,this,arguments);let record,signal;
  try{
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,base);url.hash='';
   const method=String(init?.method??input?.method??'GET').toUpperCase();
   if(url.origin!==base.origin||!url.pathname.startsWith('/art/')||method!=='GET')return promise;
   if(records.length>=limit){overflow++;return promise}
   const key=method+' '+url.href,ordinal=(ordinals.get(key)??0)+1;ordinals.set(key,ordinal);
   record={scope,url:url.href,method,ordinal,startedAt:now(),startedOrder:++order,bytesRead:0,readCalls:0,readerCount:0};records.push(record);update(record,{});
   signal=init?.signal??input?.signal;
   if(signal){const aborted=()=>update(record,{signalAbortAt:now(),signalAbortOrder:order+1});if(signal.aborted)aborted();else signal.addEventListener('abort',aborted,{once:true})}
  }catch(error){fault(error);return promise}
  return observe(promise,response=>{
   update(record,{responseAt:now(),status:response.status,responseURL:response.url,redirected:response.redirected});
   const body=response.body;if(!body)return;
   const getReader=body.getReader;
   body.getReader=function(...args){
    const reader=Reflect.apply(getReader,this,args);update(record,{readerCount:record.readerCount+1,readerMode:args[0]?.mode??'default'});
    const read=reader.read,cancel=reader.cancel;
    reader.read=function(...readArgs){
     let pending;try{pending=Reflect.apply(read,this,readArgs)}catch(error){update(record,{readError:String(error),readErrorOrder:order+1});throw error}
     return observe(pending,result=>{
      record.readCalls++;if(result.done)update(record,{eofAt:now(),eofOrder:order+1});
      else record.bytesRead+=result.value.byteLength;
     },error=>update(record,{readError:String(error),readErrorOrder:order+1}));
    };
    reader.cancel=function(...cancelArgs){
     update(record,{cancelAt:now(),cancelOrder:order+1});
     let pending;try{pending=Reflect.apply(cancel,this,cancelArgs)}catch(error){update(record,{cancelError:String(error)});throw error}
     return observe(pending,()=>update(record,{cancelSettledOrder:order+1}),error=>update(record,{cancelError:String(error)}));
    };
    return reader;
   };
  },error=>update(record,{fetchError:String(error),fetchErrorOrder:order+1}));
 }
 return {fetch,snapshot:()=>({scope,records:records.map(record=>({...record})),faults:[...faults],overflow})};
}

// Full URL, method and document scope are mandatory. Network records must come
// from a verified page-target window-fetch stream, excluding workers, HTML
// images, XHR, service-worker responses and redirects. This module deliberately
// does not guess that identity from a URL or a nearby wall-clock timestamp.
export function reconcileNativeResponses({engine,failures,network,traces,served,expected}){
 const completedBodyAbortReports=[],unclassified=[],traceFault=traces.some(trace=>trace.overflow||trace.faults.length||trace.records.some(record=>record.scope!==trace.scope))||new Set(traces.map(trace=>trace.scope)).size!==traces.length;
 const key=value=>JSON.stringify([value.scope,value.method,value.url]);
 const reads=traces.flatMap(trace=>trace.records),groups=new Map();
 for(const read of reads){const k=key(read);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(read)}
 const reject=(failure,reason)=>unclassified.push({failure,reason});
 for(const failure of failures){
  if(traceFault){reject(failure,'trace-incomplete');continue}
  const candidates=network.filter(value=>value.id===failure.requestId);
  if(typeof failure.requestId!=='string'||!failure.requestId||candidates.length!==1||failures.filter(value=>value.requestId===failure.requestId).length!==1){reject(failure,'request-identity-missing-or-ambiguous');continue}
  const request=candidates[0];
  if(engine!=='chromium'||failure.message!=='net::ERR_ABORTED'||failure.url!==request.url||request.realm!=='window-fetch'||request.method!=='GET'||!request.scope){reject(failure,'unsupported-diagnostic-or-realm');continue}
  const group=(groups.get(key(request))??[]).sort((a,b)=>a.ordinal-b.ordinal),peers=network.filter(value=>key(value)===key(request));
  const serial=group.every((value,index)=>value.ordinal===index+1&&(index===0||value.startedOrder>(group[index-1].eofOrder??group[index-1].fetchErrorOrder??group[index-1].readErrorOrder??group[index-1].cancelSettledOrder??Infinity)));
  if(!serial||group.length!==peers.length||peers.some(value=>value.realm!=='window-fetch')||new Set(peers.map(value=>value.ordinal)).size!==peers.length||!peers.every(value=>Number.isInteger(value.ordinal)&&value.ordinal>=1&&value.ordinal<=peers.length)){
   reject(failure,'ordinal-cardinality-or-overlap-ambiguous');continue;
  }
  const read=group.find(value=>value.ordinal===request.ordinal),file=served.get(request.url),planned=expected.get(request.url);
  if(!read||read.readerCount!==1||read.readerMode!=='default'||read.status!==200||request.status!==200||read.redirected!==false||request.redirected!==false||request.fromServiceWorker!==false||read.responseURL!==request.url||request.responseURL!==request.url){reject(failure,'response-provenance-incomplete');continue}
  if(!file||!planned||file.immutable!==true||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes!==planned.bytes||file.sha256!==planned.sha256||!/^[a-f0-9]{64}$/.test(file.sha256)){reject(failure,'frozen-served-identity-unproved');continue}
  if(!read.eofOrder||read.bytesRead!==file.bytes||read.fetchError||read.readError||read.cancelError){reject(failure,'native-body-not-complete');continue}
  const cancelOrders=[read.signalAbortOrder,read.cancelOrder].filter(value=>value!==undefined);
  if(!cancelOrders.length||cancelOrders.some(value=>value<=read.eofOrder)){reject(failure,'no-observed-cancellation-after-eof');continue}
  completedBodyAbortReports.push({failure,request,nativeReader:read,served:file,meaning:'Native body reached EOF at expected size before an observed cancellation; not a successful decode or load claim.'});
 }
 return {completedBodyAbortReports,unclassified,total:failures.length,classified:completedBodyAbortReports.length+unclassified.length};
}
