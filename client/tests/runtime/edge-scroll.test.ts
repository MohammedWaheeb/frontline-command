import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {BattlefieldRenderer} from '../../src/render/battlefield';

// Drive the real frame callback with a recording camera, without a GPU. Total
// travel for one second must not depend on the monitor's refresh/frame rate.
function harness(t:TestContext){
 const original=globalThis.document;let modal=false,now=0;
 t.mock.method(performance,'now',()=>now);
 globalThis.document={querySelector:()=>modal?{}:null} as unknown as Document;
 t.after(()=>{globalThis.document=original});
 const renderer=Object.create(BattlefieldRenderer.prototype) as any,moves:Array<{x:number;y:number}>=[];
 renderer.settings={edgeScroll:true,scrollSpeed:1,bindings:{pointer:{pan:1}}};renderer.pointer={x:1599,y:899};renderer.app={screen:{width:1600,height:900}};
 renderer.frame=0;renderer.camera={zoom:1};renderer.world={x:0,y:0};renderer.actors=new Map();renderer.deaths=[];renderer.memoryLabels=[];
 renderer.environment={render(){},shadowPlates:[]};renderer.surfaceShadows={update(){}};renderer.combat={draw(){},trim(){}};renderer.overlay={clear(){}};renderer.options={art:{trim(){}}};
 for(const method of ['updateShake','cameraTransform','terrainFrame','drawTactical','paintMinimap'])renderer[method]=()=>{};
 renderer.pan=(x:number,y:number)=>moves.push({x,y});
 return {renderer,moves,frame:(value:number)=>{now=value;renderer.render()},modal:(value:boolean)=>{modal=value}};
}

for(const hz of [30,60,120,144])test(`edge scrolling keeps its 60 Hz speed at ${hz} render frames per second`,t=>{
 const h=harness(t);h.frame(0);for(let i=1;i<=hz;i++)h.frame(i*1000/hz);
 assert.ok(Math.abs(h.moves.reduce((sum,v)=>sum+v.x,0)-420)<1e-7);
 assert.ok(Math.abs(h.moves.reduce((sum,v)=>sum+v.y,0)-420)<1e-7);
});

test('stalled frames are bounded, speed settings still scale movement, and backwards clocks cannot pan',t=>{
 const h=harness(t);h.renderer.settings.scrollSpeed=2;h.frame(0);h.frame(5000);
 assert.deepEqual(h.moves,[{x:42,y:42}]);h.frame(4000);assert.equal(h.moves.length,1);
});

test('modal controls clear edge intent and require a fresh canvas pointer after closing',t=>{
 const h=harness(t);h.frame(0);h.modal(true);h.frame(20);assert.equal(h.renderer.pointer,undefined);assert.equal(h.moves.length,0);
 h.modal(false);h.frame(40);assert.equal(h.moves.length,0);
 h.renderer.pointer={x:0,y:0};h.frame(60);assert.deepEqual(h.moves,[{x:-8.4,y:-8.4}]);
});

test('missing pointer, dragging and disabled edge scrolling cannot move the camera',t=>{
 const h=harness(t);h.frame(0);h.renderer.pointer=undefined;h.frame(20);h.renderer.pointer={x:1599,y:899};h.renderer.drag={button:1};h.frame(40);
 h.renderer.drag=undefined;h.renderer.settings.edgeScroll=false;h.frame(60);assert.equal(h.moves.length,0);
});

test('actual canvas leave and window blur listeners stop edge scrolling',t=>{
 const h=harness(t),canvasEvents=new Map<string,()=>void>(),windowEvents=new Map<string,()=>void>(),original=globalThis.window;
 globalThis.window={addEventListener:(name:string,callback:()=>void)=>windowEvents.set(name,callback)} as unknown as Window&typeof globalThis;
 t.after(()=>{globalThis.window=original});
 h.renderer.listeners=new AbortController();h.renderer.app.canvas={addEventListener:(name:string,callback:()=>void)=>canvasEvents.set(name,callback)};
 h.renderer.bindInput();h.frame(0);canvasEvents.get('pointerleave')!();h.frame(20);assert.equal(h.renderer.pointer,undefined);assert.equal(h.moves.length,0);
 h.renderer.pointer={x:1599,y:899};windowEvents.get('blur')!();h.frame(40);assert.equal(h.renderer.pointer,undefined);assert.equal(h.moves.length,0);
});
