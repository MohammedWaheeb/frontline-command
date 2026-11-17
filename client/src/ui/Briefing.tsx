import {useEffect,useState} from 'react';
import type {Application} from '../app/application';
import {useObservable} from '../app/store';
import type {Faction,GameMap} from '../runtime';
import {FACTIONS,credits} from '../content/labels';
import {Emblem,Icon,Modal} from './primitives';
import {TrainingFocus} from './CommanderProgress';
import {Button} from './menu/kit/Button';
import {Select} from './menu/kit/Field';
import {DIFFICULTY_COPY,TerrainSurvey,useJSON,type MissionPresentation} from './records/shared';
/** An installed-map terrain survey. No actors, mission triggers or hidden state. */
export function MapSurvey({map}:{map:GameMap}){
 return <figure className="map-survey rec-briefing-map"><TerrainSurvey map={map} label={`Terrain survey of ${map.title}`}/><figcaption><Icon id="i-map"/><span>{map.title.replace(/ — .*$/,'')}</span><span className="rec-mono">{map.width} × {map.height}</span></figcaption></figure>;
}
type Objective={id:string;text:string;optional?:boolean;failure?:boolean};
/** Pre-mission briefing: what, where, how to win, how to lose, then Begin. */
export function Briefing({app}:{app:Application}){
 const prepared=useObservable(app.state).briefing!,definition=prepared.content.mission,entry=prepared.content.entry;
 const variants=Array.isArray(definition.tutorial_variants)?definition.tutorial_variants as Array<{faction:Faction;briefing:string;objectives:Objective[]}>:[];
 const [faction,setFaction]=useState((definition.faction??'US') as Faction),selected=variants.find(variant=>variant.faction===faction);
 useEffect(()=>{app.audioDirector.briefing(entry.id,variants.length?faction:undefined)},[app,entry.id,faction]);
 const presentation=useJSON<MissionPresentation>(entry.presentation_url).value;
 const objectives=(selected?.objectives??definition.objectives) as Objective[];
 const primary=objectives.filter(objective=>!objective.failure&&!objective.optional),optional=objectives.filter(objective=>!objective.failure&&objective.optional),failure=objectives.filter(objective=>objective.failure);
 const human=(definition.players as Array<{controller:string;credits:number}>).find(player=>player.controller==='human');
 const rules=String(definition.rules_notice??'').trim(),mode=entry.mode==='tutorial'?'Field training':entry.mode==='coop'?'Co-op scenario':'Campaign';
 const close=()=>app.patch({briefing:undefined});
 return <Modal title={entry.title} wide onClose={close}><div className="rec-briefing">
  <div className="briefing-layout rec-briefing-layout">
   <aside className="rec-briefing-side">
    <MapSurvey map={prepared.content.map}/>
    <div className="briefing-signature rec-briefing-signature"><Emblem faction={faction}/><div><strong>{FACTIONS[faction].name}</strong><small>{FACTIONS[faction].doctrine}</small></div></div>
    <dl className="rec-briefing-facts"><div><dt>Mode</dt><dd>{mode}</dd></div><div><dt>Difficulty</dt><dd>{DIFFICULTY_COPY[prepared.difficulty].label}</dd></div><div><dt>Starting credits</dt><dd className="rec-mono">{credits(human?.credits??0)}</dd></div>{presentation?.theater&&<div><dt>Theater</dt><dd>{presentation.theater}</dd></div>}</dl>
   </aside>
   <div className="rec-briefing-main">
    <header className="rec-briefing-head"><div><span className="rec-eyebrow">{presentation?.operation??'Operations briefing'}</span>{presentation?.lesson&&presentation.lesson.trim().toLowerCase()!==entry.title.trim().toLowerCase()&&<p className="rec-briefing-lesson">{presentation.lesson}</p>}</div><Button size="sm" variant="ghost" icon="i-speaker" onClick={()=>app.audioDirector.briefing(entry.id,variants.length?faction:undefined)}>Play briefing</Button></header>
    {variants.length>0&&<label className="rec-briefing-variant"><span>Training faction</span><Select aria-label="Training faction" value={faction} onChange={value=>setFaction(value as Faction)} options={variants.map(variant=>({value:variant.faction,label:FACTIONS[variant.faction].name}))}/></label>}
    <p className="briefing-copy rec-briefing-copy">{selected?.briefing??String(definition.briefing??'')}</p>
    <TrainingFocus focus={prepared.challenge}/>
    <section className="rec-briefing-objectives" aria-labelledby="rec-brief-win"><h3 id="rec-brief-win" className="rec-section-title"><Icon id="i-objective"/>To win</h3><ul className="briefing-objectives">{primary.map(objective=><li key={objective.id}><Icon id="i-objective"/><span>{objective.text}</span></li>)}</ul></section>
    {optional.length>0&&<section className="rec-briefing-objectives is-optional" aria-labelledby="rec-brief-bonus"><h3 id="rec-brief-bonus" className="rec-section-title"><Icon id="i-trophy"/>Bonus</h3><ul className="briefing-objectives">{optional.map(objective=><li key={objective.id}><Icon id="i-trophy"/><span>{objective.text}</span></li>)}</ul></section>}
    {failure.length>0&&<section className="rec-briefing-objectives is-failure" aria-labelledby="rec-brief-lose"><h3 id="rec-brief-lose" className="rec-section-title"><Icon id="i-alert"/>Failure conditions</h3><ul className="briefing-objectives">{failure.map(objective=><li key={objective.id}><Icon id="i-close"/><span>{objective.text}</span></li>)}</ul></section>}
    {rules&&<details className="rec-details"><summary>Scenario rules</summary><p>{rules}</p></details>}
   </div>
  </div>
  <div className="button-row rec-briefing-actions"><Button variant="ghost" icon="i-chevron-left" onClick={close}>Return to operations</Button><span className="rec-briefing-summary">{DIFFICULTY_COPY[prepared.difficulty].label} · {FACTIONS[faction].short} · {prepared.content.map.title.replace(/ — .*$/,'')}</span><Button variant="primary" size="lg" icon="i-attack" onClick={()=>void app.launchBriefing(variants.length?faction:undefined)}>Begin operation</Button></div>
 </div></Modal>;
}
