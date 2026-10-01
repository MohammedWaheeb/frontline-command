import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installReplayObservation} from './multiplayer-current-loader-replay-observation.mjs';
test('readonly submit accounting forwards identity, transfer list, return and exceptions',()=>{
 const calls=[];class Worker{constructor(url,options){this.url=url;this.options=options}postMessage(...args){calls.push({self:this,args});if(args[0].throws)throw Error('original failure');return 42}}
 const window={Worker},context=vm.createContext({window});vm.runInContext(`(${installReplayObservation.toString()})()`,context);
 const worker=new window.Worker('/runtime/worker.js',{name:'Frontline Go simulation'}),payload={id:1,method:'submit',args:[{private:'not inspected'}]},transfer=[new ArrayBuffer(4)];
 assert.equal(worker.postMessage(payload,transfer),42);assert.equal(calls[0].self,worker);assert.equal(calls[0].args[0],payload);assert.equal(calls[0].args[1],transfer);assert.equal(window.currentReplayObservation().submit,1);
 assert.throws(()=>worker.postMessage({method:'submit',throws:true}),/original failure/);assert.equal(window.currentReplayObservation().submit,2);
 new window.Worker('decoder',{name:'other'}).postMessage({method:'submit'});assert.equal(window.currentReplayObservation().submit,2);
 const copy=window.currentReplayObservation();copy.submit=0;assert.equal(window.currentReplayObservation().submit,2);
});
