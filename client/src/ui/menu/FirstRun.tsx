// First run (menu-shell lane): two quick settings, then one of three ways in.
// Keeps the dialog name "Welcome, commander", the "Interface scale" select, the "Enable game sound"
// checkbox (now a switch) and the "Explore game modes" / "Begin field training" accessible names.
import {useId,useState} from 'react';
import type {Application} from '../../app/application';
import {KEYBOARD_LAYOUTS,keyboardLayout,withKeyboardLayout,withMouseScheme,validateBindings,type KeyboardLayout} from '../../runtime/keybindings';
import {ConfirmModal} from './kit/ConfirmModal';
import {Modal} from '../primitives';
import {Field,KitIcon,Segmented,Select,Switch} from './kit';

const SCALES=[.85,1,1.15,1.25,1.5];

export function FirstRun({app}:{app:Application}){
 const initial=app.state.get().settings;
 const [scale,setScale]=useState(initial.uiScale),[sound,setSound]=useState(true),[preset,setPreset]=useState<'standard'|'classic'>(initial.bindings.preset);
 const [layout,setLayout]=useState<KeyboardLayout|'custom'>(keyboardLayout(initial.bindings)??'custom'),[confirmLayout,setConfirmLayout]=useState<KeyboardLayout>(),[bindingMessage,setBindingMessage]=useState('');
 const ids=useId();
 // Sound defaults on. Apply that consent inside the choice click itself: the
 // browser only lets audio start during a trusted gesture, and finishFirstRun
 // records it after an await, when that gesture has already expired.
 const finish=(tutorial:boolean)=>{const current=app.state.get().settings;if(sound&&!current.audioConsent)app.setSettings({...current,audioConsent:true});return app.finishFirstRun(sound,scale,tutorial)};
 const choices=[
  {key:'tutorial',title:'Begin field training',copy:'New to RTS. Five short guided lessons.',icon:'i-tutorial',primary:true,run:()=>void finish(true)},
  {key:'quick',title:'Quick skirmish',copy:'Played RTS before. One versus one against a Normal AI.',icon:'i-play',primary:false,run:()=>void finish(false).then(()=>app.quickSkirmish())},
  {key:'modes',title:'Explore game modes',copy:'Open the main menu and pick any mode.',icon:'i-menu',primary:false,run:()=>void finish(false)},
 ];
 return <Modal title="Welcome, commander">
  <div className="fcm-firstrun">
   <p className="fcm-firstrun-lead">Set up your console, then choose how to start. Everything here can be changed later in Options.</p>
   <div className="fcm-firstrun-grid">
    <Field label="Interface scale" hint="This window resizes as you choose. Text, buttons and the battle sidebar all follow it.">
     <Select aria-label="Interface scale" value={String(scale)} options={SCALES.map(value=>({value:String(value),label:`${Math.round(value*100)}%${value===1?' · Standard':''}`}))} onChange={value=>{const next=Number(value);setScale(next);app.setSettings({...app.state.get().settings,uiScale:next},false)}}/>
    </Field>
    <Field group label="Sound" hint="Music, unit voices and alerts.">
     <Switch label="Enable game sound" checked={sound} onChange={enabled=>{setSound(enabled);app.setSettings({...app.state.get().settings,audioConsent:enabled})}}/>
    </Field>
    <Field group label="Mouse orders" hint={preset==='classic'?'Left-click selects and gives orders, like classic Command & Conquer.':'Left-click selects; right-click gives orders.'}>
     <Segmented label="Mouse orders" block value={preset} options={[{value:'standard',label:'Modern'},{value:'classic',label:'Classic'}]} onChange={value=>{setPreset(value);app.setSettings({...app.state.get().settings,bindings:withMouseScheme(app.state.get().settings.bindings,value)},false)}}/>
    </Field>
    <Field label="Keyboard layout" hint="Independent of mouse orders. Applying a preset replaces keyboard remaps.">
     <Select aria-label="Keyboard layout" value={layout} options={[{value:'custom',label:'Custom remaps',disabled:true},...KEYBOARD_LAYOUTS.map(item=>({value:item.id,label:item.label}))]} onChange={value=>{if(KEYBOARD_LAYOUTS.some(item=>item.id===value))setConfirmLayout(value as KeyboardLayout)}}/>
    </Field>
   </div>
   {bindingMessage&&<p role="status">{bindingMessage}</p>}
   <div className="fcm-firstrun-choices" role="group" aria-label="How do you want to start?">
    {choices.map(choice=><button key={choice.key} type="button" className={`fcm-choice${choice.primary?' fcm-choice--primary':''}`} aria-label={choice.title} aria-describedby={`${ids}-${choice.key}`} onClick={choice.run}>
     <KitIcon id={choice.icon}/><span className="fcm-choice-title">{choice.title}</span><span className="fcm-choice-copy" id={`${ids}-${choice.key}`}>{choice.copy}</span>
    </button>)}
   </div>
  </div>
  {confirmLayout&&<ConfirmModal title="Replace keyboard shortcuts?" confirmLabel={`Use ${KEYBOARD_LAYOUTS.find(item=>item.id===confirmLayout)!.label}`} onCancel={()=>setConfirmLayout(undefined)} onConfirm={()=>{const next=withKeyboardLayout(app.state.get().settings.bindings,confirmLayout),issues=validateBindings(next);if(issues.length)setBindingMessage('This layout conflicts with your modifier choices. Adjust them in Options → Controls.');else{app.setSettings({...app.state.get().settings,bindings:next},false);setLayout(confirmLayout);setBindingMessage('')}setConfirmLayout(undefined)}}><p>This replaces all keyboard remaps with the {KEYBOARD_LAYOUTS.find(item=>item.id===confirmLayout)!.label} layout. Mouse buttons and modifiers are kept.</p></ConfirmModal>}
 </Modal>;
}
