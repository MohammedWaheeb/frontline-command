import type {Application} from './application';
import type {ReadOnlyAudioStats} from '../audio/read-only-stats';

export const readOnlyStatsEndpoint='__frontlineReadOnlyStats' as const;
export const readOnlyStatsQuery='fc_readonly_stats' as const;
export type ReadOnlyArtStats=ReturnType<Application['readArtStats']>;
export interface ReadOnlyStatsReaders {
 readonly art:()=>ReadOnlyArtStats;
 readonly audio:()=>ReadOnlyAudioStats;
}
export interface ReadOnlyStatsEndpoint {
 readonly schema:'fc-readonly-stats/1';
 readonly instanceID:string;
 readonly art:()=>ReadOnlyArtStats;
 readonly audio:()=>ReadOnlyAudioStats;
}
declare global {interface Window {readonly __frontlineReadOnlyStats?:ReadOnlyStatsEndpoint}}
interface Binding {active:boolean;readers?:Readonly<ReadOnlyStatsReaders>;endpoint:ReadOnlyStatsEndpoint}
const managed=new WeakMap<object,Binding>();
let serial=0;

/** Explicit native-test navigation opt-in only. Ordinary navigation installs none. */
export function readOnlyStatsRequested(search:string):boolean {
 const values=new URLSearchParams(search).getAll(readOnlyStatsQuery);
 return values.length===1&&values[0]==='1';
}
function readArt(binding:Binding):ReadOnlyArtStats {
 if(!binding.active||!binding.readers)throw Error('Read-only statistics binding detached.');
 return binding.readers.art();
}
function readAudio(binding:Binding):ReadOnlyAudioStats {
 if(!binding.active||!binding.readers)throw Error('Read-only statistics binding detached.');
 return binding.readers.audio();
}
function revoke(binding:Binding){binding.active=false;binding.readers=undefined}
function createBinding(readers:ReadOnlyStatsReaders):Binding {
 // Endpoint closures capture only this revocable state, not an Application,
 // AudioMixer, original readers parameter, controller or installer callback.
 const binding:Binding={active:true,readers:Object.freeze({art:readers.art,audio:readers.audio}),endpoint:undefined as unknown as ReadOnlyStatsEndpoint};
 const origin=performance.timeOrigin;
 if(!Number.isFinite(origin))throw Error('Document time origin is unavailable.');
 binding.endpoint=Object.freeze({schema:'fc-readonly-stats/1' as const,instanceID:`fc-readonly-stats:${origin}:${++serial}`,art:()=>readArt(binding),audio:()=>readAudio(binding)});
 return binding;
}
/** Install aggregate readers on the normal document; return owner-only teardown.
 * No polling, listener, context creation, playback, resource init or game access.
 */
export function installReadOnlyStats(readers:ReadOnlyStatsReaders,options:{enabled?:boolean;target?:object}={}):()=>void {
 if(options.enabled!==true)return ()=>{};
 if(typeof readers.art!=='function'||typeof readers.audio!=='function')throw Error('Aggregate statistics readers are required.');
 const target=options.target??window,existing=Object.getOwnPropertyDescriptor(target,readOnlyStatsEndpoint),previous=managed.get(target);
 if(existing&&(!previous||existing.value!==previous.endpoint))throw Error('Read-only statistics endpoint is already owned.');
 const binding=createBinding(readers);
 Object.defineProperty(target,readOnlyStatsEndpoint,{configurable:true,enumerable:false,writable:false,value:binding.endpoint});
 if(previous)revoke(previous);
 managed.set(target,binding);
 return ()=>{
  revoke(binding);
  const current=Object.getOwnPropertyDescriptor(target,readOnlyStatsEndpoint);
  if(current?.value===binding.endpoint)Reflect.deleteProperty(target,readOnlyStatsEndpoint);
  if(managed.get(target)===binding)managed.delete(target);
 };
}
