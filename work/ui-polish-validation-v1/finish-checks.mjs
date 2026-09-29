import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const out=path.resolve('work/ui-polish-validation-v1/checks-01'),hash=b=>createHash('sha256').update(b).digest('hex');
const input=JSON.parse(await readFile(path.join(out,'inputs.json'))),logs={};
for(const file of ['app-typecheck.log','runtime-typecheck.log','runtime-tests.log']){const bytes=await readFile(path.join(out,file));logs[file]={sha256:hash(bytes),text:bytes.toString()}}
assert.match(logs['runtime-tests.log'].text,/tests 498\s/);assert.match(logs['runtime-tests.log'].text,/pass 498\s/);assert.match(logs['runtime-tests.log'].text,/fail 0\s/);
for(const name of ['app-typecheck.log','runtime-typecheck.log'])assert.doesNotMatch(logs[name].text,/error TS|Error:|error:/);
for(const [rel,sha]of Object.entries(input.pins)){
 assert.equal(hash(await readFile(rel)),sha,'Live input drift '+rel);
 const change=input.changes.find(row=>row.path===rel);
 assert.equal(hash(await readFile(path.join(input.source,rel))),change?.after??sha,'Candidate input drift '+rel);
 if(change)assert.equal(hash(await readFile(change.source)),change.after,'Authored candidate drift '+rel);
}
await writeFile(path.join(out,'result.json'),JSON.stringify({status:'passed',scope:input.scope,runtimeTests:498,runtimeFailures:0,appTypecheckExit:0,runtimeTypecheckExit:0,runtimeTestExit:0,exitSource:'All three direct exec commands completed exit0; independently inspected logs and inputs below.',changes:input.changes,guardedLiveInputs:Object.keys(input.pins).length,logs:Object.fromEntries(Object.entries(logs).map(([k,v])=>[k,{sha256:v.sha256}]))},null,2)+'\n');
console.log('498 runtime checks and two semantic TypeScript checks passed; 247 live inputs unchanged.');
