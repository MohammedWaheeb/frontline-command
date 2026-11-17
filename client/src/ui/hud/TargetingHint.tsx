import {createPortal} from 'react-dom';
import {credits} from '../../content/labels';
import {Icon} from '../primitives';
import type {BattleView} from './battle-view';

/** Verdict word + one short line; no "the host will check" copy (research B5).
 * Go remains authoritative: CHECKING means the preview has not answered yet. */
const VERDICT:Record<string,string>={clear:'Clear',pending:'Checking',blocked:'Blocked',choose:'Choose site',target:'Choose target'};

/** Top-centre targeting / placement bar (design-audit-hud §2.8), portalled into
 * the overlay's target slot so it never covers the alert feed or the tray. */
export function TargetingHint({view}:{view:BattleView}){
 const {targetHost,control,battle,economy,catalog,hintVerdict,placement,escapeKey,escapeShortcut}=view;
 if(!targetHost||!battle.target)return null;
 const target=battle.target,build=target.kind==='build',type=target.type??'';
 const building=build?catalog.buildings.get(type):undefined,delta=building?building.power_capacity-building.power_demand:0;
 const demandAfter=economy&&building?economy.powerDemand+building.power_demand:undefined,capacityAfter=economy&&building?economy.powerCapacity+building.power_capacity:undefined;
 const powerState=demandAfter===undefined||capacityAfter===undefined?undefined:demandAfter>capacityAfter?'over':demandAfter>capacityAfter*.9?'tight':'ok';
 const line=build?(hintVerdict==='blocked'?placement:hintVerdict==='choose'?'Move over visible ground in build range.':undefined):target.label==='Rebase'?'Click your airfield or drone service building.':'Click a target on the battlefield.';
 return createPortal(<div className="targeting-hint" data-verdict={hintVerdict} data-hud="target" role="status">
  <Icon id={build?'i-building':'i-crosshair'}/>
  <span className="hint-head"><strong>{target.label}</strong>{build&&<><span className="hint-cost">{credits(catalog.cost(type)??0)}</span>{building&&delta!==0&&<span className="hint-power" data-power={powerState} title={demandAfter!==undefined?`Power after build: ${demandAfter} used of ${capacityAfter}`:undefined}>{delta>0?'+':'−'}{Math.abs(delta)} PWR</span>}{building&&delta===0&&powerState==='over'&&<span className="hint-power" data-power="over">Low power</span>}</>}</span>
  {build&&<span className="hint-verdict"><i aria-hidden="true"/>{VERDICT[hintVerdict]??hintVerdict}</span>}
  {line&&<small>{line}</small>}
  <button type="button" onClick={()=>control.cancel()} aria-keyshortcuts={escapeShortcut}>Cancel{escapeKey&&<kbd aria-hidden="true">{escapeKey}</kbd>}</button>
 </div>,targetHost);
}
