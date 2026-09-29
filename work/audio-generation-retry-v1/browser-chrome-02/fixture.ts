import {AudioMixer} from '../source/client/src/audio/mixer';
import {consumedBodyTrace} from '../../../client/tests/render/native-consumed-body-trace.mjs';
// The existing JavaScript observer infers its default paths=[] as never[] in TS.
const observer=consumedBodyTrace as unknown as (fetcher:typeof fetch,options:{scope:string;baseURL:string;paths:string[];limit:number;maxBody:number;maxCopied:number})=>{fetch:typeof fetch;finish():Promise<number>;snapshot():unknown};
const trace=observer(globalThis.fetch.bind(globalThis),{scope:'audio-retry-v1',baseURL:location.href,paths:['/art/audio/index.json','/art/audio/review/clip.ogg','/art/audio/review/clip.mp3'],limit:80,maxBody:2<<20,maxCopied:8<<20});
let preferences={audioConsent:false,audio:{master:1,music:0,effects:1,voice:1,ui:0},captions:true};
const mixer=new AudioMixer(preferences,trace.fetch);mixer.attach();
const access=mixer as any,ids=new WeakMap<AudioBuffer,number>();let serial=0,pending:Record<string,unknown>={},context:AudioContext|undefined;
const descriptor=()=>mixer.manifest!.entries['vo.review'].variants[0];
async function summarize(buffer:AudioBuffer){
 let id=ids.get(buffer);if(!id){id=++serial;ids.set(buffer,id)}
 const samples=new Uint8Array(buffer.length*buffer.numberOfChannels*4);for(let channel=0;channel<buffer.numberOfChannels;channel++)samples.set(new Uint8Array(buffer.getChannelData(channel).slice().buffer),channel*buffer.length*4);
 const digest=await crypto.subtle.digest('SHA-256',samples);
 return {id,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,length:buffer.length,pcmSHA256:[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('')};
}
const focusEvents:{type:string;trusted:boolean;visibility:DocumentVisibilityState;focused:boolean;at:number}[]=[];
for(const name of ['focus','blur'])window.addEventListener(name,event=>focusEvents.push({type:event.type,trusted:event.isTrusted,visibility:document.visibilityState,focused:document.hasFocus(),at:performance.now()}));
document.addEventListener('visibilitychange',event=>focusEvents.push({type:event.type,trusted:event.isTrusted,visibility:document.visibilityState,focused:document.hasFocus(),at:performance.now()}));
const api={
 async ready(){await mixer.loadIndex();return this.state()},
 consent(value:boolean){preferences={...preferences,audioConsent:value};mixer.update(preferences)},
 state(){return {audio:mixer.state.get(),statistics:mixer.statistics,descriptor:descriptor(),closedContext:context?.state,pending,focus:{visibility:document.visibilityState,focused:document.hasFocus(),events:focusEvents}}},
 syntheticGesture(){window.dispatchEvent(new PointerEvent('pointerdown'))},
 async load(){return summarize(await access.buffer(descriptor()))},
 queue(name:string){pending={name,status:'pending'};void access.buffer(descriptor()).then(async(buffer:AudioBuffer)=>{pending={name,status:'resolved',buffer:await summarize(buffer)}},(error:Error)=>{pending={name,status:'rejected',error:{name:error.name,message:error.message}}})},
 async reload(){await mixer.loadIndex(true);return this.state()},
 reset(){mixer.reset();pending={};return this.state()},
 play(){mixer.play('vo.review',{key:'browser-review-'+serial++,cooldown:0})},
 async dispose(){context=access.context;const work=access.pending.size;mixer.dispose();await trace.finish();return {pendingAtDispose:work,...this.state()}},
 async trace(){await trace.finish();return trace.snapshot()},
};
(globalThis as any).audioReview=api;
document.querySelector('#consent')!.addEventListener('click',()=>api.consent(true));
document.querySelector('#withdraw')!.addEventListener('click',()=>api.consent(false));
document.querySelector('#play')!.addEventListener('click',()=>api.play());
void api.ready().then(()=>document.body.dataset.ready='true');
