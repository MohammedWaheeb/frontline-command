import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,type PlayerSnapshot,type StateDelta} from '../protocol/frontline_pb';
import {RuntimeError} from './errors';
/** Deltas replace every non-entity field. Missing entities must never retain
 * old vision or private data. Prior snapshots remain immutable for interpolation. */
export function applyDelta(previous:PlayerSnapshot|undefined,delta:StateDelta):PlayerSnapshot{
 const next=delta.state;
 if(!previous||!next||delta.baselineTick!==previous.tick||next.tick<previous.tick||next.player!==previous.player){throw new RuntimeError('baseline_mismatch','A fresh match snapshot is required before continuing.')}
 const entities=new Map(previous.entities.map(e=>[e.id,e]));
 for(const id of delta.removedEntities)entities.delete(id);
 for(const entity of next.entities)entities.set(entity.id,entity);
 return create(PlayerSnapshotSchema,{...next,entities:[...entities.values()].sort((a,b)=>a.id-b.id)});
}
export function assertSnapshot(s:PlayerSnapshot,player:number,expected:{simulation:string;protocol:number;content_hash:string}){
 if(s.player!==player)throw new RuntimeError('wrong_perspective','The host returned a different player perspective.',false);
 if(!s.metadata||s.metadata.simulation!==expected.simulation||s.metadata.protocol!==expected.protocol||s.metadata.contentHash!==expected.content_hash)throw new RuntimeError('incompatible_version','Load the matching game and content version before joining.',false);
 if(s.visible.length!==s.explored.length||s.visible.length>65536||s.entities.length>2048)throw new RuntimeError('invalid_snapshot','The host returned an invalid match snapshot.',false);
}
