import {createPortal} from 'react-dom';
import {StrikeReview} from '../StrikeReview';
import {MissionObjectives} from '../MissionObjectives';
import type {BattleView} from './battle-view';
/** Mission objectives and the strategic strike review, portalled into the
 * overlay's top-left orders slot under the alert feed. Hauler routes moved into
 * the selection tray as a popover (design-audit-hud §2.6); the income readout
 * moved to the sidebar header and the opt-in diagnostics overlay. */
export function OrdersDock({view}:{view:BattleView}){
 const {app,ordersHost,state,control,battle,snapshot,escapeKey,escapeShortcut}=view;
 return ordersHost&&createPortal(<><MissionObjectives key={state.session.id} app={app} control={control}/>{battle.strikeReview&&<StrikeReview review={battle.strikeReview} control={control} tick={snapshot?.tick??0} escapeKey={escapeKey} escapeShortcut={escapeShortcut}/>}</>,ordersHost);
}
