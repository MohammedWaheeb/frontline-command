import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {BattlefieldRenderer} from '../../src/render/battlefield';

// Exercise the actual attachment/invalidation API. The browser course separately
// verifies drawn pixels; here the canvas and resize device are recording peers.
function harness(t:TestContext){
 let now=1000;t.mock.method(performance,'now',()=>now);
 const original=globalThis.ResizeObserver,observers:Array<{callback:()=>void;closed:boolean}>=[];
 globalThis.ResizeObserver=class {closed=false;constructor(readonly callback:()=>void){observers.push(this)}observe(){}unobserve(){}disconnect(){this.closed=true}} as unknown as typeof ResizeObserver;
 t.after(()=>{globalThis.ResizeObserver=original});
 const renderer=Object.create(BattlefieldRenderer.prototype) as any,paints:HTMLCanvasElement[]=[];
 renderer.camera={x:0,y:0,zoom:1};renderer.app={renderer:{},screen:{width:1600,height:900}};renderer.snapshot={tick:1};renderer.renderMinimap=(canvas:HTMLCanvasElement)=>paints.push(canvas);
 return {renderer,paints,observers,canvas:()=>({} as HTMLCanvasElement),tick:(value:number)=>{now=value;renderer.paintMinimap(now)}};
}

test('minimap paints an already paused snapshot immediately after attachment',t=>{
 const h=harness(t),canvas=h.canvas();h.renderer.attachMinimap(canvas);assert.deepEqual(h.paints,[canvas]);
 for(let i=1;i<=60;i++)h.tick(1000+i*17);assert.equal(h.paints.length,1,'idle cosmetic frames must not repaint a complete minimap');
});
test('paused camera pan, zoom and resize repaint with a bounded cadence',t=>{
 const h=harness(t);h.renderer.attachMinimap(h.canvas());h.renderer.camera.x=100;h.tick(1010);assert.equal(h.paints.length,1);
 h.tick(1080);assert.equal(h.paints.length,2);h.renderer.camera.zoom=.8;h.tick(1160);assert.equal(h.paints.length,3);
 h.renderer.app.screen.width=1280;h.tick(1240);assert.equal(h.paints.length,4);
});
test('mission and actual resize invalidation survive the paint throttle',t=>{
 const h=harness(t);h.renderer.attachMinimap(h.canvas());h.renderer.setMissionMarkers([]);h.tick(1001);assert.equal(h.paints.length,1);
 h.tick(1081);assert.equal(h.paints.length,2);h.observers[0].callback();h.tick(1161);assert.equal(h.paints.length,3);
});
test('detach releases its resize observer and stops later camera painting',t=>{
 const h=harness(t),detach=h.renderer.attachMinimap(h.canvas());detach();assert(h.observers[0].closed);h.renderer.camera.x=100;h.tick(1200);assert.equal(h.paints.length,1);
});
test('stale cleanup cannot detach a newer attachment of the same canvas',t=>{
 const h=harness(t),canvas=h.canvas(),oldDetach=h.renderer.attachMinimap(canvas),newDetach=h.renderer.attachMinimap(canvas);
 assert(h.observers[0].closed);oldDetach();assert.equal(h.observers[1].closed,false,'cleanup belongs to the attachment, not just the DOM element');
 h.renderer.camera.x=100;h.tick(1200);assert.equal(h.paints.length,3);newDetach();assert(h.observers[1].closed);
});
test('an attachment before the first authorized snapshot paints when it arrives',t=>{
 const h=harness(t);h.renderer.snapshot=undefined;h.renderer.attachMinimap(h.canvas());assert.equal(h.paints.length,0);
 h.renderer.snapshot={tick:10};h.tick(1010);assert.equal(h.paints.length,1);
});
