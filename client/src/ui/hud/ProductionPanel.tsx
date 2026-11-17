// Sidebar production (hud-sidebar lane, beta revamp). From top to bottom:
//  - category tabs, with hotkey pips, counts and idle dots
//  - producer strip: facility picker, previous/next, status chip, centre
//  - opening-objective hint
//  - illustrated cameo grid that takes the remaining height
//  - queue strip: producer jobs, or foundations under construction on the BASE/DEF tabs
// Prerequisites, counters and lock reasons live in the rich tooltip.
import {useEffect,useRef,useState,type CSSProperties,type HTMLAttributes,type ReactNode} from 'react';
import {credits} from '../../content/labels';
import {tabFor,type ProductionTab} from '../../content/catalog';
import {productionCategories} from '../../app/production-focus';
import {useObservable} from '../../app/store';
import {ProductionTabs,ProductionPanels,PRODUCTION_TAB_TITLES} from '../ProductionTabs';
import {PRODUCTION_TABS} from '../production-tab-navigation';
import {Icon,Cameo} from '../primitives';
import {upgradeIcon} from '../../content/icons';
import type {BattleView} from './battle-view';
import {CameoTipBody,KeyTipBody} from './CameoTooltip';
import {cameoStamp,cameoTip,constructionSites,nearestRig,tabBadges,productionTabShortcut,slotBindingId,type CameoState,type ConstructionSite} from './sidebar-model';
import {shortcutAriaList,shortcutBadgeLabel} from '../shortcut-presentation';

type TipTrigger=(id:string,content:()=>ReactNode)=>Partial<HTMLAttributes<HTMLElement>>;

/** Display Go's fixed-point cancellation rule against this disclosed job. */
type RefundJob={started:boolean;paid:bigint;work:number;required:number};
export function cancellationRefund(job:RefundJob){return job.started&&job.required>0?job.paid*3n*BigInt(Math.max(0,job.required-job.work))/(4n*BigInt(job.required)):0n}
export function cancellationHint(job:RefundJob){return `Click to cancel — refunds 75% of the unbuilt part (currently ${credits(cancellationRefund(job))} credits).`}
/** The tooltip stays subscribed while open; a hovered job keeps progressing. */
export function QueueJobTip({app,producer,index,type,readOnly}:{app:BattleView['app'];producer:number;index:number;type:string;readOnly:boolean}){
 const state=useObservable(app.state),job=state.snapshot?.entities.find(entity=>entity.id===producer&&entity.owner===state.snapshot?.player)?.private?.jobs[index];
 return <KeyTipBody title={state.catalog?.name(type)??type} line={job?.type===type?job.started?`${Math.floor(job.work/Math.max(1,job.required)*100)}% · ${credits(job.paid)} paid`:'Waiting to start':'This queue item is no longer present.'} blocked={readOnly||job?.type!==type?undefined:cancellationHint(job)}/>;
}

