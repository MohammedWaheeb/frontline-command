// Records lane revamp: Campaign (faction operations) and Field Training (lessons) share this screen.
// Routing still goes through app.mission(id, difficulty) → briefing; campaign data comes from app.campaign.overview().
import {useEffect,useMemo,useState} from 'react';
import type {Application} from '../../app/application';
import {useObservable} from '../../app/store';
import {FACTIONS} from '../../content/labels';
import type {Faction,Difficulty,CampaignOverview,JourneyMission} from '../../runtime';
import {Icon,Emblem} from '../primitives';
import {factions} from './menu-model';
import {Button} from './kit/Button';
import {EmptyState} from './kit/Panel';
import {Segmented} from './kit/Segmented';
import {FooterActionBar,useScreenFill} from './kit/screen';
import {DIFFICULTIES,DIFFICULTY_COPY,TerrainSurvey,useJSON,usePeekedMap,useRemembered,type MissionPresentation} from '../records/shared';

const isDifficulty=(value:unknown):value is Difficulty=>value==='easy'||value==='normal'||value==='hard';
const pad=(order:number)=>String(order).padStart(2,'0');
const done=(mission:JourneyMission)=>mission.completed.length>0;
/** First playable mission not yet completed, else the last completed one. */
function nextMission(missions:readonly JourneyMission[]|undefined){return missions?.find(mission=>mission.availability==='available'&&!done(mission))??[...(missions??[])].reverse().find(done)??missions?.[0]}
function statusLine(mission:JourneyMission,missions:readonly JourneyMission[],next?:JourneyMission){
 if(mission.availability==='missing')return 'Content not installed';
 if(mission.availability==='locked'){const previous=missions.find(value=>value.order===mission.order-1);return previous?`Locked · complete ${pad(previous.order)} ${previous.title}`:'Complete the preceding operation'}
 if(done(mission)){const levels=mission.completed_current_version.map(value=>DIFFICULTY_COPY[value].label);return `Completed${levels.length?` · ${levels.join(', ')}`:' · available for replay'}`}
 return mission===next?'Next operation · ready to deploy':'Ready to deploy';
}
const difficultyOptions=DIFFICULTIES.map(value=>({value,label:DIFFICULTY_COPY[value].label,title:DIFFICULTY_COPY[value].hint}));

/** Selected mission briefing preview: terrain survey, lesson and objectives from public presentation data. */
function MissionDetail({app,mission,missions}:{app:Application;mission:JourneyMission;missions:readonly JourneyMission[]}){
 const {index}=useObservable(app.state),entry=mission.entry,mapEntry=entry?index?.maps.find(map=>map.id===entry.map_id):undefined;
 const presentation=useJSON<MissionPresentation>(entry?.presentation_url),survey=usePeekedMap(app,mapEntry?.id);
 const objectives=(presentation.value?.objectives??[]).filter(objective=>objective.kind!=='failure');
 const locked=mission.availability!=='available';
 return <article className="rec-mission-detail" aria-label={`${mission.title} details`} data-locked={locked||undefined}>
  <div className="rec-mission-hero">
   <div className="rec-mission-map">{survey.value?<TerrainSurvey map={survey.value} label={`Terrain survey of ${mission.title}`}/>:<div className="rec-survey rec-survey--empty"><Icon id="i-map"/><span>{survey.failed||!mapEntry?'Survey unavailable':'Surveying terrain…'}</span></div>}{locked&&<span className="rec-mission-lock"><Icon id="i-lock"/></span>}</div>
   <div className="rec-mission-head">
    <span className="rec-eyebrow">{mission.mode==='tutorial'?`Lesson ${pad(mission.order)}`:`Operation ${pad(mission.order)}${presentation.value?.operation?` · ${presentation.value.operation}`:''}`}</span>
    <h3 className="rec-mission-title">{mission.title}</h3>
    {presentation.value?.theater&&<p className="rec-mission-theater"><Icon id="i-map"/>{presentation.value.theater}</p>}
    {presentation.value?.lesson&&<p className="rec-mission-lesson"><span>Field lesson</span>{presentation.value.lesson}</p>}
    <p className={`rec-mission-state is-${locked?mission.availability:done(mission)?'done':'ready'}`}><Icon id={locked?'i-lock':done(mission)?'i-check':'i-play'}/>{statusLine(mission,missions,nextMission(missions))}</p>
   </div>
  </div>
  {objectives.length>0&&<section className="rec-objectives" aria-label="Objectives"><h4>Objectives</h4><ul>{objectives.map(objective=><li key={objective.id} data-optional={objective.kind==='optional'||undefined}><Icon id={objective.kind==='optional'?'i-trophy':'i-objective'}/><span>{objective.text}{objective.kind==='optional'&&<small>Optional</small>}</span></li>)}</ul></section>}
 </article>;
}

