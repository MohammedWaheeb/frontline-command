import {useEffect,useState} from 'react';
import type {Application} from '../app/application';
import type {BattleController} from '../app/battle-controller';
import {activeMissionMarkers} from '../app/mission-markers';
import {missionGroups} from '../app/mission-groups';
import {useObservable} from '../app/store';
import {Icon} from './primitives';
import {TutorialGuide} from './TutorialGuide';
import {TrainingFocus} from './CommanderProgress';
import {loadMissionDisclosure,missionDisclosureKey,requestMissionDisclosure,type MissionDisclosure} from '../app/mission-disclosure';

type DisclosureState={key:string;phase:'loading'|'ready'|'unavailable';data?:MissionDisclosure;message?:string};

export function MissionDisclosurePanel({context,objectives,onRetry}:{context?:Omit<DisclosureState,'key'>;objectives:ReadonlyArray<{id:string;failure:boolean;complete:boolean}>;onRetry:()=>void}){
 return <details className="mission-force-groups" data-mission-context={context?.phase??'loading'}>
  <summary>Scenario rules &amp; failure conditions</summary>
  {context?.phase==='ready'&&context.data?<>
   <small style={{display:'block',overflowWrap:'anywhere'}}>Operation {context.data.id} · version {context.data.version}</small>
   <p style={{display:'block',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{context.data.rulesNotice||'No additional scenario rules are declared.'}</p>
   <div aria-label="Failure conditions">{context.data.failures.map(failure=><p key={failure.id} data-failure-condition={failure.id}>
    <strong>{objectives.find(objective=>objective.id===failure.id&&objective.failure)?.complete?'FAILED':'Failure condition'}</strong>
    <span style={{minWidth:0,overflowWrap:'anywhere'}}>{failure.text}</span>
   </p>)}{!context.data.failures.length&&<p>No special failure conditions are declared.</p>}</div>
  </>:context?.phase==='unavailable'?<>
   <p role="status" style={{display:'block',overflowWrap:'anywhere'}}>{context.message}</p>
   <button onClick={onRetry}>Retry mission context</button>
  </>:<p role="status">Loading scenario rules and failure conditions…</p>}
 </details>;
}

export function MissionObjectives({app,control}:{app:Application;control:BattleController}){
 const application=useObservable(app.state),{snapshot}=application,battle=useObservable(control.state),[minimized,setMinimized]=useState(false),mission=snapshot?.mission;
 const request=requestMissionDisclosure(application),requestKey=missionDisclosureKey(request),[disclosure,setDisclosure]=useState<DisclosureState>(),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!request){setDisclosure(undefined);return}
  const abort=new AbortController(),key=requestKey,isCurrent=()=>!abort.signal.aborted&&missionDisclosureKey(requestMissionDisclosure(app.state.get()))===key;
  setDisclosure({key,phase:'loading'});
  void loadMissionDisclosure(request,{baseURL:app.library.baseURL,signal:abort.signal,isCurrent}).then(data=>{if(isCurrent())setDisclosure({key,phase:'ready',data})}).catch(error=>{if(isCurrent())setDisclosure({key,phase:'unavailable',message:error instanceof Error?error.message:'Scenario context is unavailable.'})});
  return()=>abort.abort();
  // The primitive key includes every captured public identity/comparison field.
 },[app,requestKey,retry]);
 if(!mission||!snapshot)return null;
 const groups=missionGroups(battle.missionGroups,snapshot),context=disclosure?.key===requestKey?disclosure:undefined;
 return <aside className="mission-objectives console" aria-label="Mission objectives"><header className="mission-objectives-title"><h3>{mission.title}</h3><button aria-label={minimized?'Show mission objectives':'Minimize mission objectives'} aria-expanded={!minimized} onClick={()=>setMinimized(!minimized)}>{minimized?'+':'−'}</button></header>{!minimized&&<><div>{mission.objectives.filter(objective=>!objective.failure).map(objective=><p key={objective.id}><Icon id={objective.complete?'i-check':'i-objective'}/>{objective.text}</p>)}</div><TrainingFocus focus={application.activeChallenge} snapshot={snapshot}/><MissionDisclosurePanel context={context} objectives={mission.objectives} onRetry={()=>setRetry(value=>value+1)}/><div className="objective-locations" aria-label="Objective locations">{activeMissionMarkers(battle.markers,mission).map(marker=><button key={marker.id} aria-label={`Locate ${marker.text}`} onClick={()=>control.renderer?.center(marker.position)}><Icon id="i-objective"/>{marker.text}</button>)}</div><TutorialGuide app={app} control={control}/>{groups.length>0&&<details className="mission-force-groups"><summary>Marked forces</summary><div className="objective-locations">{groups.map(group=><button key={group.origin} aria-label={`Select ${group.text}`} disabled={!group.ids.length||snapshot.outcome?.finished} onClick={()=>control.selectMissionGroup(group.origin)}>{group.text}<small>{group.ids.length} available{group.aboard?` · ${group.aboard} aboard`:""}</small></button>)}</div></details>}</>}</aside>;
}
