import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
assert(process.argv[2],'Provide an exact earned replay path.');
const replay=path.resolve(process.argv[2]),candidate=path.join(root,'work/navigation-lookup-candidate');
const out=path.join(root,'work/multiplayer-combat',`recovery-proof-${new Date().toISOString().replaceAll(':','-')}`);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lockBytes=await readFile(path.join(candidate,'source-lock.json')),lock=JSON.parse(lockBytes);
assert.equal(sha(lockBytes),'c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122');
for(const [file,hash] of Object.entries(lock.files))assert.equal(sha(await readFile(path.join(candidate,'source',file))),hash,file);
await mkdir(out,{recursive:false});
const source=await readFile(new URL('expansion-recovery-native.go',import.meta.url));
await writeFile(path.join(out,'main.go'),source);
await writeFile(path.join(out,'go.mod'),`module frontlinecommand/expansion-recovery-proof\n\ngo 1.27.1\n\nrequire frontlinecommand v0.0.0\nreplace frontlinecommand => ${JSON.stringify(path.join(candidate,'source'))}\n`);
await copyFile(new URL('expansion-recovery-native.mjs',import.meta.url),path.join(out,'runner.mjs'));
const receipt={sourceLockSHA256:sha(lockBytes),sourceSHA256:sha(source),sourceReplay:replay,sourceReplaySHA256:sha(await readFile(replay)),startedAt:new Date().toISOString(),GOMAXPROCS:1,scope:'Offline narrow ordinary cancel/refund/emergency-rig branch from an unchanged earned replay. No state mutations, browser, host or full-match outcome claim.'};
async function run(command,args,log){
 const file=createWriteStream(path.join(out,log));
 return await new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd:out,env:{...process.env,GOMAXPROCS:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>{file.write(chunk);process.stdout.write(chunk)});child.stderr.on('data',chunk=>{file.write(chunk);process.stderr.write(chunk)});
  child.on('error',reject);child.on('exit',code=>file.end(()=>resolve(code)));
 });
}
console.log(JSON.stringify({out,...receipt}));
try{
 assert.equal(await run('go',['build','-mod=mod','-o','recovery-proof','.'],'build.log'),0,'proof build');
 receipt.binarySHA256=sha(await readFile(path.join(out,'recovery-proof')));
 receipt.existingRigAllowed=process.argv.includes('--allow-existing-rig');
 receipt.exitCode=await run(path.join(out,'recovery-proof'),['-replay',replay,'-out',path.join(out,'evidence'),...(receipt.existingRigAllowed?['-allow-existing-rig']:[])],'run.log');
 assert.equal(receipt.exitCode,0,'actual ordinary recovery proof');
}finally{
 receipt.closedAt=new Date().toISOString();await writeFile(path.join(out,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
}
