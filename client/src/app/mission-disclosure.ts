import {sha256Hex} from '../runtime/crypto';
import {RuntimeError} from '../runtime/errors';
import type {LibraryMission} from '../runtime/content-library';
import type {ApplicationState} from './application';

export interface PublicMissionObjective{id:string;text:string;optional:boolean;failure:boolean}
export interface MissionDisclosureRequest{
 session:string;player:number;faction:string;mapId:string;ruleset:string;indexVersion:string;
 mission:{id:string;version:string;title:string;objectives:PublicMissionObjective[]};
 entry?:LibraryMission;
}
export interface MissionDisclosure{
 id:string;version:string;rulesNotice:string;failures:Array<{id:string;text:string}>;
}
export interface MissionDisclosureOptions{
 baseURL:string;signal?:AbortSignal;fetch?:typeof fetch;isCurrent?:()=>boolean;
}
const MAX_BYTES=2*1024*1024;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
function unavailable(message:string):never{throw new RuntimeError('mission_context_unavailable',message,true)}

export function requestMissionDisclosure(state:Pick<ApplicationState,'session'|'index'|'snapshot'>):MissionDisclosureRequest|undefined{
 const snapshot=state.snapshot,mission=snapshot?.mission;
 if(!snapshot||!mission)return undefined;
 return {session:state.session.id??'',player:snapshot.player,faction:snapshot.players.find(player=>player.id===snapshot.player)?.faction??'',mapId:state.session.map?.id??'',ruleset:state.session.kind==='practice'?'practice-v1':state.session.info?.metadata?.ruleset??'',indexVersion:state.index?.version??'',mission:{id:mission.id,version:mission.version,title:mission.title,objectives:mission.objectives.map(({id,text,optional,failure})=>({id,text,optional,failure}))},entry:state.index?.missions.find(entry=>entry.id===mission.id)};
}

/** Only public identity/text participates; changing completion flags or ticks
 * cannot fetch the same mission every frame. Session and perspective do bind it. */
export function missionDisclosureKey(request:MissionDisclosureRequest|undefined):string{
 return request?JSON.stringify(request):'';
}
function objectives(value:unknown):PublicMissionObjective[]{
 if(!Array.isArray(value)||value.length<1||value.length>32)unavailable('The installed mission has an unsupported public objective list.');
 const ids=new Set<string>();
 return value.map(item=>{
  if(!object(item)||!text(item.id,80)||!String(item.id).trim()||ids.has(String(item.id))||!text(item.text,1000)||!String(item.text).trim()||(item.optional!==undefined&&typeof item.optional!=='boolean')||(item.failure!==undefined&&typeof item.failure!=='boolean'))unavailable('The installed mission has invalid public objective text.');
  const id=String(item.id);ids.add(id);
  return {id,text:String(item.text),optional:item.optional===true,failure:item.failure===true};
 });
}
function sameObjectives(a:PublicMissionObjective[],b:PublicMissionObjective[]){
 return a.length===b.length&&a.every((value,index)=>value.id===b[index].id&&value.text===b[index].text&&value.optional===b[index].optional&&value.failure===b[index].failure);
}
function selectPublic(source:Uint8Array,request:MissionDisclosureRequest,entry:LibraryMission):MissionDisclosure{
 let value:unknown;
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(source))}catch{unavailable('The installed mission context is not readable JSON. Retry the matching installed version.');}
 if(!object(value)||value.id!==entry.id||value.version!==entry.version||value.title!==entry.title||value.map_id!==entry.map_id||value.mode!==entry.mode||value.faction!==entry.faction||value.title!==request.mission.title)unavailable('The installed mission context does not match this operation.');
 if(!text(value.rules_notice,16000))unavailable('The installed mission has invalid scenario rule text.');
 let published=objectives(value.objectives);
 if(value.tutorial_variants!==undefined){
  if(entry.mode!=='tutorial'||!Array.isArray(value.tutorial_variants)||value.tutorial_variants.length<1||value.tutorial_variants.length>4)unavailable('The installed training context has unsupported faction variants.');
  const factions=new Set<string>();let selected:Record<string,unknown>|undefined;
  for(const variant of value.tutorial_variants){
   if(!object(variant)||typeof variant.faction!=='string'||!['US','IR','SY','SA'].includes(variant.faction)||factions.has(variant.faction))unavailable('The installed training context has invalid faction variants.');
   factions.add(variant.faction);if(variant.faction===request.faction)selected=variant;
  }
  if(!selected)unavailable('The installed training context does not include this commander’s faction.');
  published=objectives(selected.objectives);
 }
 if(!sameObjectives(published,request.mission.objectives))unavailable('The installed mission objectives differ from this operation. Its scenario context is unavailable.');
 return {id:entry.id,version:entry.version,rulesNotice:String(value.rules_notice),failures:published.filter(item=>item.failure).map(({id,text})=>({id,text}))};
}

