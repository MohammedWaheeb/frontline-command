import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorHandles,editorHandleBox} from '../../src/render/editor-handles';
import type {ArtLibrary,FrameSet,SpriteSheet} from '../../src/render/art';
const frame={texture:{source:{resource:{}},frame:{x:45,y:0,width:44,height:23}},anchorX:.5,anchorY:12/23} as FrameSet;
function fakeArt(missing=false){let releases=0,settled=false;const requests:unknown[][]=[];const sheet={frame(...args:unknown[]){requests.push(args);return settled?frame:undefined},async settle(){settled=true}} as unknown as SpriteSheet;
 const art:Pick<ArtLibrary,'sheet'|'release'>={async sheet(id){return missing&&id.includes('region')?undefined:sheet},async release(){releases++}};return {art,requests,releases:()=>releases}}
test('editor handle stays 32 CSS pixels on square/rectangular resized grids and keeps exact anchor',()=>{
 const shape={width:44,height:23,anchorX:.5,anchorY:12/23};for(const ratio of [1,.75,768/468,768/312,3]){const anchor={x:175.5,y:271.25},box=editorHandleBox(anchor,shape,ratio);assert.equal(box.width/ratio,32);assert(Math.abs((box.y+box.height*shape.anchorY)-anchor.y)<1e-9);assert.equal(box.x+box.width*.5,anchor.x);assert(Math.abs(box.height/box.width-23/44)<1e-12)}
 for(const ratio of [0,-1,NaN,Infinity])assert.throws(()=>editorHandleBox({x:0,y:0},shape,ratio));
});
test('editor loads immutable first beauty frames, paints fixed icons and releases only owned sheets',async()=>{
 const fake=fakeArt(),handles=new EditorHandles(fake.art);const status=await handles.load();assert.deepEqual(status,{ready:['spawn','region'],missing:[]});assert(fake.requests.every(args=>JSON.stringify(args)==='["beauty","idle",0,0]'));
 const draws:unknown[][]=[];const context={drawImage(...args:unknown[]){draws.push(args)}} as unknown as CanvasRenderingContext2D;
 assert(handles.paint(context,'spawn',{x:100,y:200},2));assert.equal(draws[0][1],45);assert.equal(draws[0][7],64);assert.equal(draws[0][8],64*23/44);
 await handles.dispose();await handles.dispose();assert.equal(fake.releases(),1);assert(!handles.paint(context,'region',{x:100,y:200},2));
});
test('missing marker art and failed draw retain the callers vector fallback',async()=>{
 const fake=fakeArt(true),handles=new EditorHandles(fake.art);assert.deepEqual(await handles.load(),{ready:['spawn'],missing:['region']});const context={drawImage(){throw Error('unavailable source')}} as unknown as CanvasRenderingContext2D;
 assert(!handles.paint(context,'region',{x:10,y:20},1));assert(!handles.paint(context,'spawn',{x:10,y:20},1));await handles.dispose();assert.equal(fake.releases(),1);
});
test('leaving during editor atlas loading cannot publish a stale frame and still releases resources',async()=>{
 let resolve!:(sheet:SpriteSheet)=>void,releases=0;const pending=new Promise<SpriteSheet>(done=>resolve=done);const handles=new EditorHandles({sheet:()=>pending,async release(){releases++}});const load=handles.load(),disposed=handles.dispose();resolve({frame(){throw Error('Disposed load must not request pixels')}} as unknown as SpriteSheet);await disposed;assert.deepEqual((await load).ready,[]);assert.equal(releases,1);assert(!handles.paint({} as CanvasRenderingContext2D,'spawn',{x:1,y:2},1));
});
