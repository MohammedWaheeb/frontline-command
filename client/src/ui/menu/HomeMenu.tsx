// Main menu (home) — menu-shell lane. Grouped, state-bearing, never scrolls at 1280×720 / 100%.
// Every row keeps its legacy accessible name (menu-model `label`) and exposes live state as its description.
import {useEffect,useId,useState,type ReactNode} from 'react';
import {canRejoinOperation} from '../../app/network-controller';
import type {Application} from '../../app/application';
import {useObservable} from '../../app/store';
import {defaultBattlefields} from '../../app/release-scope';
import {FACTIONS} from '../../content/labels';
import type {CampaignOverview} from '../../runtime';
import type {SkirmishSetup} from '../../app/skirmish-setup';
import type {LocalSaveSummary} from '../../runtime/storage';
import {KitIcon} from './kit';
import {groupEntries,groupTitle,menuEntry,type MenuEntry} from './menu-model';

const DIFFICULTY:Record<string,string>={easy:'Easy',normal:'Normal',hard:'Hard'};
function age(updated:number){
 const minutes=Math.max(0,Math.round((Date.now()-updated)/60000));
 if(minutes<1)return 'just now';if(minutes<60)return `${minutes} min ago`;
 const hours=Math.round(minutes/60);if(hours<24)return `${hours} h ago`;
 const days=Math.round(hours/24);return days===1?'yesterday':`${days} days ago`;
}
/** "Copper Junction · 1 v 1 · Normal AI" from a remembered (or default) setup. */
function describeSetup(setup:SkirmishSetup,mapTitle:string|undefined){
 const teams=new Map<number,number>();let solo=0;
 for(const slot of setup.slots){if(slot.team===0)solo++;else teams.set(slot.team,(teams.get(slot.team)??0)+1)}
 const sides=[...teams.values(),...Array.from({length:solo},()=>1)];
 const format=sides.length>2&&sides.every(size=>size===1)?`Free-for-all · ${setup.slots.length}`:sides.sort((a,b)=>b-a).join('v');
 const ai=setup.slots.find(slot=>slot.difficulty)?.difficulty;
 return [mapTitle,format,ai?`${DIFFICULTY[ai]??ai} AI`:undefined].filter(Boolean).join(' · ');
}
function nextCampaign(overview:CampaignOverview,remembered?:string){
 const own=overview.campaigns.find(campaign=>campaign.faction===remembered),ownNext=own?.missions.find(mission=>mission.availability==='available'&&!mission.completed.length);
 if(own&&ownNext&&own.missions.some(mission=>mission.completed.length))return {campaign:own,next:ownNext};
 for(const campaign of overview.campaigns){const next=campaign.missions.find(mission=>mission.availability==='available'&&!mission.completed.length);if(next&&campaign.missions.some(mission=>mission.completed.length))return {campaign,next}}
 const first=overview.campaigns[0],next=first?.missions.find(mission=>mission.availability==='available');
 return first&&next?{campaign:first,next}:undefined;
}

interface RowProps{entry:MenuEntry;state?:ReactNode;live?:boolean;onSelect:()=>void;title?:string;icon?:string;label?:string}
function Row({entry,state,live=false,onSelect,title,icon,label}:RowProps){
 const id=useId();
 return <li className="fcm-row-item"><button type="button" className="fcm-row" data-menu-focus={label??entry.page} aria-label={label??entry.label} aria-describedby={state?id:undefined} onClick={onSelect}>
  <span className="fcm-row-icon" aria-hidden="true"><KitIcon id={icon??entry.icon}/></span>
  <span className="fcm-row-title">{title??entry.title}</span>
  <span className="fcm-row-state" id={state?id:undefined}>{live&&<i className="fcm-row-led" aria-hidden="true"/>}{state}</span>
  <KitIcon id="i-chevron-right" className="fcm-row-arrow"/>
 </button></li>;
}

