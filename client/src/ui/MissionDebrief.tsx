import type {Application,ApplicationState} from '../app/application';
import type {PlayerSnapshot} from '../runtime/types';
import {Icon} from './primitives';
import {Button} from './menu/kit/Button';
import {readRecordsMemory} from './records/shared';

/** Final public objective flags only; this recap never awards or decides results. */
export function MissionDebrief({snapshot}:{snapshot?:Pick<PlayerSnapshot,'mission'|'outcome'>}){
 const mission=snapshot?.outcome?.finished?snapshot.mission:undefined;
 if(!mission)return null;
 const rank=(objective:{optional?:boolean;failure?:boolean})=>objective.failure?2:objective.optional?1:0;
 const objectives=[...mission.objectives].sort((a,b)=>rank(a)-rank(b));
 const required=mission.objectives.filter(objective=>!objective.failure&&!objective.optional),met=required.filter(objective=>objective.complete).length;
 return <section className="rec-mission-debrief" aria-label="Mission objective results"><h3 className="rec-section-title"><Icon id="i-objective"/>Objectives <span className="rec-count">{met} / {required.length} required complete</span></h3><p className="rec-muted">{mission.title}</p><ul className="briefing-objectives rec-debrief-objectives">{objectives.map(objective=>{
  const category=objective.failure?'Failure condition':objective.optional?'Optional objective':'Required objective';
  const status=objective.failure?objective.complete?'Failed':'Not triggered':objective.complete?'Completed':'Not completed';
  const tone=objective.failure?objective.complete?'failed':'clear':objective.complete?'done':'open';
  return <li key={objective.id} data-tone={tone}><span className="rec-objective-mark" aria-hidden="true"><Icon id={tone==='done'?'i-check':tone==='failed'?'i-close':tone==='clear'?'i-shield':objective.optional?'i-trophy':'i-objective'}/></span><span>{objective.text}<small>{category} · {status}</small></span></li>;
 })}</ul></section>;
}

/** Campaign and training follow-ups for the debrief action row: Retry, and Next operation after a victory.
 * Presentation only: the next entry comes from the installed index; Go still validates the launch. */
export interface DebriefFollowUp{label:string;title?:string;run:()=>void}
/** Retry (always, for solo missions) and Next operation / Next lesson (after a victory with a successor).
 * Undefined for skirmish-like, online and observer sessions or before the operation is finished. */
export function debriefFollowUps(app:Application,state:ApplicationState):{retry:DebriefFollowUp;next?:DebriefFollowUp}|undefined{
 const snapshot=state.snapshot,mission=snapshot?.mission,outcome=snapshot?.outcome;
 if(!mission||!outcome?.finished||state.session.kind!=='solo')return undefined;
 const entry=state.index?.missions.find(value=>value.id===mission.id),player=snapshot.players.find(value=>value.id===snapshot.player);
 const victory=!outcome.draw&&player?.team===outcome.winningTeam&&outcome.reason==='mission_complete';
 const next=entry&&entry.mode!=='coop'?state.index?.missions.find(value=>value.mode===entry.mode&&value.order===entry.order+1&&(entry.mode!=='campaign'||value.faction===entry.faction)):undefined;
 // Prefer the difficulty Go reports for the operation just played; fall back to the remembered choice.
 const difficulty=app.activeMissionDifficulty()??(entry?.mode==='tutorial'?readRecordsMemory().trainingDifficulty:app.campaignDifficulty())??'normal';
 return {
  retry:{label:victory?'Play again':'Retry operation',run:()=>void app.task('Restarting operation…',async()=>{await app.restartOperation()})},
  next:victory&&next?{label:entry?.mode==='tutorial'?'Next lesson':'Next operation',title:`Open the briefing for ${next.title}`,run:()=>void (async()=>{await app.leave();await app.mission(next.id,difficulty)})().catch(error=>app.error(error))}:undefined,
 };
}
export function DebriefNextActions({app,state,primary=false}:{app:Application;state:ApplicationState;primary?:boolean}){
 const follow=debriefFollowUps(app,state);if(!follow)return null;
 return <span className="rec-debrief-next">
  <Button icon="i-refresh" onClick={follow.retry.run}>{follow.retry.label}</Button>
  {follow.next&&<Button variant={primary?'primary':'secondary'} icon="i-play" title={follow.next.title} onClick={follow.next.run}>{follow.next.label}</Button>}
 </span>;
}
