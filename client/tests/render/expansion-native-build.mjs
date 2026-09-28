import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),candidate=path.join(root,'work/navigation-lookup-candidate');
assert(process.env.FRONTLINE_EXPANSION_BUILD,'Choose a new, isolated test build directory.');const output=path.resolve(process.env.FRONTLINE_EXPANSION_BUILD);
try{await access(output);throw Error('Refusing to replace existing preflight build')}catch(error){if(error.code!=='ENOENT')throw error}
const sha=b=>createHash('sha256').update(b).digest('hex'),lockBytes=await readFile(path.join(candidate,'source-lock.json')),lock=JSON.parse(lockBytes),expected='c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122';assert.equal(sha(lockBytes),expected);
for(const [file,hash] of Object.entries(lock.files))assert.equal(sha(await readFile(path.join(candidate,'source',file))),hash,file);
await mkdir(output,{recursive:true});const copied={};
for(const file of ['session.go','editor.go','replay.go']){const data=await readFile(path.join(candidate,'source/cmd/wasm',file));await writeFile(path.join(output,file),data);copied[file]=sha(data)}
await copyFile(new URL('expansion-native-bridge.go',import.meta.url),path.join(output,'main.go'));
await writeFile(path.join(output,'go.mod'),`module frontlinecommand/expansion-preflight\n\ngo 1.27.1\n\nrequire frontlinecommand v0.0.0\nreplace frontlinecommand => ${JSON.stringify(path.join(candidate,'source'))}\n`);
execFileSync('go',['build','-mod=mod','-o','bridge','.'],{cwd:output,env:{...process.env,GOMAXPROCS:'2'},stdio:'inherit'});
const receipt={sourceLockSHA256:expected,compiledAt:new Date().toISOString(),copied,bridgeSHA256:sha(await readFile(path.join(output,'main.go'))),binarySHA256:sha(await readFile(path.join(output,'bridge'))),scope:'Frozen authoritative Session and Go engine with JSON-lines test transport only; no browser or runtime promotion.'};
await writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({output,...receipt},null,2));