/** Fetch exact indexed bytes without ContentLibrary onLoad/global-busy events.
 * No trigger, condition, spawn, hidden counter or raw mission escapes this API. */
export async function loadMissionDisclosure(request:MissionDisclosureRequest,options:MissionDisclosureOptions):Promise<MissionDisclosure>{
 const entry=request.entry?structuredClone(request.entry):undefined;
 if(request.ruleset==='practice-v1')unavailable('Edited practice missions do not use installed scenario context. Return to the editor to review their rules.');
 if(!request.session||!request.indexVersion||!entry||entry.id!==request.mission.id||entry.version!==request.mission.version||entry.map_id!==request.mapId)unavailable('A matching installed mission version is unavailable for this operation.');
 if(!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>MAX_BYTES||!/^[a-f0-9]{64}$/.test(entry.sha256)||!/^\/content\/missions\/[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/.test(entry.url)||entry.url.includes('//')||entry.url.split('/').some(part=>part==='.'||part==='..'))unavailable('The installed mission context reference is invalid.');
 // Detach the public comparison fields before any asynchronous work.
 const captured={...request,mission:{...request.mission,objectives:objectives(request.mission.objectives)},entry};
 let origin:URL;try{origin=new URL(options.baseURL)}catch{unavailable('The installed content origin is unavailable.');}
 if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)unavailable('The installed content origin is unavailable.');
 const url=new URL(entry.url,origin.origin),deadline=AbortSignal.timeout(15000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
 const guard=()=>{
  if(options.signal?.aborted)throw new RuntimeError('mission_context_canceled','Scenario context loading was canceled.',true);
  if(deadline.aborted)unavailable('Scenario context loading timed out. Retry when the installed content is available.');
  if(options.isCurrent&&!options.isCurrent())throw new RuntimeError('mission_context_superseded','This operation changed while its scenario context was loading.',true);
 };
 guard();let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  response=await(options.fetch??globalThis.fetch)(url,{credentials:'omit',redirect:'error',cache:'no-store',signal});guard();
  if(!response.ok)unavailable(`The installed mission context is unavailable (HTTP ${response.status}).`);
  if(response.redirected||response.url&&new URL(response.url).href!==url.href)unavailable('The mission context response does not match its installed source.');
  const length=response.headers.get('Content-Length');
  if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>entry.bytes))unavailable('The installed mission context exceeds its indexed size.');
  reader=response.body?.getReader();if(!reader)unavailable('The installed mission context is empty.');
  const chunks:Uint8Array[]=[];let count=0;
  for(;;){guard();const {done,value}=await reader.read();guard();if(done)break;count+=value.byteLength;if(count>entry.bytes)unavailable('The installed mission context exceeds its indexed size.');chunks.push(value)}
  if(count!==entry.bytes)unavailable('The installed mission context differs from its indexed size.');
  const source=new Uint8Array(count);let offset=0;for(const chunk of chunks){source.set(chunk,offset);offset+=chunk.byteLength}
  if(await sha256Hex(source)!==entry.sha256)unavailable('The installed mission context failed its integrity check. Retry the matching installed version.');guard();
  const result=selectPublic(source,captured,entry);guard();return result;
 }catch(error){
  if(reader)await reader.cancel().catch(()=>{});else await response?.body?.cancel().catch(()=>{});
  guard();if(error instanceof RuntimeError)throw error;return unavailable('The installed mission context could not be loaded. Retry when its content is available.');
 }finally{reader?.releaseLock()}
}
