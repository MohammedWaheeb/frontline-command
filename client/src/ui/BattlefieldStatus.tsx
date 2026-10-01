import {battlefieldStatus,type BattlefieldStatusInput} from '../app/session-presentation';

export function BattlefieldStatus(props:BattlefieldStatusInput){
 const status=battlefieldStatus(props);
 return <span className="live-led" role="status" title={status.description} aria-label={`${status.label}: ${status.description}`}><i className="led" aria-hidden="true"/>{status.label}</span>;
}
