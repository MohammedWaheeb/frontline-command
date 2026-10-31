// Right command sidebar (hud-sidebar lane, beta revamp). From top to bottom:
//  - header plate: emblem, credits plus income, clock, pause gear
//  - status strip: the single power readout, supply, Command Energy, tier
//  - minimap well
//  - utility row: Build, HQ, Repair, Sell, Rally, Beacon
//  - production: tabs, producer strip, cameo grid, queue strip
//  - strategic pip, only once a site exists
// Explanations live in styled tooltips. The economy policy lives in a popover.
import {useEffect,useId,useRef,useState} from 'react';
import {minimapCursorMove,minimapLayout,minimapProject} from '../../render/minimap';
import type {Point} from '../../runtime';
import {BattlefieldStatus} from '../BattlefieldStatus';
import {battlefieldStatus} from '../../app/session-presentation';
import {STRATEGIC,COMMANDS,credits,formatClock} from '../../content/labels';
import {Icon,Emblem} from '../primitives';
import {shortcutAriaList,shortcutBadgeLabel} from '../shortcut-presentation';
import type {BattleView} from './battle-view';
import {ProductionPanel} from './ProductionPanel';
import {EconomyPopover} from './EconomyPopover';
import {useSidebarTooltip,SidebarTooltip,KeyTipBody} from './CameoTooltip';
import {powerReadout} from './sidebar-model';

function BuildGlyph(){return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V9l3-2v14M8 7l11 3M8 7l3-4h2l6 7M19 10v4M17 14h4l-1 3h-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/></svg>}

type UtilityKind='repair_mode'|'sell_mode'|'power_mode'|'rally'|'ping';
const UTILITY:Record<UtilityKind,{label:string;icon:string;line:string;needs:string}>={
 repair_mode:{label:'Repair',icon:'i-wrench',line:'Repair mode: click your damaged structures to repair them. Right-click or Esc to stop.',needs:'Not available right now.'},
 sell_mode:{label:'Sell',icon:'i-sell',line:'Sell mode: click one of your structures to sell it. The refund scales with health. Right-click or Esc to stop.',needs:'Not available right now.'},
 power_mode:{label:'Power',icon:'i-toggle-power',line:'Power mode: click your structures to switch them off or on and free up power.',needs:'Not available right now.'},
 rally:{label:'Rally',icon:'i-rally',line:'Set where new units from the selected facility gather.',needs:'Select a production structure first.'},
 ping:{label:'Beacon',icon:'i-signal',line:'Mark a map point for your team.',needs:'Beacons are available in team multiplayer.'},
};

