// Battle layout (hud-sidebar lane). The L-shaped console is the right command sidebar plus the bottom-right tray.
// Geometry comes from the shared custom properties in styles/hud.css (contract: work/beta-2026-10-31/contracts/hud-layout.md).
import type {CSSProperties} from 'react';
import {RecordedResultCue} from '../network/recorded-results';
import {PracticeTools} from '../Practice';
import {ReplayDock} from '../ReplayDock';
import {useBattleView,type BattleScreenProps} from './battle-view';
import '../../styles/hud.css';
import {CommandSidebar} from './CommandSidebar';
import {SelectionTray} from './SelectionTray';
import {CommandCard} from './CommandCard';
import {AlertFeed} from './AlertFeed';
import {OrdersDock} from './OrdersDock';
import {TargetingHint} from './TargetingHint';
import {DeploymentCountdown} from './DeploymentCountdown';
import {PauseMenu} from './PauseMenu';
import {OptionsModal} from './OptionsModal';
import {DebriefModal} from './DebriefModal';
import {SurrenderModal} from './SurrenderModal';
import {EntryEdgeModal} from './EntryEdgeModal';
/** In-battle composition: canvas host, overlays and the HUD regions. State lives in useBattleView. */
export function BattleScreen(props:BattleScreenProps){
 const view=useBattleView(props);
 const {app,state,practice,setPractice,host,control,replayHost,snapshot,faction,teamColor,openPause}=view;
 return <main className="battlefield-screen" data-hud="v2" data-session={state.session.kind??undefined} data-faction={faction} style={{'--team-color':teamColor} as CSSProperties}><div ref={host} className="battlefield-canvas"/>{state.session.kind==='observer'&&!state.snapshot&&<div className="observer-buffering console" role="status">Waiting for the authorized observer timeline. Competitive views begin after the two-minute delay.</div>}<RecordedResultCue controller={app.network} kind={state.session.kind} liveFinished={!!snapshot?.outcome?.finished} onOpen={openPause}/>
 <CommandSidebar view={view}/>
 <SelectionTray view={view}><CommandCard view={view}/></SelectionTray>
 <AlertFeed view={view}/>
 <OrdersDock view={view}/>
 <TargetingHint view={view}/><DeploymentCountdown view={view}/>
 <PauseMenu view={view}/>
 <OptionsModal view={view}/>
 <DebriefModal view={view}/>
 <SurrenderModal view={view}/>
 <EntryEdgeModal view={view}/>
 {practice&&<PracticeTools app={app} control={control} onClose={()=>setPractice(false)}/>}
 {state.session.kind==='replay'&&<ReplayDock app={app} host={replayHost}/>}
 </main>;
}
