import type {PlayerSnapshot} from '../runtime/types';
import {defeatCountdowns} from '../app/battlefield-cues';

const HELP='Complete or capture an HQ, barracks, factory or air producer, or regain a living rig.';
/** Commander elimination countdowns. `variant="feed"` is the pinned critical
 * row at the top of the alert feed (design-audit-hud §2.7) and is the only
 * copy the battle HUD renders. The default plate variant is kept for frozen
 * history builds and is no longer mounted by the sidebar. */
export function DefeatWarning({snapshot,variant='plate'}:{snapshot?:PlayerSnapshot;variant?:'plate'|'feed'}){
 const deadlines=defeatCountdowns(snapshot);if(!deadlines.length)return null;
 const own=deadlines.find(value=>value.own),others=deadlines.filter(value=>!value.own);
 if(variant==='feed')return <section className={`defeat-warning battle-alert critical ${own?'own':''}`} data-pinned="" aria-label="Commander defeat countdowns" title={own?HELP:undefined}>
  <span className="defeat-icon" aria-hidden="true">!</span>
  <span className="alert-text">{own?<><strong>Command lost</strong> <small>Build or capture a production structure</small></>:<strong>Command at risk</strong>}{others.length>0&&<span className="defeat-warning-others">{others.map(value=><span key={value.player}>{value.name||`Commander ${value.player}`} <b>{value.seconds}s</b></span>)}</span>}</span>
  {own&&<b className="defeat-timer" role="timer" aria-label="Seconds until defeat">{own.seconds}s</b>}
 </section>;
 return <section className={`defeat-warning ${own?'own':''}`} aria-label="Commander defeat countdowns">
  {own?<><strong>COMMAND LOST <b role="timer" aria-label="Seconds until defeat">{own.seconds}s</b></strong><p title={HELP}>Build or capture a production structure, or keep a rig alive.</p></>:<strong>COMMAND AT RISK</strong>}
  {others.length>0?<div className="defeat-warning-others">{others.map(value=><span key={value.player}>{value.name||`Commander ${value.player}`} <b>{value.seconds}s</b></span>)}</div>:null}
 </section>;
}
