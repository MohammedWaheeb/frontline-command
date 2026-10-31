import test from 'node:test';
import assert from 'node:assert/strict';
import {modalFocus} from '../../src/ui/primitives';
import {MODAL_SELECTOR,modalOpen,topmostModal,defaultBindings,keyboardLayout,withKeyboardLayout,withMouseScheme,validateBindings,KEYBOARD_LAYOUTS,resolveShortcut,SHORTCUT_DEFINITIONS} from '../../src/runtime/keybindings';
import {sanitizeSettings} from '../../src/app/settings';
import {productionTabShortcut} from '../../src/ui/hud/sidebar-model';

test('normal and alertdialog stacks own Escape/Tab and restore focus through nested cancel',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'document'),stack:any[]=[],doc:any={activeElement:null,querySelectorAll(selector:string){assert.equal(selector,MODAL_SELECTOR);return {length:stack.length,item:(index:number)=>stack[index]??null}},querySelector(selector:string){assert.equal(selector,MODAL_SELECTOR);return stack[0]??null}};
 const control=()=>({tabIndex:0,isConnected:true,matches:()=>false,closest:()=>null,getClientRects:()=>[{}],focus(){doc.activeElement=this}});
 const dialog=(role:string,controls:any[])=>({...control(),role,querySelectorAll:()=>controls,listener:undefined as any,addEventListener(_name:string,listener:any){this.listener=listener},removeEventListener(){this.listener=undefined}});
 const send=(node:any,key:string,shiftKey=false)=>{const event={key,shiftKey,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}};node.listener(event);return event};
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 try{
  for(const role of ['dialog','alertdialog']){
   const trigger=control();trigger.focus();const a=control(),b=control(),base=dialog(role,[a,b]);stack.push(base);let closed=0;const dispose=modalFocus(base,()=>{closed++});
   assert.equal(doc.activeElement,a);assert.equal(topmostModal(),base);assert.equal(modalOpen(),true);
   assert.equal(send(base,'Tab',true).defaultPrevented,true);assert.equal(doc.activeElement,b);
   assert.equal(send(base,'Tab').defaultPrevented,true);assert.equal(doc.activeElement,a);
   const cancel=control(),confirm=control(),alert=dialog('alertdialog',[cancel,confirm]);stack.push(alert);let canceled=0;const cleanup=modalFocus(alert,()=>{canceled++});
   assert.equal(send(base,'Escape').defaultPrevented,false);assert.equal(closed,0);
   assert.equal(send(alert,'Tab',true).defaultPrevented,true);assert.equal(doc.activeElement,confirm);
   assert.equal(send(alert,'Tab').defaultPrevented,true);assert.equal(doc.activeElement,cancel);
   const escape=send(alert,'Escape');assert.equal(escape.defaultPrevented,true);assert.equal(escape.stopped,true);assert.equal(canceled,1);assert.equal(closed,0);
   stack.pop();cleanup();assert.equal(doc.activeElement,a);
   send(base,'Escape');assert.equal(closed,1);stack.pop();dispose();assert.equal(doc.activeElement,trigger);
  }
  const empty=dialog('alertdialog',[]);stack.push(empty);const cleanup=modalFocus(empty,()=>{});assert.equal(send(empty,'Tab').defaultPrevented,true);assert.equal(doc.activeElement,empty);stack.pop();cleanup();assert.equal(modalOpen(),false);
 }finally{if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document')}
});

test('layout and mouse scheme are independent, saved layouts persist and custom remaps are detectable',()=>{
 for(const {id} of KEYBOARD_LAYOUTS){
  const source=defaultBindings('classic');source.pointer.pan=4;source.modifiers.queue='alt';source.keys.stop=[{code:'KeyJ'}];const before=structuredClone(source);
  assert.equal(keyboardLayout(source),undefined);
  const layout=withKeyboardLayout(source,id);assert.equal(keyboardLayout(layout),id);assert.deepEqual(layout.pointer,source.pointer);assert.deepEqual(layout.modifiers,source.modifiers);assert.deepEqual(source,before);
  // Default modifiers keep all three presets conflict-free after persistence.
  layout.modifiers.queue='shift';assert.deepEqual(validateBindings(layout),[]);assert.deepEqual(sanitizeSettings({bindings:layout}).bindings,layout);
  const mouse=withMouseScheme(layout,'standard');assert.equal(mouse.preset,'standard');assert.deepEqual(mouse.keys,layout.keys);assert.deepEqual(mouse.modifiers,layout.modifiers);assert.equal(mouse.pointer.context,2);assert.equal(keyboardLayout(mouse),id);
 }
 const legacy=defaultBindings();legacy.keys.card_slot_13=[];legacy.keys.card_slot_14=[];legacy.keys.card_slot_15=[];assert.deepEqual(validateBindings(legacy),[]);assert.deepEqual(sanitizeSettings({bindings:legacy}).bindings,legacy);
 assert.equal(SHORTCUT_DEFINITIONS.filter(item=>item.id.startsWith('card_slot_')).length,12);
});

test('production tab presentation uses configured chords and shows no invented fallback',()=>{
 for(const bindings of [defaultBindings('standard','classic'),{...defaultBindings(),keys:{...defaultBindings().keys,production_base:[]}}]){
  assert.deepEqual(productionTabShortcut(bindings.keys,'structures',0),[]);assert.equal(resolveShortcut({code:'Digit1',altKey:true},bindings),undefined);
 }
 const custom=defaultBindings();custom.keys.production_base=[{code:'KeyJ'}];assert.deepEqual(productionTabShortcut(custom.keys,'structures',0),custom.keys.production_base);assert.equal(resolveShortcut({code:'KeyJ'},custom)?.action,'production_base');
 assert.deepEqual(productionTabShortcut({},'structures',0),[]);
});
