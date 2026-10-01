import {decodeContentIndex} from './content-library';
import {RuntimeError} from './errors';

/** Capture the exact bytes, not a re-serialized index. The pack manifest will
 * bind this body before any dependent art can be decoded. */
export async function artGenerationInput(fetcher:typeof fetch=globalThis.fetch.bind(globalThis),source?:Uint8Array,signal?:AbortSignal){
 if(!source){
  const active=AbortSignal.any([AbortSignal.timeout(15000),...signal?[signal]:[]]);
  const response=await fetcher('/content/index.json',{credentials:'omit',redirect:'error',cache:'no-store',signal:active});
  if(!response.ok||response.redirected||!response.body)throw new RuntimeError('asset_index_unavailable','The matching game content index is unavailable.');
  const chunks:Uint8Array[]=[],reader=response.body.getReader();let size=0;
  const abort=()=>{void reader.cancel().catch(()=>{})};active.addEventListener('abort',abort,{once:true});
  try{for(;;){active.throwIfAborted();const {done,value}=await reader.read();active.throwIfAborted();if(done)break;size+=value.length;if(size>1<<20)throw new RuntimeError('asset_index_size','The game content index exceeds its supported size.');chunks.push(value)}}
  catch(error){await reader.cancel(error).catch(()=>{});throw error}finally{active.removeEventListener('abort',abort);reader.releaseLock()}
  source=new Uint8Array(size);let offset=0;for(const chunk of chunks){source.set(chunk,offset);offset+=chunk.length}
 }
 const bytes=source.slice(),index=decodeContentIndex(bytes),pack=index.packs.find(pack=>pack.manifest_url==='/assets/packs/base.json');
 if(!pack)throw new RuntimeError('asset_index_missing','The captured index does not declare the game art pack.');
 return {source:bytes,packId:pack.id};
}
