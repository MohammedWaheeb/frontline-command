import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {sha256Hex} from '../../src/runtime/crypto';
import {RuntimeError} from '../../src/runtime/errors';
import type {ContentIndex,LibraryMission} from '../../src/runtime/content-library';
import type {ApplicationState} from '../../src/app/application';
import {loadMissionDisclosure,missionDisclosureKey,requestMissionDisclosure,type MissionDisclosureRequest} from '../../src/app/mission-disclosure';

const origin='http://127.0.0.1:8080';
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const publicObjective=(item:any)=>({id:item.id,text:item.text,optional:item.optional===true,failure:item.failure===true});
const definition=()=>({id:'public-context',version:'1',title:'Context fixture',map_id:'layout',mode:'campaign',faction:'US',rules_notice:'Authored reinforcements. Ordinary combat rules.',objectives:[{id:'survive',text:'Keep the command post.',optional:false,failure:false,condition:{kind:'hidden-condition',counter:'SECRET_COUNTER'}},{id:'command-lost',text:'Lose the command post.',optional:false,failure:true,condition:{kind:'hidden-condition',tag:'SECRET_TAG'}}],triggers:[{id:'SECRET_TRIGGER',condition:{tick:98765}}],initial:[{tag:'SECRET_SPAWN',position:{x:98765,y:43210}}]});
async function fixture(value:any=definition(),source=encode(value)){
 const entry:LibraryMission={id:value.id,version:value.version,title:value.title,map_id:value.map_id,mode:value.mode,faction:value.faction,url:'/content/missions/public-context.json',sha256:await sha256Hex(source),bytes:source.byteLength,order:1,required_packs:[]};
 const request:MissionDisclosureRequest={session:'session-one',player:1,faction:'US',mapId:entry.map_id,ruleset:'scenario-v2',indexVersion:'2.0.0',mission:{id:entry.id,version:entry.version,title:entry.title,objectives:value.objectives.map(publicObjective)},entry};
 const fetcher:typeof fetch=async()=>new Response(source.slice());
 return {value,source,entry,request,fetcher};
}
async function unavailable(operation:Promise<unknown>,message?:RegExp){
 await assert.rejects(operation,(error:unknown)=>error instanceof RuntimeError&&error.code==='mission_context_unavailable'&&error.recoverable&&(!message||message.test(error.message)));
}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve}}

test('verified bytes disclose only public rule text and failure identity/text',async()=>{
 const f=await fixture(),calls:Array<{url:string;options:RequestInit|undefined}>=[];
 const result=await loadMissionDisclosure(f.request,{baseURL:origin,fetch:async(url,options)=>{calls.push({url:String(url),options});return new Response(f.source.slice())}});
 assert.deepEqual(result,{id:f.entry.id,version:f.entry.version,rulesNotice:f.value.rules_notice,failures:[{id:'command-lost',text:'Lose the command post.'}]});
 assert.equal(calls.length,1);assert.equal(calls[0].url,`${origin}${f.entry.url}`);
 assert.equal(calls[0].options?.credentials,'omit');assert.equal(calls[0].options?.redirect,'error');assert.equal(calls[0].options?.cache,'no-store');assert.ok(calls[0].options?.signal);
 assert.doesNotMatch(JSON.stringify(result),/SECRET|condition|trigger|position|counter|98765/);
});

