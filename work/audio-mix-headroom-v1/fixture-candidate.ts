import {AudioMixer,type AudioPreferences} from './candidate/src/audio/mixer';
import {AudioMixer as BeforeMixer} from './candidate-softpeak-v2/src/audio/mixer';
import {DEFAULT_SETTINGS} from '../../client/src/app/settings';
import type {AudioVariant} from '../../client/src/audio/index';

// Test-only access to the real mixer's graph and decoder; no replacement node,
// mock decoder, gain override, source or asset edit is used for measurement.
interface Graph {context:AudioContext;master:GainNode;ceiling:WaveShaperNode;limiter:DynamicsCompressorNode;buses:Map<string,GainNode>;source(buffer:AudioBuffer,entry:NonNullable<AudioMixer['manifest']>['entries'][string],priority:number):{node:AudioBufferSourceNode};buffer(variant:AudioVariant):Promise<AudioBuffer>}
const mixer=new AudioMixer({...DEFAULT_SETTINGS,audioConsent:true});
const graph=mixer as unknown as Graph;
const music=['calm','tension','combat'].map(layer=>'music.battle_US_'+layer);
const effects=['AA','AA_POST','APC','ART','AT','AUTO','ELI','FIGHT','GUN','IR_ART','IR_FIGHT','IR_LOITER','IR_MISSILE','IR_STRIKE','MISSILE','REC'].map(id=>'sfx.weapon.'+id);
const ambient=['sfx.ambient_desert_wind','sfx.engine_tracked_heavy','sfx.engine_hauler','sfx.engine_rig'];
const warning='vo.announcer.US.missile_warning';
let meter:AudioWorkletNode|undefined,sequence=0;
const pending=new Map<number,(value:unknown)=>void>();
const message=(kind:string)=>new Promise<Record<string,number>>(resolve=>{const id=++sequence;pending.set(id,value=>resolve(value as Record<string,number>));meter!.port.postMessage({id,kind})});
const wait=async(predicate:()=>boolean)=>{const deadline=performance.now()+10000;while(!predicate()){if(performance.now()>deadline)throw Error('Audio graph state deadline');await new Promise(resolve=>setTimeout(resolve,10))}};
mixer.attach();
const api={
 async ready(){await mixer.loadIndex();return mixer.statistics},
 state(){return {statistics:mixer.statistics,state:mixer.state.get(),context:graph.context?.state}},
 async instrument(){
  if(graph.context.state!=='running')throw Error('Requires real trusted consent gesture');
  await graph.context.audioWorklet.addModule('/meter.js');
  meter=new AudioWorkletNode(graph.context,'headroom-meter',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
  meter.port.onmessage=event=>{const resolve=pending.get(event.data.id);pending.delete(event.data.id);resolve?.(event.data.value)};
  // Test-only destination muting: retain the complete upstream game graph,
  // route its output through the silent meter, and never sound a stress case.
  graph.master.disconnect(graph.context.destination);
  graph.master.connect(meter);meter.connect(graph.context.destination);
  return {sampleRate:graph.context.sampleRate,state:graph.context.state};
 },
 async boundaryProbe(){
  const context=new OfflineAudioContext(1,8192,24000),buffer=context.createBuffer(1,8192,24000),samples=buffer.getChannelData(0);
  for(let i=0;i<4096;i++)samples[i]=(i*2/4095-1)*24;
  for(let i=4096;i<8192;i++)samples[i]=(i-4096)*1.5/4095-.75;
  const expected=samples.slice();
  const source=context.createBufferSource(),shaper=context.createWaveShaper();source.buffer=buffer;shaper.curve=graph.ceiling.curve;shaper.oversample=graph.ceiling.oversample;source.connect(shaper);shaper.connect(context.destination);source.start();
  const result=(await context.startRendering()).getChannelData(0);let peak=0,quietError=0,nonfinite=0;
  for(let i=0;i<result.length;i++){if(!Number.isFinite(result[i]))nonfinite++;peak=Math.max(peak,Math.abs(result[i]));if(i>=4096)quietError=Math.max(quietError,Math.abs(result[i]-expected[i]))}
  source.disconnect();shaper.disconnect();return {samples:result.length,expectedSamples:expected.length,originalViewLengthAfterStart:samples.length,inputMagnitude:24,quietRange:.75,peak,quietError,nonfinite,oversample:graph.ceiling.oversample};
 },
 tailCapability:()=>({offlineSuspend:typeof OfflineAudioContext.prototype.suspend==='function'}),
 async tailProbe(mode:'reset'|'transient',version:'before'|'after'){
  // Isolated native offline graph makes the suspend boundary exact. Only the
  // context/graph setup is a fixture; source registration and both boundary
  // methods are the actual before/after mixer code, with a diagnostic DC buffer.
  const context=new OfflineAudioContext(2,6144,24000),probe=version==='before'?new BeforeMixer({...DEFAULT_SETTINGS,audioConsent:true}):new AudioMixer({...DEFAULT_SETTINGS,audioConsent:true}),g=probe as unknown as Graph;
  g.context=context as unknown as AudioContext;g.master=context.createGain();g.master.connect(context.destination);g.ceiling=context.createWaveShaper();g.ceiling.curve=graph.ceiling.curve;g.ceiling.oversample='none';g.ceiling.connect(g.master);g.limiter=context.createDynamicsCompressor();
  for(const key of ['threshold','knee','ratio','attack','release'] as const)g.limiter[key].value=graph.limiter[key].value;
  g.limiter.connect(g.ceiling);g.buses=new Map();for(const bus of ['effects','voice','music','ui']){const gain=context.createGain();gain.connect(g.limiter);g.buses.set(bus,gain)}
  const buffer=context.createBuffer(1,9600,24000);buffer.getChannelData(0).fill(.5);const source=g.source(buffer,mixer.manifest!.entries[effects[0]],50);source.node.start();
  const suspended=context.suspend(.064),render=context.startRendering();await suspended;const boundary=Math.round(context.currentTime*context.sampleRate),oldLimiter=g.limiter;
  if(mode==='reset')probe.reset();else probe.stopTransient();
  const replaced=g.limiter!==oldLimiter;await context.resume();const result=(await render).getChannelData(0);let before=0,after=0,nonzeroAfter=0,nonfinite=0;
  for(let i=0;i<result.length;i++){if(!Number.isFinite(result[i]))nonfinite++;if(i<boundary)before=Math.max(before,Math.abs(result[i]));else{after=Math.max(after,Math.abs(result[i]));if(result[i]!==0)nonzeroAfter++}}
  const statistics=probe.statistics;
  // Offline contexts finish closed and have no close() method. Detach that
  // fixture-owned context before exercising the ordinary graph disposal.
  (g as unknown as {context?:AudioContext}).context=undefined;probe.dispose();oldLimiter.disconnect();
  return {mode,version,boundary,samples:result.length,before,after,nonzeroAfter,nonfinite,replaced,statistics,offlineState:context.state};
 },
 async prepare(maximum:boolean){
  mixer.music([]);mixer.reset();
  const preferences:AudioPreferences={...DEFAULT_SETTINGS,audioConsent:true,audio:maximum?{master:1,music:1,effects:1,voice:1,ui:1}:DEFAULT_SETTINGS.audio};
  mixer.update(preferences);
  const ids=[...music,...ambient,warning,...effects];
  const buffers=[];
  for(const id of ids){const entry=mixer.manifest!.entries[id];if(!entry)throw Error('Missing original audio '+id);const buffer=await graph.buffer(entry.variants[0]);buffers.push({id,frames:buffer.length,channels:buffer.numberOfChannels,duration:buffer.duration})}
  if(mixer.statistics.sources)throw Error('Preparation accidentally started playback');
  return {preferences,buffers,statistics:mixer.statistics};
 },
 async start(count:number){
  await message('reset');
  mixer.music(music,[0,0,1]);
  mixer.continuous(ambient.map((id,i)=>({key:'review-'+i,id,gain:i?.18:.07,pan:0})));
  mixer.play(warning);
  for(const id of effects.slice(0,count))mixer.play(id);
  await wait(()=>mixer.statistics.sources===8+count);
  return api.state();
 },
 read:()=>message('read'),
 async clear(){mixer.music([]);mixer.reset();await wait(()=>mixer.statistics.sources===0&&mixer.statistics.pending===0);return api.state()},
 async dispose(){const context=graph.context;meter?.disconnect();meter?.port.close();mixer.dispose();await wait(()=>context.state==='closed');return {statistics:mixer.statistics,closedContext:context.state,retainedGraph:{master:!!graph.master,limiter:!!graph.limiter,ceiling:!!graph.ceiling,buses:graph.buses.size}}},
};
declare global {interface Window {audioMixQA:typeof api}}
window.audioMixQA=api;
document.getElementById('gesture')!.textContent='Enable isolated audio check';
