import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AudioMixer} from '../../src/audio/mixer';
import {audioVariantKey,type AudioVariant} from '../../src/audio/index';
const encode=(value:string)=>new TextEncoder().encode(value),sha=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const variant=(label:string):AudioVariant=>({url:'/art/audio/test.wav',bytes:encode(label).length,sha256:sha(encode(label)),duration:1,caption:label});
const document=(label:string)=>({format:1,sample_rate:24000,entries:{'vo.test':{bus:'voice',priority:1,cooldown_ms:0,loop:false,variants:[variant(label)]}}});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(value=>resolve=value);return {promise,resolve}};
const decoded=(label:string)=>({duration:1,numberOfChannels:1,length:24000,label});
const preferences={audioConsent:false,captions:false,audio:{master:1,voice:1,music:1,effects:1,ui:1}};
function course(){
 let label='A',malformed=false,unavailable=false,holdA=false,reads=0,decodes=0,indexReads=0;
 const entered=deferred<void>(),held=deferred<any>();
 const mixer=new AudioMixer(preferences,async input=>{
  if(String(input).endsWith('index.json')){indexReads++;return new Response(JSON.stringify(malformed?{bad:true}:document(label)))}
  reads++;return new Response(unavailable?'unavailable':encode(label),{status:unavailable?503:200});
 });
 (mixer as any).context={state:'suspended',close:async()=>{},decodeAudioData:async(data:ArrayBuffer)=>{decodes++;const name=new TextDecoder().decode(data);entered.resolve();return holdA&&name==='A'?held.promise:decoded(name)}};
 return {mixer,entered,held,change(value:string){label=value},malformed(value:boolean){malformed=value},unavailable(value:boolean){unavailable=value},hold(){holdA=true},buffer(value:AudioVariant=mixer.manifest!.entries['vo.test'].variants[0]):Promise<any>{return(mixer as any).buffer(value)},counts(){return{reads,decodes,indexReads}}};
}
test('changed index at the same URL cannot reuse a decoded old clip',async()=>{
 const c=course();await c.mixer.loadIndex();const old=await c.buffer();assert.equal(old.label,'A');const generation=c.mixer.statistics.generation;
 c.change('B');await c.mixer.loadIndex(true);const next=await c.buffer();assert.equal(next.label,'B');assert.notEqual(next,old);assert.equal(c.mixer.statistics.generation,generation+1);assert.deepEqual(c.counts(),{reads:2,decodes:2,indexReads:2});c.mixer.dispose();
});
test('pending old decode cannot satisfy or delete the new descriptor request',async()=>{
 const c=course();c.hold();await c.mixer.loadIndex();const old=c.buffer(),rejected=assert.rejects(old,(error:any)=>error.name==='AbortError');await c.entered.promise;
 c.change('B');await c.mixer.loadIndex(true);const next=await c.buffer();assert.equal(next.label,'B');c.held.resolve(decoded('A'));await rejected;
 assert.equal(await c.buffer(),next);assert.deepEqual(c.counts(),{reads:2,decodes:2,indexReads:2});assert.equal(c.mixer.statistics.pending,0);assert.equal(c.mixer.statistics.buffers,1);c.mixer.dispose();
});
test('failed candidate index retains the previous decoded generation',async()=>{
 const c=course();await c.mixer.loadIndex();const original=c.mixer.manifest,old=await c.buffer(),generation=c.mixer.statistics.generation;
 c.malformed(true);await c.mixer.loadIndex(true);assert.equal(c.mixer.manifest,original);assert.equal(c.mixer.statistics.generation,generation);assert.equal(await c.buffer(),old);assert.equal(c.counts().reads,1);assert(c.mixer.state.get().error);c.mixer.dispose();
});
test('only a validated changed index stops old sources and clears old captions',async()=>{
 const c=course();await c.mixer.loadIndex();let stopped=0,disconnected=0;
 (c.mixer as any).sources.add({node:{stop(){stopped++},disconnect(){disconnected++},onended:null},gain:{disconnect(){disconnected++}},bus:'voice',priority:1,music:false});
 c.mixer.state.update(state=>({...state,captions:[{id:1,text:'A speech',priority:1,expires:100000}]}));
 c.malformed(true);await c.mixer.loadIndex(true);assert.equal(stopped,0);assert.equal(c.mixer.statistics.sources,1);assert.equal(c.mixer.state.get().captions[0].text,'A speech');
 c.malformed(false);c.change('B');await c.mixer.loadIndex(true);assert.equal(stopped,1);assert.equal(disconnected,2);assert.equal(c.mixer.statistics.sources,0);assert.deepEqual(c.mixer.state.get().captions,[]);c.mixer.dispose();
});
test('exact same index retry verifies again without discarding coherent decoded clips',async()=>{
 const c=course();await c.mixer.loadIndex();const old=await c.buffer(),generation=c.mixer.statistics.generation;await c.mixer.loadIndex(true);
 assert.equal(await c.buffer(),old);assert.equal(c.mixer.statistics.generation,generation);assert.deepEqual(c.counts(),{reads:1,decodes:1,indexReads:2});c.mixer.dispose();
});
test('buffer keys include byte/hash/duration and codec fallback identity',()=>{
 const a=variant('A'),key=audioVariantKey(a);
 for(const change of [{url:'/art/audio/other.wav'},{bytes:2},{sha256:'b'.repeat(64)},{duration:2},{mp3_url:'/art/audio/test.mp3',mp3_bytes:3,mp3_sha256:'c'.repeat(64)}])assert.notEqual(audioVariantKey({...a,...change}),key);
 const fallback={...a,mp3_url:'/art/audio/test.mp3',mp3_bytes:3,mp3_sha256:'c'.repeat(64)};
 assert.notEqual(audioVariantKey({...fallback,mp3_sha256:'d'.repeat(64)}),audioVariantKey(fallback));
 assert.equal(audioVariantKey({...a,caption:'Caption is index-owned.'}),key);
});
test('different same-URL descriptors and concurrent exact descriptors remain distinct/deduplicated',async()=>{
 const c=course();await c.mixer.loadIndex();const [a,duplicate]=await Promise.all([c.buffer(),c.buffer()]);assert.equal(a,duplicate);assert.equal(c.counts().reads,1);
 c.change('B');const b=await c.buffer(variant('B'));assert.equal(b.label,'B');assert.notEqual(a,b);assert.equal(c.counts().reads,2);c.mixer.dispose();
});
test('failed reads release pending entries; corrupt recovery never reaches the decoder',async()=>{
 const c=course();await c.mixer.loadIndex();c.unavailable(true);await assert.rejects(c.buffer());assert.equal(c.mixer.statistics.pending,0);
 c.unavailable(false);c.change('B');await assert.rejects(c.buffer(),/integrity/);assert.equal(c.counts().decodes,0);c.change('A');assert.equal((await c.buffer()).label,'A');assert.equal(c.counts().reads,3);c.mixer.dispose();
});
test('disposed pending decode cannot publish a buffer or issue more index requests',async()=>{
 const c=course();c.hold();await c.mixer.loadIndex();const pending=c.buffer(),rejected=assert.rejects(pending,(error:any)=>error.name==='AbortError');await c.entered.promise;c.mixer.dispose();c.held.resolve(decoded('A'));await rejected;
 assert.equal(c.mixer.statistics.pending,0);assert.equal(c.mixer.statistics.buffers,0);assert.equal(c.mixer.statistics.sources,0);await c.mixer.loadIndex(true);assert.equal(c.counts().indexReads,1);
});
test('dispose during index capture prevents late index publication',async()=>{
 const entered=deferred<void>(),held=deferred<Response>();let requests=0;
 const mixer=new AudioMixer(preferences,async()=>{requests++;entered.resolve();return held.promise});const pending=mixer.loadIndex();await entered.promise;mixer.dispose();held.resolve(new Response(JSON.stringify(document('A'))));await pending;
 assert.equal(mixer.manifest,undefined);await mixer.loadIndex(true);assert.equal(requests,1);
});
test('index retry preserves four-decode admission until old decoders finish',async()=>{
 let label='A',reads=0;const held=Array.from({length:4},()=>deferred<any>()),entered=deferred<void>();let decoding=0;
 const mixer=new AudioMixer(preferences,async input=>String(input).endsWith('index.json')?new Response(JSON.stringify(document(label))):(reads++,new Response(encode(label))));
 (mixer as any).context={state:'suspended',close:async()=>{},decodeAudioData:async(data:ArrayBuffer)=>{const name=new TextDecoder().decode(data);if(name==='B')return decoded(name);const slot=decoding++;if(decoding===4)entered.resolve();return held[slot].promise}};
 await mixer.loadIndex();const first=held.map((_,i)=>(mixer as any).buffer({...variant('A'),url:`/art/audio/a${i}.wav`}) as Promise<any>),rejected=first.map(p=>assert.rejects(p,(e:any)=>e.name==='AbortError'));await entered.promise;
 label='B';await mixer.loadIndex(true);await assert.rejects((mixer as any).buffer(variant('B')),(e:any)=>e.name==='QuotaExceededError');assert.equal(reads,4);
 held.forEach(item=>item.resolve(decoded('A')));await Promise.all(rejected);assert.equal((await(mixer as any).buffer(variant('B'))).label,'B');assert.equal(reads,5);mixer.dispose();
});
