// Page router for the menu mode-screen body (menu-shell lane). Keep the page-chain substrings release-scope.test.ts pins.
import type {Application} from '../../app/application';
import {HelpPanel} from '../HelpPanel';
import {NetworkPanel} from '../network';
import {PracticeSetup} from '../Practice';
import {Archives} from '../Archives';
import {SettingsPanel} from '../SettingsPanel';
import {CommanderProgressPanel} from '../CommanderProgress';
import {EditorPanel} from '../EditorPanel';
import {SkirmishSetup} from './SkirmishSetup';
import {CampaignScreen} from './CampaignScreen';
import {ContentScreen} from './ContentScreen';
export type AppState=ReturnType<Application['state']['get']>;
/** The state.page → screen chain rendered inside MenuShell's mode-screen body (.fcm-screen-inner). */
export function ScreenRouter({app,state}:{app:Application;state:AppState}){
 return state.page==='help'?<HelpPanel app={app}/>:state.page==='practice'?<PracticeSetup app={app}/>:state.page==='skirmish'?<SkirmishSetup app={app}/>:state.page==='campaign'?<CampaignScreen app={app} tutorial={false}/>:state.page==='tutorials'?<CampaignScreen app={app} tutorial/>:state.page==='editor'?<EditorPanel app={app}/>:state.page==='mastery'?<CommanderProgressPanel app={app}/>:state.page==='saves'||state.page==='replays'?<Archives app={app} replays={state.page==='replays'}/>:state.page==='settings'?<SettingsPanel app={app}/>:state.page==='content'?<ContentScreen app={app}/>:<NetworkPanel key={state.page} controller={app.network} index={state.index} palette={state.settings.palette} initialSection={state.page==='coop'?'coop':'operations'}/>;
}
