import test from 'node:test';
import assert from 'node:assert/strict';
import {BattlefieldRenderer,cappedResolution} from '../../src/render/battlefield';

class PointerCanvas extends EventTarget {
 readonly captured=new Set<number>();
 focus(){}
 getBoundingClientRect(){return {left:0,top:0}}
 setPointerCapture(id:number){this.captured.add(id)}
 hasPointerCapture(id:number){return this.captured.has(id)}
 releasePointerCapture(id:number){this.captured.delete(id);this.send('lostpointercapture',id)}
 send(type:string,pointerId=1,button=0,clientX=10,clientY=20){
  this.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{pointerId,button,clientX,clientY}));
 }
}

function fixture(run:(state:any,canvas:PointerCanvas,gestures:string[],pans:number[][],windowTarget:EventTarget)=>void,pointer={select:0,context:2,pan:1,cancel:2}){
 const original=Object.getOwnPropertyDescriptor(globalThis,'window'),windowTarget=new EventTarget();
 Object.defineProperty(globalThis,'window',{configurable:true,value:windowTarget});
 const canvas=new PointerCanvas(),gestures:string[]=[],pans:number[][]=[];
 // Bind the real product listeners without creating a GPU/application.
 const state=Object.create(BattlefieldRenderer.prototype) as any;
 Object.assign(state,{app:{canvas},listeners:new AbortController(),overlay:{clear(){}},settings:{bindings:{pointer},dragThreshold:5},lastHover:Infinity,
  emit:(kind:string)=>gestures.push(kind),pan:(...delta:number[])=>pans.push(delta)});
 try{state.bindInput();run(state,canvas,gestures,pans,windowTarget)}finally{state.listeners.abort();if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window')}
}

test('only the captured pointer can move, cancel or finish a battlefield drag',()=>fixture((state,canvas,gestures,pans)=>{
 canvas.send('pointerdown',1);canvas.send('pointerdown',2);
 assert.equal(state.drag.pointer,1);assert.deepEqual([...canvas.captured],[1]);
 canvas.send('pointermove',2,0,200,200);canvas.send('pointercancel',2);canvas.send('pointerup',2);
 assert.deepEqual(state.drag.last,{x:10,y:20});assert.deepEqual(gestures,[]);assert.deepEqual(pans,[]);
 canvas.send('pointerup',1);assert.deepEqual(gestures,['click']);assert.equal(state.drag,undefined);assert.equal(canvas.captured.size,0);
}));

test('capture loss and window blur cancel without issuing a selection or order',()=>fixture((state,canvas,gestures,_pans,windowTarget)=>{
 canvas.send('pointerdown');canvas.releasePointerCapture(1);canvas.send('pointerup');
 assert.equal(state.drag,undefined);assert.deepEqual(gestures,[]);
 canvas.send('pointerdown');windowTarget.dispatchEvent(new Event('blur'));canvas.send('pointerup');
 assert.equal(state.drag,undefined);assert.equal(canvas.captured.size,0);assert.deepEqual(gestures,[]);
}));

test('matching pointer keeps click, context, box and pan behavior; a chord mismatch cancels',()=>fixture((state,canvas,gestures,pans)=>{
 canvas.send('pointerdown',1,2);canvas.send('pointerup',1,2);
 canvas.send('pointerdown');canvas.send('pointermove',1,0,30,40);canvas.send('pointerup',1,0,30,40);
 canvas.send('pointerdown',1,1);canvas.send('pointermove',2,1,200,200);canvas.send('pointermove',1,1,14,26);canvas.send('pointerup',1,1,14,26);
 assert.deepEqual(gestures,['context','box']);assert.deepEqual(pans,[[-4,-6]]);
 canvas.send('pointerdown');canvas.send('pointerup',1,2);
 assert.equal(state.drag,undefined);assert.equal(canvas.captured.size,0);assert.deepEqual(gestures,['context','box']);
}));

test('context gestures follow the remapped pointer bindings, not a hardcoded button',()=>{
 fixture((_state,canvas,gestures)=>{
  canvas.send('pointerdown',1,4);canvas.send('pointerup',1,4);
  canvas.send('pointerdown',1,2);canvas.send('pointerup',1,2);
  assert.deepEqual(gestures,['context','click']);
 },{select:0,context:4,pan:1,cancel:2});
 // Classic preset shares select/context on the left button; the separate
 // cancel button carries the contextual gesture there.
 fixture((_state,canvas,gestures)=>{
  canvas.send('pointerdown',1,0);canvas.send('pointerup',1,0);
  canvas.send('pointerdown',1,2);canvas.send('pointerup',1,2);
  assert.deepEqual(gestures,['click','context']);
 },{select:0,context:0,pan:1,cancel:2});
});

test('renderer resolution tracks display pixel-ratio changes within the cap',()=>{
 assert.equal(cappedResolution(3),2);assert.equal(cappedResolution(1.5),1.5);assert.equal(cappedResolution(0),1);assert.equal(cappedResolution(Number.NaN),1);
 const original=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio');
 let resizes=0,transforms=0;
 const state=Object.create(BattlefieldRenderer.prototype) as any;
 Object.assign(state,{app:{renderer:{resolution:1},resize(){resizes++}},disposed:false,cameraTransform(){transforms++}});
 try{
  Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:3});
  state.syncResolution();assert.equal(state.app.renderer.resolution,2);assert.equal(resizes,1);assert.equal(transforms,1);
  state.syncResolution();assert.equal(resizes,1);
  Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:1});
  state.syncResolution();assert.equal(state.app.renderer.resolution,1);assert.equal(resizes,2);
 }finally{if(original)Object.defineProperty(globalThis,'devicePixelRatio',original);else Reflect.deleteProperty(globalThis,'devicePixelRatio')}
});
