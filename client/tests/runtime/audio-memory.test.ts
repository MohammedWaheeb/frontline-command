import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AudioMixer} from '../../src/audio/mixer';

// Fake Web Audio buffers model the actual stereo PCM sizes without allocating
// those samples. Native decoding and audible output require the product smoke.
const preferences={audioConsent:true,captions:false,audio:{master:1,voice:1,music:1,effects:1,ui:1}};
const cap=128*1024**2;
const encode=(label:string)=>new TextEncoder().encode(label);
const parameter=()=>({value:1,setValueAtTime(value:number){this.value=value},setTargetAtTime(value:number){this.value=value}});
const node=()=>({connect(){},disconnect(){}});

function course(duration:number){
 const entries:Record<string,any>={},durations=new Map<string,number>(),started:Array<{label:string;when:number;offset:number}>=[],stopped:string[]=[];
 for(const [label,bus,seconds] of [...[0,1,2].map(i=>[`layer${i}`,'music',duration] as const),...[0,1,2].map(i=>[`effect${i}`,'effects',90] as const)]){
  const bytes=encode(label);durations.set(label,seconds);
  entries[`${bus==='music'?'music':'sfx'}.${label}`]={bus,loop:bus==='music',...(bus==='music'?{bpm:120,beats_per_bar:4}:{}),variants:[{url:`/art/audio/${label}.ogg`,duration:seconds,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
 }
 let closed=false;
 const context:any={state:'running',currentTime:10,close:async()=>{closed=true},
  createGain:()=>({...node(),gain:parameter()}),
  createDynamicsCompressor:()=>({...node(),threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter()}),
  createBufferSource:():any=>({...node(),buffer:null,loop:false,onended:null,
   start(when=0,offset=0){started.push({label:this.buffer.label,when,offset})},stop(){stopped.push(this.buffer.label)}}),
  decodeAudioData:async(bytes:ArrayBuffer)=>{const label=new TextDecoder().decode(bytes),seconds=durations.get(label)!;return {label,duration:seconds,numberOfChannels:2,length:Math.round(seconds*24000)}}};
 const mixer=new AudioMixer(preferences,async(input:any)=>String(input).endsWith('index.json')
  ?new Response(JSON.stringify({format:1,sample_rate:24000,entries}))
  :new Response(encode(String(input).split('/').at(-1)!.replace('.ogg',''))));
 const internal=mixer as any;internal.context=context;internal.master=context.createGain();
 internal.buses=new Map(['voice','music','effects','ui'].map(bus=>[bus,context.createGain()]));
 // Await both the decoder promises and ensureMusic's continuation/finally.
 const settle=async()=>{for(let turn=0;turn<100;turn++){await Promise.allSettled([...internal.pending.values()]);await new Promise<void>(done=>setImmediate(done));if(!internal.pending.size&&!internal.musicWork)return}throw Error('audio work did not settle')};
 return {mixer,internal,context,started,stopped,settle,closed:()=>closed};
}

for(const [faction,duration] of [['US',128],['IR',160],['SY',120],['SA',166.956]] as const){
 test(`the current ${faction} stereo battle trio starts together within the decoded cache budget`,async()=>{
  const c=course(duration);await c.mixer.loadIndex();
  try{
   c.mixer.music(['music.layer0','music.layer1','music.layer2'],[1,.4,.2]);await c.settle();
   assert.equal(c.mixer.statistics.sources,3,`all three ${duration}s stereo layers must start`);
   assert.equal(c.started.length,3);assert.deepEqual(c.started.map(source=>source.when),[10.05,10.05,10.05]);assert.deepEqual(c.started.map(source=>source.offset),[0,0,0]);
   assert.equal(c.mixer.statistics.decodedBytes,Math.round(duration*24000)*2*4*3);
   assert.ok(c.mixer.statistics.decodedBytes>64*1024**2,'fixture must exceed the old cap');assert.ok(c.mixer.statistics.decodedBytes<=cap);
   assert.equal(c.mixer.state.get().error,undefined);assert.equal(c.internal.pins.size,0,'completed group must release temporary pins');
  }finally{c.mixer.dispose()}
  assert.equal(c.mixer.ownershipSnapshot.decodedPCMBytes,0);assert.equal(c.mixer.ownershipSnapshot.sources,0);assert.equal(c.mixer.ownershipSnapshot.pending,0);assert.equal(c.closed(),true);
 });
}

test('long stereo music stays playing under cache pressure, evicts ended effects, and resets cleanly',async()=>{
 const c=course(166.956);await c.mixer.loadIndex();
 try{
  c.mixer.music(['music.layer0','music.layer1','music.layer2']);await c.settle();
  for(let i=0;i<3;i++){c.mixer.play(`sfx.effect${i}`);await c.settle();assert.ok(c.mixer.statistics.decodedBytes<=cap)}
  assert.equal(c.started.filter(source=>source.label.startsWith('layer')).length,3);
  assert.equal(c.started.filter(source=>source.label.startsWith('effect')).length,2,'a full active cache must reject additional PCM');
  assert.match(c.mixer.state.get().error??'',/memory budget/);
  assert.equal(c.mixer.statistics.sources,5);assert.deepEqual(c.stopped,[],'pressure must never stop playing sources');
  for(const source of [...c.internal.sources] as any[])if(!source.music)source.node.onended();
  c.mixer.play('sfx.effect2');await c.settle();
  assert.ok(c.started.some(source=>source.label==='effect2'),'ended effect buffers should be evictable');
  assert.equal(c.mixer.statistics.buffers,5);assert.ok(c.mixer.statistics.decodedBytes<=cap);
  assert.equal(c.internal.musicSources.length,3,'pressure must retain the complete music group');
  c.mixer.reset();assert.equal(c.mixer.statistics.sources,0);assert.equal(c.mixer.statistics.buffers,0);assert.equal(c.mixer.statistics.decodedBytes,0);assert.equal(c.mixer.statistics.pending,0);assert.equal(c.internal.pins.size,0);
 }finally{c.mixer.dispose()}
 assert.equal(c.closed(),true);
});
