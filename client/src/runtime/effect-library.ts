import {decodeEffectIndex,decodeEffectMetadata,effectDescriptor,inspectEffectPNG,type EffectAtlasFrame,type EffectClip,type EffectDescriptor,type EffectIndex,type EffectMetadata,type EffectVariant} from '../content/effect-assets.mjs';
import {sha256Hex} from './crypto';
export type {EffectClip,EffectVariant,EffectDescriptor} from '../content/effect-assets.mjs';
export interface EffectFrame<T> {texture:T;anchorX:number;anchorY:number;pixelScale:number}
export interface EffectTexture<T> {value:T;width:number;height:number;dispose:()=>void|Promise<void>}
export interface EffectTextureAdapter<T> {
 load(bytes:Uint8Array,width:number,height:number,signal:AbortSignal):Promise<EffectTexture<T>>;
 crop(texture:T,frame:EffectAtlasFrame):T;
 destroyFrame(texture:T):void;
}
export interface EffectLibraryOptions<T> {textures:EffectTextureAdapter<T>;fetch?:typeof fetch;now?:()=>number;onError?:(error:Error)=>void;budgetBytes?:number}
interface Resident<T> {texture?:EffectTexture<T>;pending?:Promise<void>;failed:boolean;lastUsed:number;frames:Map<string,EffectFrame<T>>;reservation?:()=>void}
function canceled(){return new DOMException('Effect loading canceled.','AbortError')}
async function verified(fetcher:typeof fetch,descriptor:EffectDescriptor,signal:AbortSignal){
 const response=await fetcher(`/art/${descriptor.url}`,{signal,redirect:'error',credentials:'same-origin'});
 if(!response.ok)throw Error(`Effect asset unavailable (${response.status}).`);
 const length=response.headers.get('content-length');if(length!==null&&Number(length)!==descriptor.bytes)throw Error('Effect asset byte count does not match.');
 const reader=response.body?.getReader();let bytes:Uint8Array;
 if(reader){const chunks:Uint8Array[]=[];let total=0;try{for(;;){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>descriptor.bytes)throw Error('Effect asset exceeds its declared byte count.');chunks.push(next.value)}}catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
  bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
 }else bytes=new Uint8Array(await response.arrayBuffer());
 if(signal.aborted)throw canceled();
 if(bytes.length!==descriptor.bytes||await sha256Hex(bytes)!==descriptor.sha256)throw Error('Effect asset integrity check failed.');
 if(signal.aborted)throw canceled();return bytes;
}
/** Metadata is immutable. First frame access starts one page request and returns
 * undefined until ready; the caller retains its truthful code-native fallback. */
