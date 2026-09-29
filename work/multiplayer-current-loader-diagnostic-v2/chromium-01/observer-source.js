(() => {
 const observe=function allArtConsumedBodyTrace(fetcher,{scope,baseURL,paths=[],hashFactory,limit=16384,maxBody=64*1024*1024,maxTotal=2*1024*1024*1024,maxActive=128,maxBlob=8*1024*1024,maxBlobRetained=16*1024*1024,onRecord=()=>{},now=()=>performance.now()}){
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
},hashFactory=function streamingSHA256(){
 const k=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
 const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64),tail=new Uint8Array(64);let length=0,used=0,ended=false;
 const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
 function block(bytes,offset){
  for(let i=0;i<16;i++){const p=offset+i*4;w[i]=(bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3]}
  for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotr(x,7)^rotr(x,18)^(x>>>3))+w[i-7]+(rotr(y,17)^rotr(y,19)^(y>>>10)))>>>0}
  let [a,b,c,d,e,f,g,j]=h;
  for(let i=0;i<64;i++){const t1=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}
  h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=j;
 }
 return {storageBytes:608,update(bytes){
  if(ended)throw Error('SHA-256 already finalized');if(!(bytes instanceof Uint8Array))throw Error('Uint8Array required');length+=bytes.length;if(!Number.isSafeInteger(length))throw Error('SHA-256 length overflow');let offset=0;
  if(used){const n=Math.min(64-used,bytes.length);tail.set(bytes.subarray(0,n),used);used+=n;offset=n;if(used===64){block(tail,0);used=0}}
  while(offset+64<=bytes.length){block(bytes,offset);offset+=64}if(offset<bytes.length){tail.set(bytes.subarray(offset),0);used=bytes.length-offset}
 },hex(){
  if(ended)throw Error('SHA-256 already finalized');ended=true;tail[used++]=0x80;
  if(used>56){tail.fill(0,used);block(tail,0);used=0}tail.fill(0,used,56);
  const hi=Math.floor(length/0x20000000),lo=(length*8)>>>0;for(let i=0;i<4;i++){tail[56+i]=(hi>>>(24-i*8))&255;tail[60+i]=(lo>>>(24-i*8))&255}block(tail,0);return [...h].map(x=>x.toString(16).padStart(8,'0')).join('');
 }};
};
 const scope='current-loader:'+crypto.randomUUID(),emit=value=>window.__frontlineNativeResponseBinding(JSON.stringify({scope,...value}));emit({type:'document',url:location.href});
 const observer=observe(window.fetch,{scope,baseURL:location.href,hashFactory,paths:['/content/index.json','/assets/packs/base.json'],...{"limit":16384,"maxBody":8388608,"maxTotal":805306368,"maxActive":16,"maxBlob":8388608,"maxBlobRetained":16777216},onRecord:record=>emit({type:'record',record})});window.fetch=observer.fetch;
 const snapshot=reason=>emit({type:'snapshot',reason,snapshot:observer.snapshot()});
 window.__currentLoaderNativeTrace={capture:async reason=>{await observer.finish();snapshot(reason)}};window.addEventListener('pagehide',()=>snapshot('pagehide'));snapshot('installed');
 })();
//# sourceURL=http://127.0.0.1:58264/__diagnostics__/current-loader-native-reader.js