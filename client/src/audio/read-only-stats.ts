import type {AudioMixer,AudioOwnershipSnapshot} from './mixer';

export interface ReadOnlyAudioStatistics {
 readonly context:AudioMixer['statistics']['context'];readonly sources:number;readonly continuous:number;readonly buffers:number;
 readonly decodedBytes:number;readonly pending:number;readonly generation:number;
 readonly gains:Readonly<{master:number;voice:number;music:number;effects:number;ui:number}>;
}
export interface ReadOnlyAudioStats {
 readonly schema:'fc-audio-stats-readonly/1';readonly statistics:ReadOnlyAudioStatistics;readonly ownership:AudioOwnershipSnapshot;
}
/** Read the normal Application-owned mixer without retaining its objects or controls. */
export function readAudioOwnership(mixer:Pick<AudioMixer,'statistics'|'ownershipSnapshot'>):ReadOnlyAudioStats {
 const current=mixer.statistics;
 const statistics:ReadOnlyAudioStatistics=Object.freeze({context:current.context,sources:current.sources,continuous:current.continuous,buffers:current.buffers,
  decodedBytes:current.decodedBytes,pending:current.pending,generation:current.generation,
  gains:Object.freeze({master:current.gains.master,voice:current.gains.voice,music:current.gains.music,effects:current.gains.effects,ui:current.gains.ui})});
 const value=mixer.ownershipSnapshot;
 const gains=Object.freeze({master:value.gains.master,voice:value.gains.voice,music:value.gains.music,
  effects:value.gains.effects,ui:value.gains.ui});
 const ownership:AudioOwnershipSnapshot=Object.freeze({schema:'fc-audio-ownership/1',disposed:value.disposed,context:value.context,generation:value.generation,
  sources:value.sources,continuous:value.continuous,buffers:value.buffers,decodedPCMBytes:value.decodedPCMBytes,
  pending:value.pending,inFlight:value.inFlight,limiterPresent:value.limiterPresent,ceilingPresent:value.ceilingPresent,gains});
 return Object.freeze({schema:'fc-audio-stats-readonly/1',statistics,ownership});
}
