import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {AudioMixer} from '../baseline/client/src/audio/mixer';
const bytes=(label:string)=>new TextEncoder().encode(label),sha=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const variant=(label:string)=>({url:'/art/audio/test.wav',bytes:bytes(label).length,sha256:sha(bytes(label)),duration:1,caption:label});
const index=(label:string)=>({format:1,sample_rate:24000,entries:{'vo.test':{bus:'voice',priority:1,cooldown_ms:0,loop:false,variants:[variant(label)]}}});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(value=>resolve=value);return {promise,resolve}};
const result:any={scope:'Private unit reproduction against exact frozen-v3 AudioMixer. Controlled decoder returns tagged objects, no actual audio playback/browser or production mutation.'};
for(const pending of [false,true]){
 let label='A',reads=0,decodes=0;const entered=deferred<void>(),held=deferred<any>();
 const mixer=new AudioMixer({audioConsent:false,captions:false,audio:{master:1,voice:1,music:1,effects:1,ui:1}},async input=>String(input).endsWith('index.json')?new Response(JSON.stringify(index(label))):(reads++,new Response(bytes(label))));
 const bufferA={duration:1,numberOfChannels:1,length:24000,label:'A'};
 (mixer as any).context={state:'suspended',close:async()=>{},decodeAudioData:async()=>{decodes++;entered.resolve();return pending?held.promise:bufferA}};
 await mixer.loadIndex();const first=(mixer as any).buffer(mixer.manifest!.entries['vo.test'].variants[0]);await entered.promise;
 if(!pending)await first;
 label='B';await mixer.loadIndex(true);const second=(mixer as any).buffer(mixer.manifest!.entries['vo.test'].variants[0]);
 if(pending)held.resolve(bufferA);
 assert.equal((await first).label,'A');assert.equal((await second).label,'A');assert.equal(mixer.manifest!.entries['vo.test'].variants[0].caption,'B');assert.equal(reads,1);assert.equal(decodes,1);
 result[pending?'pendingOldDecode':'cachedOldBuffer']={selectedCaption:'B',returnedBuffer:'A',clipReads:reads,decodes,generation:mixer.statistics.generation};mixer.dispose();
}
await writeFile('work/audio-generation-retry-v1/evidence/baseline-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
