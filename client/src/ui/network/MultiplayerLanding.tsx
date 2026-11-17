// Multiplayer landing (Lane E): Host / Join / Browse, with the auto-profile identity strip.
import {useId,useState} from 'react';
import type {NetworkController,NetworkState} from '../../app/network-controller';
import {isDefaultBattlefield} from '../../app/release-scope';
import type {Faction} from '../../runtime/types';
import {KitIcon as Icon} from '../menu/kit/icon';
import {EmptyState} from '../menu/kit/Panel';
import {RecordedOperations} from './recorded-results';
import {FactionOptions,SectionHead,lobbyCapacity,modeLabel,useCopy} from './kit';

type Common={controller:NetworkController;state:NetworkState};
export type Draft={name:string;setName:(value:string)=>void;remember:boolean};

/** "Playing as": optional before the first Host/Join, which create the profile automatically. */
export function IdentityBar({controller,state,draft,onAdvanced}:Common&{draft:Draft;onAdvanced:()=>void}){
 const account=state.account,profile=account?.profile,[restore,setRestore]=useState(false),[token,setToken]=useState(''),{copied,copy}=useCopy();
 const busy=!!state.busy;
 if(profile)return <section className="mp-identity" data-state="signed-in" aria-label="Your commander">
  <span className="mp-identity-mark" aria-hidden="true"><Icon id="i-users"/></span>
  <div className="mp-identity-name"><span className="mp-eyebrow">Playing as</span><strong>{profile.name}</strong><small>{account?.phase==='offline'?'Host connection lost':account?.persistent?'Remembered on this browser':'This browser session only'}</small></div>
  <div className="mp-identity-id"><label>Profile ID<input aria-label="Your profile ID" readOnly value={profile.id} spellCheck={false}/></label><button type="button" className="mp-icon-button" aria-label="Copy profile ID" title="Copy profile ID — share it to add contacts" onClick={()=>void copy('id',profile.id)}><Icon id={copied==='id'?'i-check':'i-copy'}/></button></div>
  <button type="button" className="mp-quiet" onClick={onAdvanced}>Profile &amp; sign-in key</button>
  {account?.error&&<p className="network-warning">{account.error.message}</p>}
 </section>;
 return <section className="mp-identity" data-state="guest" aria-label="Your commander">
  <span className="mp-identity-mark" aria-hidden="true"><Icon id="i-users"/></span>
  {restore?<form className="mp-identity-form" onSubmit={event=>{event.preventDefault();const value=token;setToken('');void controller.restoreProfile(value,draft.remember)}}>
   <label>Local profile token<input aria-label="Local profile token" type="password" autoComplete="off" maxLength={64} value={token} onChange={event=>setToken(event.target.value)} required/></label>
   <button type="submit" disabled={busy||!state.connected}>Restore profile</button>
   <button type="button" className="text-button mp-link" onClick={()=>{setRestore(false);setToken('')}}>Create a new profile</button>
  </form>:<form className="mp-identity-form" onSubmit={event=>{event.preventDefault();const name=draft.name.trim();void(name&&!draft.remember?controller.createProfile(name,false):controller.ensureProfile(name||undefined))}}>
   <label>Commander name<input aria-label="Commander name" type="text" autoComplete="nickname" maxLength={32} value={draft.name} placeholder={state.commanderName||'Assigned automatically'} onChange={event=>draft.setName(event.target.value)}/></label>
   <button type="submit" disabled={busy||!state.connected}>Create local profile</button>
   <button type="button" className="text-button mp-link" onClick={()=>{setRestore(true);setToken('')}}>Restore an existing token</button>
   <span className="mp-identity-hint">Optional · created automatically when you host or join</span>
   <label className="file-action mp-file">Import private sign-in key<input type="file" aria-label="Import private sign-in key" disabled={busy||!state.connected} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void controller.restoreSignInKey(file,draft.remember)}}/></label>
  </form>}
  {account?.error&&<p className="network-warning">{account.error.message}</p>}
 </section>;
}

