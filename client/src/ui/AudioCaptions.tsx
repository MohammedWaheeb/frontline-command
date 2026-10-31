import type {Application} from '../app/application';
import {useObservable} from '../app/store';
/** Keep the consent-enabled battlefield log mounted even between captions.
 * In battle it sits bottom-centre above the selection tray and is pointer-
 * transparent, so captions never block drag-select (hud-tray.css). */
export function AudioCaptions({app,enabled,battlefield}:{app:Application;enabled:boolean;battlefield:boolean}){
 const state=useObservable(app.audio.state);
 if(!enabled)return null;
 return <div className="audio-captions" role="log" aria-live="polite" aria-label="Audio captions" aria-relevant="additions" tabIndex={battlefield?0:undefined}>{state.captions.map(caption=><p key={caption.id} className={caption.priority>=100?'critical':''}>{caption.text}</p>)}</div>
}
