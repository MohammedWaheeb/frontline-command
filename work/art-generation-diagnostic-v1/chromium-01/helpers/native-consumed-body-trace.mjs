// Diagnostic-only observation of the ORIGINAL native reader results. No clone,
// second read, retry, caller cancellation, replacement error or lock operation.
// Selected chunks are copied for a bounded WebCrypto digest; this adds overhead.
export function consumedBodyTrace(fetcher,{scope,baseURL,paths=[],limit=512,maxBody=2*1024*1024,maxCopied=16*1024*1024,onRecord=()=>{},digest=bytes=>crypto.subtle.digest('SHA-256',bytes),now=()=>performance.now()}){
 if(!scope||![limit,maxBody,maxCopied].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Document scope and positive bounded observer limits required');
 const base=new URL(baseURL),selected=new Set(paths),records=[],faults=[],ordinals=new Map(),pending=new Set(),listeners=[];let order=0,copied=0,overflow=0;
 const fault=error=>{if(faults.length<32)faults.push(String(error));else overflow++};
 const update=(record,fields)=>{Object.assign(record,fields,{updatedOrder:++order});try{onRecord({...record})}catch(error){fault(error)}};
 const observe=(promise,ok,bad)=>promise.then(value=>{try{ok(value)}catch(error){fault(error)}return value},error=>{try{bad(error)}catch(traceError){fault(traceError)}throw error});
 function fetch(input,init){
  const promise=Reflect.apply(fetcher,this,arguments);let record,signal;
  try{
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,base);url.hash='';const method=String(init?.method??input?.method??'GET').toUpperCase();
   const advice=method==='POST'&&/^\/api\/v1\/matches\/[a-z0-9-]+\/advice$/.test(url.pathname)&&!url.search;
   if(url.origin!==base.origin||!(method==='GET'&&selected.has(url.pathname)||advice))return promise;
   if(records.length>=limit){overflow++;return promise}
   const key=method+' '+url.href,ordinal=(ordinals.get(key)??0)+1;ordinals.set(key,ordinal);
   record={scope,url:url.href,method,ordinal,startedAt:now(),startedOrder:++order,bytesRead:0,readCalls:0,readerCount:0};records.push(record);update(record,{});
   signal=init?.signal??input?.signal;
   if(signal){const aborted=()=>update(record,{signalAbortAt:now(),signalAbortOrder:order+1});if(signal.aborted)aborted();else{signal.addEventListener('abort',aborted,{once:true});listeners.push(()=>signal.removeEventListener('abort',aborted))}}
  }catch(error){fault(error);return promise}
  return observe(promise,response=>{
   update(record,{responseAt:now(),status:response.status,responseURL:response.url,redirected:response.redirected});const body=response.body;if(!body)return;
   const getReader=body.getReader;
   body.getReader=function(...args){
    const reader=Reflect.apply(getReader,this,args);update(record,{readerCount:record.readerCount+1,readerMode:args[0]?.mode??'default'});
    const read=reader.read,cancel=reader.cancel,chunks=[];let retained=0,hashed=false;
    reader.read=function(...readArgs){
     let promise;try{promise=Reflect.apply(read,this,readArgs)}catch(error){update(record,{readError:String(error),readErrorOrder:order+1});throw error}
     return observe(promise,result=>{
      record.readCalls++;
      if(!result.done){
       const n=result.value.byteLength;record.bytesRead+=n;
       if(record.hashOverflow||record.bytesRead>maxBody||copied+n>maxCopied){record.hashOverflow=true;copied-=retained;retained=0;chunks.length=0;update(record,{});return}
       const copy=new Uint8Array(result.value.buffer,result.value.byteOffset,n).slice();chunks.push(copy);retained+=n;copied+=n;return;
      }
      if(hashed)return;hashed=true;update(record,{eofAt:now(),eofOrder:order+1});if(record.hashOverflow)return;
      const bytes=new Uint8Array(retained);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}chunks.length=0;
      let task;
      try{task=Promise.resolve(digest(bytes)).then(hash=>update(record,{sha256:[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join(''),hashAt:now(),hashOrder:order+1}),error=>{update(record,{hashError:String(error)});fault(error)})}
      catch(error){update(record,{hashError:String(error)});fault(error);copied-=retained;retained=0;return}
      const size=retained;retained=0;pending.add(task);void task.finally(()=>{copied-=size;pending.delete(task)});
     },error=>{chunks.length=0;copied-=retained;retained=0;update(record,{readError:String(error),readErrorOrder:order+1})});
    };
    reader.cancel=function(...args){
     update(record,{cancelAt:now(),cancelOrder:order+1});chunks.length=0;copied-=retained;retained=0;
     let promise;try{promise=Reflect.apply(cancel,this,args)}catch(error){update(record,{cancelError:String(error)});throw error}
     return observe(promise,()=>update(record,{cancelSettledOrder:order+1}),error=>update(record,{cancelError:String(error)}));
    };
    return reader;
   };
  },error=>update(record,{fetchError:String(error),fetchErrorOrder:order+1}));
 }
 return {fetch,snapshot:()=>({scope,records:records.map(record=>({...record})),faults:[...faults],overflow,pendingHashes:pending.size,copiedBytes:copied}),finish:async()=>{await Promise.allSettled([...pending]);return records.length},detach:()=>{for(const remove of listeners)remove();listeners.length=0}};
}
// This is a data-integrity observation, NOT an error whitelist or a claim that
// the platform canceled a request. Request/realm/ordinal matching is separate.
export function consumedBodyIntegrity(record,expected){
 if(!record||!expected)return {complete:false,reason:'missing-native-or-served-proof'};
 if(record.readerCount!==1||record.readerMode!=='default'||record.status!==200||record.redirected!==false||record.responseURL!==record.url)return {complete:false,reason:'unsupported-response-or-reader'};
 if(record.fetchError||record.readError||record.hashError||record.hashOverflow||!record.eofOrder)return {complete:false,reason:'incomplete-native-body'};
 if(record.bytesRead!==expected.bytes)return {complete:false,reason:'native-byte-count-mismatch'};
 if(!/^[0-9a-f]{64}$/.test(record.sha256??'')||record.sha256!==expected.sha256)return {complete:false,reason:'native-body-hash-mismatch'};
 return {complete:true,reason:'native-eof-and-consumed-bytes-exact',cancellationObserved:record.signalAbortOrder!==undefined||record.cancelOrder!==undefined};
}
