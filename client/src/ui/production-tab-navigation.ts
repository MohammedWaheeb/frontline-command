import type {ProductionTab} from '../content/catalog';

export const PRODUCTION_TABS:readonly ProductionTab[]=['structures','defense','infantry','vehicles','aircraft','research'];
export const productionTabId=(prefix:string,category:ProductionTab)=>`${prefix}-tab-${category}`;
export const productionPanelId=(prefix:string,category:ProductionTab)=>`${prefix}-panel-${category}`;
export function productionTabDestination(current:ProductionTab,key:string):ProductionTab|undefined{
 const index=PRODUCTION_TABS.indexOf(current);
 if(key==='Home')return PRODUCTION_TABS[0];
 if(key==='End')return PRODUCTION_TABS[PRODUCTION_TABS.length-1];
 if(key==='ArrowLeft')return PRODUCTION_TABS[(index+PRODUCTION_TABS.length-1)%PRODUCTION_TABS.length];
 if(key==='ArrowRight')return PRODUCTION_TABS[(index+1)%PRODUCTION_TABS.length];
 return undefined;
}
interface NavigationEvent{key:string;isComposing?:boolean;altKey?:boolean;ctrlKey?:boolean;metaKey?:boolean;preventDefault():void;stopPropagation():void}
/** Tab/vertical keys keep native focus/scroll defaults; game camera sees none. */
export function handleProductionTabKey(event:NavigationEvent,current:ProductionTab,select:(category:ProductionTab)=>void,focus:(category:ProductionTab)=>void){
 if(event.isComposing)return;
 if(!['Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
 event.stopPropagation();
 if(event.altKey||event.ctrlKey||event.metaKey)return;
 const next=productionTabDestination(current,event.key);if(!next)return;
 event.preventDefault();select(next);focus(next);
}
/** Panel arrows and Tab belong to its native scroll/focus sequence. */
export function handleProductionPanelKey(event:NavigationEvent){
 if(!event.isComposing&&['Tab','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))event.stopPropagation();
}
