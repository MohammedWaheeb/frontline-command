// Network lane presentation kit (Lane E, beta revamp). Pure presentation helpers
// shared by the multiplayer landing, host/join, lobby and co-op screens.
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {NetworkController,NetworkState} from '../../app/network-controller';
import {FACTIONS} from '../../content/labels';
import type {Difficulty,Faction} from '../../runtime/types';
import type {TeamPaletteScheme} from '../../design/team-colors';
import {teamColorCss,teamColorName} from '../menu/kit/ColorSwatchPicker';
import {InviteCode as KitInviteCode} from '../menu/kit/InviteCode';
import {SectionHeader} from '../menu/kit/Panel';
import {KitIcon as Icon} from '../menu/kit/icon';
import {defaultBattlefields} from '../../app/release-scope';

export const factions=Object.keys(FACTIONS) as Faction[];
export const difficulties:Difficulty[]=['easy','normal','hard'];
export const colorSlots=[1,2,3,4,5,6,7,8] as const;
/** Text name / CSS for a public colour slot (shared with Skirmish via the menu kit). */
export const colorName=(slot:number,palette:TeamPaletteScheme)=>teamColorName(slot,palette);
export const colorCss=(slot:number,palette:TeamPaletteScheme)=>teamColorCss(slot,palette);
export const title=(value:string)=>value?value[0].toUpperCase()+value.slice(1):value;
export const AI_HELP='Easy AI decides every 4 seconds, Normal every 2, Hard every second. Every AI sees only what its own units see and pays normal costs.';

export const MODE_LABELS:Record<string,string>={'1v1':'1 v 1','2v2':'2 v 2',ffa:'Free for all',custom:'Custom',coop:'Co-op'};
export const modeLabel=(mode:string)=>MODE_LABELS[mode]??mode.toUpperCase();
/** Maximum commanders a lobby can seat: format first, then the battlefield. */
export function lobbyCapacity(mode:string,mapPlayers?:number,current=0){
 const byMode=mode==='1v1'?2:mode==='2v2'?4:mode==='coop'?Math.max(current,2):4;
 return Math.max(current,Math.min(byMode,mapPlayers??byMode));
}
export function lobbyBattlefields(maps:NetworkState['maps'],mode:string,commanders=0){
 const required=Math.max(commanders,mode==='2v2'?4:mode==='ffa'?3:mode==='1v1'?2:1);
 return defaultBattlefields(maps).filter(map=>!map.removed&&(map.players??0)>=required);
}

export function FactionOptions({random=true}:{random?:boolean}){return <>{random&&<option value="random">Random faction</option>}{factions.map(f=><option key={f} value={f}>{FACTIONS[f].name}</option>)}</>}
export function Difficulties({suffix=''}:{suffix?:string}){return <>{difficulties.map(value=><option key={value} value={value}>{title(value)}{suffix}</option>)}</>}

/** Section heading: brass rule, optional count/aside at right. */
export function SectionHead({title,aside,id}:{title:string;aside?:ReactNode;id?:string}){return <SectionHeader className="mp-section-head" title={title} aside={aside} id={id}/>}

/** Clipboard with a selection fallback for plain-HTTP LAN origins. */
export function useCopy(){
 const [copied,setCopied]=useState<string>(),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const copy=async(key:string,text:string)=>{
  let ok=false;try{await navigator.clipboard.writeText(text);ok=true}catch{
   try{const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();ok=document.execCommand('copy');area.remove()}catch{ok=false}
  }
  setCopied(ok?key:`${key}:failed`);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(undefined),2400);
 };
 return {copied,copy};
}

