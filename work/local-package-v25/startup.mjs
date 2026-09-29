// Native package launch proof. No browser, compiler, client changes or deployment.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fileDigest} from '../../scripts/package-integrity.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),label=process.argv[2];assert(/^startup-[0-9]+$/.test(label??''));
const out=path.join(here,label);await mkdir(out);const stage=path.join(here,'assembly-05/Frontline Command candidate');
const receipt={status:'running',scope:'Native macOS arm64 localhost launch and HTTP/static integrity only; not actual browser play, final release, Windows/Linux or physical LAN acceptance.',pathContainsSpaces:stage.includes(' '),cwd:'/private/tmp',PATH:'/usr/bin:/bin',requests:[]};
const sha=b=>createHash('sha256').update(b).digest('hex'),save=()=>writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await save();
let child,stdout='',stderr='',closed=false;let exitPromise;
try{
 const manifestBytes=await readFile(path.join(stage,'package-files.json'));receipt.packageManifestSHA256=sha(manifestBytes);const manifest=JSON.parse(manifestBytes);
 for(const file of manifest.files)assert.deepEqual(await fileDigest(path.join(stage,file.path)),{bytes:file.bytes,sha256:file.sha256},file.path);
 const guard=net.createServer();guard.listen(8080,'127.0.0.1');await once(guard,'listening');await new Promise((resolve,reject)=>guard.close(error=>error?reject(error):resolve()));
 child=spawn('/bin/sh',[path.join(stage,'Play.command')],{cwd:receipt.cwd,env:{...process.env,PATH:receipt.PATH},stdio:['ignore','pipe','pipe']});receipt.pid=child.pid;
 exitPromise=once(child,'exit').then(([code,signal])=>{closed=true;return {code,signal}});child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 let health;for(let i=0;i<60;i++){if(closed)throw Error('Native launcher exited before health');try{const response=await fetch('http://127.0.0.1:8080/api/v1/health',{signal:AbortSignal.timeout(1000)});if(response.ok){health=await response.json();break}}catch{}await new Promise(resolve=>setTimeout(resolve,250))}
 assert(health,'Native host did not become healthy');assert.equal(health.status,'ok');assert.equal(health.local,true);assert.equal(health.tick_rate,20);
 const runtime=JSON.parse(await readFile(path.join(stage,'client/runtime/version.json')));for(const k of ['simulation','protocol','content_hash'])assert.equal(health[k],runtime[k],k);receipt.health=health;
 const pack=JSON.parse(await readFile(path.join(stage,'client/assets/packs/base.json'))),png=pack.files.find(f=>f.path.startsWith('/art/')&&f.path.endsWith('.png')).path;
 for(const url of ['/','/service-worker.js','/runtime/worker.js','/runtime/frontline.wasm','/runtime/version.json','/content/index.json','/art/index.json','/assets/packs/base.json',png]){
  const response=await fetch('http://127.0.0.1:8080'+url,{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200,url);const bytes=Buffer.from(await response.arrayBuffer()),expected=await readFile(path.join(stage,'client',url==='/'?'index.html':url.slice(1)));assert.equal(sha(bytes),sha(expected),url);
  const mime=response.headers.get('content-type')??'';if(url.endsWith('.wasm'))assert.match(mime,/application\/wasm/);else if(url.endsWith('.js'))assert.match(mime,/(?:application|text)\/javascript/);else if(url.endsWith('.json'))assert.match(mime,/application\/json/);else if(url.endsWith('.png'))assert.match(mime,/image\/png/);else assert.match(mime,/text\/html/);
  receipt.requests.push({path:url,status:response.status,mime,bytes:bytes.length,sha256:sha(bytes)});
 }
 for(const url of ['/api/v1/content','/api/v1/maps','/api/v1/missions']){const response=await fetch('http://127.0.0.1:8080'+url);assert.equal(response.status,200,url);const json=await response.json();receipt.requests.push({path:url,status:response.status,jsonType:Array.isArray(json)?'array':typeof json,bytes:JSON.stringify(json).length})}
 // Credentials remain only in memory. Exercise package-local database writes
 // without emitting private sign-in material into the evidence files.
 const profileResponse=await fetch('http://127.0.0.1:8080/api/v1/profiles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Package Rehearsal'})});assert.equal(profileResponse.status,201);const profile=await profileResponse.json();assert(profile.token);const meResponse=await fetch('http://127.0.0.1:8080/api/v1/profiles/me',{headers:{Authorization:'Bearer '+profile.token}});assert.equal(meResponse.status,200);const me=await meResponse.json();assert.equal(me.id,profile.profile.id);receipt.profileCreatedAndAuthenticated=true;
 for(const file of manifest.files)assert.deepEqual(await fileDigest(path.join(stage,file.path)),{bytes:file.bytes,sha256:file.sha256},file.path);
 receipt.originalPackageFilesUnchanged=true;receipt.status='passed';
}catch(error){receipt.status='failed';receipt.failure=String(error.stack??error);process.exitCode=1}
finally{
 if(child&&!closed){child.kill('SIGTERM');await Promise.race([exitPromise,new Promise(resolve=>setTimeout(resolve,5000))]);if(!closed){child.kill('SIGKILL');await exitPromise}}
 if(exitPromise)receipt.hostExit=await exitPromise;receipt.hostClosed=closed;
 await writeFile(path.join(out,'stdout.log'),stdout);await writeFile(path.join(out,'stderr.log'),stderr);receipt.driverSHA256=sha(await readFile(fileURLToPath(import.meta.url)));await save();console.log(JSON.stringify({status:receipt.status,hostClosed:receipt.hostClosed,failure:receipt.failure}));
}
