import {decodeContentIndex} from './content-library';
import {PACK_PREFIX,READY_PATH,MANIFEST_PATH,type ContentPack,type PackFile} from './cache';
import {sha256Hex} from './crypto';
import {RuntimeError} from './errors';

const MAX_MANIFEST=4<<20,MAX_FILE=128<<20,MAX_TOTAL=2*1024**3;
// Descriptor-only roster envelope: 162 world IDs × two qualities + 544 UI
// layers + 71 effects + 22 terrain requests = 961. Active bytes stay capped.
const MAX_WAITING=1024;
function fail(code:string,message:string):never{throw new RuntimeError(code,message)}
const canceled=(signal?:AbortSignal)=>{if(signal?.aborted)fail('asset_canceled','The asset load was canceled.')};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function pathOf(value:unknown):string {
 if(typeof value!=='string'||value.length>512||!/^\/[A-Za-z0-9_.@~/-]+$/.test(value)||value.includes('//')||value.split('/').some(x=>x==='.'||x==='..')||(value==='/api'||value.startsWith('/api/'))||value===READY_PATH||value===MANIFEST_PATH)fail('asset_path','Choose a declared same-origin public asset path.');
 return value as string;
}
async function bytes(response:Response,maximum:number,signal?:AbortSignal){
 canceled(signal);if(!response.ok||response.redirected)fail('asset_unavailable','The requested asset response is unavailable.');
 const length=response.headers.get('Content-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maximum))fail('asset_size','The asset response exceeds its allowed size.');
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let count=0;
 const abort=()=>{void reader.cancel().catch(()=>{})};signal?.addEventListener('abort',abort,{once:true});
 try{for(;;){canceled(signal);const value=await reader.read();canceled(signal);if(value.done)break;count+=value.value.byteLength;if(count>maximum){void reader.cancel().catch(()=>{});fail('asset_size','The asset response exceeds its allowed size.')}chunks.push(value.value)}}finally{signal?.removeEventListener('abort',abort);reader.releaseLock()}
 const joined=new Uint8Array(count);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length}return joined;
}
function parse(source:Uint8Array):unknown {try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(source))}catch{fail('asset_manifest_invalid','The asset metadata is not valid UTF-8 JSON.')}}
function manifest(source:Uint8Array):ContentPack {
 const data=parse(source);if(!object(data)||Object.keys(data).some(k=>!['id','version','files'].includes(k))||typeof data.id!=='string'||typeof data.version!=='string'||!Array.isArray(data.files)||data.files.length<1||data.files.length>16000)fail('asset_manifest_invalid','The asset manifest is invalid.');
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(data.id)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(data.version))fail('asset_manifest_invalid','The asset manifest identity is invalid.');
 const seen=new Set<string>();let total=0;const files=data.files.map(value=>{if(!object(value)||Object.keys(value).some(k=>!['path','sha256','bytes'].includes(k))||typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256)||!Number.isSafeInteger(value.bytes)||Number(value.bytes)<0||Number(value.bytes)>MAX_FILE)fail('asset_manifest_invalid','An asset descriptor is invalid.');const path=pathOf(value.path);if(seen.has(path))fail('asset_manifest_invalid','An asset descriptor is duplicated.');seen.add(path);total+=Number(value.bytes);return Object.freeze({path,sha256:value.sha256,bytes:Number(value.bytes)})});
 if(total>MAX_TOTAL)fail('asset_manifest_invalid','The asset manifest is too large.');return {id:data.id,version:data.version,files};
}
interface Ready {name:string;installedAt:number;files:number;manifestSHA256?:string;metadataFiles?:number}
export interface AssetGenerationIdentity {readonly id:string;readonly version:string;readonly indexSHA256:string;readonly manifestSHA256:string;readonly key:string}
export interface AssetLease {readonly url:string;readonly key:string;release():void}
export interface AssetGenerationOptions {origin?:string;signal?:AbortSignal;fetcher?:typeof fetch;cacheStorage?:CacheStorage;maxLeaseBytes?:number}
export interface AssetGeneration {
 readonly identity:AssetGenerationIdentity;
 readonly statistics:{readonly inFlight:number;readonly inFlightBytes:number;readonly queued:number;readonly leases:number;readonly leaseBytes:number;readonly disposed:boolean};
 key(path:string):string;
 descriptor(path:string):Readonly<PackFile>;
 read(path:string,signal?:AbortSignal):Promise<Uint8Array>;
 json<T=unknown>(path:string,signal?:AbortSignal):Promise<T>;
 lease(path:string,signal?:AbortSignal):Promise<AssetLease>;
 dispose():void;
}
/** Capture one exact index/manifest generation. There is no raw-manifest bypass.
 * This helper neither activates packs nor changes the running game's rules. */