export function ProductionPanel({view,tip}:{view:BattleView;tip:TipTrigger}){
 const {state,control,battle,tab,productionId,snapshot,catalog,faction,teamColor,readOnly,sources,producer,choices,availableTabs,chooseProductionTab,openingObjective}=view;
 const sites=constructionSites(snapshot,catalog,battle.hudAffordances),body=useRef<HTMLDivElement>(null),capacity=useGridCapacity(body);
 const categories=(entity:Parameters<typeof productionCategories>[0])=>productionCategories(entity,catalog,faction);
 const badges=tabBadges(snapshot,catalog,sources,categories,sites);
 const tabSources=sources.filter(entity=>categories(entity).includes(tab));
 const pickable=tabSources.length?tabSources:sources;
 const cycleProducer=(step:1|-1)=>{if(!pickable.length)return;const index=Math.max(0,pickable.findIndex(entity=>entity.id===producer?.id));control.chooseProduction(pickable[(index+step+pickable.length)%pickable.length]!.id)};
 const keys=state.settings.bindings.keys as Record<string,typeof state.settings.bindings.keys[string]>;
 // Keycaps come from bindings. Until the tab actions land, the local Alt+n adapter is shown in the tooltip only.
 const tabKeys=Object.fromEntries(PRODUCTION_TABS.map((category,index)=>{const chords=productionTabShortcut(keys,category,index);return [category,{badge:chords.length?shortcutBadgeLabel(chords[0]):'',aria:shortcutAriaList(chords)??''}]})) as Record<ProductionTab,{badge:string;aria:string}>;
 const hotkeys=tabKeys;
 const slotKey=(index:number)=>{const id=slotBindingId(keys,index+1),chord=id?keys[id]?.[0]:undefined;return chord?{badge:shortcutBadgeLabel(chord),aria:shortcutAriaList(keys[id!])}:undefined};
 const status=readOnly?'VIEW ONLY':producer?.enabled===false?'OFFLINE':producer&&!producer.complete?'BUILDING':battle.pending?'ORDER…':producer?undefined:'NO FACILITY';
 const sameType=(id:number,type:string)=>{const peers=sources.filter(source=>source.type===type);return peers.length>1?` ${peers.findIndex(source=>source.id===id)+1}`:''};
 const objective=openingObjective&&!readOnly?openingObjective:undefined;
 const jobsFor=(type:string)=>producer?.private?.jobs.filter(job=>job.type===type)??[];
 const tabSites=sites.filter(site=>site.tab===tab);
 const missingProducer=!availableTabs.includes(tab)?producerNames(catalog,faction,tab):undefined;
 return <>
 <ProductionTabs selected={tab} available={availableTabs} idPrefix={productionId} onSelect={chooseProductionTab} badges={badges} hotkeys={hotkeys} tip={category=>tip(`tab-${category}`,()=><KeyTipBody title={PRODUCTION_TAB_TITLES[category]} hotkey={tabKeys[category].badge||'Unbound'} line={badges[category].count?`${badges[category].count} in production.`:badges[category].idle?'A facility here is idle.':availableTabs.includes(category)?undefined:`Needs ${producerNames(catalog,faction,category)??'a facility'}.`}/>)}/>
 <div className="production-source" data-hud="producer">
  <button type="button" className="hud-step" aria-label="Previous facility" aria-keyshortcuts={shortcutAriaList(keys.previous_producer)} disabled={pickable.length<2} onClick={()=>cycleProducer(-1)}><Icon id="i-chevron-left"/></button>
  <select aria-label="Production facility" value={producer?.id??''} disabled={!sources.length} onChange={event=>control.chooseProduction(Number(event.target.value))}>{!sources.length&&<option value="">No production facility</option>}{sources.map(entity=><option key={entity.id} value={entity.id}>{catalog.name(entity.type)}{sameType(entity.id,entity.type)}{!entity.complete?' · constructing':!entity.enabled?' · offline':''}</option>)}</select>
  {tabSources.length>1&&<span className="hud-producer-count" aria-hidden="true">{Math.max(1,pickable.findIndex(entity=>entity.id===producer?.id)+1)}/{pickable.length}</span>}
  <span className="production-heading" data-status={status??'ready'}>{status??''}</span>
  <button type="button" className="hud-step" aria-label="Select production facility" disabled={!producer} {...tip('producer-centre',()=><KeyTipBody title="Show facility" line="Select and centre on this facility."/>)} onClick={()=>{if(producer){control.select([producer.id]);if(producer.position)control.renderer?.center(producer.position)}}}><Icon id="i-eye"/></button>
  <button type="button" className="hud-step" aria-label="Next facility" aria-keyshortcuts={shortcutAriaList(keys.cycle_producer)} disabled={pickable.length<2} onClick={()=>cycleProducer(1)}><Icon id="i-chevron-right"/></button>
 </div>
 {objective&&<div className="hud-objective" data-hud="objective"><button type="button" className="hud-objective-go" onClick={()=>{if(objective.type&&tabFor(catalog,objective.type)!==tab)chooseProductionTab(tabFor(catalog,objective.type))}}><small>NEXT</small><strong>{objective.title}</strong></button><button type="button" className="hud-objective-close" aria-label={`Dismiss hint: ${objective.title}`} onClick={()=>control.dismissOpeningObjective(objective.id)}><Icon id="i-close"/></button></div>}
 <div className="production-body" ref={body}>
  <ProductionPanels selected={tab} idPrefix={productionId} hasEnabledChoices={choices.some(choice=>choice.available&&!battle.pending)}>{choices.length?choices.map((choice,slot)=>{
   const jobs=jobsFor(choice.type),active=jobs.find(job=>job.started),typeSites=choice.kind==='build'?sites.filter(site=>site.type===choice.type):[];
   const progress=active?active.work/Math.max(1,active.required):typeSites[0]?typeSites[0].progress/1000:undefined;
   const count=jobs.length+typeSites.length;
   const tag=cameoStamp(choice),blockedWait=choice.available&&!!tag&&!['QUEUED','WAIT'].includes(tag);
   const state:CameoState=!choice.available?(tag&&['LIMIT','MAX 1','FULL','SUPPLY','DONE'].includes(tag)?'limit':'locked'):blockedWait?'waiting':progress!==undefined?'building':count?'queued':'ready';
   const stamp=state==='locked'||state==='limit'||state==='waiting'?tag:undefined;
   const clickable=choice.available&&!battle.pending&&!readOnly;
   const name=catalog.name(choice.type),key=choice.kind+choice.type,descId=`${productionId}-${choice.type}-d`;
   const cancelLast=()=>{if(!producer||readOnly||battle.pending)return;const index=producer.private?.jobs.map(job=>job.type).lastIndexOf(choice.type)??-1;if(index>=0)void control.execute({kind:'cancel',entities:[producer.id],index})};
   const fkey=slotKey(slot),trig=tip(`cameo-${key}`,()=><CameoTipBody tip={cameoTip(snapshot,catalog,choice,count,progress)} hotkey={fkey?.badge}/>);
   return <button key={key} type="button" className="production-cameo" data-hud="cameo" data-state={state} data-kind={choice.kind} data-objective={objective?.type===choice.type||undefined} aria-label={name} aria-keyshortcuts={clickable?fkey?.aria:undefined} aria-disabled={!clickable||undefined} {...trig} aria-describedby={[descId,trig['aria-describedby']].filter(Boolean).join(' ')} style={progress!==undefined?{'--p':progress} as CSSProperties:undefined} onClick={event=>{if(!clickable)return;if(event.shiftKey&&choice.kind==='train')void control.cameo(slot+1,'batch');else void control.command(choice.kind,choice.type,choice.producer)}} onContextMenu={event=>{event.preventDefault();if(choice.kind!=='build')cancelLast()}}>
    {choice.kind==='research'?<span className="cameo-unavailable cameo-research"><Icon id={upgradeIcon(choice.type)}/></span>:<Cameo type={choice.type} faction={faction} catalog={catalog} color={teamColor} purpose="build"/>}
    {progress!==undefined&&<i className="cameo-progress" aria-hidden="true"/>}
    <span className="cameo-price" aria-hidden="true">{credits(catalog.cost(choice.type)??0)}</span>
    {count>0&&<span className="cameo-queue" aria-hidden="true">{count}</span>}
    {progress!==undefined&&!stamp&&<span className="cameo-pct" aria-hidden="true">{Math.floor(progress*100)}%</span>}
    {stamp&&<span className="disabled-reason" data-tag={stamp}>{state!=='waiting'&&<Icon id="i-lock"/>}<span className="reason-text">{choice.reason??`Wait: ${choice.waitsFor}`}</span></span>}
    <span className="cameo-name">{name}</span>
    {fkey&&<kbd className="cameo-key" aria-hidden="true">{fkey.badge}</kbd>}
    <span id={descId} className="hud-sr">{credits(catalog.cost(choice.type)??0)} credits{count?`, ${count} in production`:''}{progress!==undefined?`, ${Math.floor(progress*100)}%`:''}{choice.reason?`. ${choice.reason}`:choice.waitsFor?`. Queue waits: ${choice.waitsFor}`:''}</span>
   </button>}).concat(Array.from({length:Math.max(0,capacity-choices.length)},(_,index)=><span key={`socket-${index}`} className="cameo-socket" aria-hidden="true"/>)):<div className="production-empty" role="note">{readOnly?<p>Select a facility to inspect its recorded queue.</p>:!sources.length?<p>No production facility. Protect your Engineering rig and HQ.</p>:missingProducer?<><Icon id="i-lock"/><p><strong>Needs {missingProducer}</strong><br/>Build it from the BASE tab.</p><button type="button" onClick={()=>chooseProductionTab('structures')}>Open BASE</button></>:<p>Nothing to build here right now.</p>}</div>}</ProductionPanels>
 </div>
 <QueueStrip view={view} sites={tab==='structures'||tab==='defense'?tabSites.length?tabSites:sites:[]} tip={tip}/>
 </>;
}

