import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import path from 'node:path';import vm from 'node:vm';
import {hash} from './course.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),require=createRequire(path.join(root,'client/package.json'));
const {create,toBinary}=require('@bufbuild/protobuf'),{PlayerSnapshotSchema}=await import(pathToFileURL(path.join(root,'client/src/protocol/frontline_pb.ts')).href);
test('passive worker observer never sends calls and preserves original post arguments/termination',async()=>{
 class NativeWorker{constructor(){this.sent=[];this.listeners=new Map();this.terminated=0}addEventListener(name,fn){this.listeners.set(name,fn)}postMessage(...args){this.sent.push(args)}terminate(){this.terminated++}emit(data){this.listeners.get('message')({data})}}
 const window={Worker:NativeWorker},context=vm.createContext({window,performance:{now:()=>1},TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView});
 const lock=JSON.parse(await readFile(path.join(here,'prepare-03/worker-build.json'),'utf8')),bundle=await readFile(path.join(here,'prepare-03/worker-observer.js'),'utf8');assert.equal(hash(bundle),lock.bundleSHA256);assert.equal(hash(await readFile(path.join(here,'worker-observer.ts'))),lock.inputs.find(row=>row.file===path.join(here,'worker-observer.ts')).sha256);assert.equal(hash(await readFile(path.join(root,'client/src/protocol/frontline_pb.ts'))),lock.protocolSHA256);
 vm.runInContext(bundle,context);
 const worker=new window.Worker('/runtime/worker.js',{name:'Frontline Go simulation'});assert.equal(worker.sent.length,0);
 const request={id:1,method:'content',args:[]},transfer=[];worker.postMessage(request,transfer);assert.equal(worker.sent[0][0],request);assert.equal(worker.sent[0][1],transfer);worker.emit({id:1,ok:true,result:{buildings:[{id:'power',cost:700000}]}});
 worker.emit({event:'frame',bytes:toBinary(PlayerSnapshotSchema,create(PlayerSnapshotSchema,{tick:140,player:1}))});
 worker.postMessage({id:2,method:'save',args:[]});worker.emit({id:2,ok:true,result:{tick:140,hash:'actual-transport-unit',data:new TextEncoder().encode(JSON.stringify({entities:[{id:10,type:'power',owner:1,complete:true,paid:700000,position:{x:1,y:2}},{id:99,type:'power',owner:2,complete:true,paid:900000}]}))}});
 const data=window.__nativeBodyWorkerQA.read();assert.equal(data.saves.length,1);assert.equal(data.saves[0].ownedPower.length,1);assert.equal(data.saves[0].ownedPower[0].id,10);assert.equal(data.powerRule.cost,700000);assert.equal(data.errors.length,0);assert.equal(worker.sent.length,2,'Observer must not issue a save or another RPC');
 worker.terminate();assert.equal(worker.terminated,1);assert.equal(data.workers[0].live,false);
});
