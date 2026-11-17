import type {BattleView} from './battle-view';
/** Pre-battle deployment countdown: a stencil numeral on a brass-ruled plate, centred on the world. */
export function DeploymentCountdown({view}:{view:BattleView}){
 const {snapshot,sceneLoading}=view;
 if(sceneLoading)return <div className="countdown countdown-preparing" data-hud="readiness" role="status"><span>Preparing battlefield</span><p>{snapshot?.countdown?'Loading art · deployment begins when ready.':'Loading battlefield art…'}</p></div>;
 return !!snapshot?.countdown&&<div className="countdown" data-hud="countdown" role="timer" aria-label={`Deployment in ${Math.ceil(snapshot.countdown/20)} seconds`}><span>Deployment</span><b>{Math.ceil(snapshot.countdown/20)}</b></div>;
}