test('binding ignores tick/completion/counters but changes for session, perspective, public shape and index identity',async()=>{
 const f=await fixture(),index:ContentIndex={format_version:1,version:'2.0.0',packs:[],maps:[],missions:[f.entry]};
 const state:Pick<ApplicationState,'session'|'index'|'snapshot'>={session:{phase:'active',id:'one',kind:'solo',map:{id:'layout'} as any,info:{metadata:{ruleset:'scenario-v2'}} as any},index,snapshot:create(PlayerSnapshotSchema,{tick:20,player:1,players:[{id:1,faction:'US'},{id:2,faction:'IR'}],mission:{id:f.entry.id,version:'1',title:f.entry.title,objectives:f.value.objectives.map((item:any)=>({...publicObjective(item),complete:false,progress:0,required:10}))}})};
 const initial=requestMissionDisclosure(state)!,key=missionDisclosureKey(initial);
 const steady=structuredClone(state);steady.snapshot!.tick=999;steady.snapshot!.mission!.checkpoint='checkpoint';steady.snapshot!.mission!.objectives[0].complete=true;steady.snapshot!.mission!.objectives[0].progress=10;
 assert.equal(missionDisclosureKey(requestMissionDisclosure(steady)),key);
 const changes:Array<(value:typeof state)=>void>=[value=>{value.session.id='two'},value=>{value.snapshot!.player=2},value=>{value.snapshot!.players[0].faction='SA'},value=>{value.snapshot!.mission!.version='2'},value=>{value.snapshot!.mission!.objectives[0].text='Changed text'},value=>{value.snapshot!.mission!.objectives[0].optional=true},value=>{value.snapshot!.mission!.objectives[0].failure=true},value=>{value.index!.version='2.1'},value=>{value.index!.missions[0].sha256='0'.repeat(64)},value=>{value.session.map!.id='other-layout'},value=>{value.session.kind='practice'}];
 for(const change of changes){const changed=structuredClone(state);change(changed);assert.notEqual(missionDisclosureKey(requestMissionDisclosure(changed)),key)}
 assert.doesNotMatch(key,/"(?:checkpoint|complete|progress|required)":|SECRET/);
 assert.equal(requestMissionDisclosure({...state,snapshot:undefined}),undefined);
 assert.equal(requestMissionDisclosure({...state,snapshot:create(PlayerSnapshotSchema)}),undefined);
 const missing=requestMissionDisclosure({...state,session:{phase:'menu'}})!;
 assert.equal(missing.session,'');await unavailable(loadMissionDisclosure(missing,{baseURL:origin,fetch:f.fetcher}),/matching installed/);
});

test('identity mismatch, practice and invalid references fail before fetching',async()=>{
 const f=await fixture();let fetched=0;const fetcher:typeof fetch=async()=>{fetched++;return new Response(f.source.slice())};
 const changes:Array<(value:MissionDisclosureRequest)=>void>=[value=>{value.entry=undefined},value=>{value.session=''},value=>{value.indexVersion=''},value=>{value.mission.id='another'},value=>{value.mission.version='future'},value=>{value.mapId='edited-map'},value=>{value.ruleset='practice-v1'},value=>{value.entry!.bytes=0},value=>{value.entry!.bytes=2*1024*1024+1},value=>{value.entry!.sha256='bad'},value=>{value.entry!.url='https://evil.invalid/content/missions/example.json'},value=>{value.entry!.url='/content/missions/../example.json'},value=>{value.entry!.url='/content/missions/a//b.json'},value=>{value.entry!.url='/content/missions/example.json?token=secret'}];
 for(const change of changes){const changed=structuredClone(f.request);change(changed);await unavailable(loadMissionDisclosure(changed,{baseURL:origin,fetch:fetcher}))}
 for(const baseURL of ['file:///content','https://username:password@example.invalid','not a URL'])await unavailable(loadMissionDisclosure(f.request,{baseURL,fetch:fetcher}));
 assert.equal(fetched,0);
});

test('matching bytes cannot supply context for a different public mission shape',async()=>{
 const f=await fixture();
 const changes:Array<(value:MissionDisclosureRequest)=>void>=[value=>{value.mission.title='Changed title'},value=>{value.mission.objectives[0].text='Edited text'},value=>{value.mission.objectives[0].optional=true},value=>{value.mission.objectives[0].failure=true},value=>{value.mission.objectives.reverse()},value=>{value.mission.objectives.pop()}];
 for(const change of changes){const changed=structuredClone(f.request);change(changed);await unavailable(loadMissionDisclosure(changed,{baseURL:origin,fetch:f.fetcher}),/match|differ/)}
});

test('exact size and SHA are checked independently before parsing',async()=>{
 const f=await fixture(),wrongHash=structuredClone(f.request);wrongHash.entry!.sha256='0'.repeat(64);
 await unavailable(loadMissionDisclosure(wrongHash,{baseURL:origin,fetch:f.fetcher}),/integrity check/);
 for(const source of [f.source.subarray(0,f.source.length-1),new Uint8Array([...f.source,32])])await unavailable(loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>new Response(source)}),/indexed size/);
 for(const length of [String(f.entry.bytes+1),'-1','invalid','9007199254740992'])await unavailable(loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>new Response(f.source.slice(),{headers:{'Content-Length':length}})}),/indexed size/);
 const accepted=await loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>new Response(f.source.slice(),{headers:{'Content-Length':'1'}})});
 assert.equal(accepted.id,f.entry.id,'streamed decoded bytes are authoritative even when a compressed header is smaller');
});