/** Producer jobs for the active facility, or foundations under construction on the BASE/DEF tabs. Six fixed sockets. Click a job to cancel it; click a foundation to centre on it, and send the nearest rig if it has stalled. */
function QueueStrip({view,sites,tip}:{view:BattleView;sites:ConstructionSite[];tip:TipTrigger}){
 const {app,control,battle,snapshot,catalog,faction,teamColor,readOnly,producer}=view;
 const jobs=producer?.private?.jobs??[],construction=!jobs.length&&sites.length>0;
 const slots=Math.max(6,construction?Math.min(sites.length,6):jobs.length);
 return <section className="production-queue" data-hud="queue" data-mode={construction?'construction':'jobs'} aria-label="Production queue">
  <h3 className="hud-sr">{construction?'Construction':'Production queue'} {construction?sites.length:jobs.length}/6</h3>
  <div className="queue-items">
   {construction?sites.slice(0,6).map(site=>{const rig=site.stalled?nearestRig(snapshot,catalog,site.position):undefined;return <button key={site.id} type="button" data-stalled={site.stalled||undefined} data-norig={site.noRig||undefined} style={{'--p':site.progress/1000} as CSSProperties} {...tip(`site-${site.id}`,()=><KeyTipBody title={site.name} line={`Under construction · ${Math.floor(site.progress/10)}%`} blocked={site.noRig?(rig?'No rig is building it. Click to send the nearest rig.':'No rig is building it. Train an Engineering rig at your HQ.'):site.stalled?'Construction paused: check credits and power.':undefined}/>)} onClick={()=>{if(site.position)control.renderer?.center(site.position);if(site.noRig&&rig&&!readOnly&&!battle.pending){control.select([rig.id]);void control.execute({kind:'resume',entities:[rig.id],target:{kind:'entity',id:site.id}})}}}>
    <Cameo type={site.type} faction={faction} catalog={catalog} color={teamColor} purpose="build"/><i aria-hidden="true"/><span className="hud-sr">{site.name}</span><small>{site.noRig?'NO RIG':site.stalled?'PAUSED':`${Math.floor(site.progress/10)}%`}</small></button>}):jobs.map((job,index)=><button key={`${job.type}-${index}`} type="button" data-started={job.started||undefined} style={{'--p':job.work/Math.max(1,job.required)} as CSSProperties} disabled={readOnly||battle.pending} {...tip(`job-${index}-${job.type}`,()=><QueueJobTip app={app} producer={producer!.id} index={index} type={job.type} readOnly={readOnly}/>)} onClick={()=>{if(producer)void control.execute({kind:'cancel',entities:[producer.id],index})}}>
    <Cameo type={job.type} faction={faction} catalog={catalog} color={teamColor} purpose="build"/><i aria-hidden="true"/><span className="hud-sr">{catalog.name(job.type)}</span><small>{job.started?`${Math.floor(job.work/Math.max(1,job.required)*100)}%`:'WAIT'}</small></button>)}
   {Array.from({length:Math.max(0,slots-(construction?Math.min(sites.length,6):jobs.length))},(_,index)=><span key={`empty-${index}`} className="queue-socket" aria-hidden="true"/>)}
  </div>
 </section>;
}

