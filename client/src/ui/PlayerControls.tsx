import {useEffect,useId,useState} from 'react';
import {MAX_REPAIR_RESERVE,parseRepairReserve,selectionSettingState,observeSettingState,capableSelectionHint,type SelectionSetting} from '../app/player-controls';
import type {CommandAffordances,PlayerSnapshot} from '../runtime/types';
import type {KeyChord} from '../runtime/keybindings';
import {Icon} from './primitives';
import {shortcutAriaList,shortcutBadgeLabel,shortcutLabel} from './shortcut-presentation';
interface SelectionSettingProps {kind:SelectionSetting;snapshot?:PlayerSnapshot;ids:readonly number[];advice?:CommandAffordances;disabled:boolean;bindings?:readonly KeyChord[];onCommand:(index?:0|1)=>void}
export function SelectionSettingControl({kind,snapshot,ids,advice,disabled,bindings,onCommand}:SelectionSettingProps){
 const status=selectionSettingState(kind,snapshot,ids,advice),power=kind==='power',label=power?'Power':'Repeat sortie';
 const state=power?status?.state==='on'?'active':status?.state==='off'?'inactive':status?.state:status?.state;
 const blocked=disabled||!status,key=bindings?.[0],action=status?.nextIndex===0?'Disable':'Enable';
 const hint=power?'Power shows current operation. Temporary sabotage still applies after Enable.':'When enabled, aircraft repeat their ground attack after service. When off, a single ground attack does not repeat. Authorized Patrol/Escort duties and queued orders can resume after service.';
 return <><button disabled={blocked} aria-pressed={status?.pressed} aria-keyshortcuts={blocked?undefined:shortcutAriaList(bindings)} title={`${action} selected ${power?'buildings':'aircraft repeat sorties'}. ${hint}`} onClick={()=>onCommand()}><Icon id={power?'i-toggle-power':'i-refresh'}/><span>{label}: {state??'unavailable'}</span>{key&&<kbd aria-hidden="true" title={shortcutLabel(key)}>{shortcutBadgeLabel(key)}</kbd>}</button>{power&&<><button disabled={blocked} title="Enable selected buildings. Temporary sabotage still applies." onClick={()=>onCommand(1)}><Icon id="i-toggle-power"/><span>Enable power</span></button><button disabled={blocked} title="Disable selected buildings; they draw no power and perform no functions." onClick={()=>onCommand(0)}><Icon id="i-toggle-power"/><span>Disable power</span></button></>}</>;
}
interface RepairReserveProps {reserve?:bigint;disabled:boolean;available:boolean;bindings?:readonly KeyChord[];onApply:(credits:number)=>void}
export function RepairReserveControl({reserve,disabled,available,bindings,onApply}:RepairReserveProps){
 const current=(reserve??0n)/1000n,[amount,setAmount]=useState(String(current)),id=useId();
 useEffect(()=>setAmount(String(current)),[current]);
 const parsed=parseRepairReserve(amount),blocked=disabled||!available;
 return <section className="production-queue" aria-label="Paid repair reserve"><h3>Repair reserve</h3><label htmlFor={id}>Keep credits for other orders</label><input id={id} data-repair-reserve type="number" inputMode="numeric" min={0} max={MAX_REPAIR_RESERVE} step={1} value={amount} disabled={blocked} aria-describedby={`${id}-help`} aria-invalid={parsed===undefined} aria-keyshortcuts={blocked?undefined:shortcutAriaList(bindings)} onChange={event=>setAmount(event.target.value)}/><button disabled={blocked||parsed===undefined} onClick={()=>{if(parsed!==undefined)onApply(parsed)}}>Apply reserve</button><small id={`${id}-help`}>All paid repairs, including Repair orders, leave this many credits untouched. Free medic healing is unaffected. Current reserve: {String(current)} credits. Range: 0–1,000,000.</small></section>;
}

interface ObserveSettingProps {snapshot?:PlayerSnapshot;ids:readonly number[];advice?:CommandAffordances;disabled:boolean;onCommand:(index:0|1)=>void}
export function ObserveSettingControl({snapshot,ids,advice,disabled,onCommand}:ObserveSettingProps){
 const status=observeSettingState(snapshot,ids,advice),blocked=disabled||!status;
 const hint=`Free. After 2 seconds stationary, gain +3 sight. Movement or work cancels Observe. ${capableSelectionHint(snapshot,ids,advice,'ability','observe')}`;
 return <><button disabled={blocked} aria-pressed={status?.pressed} title={hint} onClick={()=>{if(status)onCommand(status.nextIndex)}}><Icon id="i-energy"/><span>Recon Observe: {status?.state??'unavailable'}</span></button><button disabled={blocked} title={`Enable Recon Observe. ${hint}`} onClick={()=>onCommand(0)}><Icon id="i-check"/><span>Observe On</span></button><button disabled={blocked} title={`Disable Recon Observe. ${hint}`} onClick={()=>onCommand(1)}><Icon id="i-stop"/><span>Observe Off</span></button></>;
}
