import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AudioDirector} from '../../src/audio/director';
import {CatalogIndex} from '../../src/content/catalog';
const rules=JSON.parse(readFileSync('../pkg/content/rules.json','utf8'));
const orders=readFileSync('../pkg/sim/orders.go','utf8');
const catalog=new CatalogIndex(rules);
for(const kind of ['patrol','gather','salvage','return'])test(`accepted Go ${kind} receipt selects the existing unit response`,()=>{
 assert(orders.includes(`"${kind}": true`),'diagnostic must use a currently admitted Go order kind');
 const calls:string[]=[],mixer={play(id:string){calls.push(id)}} as any;
 const director=new AudioDirector(mixer,()=>catalog);
 for(const unit of rules.units.filter((unit:any)=>kind!=='return'||unit.armor==='air')){
  calls.length=0;director.receipt(kind,true,{type:unit.id,owner:1});
  assert.equal(calls.length,1);assert(calls[0].startsWith(`vo.unit.${unit.faction}.`),`${unit.id} has no faction voice response`);assert(calls[0].endsWith(kind==='return'?'.retreat':'.move'));
 }
});
test('rejected gather does not acknowledge successful movement',()=>{
 const calls:string[]=[],director=new AudioDirector({play(id:string){calls.push(id)}} as any,()=>catalog);
 director.receipt('gather',false,{type:rules.units[0].id,owner:1},'invalid_target');
 assert(calls.includes('sfx.ui_error'));assert(calls.some(id=>id.endsWith('.unavailable')));assert(!calls.some(id=>id.endsWith('.move')));
});