export class EffectSheet<T> {
 private residents:Resident<T>[];private closed=false;
 constructor(readonly meta:EffectMetadata,private readonly base:string,private readonly options:Required<Pick<EffectLibraryOptions<T>,'fetch'|'now'>> & EffectLibraryOptions<T>,private readonly signal:AbortSignal,private readonly allocate:(bytes:number)=>(()=>void)|undefined){this.residents=meta.pages.map(()=>({failed:false,lastUsed:0,frames:new Map()}))}
 get id(){return this.meta.id}
 get pixelScale(){return 1/this.meta.resolution}
 get statistics(){return {indexedPages:this.residents.length,residentPages:this.residents.filter(page=>page.texture).length,residentBytes:this.residents.reduce((sum,page,index)=>sum+(page.texture?this.meta.pages[index].width*this.meta.pages[index].height*4:0),0)}}
 clip(variant:EffectVariant):EffectClip|undefined{return this.meta.clips[this.meta.variants[variant]]}
 frame(variant:EffectVariant,index:number):EffectFrame<T>|undefined{
  if(this.closed||this.signal.aborted||!Number.isInteger(index)||index<0)return;
  const clip=this.clip(variant),frame=clip?.frames[index];if(!frame)return;
  const page=this.residents[frame.page];page.lastUsed=this.options.now();
  if(!page.texture){this.request(frame.page);return}
  const key=`${this.meta.variants[variant]}:${index}`;let value=page.frames.get(key);
  if(!value){value={texture:this.options.textures.crop(page.texture.value,frame),anchorX:frame.origin[0]/frame.w,anchorY:frame.origin[1]/frame.h,pixelScale:this.pixelScale};page.frames.set(key,value)}return value;
 }
 private request(index:number){
  const page=this.residents[index];if(page.pending||page.failed||this.closed||this.signal.aborted)return;
  page.reservation=this.allocate(this.meta.pages[index].width*this.meta.pages[index].height*4);if(!page.reservation)return;
  page.pending=(async()=>{
   const info=this.meta.pages[index],bytes=await verified(this.options.fetch,{url:this.base+info.file,sha256:info.sha256,bytes:info.bytes},this.signal),png=inspectEffectPNG(bytes);
   if(png.width!==info.width||png.height!==info.height)throw Error('Effect PNG dimensions do not match metadata.');
   const texture=await this.options.textures.load(bytes,info.width,info.height,this.signal);
   if(this.closed||this.signal.aborted){await texture.dispose();return}
   if(texture.width!==info.width||texture.height!==info.height){await texture.dispose();throw Error('Decoded effect texture dimensions do not match.');}
   page.texture=texture;
  })().catch(error=>{if(!this.closed&&!this.signal.aborted){page.failed=true;this.options.onError?.(error instanceof Error?error:Error(String(error)))}}).finally(()=>{if(!page.texture){page.reservation?.();page.reservation=undefined}page.pending=undefined});
 }
 async settle(){await Promise.all(this.residents.map(page=>page.pending))}
 retry(){for(const page of this.residents)page.failed=false}
 private async unload(page:Resident<T>){for(const frame of page.frames.values())this.options.textures.destroyFrame(frame.texture);page.frames.clear();const texture=page.texture;page.texture=undefined;if(texture)await texture.dispose();page.reservation?.();page.reservation=undefined}
 async evictBefore(before:number){for(const page of this.residents)if(!page.pending&&page.lastUsed<before)await this.unload(page)}
 async dispose(){if(this.closed)return;this.closed=true;await this.settle();for(const page of this.residents)await this.unload(page)}
}
/** Separate match-owned FX residency; it never uses/evicts actor sprite textures. */
export class EffectAssetLibrary<T> {
 private options:Required<Pick<EffectLibraryOptions<T>,'fetch'|'now'>>&EffectLibraryOptions<T>;
 private index:EffectIndex|undefined;private descriptor:EffectDescriptor|undefined;private starting:Promise<EffectIndex|undefined>|undefined;
 private sheets=new Map<string,Promise<EffectSheet<T>|undefined>>();private loaded=new Set<EffectSheet<T>>();private controller=new AbortController();private generation=0;private closed=false;private releasing=Promise.resolve();private allocated=0;private pressure=false;
 constructor(options:EffectLibraryOptions<T>){if(options.budgetBytes!==undefined&&(!Number.isSafeInteger(options.budgetBytes)||options.budgetBytes<4||options.budgetBytes>256*1024*1024))throw Error('Invalid effect memory budget.');this.options={...options,fetch:options.fetch??globalThis.fetch.bind(globalThis),now:options.now??(()=>performance.now())}}
 get statistics(){return {...[...this.loaded].reduce((sum,sheet)=>{const x=sheet.statistics;return {indexedPages:sum.indexedPages+x.indexedPages,residentPages:sum.residentPages+x.residentPages,residentBytes:sum.residentBytes+x.residentBytes}},{indexedPages:0,residentPages:0,residentBytes:0}),allocatedBytes:this.allocated}}
 private allocate=(bytes:number)=>{if(this.allocated+bytes>(this.options.budgetBytes??32*1024*1024)){this.pressure=true;return undefined}this.allocated+=bytes;let active=true;return()=>{if(active){active=false;this.allocated-=bytes}}};
 init(input?:EffectDescriptor):Promise<EffectIndex|undefined>{
  if(this.closed)return Promise.reject(Error('Effect library is disposed.'));
  const descriptor=input===undefined?undefined:effectDescriptor(input,'index');
  if(JSON.stringify(descriptor)===JSON.stringify(this.descriptor)&&(this.index||this.starting))return this.starting??Promise.resolve(this.index);
  const previous=this.release();this.index=undefined;this.descriptor=descriptor;const generation=this.generation,signal=this.controller.signal;
  const work=(async()=>{await previous;if(!descriptor)return undefined;const bytes=await verified(this.options.fetch,descriptor,signal),index=decodeEffectIndex(bytes);if(this.closed||generation!==this.generation)throw canceled();this.index=index;return index})();
  this.starting=work;void work.finally(()=>{if(this.starting===work)this.starting=undefined}).catch(()=>{});return work;
 }
 has(id:string){return !!this.index?.effects[id]}
 load(id:string):Promise<EffectSheet<T>|undefined>{
  if(this.closed)return Promise.resolve(undefined);let request=this.sheets.get(id);if(request)return request;
  const generation=this.generation,signal=this.controller.signal,starting=this.starting,release=this.releasing;
  request=(async()=>{
   await release;await starting;if(this.closed||generation!==this.generation)return;
   const info=this.index?.effects[id];if(!info)return;
   const bytes=await verified(this.options.fetch,info,signal),meta=decodeEffectMetadata(bytes,id);
   if(this.closed||generation!==this.generation)return;
   const sheet=new EffectSheet(meta,info.url.slice(0,info.url.lastIndexOf('/')+1),this.options,signal,this.allocate);this.loaded.add(sheet);return sheet;
  })().catch(error=>{if(!signal.aborted)this.options.onError?.(error instanceof Error?error:Error(String(error)));return undefined});
  this.sheets.set(id,request);return request;
 }
 async settle(){await Promise.all([...this.sheets.values()]);await Promise.all([...this.loaded].map(sheet=>sheet.settle()))}
 retry(id:string){const value=this.sheets.get(id);if(value)void value.then(sheet=>{if(sheet)sheet.retry();else if(this.sheets.get(id)===value)this.sheets.delete(id)})}
 async trim(){if(this.pressure){for(const sheet of this.loaded)await sheet.evictBefore(this.options.now()-10000);this.pressure=false}}
 release(){
  this.generation++;this.controller.abort();this.controller=new AbortController();this.starting=undefined;
  const previous=this.sheets;this.sheets=new Map();const earlier=this.releasing;
  this.releasing=(async()=>{await earlier;for(const sheet of await Promise.all(previous.values()))if(sheet){await sheet.dispose();this.loaded.delete(sheet)}})();return this.releasing;
 }
 async dispose(){if(this.closed)return;this.closed=true;await this.release();this.index=undefined;this.descriptor=undefined}
}
