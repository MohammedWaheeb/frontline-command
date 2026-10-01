import test from 'node:test';
import assert from 'node:assert/strict';
import {ContentLibrary,ContentLibraryError,decodeContentIndex,soloMissionConfig,type ContentIndex} from '../../src/runtime/content-library';
import {contentFixture,encode} from './content-library-fixture';

test('library passes exact detached map/mission bytes through Go adapters before preparing launch',async()=>{
 const f=await contentFixture(),events:string[]=[];
 const library=new ContentLibrary({baseURL:'http://localhost:8000',validator:f.validator,onLoad:value=>events.push(`${value.kind}:${value.stage}`),fetch:async(input,init)=>{assert.equal(new URL(String(input)).origin,'http://localhost:8000');assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.equal('headers' in init!,false);return f.fetcher(input,init)}});
 await library.loadIndex();const loaded=await library.loadMission('us-one');assert.deepEqual(f.calls.map(value=>value.kind),['map','mission']);assert.deepEqual(f.calls[0].data[0],f.mapSource);assert.deepEqual(f.calls[1].data,[f.mapSource,f.missionSource]);assert.equal(loaded.mission.title,'First Foothold');assert.equal(loaded.packs.length,1);assert.equal(events.at(-1),'mission:ready');assert.ok(events.includes('mission:validating'));
 const config=soloMissionConfig(loaded,'hard',7);config.map.title='changed';config.mission!.title='changed';assert.equal(loaded.map.title,f.map.title);assert.equal(loaded.mission.title,f.definition.title);assert.equal(config.ruleset,'scenario-v2');assert.deepEqual(library.missingPacks(['base'],[{id:'base',version:'old'}]).map(pack=>pack.id),['base']);assert.deepEqual(library.missingPacks(['base'],[{id:'base',version:'2.0.0'}]),[]);
 const index=library.index!;index.maps[0].id='changed';assert.equal(library.index!.maps[0].id,'layout');assert.deepEqual(await library.catalog(),{units:{example:{cost:1000}}});
});
test('strict index rejects traversal, private URLs, duplicates, unknown fields and missing dependencies',async()=>{
 const f=await contentFixture();
 for(const mutate of [
  (v:any)=>v.maps[0].url='https://other.test/map.json',(v:any)=>v.maps[0].url='/content/maps/../private.json',(v:any)=>v.maps[0].url='/content/maps/%2e%2e/private.json',(v:any)=>v.maps[0].url='/api/v1/saves/private.json',(v:any)=>v.maps[0].url='/content/maps/layout.json?token=secret',(v:any)=>v.maps[0].url='/content/maps/layout.js',
  (v:any)=>v.packs[0].manifest_url='/assets//base.json',(v:any)=>v.maps[0].required_packs=['undeclared'],(v:any)=>v.missions[0].map_id='missing',(v:any)=>v.maps.push(v.maps[0]),(v:any)=>v.missions.push({...v.missions[0],id:'other',url:'/content/missions/other.json'}),(v:any)=>v.maps[0].extra=true,(v:any)=>v.missions[0].order=7,(v:any)=>v.maps[0].bytes=17*1024*1024,
 ]){const index=structuredClone(f.index);mutate(index);assert.throws(()=>decodeContentIndex(encode(index)),{code:'content_index_invalid'})}
 assert.throws(()=>decodeContentIndex(encode({...f.index,format_version:2})),{code:'content_index_incompatible'});assert.throws(()=>decodeContentIndex(new Uint8Array(1024*1024+1)),{code:'content_index_invalid'});
});
test('integrity or Go validation failure preserves source and never reports ready or launches substitute data',async()=>{
 const f=await contentFixture();const bad=f.mapSource.slice();bad[bad.length-2]=32;f.files.set('/content/maps/layout.json',bad);
 await assert.rejects(f.library.loadMap('layout'),(error:unknown)=>{assert.ok(error instanceof ContentLibraryError);assert.equal(error.code,'content_integrity');const original=error.originalFile()!;assert.deepEqual(original.data,bad);original.data.fill(0);assert.deepEqual(error.originalFile()!.data,bad);assert.equal(JSON.stringify(error).includes('tiles'),false);return true});assert.equal(f.calls.length,0);
 f.files.set('/content/maps/layout.json',f.mapSource);let validate=0;const library=new ContentLibrary({validator:{...f.validator,validateMap:async()=>{validate++;throw new Error('Go reports a blocked supply route.')}},fetch:f.fetcher});library.useIndex(encode(f.index));await assert.rejects(library.loadMap('layout'),(error:any)=>{assert.equal(error.originalFile().data.length,f.mapSource.length);assert.match(error.message,/blocked supply route/);return true});assert.equal(validate,1);assert.equal(library.index!.maps[0].id,'layout');
});
test('failed refresh retains last valid registry; explicit retry succeeds and original index remains exportable',async()=>{
 const f=await contentFixture();f.files.set('/content/index.json',encode({...f.index,format_version:2}));await assert.rejects(f.library.loadIndex(),(error:any)=>{assert.equal(error.code,'content_index_incompatible');assert.ok(error.originalFile());return true});assert.equal(f.library.state.phase,'error');assert.equal(f.library.index?.version,'2.0.0');f.files.set('/content/index.json',encode({...f.index,version:'2.0.1'}));await f.library.loadIndex();assert.equal(f.library.state.phase,'ready');assert.equal(f.library.index?.version,'2.0.1');
});
test('mismatched authoritative metadata rejects the file and leaves caller buffers unchanged',async()=>{
 const f=await contentFixture(),before=f.mapSource.slice();const library=new ContentLibrary({validator:{...f.validator,validateMap:async(data)=>{data.fill(0);return {...f.map,id:'wrong-map'}}},fetch:f.fetcher});library.useIndex(encode(f.index));await assert.rejects(library.loadMap('layout'),{code:'content_metadata_mismatch'});assert.deepEqual(f.mapSource,before);
 const missionLibrary=new ContentLibrary({validator:{...f.validator,validateMission:async()=>({...f.definition,version:'2'})},fetch:f.fetcher});missionLibrary.useIndex(encode(f.index));await assert.rejects(missionLibrary.loadMission('us-one'),{code:'content_metadata_mismatch'});
});
test('stream overflow is canceled, canceled work is discarded and changing the index invalidates in-flight validation',async()=>{
 const f=await contentFixture();let canceled=false;const library=new ContentLibrary({validator:f.validator,fetch:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(f.mapSource.length+1))},cancel(){canceled=true}}))});library.useIndex(encode(f.index));await assert.rejects(library.loadMap('layout'),{code:'content_size'});assert.equal(canceled,true);
 let finish!:(value:any)=>void,entered!:()=>void;const waiting=new Promise<void>(resolve=>entered=resolve);const pendingLibrary=new ContentLibrary({validator:{...f.validator,validateMap:()=>new Promise(resolve=>{finish=resolve;entered()})},fetch:f.fetcher});pendingLibrary.useIndex(encode(f.index));const pending=pendingLibrary.loadMap('layout');await waiting;pendingLibrary.useIndex(encode({...f.index,version:'next'}));finish(f.map);await assert.rejects(pending,{code:'content_superseded'});
 const abort=new AbortController();abort.abort();await assert.rejects(f.library.loadMap('layout',abort.signal),{code:'content_canceled'});assert.equal(f.calls.length,0);
});
test('empty installed index is explicit missing content, while private/executable pack manifests are rejected',()=>{
 const empty:ContentIndex={format_version:1,version:'1',packs:[],maps:[],missions:[]};assert.deepEqual(decodeContentIndex(encode(empty)),empty);
 assert.throws(()=>decodeContentIndex(encode({...empty,packs:[{id:'bad',version:'1',manifest_url:'/api/v1/profiles/me'}]})),{code:'content_index_invalid'});
});
