import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {build} from 'esbuild';

// The real Go bridge creates a new JS Uint8Array for each binary result
// (cmd/wasm/main.go). Model that boundary and use actual structuredClone
// transfer semantics: detachment is observable, not a stubbed assertion.
const source=build({entryPoints:[path.resolve('src/runtime/worker.ts')],bundle:true,platform:'neutral',format:'cjs',write:false,logLevel:'silent'}).then(result=>result.outputFiles[0].text);
async function harness(){
 let receive!:(event:{data:unknown})=>void;const replies:Array<{message:any;transfers:number}>=[],owned:Uint8Array[]=[],expected=new Uint8Array([1,2,128,255]);
 const fresh=()=>{const bytes=expected.slice();owned.push(bytes);return bytes};
 const go:Record<string,()=>{ok:boolean;json?:string;bytes?:Uint8Array}>={save:()=>({ok:true,json:JSON.stringify({tick:16000,local_players:[1]}),bytes:fresh()}),exportReplay:()=>({ok:true,bytes:fresh()}),info:()=>({ok:true,json:JSON.stringify({tick:16000,local_players:[1]})})};
 vm.runInNewContext(await source,{self:{__frontlineGo:go,addEventListener:(_type:string,listener:typeof receive)=>{receive=listener},postMessage:(message:any,transfer:Transferable[]=[])=>replies.push({message:structuredClone(message,{transfer}),transfers:transfer.length})},performance:{now:()=>0},Uint8Array,ArrayBuffer,JSON,Math,Number,Promise,Error,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},console});
 const send=async(method:string)=>{const id=replies.length+1;receive({data:{id,method,args:[]}});await new Promise(resolve=>setImmediate(resolve));return replies.find(reply=>reply.message.id===id)!};
 return {send,owned,expected,go};
}

test('Go-owned save and replay replies transfer exact bytes and metadata without retaining a second payload',async()=>{
 const h=await harness(),save=await h.send('save');assert.equal(save.message.ok,true);assert.deepEqual(save.message.result.data,h.expected);assert.equal(save.message.result.tick,16000);assert.deepEqual(save.message.result.local_players,[1]);assert.equal(save.transfers,1);assert.equal(h.owned[0].byteLength,0,'the sender relinquishes its independent reply buffer');
 const replay=await h.send('exportReplay');assert.deepEqual(replay.message.result,h.expected);assert.equal(replay.transfers,1);assert.equal(h.owned[1].byteLength,0);
 // A later result owns different storage. Transfer/mutation of one reply must
 // never detach another result or mutate the Go bridge's next payload.
 save.message.result.data[0]=99;const next=await h.send('save');assert.deepEqual(next.message.result.data,h.expected);assert.deepEqual(replay.message.result,h.expected);assert.equal(next.transfers,1);
});

test('metadata-only replies are unchanged and sliced/shared binary views are not detached',async()=>{
 const h=await harness(),info=await h.send('info');assert.equal(info.transfers,0);assert.deepEqual(info.message.result,{tick:16000,local_players:[1]});
 const backing=new Uint8Array([9,1,2,128,255,9]);h.go.exportReplay=()=>({ok:true,bytes:backing.subarray(1,5)});const sliced=await h.send('exportReplay');assert.equal(sliced.transfers,0);assert.equal(backing.byteLength,6);assert.deepEqual(sliced.message.result,h.expected);
 const shared=new Uint8Array(new SharedArrayBuffer(4));shared.set(h.expected);h.go.exportReplay=()=>({ok:true,bytes:shared});const sharedReply=await h.send('exportReplay');assert.equal(sharedReply.transfers,0);assert.equal(shared.byteLength,4);assert.deepEqual(sharedReply.message.result,h.expected);
});