export interface HomeMenuProps{app:Application;/** Re-measure trigger for the shell's compaction pass. */onLayoutChange?:()=>void}
/** The home command bay (wordmark, hero card, PLAY / LEARN / RECORDS) and the bottom utility bar, all inside nav "Main menu". */
export function HomeMenu({app,onLayoutChange}:HomeMenuProps){
 const state=useObservable(app.state),network=useObservable(app.network.state);
 useEffect(()=>{void app.network.initialize()},[app]);
 const [latest,setLatest]=useState<LocalSaveSummary>(),[overview,setOverview]=useState<CampaignOverview>();
 const [remembered]=useState<SkirmishSetup|undefined>(()=>{try{return app.lastSkirmish()}catch{return undefined}});
 useEffect(()=>{let active=true;void app.store.listSaveSummaries().then(saves=>{if(active)setLatest(saves[0])}).catch(error=>{if(active)app.error(error)});return()=>{active=false}},[app,state.busy]);
 useEffect(()=>{let active=true;if(!state.index)return;void app.campaign.overview().then(value=>{if(active)setOverview(value)}).catch(()=>{});return()=>{active=false}},[app,state.index]);
 useEffect(()=>{onLayoutChange?.()},[latest,overview,network.lobby?.id,onLayoutChange]);
 const go=(page:MenuEntry['page'])=>()=>app.patch({page});
 const maps=state.index?defaultBattlefields(state.index.maps):[];
 const coop=state.index?.missions.filter(mission=>mission.mode==='coop').length??0;
 const quickSetup=remembered??(maps[0]?{mapID:maps[0].id,startingCredits:0,slots:[{id:1,name:'Commander',faction:'US' as const,team:1,color:1,spawn:0},{id:2,name:'AI',faction:'random' as const,team:2,color:2,spawn:0,difficulty:'normal' as const}]}:undefined);
 const quickState=quickSetup?describeSetup(quickSetup,state.index?.maps.find(map=>map.id===quickSetup.mapID)?.title):undefined;
 const campaign=overview?nextCampaign(overview,app.campaignFaction()):undefined;
 const tutorialsDone=overview?.tutorials.filter(mission=>mission.completed.length).length??0,tutorialsTotal=overview?.tutorials.length??0;
 const play=groupEntries('play').filter(entry=>latest||entry.page!=='skirmish'),learn=groupEntries('learn'),records=groupEntries('records'),utility=groupEntries('utility');
 const continueLatest=()=>void app.task('Continuing latest operation…',async()=>{const current=(await app.store.listSaveSummaries())[0];if(!current){setLatest(undefined);app.patch({notice:'No saved operations are available.'});return}await app.sessions.continueSave(current.id)});
 const skirmish=menuEntry('skirmish')!;
 const rowState:Partial<Record<MenuEntry['page'],{text?:ReactNode;live?:boolean}>>={
  campaign:{text:campaign?`${FACTIONS[campaign.campaign.faction].short} · Next: ${String(campaign.next.order).padStart(2,'0')} ${campaign.next.title}`:undefined},
  network:{text:network.connected?`Host reached${network.hostLatency!==undefined?` · ${network.hostLatency} ms`:''}`:undefined,live:network.connected},
  coop:{text:coop?`${coop} scenario${coop===1?'':'s'}`:undefined},
  tutorials:{text:tutorialsTotal?(tutorialsDone?`${tutorialsDone} / ${tutorialsTotal} complete`:'Start here'):undefined},
 };
 const heroID=useId(),rejoin=canRejoinOperation(network);
 return <nav className="fcm-home-nav" aria-label="Main menu">
  <div className="fcm-bay">
   <h1 className="fcm-wordmark"><span>Frontline</span><strong>Command</strong></h1>
   <div className="fcm-brand-rule" aria-hidden="true">Beta</div>
   <div className="fcm-hero">
    {rejoin?<button type="button" className="fcm-hero-card" data-menu-focus="hero" aria-label="Rejoin operation" aria-describedby={heroID} disabled={!!network.busy} onClick={()=>void app.network.joinMatch()}>
      <span className="fcm-hero-icon" aria-hidden="true"><KitIcon id="i-play"/></span>
      <span className="fcm-hero-copy" id={heroID}><span className="fcm-hero-kicker">Continue</span><span className="fcm-hero-title">Rejoin operation</span><span className="fcm-hero-meta">{network.lobby!.name} · Your commander is still in this operation</span></span>
      <KitIcon id="i-chevron-right" className="fcm-hero-go"/>
     </button>:latest?<button type="button" className="fcm-hero-card" data-menu-focus="hero" aria-label="Continue" aria-describedby={heroID} title={latest.name} onClick={continueLatest}>
      <span className="fcm-hero-icon" aria-hidden="true"><KitIcon id="i-play"/></span>
      <span className="fcm-hero-copy" id={heroID}><span className="fcm-hero-kicker">Continue</span><span className="fcm-hero-title">{latest.name}</span><span className="fcm-hero-meta">{latest.kind==='auto'?'Autosave':'Saved operation'} · {age(latest.updated)}</span></span>
      <KitIcon id="i-chevron-right" className="fcm-hero-go"/>
     </button>
    :<button type="button" className="fcm-hero-card" data-menu-focus="hero" aria-label="Set up skirmish" aria-describedby={heroID} onClick={go('skirmish')}>
      <span className="fcm-hero-icon" aria-hidden="true"><KitIcon id={skirmish.icon}/></span>
      <span className="fcm-hero-copy" id={heroID}><span className="fcm-hero-kicker">First battle</span><span className="fcm-hero-title">Set up skirmish</span><span className="fcm-hero-meta">Pick a battlefield, faction and opponents</span></span>
      <KitIcon id="i-chevron-right" className="fcm-hero-go"/>
     </button>}
    {!latest&&tutorialsDone===0&&<button type="button" className="fcm-hero-link" data-menu-focus="training-link" onClick={go('tutorials')}>New to RTS? Begin field training<KitIcon id="i-chevron-right"/></button>}
   </div>
   <div className="fcm-home-list">
    <section className="fcm-group fcm-group--play" aria-labelledby={`${heroID}-play`}>
     <h2 className="fcm-group-label" id={`${heroID}-play`}>{groupTitle.play}</h2>
     <ul className="fcm-rows">
      <Row entry={skirmish} label="Quick skirmish" title="Quick skirmish" icon="i-play" state={quickState?`Start now · ${quickState}`:'Start now · default setup'} onSelect={()=>void app.quickSkirmish()}/>
      {play.map(entry=><Row key={entry.page} entry={entry} state={rowState[entry.page]?.text} live={rowState[entry.page]?.live} onSelect={go(entry.page)}/>)}
     </ul>
    </section>
    <section className="fcm-group fcm-group--learn" aria-labelledby={`${heroID}-learn`}>
     <h2 className="fcm-group-label" id={`${heroID}-learn`}>{groupTitle.learn}</h2>
     <ul className="fcm-rows">{learn.map(entry=><Row key={entry.page} entry={entry} state={rowState[entry.page]?.text} onSelect={go(entry.page)}/>)}</ul>
    </section>
    <section className="fcm-group fcm-group--records" aria-labelledby={`${heroID}-records`}>
     <h2 className="fcm-group-label" id={`${heroID}-records`}>{groupTitle.records}</h2>
     <ul className="fcm-records">{records.map(entry=><li key={entry.page}><button type="button" className="fcm-btn fcm-btn--secondary fcm-record" data-menu-focus={entry.page} aria-label={entry.label} onClick={go(entry.page)}><KitIcon id={entry.icon}/><span className="fcm-btn-label">{entry.title}</span></button></li>)}</ul>
    </section>
   </div>
   <span className="fcm-more-cue" aria-hidden="true">▾ More below</span>
  </div>
  <div className="fcm-utility">
   <div className="fcm-utility-group">{utility.map((entry,index)=><span key={entry.page} style={{display:'contents'}}>{index===2&&<i className="fcm-utility-sep" aria-hidden="true"/>}<button type="button" className="fcm-util" data-menu-focus={entry.page} aria-label={entry.label} onClick={go(entry.page)}><KitIcon id={entry.icon}/><span>{entry.title}</span></button></span>)}</div>
   <div className="fcm-utility-status">{state.index?<><span>{maps.length} battlefields</span><span>{coop} co-op scenarios</span></>:<span>Content index unavailable</span>}{state.assetStatus?.fallbacks.length?<span>{state.assetStatus.fallbacks.length} temporary visuals</span>:null}</div>
  </div>
 </nav>;
}
