import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),sha=b=>createHash('sha256').update(b).digest('hex');
assert(process.env.FRONTLINE_BODY_BUILD,'Choose a new isolated output');const out=path.resolve(process.env.FRONTLINE_BODY_BUILD),source=path.join(root,'work/runtime-034-integrated-source/source'),lock=await readFile(path.join(source,'../source-lock.json')),parsed=JSON.parse(lock);
for(const [file,hash]of Object.entries(parsed.files))assert.equal(sha(await readFile(path.join(source,file))),hash,`Frozen source changed ${file}`);
await mkdir(out);for(const file of ['native-body-host.go','native-body-host_test.go'])await copyFile(path.join(root,'client/tests/render',file),path.join(out,file));
await writeFile(path.join(out,'go.mod'),`module frontlinecommand/diagnostic-body\n\ngo 1.27.1\nrequire frontlinecommand v0.0.0\nreplace frontlinecommand => ${JSON.stringify(source)}\n`);
execFileSync('go',['test','-c','-p=1','-mod=mod','-o',path.join(out,'diagnostic-host.test')],{cwd:out,env:{...process.env,GOMAXPROCS:'1',GOWORK:'off'},stdio:'inherit'});
const test=execFileSync(path.join(out,'diagnostic-host.test'),['-test.v'],{cwd:out,env:{...process.env,GOMAXPROCS:'1'},encoding:'utf8'});await writeFile(path.join(out,'unit-tests.log'),test);
const files={};for(const f of ['native-body-host.go','native-body-host_test.go','go.mod','go.sum','diagnostic-host.test','unit-tests.log']){const b=await readFile(path.join(out,f));files[f]={sha256:sha(b),bytes:b.length}}
await writeFile(path.join(out,'build.json'),JSON.stringify({scope:'Diagnostic host only, exact frozen production Server plus advice writer observation and explicit standalone negative controls; no host or browser launched by build.',sourceLockSHA256:sha(lock),files,status:'built-and-unit-tested',go:execFileSync('go',['version'],{encoding:'utf8'}).trim()},null,2)+'\n');console.log(test);
