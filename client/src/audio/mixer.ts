import {sha256Hex} from '../runtime/crypto';
import {Observable} from '../app/store';
import {AudioCooldowns,audioVariantKey,boundedAudioBytes,parseAudioIndex,type AudioBus,type AudioEntry,type AudioIndex,type AudioVariant} from './index';
export interface AudioPreferences {audioConsent:boolean;audio:Record<AudioBus|'master',number>;captions:boolean}
export interface Caption {id:number;text:string;priority:number;expires:number}
export interface AudioState {status:'disabled'|'gesture'|'ready'|'unavailable';captions:Caption[];error?:string}
export interface ContinuousSound {key:string;id:string;gain:number;pan?:number;repeatMs?:number}
/** Logical decoded-cache ownership and the current reachable Web Audio graph. */
export interface AudioOwnershipSnapshot {
 readonly schema:'fc-audio-ownership/1';readonly disposed:boolean;readonly context:AudioContext['state']|'absent';
 readonly generation:number;readonly sources:number;readonly continuous:number;readonly buffers:number;readonly decodedPCMBytes:number;
 readonly pending:number;readonly inFlight:number;readonly limiterPresent:boolean;readonly ceilingPresent:boolean;
 readonly gains:Readonly<Record<AudioBus|'master',number|null>>;
}
interface Source {key?:string;panner?:StereoPannerNode;node:AudioBufferSourceNode;gain:GainNode;bus:AudioBus;priority:number;music:boolean}
const BUSES:AudioBus[]=['voice','music','effects','ui'];
const MEMORY=64*1024**2,VOICES=24;
/** Mix lane: music beds duck to 35% and continuous beds to 40% under priority>=50 voice. */
const MUSIC_DUCK=.35,BED_DUCK=.4;
/** Pass quiet samples unchanged, then soften peaks before the device clips them.
 * WaveShaper clamps inputs outside [-1,1] to the curve endpoints. Keeping
 * oversampling off retains that sample bound; the compressor handles the mix's
 * sustained level and this final curve catches its transient overshoot.
 */
