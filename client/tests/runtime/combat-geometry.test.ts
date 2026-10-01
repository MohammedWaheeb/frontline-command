import test from 'node:test';
import assert from 'node:assert/strict';
import {combatEffectVariant,visibleTrace,muzzleRotation,projectileRotation,effectFrameVisible} from '../../src/render/combat-geometry';

test('trace may not bridge a hidden pocket or extrapolate off the known map',()=>{
 const map={width:8,height:2},visible=Array(16).fill(true);
 assert.equal(visibleTrace({x:500,y:500},{x:7500,y:500},map,visible),true);
 visible[4]=false;assert.equal(visibleTrace({x:500,y:500},{x:7500,y:500},map,visible),false);
 assert.equal(visibleTrace({x:-1,y:1500},{x:1500,y:1500},map,visible),false);
 assert.equal(visibleTrace({x:500,y:1500},{x:8500,y:1500},map,visible),false);
 assert.equal(visibleTrace({x:500,y:1500},{x:500,y:1500},map,visible),true);
 const diagonal=Array(9).fill(true);diagonal[1]=false;
 assert.equal(visibleTrace({x:1,y:0},{x:2000,y:2000},{width:3,height:3},diagonal),false);
 assert.equal(visibleTrace({x:0,y:0},{x:2000,y:2000},{width:3,height:3},diagonal),false);
 assert.equal(visibleTrace({x:0,y:0},{x:Infinity,y:2000},{width:3,height:3},diagonal),false);
});
test('accessibility variants take priority over decorative quality',()=>{
 const settings={artQuality:'standard' as const,reducedMotion:false,reducedFlashing:false};
 assert.equal(combatEffectVariant(settings),'low');assert.equal(combatEffectVariant({...settings,artQuality:'high'}),'standard');
 assert.equal(combatEffectVariant({...settings,reducedMotion:true}),'reducedMotion');
 assert.equal(combatEffectVariant({...settings,reducedFlashing:true}),'reducedFlashing');
 assert.equal(combatEffectVariant({...settings,reducedMotion:true,reducedFlashing:true}),'reduced');
});

test('axial flash direction follows dimetric displayed headings, including independent turret directions',()=>{
 const degrees=(n:number)=>n*180/Math.PI;
 assert.ok(Math.abs(degrees(muzzleRotation(0,16)!)-26.565051177)<1e-8);
 assert.ok(Math.abs(degrees(muzzleRotation(4,16)!)-153.434948823)<1e-8);
 assert.equal(degrees(muzzleRotation(6,16)!),180);
 assert.ok(Math.abs(degrees(muzzleRotation(8,16)!)+153.434948823)<1e-8);
 assert.ok(Math.abs(degrees(muzzleRotation(12,16)!)+26.565051177)<1e-8);
 for(const [d,n] of [[0,1],[-1,16],[16,16],[NaN,16],[1.5,16],[1,2.5]])assert.equal(muzzleRotation(d,n),undefined);
});

test('projectile direction needs real successive movement and never a guessed first sample or target',()=>{
 const map={width:8,height:2},visible=Array(16).fill(true),a={tick:1,position:{x:500,y:500}},b={tick:2,position:{x:1500,y:500}},still={...b,tick:3};
 assert.equal(projectileRotation([],map,visible),undefined);
 assert.equal(projectileRotation([a],map,visible),undefined);
 assert.equal(projectileRotation([a,{...a,tick:2}],map,visible),undefined);
 assert.equal(projectileRotation([a,{...b,tick:1}],map,visible),undefined);
 assert.equal(projectileRotation([b,a],map,visible),undefined);
 assert.ok(Math.abs(projectileRotation([a,b],map,visible)!-Math.atan2(16,32))<1e-12);
 assert.equal(projectileRotation([a,b,still],map,visible),projectileRotation([a,b],map,visible));
 const hidden=[...visible];hidden[1]=false;
 assert.equal(projectileRotation([a,{tick:2,position:{x:2500,y:500}}],map,hidden),undefined);
 assert.equal(projectileRotation([a,{tick:2,position:{x:NaN,y:500}}],map,visible),undefined);
});

test('rotated frame bounds keep large offscreen-origin smoke and cull genuinely absent ink',()=>{
 const view={left:0,right:100,top:0,bottom:100};
 const tall={w:310,h:184,origin:[155,184]};
 assert.equal(effectFrameVisible(tall,1,{x:50,y:220},0,view),true,'Smoke reaches the viewport from120px below');
 assert.equal(effectFrameVisible(tall,1,{x:50,y:290},0,view),false);
 const shaft={w:80,h:8,origin:[0,4]};
 assert.equal(effectFrameVisible(shaft,1,{x:50,y:150},-Math.PI/2,view),true,'An upward axial body must use rotated bounds');
 assert.equal(effectFrameVisible(shaft,1,{x:50,y:150},0,view),false);
 assert.equal(effectFrameVisible(tall,.5,{x:50,y:220},0,view),false,'Metadata resolution is applied once');
});
