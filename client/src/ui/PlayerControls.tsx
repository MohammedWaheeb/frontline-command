import {useEffect,useId,useState} from 'react';
import {MAX_REPAIR_RESERVE,parseRepairReserve,selectionSettingState,observeSettingState,type SelectionSetting} from '../app/player-controls';
import type {CommandAffordances,PlayerSnapshot} from '../runtime/types';
import type {KeyChord} from '../runtime/keybindings';
import {shortcutAriaList} from './shortcut-presentation';
import {CardKey} from './hud/CardKey';
import {selectionCoverage} from './hud/tray-command-slots';
interface SelectionSettingProps {kind:SelectionSetting;snapshot?:PlayerSnapshot;ids:readonly number[];advice?:CommandAffordances;disabled:boolean;bindings?:readonly KeyChord[];onCommand:(index?:0|1)=>void}
/** One-key toggle (research B6: never three keys for one switch). A plain click
 * sends the next state from disclosed owned state; Shift-click sends the opposite
 * explicit choice, so "disable all" stays reachable from a mixed selection. */
export function SelectionSettingControl({kind,snapshot,ids,advice,disabled,bindings,onCommand}:SelectionSettingProps){
 const status=selectionSettingState(kind,snapshot,ids,advice),power=kind==='power',label=power?'Power':'Repeat sortie';
 const state=power?status?.state==='on'?'active':status?.state==='off'?'inactive':status?.state:status?.state;
 const blocked=disabled||!status,next=status?.nextIndex===0?'Disable':'Enable';
 const hint=power?'Shows current operation. Disabled buildings draw no power and do nothing; sabotage still applies after Enable.':'On: aircraft repeat their ground attack after rearming. Off: a single attack does not repeat.';
 return <CardKey icon={power?'i-toggle-power':'i-refresh'} label={label} stateText={state??'unavailable'} keycap={bindings?.[0]} ariaShortcuts={shortcutAriaList(bindings)} disabled={blocked} pressed={status?status.pressed===true?true:status.pressed===false?false:undefined:undefined} led={status?status.state:undefined}
  tip={{title:label,state:status?`${status.state==='mixed'?'Mixed':status.state==='on'?'On':'Off'} · click to ${next.toLowerCase()}`:'Unavailable for this selection',hint,detail:[`Shift-click: ${status?.nextIndex===0?'enable':'disable'} instead.`]}}
  onClick={event=>{if(!status)return;onCommand(event.shiftKey?(status.nextIndex===0?1:0):undefined)}}/>;
}
interface RepairReserveProps {reserve?:bigint;disabled:boolean;available:boolean;bindings?:readonly KeyChord[];onApply:(credits:number)=>void}
export function RepairReserveControl({reserve,disabled,available,bindings,onApply}:RepairReserveProps){
 const current=(reserve??0n)/1000n,[amount,setAmount]=useState(String(current)),id=useId();
 useEffect(()=>setAmount(String(current)),[current]);
 const parsed=parseRepairReserve(amount),blocked=disabled||!available;
 return <section className="repair-reserve" aria-label="Paid repair reserve"><h3>Repair reserve</h3><label htmlFor={id}>Keep credits for other orders</label><input id={id} data-repair-reserve type="number" inputMode="numeric" min={0} max={MAX_REPAIR_RESERVE} step={1} value={amount} disabled={blocked} aria-describedby={`${id}-help`} aria-invalid={parsed===undefined} aria-keyshortcuts={blocked?undefined:shortcutAriaList(bindings)} onChange={event=>setAmount(event.target.value)}/><button disabled={blocked||parsed===undefined} onClick={()=>{if(parsed!==undefined)onApply(parsed)}}>Apply reserve</button><small id={`${id}-help`}>Paid repairs never spend your last {String(current)} credits. Medic healing stays free. 0–1,000,000.</small></section>;
}

interface ObserveSettingProps {snapshot?:PlayerSnapshot;ids:readonly number[];advice?:CommandAffordances;disabled:boolean;bindings?:readonly KeyChord[];onCommand:(index:0|1)=>void}
/** Recon Observe as one toggle key. Go uses Observe index 0 = ON and 1 = OFF. */
export function ObserveSettingControl({snapshot,ids,advice,disabled,bindings,onCommand}:ObserveSettingProps){
 const status=observeSettingState(snapshot,ids,advice),blocked=disabled||!status;
 const capable=selectionCoverage(snapshot,ids,advice,'ability','observe')??'';
 return <CardKey icon="i-energy" label="Recon Observe" stateText={status?.state??'unavailable'} keycap={bindings?.[0]} ariaShortcuts={shortcutAriaList(bindings)} disabled={blocked} pressed={status?status.pressed===true?true:status.pressed===false?false:undefined:undefined} led={status?status.state:undefined}
  tip={{title:'Recon Observe',cost:'Free',state:status?(status.state==='mixed'?'Mixed':status.state==='on'?'On':'Off'):'Unavailable for this selection',hint:'Stay still for 2 s to gain +3 sight. Moving or working cancels it.',detail:[capable,'Shift-click: send the opposite choice.']}}
  onClick={event=>{if(!status)return;onCommand(event.shiftKey?(status.nextIndex===0?1:0):status.nextIndex)}}/>;
}
