import type {PlayerSnapshot} from '../runtime/types';
import type {SessionKind} from '../runtime/session';
import type {NetworkState} from './network-controller';

export interface BattlefieldStatusInput{kind?:SessionKind;paused:boolean;snapshot?:Pick<PlayerSnapshot,'player'|'players'|'outcome'>}
/** Describe only the current authorized view, never a separately recovered result. */
export function battlefieldStatus({kind,paused,snapshot}:BattlefieldStatusInput):{label:string;description:string}{
 if(kind==='observer')return {label:'OBSERVER',description:'Authorized observer perspective; no command control.'};
 if(kind==='online'&&!snapshot?.outcome?.finished&&snapshot?.players.some(player=>player.id===snapshot.player&&player.defeated))return {label:'FROZEN',description:'Your commander was eliminated. This view receives no live battlefield updates.'};
 if(paused)return {label:'PAUSED',description:'The current timeline is paused.'};
 if(kind==='replay')return {label:'REPLAY',description:'Recorded operation playback.'};
 if(snapshot?.outcome?.finished)return {label:'ENDED',description:'This operation has ended. The battlefield is available for inspection.'};
 return {label:'LIVE',description:'Live operation.'};
}

type OperationState=Pick<NetworkState,'connection'|'eliminated'|'result'|'lobbyState'|'lobbyUnavailable'|'status'|'tick'>;
/** Old MatchStatus frames are retained for recovery; they must not masquerade as current connections. */
export function networkOperationPresentation(state:OperationState){
 const ended=state.result?.outcome?.finished===true||state.lobbyState==='completed';
 const statusCurrent=state.connection==='connected'&&!state.eliminated&&!ended&&!state.lobbyUnavailable;
 const label=state.result?.committed?'RESULT RECORDED':state.eliminated?'FROZEN':ended?'OPERATION ENDED':statusCurrent&&state.status?.paused?'SHARED PAUSE':statusCurrent&&state.status?.waitingForPlayers?'WAITING FOR COMMANDERS':state.connection.toUpperCase();
 const resultTick=state.result?.outcome?.finished?state.result.outcome.tick:undefined;
 return {label,statusCurrent,tick:resultTick??state.tick,timePrefix:resultTick!==undefined?'Result time · ':statusCurrent?'':'Last update · '};
}
