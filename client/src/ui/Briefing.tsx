import {useEffect,useRef,useState} from 'react';
import type {Application} from '../app/application';
import {useObservable} from '../app/store';
import type {Faction,GameMap} from '../runtime';
import {FACTIONS,credits} from '../content/labels';
import {Emblem,Icon,Modal} from './primitives';
/** An installed-map terrain survey. No actors, mission triggers or hidden state. */
export function MapSurvey({map}:{map:GameMap}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const context=canvas.current?.getContext('2d');if(!context)return;const colors:Record<string,[number,number,number]>={open:[119,110,69],rough:[89,91,57],road:[139,130,88],forest:[57,77,43],water:[55,65,57],cliff:[80,79,59],ramp:[155,141,94],cover:[90,95,57],urban:[116,114,93]};const data=context.createImageData(map.width,map.height);for(let index=0;index<map.tiles.length;index++){const tile=map.tiles[index],rgb=colors[tile.terrain]??[105,103,70],height=(tile.height??0)*7;data.data.set([Math.min(255,rgb[0]+height),Math.min(255,rgb[1]+height),Math.min(255,rgb[2]+height),255],index*4)}context.putImageData(data,0,0)},[map]);
 return <figure className="map-survey"><canvas ref={canvas} width={map.width} height={map.height} aria-label={`Terrain survey of ${map.title}`}/><figcaption><Icon id="i-map"/>{map.width} × {map.height} · TERRAIN SURVEY</figcaption></figure>;
}
export function Briefing({app}:{app:Application}){
 const prepared=useObservable(app.state).briefing!,definition=prepared.content.mission;
 const variants=Array.isArray(definition.tutorial_variants)?definition.tutorial_variants as Array<{faction:Faction;briefing:string;objectives:Array<{id:string;text:string;optional?:boolean;failure?:boolean}>}>:[];
 const [faction,setFaction]=useState((definition.faction??'US') as Faction),selected=variants.find(variant=>variant.faction===faction);
 useEffect(()=>{app.audioDirector.briefing(prepared.content.entry.id,variants.length?faction:undefined)},[app,prepared.content.entry.id,faction]);
 const objectives=(selected?.objectives??definition.objectives) as Array<{id:string;text:string;optional?:boolean;failure?:boolean}>;
 const human=(definition.players as Array<{controller:string;credits:number}>).find(player=>player.controller==='human');
 return <Modal title={prepared.content.entry.title} wide onClose={()=>app.patch({briefing:undefined})}><div className="briefing-layout"><div><MapSurvey map={prepared.content.map}/><div className="briefing-signature"><Emblem faction={faction}/><div><strong>{FACTIONS[faction].name}</strong><small>{prepared.content.map.title}</small></div></div><div className="rules-strip"><span>{prepared.difficulty.toUpperCase()}</span><span>{credits(human?.credits??0)} starting credits</span><span>Scenario rules</span></div></div><div><span className="eyebrow">OPERATIONS BRIEFING</span><button onClick={()=>app.audioDirector.briefing(prepared.content.entry.id,variants.length?faction:undefined)}>Play briefing</button>{variants.length>0&&<label>Training faction<select aria-label="Training faction" value={faction} onChange={event=>setFaction(event.target.value as Faction)}>{variants.map(variant=><option key={variant.faction} value={variant.faction}>{FACTIONS[variant.faction].name}</option>)}</select></label>}<p className="briefing-copy">{selected?.briefing??String(definition.briefing??'')}</p><h3>Mission objectives</h3><ul className="briefing-objectives">{objectives.filter(objective=>!objective.failure).map(objective=><li key={objective.id}><Icon id={objective.optional?'i-trophy':'i-objective'}/><span>{objective.text}{objective.optional&&<small>Optional</small>}</span></li>)}</ul><details><summary>Failure conditions & declared rules</summary>{objectives.filter(objective=>objective.failure).map(objective=><p key={objective.id}>{objective.text}</p>)}<p>{String(definition.rules_notice??'')}</p></details></div></div><div className="button-row"><button className="primary" onClick={()=>void app.launchBriefing(variants.length?faction:undefined)}><Icon id="i-attack"/>Begin operation</button><button onClick={()=>app.patch({briefing:undefined})}>Return to operations</button></div></Modal>;
}
