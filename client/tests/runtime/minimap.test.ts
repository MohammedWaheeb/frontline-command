import test from 'node:test';
import assert from 'node:assert/strict';
import {minimapLayout,minimapProject,minimapWorldPoint} from '../../src/render/minimap';
test('radar keeps battlefield projection across maps and accessibility panel sizes',()=>{
 for(const [mw,mh,w,h] of [[128,128,300,84],[128,64,280,180],[64,128,220,240],[96,96,450,126]]){
  const b=minimapLayout(mw,mh,w,h);
  assert.equal(b.width,b.height*2);assert(b.x>=5.99&&b.y>=5.99);
  assert(b.x+b.width<=w-5.99&&b.y+b.height<=h-5.99);
  assert.deepEqual(minimapWorldPoint(mw,mh,w,h,{x:w/2,y:h/2}),{x:mw*500,y:mh*500});
  for(const p of [{x:mw*250,y:mh*750},{x:0,y:0},{x:mw*1000-1,y:mh*1000-1}])assert.deepEqual(minimapWorldPoint(mw,mh,w,h,minimapProject(b,p)),p);
  assert.deepEqual(minimapWorldPoint(mw,mh,w,h,{x:b.originX,y:-100}),{x:0,y:0});
  assert.deepEqual(minimapWorldPoint(mw,mh,w,h,{x:w/2,y:h+100}),{x:mw*1000-1,y:mh*1000-1});
  const center={x:mw*500,y:mh*500},c=minimapProject(b,center),dx=minimapProject(b,{x:center.x+1000,y:center.y}),dy=minimapProject(b,{x:center.x,y:center.y+1000});
  assert(Math.abs(dx.x-c.x-(c.x-dy.x))<1e-9);assert(Math.abs(dx.y-c.y-(dy.y-c.y))<1e-9);assert(Math.abs((dx.x-c.x)-2*(dx.y-c.y))<1e-9);
 }
});
