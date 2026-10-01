import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,type PlayerSnapshot,type PriorityFrame} from '../protocol/frontline_pb';
import {RuntimeError} from './errors';
/** Redact presentation immediately, without advancing the full-state movement
 * clock or mutating the canonical baseline. Only a subsequent full state can
 * disclose an actor again; priority never inserts entities or private fields. */
export function applyPriority(previous:PlayerSnapshot|undefined,frame:PriorityFrame):PlayerSnapshot{
 if(!previous||frame.tick<previous.tick)throw new RuntimeError('baseline_mismatch','A fresh match snapshot is required before continuing.');
 if(frame.removedEntities.length>2048||frame.removedEntities.some(id=>id===0))throw new RuntimeError('invalid_priority','The host returned invalid visibility removals.',false);
 if(!frame.removedEntities.length)return previous;
 const removed=new Set(frame.removedEntities),entities=previous.entities.filter(entity=>!removed.has(entity.id));
 if(entities.length===previous.entities.length)return previous;
 return create(PlayerSnapshotSchema,{...previous,entities});
}
