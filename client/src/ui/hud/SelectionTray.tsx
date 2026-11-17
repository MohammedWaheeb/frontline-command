import {useState,type CSSProperties,type ReactNode} from 'react';
import {RANGE_MODES} from '../../render/range-geometry';
import {ActorStatusDetails} from '../ActorStatusDetails';
import {TeamSlotPreview} from '../TeamPreview';
import {HaulerControls} from '../HaulerControls';
import {credits,formatClock} from '../../content/labels';
import {unitGuidance} from '../../content/unit-guidance';
import {shahedSelectionTelemetry} from '../../render/shahed-presentation';
import {selectionPortraitColor} from '../team-color-presentation';
import {Cameo} from '../primitives';
import {ControlGroupStrip} from './ControlGroupStrip';
import {TrayTooltipLayer,tipHandlers,useTrayTip} from './TrayTooltip';
import type {BattleView} from './battle-view';
import '../../styles/hud-tray.css';

type Entity=NonNullable<BattleView['first']>;
const firstSentence=(text:string)=>text.split(/(?<=\.)\s/)[0];
const hpText=(entity:Entity)=>entity.private?`${Math.round(Number(entity.private.hp)/1000).toLocaleString('en-US')} / ${Math.round(Number(entity.private.maxHp)/1000).toLocaleString('en-US')}`:`${Math.round(entity.health/10)}%`;
const healthBand=(health:number)=>health>600?'high':health>300?'mid':'low';

/** Compact selection tray flush against the sidebar (design-audit-hud §2.6).
 * Nothing selected → only the control-group strip. One actor → portrait and a
 * stats block. Several → type stacks with counts. The command card is passed
 * as children and sits at the right edge of the tray. */
export function SelectionTray({view,children}:{view:BattleView;children?:ReactNode}){
 const {selected,first,replay}=view,[frame,setFrame]=useState<HTMLElement|null>(null);
 const mode=!first?'empty':selected.length===1?'single':'multi';
 return <section ref={setFrame} className="selection-tray hud-tray console" aria-label="Selection" data-hud="tray" data-mode={mode} data-replay={replay||undefined}>
  <TrayTooltipLayer frame={frame}>
   <ControlGroupStrip view={view}/>
   <div className="tray-body">
    <div className="selection-overview">{mode==='single'?<SingleSelection view={view}/>:mode==='multi'?<MultiSelection view={view}/>:null}</div>
    {children}
   </div>
  </TrayTooltipLayer>
 </section>;
}

