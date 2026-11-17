// Global stylesheet order (must stay the FIRST imports of this module, before any component import):
// tokens → game (legacy base) → menu kit/shell → lane and component sheets, so every revamp sheet wins
// ties with game.css without specificity hacks. Components keep their own CSS imports for isolated use;
// Vite evaluates each sheet once, at its first import, so this list fixes the cascade order in dev and build.
// main.tsx imports tokens.css and game.css again after App; those repeats are deduplicated no-ops.
import '../design/tokens.css';
import '../styles/game.css';
import '../styles/menu.css';
import '../styles/records.css';
import './commander-progress.css';
import './network/recorded-results.css';
import '../styles/hud.css';
import './production-tabs.css';
import './actor-status-details.css';
import './team-preview.css';
import './hauler-controls.css';
import '../styles/hud-tray.css';
import './strike-review.css';
import './network/network.css';
import '../styles/skirmish.css';
import {useEffect,useState} from 'react';
import {bindMenuHistory,type Application,type ApplicationState} from '../app/application';
import {topmostModal} from '../runtime/keybindings';
import {useObservable} from '../app/store';
import {Briefing} from './Briefing';
import {Icon,Modal} from './primitives';
import {BattleInformation} from './hud/BattleInformation';
import {BattleScreen} from './hud/BattleScreen';
import {MenuShell} from './menu/MenuShell';
import {FirstRun} from './menu/FirstRun';
/** Keep support codes selectable without making them part of the default player message. */
export function GlobalError({error,onClose}:{error:NonNullable<ApplicationState['error']>;onClose:()=>void}){
 return <Modal alert title="Command interrupted" onClose={onClose}><p>{error.message}</p><p className="muted">Your existing saves and installed files are preserved.</p><details><summary>Details</summary><code>{error.code}</code></details><button className="primary" onClick={onClose}>Acknowledge</button></Modal>;
}
/** Thin root. Menus live in ./menu (MenuShell, screen-router, screens); the battle HUD lives in ./hud
 * (BattleScreen + one file per region). See work/beta-2026-10-31/revamp-00-split.md for the file map. */
export function App({app}:{app:Application}){
 const state=useObservable(app.state),[alertsHost,setAlertsHost]=useState<HTMLDivElement|null>(null),[ordersHost,setOrdersHost]=useState<HTMLDivElement|null>(null),[targetHost,setTargetHost]=useState<HTMLDivElement|null>(null);
 const battlefield=!!(state.session.id&&state.session.map&&state.catalog);
 const preparing=!!(state.busy||state.booting||state.assetProgress||state.session.phase==='loading');
 useEffect(()=>bindMenuHistory(app,window,()=>!!topmostModal()),[app]);
 useEffect(()=>{if(!state.notice||preparing)return;const timer=setTimeout(()=>app.patch({notice:undefined}),8000);return()=>clearTimeout(timer)},[app,state.notice,preparing]);
 return <><BattleInformation app={app} battlefield={battlefield} captions={state.settings.captions} onAlertsHost={setAlertsHost} onOrdersHost={setOrdersHost} onTargetHost={setTargetHost}/><div className="game-shell">{battlefield?<BattleScreen key={state.session.id} app={app} alertsHost={alertsHost} ordersHost={ordersHost} targetHost={targetHost}/>:<MenuShell app={app}/>}</div>
{state.firstRun&&!state.booting&&<FirstRun app={app}/>}
 {state.briefing&&<Briefing app={app}/>}
 {(state.busy||state.booting||state.assetProgress)&&<div className="loading-screen" role="status"><div className="loading-marker"/><span>{state.assetProgress??state.busy??'Starting Frontline Command…'}</span>{state.session.phase==='loading'&&<button onClick={()=>app.sessions.cancelLaunch()}>Cancel loading</button>}</div>}
 {state.error&&<GlobalError error={state.error} onClose={()=>app.patch({error:undefined})}/>}
 {state.notice&&<div className={`notice ${state.session.id?'in-game':''}`} role="status"><Icon id="i-info"/><span>{state.notice}</span><button onClick={()=>app.patch({notice:undefined})} aria-label="Dismiss notification">×</button></div>}
 </>;
}
