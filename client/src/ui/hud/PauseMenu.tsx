import {randomUUID} from '../../runtime/crypto';
import {useEffect,useState} from 'react';
import type {LocalSaveSummary} from '../../runtime/storage';
import {formatClock} from '../../content/labels';
import {NetworkMatchPanel,NetworkObserverPanel} from '../network';
import {AutosaveRecovery} from '../AutosaveRecovery';
import {Emblem,Icon,Modal} from '../primitives';
import {shortcutBadgeLabel} from '../shortcut-presentation';
import type {BattleView} from './battle-view';

const SPEEDS=[.75,1,1.5] as const;
/** Pause / network / observer menu (design-audit-hud §2.10, H19): one primary
 * action, grouped secondary actions with keycaps, a 3-segment speed control,
 * danger actions separated at the bottom and the rules/autosave lines folded
 * into a single footer. */
export function PauseMenu({view}:{view:BattleView}){
 const {app,state,setSurrender,pause,setPause,setSettings,chatTeamOnly,control,snapshot,faction,surrenderUnavailable,escapeKey}=view;
 const [load,setLoad]=useState(false);
 if(!pause)return false;
 const kind=state.session.kind??'',networked=['online','observer'].includes(kind),local=!networked,canSave=kind!=='replay'&&local;
 const bindings=state.settings.bindings.keys,saveKey=bindings.quick_save?.[0];
 const close=()=>{setLoad(false);setPause(false);if(local)void control.closePause().catch(error=>app.error(error))};
 const resume=()=>{setLoad(false);setPause(false);if(local)void control.resume().catch(error=>app.error(error))};
 const rules=state.session.info?.starting_credits!==undefined?`${state.session.info.metadata?.ruleset==='custom-v1'?'Custom rules':'Standard rules'} · ${state.session.info.starting_credits.toLocaleString('en-US')} starting credits each`:undefined;
 const title=kind==='observer'?'Observer controls':kind==='online'?'Network operation':'Operation paused';
 return <Modal title={title} onClose={close}>
  <div className="pause-sheet" data-hud="pause">
   <header className="pause-ident"><Emblem faction={faction}/><div><strong>{state.session.map?.title??'Operation'}</strong><span className="pause-clock">{formatClock(snapshot?.tick??0)}</span></div></header>
   {kind==='online'&&<NetworkMatchPanel controller={app.network} initialTeamOnly={chatTeamOnly}/>}
   {kind==='observer'&&<NetworkObserverPanel controller={app.network}/>}
   {kind==='online'&&<p className="pause-note">Opening this menu keeps the operation live. With shared pause enabled, every eligible human commander must agree; the server then pauses everyone automatically.</p>}
   <div className="pause-menu">
    <button className="primary pause-resume" onClick={resume}><Icon id="i-play"/><span>{networked?'Return to battlefield':'Resume operation'}</span>{escapeKey&&<kbd aria-hidden="true">{escapeKey}</kbd>}</button>
    <div className="pause-group" role="group" aria-label="Operation">
     {canSave&&<button onClick={()=>void app.save(`${state.session.map?.title??'Operation'} · ${formatClock(snapshot?.tick??0)}`)}><Icon id="i-save"/><span>Save operation</span>{saveKey&&<kbd aria-hidden="true">{shortcutBadgeLabel(saveKey)}</kbd>}</button>}
     {canSave&&<button onClick={()=>setLoad(true)}><Icon id="i-save"/><span>Load operation…</span></button>}
     <button onClick={()=>setSettings(true)}><Icon id="i-gear"/><span>Options</span></button>
     {local&&<div className="pause-speed" role="radiogroup" aria-label="Game speed"><span aria-hidden="true">Speed</span>{SPEEDS.map(speed=><button key={speed} role="radio" aria-checked={state.speed===speed} className={state.speed===speed?'active':''} onClick={()=>void app.sessions.setSpeed(speed).catch(error=>app.error(error))}>{speed}×</button>)}</div>}
    </div>
    {local&&<div className="pause-group" role="group" aria-label="Records">
     {canSave&&<button onClick={()=>void app.task('Restarting operation…',async()=>{await app.restartOperation()})}><Icon id="i-refresh"/><span>Restart operation</span></button>}
     <button onClick={()=>void app.task('Archiving replay…',async()=>{await app.sessions.archiveReplay(randomUUID(),state.session.map?.title??'Operation');app.patch({notice:'Replay stored in your local archive.'})})}><Icon id="i-replay"/><span>Archive replay</span></button>
    </div>}
    <div className="pause-group pause-danger" role="group" aria-label="Leave">
     {(kind==='solo'||kind==='practice')&&!snapshot?.outcome?.finished&&<button className="danger" disabled={!!surrenderUnavailable} onClick={()=>setSurrender(true)}><Icon id="i-flag-checker"/><span>Surrender commander…</span></button>}
     <button className="danger" onClick={()=>void app.leave()}><Icon id="i-close"/><span>{app.editor.state.get().testActive?'Return to editor':'Return to command center'}</span></button>
    </div>
    {(kind==='solo'||kind==='practice')&&surrenderUnavailable&&<p className="pause-note" role="status">{surrenderUnavailable}</p>}
   </div>
   {(local||rules)&&<footer className="pause-footer">{rules&&<span>{rules}</span>}{local&&<span>Autosave: {state.autosave??'waiting'}</span>}</footer>}
   <AutosaveRecovery app={app} state={state}/>
   {load&&canSave&&<OperationLoads view={view} onClose={()=>setLoad(false)}/>}
  </div>
 </Modal>;
}

/** Metadata-only listing; the existing session loader validates the selected save. */
export function OperationLoads({view,onClose}:{view:BattleView;onClose:()=>void}){
 const {app,state}=view,[saves,setSaves]=useState<LocalSaveSummary[]>(),[error,setError]=useState<string>();
 useEffect(()=>{let current=true;void app.store.listSaveSummaries().then(records=>{if(current)setSaves(records)},()=>{if(current)setError('Saved operations could not be read. Close this list and try again.')});return()=>{current=false}},[app]);
 return <Modal title="Load operation" onClose={onClose}><div className="pause-menu">
  <p>Loading replaces this operation. Save it first if you want to return to it.</p>
  {error?<p role="alert">{error}</p>:!saves?<p role="status">Reading saved operations…</p>:!saves.length?<p role="status">No saved operations in this browser.</p>:saves.map(save=><button key={save.id} disabled={!!state.busy||!save.metadata?.ruleset} onClick={()=>void app.task('Loading operation…',async()=>{await app.sessions.flushAutosave();await app.sessions.continueSave(save.id)})}><Icon id="i-save"/><span>{save.name} · {formatClock(save.tick)}</span></button>)}
  <button onClick={onClose}><Icon id="i-chevron-left"/><span>Back to pause menu</span></button>
 </div></Modal>;
}
