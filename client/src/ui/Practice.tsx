import {defaultBattlefields} from '../app/release-scope';
import {useState} from 'react';
import type {Application} from '../app/application';
import type {BattleController} from '../app/battle-controller';
import {useObservable} from '../app/store';
import {OfflineTransport,type Faction,type OrderIntent} from '../runtime';
import {FACTIONS,reason} from '../content/labels';
import {Emblem,Icon,Modal} from './primitives';
import {Select} from './menu/kit/Field';
import {FooterActionBar,useScreenFill} from './menu/kit/screen';
import {mapPreviewURL} from './records/shared';
import {reconciledMapID} from './practice-selection';
const PRACTICE_TOOLS:ReadonlyArray<[string,string,string]>=[['i-units','Place any unit','Drop forces for either side anywhere on the map.'],['i-wrench','Restore or remove','Heal a damaged unit or clear it from the field.'],['i-credits','Set credits','Give either side the budget you want to test.'],['i-eye','Reveal the map','Turn fog of war off to watch both sides.'],['i-users','Switch sides','Take control of the opponent at any time.']];
/** Practice range launcher: battlefield, matchup, then Open. Free placement; no rewards or campaign progress. */
export function PracticeSetup({app}:{app:Application}){
 useScreenFill();
 const state=useObservable(app.state),maps=defaultBattlefields(state.index?.maps??[]),[mapChoice,setMap]=useState(''),map=reconciledMapID(maps,mapChoice),[faction,setFaction]=useState<Faction>('US'),[enemy,setEnemy]=useState<Faction>('IR');
 const chosen=maps.find(value=>value.id===map);
 const open=()=>void app.task('Opening practice range…',async()=>{const loaded=await app.library.loadMap(map);await app.sessions.startSolo({map:loaded.map,seed:crypto.getRandomValues(new Uint32Array(1))[0]||1,ruleset:'practice-v1',players:[{id:1,name:'Practice commander',faction,team:1},{id:2,name:'Practice opponent',faction:enemy,team:2}]})});
 return <div className="rec-screen rec-practice">
  <section className="rec-practice-maps" aria-labelledby="rec-practice-maps"><h3 id="rec-practice-maps" className="rec-section-title">Battlefield</h3>
   <div className="rec-map-grid" role="radiogroup" aria-label="Practice battlefield">{maps.map(value=>{const url=mapPreviewURL(value.id),active=value.id===map;return <button key={value.id} role="radio" aria-checked={active} className={`rec-map-tile ${active?'is-selected':''}`} onClick={()=>setMap(value.id)}><span className="rec-map-art">{url?<img src={url} alt="" loading="lazy"/>:<Icon id="i-map"/>}</span><span className="rec-map-name"><strong>{value.title}</strong><small>{value.players} starting positions</small></span></button>})}{!maps.length&&<p className="rec-muted">No battlefields are installed.</p>}</div>
  </section>
  <section className="rec-practice-side" aria-labelledby="rec-practice-matchup"><h3 id="rec-practice-matchup" className="rec-section-title">Matchup</h3>
   <div className="rec-matchup">{[{label:'Your faction',caption:'Your forces',value:faction,set:setFaction},{label:'Opposing faction',caption:'Opposing forces',value:enemy,set:setEnemy}].map((choice,index)=><div key={choice.label} className="rec-matchup-side" data-side={index?'enemy':'own'}><span className="rec-eyebrow">{choice.caption}</span><Emblem faction={choice.value}/><Select aria-label={choice.label} value={choice.value} onChange={value=>choice.set(value as Faction)} options={Object.entries(FACTIONS).map(([id,value])=>({value:id,label:value.name}))}/><small>{FACTIONS[choice.value].doctrine}</small></div>)}<span className="rec-matchup-vs" aria-hidden="true">VS</span></div>
   <h3 className="rec-section-title">Range tools</h3>
   <ul className="rec-tool-list">{PRACTICE_TOOLS.map(([icon,title,text])=><li key={title}><Icon id={icon}/><div><strong>{title}</strong><p>{text}</p></div></li>)}</ul>
   <p className="rec-muted">Both sides are controlled locally; open Practice tools from the sidebar during the session.</p>
  </section>
  <FooterActionBar className="rec-footer" summary={chosen?<><b>{chosen.title}</b> · {FACTIONS[faction].short} vs {FACTIONS[enemy].short} · free practice, no rewards</>:'Choose a battlefield'} disabledReason={!map?'No battlefield is installed.':undefined} primary={{label:'Open practice range',icon:'i-play',disabled:!map,onClick:open}}/>
 </div>;
}
export function PracticeTools({app,control,onClose}:{app:Application;control:BattleController;onClose:()=>void}){
 const state=useObservable(app.state),battle=useObservable(control.state),[owner,setOwner]=useState(state.snapshot?.player??1),[type,setType]=useState(''),[count,setCount]=useState(1),[cash,setCash]=useState(6000),[fog,setFog]=useState(false),[pending,setPending]=useState(false),[result,setResult]=useState('');
 const faction=state.snapshot?.players.find(player=>player.id===owner)?.faction,units=[...state.catalog!.units.values()].filter(unit=>unit.faction===faction),selected=type&&units.some(unit=>unit.id===type)?type:units[0]?.id??'';
 const order=async(order:OrderIntent)=>{const runtime=app.sessions.transport;if(!(runtime instanceof OfflineTransport)||app.sessions.state.kind!=='practice')return;setPending(true);try{const preview=await runtime.previewOrders([order]);if(!preview.results[0]?.accepted)throw Error(reason(preview.results[0]?.code));await runtime.sendOrders([order]);setResult('Practice order submitted.')}catch(error){setResult(error instanceof Error?error.message:'Practice order failed.')}finally{setPending(false)}};
 return <Modal title="Practice tools" onClose={onClose}><p className="muted">Practice changes are recorded in replays. They never apply to ranked or standard matches.</p><label>Player<select aria-label="Practice player" value={owner} onChange={event=>setOwner(Number(event.target.value))}>{state.snapshot?.players.map(player=><option value={player.id} key={player.id}>{player.name} · {player.faction}</option>)}</select></label><button onClick={()=>void app.sessions.setPerspective(owner).catch(error=>app.error(error))}>Control this player</button><h3>Place forces</h3><label>Unit<select aria-label="Practice unit" value={selected} onChange={event=>setType(event.target.value)}>{units.map(unit=><option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label><label>Count<input aria-label="Practice count" type="number" min="1" max="20" value={count} onChange={event=>setCount(Number(event.target.value))}/></label><button disabled={pending} onClick={()=>{control.placePractice({kind:'practice_spawn',type:selected,target:owner,index:count});onClose()}}>Choose placement on battlefield</button><h3>Selection</h3><div className="button-row"><button disabled={pending||!battle.ids.length} onClick={()=>void order({kind:'practice_restore',target:battle.ids[0]})}>Restore selected</button><button disabled={pending||!battle.ids.length} onClick={()=>void order({kind:'practice_remove',target:battle.ids[0]})}>Remove selected</button></div><h3>Resources & fog</h3><label>Credits<input aria-label="Practice credits" type="number" min="0" value={cash} onChange={event=>setCash(Number(event.target.value))}/></label><button disabled={pending} onClick={()=>void order({kind:'practice_resources',target:owner,index:cash})}>Set player credits</button><label className="check"><input type="checkbox" checked={fog} onChange={event=>{const reveal=event.target.checked;setFog(reveal);void order({kind:'practice_fog',index:reveal?1:0})}}/>Reveal the practice map</label><p role="status">{result}</p></Modal>;
}
