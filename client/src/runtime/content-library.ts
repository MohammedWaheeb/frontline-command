import {RuntimeError} from './errors';
import {sha256Hex} from './crypto';
import type {InstalledPack} from './cache';
import type {Difficulty,Faction,GameMap,OfflineConfig} from './types';
import type {OfflineTransport} from './offline';
import {decodeMapEnvironment,type MapEnvironment} from '../content/environment';

export interface LibraryPack {id:string;version:string;manifest_url:string}
export interface LibraryFile {id:string;version:string;title:string;url:string;sha256:string;bytes:number;required_packs:string[]}
export interface LibraryEnvironment {url:string;sha256:string;bytes:number}
export interface LibraryMap extends LibraryFile {author:string;players:1|2|3|4;kind:'skirmish'|'scenario';environment?:LibraryEnvironment}
export interface LibraryMission extends LibraryFile {map_id:string;mode:'tutorial'|'campaign'|'coop';faction:Faction;order:number;presentation_url?:string}
export interface ContentIndex {format_version:1;version:string;packs:LibraryPack[];maps:LibraryMap[];missions:LibraryMission[]}
export type LibraryValidator=Pick<OfflineTransport,'content'|'validateMap'|'validateMission'>;
export interface LoadedMap {entry:LibraryMap;map:GameMap;source:Uint8Array;packs:LibraryPack[]}
export interface LoadedMission {entry:LibraryMission;map:GameMap;mission:Record<string,unknown>;mapSource:Uint8Array;missionSource:Uint8Array;packs:LibraryPack[]}
export interface LibraryState {phase:'idle'|'loading'|'ready'|'error';index?:ContentIndex;error?:{code:string;message:string}}
export interface ContentLoadEvent {kind:'index'|'map'|'mission';id:string;stage:'fetching'|'verifying'|'validating'|'ready'|'error';bytes?:number;total?:number;error?:{code:string;message:string}}
export interface ContentLibraryOptions {validator:LibraryValidator;baseURL?:string;fetch?:typeof fetch;onLoad?:(event:ContentLoadEvent)=>void}
const LIMITS={index:1<<20,map:16<<20,mission:2<<20};
const factions=['US','IR','SY','SA'];
const fail=(message:string):never=>{throw new RuntimeError('content_index_invalid',message)};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value);
const plain=(value:unknown,max:number):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[<>\p{Cc}\p{Cf}]/u.test(value);
function shape(value:unknown,required:string[],optional:string[]=[]):asserts value is Record<string,unknown>{if(!object(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))fail('The content index contains missing or unsupported fields.')}
function staticPath(value:unknown,prefix?:string):value is string{
 if(typeof value!=='string'||value.length>240||!/^\/(?:content|assets)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/.test(value)||value.includes('//')||value.split('/').some(segment=>segment==='.'||segment==='..')||prefix&&!value.startsWith(prefix))return false;
 return true;
}
function array(value:unknown,max:number,label:string):unknown[]{if(!Array.isArray(value)||value.length>max)fail(`${label} exceeds its supported index size.`);return value as unknown[]}
function unique(values:string[],label:string){if(new Set(values).size!==values.length)fail(`${label} contains duplicate entries.`)}
function dependencies(value:unknown,packs:Set<string>){const values=array(value,32,'Pack references');if(values.some(id=>!identifier(id)||!packs.has(id)))fail('A required pack is undeclared.');unique(values as string[],'Pack references')}
function file(value:Record<string,unknown>,kind:'map'|'mission',packs:Set<string>){
 if(!identifier(value.id)||!identifier(value.version)||!plain(value.title,100)||!staticPath(value.url,kind==='map'?'/content/maps/':'/content/missions/')||typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256)||!Number.isSafeInteger(value.bytes)||Number(value.bytes)<1||Number(value.bytes)>LIMITS[kind])fail(`A ${kind} index entry has invalid identity, metadata, path, checksum or size.`);
 dependencies(value.required_packs,packs);
}
/** Index metadata is not gameplay validation. Actual files still pass the Go validators. */
export function decodeContentIndex(source:Uint8Array):ContentIndex{
 if(!(source instanceof Uint8Array)||source.byteLength>LIMITS.index)fail('The content index exceeds 1 MiB.');
 let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(source))}catch{fail('The content index is not valid UTF-8 JSON.')}
 shape(data,['format_version','version','packs','maps','missions']);if(data.format_version!==1)throw new RuntimeError('content_index_incompatible','Keep this index for the matching game version.');if(!identifier(data.version))fail('The content index version is invalid.');
 const packs=array(data.packs,32,'Packs'),maps=array(data.maps,64,'Maps'),missions=array(data.missions,128,'Missions');
 for(const pack of packs){shape(pack,['id','version','manifest_url']);if(!identifier(pack.id)||!identifier(pack.version)||!staticPath(pack.manifest_url))fail('A pack reference is invalid.')}
 unique(packs.map(p=>(p as LibraryPack).id),'Packs');unique(packs.map(p=>(p as LibraryPack).manifest_url),'Pack manifests');const packIDs=new Set(packs.map(p=>(p as LibraryPack).id));
 const fields=['id','version','title','url','sha256','bytes','required_packs'];
 for(const map of maps){shape(map,[...fields,'author','players','kind'],['environment']);file(map,'map',packIDs);if(!plain(map.author,100)||!Number.isInteger(map.players)||Number(map.players)<1||Number(map.players)>4||!['skirmish','scenario'].includes(String(map.kind)))fail('A map index entry has invalid author, player count or kind.');if(map.environment!==undefined){shape(map.environment,['url','sha256','bytes']);const env=map.environment;if(!staticPath(env.url,'/content/environment/')||typeof env.sha256!=='string'||!/^[a-f0-9]{64}$/.test(env.sha256)||!Number.isSafeInteger(env.bytes)||Number(env.bytes)<1||Number(env.bytes)>(1<<20))fail('A map environment entry has an invalid path, checksum or size.')}}
 unique(maps.map(m=>(m as LibraryMap).id),'Maps');const mapIDs=new Set(maps.map(m=>(m as LibraryMap).id));
 for(const mission of missions){shape(mission,[...fields,'map_id','mode','faction','order'],['presentation_url']);file(mission,'mission',packIDs);if(!identifier(mission.map_id)||!mapIDs.has(mission.map_id)||!['tutorial','campaign','coop'].includes(String(mission.mode))||!factions.includes(String(mission.faction))||!Number.isInteger(mission.order)||Number(mission.order)<1||Number(mission.order)>(mission.mode==='campaign'?6:mission.mode==='tutorial'?5:2)||mission.presentation_url!==undefined&&!staticPath(mission.presentation_url))fail('A mission index entry has an invalid map, mode, faction, story order or presentation path.')}
 unique(missions.map(m=>(m as LibraryMission).id),'Missions');unique(missions.map(m=>{const v=m as LibraryMission;return `${v.mode}:${v.mode==='campaign'?v.faction:'all'}:${v.order}`;}),'Mission order');unique([...maps,...missions].map(v=>(v as LibraryFile).url),'Content file paths');
 return structuredClone(data) as unknown as ContentIndex;
}

