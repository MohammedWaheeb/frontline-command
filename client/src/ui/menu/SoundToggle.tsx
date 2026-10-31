// Menu sound toggle (menu-shell lane). Rendered by MenuShell inside the home corner cluster and the
// mode-screen top bar, so it never floats over panels. It is not rendered during a battle; the pause
// menu and Options own audio there.
import type {Application} from '../../app/application';
import {useObservable} from '../../app/store';
import {KitIcon} from './kit';

/** Two-state "Sound: On / Off" key with an attention state when the browser still needs a gesture. */
export function SoundToggle({app}:{app:Application}){
 const {settings,booting,firstRun,session}=useObservable(app.state),audio=useObservable(app.audio.state);
 if(booting||firstRun||session.id)return null;
 const muted=!settings.audioConsent||settings.audio.master===0;
 const blocked=!muted&&audio.status==='gesture';
 const enable=()=>app.setSettings({...settings,audioConsent:true,audio:{...settings.audio,master:settings.audio.master||.8,music:settings.audio.music||.6}});
 const disable=()=>app.setSettings({...settings,audioConsent:false});
 return <button type="button" className={`fcm-sound ${muted?'is-off':blocked?'is-attention':'is-on'}`} aria-label="Sound" aria-pressed={!muted} title={muted?'Sound is off. Click to turn it on.':blocked?'Your browser paused audio. Click to resume.':'Sound is on. Click to turn it off.'} onClick={()=>muted||blocked?enable():disable()}>
  <KitIcon id="i-speaker"/><span>Sound</span><i className="fcm-led" aria-hidden="true"/><span className="fcm-sound-state">{muted?'Off':blocked?'Paused':'On'}</span>
 </button>;
}
