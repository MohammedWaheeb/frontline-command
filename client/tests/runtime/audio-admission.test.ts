import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AudioMixer} from '../../src/audio/mixer';

// Source admission tests with diagnostic bytes and fake audio nodes. These are
// not native Web Audio, actual clip decoding, playback or listening evidence.
const bytes=(label:string)=>new TextEncoder().encode(label);
const hash=(label:string)=>createHash('sha256').update(bytes(label)).digest('hex');
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve}};
const buffer=(label:string)=>({duration:1,length:24000,numberOfChannels:1,label});
const flush=async()=>{for(let i=0;i<12;i++)await new Promise<void>(resolve=>setImmediate(resolve))};
const param=()=>({value:1,setValueAtTime(value:number){this.value=value},setTargetAtTime(value:number){this.value=value}});
const node=()=>({connect(){},disconnect(){}});

function course(){
 const entries:Record<string,any>={},held=new Map<string,ReturnType<typeof deferred<any>>>();
 const decoded:string[]=[],started:string[]=[];let decoding=0,maxDecoding=0;
 const add=(label:string,bus='effects',priority=0,loop=false)=>{
  const id=`${bus==='voice'?'vo':bus==='music'?'music':'sfx'}.${label}`;
  entries[id]={bus,priority,cooldown_ms:0,loop,...(loop&&bus==='music'?{bpm:120,beats_per_bar:4}:{}),variants:[{url:`/art/audio/${label}.wav`,caption:bus==='voice'?label:undefined,duration:1,bytes:bytes(label).length,sha256:hash(label)}]};
  return id;
 };
 for(let i=0;i<24;i++)add(`effect${i}`);
 add('warning','voice',100);add('new_warning','voice',100);add('routine','voice',10);
 for(let i=0;i<3;i++)add(`layer${i}`,'music',0,true);
 const context:any={state:'running',currentTime:0,close:async()=>{},suspend:async function(){this.state='suspended'},
  createGain:()=>({...node(),gain:param()}),
  createBufferSource:():any=>({...node(),buffer:null,loop:false,onended:null,start(){started.push(this.buffer.label)},stop(){}}),
  decodeAudioData:async(data:ArrayBuffer)=>{
   const label=new TextDecoder().decode(data);decoded.push(label);decoding++;maxDecoding=Math.max(maxDecoding,decoding);
   try{return held.has(label)?await held.get(label)!.promise:buffer(label)}finally{decoding--}
  }};
 const mixer=new AudioMixer({audioConsent:true,captions:true,audio:{master:1,voice:1,music:1,effects:1,ui:1}},async(input:any)=>{
  if(String(input).endsWith('index.json'))return new Response(JSON.stringify({format:1,sample_rate:24000,entries}));
  return new Response(bytes(String(input).split('/').at(-1)!.replace('.wav','')));
 });
 const internal=mixer as any;internal.context=context;internal.master=context.createGain();internal.buses=new Map(['voice','effects','music','ui'].map(bus=>[bus,context.createGain()]));
 const holdFour=async()=>{
  const work:Promise<any>[]=[];
  for(let i=0;i<4;i++){held.set(`effect${i}`,deferred());work.push(internal.buffer(entries[`sfx.effect${i}`].variants[0]));}
  const observed=work.map(item=>item.catch(error=>error));await flush();assert.equal(decoding,4);
  return observed;
 };
 const cleanup=async(work:Promise<any>[]=[] )=>{held.forEach((item,label)=>item.resolve(buffer(label)));await Promise.all(work);await flush();mixer.dispose()};
 return {mixer,internal,entries,decoded,started,held,holdFour,cleanup,maxDecoding:()=>maxDecoding};
}
function advanceClock(ms:number){const previous=Object.getOwnPropertyDescriptor(performance,'now'),now=performance.now();Object.defineProperty(performance,'now',{value:()=>now+ms,configurable:true});return()=>{if(previous)Object.defineProperty(performance,'now',previous);else delete(performance as any).now}}
async function deferredMusic(c:ReturnType<typeof course>){for(const entry of Object.values(c.entries))await c.internal.buffer(entry.variants[0]);for(let i=0;i<24;i++)c.mixer.play(`sfx.effect${i}`);await flush();c.mixer.music(['music.layer0','music.layer1','music.layer2']);await flush();assert.equal(c.mixer.statistics.sources,24);assert.equal(c.internal.musicSources.length,0)}

test('a critical voice waits for a busy decoder while its caption stays immediate',async()=>{
 const c=course();await c.mixer.loadIndex();const work=await c.holdFour();
 try{
  c.mixer.play('vo.warning');await flush();assert.equal(c.mixer.state.get().captions[0].text,'warning');assert.equal(c.mixer.statistics.sources,0);
  c.held.get('effect0')!.resolve(buffer('effect0'));await flush();
  assert(c.started.includes('warning'),'critical warning was discarded when the four decode slots were busy');
  assert.equal(c.maxDecoding(),4);
 }finally{await c.cleanup(work)}
});

test('queued critical speech is canceled at an operation reset',async()=>{
 const c=course();await c.mixer.loadIndex();const work=await c.holdFour();
 try{c.mixer.play('vo.warning');await flush();c.mixer.reset();c.held.get('effect0')!.resolve(buffer('effect0'));await flush();assert(!c.started.includes('warning'));assert(!c.decoded.includes('warning'));assert.equal(c.mixer.state.get().captions.length,0)}finally{await c.cleanup(work)}
});