test('malformed verified public JSON remains unavailable without exposing raw data',async()=>{
 const changes:Array<(value:any)=>void>=[value=>{value.id='other'},value=>{value.version='future'},value=>{value.map_id='other'},value=>{value.mode='other'},value=>{value.faction='IR'},value=>{value.title='other'},value=>{delete value.rules_notice},value=>{value.rules_notice='\u0000SECRET'},value=>{value.rules_notice='x'.repeat(16001)},value=>{value.objectives=[]},value=>{value.objectives=[...value.objectives,...value.objectives]},value=>{value.objectives[0].text='\u0000SECRET'},value=>{value.objectives[0].failure='yes'},value=>{value.objectives[0].optional=1}];
 for(const change of changes){const reference=await fixture(),value=definition();change(value);const altered=encode(value);reference.request.entry!.sha256=await sha256Hex(altered);reference.request.entry!.bytes=altered.length;await unavailable(loadMissionDisclosure(reference.request,{baseURL:origin,fetch:async()=>new Response(altered)}))}
 for(const source of [new Uint8Array([0xc3,0x28]),new TextEncoder().encode('{bad SECRET'),encode(null)]){const f=await fixture(definition(),source);await unavailable(loadMissionDisclosure(f.request,{baseURL:origin,fetch:f.fetcher}))}
});

test('selected tutorial faction supplies its own verified public failure text',async()=>{
 const value:any=definition();value.mode='tutorial';
 value.tutorial_variants=['US','IR','SY','SA'].map(faction=>({faction,objectives:[{id:'fail',text:`Lose ${faction} command.`,failure:true,optional:false,condition:{tag:`SECRET_${faction}`}}],triggers:[{id:'SECRET'}]}));
 const f=await fixture(value);
 for(const faction of ['US','IR','SY','SA']){const request=structuredClone(f.request);request.faction=faction;request.mission.objectives=value.tutorial_variants.find((variant:any)=>variant.faction===faction).objectives.map(publicObjective);const result=await loadMissionDisclosure(request,{baseURL:origin,fetch:f.fetcher});assert.deepEqual(result.failures,[{id:'fail',text:`Lose ${faction} command.`}]);assert.doesNotMatch(JSON.stringify(result),/SECRET/)}
 const absent=structuredClone(f.request);absent.faction='unknown';await unavailable(loadMissionDisclosure(absent,{baseURL:origin,fetch:f.fetcher}),/faction/);
 value.tutorial_variants[1].faction='US';const duplicate=await fixture(value);await unavailable(loadMissionDisclosure(duplicate.request,{baseURL:origin,fetch:duplicate.fetcher}),/faction variants/);
 value.mode='campaign';const misplaced=await fixture(value);await unavailable(loadMissionDisclosure(misplaced.request,{baseURL:origin,fetch:misplaced.fetcher}),/unsupported faction variants/);
});

test('HTTP failures, redirects and unexpected response sources remain retryable',async()=>{
 const f=await fixture();
 await unavailable(loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>new Response(null,{status:404})}),/HTTP 404/);
 for(const property of [{url:'https://other.invalid/source.json'},{redirected:true}]){const response=new Response(f.source.slice());for(const [key,value] of Object.entries(property))Object.defineProperty(response,key,{value});await unavailable(loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>response}),/installed source/)}
 await unavailable(loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>{throw Error('SECRET_NETWORK_DETAILS')}}),/could not be loaded/);
 await unavailable(loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>new Response(null)}),/empty/);
});

test('streamed overrun is canceled as soon as the indexed bound is crossed',async()=>{
 const f=await fixture();let canceled=false,reads=0;
 const body=new ReadableStream<Uint8Array>({pull(controller){reads++;controller.enqueue(reads===1?f.source:new Uint8Array([32]));},cancel(){canceled=true}});
 await unavailable(loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>new Response(body)}),/exceeds its indexed size/);
 assert.equal(canceled,true);assert.ok(reads<=3);
});

test('external cancellation prevents publication before and after a pending fetch',async()=>{
 const f=await fixture(),early=new AbortController();early.abort();let calls=0;
 await assert.rejects(loadMissionDisclosure(f.request,{baseURL:origin,signal:early.signal,fetch:async()=>{calls++;return new Response(f.source.slice())}}),(error:any)=>error.code==='mission_context_canceled');assert.equal(calls,0);
 const pending=deferred<Response>(),late=new AbortController();let canceled=false;
 const operation=loadMissionDisclosure(f.request,{baseURL:origin,signal:late.signal,fetch:async()=>pending.promise});
 late.abort();pending.resolve(new Response(new ReadableStream({start(controller){controller.enqueue(f.source.slice())},cancel(){canceled=true}})));
 await assert.rejects(operation,(error:any)=>error.code==='mission_context_canceled');assert.equal(canceled,true);
});

