import type {Application} from '../app/application';
import {useObservable} from '../app/store';
export function AudioCaptions({app}:{app:Application}){const state=useObservable(app.audio.state);return <div className="audio-captions" role="log" aria-live="polite" aria-label="Audio captions" aria-relevant="additions">{state.captions.map(caption=><p key={caption.id} className={caption.priority>=100?'critical':''}>{caption.text}</p>)}</div>}
