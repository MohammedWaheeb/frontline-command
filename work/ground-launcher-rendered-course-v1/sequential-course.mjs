import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const [engine,scope,outArg]=process.argv.slice(2);assert(['chromium','firefox','webkit'].includes(engine));assert(['branches','main'].includes(scope));assert(outArg);
const out=path.resolve(outArg);await mkdir(out);const base='work/ground-launcher-rendered-course-v1',driver=path.join(base,'browser-v3.mjs');
const scenarios=scope==='branches'?['US.launcher-damaged-empty','IR.launcher-damaged-empty','SY.launcher-damaged-empty','IR.launcher-cancel-volley']:['US.launcher','IR.launcher','SY.launcher'];
const sha=b=>createHash('sha256').update(b).digest('hex'),report={scope:'Sequential immutable functional courses; raw diagnostic failure retained independently; stop on functional/page/console/HTTP/input/cleanup error.',engine,scenarios,started:new Date().toISOString(),driverSHA256:sha(await readFile(driver)),courses:[],status:'running'};
await writeFile(path.join(out,'sequential-course.mjs'),await readFile(new URL(import.meta.url)));
const save=()=>writeFile(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');await save();
try{for(const scenario of scenarios){
 const childOut=path.join(out,scenario),args=[driver,'--prepared',path.join(base,'prepared-02'),'--out',childOut,'--engine',engine,'--scenario',scenario];
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});let timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Bounded course exceeded 240 seconds'))},240000);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);resolve(code)})});
 const bytes=await readFile(path.join(childOut,'browser.json')),receipt=JSON.parse(bytes);report.courses.push({scenario,out:childOut,exitCode:code,receiptSHA256:sha(bytes),functional:receipt.functionalStatus,status:receipt.status,rawFailures:receipt.requestFailures.length,boundaries:receipt.boundaries.length,closedAt:receipt.closedAt});await save();
 assert.equal(receipt.functionalStatus,'passed');assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.httpErrors,[]);assert(receipt.inputsVerifiedAfter>0);assert(!receipt.cleanup?.failure);assert.equal(receipt.cleanup.canvases,0);assert.equal(receipt.workersAfter,0);assert.equal(receipt.cleanup.art.residentPages,0);assert.equal(sha(await readFile(driver)),report.driverSHA256);
 }
 report.functional='passed';report.status=report.courses.some(c=>c.status!=='passed')?'strict-failed':'passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error)}
finally{report.finished=new Date().toISOString();await save();console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1}
