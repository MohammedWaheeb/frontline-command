import {useId} from 'react';
import {STARTING_CREDIT_PRESETS,STANDARD_STARTING_CREDITS,MIN_STARTING_CREDITS,MAX_STARTING_CREDITS,parseStartingCredits,formatStartingCredits} from '../app/starting-money';

type Props={value:string;onChange:(value:string)=>void;disabled?:boolean;lockedReason?:string};
/** One controlled draft; the parent owns submission and mode eligibility. */
export function StartingMoneyField({value,onChange,disabled=false,lockedReason}:Props){
 const id=useId(),selection=parseStartingCredits(value),error=selection.valid?undefined:selection.message;
 return <div className="starting-money" role="group" aria-labelledby={id+'-title'}>
  <h3 id={id+'-title'}>Starting credits</h3>
  <div className="button-row" aria-label="Starting credit presets">{STARTING_CREDIT_PRESETS.map(credits=><button key={credits} type="button" disabled={disabled} aria-pressed={selection.valid&&selection.credits===credits} onClick={()=>onChange(String(credits))}>{formatStartingCredits(credits)}{credits===STANDARD_STARTING_CREDITS?' · Standard':''}</button>)}</div>
  <label htmlFor={id}>Custom credits per commander</label>
  <input id={id} type="number" inputMode="numeric" min={MIN_STARTING_CREDITS} max={MAX_STARTING_CREDITS} step={1} required disabled={disabled} value={value} onChange={event=>onChange(event.target.value)} aria-invalid={error?true:undefined} aria-describedby={id+'-help'+(error?' '+id+'-error':'')+(lockedReason?' '+id+'-lock':'')}/>
  <p id={id+'-help'} className="network-hint">1–1,000,000 whole credits. Every human and AI commander starts with the same amount. Nonstandard funds use custom, unranked rules.</p>
  {lockedReason&&<p id={id+'-lock'} className="network-hint">{lockedReason}</p>}
  {error&&<p id={id+'-error'} role="alert" className="network-warning">{error}</p>}
 </div>;
}
