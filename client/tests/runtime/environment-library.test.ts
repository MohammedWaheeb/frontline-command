import test from 'node:test';
import assert from 'node:assert/strict';
import {ContentLibrary,ContentLibraryError,decodeContentIndex,mapBlueprintKey} from '../../src/runtime/content-library';
import {sha256Hex} from '../../src/runtime/crypto';
import {contentFixture,encode} from './content-library-fixture';

async function fixture(){
 const f=await contentFixture(),environment={schema:'fc-map-environment/1',map:{id:f.map.id,version:f.map.version,sha256:f.index.maps[0].sha256},object_skins:[],placements:[]},bytes=encode(environment);
 f.index.maps[0].environment={url:'/content/environment/layout.json',sha256:await sha256Hex(bytes),bytes:bytes.length};
 f.files.set('/content/environment/layout.json',bytes);f.library.useIndex(encode(f.index));return {...f,environment,bytes};
}
test('optional scenery is exact-byte verified after the public map passes Go validation',async()=>{
 const f=await fixture(),data=await f.library.loadEnvironment(f.map);
 assert.deepEqual(data,f.environment);assert.equal(Object.isFrozen(data),true);assert.deepEqual(f.calls.map(call=>call.kind),['map']);assert.deepEqual(f.calls[0].data[0],f.mapSource);
 const reordered=Object.fromEntries(Object.entries(f.map).reverse()) as typeof f.map;assert.equal(mapBlueprintKey(reordered),mapBlueprintKey(f.map));assert.deepEqual(await f.library.loadEnvironment(reordered),f.environment);
 let fetched=false;const empty=new ContentLibrary({validator:f.validator,fetch:async()=>{fetched=true;throw Error('unexpected fetch')}});assert.equal(await empty.loadEnvironment(f.map),undefined);empty.useIndex(encode({...f.index,maps:f.index.maps.map(({environment,...map})=>map)}));assert.equal(await empty.loadEnvironment(f.map),undefined);assert.equal(fetched,false);
});
test('a reused map ID/version cannot authorize scenery for different terrain, objects or starts',async()=>{
 const f=await fixture();let sidecarFetches=0;
 const library=new ContentLibrary({validator:f.validator,fetch:async(input,init)=>{if(new URL(String(input)).pathname.includes('/environment/'))sidecarFetches++;return f.fetcher(input,init)}});library.useIndex(encode(f.index));
 for(const change of [(map:typeof f.map)=>map.tiles[0].terrain='blocked',(map:typeof f.map)=>map.spawns[0].position.x=500,(map:typeof f.map)=>map.objects=[{id:5,class:'light_prop',position:{x:500,y:500}}]]){
  const changed=structuredClone(f.map);change(changed);await assert.rejects(library.loadEnvironment(changed),{code:'environment_map_mismatch'});
 }
 assert.equal(sidecarFetches,0);assert.equal(f.map.tiles[0].terrain,'open');
});
test('corrupt optional bytes remain exportable and mismatched source bindings are rejected',async()=>{
 const f=await fixture(),bad=f.bytes.slice();bad[bad.length-2]=32;f.files.set('/content/environment/layout.json',bad);
 await assert.rejects(f.library.loadEnvironment(f.map),(error:unknown)=>{assert.ok(error instanceof ContentLibraryError);assert.equal(error.code,'content_integrity');assert.deepEqual(error.originalFile()?.data,bad);return true});
 const wrong=encode({...f.environment,map:{...f.environment.map,sha256:'0'.repeat(64)}});f.files.set('/content/environment/layout.json',wrong);f.index.maps[0].environment={...f.index.maps[0].environment!,sha256:await sha256Hex(wrong),bytes:wrong.length};f.library.useIndex(encode(f.index));await assert.rejects(f.library.loadEnvironment(f.map),{code:'environment_map_mismatch'});
});
test('environment descriptors reject unsafe paths, unknown fields and excessive declared sizes',async()=>{
 const f=await fixture();for(const patch of [{url:'/api/private.json'},{url:'https://other.test/scenery.json'},{url:'/content/environment/../map.json'},{bytes:0},{bytes:(1<<20)+1},{sha256:'A'.repeat(64)},{secret:'forbidden'}]){const index=structuredClone(f.index);Object.assign(index.maps[0].environment!,patch);assert.throws(()=>decodeContentIndex(encode(index)),{code:'content_index_invalid'})}
 assert.ok(decodeContentIndex(encode(f.index)).maps[0].environment);
});
test('cancellation and index replacement cannot install an in-flight scenery response',async()=>{
 const f=await fixture();let enter!:()=>void,finish!:(value:Response)=>void;const started=new Promise<void>(resolve=>enter=resolve);
 const library=new ContentLibrary({validator:f.validator,fetch:async(input,init)=>new URL(String(input)).pathname.includes('/environment/')?new Promise(resolve=>{finish=resolve;enter()}):f.fetcher(input,init)});library.useIndex(encode(f.index));
 const pending=library.loadEnvironment(f.map);await started;library.useIndex(encode({...f.index,version:'next'}));finish(new Response(f.bytes.slice()));await assert.rejects(pending,{code:'content_superseded'});
 const controller=new AbortController();controller.abort();await assert.rejects(f.library.loadEnvironment(f.map,controller.signal),{code:'content_canceled'});
});
