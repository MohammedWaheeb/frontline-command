import test from 'node:test';
import assert from 'node:assert/strict';
import {newOrderPulses,orderColor,orderSignature,ORDER_COLORS} from '../../src/render/tactical-overlay';
import {assessPlacement} from '../../src/render/placement-cells';
import {minimapFogBrightness} from '../../src/render/minimap';
import {initialZoom,apronBands,ZOOM_MIN,ZOOM_MAX} from '../../src/render/battlefield';
import {RELATION_MARK,healthBarSize,healthFill,HEALTH_FILL,healthBarZoomScale} from '../../src/render/selection-marks';
import {ownerTeamColor} from '../../src/design/team-colors';
import type {TacticalOrderMarker} from '../../src/app/tactical-presentation';

const move=(x:number,y:number,index=0):TacticalOrderMarker=>({index,kind:'move',position:{x,y},unresolvedTarget:false});

test('order pulses fire only for a newly accepted order of an already-selected unit',()=>{
 const t0=new Map<number,string>();
 let r=newOrderPulses(t0,[{entity:1,orders:[]}],0);assert.equal(r.pulses.length,0);
 r=newOrderPulses(r.signatures,[{entity:1,orders:[move(5000,5000)]}],10);assert.equal(r.pulses.length,1);assert.deepEqual(r.pulses[0].position,{x:5000,y:5000});
 r=newOrderPulses(r.signatures,[{entity:1,orders:[move(5000,5000)]}],20);assert.equal(r.pulses.length,0,'unchanged order never repeats');
 // Newly selected unit with an existing order sets a baseline only.
 r=newOrderPulses(r.signatures,[{entity:1,orders:[move(5000,5000)]},{entity:2,orders:[move(9000,9000)]}],30);assert.equal(r.pulses.length,0);
 // Reaching a waypoint (index shift) is not a new order; a queued waypoint is.
 r=newOrderPulses(r.signatures,[{entity:2,orders:[move(9000,9000,0),move(12000,9000,1)]}],40);assert.equal(r.pulses.length,1);
 r=newOrderPulses(r.signatures,[{entity:2,orders:[move(12000,9000,0)]}],50);assert.equal(r.pulses.length,0);
 // A moving attack target keeps its id signature.
 const attack=(x:number):TacticalOrderMarker=>({index:0,kind:'attack',target:77,position:{x,y:1000},unresolvedTarget:false});
 assert.equal(orderSignature([attack(1000)])!.key,orderSignature([attack(4000)])!.key);
 // Group moves to one tile collapse to one marker; reset clears.
 const group=newOrderPulses(new Map([[3,''],[4,'']]),[{entity:3,orders:[move(7100,7100)]},{entity:4,orders:[move(7400,7300)]}],60);assert.equal(group.pulses.length,1);
 assert.equal(newOrderPulses(new Map([[3,'']]),[{entity:3,orders:[move(7100,7100)]}],70,true).pulses.length,0);
});

test('order colours come from world tokens and distinguish move, attack and attack-move',()=>{
 assert.equal(orderColor('move'),ORDER_COLORS.move);assert.equal(orderColor('attack'),ORDER_COLORS.attack);assert.equal(orderColor('attack_move'),ORDER_COLORS.attackMove);
 assert.equal(new Set([ORDER_COLORS.move,ORDER_COLORS.attack,ORDER_COLORS.attackMove]).size,3);
 assert.notEqual(ORDER_COLORS.move,0xbccb91,'pale olive replaced');
});

test('placement estimate marks exactly the conflicting cells',()=>{
 const width=12,height=12,tiles=Array.from({length:144},()=>({terrain:'open'}));tiles[5*12+5]={terrain:'cliff'};
 const map={width,height,tiles,fields:[{id:1,position:{x:10500,y:10500},credits:1}]},visible=Array(144).fill(true);
 const clear=assessPlacement(map,{x:3000,y:3000},2,2,visible,[]);assert.equal(clear.anyBlocked,false);assert.equal(clear.cells.length,4);
 const rock=assessPlacement(map,{x:5000,y:5000},2,2,visible,[]);assert.deepEqual(rock.cells.filter(c=>c.blocked).map(c=>[c.x,c.y]),[[5500,5500]]);
 const occupied=assessPlacement(map,{x:3000,y:3000},2,2,visible,[{position:{x:2500,y:2500},footprintWidth:1,footprintHeight:1,health:1000}]);assert.deepEqual(occupied.cells.filter(c=>c.blocked).map(c=>[c.x,c.y]),[[2500,2500]]);
 const field=assessPlacement(map,{x:9000,y:9000},2,2,visible,[]);assert(field.cells.some(c=>c.blocked),'resource access margin');
 const fog=visible.slice();fog[2*12+2]=false;assert.equal(assessPlacement(map,{x:3000,y:3000},2,2,fog,[]).anyBlocked,true,'unseen ground cannot be confirmed');
 assert.equal(assessPlacement(map,{x:500,y:500},2,2,visible,[]).anyBlocked,true,'outside the map');
});

test('minimap shroud is far brighter than 4% and keeps a scan-line texture',()=>{
 assert.equal(minimapFogBrightness(0,3,4),1);assert.equal(minimapFogBrightness(1,3,4),.55);
 const shroud=[0,1,2,3].map(x=>minimapFogBrightness(2,x,0));assert.deepEqual(shroud,[.28,.36,.36,.36]);assert(Math.max(...shroud)<minimapFogBrightness(1,0,0));assert(new Set(shroud).size===2);
});

test('camera starts larger on tall battlefields within sane limits; apron fades outward',()=>{
 assert.equal(initialZoom(720),1);assert.equal(initialZoom(900),1);assert(Math.abs(initialZoom(1080)-1.2)<1e-9);assert.equal(initialZoom(2160),1.25);assert.equal(initialZoom(Number.NaN),1);
 assert(ZOOM_MIN<1&&ZOOM_MAX>1.25);
 const bands=apronBands();for(let i=1;i<bands.length;i++){assert(bands[i][0]<bands[i-1][0]);assert(bands[i][1]>=bands[i-1][1])}
});

test('selection and health marks use relation tokens and readable sizes',()=>{
 assert.equal(new Set([RELATION_MARK.self,RELATION_MARK.ally,RELATION_MARK.enemy,RELATION_MARK.neutral]).size,4);
 assert.deepEqual(healthBarSize(false),{width:36,height:5});assert.deepEqual(healthBarSize(true),{width:64,height:6});
 assert.equal(healthBarZoomScale(1),1);assert(Math.abs(healthBarZoomScale(.45)-.7525)<1e-9);assert.equal(healthBarZoomScale(.2),.75);assert(healthBarZoomScale(1.8)<=1.15);
 assert.equal(healthFill(1000),HEALTH_FILL.high);assert.equal(healthFill(500),HEALTH_FILL.mid);assert.equal(healthFill(200),HEALTH_FILL.low);
});

test('two players of one faction get clearly different team colours in every slot pairing',()=>{
 for(const scheme of ['standard','cvd_safe'] as const){
  const colours=Array.from({length:8},(_,i)=>ownerTeamColor(i+1,Array.from({length:8},(_,j)=>({id:j+1,faction:'US',color:j+1})),scheme).tint);
  for(let a=0;a<8;a++)for(let b=a+1;b<8;b++){
   const d=Math.hypot(...[16,8,0].map(s=>((colours[a]>>s)&255)-((colours[b]>>s)&255)));
   assert(d>50,`${scheme} slots ${a+1}/${b+1} too close (${d.toFixed(0)})`);
  }
 }
});
