import type {Application} from '../../app/application';
import {useObservable} from '../../app/store';
import {AudioCaptions} from '../AudioCaptions';
import {isOrderAcknowledgement} from './notice-filter';

type HostRef=(node:HTMLDivElement|null)=>void;
/** Permanently mounted, pointer-transparent battle overlay (design-audit-hud §2.7/§2.8, H2).
 * It replaces the former left information column, which captured drags over the
 * world. Only the alert rows, objective cards and the targeting bar take the
 * pointer; everything else lets drag-select reach the battlefield.
 *
 * Slots: alerts + orders (objectives, strike review) top-left, the targeting /
 * placement bar top-centre, captions bottom-centre above the tray. App owns the
 * host elements and passes their state setters as refs, so portals survive
 * session changes. `data-notice="ack"` lets CSS drop the routine "Order applied"
 * toast (research B5): the world marker and the unit voice acknowledge orders;
 * the text stays readable in the opt-in diagnostics overlay. */
export function BattleInformation({app,battlefield,captions,onAlertsHost,onOrdersHost,onTargetHost}:{app:Application;battlefield:boolean;captions:boolean;onAlertsHost:HostRef;onOrdersHost:HostRef;onTargetHost:HostRef}){
 const {notice}=useObservable(app.state);
 return <div className={`hud-overlay${battlefield?' active':''}`} data-hud="overlay" data-notice={battlefield&&isOrderAcknowledgement(notice)?'ack':undefined}>
  <div className="hud-feed-slot">
   <div ref={onAlertsHost} className="hud-alerts-host"/>
   <div className="battle-information-orders" ref={onOrdersHost}/>
  </div>
  <div className="battle-information-target" ref={onTargetHost}/>
  <AudioCaptions app={app} enabled={captions} battlefield={battlefield}/>
 </div>;
}
