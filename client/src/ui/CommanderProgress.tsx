import {useEffect,useState} from 'react';
import type {Application,ApplicationState} from '../app/application';
import type {CommanderChallengeFocus} from '../app/commander-challenges';
import type {CommanderOverview,CommanderChallenge} from '../runtime/commander-progress';
import type {Difficulty,Faction,PlayerSnapshot} from '../runtime';
import {FACTIONS} from '../content/labels';
import {useObservable} from '../app/store';
import {Icon,Emblem} from './primitives';
import {Button} from './menu/kit/Button';
import {ScrollContinuation} from './HelpPanel';
import {Segmented} from './menu/kit/Segmented';
import {FooterActionBar,useScreenFill} from './menu/kit/screen';
import '../styles/records.css';
import './commander-progress.css';

const number=(value:number)=>value.toLocaleString('en-US');
const DIFFICULTY_OPTIONS=(['easy','normal','hard'] as const).map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}));
export function ChallengeCards({challenges,difficulty,onChallenge}:{challenges:readonly CommanderChallenge[];difficulty:Difficulty;onChallenge:(id:string,difficulty:Difficulty)=>void}){
 return <div className="challenge-list rec-challenges">{challenges.map(challenge=><section key={challenge.id} className="challenge-card rec-challenge" aria-label={challenge.title} data-state={challenge.complete?'complete':challenge.unlocked?'open':'locked'}><span className="rec-challenge-icon" aria-hidden="true"><Icon id={challenge.complete?'i-trophy':challenge.unlocked?'i-objective':'i-lock'}/></span><div className="rec-challenge-copy"><h4>{challenge.title.replace(/ — optional goal$/,'')}</h4><p>{challenge.description}</p><small>{challenge.complete?'Exercise goal earned in your story record.':challenge.unlocked?'Unlocked · win the operation with its optional exercise goal.':'Complete this campaign operation to unlock its exercise.'}</small></div><Button size="sm" variant={challenge.unlocked&&!challenge.complete?'secondary':'ghost'} icon={challenge.unlocked?'i-play':'i-lock'} disabled={!challenge.unlocked} onClick={()=>onChallenge(challenge.id,difficulty)}>{challenge.complete?'Attempt again':'Attempt field exercise'}</Button></section>)}</div>;
}

/** The view receives derived records only; it has no access to combat state. */
export function CommanderProgressView({overview,faction,difficulty,onFaction,onDifficulty,onChallenge}:{overview:CommanderOverview;faction:Faction;difficulty:Difficulty;onFaction:(faction:Faction)=>void;onDifficulty:(difficulty:Difficulty)=>void;onChallenge:(id:string,difficulty:Difficulty)=>void}){
 const selected=overview.factions.find(value=>value.faction===faction);
 if(!selected)return <p role="status">This faction has no installed command record.</p>;
 const earned=selected.badges.filter(badge=>badge.earned).length,open=selected.challenges.filter(challenge=>challenge.unlocked).length;
 const stats:Array<[string,string,string,string?]>=[['i-flag-checker','Operations completed',number(selected.matches)],['i-campaign','Campaign progress',`${selected.campaignMissions} / ${selected.campaignTotal}`],['i-eye','Best ground surveyed',number(selected.tilesSurveyed),'tiles'],['i-units','Units standing at the end',number(selected.unitsAtEnd)],['i-intercept','Interceptor launches',number(selected.interceptorShots)],['i-objective','Team objectives completed',number(selected.objectivesCompleted)]];
 return <ScrollContinuation><div className="commander-record rec-record" tabIndex={0} aria-label="Command record details">
  <div className="record-factions rec-faction-strip" role="group" aria-label="Faction command records">{overview.factions.map(value=><button key={value.faction} className="rec-faction-card" aria-pressed={faction===value.faction} onClick={()=>onFaction(value.faction)}><Emblem faction={value.faction}/><span className="rec-faction-copy"><strong>{FACTIONS[value.faction].name}</strong><small>{value.campaignMissions} / {value.campaignTotal} operations · {value.badges.filter(badge=>badge.earned).length} badges</small><span className="rec-pips" aria-hidden="true">{Array.from({length:value.campaignTotal},(_,index)=><i key={index} data-done={index<value.campaignMissions||undefined}/>)}</span></span></button>)}</div>
  <div className="rec-record-grid">
   <section className="rec-record-section" aria-labelledby="rec-mastery"><h3 id="rec-mastery" className="rec-section-title">{FACTIONS[faction].name} mastery</h3>
    <dl className="mastery-counts rec-stats">{stats.map(([icon,label,value,unit])=><div key={label} className="rec-stat"><dt><Icon id={icon}/>{label}</dt><dd>{value}{unit&&<small>{unit}</small>}</dd></div>)}</dl>
    <p className="record-intro rec-muted">Story records unlock cosmetic badges and field exercises. All factions and combat options are available from the start. These records grant no combat bonuses.</p>
    <details className="mastery-note rec-details"><summary>How these are counted</summary><p>Survey counts include initial and allied sight. Surviving-unit counts include utility and temporary units. Interception shots count launches rather than confirmed hits. Mastery is stored in this browser; badges and exercise goals follow your campaign story record.</p></details>
   </section>
   <section className="rec-record-section" aria-labelledby="rec-badges"><h3 id="rec-badges" className="rec-section-title">Story badges <span className="rec-count">{earned} / {selected.badges.length} earned</span></h3><p className="rec-muted">Mission badges are earned by completing that campaign operation on any difficulty.</p>
    <ul className="record-badges rec-badges">{selected.badges.map(badge=><li key={badge.id} className="record-badge rec-badge" data-earned={badge.earned} title={badge.description}><span className="rec-badge-medal" aria-hidden="true"><Icon id={badge.earned?'i-trophy':'i-lock'}/></span><div><strong>{badge.title.replace(/ — story record$/,'')}</strong>{!badge.mission&&<p>{badge.description}</p>}</div><span className="badge-state">{badge.earned?'Earned':'Locked'}</span></li>)}</ul>
   </section>
  </div>
  <section className="rec-record-section" aria-labelledby="rec-exercises"><h3 id="rec-exercises" className="rec-section-title">Field exercises <span className="rec-count">{open} / {selected.challenges.length} unlocked</span></h3>
   <div className="rec-exercise-head"><p className="rec-muted">Replay a campaign operation with a focused optional goal. The exercise uses that operation’s units, objectives and the difficulty you choose.</p><div className="rec-footer-field"><span>Exercise difficulty</span><Segmented label="Exercise difficulty" size="sm" value={difficulty} options={DIFFICULTY_OPTIONS} onChange={onDifficulty}/></div></div>
   <ChallengeCards challenges={selected.challenges} difficulty={difficulty} onChallenge={onChallenge}/>
  </section>
 </div></ScrollContinuation>;
}

