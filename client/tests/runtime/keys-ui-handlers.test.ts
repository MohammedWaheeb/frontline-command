import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {FirstRun} from '../../src/ui/menu/FirstRun';
import {SettingsPanel} from '../../src/ui/SettingsPanel';
import {ConfirmModal} from '../../src/ui/menu/kit/ConfirmModal';
import {Observable} from '../../src/app/store';
import {defaultBindings,KEYBOARD_LAYOUTS,keyboardLayout} from '../../src/runtime/keybindings';
import {sanitizeSettings} from '../../src/app/settings';
import type {Application} from '../../src/app/application';

// Deliberately no DOM or browser: invoke the actual component handlers with a
// synchronous hook dispatcher, then inspect their React elements after rerender.
// Modal DOM keyboard/focus behavior is covered separately in keys-modal-layout.
function component(render:()=>React.ReactNode){
 const hooks:any[]=[],internals=(React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;let cursor=0;
 const slot=(initial:()=>any)=>{const index=cursor++;if(!(index in hooks))hooks[index]=initial();return index};
 const dispatcher={
  useState(initial:any){const index=slot(()=>typeof initial==='function'?initial():initial);return [hooks[index],(value:any)=>{hooks[index]=typeof value==='function'?value(hooks[index]):value}]},
  useRef(initial:any){return hooks[slot(()=>({current:initial}))]},useId(){return hooks[slot(()=>`keys-${cursor}`)]},
  useEffect(){},useLayoutEffect(){},useMemo(factory:()=>any){return factory()},useCallback(callback:any){return callback},useContext(){return null},useSyncExternalStore(_subscribe:any,get:any){return get()},
 };
 return ()=>{const old=internals.H;cursor=0;internals.H=dispatcher;try{return render()}finally{internals.H=old}};
}
function elements(tree:any):any[]{if(Array.isArray(tree))return tree.flatMap(elements);if(!tree||typeof tree!=='object'||!tree.props)return [];return [tree,...elements(tree.props.children)]}
const find=(tree:any,predicate:(element:any)=>boolean)=>{const element=elements(tree).find(predicate);assert.ok(element,'Expected component control');return element};
function application(){
 const bindings=defaultBindings('classic');bindings.keys.stop=[{code:'KeyJ'}];bindings.pointer.pan=4;
 const state=new Observable({settings:sanitizeSettings({bindings})}),writes:unknown[]=[];
 const app={state,audio:{state:new Observable({status:'disabled'})},setSettings(settings:any){writes.push(settings);state.set({settings:sanitizeSettings(settings)})}} as unknown as Application;
 return {app,writes};
}

test('First run and Options expose all layouts, cancel safely, confirm replacement and preserve mouse choices',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>'{"optionsTab":"controls"}',setItem(){}}});
 try{
  for(const Component of [FirstRun,SettingsPanel])for(const {id} of KEYBOARD_LAYOUTS){
   const {app,writes}=application(),render=component(()=>Component({app}));let tree=render();
   const chooser=()=>find(tree,element=>element.props['aria-label']==='Keyboard layout');
   assert.deepEqual(chooser().props.options.filter((option:any)=>option.value!=='custom').map((option:any)=>option.value),['frontline','classic','grid']);
   assert.equal(chooser().props.value,'custom');const before=structuredClone(app.state.get().settings.bindings);
   chooser().props.onChange(id);tree=render();assert.deepEqual(writes,[]);assert.deepEqual(app.state.get().settings.bindings,before);
   find(tree,element=>element.type===ConfirmModal).props.onCancel();tree=render();assert.equal(elements(tree).some(element=>element.type===ConfirmModal),false);assert.deepEqual(writes,[]);
   chooser().props.onChange(id);tree=render();find(tree,element=>element.type===ConfirmModal).props.onConfirm();tree=render();
   assert.equal(writes.length,1);const next=app.state.get().settings.bindings;assert.equal(keyboardLayout(next),id);assert.deepEqual(next.pointer,before.pointer);assert.deepEqual(next.modifiers,before.modifiers);assert.equal(next.preset,before.preset);assert.equal(chooser().props.value,id);
   const mouse=find(tree,element=>element.props.label===(Component===FirstRun?'Mouse orders':'Mouse preset')&&typeof element.props.onChange==='function');
   mouse.props.onChange('standard');tree=render();if(Component===SettingsPanel){find(tree,element=>element.type===ConfirmModal).props.onConfirm();tree=render()}
   assert.equal(app.state.get().settings.bindings.preset,'standard');assert.deepEqual(app.state.get().settings.bindings.keys,next.keys);
  }
 }finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage')}
});

test('First run refuses a layout/modifier collision without resetting custom controls',()=>{
 const {app,writes}=application();app.state.update(state=>({...state,settings:{...state.settings,bindings:{...state.settings.bindings,modifiers:{...state.settings.bindings.modifiers,queue:'alt'}}}}));
 const before=structuredClone(app.state.get().settings.bindings),render=component(()=>FirstRun({app}));let tree=render();
 find(tree,element=>element.props['aria-label']==='Keyboard layout').props.onChange('grid');tree=render();find(tree,element=>element.type===ConfirmModal).props.onConfirm();tree=render();
 assert.deepEqual(writes,[]);assert.deepEqual(app.state.get().settings.bindings,before);assert.match(find(tree,element=>element.props.role==='status').props.children,/conflicts/);
});
