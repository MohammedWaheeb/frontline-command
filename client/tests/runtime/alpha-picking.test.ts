import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAlphaMask,alphaInFrame} from '../../src/render/alpha-picking';

test('atlas mask preserves faint body opacity across byte and row boundaries',()=>{
 const width=37,height=3,rgba=new Uint8ClampedArray(width*height*4);
 for(const i of [0,7,8,31,32,36,37,73,110])rgba[i*4+3]=i===7?1:255;
 const mask=makeAlphaMask(width,height,rgba),frame={x:0,y:0,w:width,h:height};
 assert.equal(mask.bits.byteLength,Math.ceil(width*height/8));
 for(let i=0;i<width*height;i++)assert.equal(alphaInFrame(mask,frame,i%width+.5,Math.floor(i/width)+.5,0),rgba[i*4+3]>0);
 rgba.fill(0);assert(alphaInFrame(mask,frame,7.5,.5,0),'mask must not retain mutable decoded RGBA');
});

test('normal tolerance reaches nearby body but never pixels belonging to a neighboring atlas frame',()=>{
 const rgba=new Uint8ClampedArray(20*10*4);rgba[(4*20+8)*4+3]=255;rgba[(4*20+12)*4+3]=255;
 const mask=makeAlphaMask(20,10,rgba),frame={x:5,y:2,w:6,h:6};
 assert(alphaInFrame(mask,frame,3.5,2.5,0));
 assert(alphaInFrame(mask,frame,1.5,2.5,2));
 assert.equal(alphaInFrame(mask,frame,.5,2.5,2),false);
 assert.equal(alphaInFrame(mask,frame,7.5,2.5,1),false,'adjacent frame must not leak through a source-frame edge');
 assert.equal(alphaInFrame(mask,frame,-3,2.5,1),false);
 assert.equal(alphaInFrame(mask,frame,NaN,0,6),false);
 assert.equal(alphaInFrame(mask,frame,0,0,-1),false);
});

test('empty body page remains unselectable and malformed decoded dimensions are rejected',()=>{
 const mask=makeAlphaMask(3,2,new Uint8ClampedArray(24));
 assert.equal(alphaInFrame(mask,{x:0,y:0,w:3,h:2},1,1,30),false);
 assert.throws(()=>makeAlphaMask(3,2,new Uint8ClampedArray(20)),/Invalid atlas/);
 assert.throws(()=>makeAlphaMask(0,2,new Uint8ClampedArray()),/Invalid atlas/);
});