function outputCeilingCurve(){
 const curve=new Float32Array(4097);
 for(let i=0;i<curve.length;i++){
  const x=i*2/(curve.length-1)-1,a=Math.abs(x);
  curve[i]=a<=.8?x:Math.sign(x)*(.8+.2*Math.tanh((a-.8)/.2));
 }
 return curve;
}
/** No AudioContext exists until saved consent and a trusted browser input coincide. */
export class AudioMixer {
 readonly state=new Observable<AudioState>({status:'disabled',captions:[]});
 readonly cooldowns=new AudioCooldowns();
 private continuousRequests=new Map<string,ContinuousSound>();private continuousSources=new Map<string,Source>();private continuousPending=new Map<string,number>();private continuousNext=new Map<string,number>();private continuousEpoch=0;
 private indexDigest?:string;private urgentPlayback?:()=>void;
 private preferences:AudioPreferences;private context?:AudioContext;private master?:GainNode;private limiter?:DynamicsCompressorNode;private ceiling?:WaveShaperNode;private buses=new Map<AudioBus,GainNode>();private index?:AudioIndex;private indexWork?:Promise<void>;private life=new AbortController();private loads=new AbortController();private generation=0;private closed=false;private focused=true;private captionID=0;private expiry?:ReturnType<typeof setTimeout>;private sources=new Set<Source>();private buffers=new Map<string,{buffer:AudioBuffer;bytes:number;used:number}>();private pending=new Map<string,Promise<AudioBuffer>>();private variants=new Map<string,number>();private pins=new Map<AudioBuffer,number>();private outputEpoch=0;private scheduled=new Set<ReturnType<typeof setTimeout>>();private voiceEpoch=0;private voicePriority=-1;private voiceDeadline=0;private duckActive=false;private duckUntil=0;private releaseUntil=0;private duckTimer?:ReturnType<typeof setTimeout>;private musicNames:string[]=[];private musicLevels:number[]=[];private musicSources:Source[]=[];private musicWork=false;private musicEpoch=0;private inFlight=0;
 constructor(preferences:AudioPreferences,private fetcher:typeof fetch=(...args)=>globalThis.fetch(...args)){this.preferences=preferences;this.state.update(state=>({...state,status:preferences.audioConsent?'gesture':'disabled'}))}
 get manifest(){return this.index}
 get statistics(){return {context:this.context?.state??'absent',sources:this.sources.size,continuous:this.continuousSources.size,buffers:this.buffers.size,decodedBytes:[...this.buffers.values()].reduce((sum,value)=>sum+value.bytes,0),pending:this.pending.size,generation:this.generation,gains:Object.fromEntries([['master',this.master?.gain.value??0],...BUSES.map(bus=>[bus,this.buses.get(bus)?.gain.value??0])])}}
 /** A fresh fixed-field copy; reading does not create, resume or change audio. */
 get ownershipSnapshot():AudioOwnershipSnapshot {
  let decodedPCMBytes=0;for(const value of this.buffers.values())decodedPCMBytes+=value.bytes;
  const gains=Object.freeze({master:this.master?.gain.value??null,voice:this.buses.get('voice')?.gain.value??null,
   music:this.buses.get('music')?.gain.value??null,effects:this.buses.get('effects')?.gain.value??null,ui:this.buses.get('ui')?.gain.value??null});
  return Object.freeze({schema:'fc-audio-ownership/1',disposed:this.closed,context:this.context?.state??'absent',generation:this.generation,
   sources:this.sources.size,continuous:this.continuousSources.size,buffers:this.buffers.size,decodedPCMBytes,
   pending:this.pending.size,inFlight:this.inFlight,limiterPresent:!!this.limiter,ceilingPresent:!!this.ceiling,gains});
 }
 attach(target:Window=window){const signal=this.life.signal;target.addEventListener('pointerdown',this.gesture,{capture:true,signal});target.addEventListener('keydown',this.gesture,{capture:true,signal});target.addEventListener('click',this.click,{signal});target.addEventListener('blur',this.blur,{signal});target.addEventListener('focus',this.focus,{signal});document.addEventListener('visibilitychange',this.visibility,{signal})}
 async loadIndex(retry=false){if(this.closed||this.index&&!retry)return;if(this.indexWork)return this.indexWork;this.indexWork=(async()=>{try{const response=await this.fetcher('/art/audio/index.json',{signal:this.life.signal,credentials:'omit',redirect:'error',cache:'no-cache'});const bytes=await boundedAudioBytes(response,4*1024**2);const index=parseAudioIndex(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))),digest=await sha256Hex(bytes);if(!this.closed){if(this.index&&this.indexDigest!==digest)this.reset();this.index=index;this.indexDigest=digest;this.state.update(state=>({...state,error:undefined,status:this.preferences.audioConsent?(this.focused&&this.context?.state==='running'?'ready':'gesture'):'disabled'}));void this.ensureMusic();this.ensureContinuous()}}catch(error){if(!this.closed)this.state.update(state=>({...state,status:'unavailable',error:error instanceof Error?error.message:'Audio unavailable.'}))}finally{this.indexWork=undefined}})();return this.indexWork}
 update(preferences:AudioPreferences){const withdrawn=this.preferences.audioConsent&&!preferences.audioConsent;this.preferences=preferences;if(withdrawn){this.reset({preserveCaptions:preferences.captions});void this.context?.suspend()}this.applyGains();if(!preferences.captions)this.clearCaptions();this.state.update(state=>({...state,status:!preferences.audioConsent?'disabled':this.focused&&this.context?.state==='running'?'ready':this.index||!state.error?'gesture':'unavailable'}));this.ensureContinuous();void this.ensureMusic()}
 private applyGains(){if(!this.context)return;this.master!.gain.setValueAtTime(this.preferences.audioConsent?this.preferences.audio.master:0,this.context.currentTime);for(const bus of BUSES)this.buses.get(bus)!.gain.setValueAtTime(bus==='music'&&this.duckActive?this.preferences.audio[bus]*MUSIC_DUCK:this.preferences.audio[bus],this.context.currentTime)}
 private gesture=(event:Event)=>{if(!event.isTrusted||!this.preferences.audioConsent||this.closed||document.visibilityState==='hidden')return;this.focused=true;if(!this.context){this.context=new AudioContext({sampleRate:24000});this.master=this.context.createGain();this.master.connect(this.context.destination);this.ceiling=this.context.createWaveShaper();this.ceiling.curve=outputCeilingCurve();this.ceiling.oversample='none';this.ceiling.connect(this.master);for(const bus of BUSES)this.buses.set(bus,this.context.createGain());this.resetLimiter();this.applyGains()}void this.context.resume().then(()=>{if(!this.closed){this.state.update(state=>({...state,status:!this.preferences.audioConsent?'disabled':this.focused&&this.context?.state==='running'?'ready':'gesture'}));void this.ensureMusic();this.ensureContinuous()}}).catch(()=>{if(!this.closed)this.state.update(state=>({...state,status:!this.preferences.audioConsent?'disabled':this.focused&&this.context?.state==='running'?'ready':'gesture'}))})};
 /** Drop compressor lookahead at session/seek/focus boundaries while retaining
  * existing bus gains and continuing music sources. A stopped source alone
  * cannot clear the audio already buffered by the old compressor. */
 private resetLimiter(){
  if(this.closed||!this.context||!this.ceiling)return;
  this.limiter?.disconnect();
  const limiter=this.context.createDynamicsCompressor();
  limiter.threshold.value=-3;limiter.knee.value=3;limiter.ratio.value=20;limiter.attack.value=0;limiter.release.value=.1;
  limiter.connect(this.ceiling);
  for(const bus of this.buses.values()){bus.disconnect();bus.connect(limiter)}
  this.limiter=limiter;
 }
 private click=(event:Event)=>{if(event.isTrusted&&(event.target as Element|null)?.closest?.('button')&&!((event.target as Element).closest('button') as HTMLButtonElement).disabled)this.play('sfx.ui_click')};
 private blur=()=>{this.focused=false;this.stopTransient();void this.context?.suspend();this.state.update(state=>state.status==='ready'?{...state,status:this.preferences.audioConsent?'gesture':'disabled'}:state)};
 private focus=()=>{this.focused=true;/* Output resumes only on the next trusted gesture. */};
 private visibility=()=>{if(document.visibilityState==='hidden')this.blur();else this.focus()};
 caption(text:string,priority=50,duration=5000){if(!this.preferences.captions||!text)return;const now=performance.now(),caption={id:++this.captionID,text:text.slice(0,12000),priority,expires:now+Math.min(12000,Math.max(2500,duration))};this.state.update(state=>({...state,captions:[...state.captions.filter(c=>c.expires>now),caption].sort((a,b)=>b.priority-a.priority||b.id-a.id).slice(0,3)}));if(this.expiry)clearTimeout(this.expiry);this.expireCaptions()}
 private expireCaptions(){this.expiry=setTimeout(()=>{const now=performance.now();this.state.update(state=>({...state,captions:state.captions.filter(c=>c.expires>now)}));if(this.state.get().captions.length)this.expireCaptions()},500)}
 play(id:string,options:{key?:string;cooldown?:number;caption?:string;priority?:number;gain?:number;pan?:number}={}){
  if(this.closed)return;const entry=this.index?.entries[id],now=performance.now(),priority=options.priority??entry?.priority??0;
  if(!this.cooldowns.admit(options.key??id,now,options.cooldown??entry?.cooldown_ms??0))return;
  const cursor=this.variants.get(id)??0,variant=entry?.variants[cursor%(entry?.variants.length??1)];this.variants.set(id,cursor+1);
  const text=variant?.display_caption??variant?.caption??options.caption;if(text)this.caption(text,priority,(variant?.duration??3)*1000+1500);
  if(!entry||!variant||!this.preferences.audioConsent||!this.focused||this.context?.state!=='running')return;
  if(this.preferences.audio.master===0||this.preferences.audio[entry.bus]===0)return;
  let voice=0;if(entry.bus==='voice'){if(this.voiceDeadline>now&&this.voicePriority>priority)return;if(this.voiceDeadline>now&&this.voicePriority===priority&&priority>=50&&priority<100)return;this.urgentPlayback=undefined;this.voicePriority=priority;this.voiceDeadline=now+variant.duration*1000+2000;voice=++this.voiceEpoch;for(const source of this.sources)if(source.bus==='voice')this.stop(source)}
  const generation=this.generation,output=this.outputEpoch,deadline=voice&&priority>=100?this.voiceDeadline:Infinity;
  const valid=()=>generation===this.generation&&output===this.outputEpoch&&!this.closed&&this.focused&&this.context?.state==='running'&&this.preferences.audioConsent&&(!voice||voice===this.voiceEpoch)&&performance.now()<=deadline;
  const pan=options.pan===undefined?undefined:Math.max(-1,Math.min(1,options.pan));
  const gain=options.gain===undefined?1:Math.max(0,Math.min(1,options.gain));
  const attempt=()=>{
   if(!valid())return;
   void this.buffer(variant).then(buffer=>{if(!valid())return;if(this.sources.size>=VOICES){const victim=[...this.sources].filter(source=>!source.music&&!source.key&&source.priority<=priority).sort((a,b)=>a.priority-b.priority)[0];if(!victim)return;this.stop(victim)}const source=this.source(buffer,entry,priority,false,pan);source.gain.gain.value=gain;source.node.start();if(voice)this.voiceDeadline=performance.now()+buffer.duration*1000;if(entry.bus==='voice'&&priority>=50)this.duckFor(variant.duration*1000+1200)}).catch(error=>{
    // Retain only the latest critical speech while all four decoders are busy.
    // A released slot retries it before the original speech-duration + 2s deadline;
    // no extra decoder, timer or stale caption is made.
    if(voice&&priority>=100&&(error as Error).name==='QuotaExceededError'&&valid()){this.urgentPlayback=attempt;if(this.inFlight<4)this.retryUrgent();return}
    if(voice&&voice===this.voiceEpoch){this.voiceDeadline=0;this.voicePriority=-1}this.failure(error,generation);
   });
  };
  attempt();
 }
 private retryUrgent(){const attempt=this.urgentPlayback;this.urgentPlayback=undefined;attempt?.()}
 private failure(error:unknown,generation:number){if(generation!==this.generation||this.closed||['AbortError','QuotaExceededError'].includes((error as Error).name))return;this.state.update(state=>({...state,error:error instanceof Error?error.message:'An audio file could not be loaded.'}))}
 private source(buffer:AudioBuffer,entry:AudioEntry,priority:number,music=false,pan?:number):Source{const context=this.context!,node=context.createBufferSource(),gain=context.createGain();node.buffer=buffer;node.loop=entry.loop;node.connect(gain);const panner=pan===undefined?undefined:context.createStereoPanner();if(panner){panner.pan.value=Math.max(-1,Math.min(1,pan??0));gain.connect(panner);panner.connect(this.buses.get(entry.bus)!)}else gain.connect(this.buses.get(entry.bus)!);const source:Source={node,gain,panner,bus:entry.bus,priority,music};this.sources.add(source);node.onended=()=>{this.sources.delete(source);if(source.key&&this.continuousSources.get(source.key)===source)this.continuousSources.delete(source.key);node.disconnect();gain.disconnect();panner?.disconnect();void this.ensureMusic()};return source}
 private stop(source:Source){source.node.onended=null;try{source.node.stop()}catch{/* already ended */}source.node.disconnect();source.gain.disconnect();source.panner?.disconnect();if(source.key)this.continuousSources.delete(source.key);this.sources.delete(source)}
 private async buffer(variant:AudioVariant):Promise<AudioBuffer>{const key=audioVariantKey(variant),cached=this.buffers.get(key);if(cached){cached.used=performance.now();return cached.buffer}const existing=this.pending.get(key);if(existing)return existing;if(this.inFlight>=4)throw new DOMException('Audio decoder is busy.','QuotaExceededError');const generation=this.generation,context=this.context!,signal=this.loads.signal;this.inFlight++;const work=(async()=>{const decode=async(url:string,size:number,hash:string)=>{const response=await this.fetcher(url,{signal,credentials:'omit',redirect:'error',cache:'force-cache'}),bytes=await boundedAudioBytes(response,size);if(bytes.length!==size||await sha256Hex(bytes)!==hash)throw Error('Audio integrity check failed.');if(generation!==this.generation)throw new DOMException('Operation changed','AbortError');return context.decodeAudioData(bytes.slice().buffer)};let buffer:AudioBuffer;try{buffer=await decode(variant.url,variant.bytes,variant.sha256)}catch(error){if((error as Error).name!=='EncodingError'||!variant.mp3_url)throw error;buffer=await decode(variant.mp3_url,variant.mp3_bytes!,variant.mp3_sha256!)}if(generation!==this.generation)throw new DOMException('Operation changed','AbortError');if(!Number.isFinite(buffer.duration)||Math.abs(buffer.duration-variant.duration)>Math.max(.15,variant.duration*.02)||buffer.numberOfChannels>2)throw Error('Audio duration/channel validation failed.');const size=buffer.length*buffer.numberOfChannels*4;if(size>MEMORY)throw Error('Audio clip exceeds memory budget.');for(const [key,value]of [...this.buffers].sort((a,b)=>a[1].used-b[1].used)){if(this.statistics.decodedBytes+size<=MEMORY)break;if(!this.pins.has(value.buffer)&&![...this.sources].some(source=>source.node.buffer===value.buffer))this.buffers.delete(key)}if(this.statistics.decodedBytes+size>MEMORY)throw Error('Audio memory budget reached.');this.buffers.set(key,{buffer,bytes:size,used:performance.now()});return buffer})().finally(()=>{this.inFlight--;if(this.pending.get(key)===work)this.pending.delete(key);this.retryUrgent()});this.pending.set(key,work);return work}
 /** One quiet bed and up to three on-screen actors. Removal stops even a pending clip. */
 continuous(requests:readonly ContinuousSound[]){
  const next=new Map<string,ContinuousSound>();for(const request of requests.slice(0,4)){if(!request.key||request.key.length>64||!Number.isFinite(request.gain)||request.gain<=0)continue;next.set(request.key,{...request,gain:Math.min(.3,request.gain),pan:Math.max(-1,Math.min(1,request.pan??0)),repeatMs:Math.max(0,Math.min(60000,request.repeatMs??0))})}
  const releasing=performance.now()<this.releaseUntil;
  for(const [key,source]of this.continuousSources){const request=next.get(key),previous=this.continuousRequests.get(key);if(!request||request.id!==previous?.id)this.stop(source);else if(!releasing){source.gain.gain.setTargetAtTime(request.gain*(this.duckActive?BED_DUCK:1),this.context!.currentTime,.08);source.panner?.pan.setTargetAtTime(request.pan??0,this.context!.currentTime,.08)}}
  for(const [key,previous]of this.continuousRequests)if(next.get(key)?.id!==previous.id){this.continuousPending.delete(key);this.continuousNext.delete(key)}
  this.continuousRequests=next;this.ensureContinuous();void this.ensureMusic();
 }
 private ensureContinuous(){
  if(this.closed||!this.index||!this.preferences.audioConsent||!this.focused||this.context?.state!=='running'||this.preferences.audio.master===0||this.preferences.audio.effects===0)return;
  for(const [key,request]of this.continuousRequests){if(this.continuousSources.has(key)||this.continuousPending.has(key)||(this.continuousNext.get(key)??0)>performance.now()||this.sources.size>=VOICES)continue;const entry=this.index.entries[request.id];if(!entry||entry.bus!=='effects')continue;const epoch=++this.continuousEpoch,generation=this.generation,output=this.outputEpoch;this.continuousPending.set(key,epoch);
   void this.buffer(entry.variants[0]).then(buffer=>{const latest=this.continuousRequests.get(key);if(this.closed||generation!==this.generation||output!==this.outputEpoch||this.continuousPending.get(key)!==epoch||latest?.id!==request.id||!this.focused||this.context?.state!=='running'||!this.preferences.audioConsent||this.sources.size>=VOICES)return;const source=this.source(buffer,entry,0,false,latest.pan);source.key=key;source.gain.gain.value=latest.gain*(this.duckActive?BED_DUCK:1);this.continuousSources.set(key,source);this.continuousNext.set(key,performance.now()+Math.max(buffer.duration*1000,latest.repeatMs??0));source.node.start()}).catch(error=>this.failure(error,generation)).finally(()=>{if(this.continuousPending.get(key)===epoch)this.continuousPending.delete(key)});
  }
 }
 /** Layers start together at a single bar origin; intensity changes only their gains. */
 music(ids:string[],levels:number[]=ids.map((_,i)=>i?0:1)){const changed=ids.join('|')!==this.musicNames.join('|');this.musicNames=[...ids];this.musicLevels=[...levels];if(changed){this.musicEpoch++;for(const source of this.musicSources)this.stop(source);this.musicSources=[];this.musicWork=false}if(this.musicSources.length)this.mixMusic();else void this.ensureMusic();this.ensureContinuous()}
 private async ensureMusic(){if(this.musicWork||this.musicSources.length||!this.musicNames.length||!this.index||!this.preferences.audioConsent||!this.focused||this.context?.state!=='running')return;const ids=[...this.musicNames],entries=ids.map(id=>this.index!.entries[id]);if(entries.some(entry=>!entry||entry.bus!=='music'||!entry.loop))return;const first=entries[0];if(entries.length>3||entries.some(entry=>entry.bpm!==first.bpm||entry.beats_per_bar!==first.beats_per_bar||Math.abs(entry.variants[0].duration-first.variants[0].duration)>.05)){this.state.update(state=>({...state,error:'Music layers do not share a valid loop.'}));return}const generation=this.generation,epoch=this.musicEpoch;this.musicWork=true;const buffers:AudioBuffer[]=[];try{for(const entry of entries){const buffer=await this.buffer(entry.variants[0]);buffers.push(buffer);this.pins.set(buffer,(this.pins.get(buffer)??0)+1)}if(generation!==this.generation||epoch!==this.musicEpoch||ids.join('|')!==this.musicNames.join('|')||this.closed||!this.preferences.audioConsent||!this.focused||this.context?.state!=='running'||this.sources.size+entries.length>VOICES)return;const when=this.context!.currentTime+.05;this.musicSources=entries.map((entry,i)=>{const source=this.source(buffers[i],entry,0,true);source.gain.gain.value=this.musicLevels[i]??0;source.node.start(when);return source})}catch(error){this.failure(error,generation)}finally{for(const buffer of buffers){const count=(this.pins.get(buffer)??1)-1;if(count>0)this.pins.set(buffer,count);else this.pins.delete(buffer)}if(generation===this.generation&&epoch===this.musicEpoch)this.musicWork=false}}
 private mixMusic(){if(!this.context)return;this.musicSources.forEach((source,i)=>source.gain.gain.setTargetAtTime(Math.max(0,Math.min(1,this.musicLevels[i]??0)),this.context!.currentTime,.6))}
 /** Duck music and continuous beds under priority>=50 voice; overlapping lines extend the hold. */
 private duckFor(ms:number){
  if(this.closed||!this.context||this.context.state!=='running')return;
  this.releaseUntil=0;this.duckActive=true;this.duckUntil=Math.max(this.duckUntil,performance.now()+Math.max(400,ms));
  this.applyDuck(true);
  if(this.duckTimer){clearTimeout(this.duckTimer);this.scheduled.delete(this.duckTimer)}
  const timer=setTimeout(()=>{this.scheduled.delete(timer);if(this.duckTimer!==timer)return;this.duckTimer=undefined;if(performance.now()>=this.duckUntil-50)this.setDuck(false)},Math.max(0,this.duckUntil-performance.now()));
  this.duckTimer=timer;this.scheduled.add(timer);
 }
 private applyDuck(on:boolean){
  if(!this.context||this.closed)return;
  const when=this.context.currentTime,tau=on?.15:.6;
  this.buses.get('music')?.gain.setTargetAtTime((this.preferences.audioConsent?this.preferences.audio.music:0)*(on?MUSIC_DUCK:1),when,tau);
  for(const [key,source]of this.continuousSources){const request=this.continuousRequests.get(key);if(request)source.gain.gain.setTargetAtTime(request.gain*(on?BED_DUCK:1),when,tau)}
 }
 private setDuck(on:boolean){this.duckActive=on;if(!on){this.duckUntil=0;this.releaseUntil=performance.now()+1200}this.applyDuck(on)}
 private clearDuck(){if(this.duckTimer){clearTimeout(this.duckTimer);this.scheduled.delete(this.duckTimer);this.duckTimer=undefined}this.duckActive=false;this.duckUntil=0;this.releaseUntil=0;if(this.context&&!this.closed)this.buses.get('music')?.gain.setTargetAtTime(this.preferences.audioConsent?this.preferences.audio.music:0,this.context.currentTime,.05)}
 afterSpeech(id:string){const generation=this.generation,timer=setTimeout(()=>{this.scheduled.delete(timer);if(generation===this.generation&&!this.closed)this.play(id)},Math.max(100,this.voiceDeadline-performance.now()+100));this.scheduled.add(timer)}
 clearCaptions(){if(this.expiry)clearTimeout(this.expiry);this.state.update(state=>({...state,captions:[]}))}
 stopTransient(){this.urgentPlayback=undefined;this.continuousNext.clear();this.outputEpoch++;this.voiceEpoch++;this.voiceDeadline=0;this.clearDuck();for(const source of this.sources)if(!source.music)this.stop(source);this.resetLimiter();void this.ensureMusic()}
 /** Session/seek/reconnect boundary: abort late loads and prevent stale warnings. */
 reset({preserveCaptions=false}:{preserveCaptions?:boolean}={}){this.urgentPlayback=undefined;this.continuousRequests.clear();this.continuousPending.clear();this.continuousNext.clear();this.outputEpoch++;for(const timer of this.scheduled)clearTimeout(timer);this.scheduled.clear();this.duckTimer=undefined;this.duckActive=false;this.duckUntil=0;this.releaseUntil=0;if(this.context&&!this.closed)this.buses.get('music')?.gain.setTargetAtTime(this.preferences.audioConsent?this.preferences.audio.music:0,this.context.currentTime,.05);this.generation++;this.musicEpoch++;this.loads.abort();this.loads=new AbortController();for(const source of this.sources)this.stop(source);this.musicSources=[];this.musicWork=false;this.pending.clear();this.buffers.clear();this.pins.clear();this.cooldowns.clear();this.variants.clear();this.voiceEpoch++;this.voiceDeadline=0;this.voicePriority=-1;if(!preserveCaptions){this.state.update(state=>({...state,captions:[]}));if(this.expiry)clearTimeout(this.expiry);}this.resetLimiter()}
 dispose(){if(this.closed)return;this.closed=true;this.life.abort();this.reset();this.musicNames=[];for(const bus of this.buses.values())bus.disconnect();this.buses.clear();this.limiter?.disconnect();this.ceiling?.disconnect();this.master?.disconnect();const context=this.context;this.limiter=undefined;this.ceiling=undefined;this.master=undefined;this.context=undefined;void context?.close()}
}
