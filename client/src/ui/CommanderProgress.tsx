import {useEffect,useState} from 'react';
import type {Application,ApplicationState} from '../app/application';
import type {CommanderChallengeFocus} from '../app/commander-challenges';
import type {CommanderOverview,CommanderChallenge} from '../runtime/commander-progress';
import type {Difficulty,Faction,PlayerSnapshot} from '../runtime';
import {FACTIONS} from '../content/labels';
import {useObservable} from '../app/store';
import {Icon,Emblem} from './primitives';
import './commander-progress.css';

const number=(value:number)=>value.toLocaleString('en-US');
export function ChallengeCards({challenges,difficulty,onChallenge}:{challenges:readonly CommanderChallenge[];difficulty:Difficulty;onChallenge:(id:string,difficulty:Difficulty)=>void}){
 return <div className="challenge-list">{challenges.map(challenge=><section key={challenge.id} className="challenge-card" aria-label={challenge.title}><h4>{challenge.title}</h4><p>{challenge.description}</p><small>{challenge.complete?'Exercise goal earned in your story record.':challenge.unlocked?'Unlocked · win the operation with its optional exercise goal.':'Complete this campaign operation to unlock its exercise.'}</small><div className="button-row"><button disabled={!challenge.unlocked} onClick={()=>onChallenge(challenge.id,difficulty)}>{challenge.complete?'Attempt again':'Attempt field exercise'}</button></div></section>)}</div>;
}

/** The view receives derived records only; it has no access to combat state. */
export function CommanderProgressView({overview,faction,difficulty,onFaction,onDifficulty,onChallenge}:{overview:CommanderOverview;faction:Faction;difficulty:Difficulty;onFaction:(faction:Faction)=>void;onDifficulty:(difficulty:Difficulty)=>void;onChallenge:(id:string,difficulty:Difficulty)=>void}){
 const selected=overview.factions.find(value=>value.faction===faction);
 if(!selected)return <p role="status">This faction has no installed command record.</p>;
 return <div className="commander-record"><p className="record-intro">Your story records unlock cosmetic badges and focused field exercises. Faction mastery records useful actions from completed operations. All factions and combat options are available from the start.</p><div className="record-factions" role="group" aria-label="Faction command records">{overview.factions.map(value=><button key={value.faction} aria-pressed={faction===value.faction} onClick={()=>onFaction(value.faction)}><Emblem faction={value.faction}/>{FACTIONS[value.faction].name}</button>)}</div><h3>{FACTIONS[faction].name} mastery</h3><dl className="mastery-counts"><div><dt>Completed operations</dt><dd>{number(selected.matches)}</dd></div><div><dt>Campaign operations complete</dt><dd>{selected.campaignMissions} / {selected.campaignTotal}</dd></div><div><dt>Largest shared terrain survey</dt><dd>{number(selected.tilesSurveyed)} tiles</dd></div><div><dt>Units present at operation end</dt><dd>{number(selected.unitsAtEnd)}</dd></div><div><dt>Missile interception shots</dt><dd>{number(selected.interceptorShots)}</dd></div><div><dt>Team mission objectives completed</dt><dd>{number(selected.objectivesCompleted)}</dd></div></dl><p className="mastery-note">Survey counts include initial and allied sight. Surviving-unit counts include utility and temporary units. Interception shots count launches rather than confirmed hits. Mastery is stored in this browser; badges and exercise goals follow your campaign story record. These records grant no combat bonuses.</p><h3>Cosmetic story badges</h3><ul className="record-badges">{selected.badges.map(badge=><li key={badge.id} className="record-badge" data-earned={badge.earned}><Icon id={badge.earned?'i-trophy':'i-lock'}/><div><strong>{badge.title}</strong><p>{badge.description}</p></div><span className="badge-state">{badge.earned?'EARNED':'LOCKED'}</span></li>)}</ul><h3>Practice challenges</h3><p>Return to an operation with a focused optional objective. The exercise uses that operation’s unit rules, objectives and difficulty.</p><label>Exercise difficulty<select aria-label="Exercise difficulty" value={difficulty} onChange={event=>onDifficulty(event.target.value as Difficulty)}>{(['easy','normal','hard'] as const).map(value=><option key={value}>{value}</option>)}</select></label><ChallengeCards challenges={selected.challenges} difficulty={difficulty} onChallenge={onChallenge}/></div>;
}