/** Inline join: one invite field, optional faction/team, Enter to join. */
/** One-line partner join used on the co-op screen (scenario fixes faction and team). */
export function JoinStrip({controller,state,draft}:Common&{draft:Draft}){
 const [invite,setInvite]=useState('');
 return <form className="mp-join-strip" onSubmit={event=>{event.preventDefault();void controller.joinCoop(invite,{},draft.name.trim()||undefined)}}>
  <span className="mp-entry-icon"><Icon id="i-network"/></span><strong>Joining a partner?</strong>
  <label className="mp-invite-field mp-inline-select">Invite code<input aria-label="Invite code" value={invite} onChange={event=>setInvite(event.target.value)} placeholder="Paste the code from the mission host" required spellCheck={false} autoComplete="off" autoCapitalize="off"/></label>
  <button className="primary" aria-label="Join by ID" disabled={!!state.busy||!!state.lobby||!invite.trim()}><Icon id="i-play"/>Join</button>
 </form>;
}

export function JoinCard({controller,state,draft,heading='Join game',hint='Paste the invite code your host copied for you.'}:Common&{draft:Draft;heading?:string;hint?:string}){
 const titleId=useId(),[invite,setInvite]=useState(''),[code,setCode]=useState(''),[faction,setFaction]=useState<Faction|'random'>('random'),[team,setTeam]=useState(0);
 const options={faction,...(team?{team}:{})},name=draft.name.trim()||undefined;
 return <form className="mp-entry-card mp-join" aria-labelledby={titleId} onSubmit={event=>{event.preventDefault();if(code.trim())void controller.joinLobby(invite,{...options,code:code.trim()},name);else void controller.joinByCode(invite,options,name)}}>
  <div className="mp-entry-title"><span className="mp-entry-icon"><Icon id="i-network"/></span><div><h3 id={titleId}>{heading}</h3><p>{hint}</p></div></div>
  <div className="mp-join-code"><label className="mp-invite-field">Invite code<input aria-label="Invite code" value={invite} onChange={event=>setInvite(event.target.value)} placeholder="Paste the code from your host" required spellCheck={false} autoComplete="off" autoCapitalize="off"/></label>
   <button className="primary" aria-label="Join by ID" disabled={!!state.busy||!!state.lobby||!invite.trim()}><Icon id="i-play"/>Join</button></div>
  <div className="mp-join-row">
   <label className="mp-inline-select">Faction<select aria-label="Join faction" value={faction} onChange={event=>setFaction(event.target.value as typeof faction)}><FactionOptions/></select></label>
   <label className="mp-inline-select">Team<select aria-label="Join team" value={team} onChange={event=>setTeam(Number(event.target.value))}><option value={0}>Auto</option>{[1,2,3,4].map(value=><option key={value} value={value}>Team {value}</option>)}</select></label>
  </div>
  <details className="mp-details"><summary>Have a separate access code?</summary><label>Access code<input aria-label="Join access code" value={code} onChange={event=>setCode(event.target.value)} autoComplete="off" spellCheck={false}/></label></details>
 </form>;
}

function OpenGames({controller,state,draft}:Common&{draft:Draft}){
 const signedIn=!!state.account?.profile,available=state.lobbies.filter(lobby=>lobby.id!==state.lobby?.id&&(!!lobby.scenario_id||isDefaultBattlefield(lobby.map_id)));
 return <section className="mp-browse" aria-labelledby="mp-browse-title">
  <SectionHead id="mp-browse-title" title="Open games on this host" aside={signedIn&&<button type="button" className="mp-quiet" disabled={!!state.busy} onClick={()=>void controller.refresh()}><Icon id="i-refresh"/>Refresh</button>}/>
  {!signedIn?<EmptyState className="mp-empty" action={<button type="button" disabled={!!state.busy} onClick={()=>void controller.ensureProfile(draft.name.trim()||undefined)}>Show open games</button>}>Games hosted here appear once you have a commander profile.</EmptyState>
  :available.length?<div className="network-lobby-list mp-game-list" role="list">{available.map(lobby=>{
   const map=state.maps.find(value=>value.id===lobby.map_id),capacity=lobbyCapacity(lobby.mode,map?.players,lobby.slots.length),host=lobby.slots.find(slot=>slot.profile===lobby.host)?.name,running=!!lobby.match_id;
   return <div key={lobby.id} role="listitem" className="network-lobby-list-row mp-game-row" data-running={running||undefined}>
    <div className="mp-game-name"><strong>{lobby.name}</strong><small>{host?`Hosted by ${host}`:'Hosted game'}{lobby.private?' · Private':''}</small></div>
    <span className="mp-tag">{modeLabel(lobby.mode)}</span>
    <span className="mp-game-map">{map?.title??lobby.map_id}</span>
    <span className="mp-game-seats" aria-label={`${lobby.slots.length} of ${capacity} commanders`}><Icon id="i-users"/>{lobby.slots.length} / {capacity}</span>
    {running?<span className="mp-tag" data-tone="live">In progress</span>:lobby.slots.length>=capacity?<span className="mp-tag">Full</span>:<button type="button" aria-label="Join operation" disabled={!!state.busy||!!state.lobby} onClick={()=>void controller.joinLobby(lobby.id,{},draft.name.trim()||undefined)}>Join</button>}
   </div>})}</div>
  :<EmptyState className="mp-empty">No open games right now. Host one, or ask your host for an invite code.</EmptyState>}
 </section>;
}