function SingleSelection({view}:{view:BattleView}){
 const {state,rangeMode,setRangeMode,control,battle,snapshot,catalog,first,selectedPortrait,readOnly}=view,tip=useTrayTip();
 const entity=first!,name=catalog.name(entity.type),own=entity.owner===snapshot?.player,guide=unitGuidance(catalog,entity.type),building=catalog.buildings.get(entity.type);
 const job=entity.private?.jobs[0],jobPct=job&&job.required?Math.min(100,Math.floor(job.work*100/job.required)):undefined;
 const telemetry=shahedSelectionTelemetry(entity.type)??(entity.private?(['aircraft','drone','rotor'].includes(catalog.unitClass(entity.type))?`Ammo ${entity.private.ammo} · Endurance ${formatClock(entity.private.endurance)} · Home ${entity.private.home||'LOST'}`:entity.private.cargo>0n?`Cargo ${credits(entity.private.cargo)}`:entity.private.charges>0?`Charges ${entity.private.charges}`:'')+(entity.private.passengers.length?` · ${entity.private.passengers.length} aboard`:'')+(entity.private.container?` · Transit ${entity.private.container}`:''):'');
 const line=!entity.complete&&building?`Under construction · ${Math.floor(entity.progress/10)}%`:job?`Producing ${catalog.name(job.type)}${jobPct!==undefined?` · ${jobPct}%`:''}`:guide?firstSentence(guide.role):building?.role?building.role.replaceAll('_',' '):undefined;
 return <>
  <div className="tray-portrait" data-relation={own?'own':'other'} style={{'--portrait-rim':selectedPortrait!.color} as CSSProperties}>
   <Cameo type={selectedPortrait!.type} faction={selectedPortrait!.faction} catalog={catalog} color={selectedPortrait!.color}/>
   {entity.rank>0&&<span className="rank-chevrons" aria-label={`Rank ${entity.rank}`}>{Array.from({length:Math.min(entity.rank,3)},(_,index)=><i key={index}/>)}</span>}
  </div>
  <div className="selection-details" tabIndex={0} role="region" aria-label="Selected forces details">
   <h2 title={name}>{name}</h2>
   <div className="tray-health" data-band={healthBand(entity.health)}>
    <div className="health-track" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(entity.health/10)}><i style={{width:`${entity.health/10}%`}}/></div>
    <small className="tray-hp">{hpText(entity)}</small>
   </div>
   <div className="tray-status-row">
    <ActorStatusDetails key={`${snapshot!.player}:${entity.id}`} entity={entity} snapshot={snapshot!} catalog={catalog}/>
    <button className="range-mode" data-mode={rangeMode} aria-label={`Range overlay: ${rangeMode}. Cycle weapon, sight, detection, off.`} {...tipHandlers(tip,{title:'Range overlay',state:`Showing: ${rangeMode}`,hint:'Cycle weapon reach, sight and detection rings.',detail:['Weapon reach is a reference to a point target; terrain, ammo and stance still matter.']})} onClick={()=>setRangeMode(RANGE_MODES[(RANGE_MODES.indexOf(rangeMode)+1)%RANGE_MODES.length])}>Range: {rangeMode}</button>
    {own&&!readOnly&&<HaulerControls snapshot={snapshot} catalog={catalog} ids={battle.ids} advice={battle.affordances} disabled={readOnly||battle.pending||!!snapshot?.countdown} onConfigure={(ids,action)=>void control.configureHaulers(ids,action)}/>}
   </div>
   {line&&<p className="tray-role" {...tipHandlers(tip,{title:name,hint:guide?.role,detail:guide?[`Targets: ${guide.targets}`,`Countered by: ${guide.counters}`]:undefined})}>{line}</p>}
   {telemetry&&<small className="unit-telemetry">{telemetry}</small>}
   {!own&&<TeamSlotPreview owner={entity.owner} players={snapshot?.players??[]} viewer={snapshot?.player} palette={state.settings.palette}/>}
  </div>
 </>;
}

function MultiSelection({view}:{view:BattleView}){
 const {state,control,battle,snapshot,catalog,selected,readOnly}=view,tip=useTrayTip();
 const groups=control.selection.subgroups(),byId=new Map(selected.map(entity=>[entity.id,entity]));
 const total=selected.length,damaged=selected.filter(entity=>entity.health<1000).length,avg=Math.round(selected.reduce((sum,entity)=>sum+entity.health,0)/Math.max(1,total)/10);
 const players=snapshot?.players??[],palette=state.settings.palette;
 return <>
  <div className="tray-multi-head">
   <h2>{`${total} units selected`}</h2>
   <span className="tray-multi-health" data-band={healthBand(avg*10)} aria-label={`Average health ${avg}%`}><i style={{width:`${avg}%`}}/></span>
   <small>{damaged?`${damaged} damaged`:'All healthy'}</small>
   {!readOnly&&<HaulerControls snapshot={snapshot} catalog={catalog} ids={battle.ids} advice={battle.affordances} disabled={readOnly||battle.pending||!!snapshot?.countdown} onConfigure={(ids,action)=>void control.configureHaulers(ids,action)}/>}
  </div>
  <div className="unit-subgroups" role="group" aria-label="Selected unit types">
   {groups.map(group=>{
    const members=group.ids.map(id=>byId.get(id)).filter((value):value is Entity=>!!value),lead=members[0],health=Math.round(members.reduce((sum,entity)=>sum+entity.health,0)/Math.max(1,members.length)/10),portrait=lead?selectionPortraitColor(lead,players,palette):undefined,name=catalog.name(group.type);
    return <button key={group.type} type="button" className="tray-stack" data-band={healthBand(health*10)} aria-label={`${name}: ${group.ids.length}. Select only these.`} {...tipHandlers(tip,{title:name,state:`${group.ids.length} selected · ${health}% average health`,hint:'Click: select only this type.',detail:['Tab cycles through types.']})} onClick={()=>control.select(group.ids)}>
     {portrait&&<Cameo type={portrait.type} faction={portrait.faction} catalog={catalog} color={portrait.color}/>}
     <span className="stack-name">{name}</span>
     <b className="stack-count">{group.ids.length}</b>
     <i className="stack-health" style={{width:`${health}%`}}/>
    </button>;
   })}
  </div>
 </>;
}
