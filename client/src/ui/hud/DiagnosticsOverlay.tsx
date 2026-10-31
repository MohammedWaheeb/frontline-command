import {useRef} from 'react';
import {createPortal} from 'react-dom';
import {incomeWindowLabel} from '../../app/hauler-income-window';
import {battlefieldStatus} from '../../app/session-presentation';
import {formatClock} from '../../content/labels';
import {shortcutBadgeLabel} from '../shortcut-presentation';
import type {BattleView} from './battle-view';


/** Opt-in command diagnostics (design-audit-hud §2.9). Engineering telemetry
 * that used to sit on the play surface: the observed income window, order
 * acknowledgements and the session link status. Hidden by default; rendered from
 * `settings.diagnostics`, toggled by the rebindable `diagnostics` action (default
 * Ctrl+Shift+D) or Options → Interface. Fully pointer-transparent. */
export function DiagnosticsOverlay({view}:{view:BattleView}){
 const {state,control,snapshot}=view,open=state.settings.diagnostics,log=useRef<{tick:number;text:string}[]>([]),last=useRef<string|undefined>(undefined);
 const key=state.settings.bindings.keys.diagnostics?.[0];
 const notice=state.notice;
 if(notice&&notice!==last.current){log.current=[{tick:snapshot?.tick??0,text:notice},...log.current].slice(0,6)}
 last.current=notice;
 if(!open||!snapshot)return null;
 const income=control.recentHaulerIncome(snapshot.player),status=battlefieldStatus({kind:state.session.kind,paused:state.paused,snapshot});
 return createPortal(<aside className="hud-diagnostics" aria-label="Command diagnostics">
  <h3>Diagnostics {key&&<small>{shortcutBadgeLabel(key)}</small>}</h3>
  <dl>
   <dt>Income</dt><dd>{incomeWindowLabel(income)}{income?` · through ${formatClock(income.toTick)}`:''}</dd>
   <dt>Session</dt><dd>{status.label} · {status.description}</dd>
   <dt>Tick</dt><dd>{snapshot.tick} · {formatClock(snapshot.tick)}</dd>
   <dt>Advice</dt><dd>{battle(view)}</dd>
  </dl>
  {log.current.length>0&&<ol>{log.current.map((entry,index)=><li key={index}><span>{formatClock(entry.tick)}</span>{entry.text}</li>)}</ol>}
 </aside>,document.body);
}
function battle(view:BattleView){const value=view.battle;return value.adviceUnavailable?`Unavailable: ${value.adviceUnavailable}`:value.pending?'Order pending':value.affordances?`Fresh · ${value.affordances.entities.length} actors`:'—'}
