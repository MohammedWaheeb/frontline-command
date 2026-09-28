import {useState} from 'react';
import type {Application} from '../app/application';
import type {BattleController} from '../app/battle-controller';
import {activeMissionMarkers} from '../app/mission-markers';
import {useObservable} from '../app/store';
import {Icon} from './primitives';
import {TutorialGuide} from './TutorialGuide';

export function MissionObjectives({app,control}:{app:Application;control:BattleController}){
 const {snapshot}=useObservable(app.state),battle=useObservable(control.state),[minimized,setMinimized]=useState(false),mission=snapshot?.mission;
 if(!mission)return null;
 return <aside className="mission-objectives console" aria-label="Mission objectives"><header className="mission-objectives-title"><h3>{mission.title}</h3><button aria-label={minimized?'Show mission objectives':'Minimize mission objectives'} aria-expanded={!minimized} onClick={()=>setMinimized(!minimized)}>{minimized?'+':'−'}</button></header>{!minimized&&<><div>{mission.objectives.filter(objective=>!objective.failure).map(objective=><p key={objective.id}><Icon id={objective.complete?'i-check':'i-objective'}/>{objective.text}</p>)}</div><div className="objective-locations" aria-label="Objective locations">{activeMissionMarkers(battle.markers,mission).map(marker=><button key={marker.id} aria-label={`Locate ${marker.text}`} onClick={()=>control.renderer?.center(marker.position)}><Icon id="i-objective"/>{marker.text}</button>)}</div><TutorialGuide app={app} control={control}/></>}</aside>;
}
