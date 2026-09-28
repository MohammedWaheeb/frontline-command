import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeServiceSurfaces,serviceSurfaceAt,serviceSurfaceLift2x} from '../../src/render/service-surfaces';
const plane=(id:string,z:number,polygon:number[][])=>({id,z_bu:z,lift_2x_px:serviceSurfaceLift2x(z),polygon_mt:polygon});
const source=()=>({schema:'fc-service-surfaces/1',coordinates:'local_sim_mt',surfaces:[plane('foundation',.035,[[-2980,-2480],[2980,-2480],[2980,2480],[-2980,2480]]),plane('apron',.0735,[[-2700,-1700],[2700,-1700],[2700,1700],[-2700,1700]])]});
test('real source heights support the actual service center/grid, highest plane and zero-height ground distinctly',()=>{
 const original=source(),data=decodeServiceSurfaces(original,[6,5]);
 for(const x of [-1300,0,1300])for(const y of [-650,650])assert.equal(serviceSurfaceAt(data,{x,y})?.id,'apron');
 assert.equal(serviceSurfaceAt(data,{x:0,y:0})?.id,'apron');assert.equal(serviceSurfaceAt(data,{x:2800,y:0})?.id,'foundation');assert.equal(serviceSurfaceAt(data,{x:3900,y:0}),undefined);
 assert.ok(Math.abs(serviceSurfaceAt(data,{x:0,y:0})!.lift_2x_px/2-2.8806006)<1e-6);
 original.surfaces[1].z_bu=400;assert.equal(serviceSurfaceAt(data,{x:0,y:0})?.z_bu,.0735);assert.ok(Object.isFrozen(data.surfaces[0].polygon_mt[0]));
 const zero=decodeServiceSurfaces({...source(),surfaces:[plane('ground',0,[[-100,-100],[100,-100],[100,100],[-100,100]])]},[3,3]);assert.equal(serviceSurfaceAt(zero,{x:0,y:0})?.lift_2x_px,0);assert.equal(serviceSurfaceAt(zero,{x:101,y:0}),undefined);
});
test('retained physical footprint and sim-local axes determine support, not the converted faction capacity',()=>{
 const sy=decodeServiceSurfaces({...source(),surfaces:[plane('workshop-pad',.0745,[[-1300,-600],[1300,-600],[1300,600],[-1300,600]])]},[3,3]);
 assert.equal(serviceSurfaceAt(sy,{x:-650,y:0})?.id,'workshop-pad');assert.equal(serviceSurfaceAt(sy,{x:650,y:0})?.id,'workshop-pad');assert.equal(serviceSurfaceAt(sy,{x:650,y:1300}),undefined);
 assert.throws(()=>decodeServiceSurfaces(source(),[3,3]),{code:'art_service_surface_invalid'});
});
test('edge/vertex sampling is inclusive for either winding but outside collinear extensions remain ground',()=>{
 const input={...source(),surfaces:[plane('pad',.035,[[-100,-100],[100,-100],[100,100],[-100,100]])]};
 for(const reverse of [false,true]){const raw=structuredClone(input);if(reverse)raw.surfaces[0].polygon_mt.reverse();const data=decodeServiceSurfaces(raw,[1,1]);
  for(const p of [{x:-100,y:-100},{x:100,y:100},{x:0,y:100},{x:99.5,y:-99.5}])assert.ok(serviceSurfaceAt(data,p));
  for(const p of [{x:101,y:100},{x:100,y:101},{x:NaN,y:0},{x:0,y:Infinity}])assert.equal(serviceSurfaceAt(data,p),undefined);
 }
});
test('invalid or invented support metadata cannot supply a blanket lift',()=>{
 for(const mutate of [
  (v:any)=>v.schema='fc-service-surfaces/2',(v:any)=>v.extra=true,(v:any)=>v.coordinates='screen_px',(v:any)=>v.surfaces[0].z_bu=NaN,(v:any)=>v.surfaces[0].lift_2x_px=50,(v:any)=>v.surfaces[0].z_bu=-1,
  (v:any)=>v.surfaces.push(v.surfaces[0]),(v:any)=>v.surfaces[0].polygon_mt=[[0,0],[100,100],[0,100],[100,0]],(v:any)=>v.surfaces[0].polygon_mt=[[0,100],[59,-81],[-95,31],[95,31],[-59,-81]],
  (v:any)=>v.surfaces[0].polygon_mt=[[0,0],[100,0],[100,0],[0,100]],(v:any)=>v.surfaces[0].polygon_mt=[[0,0],[100,0],[50,50],[100,100],[0,100]],(v:any)=>v.surfaces[0].polygon_mt[0][0]=.5,
 ]){const value=source();mutate(value);assert.throws(()=>decodeServiceSurfaces(value,[6,5]),{code:'art_service_surface_invalid'})}
});
