import type {CSSProperties} from 'react';
import {randomUUID} from '../../runtime/crypto';
import {OfflineTransport} from '../../runtime/offline';
import {credits,formatClock} from '../../content/labels';
import {ownerTeamColor} from '../../design/team-colors';
import {DebriefStats} from '../DebriefStats';
import {MissionDebrief,debriefFollowUps} from '../MissionDebrief';
import {NetworkMatchPanel} from '../network';
import {CommanderResultCue,TrainingFocus} from '../CommanderProgress';
import {Emblem,Modal} from '../primitives';
import type {BattleView} from './battle-view';

const plural=(count:number|bigint,word:string)=>`${word}${Number(count)===1?'':'s'}`;
const sentence=(text:string)=>{const value=text.replaceAll('_',' ').trim();return value?value[0].toUpperCase()+value.slice(1):value};
/** End-of-operation debrief (design-audit-hud §2.10, H20): a result banner
 * (VICTORY brass / DEFEAT oxide / DRAWN steel) with emblem, map, duration and
 * reason, then one row per commander with a team-colour stripe, the existing
 * charts and mission notes. The actions sit right under the summary so
 * Command center (primary) is visible without scrolling (research rule 2).
 * Solo missions add Retry, and Next operation / Next lesson after a victory
 * (which then becomes the single primary). */
export function DebriefModal({view}:{view:BattleView}){
 const {app,state,debrief,setDebrief,snapshot,player,faction}=view;
 if(!debrief||!snapshot?.outcome)return false;
 const outcome=snapshot.outcome,observer=state.session.kind==='observer';
 const result=observer?'observed':outcome.draw?'drawn':player?.team===outcome.winningTeam?'victory':'defeat';
 const title=observer?'Observed operation ended':outcome.draw?'Operation drawn':result==='victory'?'Victory':'Defeat';
 const word=observer?'Operation ended':outcome.draw?'Drawn':result==='victory'?'Victory':'Defeat';
 const players=snapshot.players,palette=state.settings.palette,editorTest=app.editor.state.get().testActive;
 // Campaign / training follow-ups (records lane). After a victory with a successor, Next is the one primary.
 const follow=editorTest?undefined:debriefFollowUps(app,state),nextFirst=!!follow?.next;
 const runtime=app.sessions.transport,canWatch=runtime instanceof OfflineTransport;
 return <Modal title={title} wide onClose={()=>setDebrief(false)}>
  <div className="debrief-sheet" data-result={result} data-hud="debrief">
   <header className="debrief-banner">
    <Emblem faction={faction}/>
    <div><span className="debrief-kicker">{state.session.map?.title??'Operation'}</span><strong className="debrief-result" aria-hidden="true">{word}</strong><p>{sentence(outcome.reason)} · <span className="debrief-clock">{formatClock(snapshot.tick)}</span></p></div>
   </header>
   {state.session.kind==='online'&&<NetworkMatchPanel controller={app.network}/>}
   {!!snapshot.debrief?.players.length&&<table className="debrief-table"><thead><tr><th>Commander</th><th>Income</th><th>Spent</th><th>Lost</th><th>Surviving</th></tr></thead><tbody>{snapshot.debrief.players.map(row=><tr key={row.player} data-own={row.player===snapshot.player||undefined} style={{'--row-team':ownerTeamColor(row.player,players,palette).css} as CSSProperties}><td>{row.name}{row.player===snapshot.player&&<small> · you</small>}</td><td>{credits(row.income)}</td><td>{credits(row.spent)}</td><td>{credits(row.lostValue)}</td><td>{row.unitsSurviving} {plural(row.unitsSurviving,'unit')} · {row.structuresSurviving} {plural(row.structuresSurviving,'structure')}</td></tr>)}</tbody></table>}
   <div className="button-row debrief-actions">
    {follow?.next&&<button className="primary" title={follow.next.title} onClick={follow.next.run}>{follow.next.label}</button>}
    <button className={nextFirst?undefined:'primary'} onClick={()=>void app.leave()}>{editorTest?'Return to editor':'Command center'}</button>
    {follow&&<button onClick={follow.retry.run}>{follow.retry.label}</button>}
    {!editorTest&&!follow&&state.session.kind==='solo'&&<button onClick={()=>void app.task('Restarting operation…',async()=>{await app.restartOperation()})}>Rematch</button>}
    {canWatch&&<button onClick={()=>void app.task('Opening replay…',async()=>{const id=state.session.id;await app.sessions.flushAutosave();const data=await runtime.exportReplay();if(app.sessions.state.id!==id)throw Error('The operation changed before replay playback.');await app.sessions.playReplay(data)})}>Watch replay</button>}
    {!['online','observer'].includes(state.session.kind??'')&&<button onClick={()=>void app.task('Archiving replay…',async()=>{await app.sessions.archiveReplay(randomUUID(),state.session.map?.title??'Operation');app.patch({notice:'Replay archived.'})})}>Save replay</button>}
    <button onClick={()=>setDebrief(false)}>Inspect battlefield</button>
   </div>
   <DebriefStats app={app}/>
   <MissionDebrief snapshot={snapshot}/>
   <TrainingFocus focus={state.activeChallenge} snapshot={snapshot}/>
   <CommanderResultCue app={app}/>
  </div>
 </Modal>;
}
