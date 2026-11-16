import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {build} from 'esbuild';

// Regression gate for the 2026-11-08 skirmish freeze (work/perf-freeze-2026-11-08).
// The real worker.ts is bundled and run against a fake clock and a stub Go
// bridge whose `step` costs a chosen number of milliseconds. Before the fix the
// worker ran up to five heavy ticks back-to-back in one task and never reported
// its pace, so orders queued behind the burst and the HUD showed nothing.

const source=build({entryPoints:[path.resolve(process.env.FRONTLINE_WORKER_SOURCE??'src/runtime/worker.ts')],bundle:true,platform:'neutral',format:'cjs',write:false,logLevel:'silent'}).then(r=>r.outputFiles[0].text);

interface Harness{
 tick():void;advance(ms:number):void;messages:any[];warnings:string[];steps:number[];perTask:number[];
}
async function harness(stepCost:number|((tick:number)=>number)):Promise<Harness>{
 let now=0,tick=0,timer:(()=>void)|undefined,onMessage:((event:{data:unknown})=>void)|undefined,inTask=0;
 const messages:any[]=[],warnings:string[]=[],steps:number[]=[],perTask:number[]=[];
 const info=()=>JSON.stringify({tick,local_players:[1],finished:false});
 const scope={
  __frontlineGo:{
   create:()=>({ok:true,json:info()}),
   step:(n:number)=>{steps.push(n);tick+=n;inTask++;now+=typeof stepCost==='number'?stepCost:stepCost(tick);return {ok:true,json:info()}},
   priority:()=>({ok:true}),
   view:()=>({ok:true,bytes:new Uint8Array(8)}),
  },
  addEventListener:(_:string,fn:(event:{data:unknown})=>void)=>{onMessage=fn},
  postMessage:(message:unknown)=>{messages.push(message)},
 };
 vm.runInNewContext(await source,{
  self:scope,performance:{now:()=>now},Uint8Array,ArrayBuffer,JSON,Math,Number,Promise,Error,
  console:{warn:(text:string)=>warnings.push(text),log(){},error(){}},
  setInterval:(fn:()=>void)=>{timer=fn;return 1},clearInterval(){},setTimeout,clearTimeout,
 });
 const send=async(id:number,method:string,args:unknown[]=[])=>{onMessage!({data:{id,method,args}});for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r))};
 await send(1,'create',[{seed:1}]);
 await send(2,'resume');
 return {
  messages,warnings,steps,perTask,
  advance(ms){now+=ms},
  tick(){inTask=0;timer!();perTask.push(inTask)},
 };
}
const drive=(h:Harness,ms:number,cadence=10)=>{const end=ms/cadence;for(let i=0;i<end;i++){h.advance(cadence);h.tick()}};

test('a heavy tick never shares a worker task with another tick, so orders are handled between slow ticks',async()=>{
 // A 200 ms spike every tenth tick builds debt; the pre-fix worker repaid it
 // as a back-to-back burst of 40 ms ticks (the freeze shape).
 const h=await harness(tick=>tick%10===0?200:40);
 drive(h,3000);
 assert.ok(h.steps.length>20,`the match must keep advancing, ran ${h.steps.length} ticks`);
 assert.ok(Math.max(...h.perTask)<=1,`a 40 ms tick must yield before the next one; a task ran ${Math.max(...h.perTask)} ticks`);
});

test('cheap ticks still catch up within the task budget, and the worker never jumps ticks',async()=>{
 const h=await harness(1);
 h.advance(250);h.tick();
 assert.equal(h.perTask.at(-1),5,'250 ms of debt at 1 ms per tick runs all five due ticks in one task');
 drive(h,2000);
 assert.ok(h.steps.every(n=>n===1),'ticks are stepped one at a time');
 assert.ok(Math.max(...h.perTask)<=9,'a task stops once about 8 ms have passed');
});

test('an overloaded match reports a slowed pace instead of freezing silently',async()=>{
 const h=await harness(90);
 drive(h,4000);
 const pace=h.messages.filter(m=>m?.event==='pace');
 assert.ok(pace.length>=2,'the worker reports its pace about once per second');
 const last=pace.at(-1);
 assert.ok(last.rate>0.35&&last.rate<0.65,`90 ms ticks run about half speed, reported ${last.rate}`);
 assert.ok(last.maxTickMs>=90&&last.tickMs>=90);
 assert.ok(h.messages.filter(m=>m?.event==='frame').length>=pace.length,'every slowed task still publishes a frame');
});

test('a tick slower than 150 ms is logged with its tick number',async()=>{
 const h=await harness(tick=>tick===7?400:1);
 drive(h,1000);
 assert.equal(h.warnings.length,1);
 assert.match(h.warnings[0],/tick 7 took 400 ms/);
});

test('a real-time match reports full pace',async()=>{
 const h=await harness(1);
 drive(h,3000);
 const last=h.messages.filter(m=>m?.event==='pace').at(-1);
 assert.ok(last.rate>0.95,`expected full speed, got ${last.rate}`);
});
