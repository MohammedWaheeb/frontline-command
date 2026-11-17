// Advanced connection & profile dialog (Lane E): host address, LAN join addresses,
// sign-in key export and sign-out. Never on the landing surface unless asked for.
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {NetworkController,NetworkState} from '../../app/network-controller';
import {Modal} from '../primitives';
import {KitIcon as Icon} from '../menu/kit/icon';
import {SectionHead,useCopy} from './kit';

export function AdvancedConnection({controller,state,remember,setRemember,onClose}:{controller:NetworkController;state:NetworkState;remember:boolean;setRemember:(value:boolean)=>void;onClose:()=>void}){
 const [host,setHost]=useState(state.host),{copied,copy}=useCopy(),account=state.account,profile=account?.profile,busy=!!state.busy;
 useEffect(()=>setHost(state.host),[state.host]);
 let openHost:string|undefined;try{const url=new URL(host);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.origin!==globalThis.location?.origin)openHost=url.origin}catch{}
 const addresses=state.joinURLs.length?state.joinURLs:[state.host];
 return createPortal(<div className="network-panel mp-portal"><Modal title="Connection and profile" onClose={onClose} wide><div className="mp-advanced">
  <section aria-labelledby="mp-adv-host"><SectionHead id="mp-adv-host" title="Game host"/>
   <form className="network-host mp-host-row" onSubmit={event=>{event.preventDefault();void controller.connect(host)}}><label>Game host<input aria-label="Game host" value={host} onChange={event=>setHost(event.target.value)} placeholder="http://192.168.1.20:8080" type="url" required spellCheck={false}/></label><button disabled={busy} type="submit">Connect host</button></form>
   <p className="network-hint">Each computer must open the game from the host’s own address. The host enables LAN access explicitly when it starts.</p>
   {openHost&&<p className="network-hint"><a href={openHost}>Open this host’s game page</a> to play from its address. A host may refuse connections from another page.</p>}
  </section>
  <section aria-labelledby="mp-adv-lan"><SectionHead id="mp-adv-lan" title="Join addresses" aside={<button type="button" className="mp-quiet" disabled={busy} onClick={()=>void controller.loadHostAddresses()}><Icon id="i-refresh"/>Refresh</button>}/>
   <p className="network-hint">{state.hostMessage??(state.lanEnabled?'Share one of these addresses with players on your network.':'LAN access is off. Players on other computers cannot reach this host yet.')}</p>
   <ul className="mp-address-list">{addresses.map(url=><li key={url}><code>{url}</code><button type="button" className="mp-icon-button" aria-label={`Copy ${url}`} onClick={()=>void copy(url,url)}><Icon id={copied===url?'i-check':'i-copy'}/></button></li>)}</ul>
  </section>
  <section aria-labelledby="mp-adv-profile"><SectionHead id="mp-adv-profile" title="Profile & sign-in key"/>
   <div className="mp-check-row"><label className="network-check mp-check"><input type="checkbox" aria-describedby="mp-remember-hint" checked={remember} onChange={event=>setRemember(event.target.checked)}/>Remember sign-in on this browser</label><small id="mp-remember-hint">Applies to the next profile you create or restore.</small></div>
   {profile?<>
    <div className="network-profile"><span className="network-profile-mark"><Icon id="i-users"/></span><div><strong>{profile.name}</strong><small>{account?.persistent?'Remembered on this browser':'This browser session only'} · {account?.phase==='offline'?'Host connection lost':'Local host profile'}</small></div><button disabled={busy} onClick={()=>void controller.logout()}>Sign out</button></div>
    <details className="network-share"><summary>Private sign-in key</summary><p>Export this key to restore your profile on another browser using this exact host address. Anyone with the file can use this profile. It is an unencrypted credential, separate from game backups; keep it private.</p><button disabled={busy} onClick={()=>void controller.exportSignInKey()}>Export private sign-in key</button></details>
    <p className="network-hint">Renaming an existing commander is not available yet. Choose a name before your first Host or Join.</p>
   </>:<p className="network-hint">No profile on this host yet. One is created when you host or join, or use Restore an existing token on the multiplayer screen.</p>}
  </section>
 </div></Modal></div>,document.body);
}
