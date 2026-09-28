import test from 'node:test';
import assert from 'node:assert/strict';
import {weaponReach,selectionRange} from '../../src/render/range-geometry';
import type {TacticalSelection} from '../../src/app/tactical-presentation';

test('point-target reach preserves distance from circular and rectangular firing footprints',()=>{
 const center={x:14000,y:18000};
 for(const distance of [0,1500,7000,20000]){
  const circle=weaponReach(center,{kind:'circle',radius:600},distance);
  for(const p of circle)assert(Math.abs(Math.hypot(p.x-center.x,p.y-center.y)-600-distance)<1e-7);
  const rectangle=weaponReach(center,{kind:'rectangle',width:4000,height:3000},distance);
  assert(rectangle.length<=300);
  for(const p of rectangle){const dx=Math.max(0,Math.abs(p.x-center.x)-2000),dy=Math.max(0,Math.abs(p.y-center.y)-1500);assert(Math.abs(Math.hypot(dx,dy)-distance)<1e-7)}
  assert.equal(Math.max(...rectangle.map(p=>p.x)),center.x+2000+distance);
  assert.equal(Math.min(...rectangle.map(p=>p.y)),center.y-1500-distance);
 }
 assert.deepEqual(weaponReach(center,{kind:'circle',radius:400},NaN),[]);
 assert.deepEqual(weaponReach(center,{kind:'rectangle',width:-1,height:2000},1000),[]);
});
test('range modes never substitute public base sight/detection for absent owner disclosure',()=>{
 const item:TacticalSelection={entity:1,position:{x:10000,y:10000},orders:[],catalogSight:9000,catalogDetection:4000,weaponRange:{weapon:'ART',minimum:2500,maximum:12000,metric:'edge-distance',origin:{kind:'circle',radius:600},advisory:true}};
 assert.deepEqual(selectionRange(item,'off'),[]);assert.deepEqual(selectionRange(item,'sight'),[]);assert.deepEqual(selectionRange(item,'detection'),[]);
 const weapon=selectionRange(item,'weapon');assert.deepEqual(weapon.map(value=>value.kind),['weapon','minimum']);assert.match(weapon[0].caption,/REFERENCE/);
 const owner={...item,ranges:{sightRadius:8500,detectionRadius:3000,buildRadius:0,airborneSight:false}};
 assert.match(selectionRange(owner,'sight')[0].caption,/TERRAIN LIMITS/);
 assert.equal(selectionRange(owner,'sight')[0].points[0].x,18500);
 assert.match(selectionRange(owner,'detection')[0].caption,/SIGHT REQUIRED/);
 assert.deepEqual(selectionRange({...owner,ranges:{...owner.ranges,detectionRadius:0}},'detection'),[]);
 assert(!selectionRange({...owner,ranges:{...owner.ranges,airborneSight:true}},'sight')[0].caption.includes('TERRAIN'));
});
