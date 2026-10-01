import {useState} from 'react';
import type {NetworkController} from '../../app/network-controller';
import {useObservable} from '../../app/store';
import {frozenResultAvailable,recordedResultLabel} from '../../app/recorded-result';
import {formatClock} from '../../content/labels';
import './recorded-results.css';

export function RecordedOperations({controller}:{controller:NetworkController}){
 const state=useObservable(controller.state),[expanded,setExpanded]=useState<string>();
 return <section className="network-block" aria-label="Recorded operations"><header><h3>Recorded operations</h3><button disabled={!!state.busy} onClick={()=>void controller.loadHistory()}>{state.historyLoaded?'Refresh recorded operations':'Load recorded operations'}</button></header><p className="network-hint">Your latest 50 recorded results stay on this host after a lobby closes. Replay files may be unavailable if removed by the host.</p>{state.historyLoaded&&!state.history.length&&<p>No recorded operations for this profile.</p>}<div className="recorded-operations">{state.history.map(entry=><article key={entry.id} data-match-id={entry.id}><div><strong>{recordedResultLabel(entry.result)}</strong><small>{new Date(entry.created*1000).toLocaleString()} · {formatClock(entry.result.outcome?.tick??0)}</small></div><button aria-expanded={expanded===entry.id} aria-controls={`recorded-${entry.id}`} onClick={()=>setExpanded(expanded===entry.id?undefined:entry.id)}>View recorded result</button>{expanded===entry.id&&<div id={`recorded-${entry.id}`} className="recorded-operation-detail"><p>{entry.result.outcome?.reason.replaceAll('_',' ')} · Match <code>{entry.id}</code></p><p className="network-hint">This is a recorded result. It does not reopen a live battlefield or reveal its hidden units.</p><button disabled={!!state.busy||entry.result.void} onClick={()=>void controller.archiveRecorded(entry.id)}>Save match replay</button></div>}</article>)}</div></section>;
}

export function RecordedResultCue({controller,kind,liveFinished,onOpen}:{controller:NetworkController;kind?:string;liveFinished:boolean;onOpen:()=>void}){
 const state=useObservable(controller.state);
 if(!frozenResultAvailable({kind,liveFinished,matchID:state.lobby?.match_id,result:state.result,eliminated:state.eliminated,connection:state.connection}))return null;
 return <section className="recorded-result-cue console" aria-label="Recorded match result"><p role="status">Recorded result available · {recordedResultLabel(state.result!)}</p><button onClick={onOpen}>View result and replay</button></section>;
}