export async function captureAssetGeneration(indexSource:Uint8Array,packId:string,options:AssetGenerationOptions={}):Promise<AssetGeneration>{
 const indexBytes=indexSource.slice(),index=decodeContentIndex(indexBytes),descriptor=index.packs.find(p=>p.id===packId);if(!descriptor)fail('asset_identity','The requested asset pack is absent from this content index.');
 const base=new URL(options.origin??globalThis.location?.origin??'http://127.0.0.1:8080');if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)fail('asset_origin','Choose the game origin without credentials or a path.');
 const origin=base.origin,fetcher=options.fetcher??globalThis.fetch.bind(globalThis),storage=options.cacheStorage??globalThis.caches;
 const lifetime=new AbortController(),combined=(signal?:AbortSignal)=>AbortSignal.any([lifetime.signal,...options.signal?[options.signal]:[],...signal?[signal]:[]]);
 const initialSignal=combined();canceled(initialSignal);let bound:Ready|undefined;
 const present=async(name:string)=>!!storage&&(await storage.keys()).includes(name);
 const ready=async():Promise<Ready|undefined>=>{
  if(!storage)return;const names=(await storage.keys()).filter(n=>n.startsWith(PACK_PREFIX));if(names.length>128)fail('asset_cache_limit','Too many cached generations to inspect safely.');const candidates:Ready[]=[];
  for(const name of names){canceled(initialSignal);if(!await present(name))continue;const cache=await storage.open(name),response=await cache.match(READY_PATH);if(!response)continue;let value:unknown;try{value=parse(await bytes(response,4096,initialSignal))}catch{continue}
   if(!object(value)||value.id!==descriptor.id||value.version!==descriptor.version||!Number.isSafeInteger(value.installedAt)||Number(value.installedAt)<0||!Number.isSafeInteger(value.files)||Number(value.files)<1||Number(value.files)>16000)continue;
   const metadata=value.metadataFiles??0;if(metadata!==0&&metadata!==1)continue;if(metadata===1&&(typeof value.manifestSHA256!=='string'||!/^[a-f0-9]{64}$/.test(value.manifestSHA256)))continue;
   if((await cache.keys()).length<Number(value.files)+1+Number(metadata))continue;
   candidates.push({name,installedAt:Number(value.installedAt),files:Number(value.files),metadataFiles:Number(metadata),...typeof value.manifestSHA256==='string'?{manifestSHA256:value.manifestSHA256}:{}});
  }
  return candidates.sort((a,b)=>b.installedAt-a.installedAt||(a.name<b.name?-1:a.name>b.name?1:0))[0];
 };
 const network=async(path:string,maximum:number,signal:AbortSignal)=>{canceled(signal);signal=AbortSignal.any([signal,AbortSignal.timeout(15000)]);let response:Response;try{response=await fetcher(new URL(path,origin),{credentials:'omit',redirect:'error',cache:'no-store',signal})}catch(error){canceled(signal);throw new RuntimeError('asset_unavailable','The exact asset generation is unavailable. Reconnect to its matching host or reinstall that generation.',true,error)}if(response.url&&new URL(response.url).origin!==origin)fail('asset_origin','The asset response came from another origin.');return bytes(response,maximum,signal)};
 bound=await ready();let manifestBytes:Uint8Array|undefined;
 if(bound){if(!await present(bound.name))fail('asset_generation_unavailable','The selected cached generation was removed.');const cache=await storage!.open(bound.name),response=await cache.match(MANIFEST_PATH);if(response){manifestBytes=await bytes(response,MAX_MANIFEST,initialSignal);if(bound.manifestSHA256&&await sha256Hex(manifestBytes)!==bound.manifestSHA256)fail('asset_integrity','The cached manifest failed its integrity check.')}else if(bound.metadataFiles)fail('asset_generation_unavailable','The completed generation is missing its manifest.');}
 // Legacy caches lack the reserved manifest; reconnect for this exact indexed
 // identity. Never derive trusted descriptors from arbitrary cached payloads.
 manifestBytes??=await network(descriptor.manifest_url,MAX_MANIFEST,initialSignal);
 const pack=manifest(manifestBytes),indexSHA256=await sha256Hex(indexBytes),manifestSHA256=await sha256Hex(new TextEncoder().encode(JSON.stringify(pack)));canceled(initialSignal);
 if(pack.id!==descriptor.id||pack.version!==descriptor.version)fail('asset_identity','The pack manifest differs from the captured content index.');
 const byPath=new Map(pack.files.map(f=>[f.path,f])),indexFile=byPath.get('/content/index.json');if(!indexFile||indexFile.bytes!==indexBytes.length||indexFile.sha256!==indexSHA256)fail('asset_identity','The manifest does not describe the exact captured content index.');
 if(bound&&bound.files!==pack.files.length)fail('asset_identity','The completed cache does not match its captured manifest.');
 const identity=Object.freeze({id:pack.id,version:pack.version,indexSHA256,manifestSHA256,key:`${pack.id}:${pack.version}:${manifestSHA256}`});
 let disposed=false,inFlight=0,inFlightBytes=0,leaseBytes=0;const leases=new Map<string,{url:string;bytes:number;refs:number}>(),maximum=options.maxLeaseBytes??64<<20;
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>256<<20)fail('asset_limit','The decoded asset lease limit is invalid.');
 type Waiting={bytes:number;signal:AbortSignal;start:()=>void;abort:()=>void};const waiting:Waiting[]=[];
 const pump=()=>{while(!disposed&&waiting.length&&inFlight<4&&inFlightBytes+waiting[0].bytes<=MAX_FILE){const job=waiting.shift()!;job.signal.removeEventListener('abort',job.abort);inFlight++;inFlightBytes+=job.bytes;job.start()}};
 const acquire=(size:number,signal:AbortSignal):Promise<void>=>{canceled(signal);if(waiting.length>=MAX_WAITING)fail('asset_busy','The bounded asset request queue is full.');return new Promise<void>((resolve,reject)=>{const job:Waiting={bytes:size,signal,start:resolve,abort:()=>{const index=waiting.indexOf(job);if(index<0)return;waiting.splice(index,1);signal.removeEventListener('abort',job.abort);reject(new RuntimeError('asset_canceled','The queued asset load was canceled.'));pump()}};waiting.push(job);signal.addEventListener('abort',job.abort,{once:true});if(signal.aborted)job.abort();else pump()})};
 const file=(path:string)=>{const f=byPath.get(pathOf(path));if(!f)fail('asset_unknown','The asset is not declared by the captured manifest.');return f};
 const live=(signal?:AbortSignal)=>{canceled(combined(signal));if(disposed)fail('asset_canceled','The asset generation was disposed.')};
 const key=(path:string)=>{const f=file(path);return `${identity.key}:${f.path}:${f.sha256}`};
 const read=async(path:string,signal?:AbortSignal)=>{
  live(signal);const f=file(path),active=combined(signal);await acquire(f.bytes,active);
  try{
   if(!bound)bound=await ready();let data:Uint8Array;
   if(bound){if(!await present(bound.name))fail('asset_generation_unavailable','The selected cached generation was removed.');const cache=await storage!.open(bound.name),response=await cache.match(new URL(f.path,origin).href);if(!response)fail('asset_generation_unavailable','The selected generation is missing a required asset.');data=await bytes(response,f.bytes,active);if(!await present(bound.name))fail('asset_generation_unavailable','The selected cached generation was removed during loading.');}
   else data=await network(f.path,f.bytes,active);
   live(signal);if(data.length!==f.bytes||await sha256Hex(data)!==f.sha256)fail('asset_integrity','The asset bytes differ from the captured generation.');live(signal);return data;
  }finally{inFlight--;inFlightBytes-=f.bytes;pump()}
 };
 const lease=async(path:string,signal?:AbortSignal):Promise<AssetLease>=>{
  live(signal);const f=file(path),cacheKey=key(path);let entry=leases.get(cacheKey);
  if(!entry){const data=await read(path,signal);live(signal);entry=leases.get(cacheKey);if(!entry){if(leaseBytes+data.length>maximum)fail('asset_memory','Release unused asset leases before loading more pages.');const suffix=path.slice(path.lastIndexOf('.')),type=({'.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wasm':'application/wasm'} as Record<string,string>)[suffix]??'application/octet-stream';entry={url:URL.createObjectURL(new Blob([new Uint8Array(data).buffer],{type})),bytes:data.length,refs:0};leases.set(cacheKey,entry);leaseBytes+=data.length;}}
  entry.refs++;let released=false;const retained=entry;return Object.freeze({url:entry.url,key:cacheKey,release(){if(released)return;released=true;retained.refs--;if(retained.refs===0&&leases.get(cacheKey)===retained){URL.revokeObjectURL(retained.url);leaseBytes-=retained.bytes;leases.delete(cacheKey)}}});
 };
 return Object.freeze({identity,key,descriptor:(path:string)=>{live();return file(path)},read,json:async<T>(path:string,signal?:AbortSignal)=>parse(await read(path,signal)) as T,lease,get statistics(){return Object.freeze({inFlight,inFlightBytes,queued:waiting.length,leases:leases.size,leaseBytes,disposed})},dispose(){if(disposed)return;disposed=true;lifetime.abort();for(const entry of leases.values())URL.revokeObjectURL(entry.url);leases.clear();leaseBytes=0}});
}