/** How many 4:3 tiles fit in the visible grid without scrolling, so empty sockets complete the C&C slot grid. */
function useGridCapacity(body:{current:HTMLDivElement|null}){
 const [capacity,setCapacity]=useState(0);
 useEffect(()=>{const node=body.current;if(!node)return;let frame=0;
  const measure=()=>{frame=0;const grid=node.querySelector<HTMLElement>('.cameo-grid');if(!grid)return;const style=getComputedStyle(grid),gap=parseFloat(style.rowGap)||0,padX=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),padY=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
   const columns=style.gridTemplateColumns.split(' ').filter(Boolean).length||3,tile=(grid.clientWidth-padX-gap*(columns-1))/columns*.75;if(!(tile>0))return;
   const rows=Math.max(0,Math.floor((node.clientHeight-padY+gap)/(tile+gap)));setCapacity(rows*columns)};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure)};const observer=new ResizeObserver(schedule);observer.observe(node);schedule();
  return()=>{cancelAnimationFrame(frame);observer.disconnect()}},[body]);
 return capacity;
}
/** Names of the structures that produce a category for this faction, for the empty-tab hint. */
function producerNames(catalog:BattleView['catalog'],faction:string,tab:ProductionTab):string|undefined{
 if(tab==='structures'||tab==='defense')return 'an Engineering rig';
 const roles=new Set<string>();
 for(const unit of catalog.units.values())if(unit.faction===faction&&tabFor(catalog,unit.id)===tab&&unit.role!=='rig')roles.add(unit.producer);
 for(const upgrade of catalog.upgrades.values())if((!upgrade.faction||upgrade.faction===faction)&&tab==='research')roles.add(upgrade.producer);
 const names=[...roles].map(role=>[...catalog.buildings.values()].find(building=>building.role===role&&(building.faction===faction||!building.faction))?.name).filter((name):name is string=>!!name);
 return names.length?[...new Set(names)].slice(0,2).join(' or '):undefined;
}
