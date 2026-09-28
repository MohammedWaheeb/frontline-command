import test from 'node:test';
import assert from 'node:assert/strict';
import {combatEffectVariant,visibleTrace} from '../../src/render/combat-geometry';

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
