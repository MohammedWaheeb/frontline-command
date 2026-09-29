import type {PlayerSnapshot} from '../runtime/types';
import {defeatCountdowns} from '../app/battlefield-cues';

export function DefeatWarning({snapshot}:{snapshot?:PlayerSnapshot}){
 const deadlines=defeatCountdowns(snapshot);if(!deadlines.length)return null;
 const own=deadlines.find(value=>value.own),others=deadlines.filter(value=>!value.own);
 return <section className={`defeat-warning ${own?'own':''}`} aria-label="Commander defeat countdowns">
  {own?<><strong>COMMAND LOST <b role="timer" aria-label="Seconds until defeat">{own.seconds}s</b></strong><p>Complete or capture an HQ, barracks, factory or air producer, or regain a living rig.</p></>:<strong>COMMAND AT RISK</strong>}
  {others.length>0?<div className="defeat-warning-others">{others.map(value=><span key={value.player}>{value.name||`Commander ${value.player}`} <b>{value.seconds}s</b></span>)}</div>:null}
 </section>;
}
