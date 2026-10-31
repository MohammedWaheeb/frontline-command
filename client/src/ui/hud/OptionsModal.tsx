import {SettingsPanel} from '../SettingsPanel';
import {Modal} from '../primitives';
import type {BattleView} from './battle-view';
/** In-battle Options modal (opened from the pause menu). */
export function OptionsModal({view}:{view:BattleView}){
 const {app,settings,setSettings}=view;
 return settings&&<Modal title="Options" wide onClose={()=>setSettings(false)}><SettingsPanel app={app}/></Modal>;
}
