import test from 'node:test';
import assert from 'node:assert/strict';
import {HaulerIncomeWindow,incomeWindowLabel} from '../../src/app/hauler-income-window';
test('income reports starting up during the first window and an observed rate after one minute',()=>{
 const window=new HaulerIncomeWindow();assert.equal(window.observe('a',1,0,0n),undefined);
 const early=window.observe('a',1,600,300000n);assert.match(incomeWindowLabel(early),/starting up/);assert.doesNotMatch(incomeWindowLabel(early),/observed over/);
 const full=window.observe('a',1,1200,1200500n);assert.equal(full?.coverage,'full');assert.equal(incomeWindowLabel(full),'1,200.5 credits/min · observed income');
 assert.equal(window.observe('a',1,1200,1200500n),full);
});
test('non-divisor cadence retains a real boundary sample and yields a rate without invented income',()=>{
 const window=new HaulerIncomeWindow();for(let tick=0;tick<=1218;tick+=58)window.observe('a',1,tick,BigInt(tick)*1000n);
 assert.deepEqual(window.current,{amount:1218000n,fromTick:0,toTick:1218,windowTicks:1218,coverage:'full'});
 assert.equal(incomeWindowLabel(window.current),'1,200 credits/min · observed income');
 window.observe('a',1,1276,1276000n);assert.equal(window.current?.fromTick,58);assert.equal(window.current?.windowTicks,1218);
});
test('perspective, session, rewind, counter reset and hidden income invalidate history',()=>{
 const window=new HaulerIncomeWindow();window.observe('a',1,0,0n);window.observe('a',1,1200,1200000n);
 assert.equal(window.observe('b',1,1201,1200000n),undefined);
 assert.equal(window.observe('b',2,1202,1200000n),undefined);
 assert.equal(window.observe('b',2,1201,1200000n),undefined);
 assert.equal(window.observe('b',2,1202,0n),undefined);
 window.observe('b',2,2402,1000000n);assert.equal(window.current?.coverage,'full');
 assert.equal(window.observe('b',2,2403,undefined),undefined);assert.equal(window.current,undefined);
 window.observe('b',2,3000,1000000n);window.reset();assert.equal(window.current,undefined);
});