export function CommanderProgressPanel({app,challengesOnly=false}:{app:Application;challengesOnly?:boolean}){
 useScreenFill(!challengesOnly);
 const state=useObservable(app.state),[record,setRecord]=useState<{app:Application;index:ApplicationState['index'];revision:number;overview?:CommanderOverview;failure?:string}>(),[revision,setRevision]=useState(0),[faction,setFaction]=useState<Faction>('US'),[difficulty,setDifficulty]=useState<Difficulty>('normal');
 // Retained responses become unrenderable as soon as their source changes,
 // including the render before an old passive effect has cleaned up.
 const current=record?.app===app&&record.index===state.index&&record.revision===revision?record:undefined;
 const overview=current?.overview,failure=current?.failure,loading=!current;
 useEffect(()=>{let canceled=false;const identity={app,index:state.index,revision};void app.commandRecord().then(value=>{if(!canceled)setRecord({...identity,overview:value})}).catch(error=>{if(!canceled)setRecord({...identity,failure:error instanceof Error?error.message:'The command record could not be loaded.'})});return()=>{canceled=true}},[app,state.index,revision]);
 const attempt=(id:string,level:Difficulty)=>void app.challenge(id,level);
 return <section className="commander-progress-panel rec-screen" aria-label={challengesOnly?'Unlocked practice challenges':'Commander progression'}>{loading&&<p role="status" className="rec-loading">Reading command record…</p>}{failure&&<p role="alert" className="rec-alert">{failure} Your existing records are preserved. Export a local backup before restoring them.</p>}{!loading&&overview&&(challengesOnly?<><p>Complete a campaign operation to unlock its optional field exercise. Free placement practice remains available above.</p><label>Challenge faction<select aria-label="Challenge faction" value={faction} onChange={event=>setFaction(event.target.value as Faction)}>{overview.factions.map(value=><option value={value.faction} key={value.faction}>{FACTIONS[value.faction].name}</option>)}</select></label><label>Exercise difficulty<select aria-label="Exercise difficulty" value={difficulty} onChange={event=>setDifficulty(event.target.value as Difficulty)}>{(['easy','normal','hard'] as const).map(value=><option key={value}>{value}</option>)}</select></label><ChallengeCards challenges={overview.challenges.filter(value=>value.faction===faction)} difficulty={difficulty} onChallenge={attempt}/></>:<CommanderProgressView overview={overview} faction={faction} difficulty={difficulty} onFaction={setFaction} onDifficulty={setDifficulty} onChallenge={attempt}/>)}
  <FooterActionBar className="rec-footer" summary="Records are kept in this browser and never change combat." actions={[{label:'Refresh command record',icon:'i-refresh',onClick:()=>setRevision(value=>value+1)},{label:'Backup & restore',icon:'i-download',onClick:()=>app.patch({page:'content'})}]} primary={{label:'Go to campaign',icon:'i-campaign',onClick:()=>app.patch({page:'campaign'})}}/>
 </section>;
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
 return <div aria-live="polite">{state.commanderStatus==='awaiting'?<p>Waiting for the host to record this final result. You may return to the command center; keep this browser open until the command record is saved.</p>:state.commanderStatus==='recording'?<p>Updating command record…</p>:state.commanderStatus==='saved'?<p>Operation record saved in this browser.</p>:state.commanderStatus==='duplicate'?<p>This operation is already in your command record.</p>:state.commanderStatus==='unavailable'?<p>This final view is not eligible for a command record.</p>:null}{state.commanderError&&<p role="alert">{state.commanderError} <button onClick={()=>app.retryCommanderProgress()}>Retry command record</button></p>}</div>;
}

export function CommanderPendingRecords({app}:{app:Application}){
 const state=useObservable(app.state),records=state.commanderFinals??[];
 if(!records.length)return null;
 return <aside className="commander-pending" aria-label="Pending command records"><h3>Pending command records</h3><p>These completed matches await a saved host result or a local record write. Keep this browser open until they finish. Changing host or signing in again cancels pending records.</p><ul>{records.map(record=><li key={record.id}><strong>{FACTIONS[record.faction].name}</strong><p role={record.phase==='failed'?'alert':'status'}>{record.error??(record.phase==='recording'?'Saving command record…':'Waiting for the host to record the completed match.')}</p><button disabled={record.phase==='recording'} onClick={()=>void app.retryCommanderFinal(record.id)}>Retry pending record</button></li>)}</ul></aside>;
}