/** One honest line from the lesson's own content: its lesson note, else its first required objective. */
function lessonLine(mission:JourneyMission,value?:MissionPresentation){if(value?.lesson&&value.lesson.trim().toLowerCase()!==mission.title.trim().toLowerCase())return value.lesson;return value?.objectives?.find(objective=>objective.kind==='primary')?.text}
/** Lesson card (field training): the whole card opens the briefing, as before. */
function LessonCard({app,mission,next,difficulty}:{app:Application;mission:JourneyMission;next:boolean;difficulty:Difficulty}){
 const presentation=useJSON<MissionPresentation>(mission.entry?.presentation_url),available=mission.availability==='available',complete=done(mission);
 return <button className="mission-row rec-lesson" data-next={next||undefined} data-complete={complete||undefined} disabled={!available} onClick={()=>mission.entry&&void app.mission(mission.entry.id,difficulty)}>
  <b className="rec-lesson-number">{pad(mission.order)}</b>
  <span className="rec-lesson-copy"><strong>{mission.title}</strong><small>{lessonLine(mission,presentation.value)??(available?'Ready to deploy':'Content not installed')}</small></span>
  <span className="rec-lesson-state">{complete?<><Icon id="i-check"/>Completed</>:next?<><Icon id="i-play"/>Next lesson</>:available?<><Icon id="i-play"/>Start</>:<><Icon id="i-lock"/>Not installed</>}</span>
 </button>;
}