export function CommandSidebar({view}:{view:BattleView}){
 const {app,state,setPractice,control,battle,snapshot,economy,catalog,player,faction,openPause,readOnly,commandKinds,economyStatus,sceneLoading}=view;
 const tipId=useId(),{tip,trigger,hide}=useSidebarTooltip(tipId),[economyOpen,setEconomyOpen]=useState(false);
 const creditsTrigger=useRef<HTMLButtonElement>(null),closeEconomy=()=>{setEconomyOpen(false);creditsTrigger.current?.focus()};
 // Owner HUD advice (integration lane): supply cap and the sell refund estimate; absent advice = unknown.
 const hud=battle.hudAffordances&&battle.hudAffordances.player===snapshot?.player?battle.hudAffordances:undefined,supplyCap=hud?.economy?.supply_cap;
 const refundIds=battle.ids.length===1?battle.ids:[],refundMilli=refundIds.length?hud?.entities.find(value=>value.id===refundIds[0])?.sell_refund:undefined;
 const sellLine=refundMilli!==undefined?` Selected structure refund now: ${Math.floor(refundMilli/1000).toLocaleString('en-US')} credits.`:'';
 const bindings=state.settings.bindings.keys,badge=(id:string)=>{const chord=bindings[id]?.[0];return chord?shortcutBadgeLabel(chord):undefined};
 const power=powerReadout(economy?.powerDemand,economy?.powerCapacity);
 const status=battlefieldStatus({kind:state.session.kind,paused:state.paused,snapshot});
 const showStatus=!sceneLoading&&!(status.label==='LIVE'&&['solo','practice'].includes(state.session.kind??''));
 const income=economyStatus?.incomeState==='ready'&&economyStatus.incomePerMinute!==undefined?economyStatus.incomePerMinute:undefined;
 const reserve=economy?.repairReserve??0n;
 const strategic=player&&(player.strategicProgress??-1)>=0?Math.floor(Math.min(1000,player.strategicProgress)/10):undefined;
 const selectRig=()=>{const rig=snapshot?.entities.find(entity=>entity.owner===snapshot.player&&catalog.units.get(entity.type)?.role==='rig');if(rig)control.select([rig.id]);else app.patch({notice:'No available engineering rig.'})};
 const selectHQ=()=>{const hq=snapshot?.entities.find(entity=>entity.owner===snapshot.player&&catalog.buildings.get(entity.type)?.role==='hq');if(hq){control.select([hq.id]);if(hq.position)control.renderer?.center(hq.position)}};
 const playerCommands=battle.affordances?.player_commands??[];
 const utilityReady=(kind:UtilityKind)=>!readOnly&&!battle.pending&&!snapshot?.countdown&&(kind.endsWith('_mode')?true:kind==='ping'?playerCommands.includes('ping'):commandKinds.includes(kind));
 const armed=battle.utilityMode?`${battle.utilityMode}_mode`:battle.target?.kind;
 return <aside className="command-sidebar console" data-faction={faction} data-hud="sidebar" aria-label="Command sidebar">
 <header className="sidebar-identity" data-hud="header">
  <div className="sidebar-resources">
   <Emblem faction={faction}/>
   <button type="button" className="hud-credits" ref={creditsTrigger} aria-expanded={economyOpen} aria-label={`Credits ${credits(economy?.credits??0n)}${income!==undefined?`, income ${credits(income)} per minute`:''}. Open economy panel`} {...trigger('credits',()=><KeyTipBody title="Credits" line={income!==undefined?`Income over the last minute: +${credits(income)} per minute.`:'Income appears after your haulers have delivered for a minute.'} blocked={reserve>0n?`Repair reserve: ${credits(reserve)} kept for other orders.`:undefined}/>)} onClick={()=>{hide();setEconomyOpen(open=>!open)}}>
    <b className="hud-credits-value">{credits(economy?.credits??0n)}</b>
    <span className="hud-credits-sub">{income!==undefined?<small className="hud-income" data-zero={income===0n||undefined}>+{credits(income)}/min</small>:null}{reserve>0n&&<small className="hud-reserve">R {credits(reserve)}</small>}</span>
   </button>
   <span className="hud-clock" role="timer" aria-label={`Operation time ${formatClock(snapshot?.tick??0)}`}>{formatClock(snapshot?.tick??0)}</span>
   <button type="button" className="hud-gear" onClick={openPause} aria-label="Open pause menu" aria-keyshortcuts={shortcutAriaList(bindings.escape)} {...trigger('pause',()=><KeyTipBody title="Pause menu" hotkey={badge('escape')} line="Save, options, speed and surrender."/>)}><Icon id="i-menu"/></button>
  </div>
  <div className="hud-status" data-hud="power">
   <span className="hud-power" data-state={power.state} role="img" aria-label={power.label} {...trigger('power',()=><KeyTipBody title="Power" line={power.label}/>)} tabIndex={0}><Icon id="i-power"/><span className="hud-meter" aria-hidden="true"><i style={{width:`${power.fill*100}%`}}/></span><b>{power.demand}</b><small>/{power.capacity}</small></span>
   <span className="hud-stat" role="img" aria-label={`Supply ${economy?.supply??0}${supplyCap!==undefined?` of ${supplyCap}`:''} used, ${economy?.reservedSupply??0} reserved`} {...trigger('supply',()=><KeyTipBody title="Supply" line={`${economy?.supply??0}${supplyCap!==undefined?` of ${supplyCap}`:''} used by your forces${economy?.reservedSupply?`, ${economy.reservedSupply} reserved by queued units`:''}.`}/>)} tabIndex={0}><Icon id="i-users"/><b>{economy?.supply??0}</b>{supplyCap!==undefined&&<small>/{supplyCap}</small>}{(economy?.reservedSupply??0)>0&&<small>+{economy?.reservedSupply}</small>}</span>
   <span className="hud-stat hud-energy" role="img" aria-label={`Command Energy ${credits(economy?.energy??0n)}`} {...trigger('energy',()=><KeyTipBody title="Command Energy" line="Spent on faction command abilities. Regenerates from your HQ."/>)} tabIndex={0}><Icon id="i-energy"/><b>{credits(economy?.energy??0n)}</b></span>
   <span className="hud-stat hud-tier" role="img" aria-label={`Technology tier ${economy?.tier??1}`} {...trigger('tier',()=><KeyTipBody title={`Tier ${economy?.tier??1}`} line="Radar center unlocks tier 2; Technology center unlocks tier 3."/>)} tabIndex={0}><small>T</small><b>{economy?.tier??1}</b></span>
  </div>
  {showStatus&&<BattlefieldStatus kind={state.session.kind} paused={state.paused} snapshot={snapshot}/>}
 </header>
 <TacticalMinimap view={view}/>
 <div className="sidebar-utilities" data-hud="utility">
  <button type="button" className="hud-key" aria-label="Build" onClick={selectRig} {...trigger('build',()=><KeyTipBody title="Build" hotkey={badge('build')} line="Select an Engineering rig and open its structures."/>)}><BuildGlyph/></button>
  <button type="button" className="hud-key" aria-label="HQ" aria-keyshortcuts={shortcutAriaList(bindings.select_hq)} onClick={selectHQ} {...trigger('hq',()=><KeyTipBody title="Headquarters" hotkey={badge('select_hq')} line={`Select and centre on your HQ.${badge('center_base')?` ${badge('center_base')} cycles the camera between your bases.`:''}`}/>)}><Emblem faction={faction}/></button>
  <span className="hud-key-gap" aria-hidden="true"/>
  {(Object.keys(UTILITY) as UtilityKind[]).map(kind=>{const info=UTILITY[kind],ready=utilityReady(kind),key=badge(kind),active=armed===kind;return <button key={kind} type="button" className={`hud-key${active?' active':''}`} data-utility={kind} aria-label={info.label} aria-disabled={!ready||undefined} aria-pressed={active} aria-keyshortcuts={ready?shortcutAriaList(bindings[kind]):undefined} {...trigger(`utility-${kind}`,()=><KeyTipBody title={info.label} hotkey={key} line={kind==='sell_mode'?info.line+sellLine:info.line} blocked={ready?undefined:readOnly?'Not available while viewing.':info.needs}/>)} onClick={()=>{if(ready)void control.command(kind)}}><Icon id={COMMANDS[kind]?.icon??info.icon}/>{key&&<kbd aria-hidden="true">{key}</kbd>}</button>})}
 </div>
 {state.session.kind==='practice'&&<button type="button" className="practice-tool-button" onClick={()=>setPractice(true)}>Practice tools · no rewards</button>}
 <ProductionPanel view={view} tip={trigger}/>
 {strategic!==undefined&&<footer className="strategic-panel" data-ready={strategic>=100||undefined} {...trigger('strategic',()=><KeyTipBody title={STRATEGIC[faction].label} line={strategic>=100?'Charged. Select your Strategic operations site to launch.':`Charging · ${strategic}%. Low power stops charging.`}/>)} tabIndex={0} role="img" aria-label={`${STRATEGIC[faction].label}: ${strategic>=100?'charged':`${strategic}% charged`}`}><Icon id="i-missile"/><strong>{STRATEGIC[faction].label}</strong><span className="hud-meter" aria-hidden="true"><i style={{width:`${strategic}%`}}/></span><b>{strategic>=100?'READY':`${strategic}%`}</b></footer>}
 <EconomyPopover open={economyOpen} onOpen={()=>setEconomyOpen(true)} onClose={closeEconomy} reserve={economy?.repairReserve} disabled={readOnly||battle.pending||!!snapshot?.countdown} available={playerCommands.includes('repair_reserve')} bindings={bindings.repair_reserve} status={economyStatus} onApply={amount=>{void control.command('repair_reserve',undefined,undefined,false,amount)}}/>
 <SidebarTooltip tip={tip} tipId={tipId}/>
 </aside>;
}

