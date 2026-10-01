import {useRef,type ReactNode} from 'react';
import type {ProductionTab} from '../content/catalog';
import {Icon} from './primitives';
import {PRODUCTION_TABS,productionTabId,productionPanelId,handleProductionTabKey,handleProductionPanelKey} from './production-tab-navigation';
import './production-tabs.css';

const icons:Record<ProductionTab,string>={structures:'i-building',defense:'i-shield',infantry:'i-infantry',vehicles:'i-tank',aircraft:'i-aircraft',research:'i-research'};
const labels:Record<ProductionTab,string>={structures:'Base',defense:'Def',infantry:'Inf',vehicles:'Veh',aircraft:'Air',research:'Tech'};
export function ProductionTabs({selected,available,idPrefix,onSelect}:{selected:ProductionTab;available:readonly ProductionTab[];idPrefix:string;onSelect:(category:ProductionTab)=>void}){
 const buttons=useRef(new Map<ProductionTab,HTMLButtonElement>());
 return <div className="production-tabs" role="tablist" aria-label="Production categories">{PRODUCTION_TABS.map(category=><button key={category} ref={node=>{if(node)buttons.current.set(category,node);else buttons.current.delete(category)}} id={productionTabId(idPrefix,category)} role="tab" aria-selected={selected===category} aria-controls={productionPanelId(idPrefix,category)} tabIndex={selected===category?0:-1} aria-label={category} title={category} onKeyDown={event=>handleProductionTabKey(event,category,onSelect,next=>buttons.current.get(next)?.focus())} onClick={()=>onSelect(category)} className={`${selected===category?'active':''} ${available.includes(category)?'':'empty-tab'}`}><Icon id={icons[category]}/><span className="tab-label" aria-hidden="true">{labels[category]}</span></button>)}</div>;
}
export function ProductionPanels({selected,idPrefix,hasEnabledChoices,children}:{selected:ProductionTab;idPrefix:string;hasEnabledChoices:boolean;children:ReactNode}){
 return <>{PRODUCTION_TABS.map(category=><div key={category} className={selected===category?'cameo-grid':'production-panel'} id={productionPanelId(idPrefix,category)} role="tabpanel" aria-labelledby={productionTabId(idPrefix,category)} hidden={selected!==category} style={selected===category?undefined:{display:'none'}} tabIndex={selected===category&&!hasEnabledChoices?0:undefined} onKeyDown={handleProductionPanelKey}>{selected===category?children:null}</div>)}</>;
}