export function CampaignScreen({app,tutorial}:{app:Application;tutorial:boolean}){
 useScreenFill();
 const [overview,setOverview]=useState<CampaignOverview>(),[overviewFailed,setOverviewFailed]=useState(false),[retry,setRetry]=useState(0);
 // Campaign faction and difficulty persist through the Application menu memory (frontline.menu.v1);
 // training difficulty keeps the records UI memory key.
 const [faction,setFactionState]=useState(()=>app.campaignFaction());
 const setFaction=(value:typeof faction)=>{setFactionState(value);app.setCampaignFaction(value)};
 const [campaignDifficulty,setCampaignDifficultyState]=useState(()=>app.campaignDifficulty());
 const [trainingDifficulty,setTrainingDifficulty]=useRemembered('trainingDifficulty','normal',isDifficulty);
 const difficulty=tutorial?trainingDifficulty:campaignDifficulty;
 const setDifficulty=(value:typeof campaignDifficulty)=>{if(tutorial)setTrainingDifficulty(value);else{setCampaignDifficultyState(value);app.setCampaignDifficulty(value)}};
 const [selected,setSelected]=useState<number>();
 useEffect(()=>{let active=true;setOverview(undefined);setOverviewFailed(false);void app.campaign.overview().then(value=>{if(active)setOverview(value)}).catch(error=>{if(active){setOverviewFailed(true);app.error(error)}});return()=>{active=false}},[app,tutorial,retry]);
 const campaign=overview?.campaigns.find(value=>value.faction===faction);
 const missions=tutorial?overview?.tutorials:campaign?.missions;
 const next=useMemo(()=>nextMission(missions),[missions]);
 useEffect(()=>{setSelected(undefined)},[faction,tutorial]);
 const focus=missions?.find(mission=>mission.order===selected)??next;
 const brief=(mission:JourneyMission|undefined)=>{if(mission?.entry&&mission.availability==='available')void app.mission(mission.entry.id,difficulty)};
 const completeCount=missions?.filter(done).length??0;
 if(!overview)return <div className="rec-screen rec-campaign">{overviewFailed?<EmptyState icon="i-alert" title="Operation list unavailable" action={<Button onClick={()=>setRetry(value=>value+1)}>Retry operations</Button>}>Your progress is safe. Check that the game content is installed, then try again.</EmptyState>:<p role="status" className="rec-loading">Loading operations…</p>}<FooterActionBar className="rec-footer"/></div>;
 if(tutorial)return <div className="rec-screen rec-training">
  <header className="rec-training-head"><div><span className="rec-eyebrow">Commander school</span><p>Five short lessons, from your first order to a full match. Replay any lesson at any time.</p></div><div className="rec-progress" aria-label={`${completeCount} of ${missions?.length??0} lessons complete`}><span className="rec-progress-count"><b>{completeCount}</b> / {missions?.length??0}</span><span className="rec-pips" aria-hidden="true">{missions?.map(mission=><i key={mission.order} data-done={done(mission)||undefined}/>)}</span><small>Lessons complete</small></div></header>
  <div className="mission-list rec-lesson-list">{missions?.map(mission=><LessonCard key={mission.order} app={app} mission={mission} next={mission===next&&!done(mission)} difficulty={difficulty}/>)}</div>
  <FooterActionBar className="rec-footer" summary={next&&!done(next)?<>Next: <b>{pad(next.order)} {next.title}</b></>:'All lessons complete. Replay any lesson to practise.'} secondary={<div className="rec-footer-field"><span>Enemy strength</span><Segmented label="Enemy strength" size="sm" value={difficulty} options={difficultyOptions} onChange={setDifficulty}/></div>} primary={{label:next&&!done(next)?'Start next lesson':'Replay first lesson',icon:'i-play',disabled:!next?.entry,onClick:()=>brief(next&&!done(next)?next:missions?.[0])}}/>
 </div>;
 return <div className="rec-screen rec-campaign">
  <div className="rec-faction-strip" role="group" aria-label="Campaign faction">{factions.map(value=>{const story=overview.campaigns.find(item=>item.faction===value),count=story?.missions.filter(done).length??0,total=story?.missions.length??6,upcoming=nextMission(story?.missions);return <button key={value} className={`rec-faction-card ${faction===value?'selected':''}`} aria-pressed={faction===value} onClick={()=>setFaction(value)}>
   <Emblem faction={value}/><span className="rec-faction-copy"><strong>{FACTIONS[value].name}</strong><small>{story?.title??'Campaign'}</small><span className="rec-pips" aria-hidden="true">{story?.missions.map(mission=><i key={mission.order} data-done={done(mission)||undefined}/>)}</span><em>{count===total?'Operation complete':count?`${count} / ${total} · next ${upcoming?.title??''}`:`${total} operations · not started`}</em></span></button>})}</div>
  <div className="rec-campaign-body">
   <div className="mission-list rec-mission-list" role="list" aria-label={`${campaign?.title??'Campaign'} operations`}>{missions?.map(mission=>{const active=mission===focus,locked=mission.availability!=='available';return <div role="listitem" key={mission.order}><button className={`mission-row rec-mission-row ${active?'is-selected':''}`} aria-current={active?'true':undefined} data-state={locked?mission.availability:done(mission)?'done':mission===next?'next':'ready'} onClick={()=>setSelected(mission.order)} onDoubleClick={()=>brief(mission)}>
    <b>{pad(mission.order)}</b><span><strong>{mission.title}</strong><small>{statusLine(mission,missions,next)}</small></span><Icon id={done(mission)?'i-check':locked?'i-lock':'i-chevron-right'}/></button></div>})}</div>
   {focus&&missions&&<MissionDetail app={app} mission={focus} missions={missions}/>}
  </div>
  <FooterActionBar className="rec-footer" summary={<><Emblem faction={faction}/><span><b>{campaign?.title}</b> · {completeCount} of {missions?.length??6} complete</span></>} disabledReason={focus?.availability==='locked'?'Complete the previous operation to unlock this one.':focus?.availability==='missing'?'This operation is not installed.':undefined} secondary={<div className="rec-footer-field" title={DIFFICULTY_COPY[difficulty].hint}><span>Difficulty</span><Segmented label="Difficulty" size="sm" value={difficulty} options={difficultyOptions} onChange={setDifficulty} disabled={focus?.availability!=='available'}/></div>} actions={[{label:'Command record',icon:'i-trophy',variant:'ghost',onClick:()=>app.patch({page:'mastery'})}]} primary={{label:focus&&done(focus)?'Replay briefing':focus===next&&completeCount>0?'Continue campaign':'Open briefing',icon:'i-campaign',disabled:focus?.availability!=='available',onClick:()=>brief(focus)}}/>
 </div>;
}
