import type {ReactNode} from 'react';
import type {CatalogIndex} from '../content/catalog';
import type {PlayerSnapshot} from '../runtime/types';
import type {ProductionChoice} from '../app/battle-controller';
import {buildingPrerequisites,requirementAction,requirementActionKind,requirementStateLabel,type BuildingRequirement} from '../content/building-prerequisites';

function Requirement({requirement}:{requirement:BuildingRequirement}){
 return <li data-prerequisite-role={requirement.role} data-prerequisite-state={requirement.state} data-prerequisite-action={requirementActionKind(requirement)}><strong>{requirement.name}</strong> — {requirementStateLabel(requirement)}<p>{requirementAction(requirement)}</p>{requirement.type&&<small>Completed and enabled: {requirement.active.length} · unfinished: {requirement.unfinished.length} · disabled: {requirement.disabled.length}{requirement.unavailable.length?' · unavailable: '+requirement.unavailable.length:''}</small>}</li>;
}

/** Preserve the original button object and its command callback. Full named
 * requirements live below the fixed, clipped portrait, in its native panel.
 * Native details needs no mirrored React state or new keyboard policy. */
export function BuildingPrerequisiteDetails({snapshot,catalog,choice,children}:{snapshot:PlayerSnapshot|undefined;catalog:CatalogIndex;choice:ProductionChoice;children:ReactNode}){
 const model=buildingPrerequisites(snapshot,catalog,choice);
 if(!model)return children;
 const summary=model.requirements.length?model.requirements.map(requirement=>requirement.name+' ('+requirementStateLabel(requirement)+')').join(' + '):'No prerequisite buildings';
 return <div data-build-requirements={model.type}>{children}<details className="muted" aria-label={'Requirements for '+model.name}>
 <summary aria-label={'Requirements for '+model.name+': '+summary+'. Expand for building actions.'} title={'Requires: '+summary}>Requires: {model.requirements.length}</summary>
 {model.requirements.length?<><p>Each named building must be completed and enabled under your command.</p><ul>{model.requirements.map(requirement=><Requirement key={requirement.role} requirement={requirement}/>)}</ul></>:<p>This building has no building prerequisite. Rig, credits, structure limits and legal placement still apply.</p>}
 <p data-build-check={model.check.state}><strong>Build check:</strong> {model.check.message}</p>
 <p>The host also checks {model.type==='barrier'?'an engineering rig or engineer':'the engineering rig'}, credits, structure and role limits, build radius, visibility, terrain and occupied space. This readout places no orders.</p>
 <h4>Technology unlocks</h4>
 <p>Reported technology: {model.technology.reported===undefined?'unavailable':'Tier '+model.technology.reported}.</p>
 <p>Tier 1 is the starting tier. Tier 2 requires completed, enabled {model.technology.tier2.map(requirement=>requirement.name).join(' + ')}. Tier 3 requires completed, enabled {model.technology.tier3.map(requirement=>requirement.name).join(' + ')}.</p>
 <ul>{model.technology.tier3.map(requirement=><Requirement key={requirement.role} requirement={requirement}/>)}</ul>
 <p data-low-power={model.lowPower===undefined?'unknown':String(model.lowPower)}>{model.lowPower?'Low power: building and production run at half speed. ':'Building and production run at half speed while power demand exceeds capacity. '}Low power does not itself remove technology. Disabling or losing the required buildings does.</p>
 <p>Unit and research technology gates remain separate from these building prerequisites.</p>
 </details></div>;
}
