import {Modal} from '../primitives';
import type {BattleView} from './battle-view';
/** Surrender confirmation: one plain sentence, the danger action first, "Keep fighting" as the safe default. */
export function SurrenderModal({view}:{view:BattleView}){
 const {surrender,setSurrender,surrenderUnavailable,confirmSurrender}=view;
 return surrender&&<Modal title="Surrender commander" onClose={()=>setSurrender(false)}><div className="confirm-sheet" data-hud="surrender"><p>Your commander leaves the battle. Surviving teammates fight on, and your saves are kept.</p>{surrenderUnavailable&&<p className="pause-note" role="status">{surrenderUnavailable}</p>}<div className="button-row"><button className="danger" disabled={!!surrenderUnavailable} onClick={confirmSurrender}>Confirm surrender</button><button className="primary" onClick={()=>setSurrender(false)}>Keep fighting</button></div></div></Modal>;
}
