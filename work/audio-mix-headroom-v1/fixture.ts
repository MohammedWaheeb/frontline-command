import {AudioMixer,type AudioPreferences} from '../../client/src/audio/mixer';
import {DEFAULT_SETTINGS} from '../../client/src/app/settings';
import type {AudioVariant} from '../../client/src/audio/index';

// Test-only access to the real mixer's graph and decoder; no replacement node,
// mock decoder, gain override, source or asset edit is used for measurement.
interface Graph {context:AudioContext;master:GainNode;buffer(variant:AudioVariant):Promise<AudioBuffer>}
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
  graph.master.connect(meter);meter.connect(graph.context.destination);
  return {sampleRate:graph.context.sampleRate,state:graph.context.state};
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
 async dispose(){const context=graph.context;meter?.disconnect();meter?.port.close();mixer.dispose();await wait(()=>context.state==='closed');return {statistics:mixer.statistics,closedContext:context.state}},
};
declare global {interface Window {audioMixQA:typeof api}}
window.audioMixQA=api;
document.getElementById('gesture')!.textContent='Enable isolated audio check';
