import {useEffect,useState} from 'react';
import type {Application} from '../app/application';
import type {BattleController} from '../app/battle-controller';
import {useObservable} from '../app/store';
import type {ControlBindings} from '../runtime/keybindings';
import {shortcutLabel} from './shortcut-presentation';
interface Step{id:string;kind:string;text?:string;objective?:string}
function shortcut(bindings:ControlBindings,action:string){return bindings.keys[action]?.map(chord=>shortcutLabel(chord)).join(' or ')||'Unbound — set it in Options'}
function hint(kind:string,bindings:ControlBindings){
 const mouse=(button:number)=>['Left mouse','Middle mouse','Right mouse','Mouse 4','Mouse 5'][button];
 if(kind==='select')return `${mouse(bindings.pointer.select)} selects; drag that button around several units.`;
 if(kind==='control_group')return `Store group 1: ${shortcut(bindings,'group_1_store')}. Recall: ${shortcut(bindings,'group_1_recall')}.`;
 if(kind==='board')return `Select the marked infantry, press ${shortcut(bindings,'board')}, then ${mouse(bindings.pointer.select)} on the transport.`;
 if(kind==='unload')return `Select the transport, press ${shortcut(bindings,'unload')}, then ${mouse(bindings.pointer.select)} on clear ground inside the marker.`;
 if(kind==='rally')return `Select the barracks, press ${shortcut(bindings,'rally')}, then ${mouse(bindings.pointer.select)} on clear ground.`;
 if(kind==='stop')return `With your infantry selected, press ${shortcut(bindings,'stop')} or the Stop command.`;
 if(kind==='attack')return `${shortcut(bindings,'attack_move')}, then ${mouse(bindings.pointer.select)} near the target to advance and fight.`;
 if(kind==='rejected_order')return `Build selects your rig. Choose a Power station tile, then ${mouse(bindings.pointer.select)} on the occupied HQ footprint. Rejected placement spends no credits.`;
 if(kind==='move')return `${shortcut(bindings,'move')}, then ${mouse(bindings.pointer.select)} on the destination.`;
 return '';
}
export function TutorialGuide({app,control}:{app:Application;control:BattleController}){
 const state=useObservable(app.state),battle=useObservable(control.state),[steps,setSteps]=useState<Step[]>([]),[hidden,setHidden]=useState(false),mission=state.snapshot?.mission;
 const entry=state.index?.missions.find(entry=>entry.id===mission?.id&&entry.mode==='tutorial');
 useEffect(()=>{setSteps([]);setHidden(false)},[entry?.id,state.session.id]);
 useEffect(()=>{if(!entry?.presentation_url||state.session.kind!=='solo')return;const abort=new AbortController();void(async()=>{try{const response=await fetch(entry.presentation_url!,{signal:abort.signal});if(!response.ok)throw Error('Training presentation is unavailable.');const text=await response.text();if(text.length>256*1024)throw Error('Training presentation is too large.');const value=JSON.parse(text);if(value.mission_id!==entry.id||value.mission_version!==entry.version||!Array.isArray(value.tutorial_steps)||value.tutorial_steps.length>64)throw Error('Training presentation does not match this mission.');const allowed=['select','move','attack','stop','control_group','rally','rejected_order','board','unload'];if(value.tutorial_steps.some((step:Step)=>!step||typeof step.id!=='string'||!allowed.includes(step.kind)||step.text!==undefined&&(typeof step.text!=='string'||step.text.length>2000)||step.objective!==undefined&&typeof step.objective!=='string'))throw Error('Training reminders are malformed.');setSteps(value.tutorial_steps)}catch(error){if(!abort.signal.aborted)app.patch({notice:error instanceof Error?error.message:'Training reminders unavailable.'})}})();return()=>abort.abort()},[app,entry?.id,entry?.presentation_url,state.session.id]);
 const complete=(step:Step)=>step.objective?mission?.objectives.some(objective=>objective.id===step.objective&&objective.complete):step.kind==='select'?battle.learned.includes('single_select')&&battle.learned.includes('box_select'):step.kind==='control_group'?battle.learned.includes('group_store')&&battle.learned.includes('group_recall'):battle.learned.includes(step.kind);
 const next=steps.find(step=>!complete(step));if(!entry||!next)return null;if(hidden)return <button onClick={()=>setHidden(false)}>Show training reminders</button>;const text=next.text??mission?.objectives.find(objective=>objective.id===next.objective)?.text??next.kind;
 return <aside className="tutorial-guide console" aria-label="Training reminder"><span>FIELD INSTRUCTION {steps.filter(complete).length+1}/{steps.length}</span><p>{text}</p><small>{hint(next.kind,state.settings.bindings)}</small><button aria-label="Hide training reminders" onClick={()=>setHidden(true)}>Hide reminders</button></aside>;
}
