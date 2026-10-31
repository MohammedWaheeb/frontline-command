import {useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {DEFAULT_SETTINGS,type Settings} from '../app/settings';
import type {Application} from '../app/application';
import {useObservable} from '../app/store';
import {SHORTCUT_DEFINITIONS,remapBindings,validateBindings,type BindingIssue,type ControlBindings,type KeyChord,type Modifier} from '../runtime';
import {KEYBOARD_LAYOUTS,keyboardLayout,withKeyboardLayout,withMouseScheme,topmostModal,type KeyboardLayout} from '../runtime/keybindings';
import {shortcutBadgeLabel,shortcutLabel as chordName} from './shortcut-presentation';
import {Button} from './menu/kit/Button';
import {Select,Switch} from './menu/kit/Field';
import {StatusChip} from './menu/kit/Panel';
import {Segmented,Tabs,TabPanel} from './menu/kit/Segmented';
import {ConfirmModal} from './menu/kit/ConfirmModal';
import {FooterActionBar,useMenuScreen,useScreenFill} from './menu/kit/screen';
import {Chord,useRemembered} from './records/shared';

type Tab='gameplay'|'controls'|'graphics'|'interface'|'accessibility'|'audio';
const TABS:ReadonlyArray<{id:Tab;label:string;icon:string;keys:readonly (keyof Settings)[];resets:string}>=[
 {id:'interface',label:'Interface',icon:'i-grid',keys:['uiScale','minimapScale','healthBars','diagnostics'],resets:'interface scale, minimap size, health bar visibility and command diagnostics'},
 {id:'gameplay',label:'Gameplay',icon:'i-cursor',keys:['scrollSpeed','zoomSpeed','edgeScroll','keyboardCamera','selectionTolerance','dragThreshold'],resets:'camera speeds, edge scrolling, arrow-key camera and selection sensitivity'},
 {id:'controls',label:'Controls',icon:'i-keyboard',keys:['bindings'],resets:'the mouse scheme, mouse buttons, modifiers and every keyboard shortcut'},
 {id:'graphics',label:'Graphics',icon:'i-display',keys:['artQuality','screenShake'],resets:'art quality and camera shake'},
 {id:'accessibility',label:'Accessibility',icon:'i-contrast',keys:['palette','captions','reducedMotion','reducedFlashing'],resets:'team colors, captions, reduced motion and reduced flashing'},
 {id:'audio',label:'Audio',icon:'i-speaker',keys:['audio'],resets:'all volume levels (sound stays on or off as you chose)'},
];
const shortcutHint=(chords?:readonly KeyChord[])=>chords?.[0]?` Shortcut: ${shortcutBadgeLabel(chords[0])}.`:'';
const isTab=(value:unknown):value is Tab=>TABS.some(tab=>tab.id===value);
const CATEGORY_LABEL:Record<string,string>={orders:'Orders',selection:'Selection',camera:'Camera',interface:'Interface',groups:'Control groups'};
const MODIFIER_LABEL:Record<Modifier,string>={ctrl:'Ctrl',shift:'Shift',alt:'Alt',meta:'Meta (Cmd / Win)'};
const BUTTON_LABEL=['Left button','Middle button','Right button','Back button','Forward button'];
const percent=(value:number)=>`${Math.round(value*100)}%`;

/** One setting: label and player-language hint on the left, control and live value on the right. */
function Row({label,hint,children,readout,htmlFor}:{label:ReactNode;hint?:ReactNode;children:ReactNode;readout?:ReactNode;htmlFor?:string}){
 return <div className="rec-setting"><div className="rec-setting-copy">{htmlFor?<label className="rec-setting-label" htmlFor={htmlFor}>{label}</label>:<span className="rec-setting-label">{label}</span>}{hint&&<p className="rec-setting-hint">{hint}</p>}</div><div className="rec-setting-control">{children}{readout!==undefined&&<output className="rec-readout" aria-hidden="true">{readout}</output>}</div></div>;
}
/** Range input with a filled track and a live numeric readout. */
function Slider({label,display,value,min,max,step,format,onChange,hint}:{label:string;display?:string;value:number;min:number;max:number;step:number;format:(value:number)=>string;onChange:(value:number)=>void;hint?:ReactNode}){
 const id=useId();
 return <Row label={display??label} hint={hint} htmlFor={id} readout={format(value)}><input id={id} className="rec-range" aria-label={label} aria-valuetext={format(value)} type="range" min={min} max={max} step={step} value={value} style={{['--fill' as string]:`${(value-min)/(max-min)*100}%`}} onChange={event=>onChange(Number(event.target.value))}/></Row>;
}
const shortcutLabel=(id:string)=>SHORTCUT_DEFINITIONS.find(item=>item.id===id)?.label??id.replaceAll('_',' ');
function Group({title,children,aside}:{title:string;children:ReactNode;aside?:ReactNode}){return <section className="rec-setting-group"><header><h3>{title}</h3>{aside}</header>{children}</section>}

export function SettingsPanel({app}:{app:Application}){
 useScreenFill();
 const panel=useRef<HTMLDivElement>(null),screen=useMenuScreen(),idBase=useId();
 const audioState=useObservable(app.audio.state);
 const {settings}=useObservable(app.state),[capture,setCapture]=useState<string>(),[message,setMessage]=useState(''),[rejected,setRejected]=useState<ReadonlySet<string>>(()=>new Set()),[category,setCategory]=useState('all'),[search,setSearch]=useState('');
 const [rememberedTab,setTab]=useRemembered('optionsTab','interface',isTab),tab=rememberedTab as Tab;
 const [confirm,setConfirm]=useState<{kind:'all'}|{kind:'tab';tab:Tab}|{kind:'preset';preset:'standard'|'classic'}|{kind:'keyboard';layout:KeyboardLayout}>();
 const update=(change:Partial<typeof settings>)=>app.setSettings({...app.state.get().settings,...change});
 // Player-facing conflict copy uses action labels, never binding ids, and
 // highlights both rows until the next capture resolves or cancels it.
 const refuse=(issues:readonly BindingIssue[])=>{setRejected(new Set(issues.flatMap(issue=>issue.code==='conflict'?[issue.action,issue.other??'']:[]).filter(Boolean)));setMessage(issues.map(issue=>issue.code==='conflict'?`${shortcutLabel(issue.action)} and ${shortcutLabel(issue.other??'')} would share the same key. Choose a different key.`:issue.message).filter((text,index,all)=>all.indexOf(text)===index).join(' '))};
 const bindings=(next:ControlBindings)=>{const issues=validateBindings(next);if(issues.length){refuse(issues);return}setRejected(new Set());update({bindings:next});setMessage('Bindings saved.')};
 useEffect(()=>{if(!capture)return;const key=(event:KeyboardEvent)=>{const top=topmostModal();if(!panel.current||top&&!top.contains(panel.current))return;event.preventDefault();event.stopImmediatePropagation();if(event.key==='Escape'&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey){setCapture(undefined);setRejected(new Set());setMessage('Shortcut capture canceled.');return}if(event.isComposing||['Control','Alt','Shift','Meta'].includes(event.key)||event.repeat)return;const modifiers:Modifier[]=[];if(event.ctrlKey)modifiers.push('ctrl');if(event.altKey)modifiers.push('alt');if(event.shiftKey)modifiers.push('shift');if(event.metaKey)modifiers.push('meta');const result=remapBindings(app.state.get().settings.bindings,{[capture]:[{code:event.code,modifiers}]});if(result.bindings){app.setSettings({...app.state.get().settings,bindings:result.bindings});setRejected(new Set());setMessage('Shortcut saved.');setCapture(undefined)}else refuse(result.issues)};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)},[app,capture]);
 const resetTab=(id:Tab)=>{const keys=TABS.find(item=>item.id===id)!.keys,defaults=structuredClone(DEFAULT_SETTINGS),next={...app.state.get().settings};for(const key of keys)Object.assign(next,{[key]:defaults[key]});app.setSettings(next);setMessage(`${TABS.find(item=>item.id===id)!.label} settings reset to defaults.`)};
 const shortcuts=useMemo(()=>{const query=search.trim().toLowerCase();return SHORTCUT_DEFINITIONS.filter(item=>(category==='all'||item.category===category)&&(!query||item.label.toLowerCase().includes(query)||(settings.bindings.keys[item.id]??[]).some(chord=>chordName(chord).toLowerCase().includes(query))))},[category,search,settings.bindings]);
 const conflicts=useMemo(()=>new Set([...validateBindings(settings.bindings).flatMap(issue=>[issue.action,issue.other??'']),...rejected]),[settings.bindings,rejected]);
 const current=TABS.find(item=>item.id===tab)!;
 const resetAside=<Button size="sm" variant="ghost" icon="i-refresh" onClick={()=>setConfirm({kind:'tab',tab})}>Reset {current.label.toLowerCase()}</Button>;
 const audioTone=audioState.status==='ready'?'ok':audioState.status==='disabled'?'off':audioState.status==='gesture'?'warn':'danger';
 const audioText=audioState.status==='ready'?'Sound ready · levels apply immediately':audioState.status==='disabled'?'Sound off · warning captions stay on screen':audioState.status==='gesture'?'Click any control to start sound':'Audio files unavailable · the game stays playable';
 const body=tab==='gameplay'?<>
  <Group title="Camera" aside={resetAside}>
   <Slider label="Camera pan speed" value={settings.scrollSpeed} min={.4} max={2} step={.1} format={value=>`${value.toFixed(1)}×`} onChange={value=>update({scrollSpeed:value})}/>
   <Slider label="Zoom speed" value={settings.zoomSpeed} min={.4} max={2} step={.1} format={value=>`${value.toFixed(1)}×`} onChange={value=>update({zoomSpeed:value})}/>
   <Row label="Edge scrolling" hint="Move the camera when the pointer touches the screen edge. Best in fullscreen."><Switch label="Edge scrolling" className="rec-switch" checked={settings.edgeScroll} onChange={value=>update({edgeScroll:value})}/></Row>
   <Row label="Arrow-key camera" hint="Pan with the arrow keys."><Switch label="Arrow-key camera" className="rec-switch" checked={settings.keyboardCamera} onChange={value=>update({keyboardCamera:value})}/></Row>
  </Group>
  <Group title="Selection">
   <Slider label="Selection tolerance (pixels)" display="Selection tolerance" hint="How close a click must be to pick a unit." value={settings.selectionTolerance} min={2} max={16} step={1} format={value=>`${value} px`} onChange={value=>update({selectionTolerance:value})}/>
   <Slider label="Drag threshold (pixels)" display="Drag threshold" hint="How far the pointer moves before a click becomes a selection box." value={settings.dragThreshold} min={3} max={20} step={1} format={value=>`${value} px`} onChange={value=>update({dragThreshold:value})}/>
  </Group></>
 :tab==='controls'?<>
  <Group title="Mouse scheme" aside={resetAside}>
   <Row label="Mouse preset" hint={settings.bindings.preset==='classic'?'Classic: left-click selects and gives orders, like the original C&C games.':'Modern: left-click selects, right-click gives orders.'}><Segmented label="Mouse preset" value={settings.bindings.preset} options={[{value:'standard',label:'Modern'},{value:'classic',label:'Classic'}]} onChange={value=>{if(value!==settings.bindings.preset)setConfirm({kind:'preset',preset:value})}}/></Row>
     </Group>
  <Group title="Keyboard shortcuts">
   <Row label="Keyboard layout" hint="Choose a keyboard preset independently of the mouse scheme. Applying one replaces keyboard remaps."><Select aria-label="Keyboard layout" value={keyboardLayout(settings.bindings)??'custom'} options={[{value:'custom',label:'Custom remaps',disabled:true},...KEYBOARD_LAYOUTS.map(item=>({value:item.id,label:item.label}))]} onChange={value=>{if(KEYBOARD_LAYOUTS.some(item=>item.id===value))setConfirm({kind:'keyboard',layout:value as KeyboardLayout})}}/></Row>
   <div className="rec-shortcut-tools"><input className="rec-search" type="search" aria-label="Search shortcuts" placeholder="Search actions or keys" value={search} onChange={event=>setSearch(event.target.value)}/><Select aria-label="Shortcut category" value={category} onChange={value=>setCategory(value)} options={[{value:'all',label:'All categories'},...['orders','selection','camera','interface','groups'].map(value=>({value,label:CATEGORY_LABEL[value]}))]}/></div>
   <p role="status" className="binding-message rec-binding-message" data-capturing={capture?'true':undefined}>{capture?`Press the new key combination for ${SHORTCUT_DEFINITIONS.find(item=>item.id===capture)?.label}. Escape cancels. ${message}`:message||'Choose a key to remap it. Conflicts are checked before saving.'}{capture&&<Button size="sm" variant="ghost" onClick={()=>{setCapture(undefined);setRejected(new Set())}}>Cancel key capture</Button>}</p>
   <div className="shortcut-list rec-shortcut-list">{shortcuts.map((item,index)=>{const chords=settings.bindings.keys[item.id]??[],head=category==='all'&&!search.trim()&&(index===0||shortcuts[index-1].category!==item.category);return <div key={item.id} className="rec-shortcut-block">{head&&<h4 className="rec-shortcut-head">{CATEGORY_LABEL[item.category]}</h4>}<div className="shortcut-row rec-shortcut-row" data-conflict={conflicts.has(item.id)||undefined} data-capturing={capture===item.id||undefined}><span className="rec-shortcut-name">{item.label}</span><button aria-label={`Remap ${item.label}`} className={`rec-keycap-button ${capture===item.id?'active':''}`} onClick={()=>{setCapture(item.id);setRejected(new Set());setMessage('')}}>{capture===item.id?<span className="rec-keycap-wait">Press a key…</span>:chords.length?chords.map((chord,i)=><Chord key={i} chord={chord}/>):<span className="rec-unbound">Unbound</span>}</button><button aria-label={`Clear ${item.label}`} className="rec-clear" title={`Clear ${item.label}`} disabled={!chords.length} onClick={()=>{const result=remapBindings(settings.bindings,{[item.id]:[]});if(result.bindings)bindings(result.bindings)}}>Clear</button></div></div>})}{!shortcuts.length&&<p className="rec-muted">No shortcut matches “{search}”.</p>}</div>
  </Group>  <Group title="Mouse buttons">
   {(['select','context','pan','cancel'] as const).map(key=>{const label=({select:'Select / confirm',context:'Context order',pan:'Drag camera',cancel:'Cancel target'})[key];return <Row key={key} label={label}><Select aria-label={`Mouse ${key}`} value={String(settings.bindings.pointer[key])} onChange={value=>bindings({...settings.bindings,pointer:{...settings.bindings.pointer,[key]:Number(value)}})} options={BUTTON_LABEL.map((label,index)=>({value:String(index),label}))}/></Row>})}
  </Group>
  <Group title="Modifier keys">
   {(['queue','multiSelect','forceFire'] as const).map(key=><Row key={key} label={({queue:'Queue orders',multiSelect:'Add to selection',forceFire:'Force-fire'})[key]} hint={({queue:'Hold while ordering to add the order after current ones.',multiSelect:'Hold while clicking or dragging to add or remove units.',forceFire:'Hold while clicking ground to fire at it.'})[key]}><Select aria-label={key} value={settings.bindings.modifiers[key]} onChange={value=>bindings({...settings.bindings,modifiers:{...settings.bindings.modifiers,[key]:value as Modifier}})} options={(['ctrl','shift','alt','meta'] as const).map(value=>({value,label:MODIFIER_LABEL[value]}))}/></Row>)}
  </Group>
</>
 :tab==='graphics'?<>
  <Group title="Art & effects" aside={resetAside}>
   <Row label="Art quality" hint="Applies from your next battle."><Select aria-label="Art quality" value={settings.artQuality} onChange={value=>update({artQuality:value})} options={[{value:'auto',label:'Automatic (recommended)'},{value:'standard',label:'Standard · lower memory'},{value:'high',label:'High · sharper unit art'}]}/></Row>
   <Slider label="Screen shake" hint="Reduced motion, reduced flashing or 0% turn camera shake off." value={settings.screenShake} min={0} max={1} step={.1} format={value=>value?percent(value):'Off'} onChange={value=>update({screenShake:value})}/>
  </Group></>
 :tab==='interface'?<>
  <Group title="Layout" aside={resetAside}>
   <Row label="Interface scale" hint="Text and controls in menus and the battle HUD."><Select aria-label="Interface scale" value={String(settings.uiScale)} onChange={value=>update({uiScale:Number(value)})} options={[.85,1,1.15,1.25,1.5].map(value=>({value:String(value),label:`${Math.round(value*100)}%${value===1?' (default)':''}`}))}/></Row>
   <Slider label="Minimap scale" hint="Size of the minimap in the command sidebar." value={settings.minimapScale} min={.8} max={1.4} step={.1} format={percent} onChange={value=>update({minimapScale:value})}/>
   <Row label="Health bars" hint="When unit and structure health bars appear on the battlefield."><Select aria-label="Health bars" value={settings.healthBars} onChange={value=>update({healthBars:value})} options={[{value:'selected',label:'Selected units only'},{value:'damaged',label:'Damaged or selected'},{value:'always',label:'Always'}]}/></Row>
   <Row label="Show command diagnostics" hint={<>Income window, session link and order acknowledgements in a corner panel during battle.{shortcutHint(settings.bindings.keys.diagnostics)}</>}><Switch label="Show command diagnostics" className="rec-switch" checked={settings.diagnostics} onChange={value=>update({diagnostics:value})}/></Row>
  </Group></>
 :tab==='accessibility'?<>
  <Group title="Color & motion" aside={resetAside}>
   <Row label="Team colors" hint={settings.palette==='cvd_safe'?'Okabe–Ito palette, distinguishable with red-green and blue-yellow color blindness.':'Classic bright team colors.'}><div className="rec-palette"><Select aria-label="Team colors" value={settings.palette} onChange={value=>update({palette:value})} options={[{value:'standard',label:'Standard'},{value:'cvd_safe',label:'Color-vision safe'}]}/><span className="rec-swatches" aria-hidden="true">{Array.from({length:8},(_,index)=><i key={index} style={{background:`var(--fc-color-team-${settings.palette==='cvd_safe'?'cvd-safe':'standard'}-${index})`}}/>)}</span></div></Row>
   <Row label="Captions" hint="Show spoken alerts and briefings as text."><Switch label="Captions" className="rec-switch" checked={settings.captions} onChange={value=>update({captions:value})}/></Row>
   <Row label="Reduce motion" hint="Replace slides and pulses with simple fades."><Switch label="Reduce motion" className="rec-switch" checked={settings.reducedMotion} onChange={value=>update({reducedMotion:value})}/></Row>
   <Row label="Reduce flashing" hint="Steady markers instead of flashing alerts and explosions."><Switch label="Reduce flashing" className="rec-switch" checked={settings.reducedFlashing} onChange={value=>update({reducedFlashing:value})}/></Row>
  </Group></>
 :<>
  <Group title="Sound" aside={resetAside}>
   <div className="rec-audio-status"><StatusChip tone={audioTone} live>{audioText}</StatusChip>{audioState.error&&<span role="status" className="rec-audio-error">{audioState.error} <Button size="sm" onClick={()=>void app.audio.loadIndex(true)}>Retry audio files</Button></span>}</div>
   <Row label="Game sound" hint="Music, effects and voice. Captions work either way."><Switch label="Enable game sound" className="rec-switch" checked={settings.audioConsent} onChange={value=>update({audioConsent:value})}/></Row>
   {(['master','music','effects','voice','ui'] as const).map(channel=><Slider key={channel} label={`${channel} volume`} display={channel==='ui'?'Interface sounds':channel==='master'?'Master volume':channel[0].toUpperCase()+channel.slice(1)} value={settings.audio[channel]} min={0} max={1} step={.05} format={value=>value?percent(value):'Muted'} onChange={value=>update({audio:{...settings.audio,[channel]:value}})}/>)}
   <div className="rec-audio-test"><Button icon="i-speaker" onClick={()=>app.audio.play('sfx.ui_confirm')}>Test interface sound</Button></div>
  </Group></>;
 const confirmation=confirm&&(confirm.kind==='all'?<ConfirmModal danger title="Reset all preferences?" confirmLabel="Reset everything" onCancel={()=>setConfirm(undefined)} onConfirm={()=>{app.resetPreferences(true);setConfirm(undefined);setMessage('Preferences reset to defaults.')}}><p>Every option on every tab returns to its default, including keyboard shortcuts. Your saves, replays, campaign progress and sound choice are kept.</p></ConfirmModal>
  :confirm.kind==='tab'?<ConfirmModal danger title={`Reset ${TABS.find(item=>item.id===confirm.tab)!.label.toLowerCase()} settings?`} confirmLabel="Reset" onCancel={()=>setConfirm(undefined)} onConfirm={()=>{resetTab(confirm.tab);setConfirm(undefined)}}><p>This restores {TABS.find(item=>item.id===confirm.tab)!.resets} to their defaults. Other tabs are unchanged.</p></ConfirmModal>
  :confirm.kind==='keyboard'?<ConfirmModal title="Replace keyboard shortcuts?" confirmLabel={`Use ${KEYBOARD_LAYOUTS.find(item=>item.id===confirm.layout)!.label}`} onCancel={()=>setConfirm(undefined)} onConfirm={()=>{bindings(withKeyboardLayout(app.state.get().settings.bindings,confirm.layout));setConfirm(undefined);setCapture(undefined)}}><p>This replaces all keyboard remaps with the {KEYBOARD_LAYOUTS.find(item=>item.id===confirm.layout)!.label} layout. Mouse buttons and modifiers are kept.</p></ConfirmModal>
  :<ConfirmModal title={`Switch to the ${confirm.preset==='classic'?'Classic':'Modern'} mouse scheme?`} confirmLabel={`Use ${confirm.preset==='classic'?'Classic':'Modern'}`} onCancel={()=>setConfirm(undefined)} onConfirm={()=>{bindings(withMouseScheme(app.state.get().settings.bindings,confirm.preset));setConfirm(undefined)}}><p>{confirm.preset==='classic'?'Left-click selects and gives orders.':'Left-click selects; right-click gives orders.'} Mouse buttons reset to this scheme’s defaults. Keyboard shortcuts and modifier keys are kept.</p></ConfirmModal>);
 const maintenance=[{label:'Reload saved preferences',icon:'i-refresh',onClick:()=>void app.task('Reloading saved preferences…',()=>app.reloadSettings()),title:'Discard unsaved changes from other tabs and read the stored preferences again'},{label:'Reset all preferences…',icon:'i-alert',variant:'danger' as const,onClick:()=>setConfirm({kind:'all'})}];
 return <div ref={panel} className={`settings-form rec-settings ${screen?'is-screen':'is-modal'}`}>
  <Tabs label="Options sections" idBase={idBase} value={tab} onChange={value=>{setTab(value);setCapture(undefined)}} tabs={TABS.map(item=>({id:item.id,label:item.label,icon:item.icon}))} className="rec-settings-tabs"/>
  <TabPanel idBase={idBase} id={tab} className="rec-settings-panel">{body}{tab!=='controls'&&message&&<p role="status" className="rec-settings-message">{message}</p>}</TabPanel>
  {screen?<FooterActionBar className="rec-footer" summary="Changes apply immediately and are saved in this browser." actions={maintenance}/>:<div className="rec-settings-foot"><span className="rec-muted">Changes apply immediately.</span>{maintenance.map(action=><Button key={action.label} size="sm" variant={action.variant??'secondary'} icon={action.icon} title={action.title} onClick={action.onClick}>{action.label}</Button>)}</div>}
  {confirmation}
 </div>;
}