test('a session or perspective change during streaming cancels the stale disclosure',async()=>{
 const f=await fixture(),started=deferred<void>();let current=true,canceled=false,bodyController!:ReadableStreamDefaultController<Uint8Array>;
 const body=new ReadableStream<Uint8Array>({start(controller){bodyController=controller;started.resolve()},cancel(){canceled=true}});
 const operation=loadMissionDisclosure(f.request,{baseURL:origin,isCurrent:()=>current,fetch:async()=>new Response(body)});
 await started.promise;await Promise.resolve();current=false;bodyController.enqueue(f.source.slice());
 await assert.rejects(operation,(error:any)=>error.code==='mission_context_superseded');assert.equal(canceled,true);
});

test('request identity and objective fields are detached before asynchronous response work',async()=>{
 const f=await fixture(),pending=deferred<Response>(),operation=loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>pending.promise});
 f.request.mission.objectives[0].text='mutated after dispatch';f.request.entry!.sha256='0'.repeat(64);f.request.entry!.version='mutated';
 pending.resolve(new Response(f.source.slice()));const result=await operation;assert.equal(result.version,'1');assert.deepEqual(result.failures,[{id:'command-lost',text:'Lose the command post.'}]);
});

test('cancellation and supersession are checked after the asynchronous checksum',async t=>{
 const f=await fixture(),digest=crypto.subtle.digest.bind(crypto.subtle);
 for(const kind of ['abort','supersede'] as const){
  const pending=deferred<ArrayBuffer>(),entered=deferred<void>(),abort=new AbortController();let current=true;
  const mocking=t.mock.method(crypto.subtle,'digest',async()=>{entered.resolve();return pending.promise});
  const operation=loadMissionDisclosure(f.request,{baseURL:origin,signal:abort.signal,isCurrent:()=>current,fetch:f.fetcher});
  await entered.promise;if(kind==='abort')abort.abort();else current=false;
  pending.resolve(await digest('SHA-256',f.source.slice().buffer));
  await assert.rejects(operation,(error:any)=>error.code===`mission_context_${kind==='abort'?'canceled':'superseded'}`);
  mocking.mock.restore();
 }
});

test('the deadline creates a local retryable context error',async t=>{
 const f=await fixture(),deadline=new AbortController();t.mock.method(AbortSignal,'timeout',(milliseconds:number)=>{assert.equal(milliseconds,15000);return deadline.signal});
 const operation=loadMissionDisclosure(f.request,{baseURL:origin,fetch:async()=>{deadline.abort();return new Response(f.source.slice())}});
 await unavailable(operation,/timed out/);
});

test('all installed authored missions and T5 faction variants pass exact-byte public extraction',async()=>{
 const content=resolve(process.env.MISSION_DISCLOSURE_CONTENT??'../content'),index=JSON.parse(await readFile(resolve(content,'index.json'),'utf8')) as ContentIndex;let cases=0;
 assert.equal(index.missions.length,31);
 for(const entry of index.missions){
  const source=new Uint8Array(await readFile(resolve(content,entry.url.replace(/^\/content\//,'')))),value=JSON.parse(new TextDecoder().decode(source));
  assert.equal(source.length,entry.bytes);assert.equal(await sha256Hex(source),entry.sha256);
  const factions=value.tutorial_variants?.map((variant:any)=>variant.faction)??[entry.faction];
  for(const faction of factions){const published=value.tutorial_variants?.find((variant:any)=>variant.faction===faction)?.objectives??value.objectives,request:MissionDisclosureRequest={session:`installed-${entry.id}`,player:1,faction,mapId:entry.map_id,ruleset:'scenario-v2',indexVersion:index.version,mission:{id:entry.id,version:entry.version,title:entry.title,objectives:published.map(publicObjective)},entry};const result=await loadMissionDisclosure(request,{baseURL:origin,fetch:async()=>new Response(source.slice())});assert.equal(result.rulesNotice,value.rules_notice);assert.deepEqual(result.failures,published.filter((item:any)=>item.failure).map(({id,text}:any)=>({id,text})));assert.deepEqual(Object.keys(result).sort(),['failures','id','rulesNotice','version']);cases++}
 }
 assert.equal(cases,34);
});
