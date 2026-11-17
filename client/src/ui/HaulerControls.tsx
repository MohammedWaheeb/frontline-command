import {useEffect,useId,useRef} from 'react';
import type {CatalogIndex} from '../content/catalog';
import {credits} from '../content/labels';
import type {CommandAffordances,PlayerSnapshot} from '../runtime/types';
import {haulerCommandAvailable,haulerDepots,haulerFields,haulerQueueLabel,haulerRouteLabel,haulerSelection,type HaulerAction} from '../app/hauler-controls';
import type {RecentHaulerIncome} from '../app/hauler-income-window';
import './hauler-controls.css';

interface Props {snapshot?:PlayerSnapshot;catalog:CatalogIndex;ids:readonly number[];advice?:CommandAffordances;disabled:boolean;income?:RecentHaulerIncome;onConfigure:(ids:readonly number[],action:HaulerAction)=>void}
/** Settings show confirmed owner state. Pending inputs never pretend that a
 * preview, a submitted intention or a local checkbox is an accepted order. */
export function HaulerControls({snapshot,catalog,ids,advice,disabled,onConfigure}:Props){
 const selection=haulerSelection(snapshot,catalog,ids),id=useId(),retreat=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(retreat.current)retreat.current.indeterminate=selection?.retreat==='mixed'},[selection?.retreat]);
 if(!snapshot?.economy)return null;
 const fields=haulerFields(snapshot),depots=haulerDepots(snapshot,catalog),fieldPin=selection?.fieldPin,depotPin=selection?.depotPin;
 const blocked=(kind:'gather'|'gather_depot'|'retreat_when_attacked')=>disabled||!haulerCommandAvailable(selection,advice,snapshot.player,kind);
 const configure=(action:HaulerAction)=>{if(selection)onConfigure([...selection.ids],action)};
 // Recent-income telemetry moved to the sidebar header (+N/min) and the opt-in diagnostics overlay.
 if(!selection)return null;
 return <details className="hauler-controls console" data-hud="hauler-routes">
   <summary aria-label={`Hauler routes · ${selection.haulers.length} selected`}><span>Routes</span><b>{credits(selection.cargo)}</b></summary>
   <div className="hauler-controls-body" role="group" aria-label="Hauler routes">
    <p className="hauler-cargo"><strong>{credits(selection.cargo)} credits carried</strong><small>Spendable once delivered. Lost if the hauler is destroyed.</small></p>
    {!selection.allSelected&&<p className="muted">Select only your haulers to change routes.</p>}
    <label htmlFor={`${id}-field`}>Preferred field<select id={`${id}-field`} value={fieldPin==='mixed'?'':fieldPin??0} disabled={blocked('gather')} onChange={event=>configure({kind:'field',id:Number(event.target.value)})} aria-describedby={`${id}-field-observations`}>
     {fieldPin==='mixed'&&<option value="" disabled>Mixed field pins · choose for all</option>}
     <option value={0}>Automatic field · release pin</option>
     {typeof fieldPin==='number'&&fieldPin>0&&!fields.some(field=>field.id===fieldPin)&&<option value={fieldPin} disabled>Field {fieldPin} · observation unavailable</option>}
     {fields.map(field=><option key={field.id} value={field.id} aria-label={field.label} title={field.label}>Field {field.id}</option>)}
    </select></label>
    <div id={`${id}-field-observations`} className="hauler-field-observations" role="region" aria-label="Known field observations" tabIndex={0}>
     <span>{fieldPin==='mixed'?'Mixed field pins':typeof fieldPin==='number'&&fieldPin>0?`Pinned to Field ${fieldPin}`:'Automatic field'}</span>
     {typeof fieldPin==='number'&&fieldPin>0&&!fields.some(field=>field.id===fieldPin)&&<span>Field {fieldPin} · not currently observed</span>}
     {fields.length>0?<ul>{fields.map(field=><li key={field.id}>{field.label}</li>)}</ul>:<span>No fields scouted yet.</span>}
    </div>
    <button type="button" disabled={blocked('gather')} onClick={()=>configure({kind:'field',id:0})} title="Start automatic gathering or release a field pin. Your preferred depot is kept.">Auto gather · release field pin</button>
    <label htmlFor={`${id}-depot`}>Preferred depot<select id={`${id}-depot`} value={depotPin==='mixed'?'':depotPin??0} disabled={blocked('gather_depot')} onChange={event=>configure({kind:'depot',id:Number(event.target.value)})}>
     {depotPin==='mixed'&&<option value="" disabled>Mixed depot pins · choose for all</option>}
     <option value={0}>Automatic depot · release pin</option>
     {typeof depotPin==='number'&&depotPin>0&&!depots.some(depot=>depot.id===depotPin)&&<option value={depotPin} disabled>Depot {depotPin} · unavailable</option>}
     {depots.map(depot=><option key={depot.id} value={depot.id}>{catalog.name(depot.type)} #{depot.id}</option>)}
    </select></label>
    <label className="check" htmlFor={`${id}-retreat`} title="When hit while gathering, the hauler takes its cargo to the nearest reachable supply center. Manual orders take priority."><input ref={retreat} id={`${id}-retreat`} type="checkbox" checked={selection.retreat===true} aria-checked={selection.retreat==='mixed'?'mixed':selection.retreat} disabled={blocked('retreat_when_attacked')} onChange={event=>configure({kind:'retreat',enabled:event.target.checked})}/>Retreat when attacked{selection.retreat==='mixed'?' · mixed':''}</label>
    <ul className="hauler-route-list" aria-label="Confirmed hauler routes">{selection.haulers.map(hauler=><li key={hauler.id}><strong>{catalog.name(hauler.type)} #{hauler.id}</strong><span>{haulerRouteLabel(hauler,snapshot,catalog)}</span><span>{credits(hauler.private!.cargo)} carried · {haulerQueueLabel(hauler)}</span></li>)}</ul>
    <small>Route changes apply once the order is confirmed.</small>
   </div>
  </details>;
}
