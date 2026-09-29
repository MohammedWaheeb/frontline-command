// Test-only observation of all original art/advice fetch consumers. Incremental
// hashing stores no response chunks. Native json/text are explicitly unsupported.
// Returned native Blob bytes may be read locally, asynchronously and boundedly;
// this is identified separately from the original response's explicit reader EOF.
export function allArtConsumedBodyTrace(fetcher,{scope,baseURL,paths=[],hashFactory,limit=16384,maxBody=64*1024*1024,maxTotal=2*1024*1024*1024,maxActive=128,maxBlob=8*1024*1024,maxBlobRetained=16*1024*1024,onRecord=()=>{},now=()=>performance.now()}){
 if(!scope||typeof hashFactory!=='function'||![limit,maxBody,maxTotal,maxActive,maxBlob,maxBlobRetained].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Bounded observer configuration required');
 const base=new URL(baseURL),selected=new Set(paths),records=[],faults=[],ordinals=new Map(),pending=new Set(),listeners=[];let order=0,overflow=0,active=0,peakActive=0,totalHashed=0,blobRetained=0,peakBlobRetained=0;
 const fault=error=>{if(faults.length<32)faults.push(String(error));else overflow++};
 const update=(r,fields)=>{Object.assign(r,fields,{updatedOrder:++order});try{onRecord({...r,bodyMethods:[...r.bodyMethods]})}catch(e){fault(e)}};
 const observe=(promise,ok,bad)=>promise.then(value=>{try{ok(value)}catch(e){fault(e)}return value},error=>{try{bad(error)}catch(e){fault(e)}throw error});
 function startHash(r){if(active>=maxActive){update(r,{hashOverflow:'active-hash-limit'});return}active++;peakActive=Math.max(active,peakActive);return hashFactory()}
 function consume(r,h,bytes){if(!h||r.hashOverflow)return false;if(bytes.byteLength+r.hashedBytes>maxBody||bytes.byteLength+totalHashed>maxTotal){update(r,{hashOverflow:'body-or-total-byte-limit'});return false}h.update(bytes);r.hashedBytes+=bytes.byteLength;totalHashed+=bytes.byteLength;return true}
 function complete(r,h){if(!h)return;if(!r.hashOverflow)update(r,{sha256:h.hex(),hashAt:now(),hashOrder:order+1});active--}
 function release(h){if(h)active--}
 function fetch(input,init){
  const promise=Reflect.apply(fetcher,this,arguments);let r;
  try{
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,base);url.hash='';const method=String(init?.method??input?.method??'GET').toUpperCase(),advice=method==='POST'&&/^\/api\/v1\/matches\/[a-z0-9-]+\/advice$/.test(url.pathname)&&!url.search;
   if(url.origin!==base.origin||!(method==='GET'&&(url.pathname.startsWith('/art/')||selected.has(url.pathname))||advice))return promise;
   if(records.length>=limit){overflow++;return promise}const key=method+' '+url.href,ordinal=(ordinals.get(key)??0)+1;ordinals.set(key,ordinal);
   r={scope,url:url.href,method,ordinal,startedAt:now(),startedOrder:++order,bytesRead:0,hashedBytes:0,readCalls:0,readerCount:0,bodyMethods:[],hashImplementation:'incremental-sha256-v1'};records.push(r);update(r,{});
   const signal=init?.signal??input?.signal;if(signal){const aborted=()=>update(r,{signalAbortAt:now(),signalAbortOrder:order+1});if(signal.aborted)aborted();else{signal.addEventListener('abort',aborted,{once:true});listeners.push(()=>signal.removeEventListener('abort',aborted))}}
  }catch(e){fault(e);return promise}
  return observe(promise,response=>{
   update(r,{responseAt:now(),status:response.status,responseURL:response.url,redirected:response.redirected});
   for(const method of ['json','text','blob','arrayBuffer','bytes','formData']){
    const original=response[method];if(typeof original!=='function')continue;
    response[method]=function(...args){
     r.bodyMethods.push(method);update(r,{bodyMethod:method,bodyMethodOrder:order+1});let p;
     try{p=Reflect.apply(original,this,args)}catch(e){update(r,{bodyMethodError:String(e),bodyMethodErrorOrder:order+1});throw e}
     return observe(p,value=>{
      update(r,{bodyMethodSettledOrder:order+1,bodyMethodSettledAt:now(),completion:'native-'+method+'-fulfilled'});
      if(method==='arrayBuffer'||method==='bytes'){
       const bytes=method==='arrayBuffer'?new Uint8Array(value):value;update(r,{bytesRead:bytes.byteLength,eofAt:now(),eofOrder:order+1});const h=startHash(r);consume(r,h,bytes);complete(r,h);
      }else if(method==='blob'){
       if(!(value instanceof Blob)||value.size>maxBlob||blobRetained+value.size>maxBlobRetained){update(r,{unsupported:'native-blob-proof-limit'});return}
       const h=startHash(r);if(!h)return;blobRetained+=value.size;peakBlobRetained=Math.max(peakBlobRetained,blobRetained);update(r,{bytesRead:value.size,eofAt:now(),eofOrder:order+1,blobProof:'local-stream-of-original-returned-immutable-blob'});
       // Never await this task before returning the original Blob to its caller.
       let task;task=(async()=>{let reader;try{reader=Reflect.apply(Blob.prototype.stream,value,[]).getReader();for(;;){const item=await reader.read();if(item.done){update(r,{blobProofEOFOrder:order+1});break}if(!consume(r,h,item.value)){await reader.cancel();update(r,{blobProofLocalCancelOrder:order+1});break}}complete(r,h)}catch(e){release(h);update(r,{hashError:String(e)});fault(e)}finally{reader?.releaseLock();blobRetained-=value.size}})();
       pending.add(task);void task.finally(()=>pending.delete(task));
      }else update(r,{unsupported:'native-'+method+'-does-not-expose-original-bytes'});
     },error=>update(r,{bodyMethodError:String(error),bodyMethodErrorOrder:order+1}));
    };
   }
   const body=response.body;if(!body)return;const getReader=body.getReader;
   body.getReader=function(...args){
    const reader=Reflect.apply(getReader,this,args);update(r,{readerCount:r.readerCount+1,readerMode:args[0]?.mode??'default',completion:'explicit-native-reader'});let h=startHash(r),ended=false;
    const read=reader.read,cancel=reader.cancel;
    reader.read=function(...args){let p;try{p=Reflect.apply(read,this,args)}catch(e){release(h);h=undefined;update(r,{readError:String(e),readErrorOrder:order+1});throw e}
     return observe(p,result=>{r.readCalls++;if(!result.done){r.bytesRead+=result.value.byteLength;if(!consume(r,h,new Uint8Array(result.value.buffer,result.value.byteOffset,result.value.byteLength))){release(h);h=undefined}return}if(ended)return;ended=true;update(r,{eofAt:now(),eofOrder:order+1});complete(r,h);h=undefined},error=>{release(h);h=undefined;update(r,{readError:String(error),readErrorOrder:order+1})});
    };
    reader.cancel=function(...args){update(r,{cancelAt:now(),cancelOrder:order+1});release(h);h=undefined;let p;try{p=Reflect.apply(cancel,this,args)}catch(e){update(r,{cancelError:String(e)});throw e}return observe(p,()=>update(r,{cancelSettledOrder:order+1}),error=>update(r,{cancelError:String(error)}))};return reader;
   };
  },error=>update(r,{fetchError:String(error),fetchErrorOrder:order+1}));
 }
 return {fetch,snapshot:()=>({scope,records:records.map(r=>({...r,bodyMethods:[...r.bodyMethods]})),faults:[...faults],overflow,accounting:{activeHashes:active,peakActiveHashes:peakActive,totalHashedBytes:totalHashed,hashArrayBytesPerActive:608,retainedResponseChunkBytes:0,retainedBlobBytes:blobRetained,peakRetainedBlobBytes:peakBlobRetained,pendingBlobProofs:pending.size,limits:{records:limit,maxBody,maxTotal,maxActive,maxBlob,maxBlobRetained}}}),finish:async()=>{while(pending.size)await Promise.allSettled([...pending]);return records.length},detach:()=>{for(const f of listeners)f();listeners.length=0}};
}
export function allArtBodyIntegrity(r,expected){
 if(!r||!expected)return{complete:false,reason:'missing-native-or-served-proof'};
 if(r.unsupported)return{complete:false,reason:r.unsupported};
 const explicit=r.completion==='explicit-native-reader'&&r.readerCount===1&&r.readerMode==='default'&&r.bodyMethods.length===0;
 const builtin=['native-arrayBuffer-fulfilled','native-bytes-fulfilled','native-blob-fulfilled'].includes(r.completion)&&r.readerCount===0&&r.bodyMethods.length===1;
 if((!explicit&&!builtin)||r.status!==200||r.redirected!==false||r.responseURL!==r.url)return{complete:false,reason:'unsupported-response-or-reader'};
 if(r.fetchError||r.readError||r.bodyMethodError||r.hashError||r.hashOverflow||!r.eofOrder||(r.completion==='native-blob-fulfilled'&&!r.blobProofEOFOrder))return{complete:false,reason:'incomplete-native-body'};
 if(r.bytesRead!==expected.bytes||r.hashedBytes!==expected.bytes)return{complete:false,reason:'native-byte-count-mismatch'};
 if(!/^[0-9a-f]{64}$/.test(r.sha256??'')||r.sha256!==expected.sha256)return{complete:false,reason:'native-body-hash-mismatch'};
 return{complete:true,reason:'native-consumer-complete-and-bytes-exact',completion:r.completion,cancellationObserved:r.signalAbortOrder!==undefined||r.cancelOrder!==undefined};
}
