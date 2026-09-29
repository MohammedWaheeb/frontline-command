import assert from 'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';import path from'node:path';
const out=path.resolve('work/presentation-renderer-integration-v1/checks-01'),input=JSON.parse(await readFile(path.join(out,'inputs.json'))),sha=b=>createHash('sha256').update(b).digest('hex'),r={status:'running',commands:[],started:new Date().toISOString()};
try{for(const script of ['typecheck:app','typecheck','test:runtime']){const p=spawnSync('npm',['run',script],{cwd:path.join(input.source,'client'),encoding:'utf8',maxBuffer:16*1024*1024});const log=(p.stdout??'')+(p.stderr??'');await writeFile(path.join(out,script.replace(':','-')+'.log'),log);r.commands.push({script,exit:p.status,error:p.error?String(p.error):undefined});assert.equal(p.status,0,script)}
for(const[p,h]of Object.entries(input.after))assert.equal(sha(await readFile(path.join(input.source,p))),h,'Candidate changed '+p);
for(const[p,h]of Object.entries(input.pins))assert.equal(sha(await readFile(p)),h,'Live input changed '+p);
r.status='passed';r.exactCandidateAndLiveInputs=true;
}catch(e){r.status='failed';r.failure=String(e.stack??e);process.exitCode=1}finally{r.finished=new Date().toISOString();await writeFile(path.join(out,'result.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r))}
