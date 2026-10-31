// Co-op landing (Lane E): both scenarios up front, join-by-code for the partner, shared checkpoints.
import {useState} from 'react';
import type {NetworkController,NetworkState} from '../../app/network-controller';
import type {Difficulty} from '../../runtime/types';
import type {TeamPaletteScheme} from '../../design/team-colors';
import {FACTIONS} from '../../content/labels';
import {Emblem} from '../primitives';
import {KitIcon as Icon} from '../menu/kit/icon';
import {EmptyState} from '../menu/kit/Panel';
import {IdentityBar,JoinStrip,RemovedBanner,type Draft} from './MultiplayerLanding';
import {LobbyMap} from './LobbyMap';
import {SectionHead,difficulties,title} from './kit';

const ALLIES:Array<[string,string]>=[['human','Another human'],['easy','Easy AI'],['normal','Normal AI'],['hard','Hard AI']];

/** The first complete briefing sentence is the synopsis; essential instructions stay in the disclosure. */
export function CoopMissionCopy({mission}:{mission:{title:string;briefing:string;rules_notice?:string}}){
 const synopsis=mission.briefing.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()??mission.briefing;
 return <div className="mp-mission-copy"><h4>{mission.title}</h4><p>{synopsis}</p><details className="mp-mission-details"><summary>Mission details</summary><p>{mission.briefing}</p>{mission.rules_notice&&<><h5>Mission rules</h5><p>{mission.rules_notice}</p></>}</details></div>;
}

export function CoopLanding({controller,state,draft,palette,onAdvanced}:{controller:NetworkController;state:NetworkState;draft:Draft;palette:TeamPaletteScheme;onAdvanced:()=>void}){
 const [difficulty,setDifficulty]=useState<Difficulty>('normal'),[ally,setAlly]=useState('human'),[save,setSave]=useState(''),[player,setPlayer]=useState(1);
 const missions=state.missions.filter(mission=>mission.mode==='coop'),busy=!!state.busy,name=draft.name.trim()||undefined;
 return <div className="mp-coop">
  <IdentityBar controller={controller} state={state} draft={draft} onAdvanced={onAdvanced}/>
  <RemovedBanner state={state}/>
  <JoinStrip controller={controller} state={state} draft={draft}/>
  <section className="mp-coop-missions" aria-labelledby="mp-coop-title">
   <SectionHead id="mp-coop-title" title="Co-op missions" aside={<div className="mp-coop-settings">
    <fieldset className="mp-segmented"><legend>Difficulty</legend>{difficulties.map(value=><label key={value} data-checked={difficulty===value||undefined}><input type="radio" name="coop-difficulty" value={value} checked={difficulty===value} onChange={()=>setDifficulty(value)}/>{title(value)}</label>)}</fieldset>
    <label className="mp-inline-select">Ally<select aria-label="Allied commander" value={ally} onChange={event=>setAlly(event.target.value)}>{ALLIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   </div>}/>
   <p className="mp-lede">Two allied commanders with separate bases and shared vision. The host saves shared checkpoints automatically.</p>
   {missions.length?<div className="mp-mission-grid">{missions.map(mission=><article className="network-mission mp-mission" key={mission.id}>
    <div className="mp-mission-art"><LobbyMap controller={controller} mapId={mission.map_id} slots={[]} palette={palette} compact/><span className="mp-mission-faction"><Emblem faction={mission.faction}/>{FACTIONS[mission.faction]?.name??mission.faction}</span></div>
    <CoopMissionCopy mission={mission}/>
    <footer><span className="mp-mission-meta">{title(difficulty)} · {ALLIES.find(([value])=>value===ally)?.[1]}</span><button className="primary" disabled={busy||!!state.lobby} onClick={()=>void controller.createCoop(mission.id,difficulty,ally==='human'?undefined:ally as Difficulty,name)}><Icon id="i-play"/>Create co-op lobby</button></footer>
   </article>)}</div>:<EmptyState className="mp-empty">{state.connected?'This host has no co-op missions installed.':'Connect to a game host to see its co-op missions.'}</EmptyState>}
  </section>
  <div className="mp-coop-lower mp-coop-single">
   <section className="mp-entry-card mp-checkpoints" aria-labelledby="mp-checkpoint-title">
    <div className="mp-entry-title"><span className="mp-entry-icon"><Icon id="i-save"/></span><div><h3 id="mp-checkpoint-title">Shared checkpoints</h3><p>Resume a co-op mission saved on this host. Every human commander must rejoin.</p></div><button type="button" className="mp-quiet" disabled={busy} onClick={()=>void controller.refresh()}>Refresh checkpoints</button></div>
    <form className="mp-checkpoint-form" onSubmit={event=>{event.preventDefault();void controller.resumeCoop(save,player)}}>
     <label>Checkpoint<select aria-label="Shared checkpoint" value={save} onChange={event=>setSave(event.target.value)} required><option value="">{state.saves.length?'Choose a checkpoint':'No checkpoints yet'}</option>{state.saves.map(value=><option key={value.id} value={value.id}>{value.name} · {new Date(value.updated*1000).toLocaleString()}</option>)}</select></label>
     <label>Saved commander<select aria-label="Your saved commander" value={player} onChange={event=>setPlayer(Number(event.target.value))}><option value={1}>Commander 1</option><option value={2}>Commander 2</option></select></label>
     <button disabled={busy||!!state.lobby||!save}>Resume co-op lobby</button>
    </form>
   </section>
  </div>
 </div>;
}
