import {useEffect,useState} from 'react';
import type {NetworkController,NetworkState} from '../../app/network-controller';
import {useObservable} from '../../app/store';
import {networkOperationPresentation} from '../../app/session-presentation';
import './network-battle-status.css';

/** Status is authoritative only for a connected, unfinished player session. */
export function sharedPausePresentation(state:NetworkState){
 if(!networkOperationPresentation(state).statusCurrent||!state.status?.pauseEnabled)return;
 const status=state.status,own=state.lobby?.slots.find(slot=>slot.profile===state.account?.profile?.id),voted=!!own&&status.pauseVotes.includes(own.player);
 const voters=status.pauseVotes.map(player=>state.lobby?.slots.find(slot=>slot.player===player)?.name??String(player)).join(', ');
 const policy=state.lobby?.mode==='coop'?'Every connected, active human commander must agree.':'Every active human commander must be connected and agree.';
 return {paused:status.paused,voted,pending:!status.paused&&status.pauseVotes.length>0,canVote:!!own&&!voted&&!status.waitingForPlayers,
  text:status.paused?'PAUSED · Shared operation paused for every commander. Any active commander can resume.':`${voters?`Pause requested by ${voters}. `:''}${policy} The server pauses everyone automatically.`};
}

/** Render inside the HUD feed so votes remain discoverable outside the pause menu. */
export function NetworkBattleStatus({controller,online}:{controller:NetworkController;online:boolean}){
 const state=useObservable(controller.state),[now,setNow]=useState(()=>performance.now());
 const alerts=state.presenceAlerts??[];
 useEffect(()=>{if(!alerts.length)return;const timer=setInterval(()=>setNow(performance.now()),1000);return()=>clearInterval(timer)},[alerts.length>0]);
 if(!online||!networkOperationPresentation(state).statusCurrent)return null;
 const pause=sharedPausePresentation(state);
 return <div className="network-battle-status" aria-label="Online commander notices">
  {pause&&(pause.paused||pause.pending)&&<section className="network-pause-notice" role="status"><div><strong>{pause.paused?'PAUSED':pause.voted?'Pause vote submitted':'Shared pause requested'}</strong><p>{pause.text}</p></div>
   {pause.paused?<button disabled={!!state.busy} onClick={()=>void controller.pause(false)}>Resume operation</button>:pause.voted?<button disabled={!!state.busy} onClick={()=>void controller.pause(false)}>Withdraw pause vote</button>:<button disabled={!!state.busy||!pause.canVote} onClick={()=>void controller.pause(true)}>Agree to pause</button>}
  </section>}
  {alerts.filter(alert=>Math.max(now,performance.now())-alert.at<10000).map(alert=><div className="network-presence-notice" role="status" key={alert.id}>{alert.text}</div>)}
 </div>;
}
