// One-step Host game dialog (Lane E). Calls the existing controller.createLobby config shape.
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {NetworkController,NetworkState} from '../../app/network-controller';
import {STANDARD_STARTING_CREDITS,parseStartingCredits,startingMoneyRules} from '../../app/starting-money';
import type {ContentIndex} from '../../runtime/content-library';
import type {Faction} from '../../runtime/types';
import type {TeamPaletteScheme} from '../../design/team-colors';
import {Modal} from '../primitives';
import {KitIcon as Icon} from '../menu/kit/icon';
import {EmptyState} from '../menu/kit/Panel';
import {StartingMoneyField} from '../StartingMoneyField';
import {FactionOptions,lobbyBattlefields} from './kit';
import {LobbyMap} from './LobbyMap';

type Mode='1v1'|'2v2'|'ffa'|'custom';
const FORMATS:Array<[Mode,string,string]>=[['custom','Custom · 1–4 commanders','Any mix of humans and AI, teams of your choice.'],['1v1','1 vs 1','Two commanders, opposing teams.'],['2v2','2 vs 2','Four commanders in two teams.'],['ffa','Free for all · 3–4 commanders','Every commander for themselves.']];

export function HostModal({controller,state,commanderName,palette,onClose}:{controller:NetworkController;state:NetworkState;index?:ContentIndex;commanderName?:string;palette:TeamPaletteScheme;onClose:()=>void}){
 const profileName=state.account?.profile?.name??commanderName??state.commanderName;
 const [name,setName]=useState(profileName?`${profileName}’s operation`:'Frontline operation'),[mode,setMode]=useState<Mode>('custom'),[map,setMap]=useState(''),[faction,setFaction]=useState<Faction|'random'>('US');
 const [privateLobby,setPrivate]=useState(false),[pause,setPause]=useState(true),[observers,setObservers]=useState(false),[startingCredits,setStartingCredits]=useState(String(STANDARD_STARTING_CREDITS));
 const mapChoices=lobbyBattlefields(state.maps,mode);
 useEffect(()=>{if(!mapChoices.some(value=>value.id===map))setMap(mapChoices[0]?.id??'')},[state.maps,mode,map]);
 const privateMap=mapChoices.find(value=>value.id===map)?.published===false,moneyEditable=privateLobby&&mode==='custom',money=parseStartingCredits(moneyEditable?startingCredits:String(STANDARD_STARTING_CREDITS));
 useEffect(()=>{if(privateMap){setPrivate(true);setMode('custom')}},[privateMap]);
 const valid=!!name.trim()&&money.valid&&mapChoices.some(value=>value.id===map),format=FORMATS.find(([id])=>id===mode)!;
 const reason=!mapChoices.length?(state.maps.length?'No installed battlefield fits this format.':'Loading battlefields from the host…'):!name.trim()?'Name the operation.':!money.valid?'Choose valid starting credits.':'';
 return createPortal(<div className="network-panel mp-portal"><Modal title="Host game" onClose={onClose} wide><form className="mp-host-form" onSubmit={event=>{event.preventDefault();if(!valid||controller.state.get().busy)return;void controller.createLobby({name:name.trim(),map_id:map,mode,faction,private:privateLobby,pause_enabled:mode==='custom'&&pause,live_observers:privateLobby&&observers,...(money.credits===STANDARD_STARTING_CREDITS?{}:{rules:startingMoneyRules(money.credits)})},commanderName)}}>
  <div className="mp-host-grid">
   <div className="mp-host-fields">
    <label>Operation name<input aria-label="Operation name" value={name} onChange={event=>setName(event.target.value)} maxLength={60} required/></label>
    <label>Format<select aria-label="Battle format" disabled={privateMap} value={mode} onChange={event=>setMode(event.target.value as Mode)}>{FORMATS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><small>{format[2]}</small></label>
    <label>Battlefield<select aria-label="Lobby battlefield" value={map} onChange={event=>setMap(event.target.value)}>{mapChoices.map(value=><option key={value.id} value={value.id}>{value.title} · {value.players??'?'} players</option>)}</select></label>
    <label>Faction<select aria-label="Host faction" value={faction} onChange={event=>setFaction(event.target.value as typeof faction)}><FactionOptions/></select></label>
    <div className="mp-check-row"><label className="network-check mp-check"><input type="checkbox" aria-describedby="mp-private-hint" disabled={privateMap} checked={privateLobby} onChange={event=>setPrivate(event.target.checked)}/>Private game</label><small id="mp-private-hint">Only commanders with your invite code can join.</small></div>
    {privateMap&&<p className="network-hint">Your unpublished map needs a private custom game. Share the invite code with the commanders you invite.</p>}
    <details className="mp-details mp-more-rules"><summary>More rules</summary>
     <div className="mp-rule-checks">{mode==='custom'&&<div className="mp-check-row"><label className="network-check mp-check"><input type="checkbox" aria-describedby="mp-pause-hint" checked={pause} onChange={event=>setPause(event.target.checked)}/>Shared pause</label><small id="mp-pause-hint">Any commander can request a pause.</small></div>}{privateLobby&&<div className="mp-check-row"><label className="network-check mp-check"><input type="checkbox" aria-describedby="mp-live-hint" checked={observers} onChange={event=>setObservers(event.target.checked)}/>Live observers</label><small id="mp-live-hint">Observers watch without the 2-minute delay.</small></div>}</div>
     <StartingMoneyField value={moneyEditable?startingCredits:String(STANDARD_STARTING_CREDITS)} onChange={setStartingCredits} disabled={!!state.busy||!moneyEditable} lockedReason={moneyEditable?undefined:'Custom credits need a private Custom game. Public and standard formats use 6,000 credits.'}/>
    </details>
   </div>
   <div className="mp-host-map">{map?<LobbyMap controller={controller} mapId={map} slots={[]} palette={palette}/>:<EmptyState className="mp-empty">{reason}</EmptyState>}
    <p className="mp-rules-line">Standard rules · 100 supply · fog of war{money.valid&&money.credits!==STANDARD_STARTING_CREDITS?` · ${money.credits.toLocaleString('en-US')} credits · unranked`:' · 6,000 credits'}</p></div>
  </div>
  <footer className="mp-modal-footer"><span className="mp-footer-reason" role="status">{reason}</span><button type="button" onClick={onClose}>Cancel</button><button className="primary mp-cta" disabled={!!state.busy||!valid}><Icon id="i-play"/>Create operation</button></footer>
 </form></Modal></div>,document.body);
}
