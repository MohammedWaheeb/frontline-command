import {useId,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {Application} from '../app/application';
import {useObservable} from '../app/store';
import {SHORTCUT_DEFINITIONS,type KeyChord} from '../runtime';
import {FACTIONS,COMMANDS,ABILITIES,STRATEGIC} from '../content/labels';
import {FACTION_COMMAND_ABILITIES,selectionInstruction} from '../content/unit-guidance';
import type {Modifier} from '../runtime/keybindings';
import {shortcutLabel} from './shortcut-presentation';
import {Emblem,Icon} from './primitives';
import {Button} from './menu/kit/Button';
import {Tabs,TabPanel} from './menu/kit/Segmented';
import {FooterActionBar,useMenuScreen,useScreenFill} from './menu/kit/screen';
import {Chord,keyParts,useRemembered,writeRecordsMemory} from './records/shared';
const MODIFIER_NAMES:Record<Modifier,string>={ctrl:'Ctrl',shift:'Shift',alt:'Alt',meta:'Meta (Command/Windows)'};
const POINTER_NAMES=['Left','Middle','Right','Back','Forward'] as const;
const CATEGORY_LABEL:Record<string,string>={orders:'Orders',selection:'Selection',camera:'Camera',interface:'Interface',groups:'Control groups'};
type Section='hotkeys'|'controls'|'commands'|'factions'|'economy'|'saves'|'credits';
const SECTIONS:ReadonlyArray<{id:Section;label:string;icon:string}>=[{id:'hotkeys',label:'Hotkeys',icon:'i-keyboard'},{id:'controls',label:'Mouse & modifiers',icon:'i-cursor'},{id:'commands',label:'Orders',icon:'i-attack-move'},{id:'factions',label:'Factions',icon:'i-shield'},{id:'economy',label:'Economy & air',icon:'i-credits'},{id:'saves',label:'Saves & LAN',icon:'i-save'},{id:'credits',label:'Credits',icon:'i-info'}];
const isSection=(value:unknown):value is Section=>SECTIONS.some(section=>section.id===value);
const Keys=({chords}:{chords?:readonly KeyChord[]})=>chords?.length?<span className="rec-keys">{chords.map((chord,index)=><Chord key={index} chord={chord}/>)}</span>:<span className="rec-unbound">Unbound</span>;
const Article=({title,children}:{title:string;children:ReactNode})=><section className="rec-help-article"><h3 className="rec-section-title">{title}</h3>{children}</section>;
/** Watch the actual scroll well and its content, including disclosure and interface-scale resizes. */
export function observeMoreBelow(node:HTMLElement,onChange:(more:boolean)=>void){
 const measure=()=>onChange(node.scrollHeight-node.clientHeight-node.scrollTop>1);
 const observer=new ResizeObserver(measure);observer.observe(node);for(const child of node.children)observer.observe(child);
 node.addEventListener('scroll',measure,{passive:true});measure();
 return()=>{observer.disconnect();node.removeEventListener('scroll',measure)};
}
/** One scroll well, a reserved continuation row and a footer outside the frame. */
export function ScrollContinuation({children}:{children:ReactNode}){
 const root=useRef<HTMLDivElement>(null),[more,setMore]=useState(false);
 useLayoutEffect(()=>{const node=root.current?.firstElementChild as HTMLElement|undefined;return node?observeMoreBelow(node,setMore):undefined},[children]);
 return <div className="rec-scroll-frame" ref={root}>{children}<button type="button" className="rec-scroll-cue" data-more={more} aria-hidden={!more} tabIndex={more?0:-1} onClick={()=>{const node=root.current?.firstElementChild;node?.scrollBy({top:node.clientHeight*.8,behavior:'instant'})}}>More below ↓</button></div>;
}
export function FactionHelp(){
 return <div className="rec-help-factions">{Object.entries(FACTIONS).map(([id,faction])=>{const strategic=STRATEGIC[id as keyof typeof STRATEGIC];return <section key={id} className="rec-help-faction"><header><Emblem faction={id}/><div><h3>{faction.name}</h3><p>{faction.doctrine}</p></div></header><dl><div><dt><Icon id="i-ability-strategic"/>{strategic.label}</dt><dd>{strategic.hint}</dd></div>{FACTION_COMMAND_ABILITIES[id as keyof typeof FACTION_COMMAND_ABILITIES].map(ability=><div key={ability}><dt><Icon id={`i-ability-${ability.replaceAll('_','-')}`}/>{ABILITIES[ability].label}</dt><dd>{ABILITIES[ability].hint}</dd></div>)}</dl></section>})}</div>;
}
/** Reference screen. The hotkey sheet reads the player's live bindings, so remapped keys show here at once. */
export function HelpPanel({app}:{app:Application}){
 useScreenFill();
 const state=useObservable(app.state),screen=useMenuScreen(),idBase=useId(),[search,setSearch]=useState('');
 const [remembered,setSection]=useRemembered('helpTab','hotkeys',isSection),section=remembered as Section;
 const bindings=state.settings.bindings;
 const groups=useMemo(()=>{const query=search.trim().toLowerCase();return ['orders','selection','camera','interface','groups'].map(category=>({category,items:SHORTCUT_DEFINITIONS.filter(item=>item.category===category&&(!query||item.label.toLowerCase().includes(query)||(bindings.keys[item.id]??[]).some(chord=>shortcutLabel(chord).toLowerCase().includes(query)||keyParts(chord).join('+').toLowerCase().includes(query))))})).filter(group=>group.items.length)},[search,bindings]);
 const remap=()=>{writeRecordsMemory({optionsTab:'controls'});app.patch({page:'settings'})};
 const body=section==='hotkeys'?<>
  <div className="rec-help-tools"><input className="rec-search" type="search" aria-label="Search hotkeys" placeholder="Search actions or keys" value={search} onChange={event=>setSearch(event.target.value)}/><p className="rec-muted">These are your current keys. {bindings.preset==='classic'?'Classic mouse scheme.':'Modern mouse scheme.'}</p></div>
  <div className="rec-hotkey-grid">{groups.map(group=><section key={group.category} className="rec-hotkey-group"><h3 className="rec-section-title">{CATEGORY_LABEL[group.category]}</h3><dl>{group.items.map(item=><div key={item.id}><dt>{item.label}</dt><dd><Keys chords={bindings.keys[item.id]}/></dd></div>)}</dl></section>)}{!groups.length&&<p className="rec-muted">No hotkey matches “{search}”.</p>}</div></>
 :section==='controls'?<div className="rec-help-columns">
  <Article title="Mouse"><p className="rec-help-lead">{selectionInstruction(bindings)}.</p><dl className="rec-help-list" aria-label="Mouse buttons">{(['select','context','pan','cancel'] as const).map(key=><div key={key}><dt>{({select:'Select / confirm',context:'Context order',pan:'Drag camera',cancel:'Cancel target'})[key]}</dt><dd><kbd className="rec-kbd">{POINTER_NAMES[bindings.pointer[key]]??'—'} button</kbd></dd></div>)}</dl><p>The cancel shortcut clears targeting first, then opens the operation menu. Chat and text fields suppress battlefield shortcuts.</p></Article>
  <Article title="Modifiers"><dl className="rec-help-list" aria-label="Saved control modifiers"><div><dt>Queue orders</dt><dd>Hold <kbd className="rec-kbd">{MODIFIER_NAMES[bindings.modifiers.queue]}</kbd> while issuing a queueable order to add it after current orders.</dd></div><div><dt>Add or remove selection</dt><dd>Hold <kbd className="rec-kbd">{MODIFIER_NAMES[bindings.modifiers.multiSelect]}</kbd> while clicking units. Drag with this modifier to add boxed units; if every boxed unit is already selected, the box removes them.</dd></div><div><dt>Pointer force-fire</dt><dd>With units selected and targeting off, hold <kbd className="rec-kbd">{MODIFIER_NAMES[bindings.modifiers.forceFire]}</kbd> and {POINTER_NAMES[bindings.pointer.select]??'Select/confirm'}-click explored ground to request force-fire. A cannon or shell weapon is required; normal order checks still apply.</dd></div></dl><p>Prefer a toggle to holding a key? Assign Toggle queued orders or Toggle additive selection in Options. Press it again to turn it off; both clear when the game window loses focus.</p></Article></div>
 :section==='commands'?<div className="rec-help-orders">{Object.values(COMMANDS).map(command=><div key={command.label} className="rec-help-order"><span className="rec-help-order-icon" aria-hidden="true"><Icon id={command.icon}/></span><div><strong>{command.label}</strong><p>{command.hint}</p></div>{command.shortcut&&<Keys chords={bindings.keys[command.shortcut]}/>}</div>)}</div>
 :section==='factions'?<FactionHelp/>
 :section==='economy'?<div className="rec-help-columns"><Article title="Maintain the supply line"><p>Haulers bring supplies from fields to a supply center. Credits pay for construction and production. New structures must fit within the permitted build area and leave routes open. Select an engineering rig to see the structure catalog and current requirements.</p><p>Production tabs keep working while your combat units stay selected. Choose a facility from the sidebar to manage its queue; the adjacent button selects and centers it. Starting construction selects the engineering rig that will build it. Click a queue entry to cancel that job.</p><p>The power gauge compares demand with capacity. Power shortages affect operation and production. Queue entries show whether a job has been paid or is still waiting. Waiting for credits, supply or a service slot does not always prevent adding a legal queue entry.</p></Article>
  <Article title="Aircraft & strategic operations"><p>Aircraft need compatible service slots, finite endurance and rearming. They return automatically when ammunition runs out or endurance reaches its return threshold, then service and resume authorized continuing duties or queued orders. A single ground attack does not repeat unless you queue another attack or enable Repeat sortie.</p><p>To change their home, select the aircraft, choose Rebase, then click your compatible airfield or drone service building. Right-clicking that building does the same. Rebase needs unreserved slots and cannot be queued; aircraft already servicing must finish first.</p><p>Strategic operations need their matching structure and full charge; choose the command and its targets through the normal command panel.</p></Article></div>
 :section==='credits'?<Article title="Original production"><p>Original project dialogue, music and sound effects. Stock synthesized voices use Kokoro (Apache 2.0 model and inference code). No cloned speakers or online speech service. Audio is undergoing listening review.</p><p><a href="/art/audio/notices/README.md" target="_blank" rel="noreferrer">Audio production and provenance</a></p></Article>
 :<div className="rec-help-columns"><Article title="Local ownership"><p>Solo saves, replays and settings belong to this browser. Export files before deleting browser data or moving computers. Loading and importing check the original game and content versions; failed imports are retained for recovery when possible.</p><p>Continue loads the newest local save. Solo autosaves record checkpoints and periodic progress. Replays preserve commands and permit seeking and perspective fog; they award no campaign progress. Practice does not award competitive results.</p></Article><Article title="LAN play"><p>Open Multiplayer, host or join a game, confirm its settings and mark ready after assets load. Opening the menu online does not pause everyone; use the shared-pause controls where allowed. The host owns live commands, reconnect windows, saves, reports and results.</p></Article></div>;
 return <div className="help-panel rec-help">
  <Tabs label="Help topics" idBase={idBase} value={section} onChange={value=>setSection(value)} tabs={SECTIONS} className="rec-help-tabs"/>
  <ScrollContinuation><TabPanel idBase={idBase} id={section} className="rec-help-body">{body}</TabPanel></ScrollContinuation>
  {screen&&<FooterActionBar className="rec-footer" summary="Hotkeys shown here follow your current Options." actions={[{label:'Remap keys',icon:'i-keyboard',onClick:remap}]}/>}
  {!screen&&<div className="rec-settings-foot"><Button size="sm" icon="i-keyboard" onClick={remap}>Remap keys</Button></div>}
 </div>;
}
