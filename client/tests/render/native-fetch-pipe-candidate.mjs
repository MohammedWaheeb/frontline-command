// Test-only bounded alternative. Not imported by product code.
export async function boundedPipeRead(fetcher, url, {signal, limit, total, maxTotal, scheduleTimeout = callback => {const timer=setTimeout(callback,15000);return ()=>clearTimeout(timer);}, observe = () => {}}) {
 signal?.throwIfAborted();
 const controller=new AbortController(), chunks=[];let size=0,body,stopped=false,firstFailure;
 let stopDeadline=()=>{};
 const finish=()=>{if(!stopped){stopped=true;stopDeadline();signal?.removeEventListener('abort',abort)}};
 const abort=()=>{firstFailure??=signal.reason;finish();controller.abort(firstFailure)};
 signal?.addEventListener('abort',abort,{once:true});
 stopDeadline=scheduleTimeout(()=>{firstFailure??=new DOMException('Battlefield asset download timed out.','TimeoutError');finish();controller.abort(firstFailure)});
 const fail=error=>{firstFailure??=error;finish();return firstFailure};
 try{
  controller.signal.throwIfAborted();
  const response=await fetcher(url,{cache:'no-store',signal:controller.signal});body=response.body;
  observe('headers');controller.signal.throwIfAborted();
  if(!response.ok||!body)throw Error('Asset response unavailable');
  await body.pipeTo(new WritableStream({
   write(value){
    size+=value.byteLength;total.bytes+=value.byteLength;
    if(size>limit||total.bytes>maxTotal)throw fail(Error('Asset exceeds its supported size'));
    chunks.push(value.slice());
   },
   close(){observe('sink-closed');finish();},
  }),{signal:controller.signal});
  controller.signal.throwIfAborted();
  if(!size)throw Error('Asset is empty');
  return new Blob(chunks,{type:response.headers.get('content-type')??''});
 }catch(error){
  const cause=fail(firstFailure??error);
  if(body&&!body.locked)await body.cancel(cause).catch(()=>{});
  throw cause;
 }finally{finish();}
}