for(const boundary of ['transient','blur','consent','dispose'] as const)test(`queued critical speech is canceled on ${boundary}`,async()=>{
 const c=course();await c.mixer.loadIndex();const work=await c.holdFour();
 try{
  c.mixer.play('vo.warning');await flush();
  if(boundary==='transient')c.mixer.stopTransient();
  else if(boundary==='blur')c.internal.blur();
  else if(boundary==='consent')c.mixer.update({audioConsent:false,captions:true,audio:{master:1,voice:1,music:1,effects:1,ui:1}});
  else c.mixer.dispose();
  c.held.get('effect0')!.resolve(buffer('effect0'));await flush();assert(!c.started.includes('warning'));assert(!c.decoded.includes('warning'));
 }finally{await c.cleanup(work)}
});

test('the latest critical voice owns the single waiting request',async()=>{
 const c=course();await c.mixer.loadIndex();const work=await c.holdFour();
 try{c.mixer.play('vo.warning');await flush();c.mixer.play('vo.new_warning');await flush();c.held.get('effect0')!.resolve(buffer('effect0'));await flush();assert(c.started.includes('new_warning'));assert(!c.started.includes('warning'));assert.equal(c.maxDecoding(),4)}finally{await c.cleanup(work)}
});

test('a new operation warning can wait until old-generation decoders finish',async()=>{
 const c=course();await c.mixer.loadIndex();const work=await c.holdFour();
 try{c.mixer.play('vo.warning');await flush();c.mixer.reset();c.mixer.play('vo.new_warning');await flush();c.held.get('effect0')!.resolve(buffer('effect0'));await flush();assert(c.started.includes('new_warning'));assert(!c.started.includes('warning'));assert.equal(c.maxDecoding(),4)}finally{await c.cleanup(work)}
});

test('an expired waiting critical warning cannot play late or keep routine speech blocked',async()=>{
 const c=course();await c.mixer.loadIndex();const work=await c.holdFour();let restore=()=>{};
 try{c.mixer.play('vo.warning');await flush();restore=advanceClock(4000);c.held.get('effect0')!.resolve(buffer('effect0'));await flush();assert(!c.started.includes('warning'));assert(!c.decoded.includes('warning'));c.mixer.play('vo.routine');await flush();assert(c.started.includes('routine'))}finally{restore();await c.cleanup(work)}
});

test('a critical decode completing after its original deadline cannot begin speech',async()=>{
 const c=course();await c.mixer.loadIndex();c.held.set('warning',deferred());let restore=()=>{};let work:Promise<any>[]=[];
 try{c.mixer.play('vo.warning');await flush();work=[...c.internal.pending.values()].map((item:any)=>item.catch((error:any)=>error));restore=advanceClock(4000);c.held.get('warning')!.resolve(buffer('warning'));await flush();assert(!c.started.includes('warning'));c.mixer.play('vo.routine');await flush();assert(c.started.includes('routine'))}finally{restore();await c.cleanup(work)}
});

test('stopping transient sources wakes music deferred by the shared source cap',async()=>{
 const c=course();await c.mixer.loadIndex();try{await deferredMusic(c);c.mixer.stopTransient();await flush();assert.equal(c.internal.musicSources.length,3);assert.equal(c.mixer.statistics.sources,3)}finally{await c.cleanup()}
});

test('a bus preference update wakes deferred music after source slots are freed',async()=>{
 const c=course();await c.mixer.loadIndex();try{await deferredMusic(c);for(let i=0;i<3;i++)c.internal.stop([...c.internal.sources].find((source:any)=>!source.music));c.mixer.update({audioConsent:true,captions:true,audio:{master:1,voice:1,music:.5,effects:1,ui:1}});await flush();assert.equal(c.internal.musicSources.length,3);assert.equal(c.mixer.statistics.sources,24)}finally{await c.cleanup()}
});

test('restoring consent alone cannot wake music while the context is suspended',async()=>{
 const c=course();await c.mixer.loadIndex();try{await deferredMusic(c);c.mixer.update({audioConsent:false,captions:true,audio:{master:1,voice:1,music:1,effects:1,ui:1}});await flush();c.mixer.update({audioConsent:true,captions:true,audio:{master:1,voice:1,music:1,effects:1,ui:1}});await flush();assert.equal(c.mixer.statistics.context,'suspended');assert.equal(c.mixer.statistics.sources,0)}finally{await c.cleanup()}
});

test('three music layers respect the shared source cap and retry after effects finish',async()=>{
 const c=course();await c.mixer.loadIndex();
 try{
  for(const entry of Object.values(c.entries))await c.internal.buffer(entry.variants[0]);
  for(let i=0;i<24;i++)c.mixer.play(`sfx.effect${i}`);await flush();assert.equal(c.mixer.statistics.sources,24);
  c.mixer.music(['music.layer0','music.layer1','music.layer2']);await flush();
  assert.equal(c.mixer.statistics.sources,24,'delayed music startup exceeded the shared 24-source cap');assert.equal(c.internal.musicSources.length,0);
  for(let i=0;i<3;i++){const source=[...c.internal.sources].find((value:any)=>!value.music) as any;source.node.onended();await flush();assert(c.mixer.statistics.sources<=24)}
  assert.equal(c.internal.musicSources.length,3);assert.equal(c.mixer.statistics.sources,24);
 }finally{await c.cleanup()}
});
