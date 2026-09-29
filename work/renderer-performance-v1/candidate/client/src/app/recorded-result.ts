import {create} from '@bufbuild/protobuf';
import {MatchResultSchema} from '../protocol/frontline_pb';
import type {MatchHistoryRecord} from '../runtime/api';
import type {ConnectionPhase,MatchResult} from '../runtime/types';
import {RuntimeError} from '../runtime/errors';

export interface RecordedOperation{id:string;created:number;result:MatchResult}
/** Read result metadata only. Never reserialize the engine payload or its uint64 seed. */
export function recordedOperation(record:MatchHistoryRecord):RecordedOperation{
 const invalid=()=>new RuntimeError('result_invalid','The recorded result has invalid metadata. Its original record remains on the host.');
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(record.id)||!Number.isSafeInteger(record.created)||record.created<0||typeof record.void!=='boolean'||typeof record.payload!=='string'||record.payload.length>4*1024*1024)throw invalid();
 let value:any;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(record.payload),character=>character.charCodeAt(0))))}catch{throw invalid()}
 if(value?.match_id!==record.id)throw invalid();
 const outcome=value.outcome??(record.void?{finished:true,draw:true,winning_team:0,reason:value.reason??'void',tick:value.tick}:undefined);
 if(outcome?.finished!==true||typeof outcome.draw!=='boolean'||!Number.isSafeInteger(outcome.tick)||outcome.tick<0||outcome.tick>0xffffffff||!Number.isInteger(outcome.winning_team)||outcome.winning_team<0||outcome.winning_team>4||typeof outcome.reason!=='string'||!outcome.reason||outcome.reason.length>200)throw invalid();
 return {id:record.id,created:record.created,result:create(MatchResultSchema,{matchId:record.id,committed:true,void:record.void,outcome:{finished:true,draw:outcome.draw,winningTeam:outcome.winning_team,reason:outcome.reason,tick:outcome.tick}})};
}
export function recordedResultLabel(result:MatchResult){return result.void?'Voided operation':result.outcome?.draw?'Draw':result.outcome?.winningTeam?`Team ${result.outcome.winningTeam} victorious`:'Operation completed'}
export function frozenResultAvailable(input:{kind?:string;liveFinished:boolean;matchID?:string;result?:MatchResult;eliminated?:boolean;connection:ConnectionPhase}):boolean{
 return input.kind==='online'&&!input.liveFinished&&!!input.matchID&&input.result?.matchId===input.matchID&&input.result.committed&&!!input.result.outcome?.finished&&(!!input.eliminated||input.connection==='closed'||input.connection==='reconnecting');
}
