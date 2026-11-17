import type {CatalogIndex} from '../../content/catalog';
import {Icon} from '../primitives';
import {shortcutBadgeLabel,shortcutLabel} from '../shortcut-presentation';
import {tipHandlers,useTrayTip} from './TrayTooltip';
import type {BattleView} from './battle-view';

const GROUPS=[1,2,3,4,5,6,7,8,9];
const CLASS_ICON:Record<string,string>={infantry:'i-infantry',vehicle:'i-tank',tank:'i-tank',aircraft:'i-aircraft',drone:'i-drone',rotor:'i-aircraft',support:'i-wrench'};
function dominantIcon(catalog:CatalogIndex,types:readonly string[]){
 const counts=new Map<string,number>();for(const type of types){const icon=catalog.units.has(type)?CLASS_ICON[catalog.unitClass(type)]??'i-tank':'i-building';counts.set(icon,(counts.get(icon)??0)+1)}
 return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]??'i-units';
}

/** Control groups 1–9 plus idle-worker chips (research rule 18). This is the
 * whole tray when nothing is selected: no instruction copy, just sockets.
 * Click recalls a group; double-click recalls and centres the camera. */
export function ControlGroupStrip({view}:{view:BattleView}){
 const {state,control,battle,snapshot,catalog,readOnly}=view,tip=useTrayTip(),bindings=state.settings.bindings.keys;
 if(!snapshot)return null;
 const own=new Map(snapshot.entities.filter(entity=>entity.owner===snapshot.player).map(entity=>[entity.id,entity]));
 const selected=new Set(battle.ids);
 const idle=(role:string)=>[...own.values()].filter(entity=>entity.complete!==false&&entity.state==='idle'&&catalog.units.get(entity.type)?.role===role).map(entity=>entity.id);
 const idleRigs=readOnly?[]:idle('rig'),idleHaulers=readOnly?[]:idle('hauler');
 const recall=(ids:number[],center:boolean)=>{if(!ids.length)return;control.select(ids);if(center){const point=control.selection.center();if(point)control.renderer?.center(point)}};
 return <div className="tray-groups" role="toolbar" aria-label="Control groups">
  <div className="tray-group-chips">{GROUPS.map(group=>{
   const ids=control.selection.group(group).filter(id=>own.has(id)),key=bindings[`group_${group}_recall`]?.[0],store=bindings[`group_${group}_store`]?.[0];
   const active=ids.length>0&&ids.length===selected.size&&ids.every(id=>selected.has(id));
   if(!ids.length)return <span key={group} className="group-chip" data-empty="" aria-hidden="true" {...tipHandlers(tip,{title:`Group ${group} · empty`,hint:store?`${shortcutLabel(store)} stores the current selection.`:'Assign a store key in Options to use this group.'})}><b>{group}</b></span>;
   return <button key={group} type="button" className={`group-chip ${active?'active':''}`} aria-label={`Control group ${group}: ${ids.length} unit${ids.length===1?'':'s'}`} aria-pressed={active} {...tipHandlers(tip,{title:`Group ${group}`,keycap:key,state:`${ids.length} assigned`,hint:'Click: select. Double-click: select and centre.'})} onClick={event=>recall(ids,event.detail>1)}>
    <b>{key?shortcutBadgeLabel(key):group}</b><Icon id={dominantIcon(catalog,ids.map(id=>own.get(id)!.type))}/><span>{ids.length}</span>
   </button>;
  })}</div>
  {(idleRigs.length>0||idleHaulers.length>0)&&<div className="tray-idle">
   {idleRigs.length>0&&<button type="button" className="idle-chip" aria-label={`Idle engineering rigs: ${idleRigs.length}. Select them.`} {...tipHandlers(tip,{title:'Idle rigs',state:`${idleRigs.length} waiting for orders`,hint:'Click to select them. Rigs build and resume structures.'})} onClick={event=>recall(idleRigs,event.detail>1)}><Icon id="i-building"/><span>{idleRigs.length}</span></button>}
   {idleHaulers.length>0&&<button type="button" className="idle-chip" aria-label={`Idle haulers: ${idleHaulers.length}. Select them.`} {...tipHandlers(tip,{title:'Idle haulers',state:`${idleHaulers.length} not gathering`,hint:'Click to select them, then right-click a supply field.'})} onClick={event=>recall(idleHaulers,event.detail>1)}><Icon id="i-hauler"/><span>{idleHaulers.length}</span></button>}
  </div>}
 </div>;
}
