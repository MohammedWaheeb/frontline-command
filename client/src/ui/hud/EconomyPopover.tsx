// Credits popover (hud-sidebar lane). It holds the repair-reserve policy and the
// economy detail that used to sit permanently on the battlefield and in the
// build column. It stays mounted, so the `repair_reserve` key, which focuses
// `[data-repair-reserve]`, still works: focusing the input opens the popover.
import {useEffect,useId,useState} from 'react';
import {MAX_REPAIR_RESERVE,parseRepairReserve} from '../../app/player-controls';
import type {EconomyStatus} from '../../app/economy-status';
import type {KeyChord} from '../../runtime/keybindings';
import {credits} from '../../content/labels';
import {shortcutAriaList,shortcutBadgeLabel} from '../shortcut-presentation';

interface EconomyPopoverProps {open:boolean;onOpen:()=>void;onClose:()=>void;reserve?:bigint;disabled:boolean;available:boolean;bindings?:readonly KeyChord[];status?:EconomyStatus;onApply:(credits:number)=>void}
export function EconomyPopover({open,onOpen,onClose,reserve,disabled,available,bindings,status,onApply}:EconomyPopoverProps){
 const current=(reserve??0n)/1000n,[amount,setAmount]=useState(String(current)),id=useId();
 useEffect(()=>setAmount(String(current)),[current]);
 const parsed=parseRepairReserve(amount),blocked=disabled||!available,key=bindings?.[0];
 const haulers=status?.haulers??[],working=haulers.filter(hauler=>hauler.state==='gathering'||hauler.state==='returning').length,stuck=haulers.filter(hauler=>hauler.state==='blocked'||hauler.state==='idle_no_known_field').length;
 return <section className="hud-economy" data-hud="economy" data-open={open||undefined} aria-label="Economy and repair reserve" aria-hidden={!open} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}}>
  <header><h3>Economy</h3><button type="button" className="hud-economy-close" tabIndex={open?0:-1} aria-label="Close economy panel" onClick={onClose}>×</button></header>
  <dl>
   <dt>Income</dt><dd>{status?.incomeState==='ready'&&status.incomePerMinute!==undefined?<b>+{credits(status.incomePerMinute)} / min</b>:status?.incomeState==='starting_up'?'Measuring the first minute…':'No deliveries yet'}</dd>
   <dt>Haulers</dt><dd>{haulers.length?<>{working} working{stuck?<em> · {stuck} need orders</em>:null}{haulers.length-working-stuck>0?` · ${haulers.length-working-stuck} other`:''}</>:'None — train one at a Supply center'}</dd>
   {status?.congestion[0]&&<><dt>Fields</dt><dd><em>{status.congestion.length} crowded field{status.congestion.length>1?'s':''}: spread haulers out</em></dd></>}
  </dl>
  <div className="hud-economy-reserve">
   <h4><label htmlFor={id}>Repair reserve</label>{key&&<kbd title={shortcutAriaList(bindings)}>{shortcutBadgeLabel(key)}</kbd>}</h4>
   <p id={`${id}-help`}>Paid repairs never spend below this amount. Medic healing is free. Now: {String(current)} credits.</p>
   <div className="hud-economy-row"><input id={id} data-repair-reserve tabIndex={open?0:-1} onFocus={onOpen} type="number" inputMode="numeric" min={0} max={MAX_REPAIR_RESERVE} step={100} value={amount} disabled={blocked} aria-describedby={`${id}-help`} aria-invalid={parsed===undefined} aria-keyshortcuts={blocked?undefined:shortcutAriaList(bindings)} onChange={event=>setAmount(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&parsed!==undefined&&!blocked){event.preventDefault();onApply(parsed);onClose()}}}/><button type="button" tabIndex={open?0:-1} disabled={blocked||parsed===undefined} onClick={()=>{if(parsed!==undefined){onApply(parsed);onClose()}}}>Apply</button></div>
  </div>
 </section>;
}