/** The original remains exportable without putting raw content into logs/error JSON. */
export class ContentLibraryError extends RuntimeError{
 #original?:{url:string;data:Uint8Array};
 constructor(code:string,message:string,original?:{url:string;data:Uint8Array}){super(code,message);if(original)this.#original={url:original.url,data:original.data.slice()}}
 originalFile(){return this.#original?{url:this.#original.url,data:this.#original.data.slice()}:undefined}
}
function abort(signal?:AbortSignal){if(signal?.aborted)throw new RuntimeError('content_canceled','Content loading was canceled. Existing installed files are preserved.')}
function errorSummary(error:unknown){const value=RuntimeError.from(error);return {code:value.code,message:value.message}}
function sameDependencies(a:string[]|undefined,b:string[]){return !!a&&a.length===b.length&&[...a].sort().every((id,index)=>id===[...b].sort()[index])}
/** Compare every public Go-normalized field, independent of JSON property order.
 * Identity/version alone cannot authorize dressing for an edited/imported map. */
export function mapBlueprintKey(map:GameMap):string{
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value;
 return JSON.stringify(canonical(map));
}

/** Read-only library. It does not install packs, create sessions, or replace saved files. */
export class ContentLibrary{
 readonly baseURL:string;private readonly validator:LibraryValidator;private readonly fetcher:typeof fetch;
 private current?:ContentIndex;private stateValue:LibraryState={phase:'idle'};private generation=0;private loading=0;
 constructor(private readonly options:ContentLibraryOptions){
  const url=new URL(options.baseURL??globalThis.location?.origin??'http://127.0.0.1:8080');if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new RuntimeError('content_origin','Choose an HTTP local game origin.');this.baseURL=url.origin;this.validator=options.validator;this.fetcher=options.fetch??globalThis.fetch.bind(globalThis);
 }
 get state():LibraryState{return structuredClone(this.stateValue)}
 get index():ContentIndex|undefined{return this.current?structuredClone(this.current):undefined}
 private event(event:ContentLoadEvent){try{this.options.onLoad?.(structuredClone(event))}catch{/* Presentation callbacks do not change validation results. */}}
 private registry(){if(!this.current)throw new RuntimeError('content_index_missing','Load the installed content index first.');return this.current}
 private async bytes(url:string,maximum:number,signal:AbortSignal|undefined,progress:(bytes:number)=>void){
  abort(signal);const deadline=AbortSignal.timeout(15000),combined=signal?AbortSignal.any([signal,deadline]):deadline;
  let response:Response;try{response=await this.fetcher(new URL(url,this.baseURL),{credentials:'omit',redirect:'error',cache:'no-store',signal:combined})}catch{abort(signal);throw new RuntimeError('content_unavailable','The content file could not be loaded. Retry or install its offline pack.')}
  if(!response.ok)throw new RuntimeError('content_unavailable',`The required content file is unavailable (HTTP ${response.status}).`);
  if(response.url&&new URL(response.url).origin!==this.baseURL)throw new RuntimeError('content_origin','The content response came from another host.');
  const length=response.headers.get('Content-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maximum))throw new RuntimeError('content_size','The content response exceeds its declared size.');
  const chunks:Uint8Array[]=[];let count=0;const reader=response.body?.getReader();if(!reader)return new Uint8Array();
  try{for(;;){abort(signal);const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>maximum){await reader.cancel();throw new RuntimeError('content_size','The content response exceeds its declared size.')}chunks.push(value);progress(count)}}catch(error){await reader.cancel().catch(()=>{});abort(signal);if(error instanceof RuntimeError)throw error;throw new RuntimeError('content_unavailable','The content download was interrupted. Retry explicitly.')}finally{reader.releaseLock()}
  const data=new Uint8Array(count);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}return data;
 }
 async loadIndex(signal?:AbortSignal):Promise<ContentIndex>{
  const generation=++this.generation;this.stateValue={phase:'loading',index:this.index};this.event({kind:'index',id:'index',stage:'fetching'});
  let source:Uint8Array|undefined;
  try{source=await this.bytes('/content/index.json',LIMITS.index,signal,bytes=>this.event({kind:'index',id:'index',stage:'fetching',bytes}));abort(signal);const index=decodeContentIndex(source);if(generation!==this.generation)throw new RuntimeError('content_superseded','A newer content index load replaced this request.');this.current=index;this.stateValue={phase:'ready',index:this.index};this.event({kind:'index',id:'index',stage:'ready'});return this.index!}
  catch(error){const detail=errorSummary(error);if(generation===this.generation){this.stateValue={phase:'error',index:this.index,error:detail};this.event({kind:'index',id:'index',stage:'error',error:detail})}throw new ContentLibraryError(detail.code,detail.message,source?{url:'/content/index.json',data:source}:undefined)}
 }
 /** Explicit local index selection; failure leaves the previous registry intact. */
 useIndex(source:Uint8Array):ContentIndex{
  try{const index=decodeContentIndex(source);this.generation++;this.current=index;this.stateValue={phase:'ready',index:this.index};return this.index!}
  catch(error){const detail=errorSummary(error);this.stateValue={phase:'error',index:this.index,error:detail};throw new ContentLibraryError(detail.code,detail.message,source instanceof Uint8Array&&source.length<=LIMITS.index?{url:'/content/index.json',data:source}:undefined)}
 }
 mapEntry(id:string){const entry=this.registry().maps.find(entry=>entry.id===id);if(!entry)throw new RuntimeError('content_missing','This map is not in the installed content index.');return structuredClone(entry)}
 missionEntry(id:string){const entry=this.registry().missions.find(entry=>entry.id===id);if(!entry)throw new RuntimeError('content_missing','This mission is not in the installed content index.');return structuredClone(entry)}
 packsFor(ids:readonly string[]):LibraryPack[]{const index=this.registry();return [...new Set(ids)].map(id=>{const pack=index.packs.find(pack=>pack.id===id);if(!pack)throw new RuntimeError('content_pack_missing','A required content pack is not declared.');return structuredClone(pack)})}
 missingPacks(ids:readonly string[],installed:readonly Pick<InstalledPack,'id'|'version'>[]){return this.packsFor(ids).filter(pack=>!installed.some(value=>value.id===pack.id&&value.version===pack.version))}
 async catalog(){return structuredClone(await this.validator.content())}
 private async source(entry:LibraryFile,kind:'map'|'mission',signal?:AbortSignal){
  this.event({kind,id:entry.id,stage:'fetching',bytes:0,total:entry.bytes});const source=await this.bytes(entry.url,entry.bytes,signal,bytes=>this.event({kind,id:entry.id,stage:'fetching',bytes,total:entry.bytes}));
  this.event({kind,id:entry.id,stage:'verifying',bytes:source.length,total:entry.bytes});
  if(source.length!==entry.bytes||await sha256Hex(source)!==entry.sha256)throw new ContentLibraryError('content_integrity','The content file differs from its installed index. Keep the original and retry a matching version.',{url:entry.url,data:source});abort(signal);return source;
 }
 private checkGeneration(generation:number,signal?:AbortSignal){abort(signal);if(generation!==this.generation)throw new RuntimeError('content_superseded','The selected content index changed while loading. Retry the selected mission.')}
 private async mapData(entry:LibraryMap,signal:AbortSignal|undefined,generation:number):Promise<LoadedMap>{
  let source:Uint8Array|undefined;
  try{source=await this.source(entry,'map',signal);this.event({kind:'map',id:entry.id,stage:'validating'});const map=await this.validator.validateMap(source.slice());this.checkGeneration(generation,signal);
   if(map.id!==entry.id||map.version!==entry.version||map.title!==entry.title||map.author!==entry.author||map.spawns.length!==entry.players||!sameDependencies(map.required_packs??[],entry.required_packs))throw new RuntimeError('content_metadata_mismatch','The map definition does not match its index metadata.');
   this.event({kind:'map',id:entry.id,stage:'ready'});return {entry:structuredClone(entry),map:structuredClone(map),source:source.slice(),packs:this.packsFor(entry.required_packs)};
  }catch(error){const detail=errorSummary(error);this.event({kind:'map',id:entry.id,stage:'error',error:detail});if(error instanceof ContentLibraryError)throw error;throw new ContentLibraryError(detail.code,detail.message,source?{url:entry.url,data:source}:undefined)}
 }
 private enter(){if(this.loading>=4)throw new RuntimeError('content_busy','Four content loads are already in progress. Retry when one finishes.');this.loading++}
 async loadMap(id:string,signal?:AbortSignal):Promise<LoadedMap>{const entry=this.mapEntry(id),generation=this.generation;this.enter();try{return await this.mapData(entry,signal,generation)}finally{this.loading--}}
 /** Optional public art data. No session, gameplay file or original save is changed. */
 async loadEnvironment(map:GameMap,signal?:AbortSignal):Promise<MapEnvironment|undefined>{
  abort(signal);const entry=this.current?.maps.find(entry=>entry.id===map.id&&entry.version===map.version),descriptor=entry?.environment;
  if(!entry||!descriptor)return undefined;
  const generation=this.generation,expected=mapBlueprintKey(map);this.enter();let source:Uint8Array|undefined;
  try{
   const installed=await this.mapData(entry,signal,generation);
   if(mapBlueprintKey(installed.map)!==expected)throw new RuntimeError('environment_map_mismatch','Optional scenery does not match this map. The original battlefield remains available.');
   source=await this.bytes(descriptor.url,descriptor.bytes,signal,()=>{});
   if(source.length!==descriptor.bytes||await sha256Hex(source)!==descriptor.sha256)throw new RuntimeError('content_integrity','Optional scenery differs from its installed checksum.');
   this.checkGeneration(generation,signal);
   return decodeMapEnvironment(source,installed.map,{mapSHA256:entry.sha256});
  }catch(error){const detail=errorSummary(error);if(error instanceof ContentLibraryError)throw error;throw new ContentLibraryError(detail.code,detail.message,source?{url:descriptor.url,data:source}:undefined)}finally{this.loading--}
 }
 async loadMission(id:string,signal?:AbortSignal):Promise<LoadedMission>{
  const entry=this.missionEntry(id),mapEntry=this.mapEntry(entry.map_id),generation=this.generation;this.enter();let source:Uint8Array|undefined;
  try{const map=await this.mapData(mapEntry,signal,generation);source=await this.source(entry,'mission',signal);this.event({kind:'mission',id,stage:'validating'});const mission=await this.validator.validateMission(map.source.slice(),source.slice());this.checkGeneration(generation,signal);
   if(mission.id!==entry.id||mission.version!==entry.version||mission.title!==entry.title||mission.map_id!==entry.map_id||mission.mode!==entry.mode||mission.faction!==entry.faction)throw new RuntimeError('content_metadata_mismatch','The mission definition does not match its index metadata.');
   this.event({kind:'mission',id,stage:'ready'});return {entry:structuredClone(entry),map:map.map,mission:structuredClone(mission),mapSource:map.source,missionSource:source.slice(),packs:this.packsFor([...mapEntry.required_packs,...entry.required_packs])};
  }catch(error){const detail=errorSummary(error);this.event({kind:'mission',id,stage:'error',error:detail});if(error instanceof ContentLibraryError)throw error;throw new ContentLibraryError(detail.code,detail.message,source?{url:entry.url,data:source}:undefined)}finally{this.loading--}
 }
}
/** Builds data only; SessionController and its asset-preparation hook own launch. */
export function soloMissionConfig(loaded:LoadedMission,difficulty:Difficulty,seed:number):OfflineConfig{
 if(loaded.entry.mode==='coop')throw new RuntimeError('coop_lobby_required','Start co-op through its local lobby and commander selection.');if(!['easy','normal','hard'].includes(difficulty)||!Number.isSafeInteger(seed)||seed<0)throw new RuntimeError('mission_launch_invalid','Choose a supported difficulty and a nonnegative safe integer seed.');
 return {map:structuredClone(loaded.map),mission:structuredClone(loaded.mission),difficulty,seed,ruleset:'scenario-v2'};
}
