// Multiplayer and co-op front end (Lane E, beta revamp). Public exports stay stable:
// NetworkPanel (menu router), NetworkMatchPanel and NetworkObserverPanel (in-game HUD).
import {useEffect,useRef,useState} from 'react';
import type {NetworkController} from '../../app/network-controller';
import {useObservable} from '../../app/store';
import type {ContentIndex} from '../../runtime/content-library';
import type {TeamPaletteScheme} from '../../design/team-colors';
import {KitIcon as Icon} from '../menu/kit/icon';
import {EmptyState} from '../menu/kit/Panel';
import './network.css';
import {ModerationPanel} from './moderation';
import {BusyLine,ConnectionChip,ErrorBanner} from './kit';
import {MultiplayerLanding} from './MultiplayerLanding';
import {CoopLanding} from './CoopLanding';
import {HostModal} from './HostModal';
import {LobbyScreen} from './LobbyScreen';
import {AdvancedConnection} from './AdvancedConnection';
import {ContactsPanel,ObserveSetup,RankedPanel,SyncPanel} from './SecondaryPanels';
export {NetworkMatchPanel,NetworkObserverPanel} from './MatchPanel';

type Section='versus'|'coop'|'contacts'|'files'|'observer'|'ranked';
/** Width bucket in effective (unscaled) px, so --fc-ui-scale shrinks the layout like a smaller screen. */
function useSizeBucket(){
 const ref=useRef<HTMLDivElement>(null),[size,setSize]=useState('wide');
 useEffect(()=>{const node=ref.current;if(!node||typeof ResizeObserver==='undefined')return;
  const measure=()=>{const scale=Number.parseFloat(getComputedStyle(node).getPropertyValue('--fc-ui-scale'))||1,width=node.clientWidth/scale;setSize(width>=1100?'wide':width>=920?'medium':width>=640?'narrow':'tiny')};
  const observer=new ResizeObserver(measure);observer.observe(node);measure();return()=>observer.disconnect()},[]);
 return [ref,size] as const;
}
const UTILITIES:Array<[Section,string,string]>=[['contacts','Contacts','i-users'],['files','Save copies','i-save'],['observer','Observe','i-eye'],['ranked','Local ranked','i-trophy']];

export function NetworkPanel({controller,index,palette,initialSection='operations'}:{controller:NetworkController;index?:ContentIndex;palette:TeamPaletteScheme;initialSection?:'operations'|'coop'}){
 const state=useObservable(controller.state),[section,setSection]=useState<Section>(initialSection==='coop'?'coop':'versus');
 const [name,setName]=useState(''),[remember,setRemember]=useState(true),[hosting,setHosting]=useState(false),[advanced,setAdvanced]=useState(false);
 useEffect(()=>{void controller.initialize()},[controller]);
 useEffect(()=>{if(state.lobby)setHosting(false)},[state.lobby?.id]);
 const [root,size]=useSizeBucket();
 const draft={name,setName,remember},signedIn=state.account?.phase==='signed-in'||state.account?.phase==='offline',utility=UTILITIES.some(([id])=>id===section);
 const home:Section=initialSection==='coop'?'coop':'versus';
 const openHost=async()=>{if(!state.account?.profile&&!await controller.ensureProfile(name.trim()||undefined))return;setHosting(true)};
 const back=()=>setSection(section==='contacts'||section==='files'||section==='observer'||section==='ranked'?home:section);
 const body=utility?<div className="mp-utility-view">
   <button type="button" className="mp-back" onClick={back}><Icon id="i-chevron-left"/>{state.lobby?'Back to lobby':'Back to games'}</button>
   {!signedIn?<EmptyState className="mp-empty" action={<button type="button" className="primary" disabled={!!state.busy} onClick={()=>void controller.ensureProfile(name.trim()||undefined)}>Create my profile</button>}>Contacts, save copies, observing and the local ladder use your commander profile on this host.</EmptyState>
   :section==='contacts'?<ContactsPanel controller={controller}/>:section==='files'?<SyncPanel controller={controller}/>:section==='observer'?<ObserveSetup controller={controller}/>:<RankedPanel controller={controller}/>}
  </div>
  :state.lobby?<LobbyScreen controller={controller} state={state} palette={palette}/>
  :section==='coop'?<CoopLanding controller={controller} state={state} draft={draft} palette={palette} onAdvanced={()=>setAdvanced(true)}/>
  :<MultiplayerLanding controller={controller} state={state} draft={draft} onHost={()=>void openHost()} onAdvanced={()=>setAdvanced(true)}/>;
 return <div ref={root} className="network-panel mp-screen" data-size={size} data-section={utility?section:state.lobby?'lobby':section}>
  <header className="mp-topbar">
   <p className="mp-topbar-title">{utility?UTILITIES.find(([id])=>id===section)?.[1]:state.lobby?'':home==='coop'?'Co-op missions with a partner or an allied AI':'Host or join a game on this host'}</p>
   <nav className="mp-tools" aria-label="Multiplayer tools">{UTILITIES.map(([id,label,icon])=><button type="button" key={id} title={label} aria-current={section===id?'page':undefined} className={section===id?'active':''} onClick={()=>setSection(section===id?home:id)}><Icon id={icon}/><span className="mp-tool-label">{label}</span>{id==='contacts'&&state.invites.length>0&&<b aria-hidden="true" title={`${state.invites.length} pending`}>{state.invites.length}</b>}</button>)}</nav>
   <ConnectionChip state={state} onAdvanced={()=>setAdvanced(true)}/>
  </header>
  <BusyLine state={state}/>
  <ErrorBanner controller={controller} state={state}/>
  <div className="mp-body">{body}
   <ModerationPanel controller={controller.moderation}/>
  </div>
  {hosting&&!state.lobby&&<HostModal controller={controller} state={state} index={index} commanderName={name.trim()||undefined} palette={palette} onClose={()=>setHosting(false)}/>}
  {advanced&&<AdvancedConnection controller={controller} state={state} remember={remember} setRemember={setRemember} onClose={()=>setAdvanced(false)}/>}
 </div>;
}