export function Invitations({controller,state}:Common){
 if(!state.invites.length)return null;
 return <section className="mp-banner" data-tone="info" aria-label="Lobby invitations"><Icon id="i-users"/><div className="mp-banner-copy">{state.invites.map(invite=><div key={invite.id} className="mp-invite-row"><span><strong>{invite.sender_name}</strong> invited you to <strong>{invite.lobby_name}</strong></span><div className="button-row"><button className="primary" disabled={!!state.busy||!!state.lobby&&state.lobbyState!=='completed'} onClick={()=>void controller.acceptInvite(invite.id)}>Accept invitation</button><button disabled={!!state.busy} onClick={()=>void controller.dismissInvite(invite.id)}>Dismiss</button></div></div>)}</div></section>;
}

export function RemovedBanner({state}:{state:NetworkState}){
 const [hidden,setHidden]=useState(false);
 return state.removedFromLobby&&!hidden?<div className="mp-banner" data-tone="warn" role="status"><Icon id="i-alert"/><div className="mp-banner-copy"><strong>Removed from lobby</strong><p>The host removed you from this lobby. Join another game or host your own.</p></div><button type="button" className="mp-banner-close" aria-label="Dismiss notice" onClick={()=>setHidden(true)}><Icon id="i-close"/></button></div>:null;
}

export function MultiplayerLanding({controller,state,draft,onHost,onAdvanced}:Common&{draft:Draft;onHost:()=>void;onAdvanced:()=>void}){
 return <div className="mp-landing">
  <IdentityBar controller={controller} state={state} draft={draft} onAdvanced={onAdvanced}/>
  <RemovedBanner state={state}/>
  <Invitations controller={controller} state={state}/>
  <div className="mp-landing-grid">
   <div className="mp-entry-stack">
    <button type="button" className="mp-entry-card mp-host" aria-label="Host game" aria-describedby="mp-host-copy" disabled={!!state.busy} onClick={onHost}>
     <span className="mp-entry-title"><span className="mp-entry-icon"><Icon id="i-flag-checker"/></span><span><strong>Host game</strong><span id="mp-host-copy">Pick a battlefield, add AI and share one invite code. Up to four commanders.</span></span></span>
     <span className="mp-entry-go" aria-hidden="true">Create lobby<Icon id="i-chevron-right"/></span>
    </button>
    <JoinCard controller={controller} state={state} draft={draft}/>
   </div>
   <div className="mp-browse-stack">
    <OpenGames controller={controller} state={state} draft={draft}/>
    {!state.account?.profile&&<ol className="mp-steps" aria-label="How multiplayer works"><li><b>1</b><span><strong>Host or paste a code</strong>The host shares one invite code. Your commander profile is created for you.</span></li><li><b>2</b><span><strong>Choose and ready up</strong>Pick faction, team, color and start, then press Ready to deploy.</span></li><li><b>3</b><span><strong>Host starts</strong>When every commander is ready, the host starts and everyone deploys together.</span></li></ol>}
    {state.account?.profile&&<RecordedOperations controller={controller}/>}
   </div>
  </div>
 </div>;
}