export function CommanderProgressPanel({app,challengesOnly=false}:{app:Application;challengesOnly?:boolean}){
 const state=useObservable(app.state),[record,setRecord]=useState<{app:Application;index:ApplicationState['index'];revision:number;overview?:CommanderOverview;failure?:string}>(),[revision,setRevision]=useState(0),[faction,setFaction]=useState<Faction>('US'),[difficulty,setDifficulty]=useState<Difficulty>('normal');
 // Retained responses become unrenderable as soon as their source changes,
 // including the render before an old passive effect has cleaned up.
 const current=record?.app===app&&record.index===state.index&&record.revision===revision?record:undefined;
 const overview=current?.overview,failure=current?.failure,loading=!current;
 useEffect(()=>{let canceled=false;const identity={app,index:state.index,revision};void app.commandRecord().then(value=>{if(!canceled)setRecord({...identity,overview:value})}).catch(error=>{if(!canceled)setRecord({...identity,failure:error instanceof Error?error.message:'The command record could not be loaded.'})});return()=>{canceled=true}},[app,state.index,revision]);
 const attempt=(id:string,level:Difficulty)=>void app.challenge(id,level);
 return <section className="commander-progress-panel" aria-label={challengesOnly?'Unlocked practice challenges':'Commander progression'}>{loading&&<p role="status">Reading command record…</p>}{failure&&<p role="alert">{failure} Your existing records are preserved. Export a local backup before restoring them.</p>}<div className="record-actions"><button onClick={()=>setRevision(value=>value+1)}>Refresh command record</button><button onClick={()=>app.patch({page:'saves'})}>Open local backups</button>{challengesOnly&&<button onClick={()=>app.patch({page:'mastery'})}>View faction mastery and badges</button>}</div>{!loading&&overview&&(challengesOnly?<><p>Complete a campaign operation to unlock its optional field exercise. Free placement practice remains available above.</p><label>Challenge faction<select aria-label="Challenge faction" value={faction} onChange={event=>setFaction(event.target.value as Faction)}>{overview.factions.map(value=><option value={value.faction} key={value.faction}>{FACTIONS[value.faction].name}</option>)}</select></label><label>Exercise difficulty<select aria-label="Exercise difficulty" value={difficulty} onChange={event=>setDifficulty(event.target.value as Difficulty)}>{(['easy','normal','hard'] as const).map(value=><option key={value}>{value}</option>)}</select></label><ChallengeCards challenges={overview.challenges.filter(value=>value.faction===faction)} difficulty={difficulty} onChallenge={attempt}/></>:<CommanderProgressView overview={overview} faction={faction} difficulty={difficulty} onFaction={setFaction} onDifficulty={setDifficulty} onChallenge={attempt}/>)}</section>;
}

export function TrainingFocus({focus,snapshot}:{focus?:CommanderChallengeFocus;snapshot?:PlayerSnapshot}){
 if(!focus||snapshot&&(!snapshot.mission||snapshot.mission.id!==focus.mission||snapshot.mission.version!==focus.version))return null;
 const goal=snapshot?.mission?.objectives.find(objective=>objective.id===focus.objectiveID&&objective.optional&&!objective.failure),player=snapshot?.players.find(player=>player.id===snapshot.player);
 const achieved=!!snapshot?.outcome?.finished&&snapshot.outcome.reason==='mission_complete'&&!snapshot.outcome.draw&&player?.team===snapshot.outcome.winningTeam&&goal?.complete;
 return <section className="training-focus" aria-label="Field exercise focus"><h4>{focus.title}</h4><p>{focus.goal}</p><small>{snapshot?.outcome?.finished?achieved?'Exercise objective achieved.':'Exercise objective not achieved.':'Win this operation with the optional exercise objective.'}</small></section>;
}

export function CommanderResultCue({app}:{app:Application}){
 const state=useObservable(app.state);
 if(!state.snapshot?.outcome?.finished||state.session.kind==='practice'||state.session.kind==='replay'||state.session.kind==='observer')return null;
 return <div aria-live="polite">{state.commanderStatus==='awaiting'?<p>Waiting for the host to record this final result. You may return to the command center; keep this browser open until the command record is saved.</p>:state.commanderStatus==='recording'?<p>Updating command record…</p>:state.commanderStatus==='saved'?<p>Command record saved. Mastery and story badges are available in the command center.</p>:state.commanderStatus==='duplicate'?<p>This operation is already in your command record.</p>:state.commanderStatus==='unavailable'?<p>This final view is not eligible for a command record.</p>:null}{state.commanderError&&<p role="alert">{state.commanderError} <button onClick={()=>app.retryCommanderProgress()}>Retry command record</button></p>}</div>;
}

export function CommanderPendingRecords({app}:{app:Application}){
 const state=useObservable(app.state),records=state.commanderFinals??[];
 if(!records.length)return null;
 return <aside className="commander-pending" aria-label="Pending command records"><h3>Pending command records</h3><p>These completed matches await a saved host result or a local record write. Keep this browser open until they finish. Changing host or signing in again cancels pending records.</p><ul>{records.map(record=><li key={record.id}><strong>{FACTIONS[record.faction].name}</strong><p role={record.phase==='failed'?'alert':'status'}>{record.error??(record.phase==='recording'?'Saving command record…':'Waiting for the host to record the completed match.')}</p><button disabled={record.phase==='recording'} onClick={()=>void app.retryCommanderFinal(record.id)}>Retry pending record</button></li>)}</ul></aside>;
}