/** The focused radar owns keyboard input; Tab retains normal browser navigation. */
export function TacticalMinimap({view}:{view:BattleView}){
 const {state,control,minimap}=view,map=state.session.map,id=useId();
 const [cursor,setCursor]=useState<Point|undefined>(),[size,setSize]=useState({width:300,height:150,left:0,top:0});
 useEffect(()=>{const canvas=minimap.current;if(!canvas)return;const resize=new ResizeObserver(()=>setSize({width:Math.max(1,canvas.clientWidth),height:Math.max(1,canvas.clientHeight),left:canvas.offsetLeft,top:canvas.offsetTop}));resize.observe(canvas);return()=>resize.disconnect()},[minimap]);
 const initial={x:(map?.width??1)*500,y:(map?.height??1)*500};
 const projected=cursor&&map?minimapProject(minimapLayout(map.width,map.height,size.width,size.height),cursor):undefined;
 const position=cursor&&map?` Cursor ${Math.round(cursor.x/(map.width*10))}% east, ${Math.round(cursor.y/(map.height*10))}% south.`:'';
 const classic=state.settings.bindings.preset==='classic',orders=classic?'Left-click orders selected forces; otherwise it moves the camera.':'Left-click moves the camera; right-click orders selected forces.';
 const pointer=(event:{button:number;clientX:number;clientY:number;shiftKey:boolean;ctrlKey:boolean;altKey:boolean;metaKey:boolean})=>{if(!minimap.current)return;const point=control.renderer?.minimapPoint(minimap.current,event.clientX,event.clientY);if(!point)return;setCursor(point);const ordered=control.minimapOrder(point,event.button,{shift:event.shiftKey,ctrl:event.ctrlKey,alt:event.altKey,meta:event.metaKey});if(!ordered&&event.button===0)control.renderer?.center(point)};
 return <div className="minimap-frame"><canvas ref={minimap} width={300} height={150} tabIndex={0} role="application" aria-label={`Tactical minimap.${position}`} aria-describedby={id} title={`Minimap · ${orders} Arrow keys move the cursor; Enter or Space centres the camera.`} onFocus={()=>setCursor(initial)} onBlur={()=>setCursor(undefined)} onKeyDown={event=>{
  event.stopPropagation();if(!map)return;
  const point=cursor??initial,next=minimapCursorMove(map.width,map.height,point,event.key);
  if(next){event.preventDefault();setCursor(next)}else if(event.key==='Enter'||event.key===' '){event.preventDefault();control.renderer?.center(point)}
 }} onKeyUp={event=>event.stopPropagation()} onClick={pointer} onContextMenu={event=>{event.preventDefault();pointer(event)}}/>
 {projected&&<i className="minimap-cursor" aria-hidden="true" style={{left:`${size.left+projected.x}px`,top:`${size.top+projected.y}px`}}/>}
 <span id={id} className="hud-sr">{orders} Arrow keys move the map cursor; Enter or Space centres the camera. Tab leaves the minimap. Square: your forces; plus: allied; cross: opposing; outline: neutral; triangle: unknown.</span>
 </div>;
}