const RETRY_CODES=new Set(['host_unreachable','socket_unreachable','connection_closed','network_error','fetch_failed','offline']);
const HEADLINES:Record<string,string>={
 host_unreachable:'Host unreachable',socket_unreachable:'Host unreachable',invite_invalid:'Check the invite code',lobby_missing:'Game not found',
 private_lobby:'Invite code needed',invalid_code:'Invite code does not match',lobby_full:'Game unavailable',version_mismatch:'Different game versions',
 incompatible_version:'Different game versions',origin_not_allowed:'Open the host’s page',lobby_removed:'Removed from lobby',players_missing:'Game did not start',
 request_rate_exceeded:'Too many requests',network_busy:'One moment',
};
/** Human banner with one recovery action; the raw code stays behind Details. */
export function ErrorBanner({controller,state}:{controller:NetworkController;state:NetworkState}){
 const error=state.error;
 return <>{error&&<div className="network-error mp-banner" data-tone="danger" role="alert"><Icon id="i-alert"/><div className="mp-banner-copy"><strong>{HEADLINES[error.code]??'That didn’t go through'}</strong><p>{error.message}</p><div className="mp-banner-actions">{RETRY_CODES.has(error.code)&&<button type="button" disabled={!!state.busy} onClick={()=>void controller.connect(state.host)}><Icon id="i-refresh"/>Retry connection</button>}<details className="mp-details"><summary>Details</summary><code>{error.code}</code></details></div></div><button type="button" className="mp-banner-close" aria-label="Dismiss network error" onClick={()=>controller.dismissError()}><Icon id="i-close"/></button></div>}
 {state.pollError&&<p className="network-warning mp-banner" data-tone="warn" role="status"><Icon id="i-signal"/><span className="mp-banner-copy"><strong>Lobby updates paused</strong> {state.pollError}</span><button type="button" onClick={()=>void controller.refresh()}>Retry host</button></p>}</>;
}

/** Busy line (tests wait on `.network-operation`). */
export function BusyLine({state}:{state:NetworkState}){return state.busy?<p className="network-operation mp-busy" role="status"><span className="network-pulse"/>{state.busy}</p>:null}

/** Host reachability chip: LED plus words, never colour alone. */
export function ConnectionChip({state,onAdvanced}:{state:NetworkState;onAdvanced:()=>void}){
 const host=(()=>{try{return new URL(state.host).host}catch{return state.host}})();
 return <div className={`network-link mp-chip ${state.connected?'connected':''}`} data-tone={state.connected?'ok':'danger'}>
  <i className="mp-led" aria-hidden="true"/><span><strong>{state.connected?'Host reached':'Not connected'}</strong><small>{host}{state.connected&&state.hostLatency!==undefined?` · ${state.hostLatency} ms`:''}</small></span>
  <button type="button" className="mp-chip-button" onClick={onAdvanced} aria-label="Connection and profile settings" title="Connection and profile settings"><Icon id="i-signal"/></button>
 </div>;
}

/** Readiness: icon shape + word + colour. */
export function Readiness({ready,assets}:{ready:boolean;assets:boolean}){
 const state=ready&&assets?'ready':ready?'loading':'waiting';
 return <span className={`network-readiness mp-ready ${state==='ready'?'ready':''}`} data-state={state}><i aria-hidden="true"/>{state==='ready'?'Ready':state==='loading'?'Loading':'Waiting'}</span>;
}

/** Big invite code with Copy; the raw ID/code inputs stay for power users and tests. */
export function InviteCode({controller,state}:{controller:NetworkController;state:NetworkState}){
 const lobby=state.lobby!;let code='';try{code=controller.inviteString()}catch{code=lobby.id}
 return <div className="mp-invite">
  <KitInviteCode className="mp-invite-kit" label={lobby.private?'Private invite code':'Invite code'} value={code} inputLabel="Invite code to share" copyValue={controller.inviteText()} copyLabel="Copy invite" copyAriaLabel="Copy invite"/>
  <details className="mp-details mp-invite-raw"><summary>Lobby ID and access code</summary><label>Lobby ID<input aria-label="Current lobby ID" value={lobby.id} readOnly/></label>{state.joinCode&&<label>Access code<input aria-label="Current access code" value={state.joinCode} readOnly/></label>}</details>
 </div>;
}
