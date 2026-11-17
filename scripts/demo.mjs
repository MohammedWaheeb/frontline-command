import {constants} from 'node:fs';
import {access,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import path from 'node:path';
import {fileDigest,fileInventory,portablePath,verifyNativeExecutable} from './package-integrity.mjs';

export const demoOrigin='http://127.0.0.1:8080';

// Mutable host data is deliberately excluded before walking: saves, SQLite
// journals and temporary object files are not part of the release inventory.
export async function verifyDemoPackage(packageDir,{platform=process.platform,arch=process.arch}={}){
 const version=JSON.parse(await readFile(path.join(packageDir,'version.json'),'utf8'));
 if(version.platform!==platform||version.arch!==arch)throw Error(`Demo package is for ${version.platform}/${version.arch}; this computer needs ${platform}/${arch}.`);
 const manifest=JSON.parse(await readFile(path.join(packageDir,'package-files.json'),'utf8'));
 if(manifest.format_version!==1||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Invalid demo package inventory.');
 const expected=new Map();
 for(const entry of manifest.files){
  const name=portablePath(entry.path),key=name.toLowerCase();
  if(expected.has(key)||name==='package-files.json'||key==='data'||key.startsWith('data/')||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error(`Invalid demo package entry: ${name}`);
  expected.set(key,entry);
 }
 const executable=platform==='win32'?'frontline.exe':'frontline';
 for(const name of [executable,'version.json','client/index.html','client/assets/packs/base.json','client/runtime/version.json'])if(!expected.has(name))throw Error(`Demo package inventory is missing ${name}.`);
 const actual=await fileInventory(packageDir,{excludeRoot:['data']});
 if(actual.length!==expected.size+1)throw Error('Demo package file inventory changed; restore the complete production package.');
 for(const entry of actual){
  if(entry.path==='package-files.json')continue;
  const recorded=expected.get(entry.path.toLowerCase());
  if(!recorded||recorded.path!==entry.path||recorded.bytes!==entry.bytes)throw Error(`Demo package file changed: ${entry.path}`);
  const digest=await fileDigest(path.join(packageDir,entry.path));
  if(digest.sha256!==recorded.sha256)throw Error(`Demo package checksum failed: ${entry.path}`);
 }
 await verifyNativeExecutable(path.join(packageDir,executable),platform,arch);
 await access(path.join(packageDir,executable),constants.X_OK);
 const pack=await readFile(path.join(packageDir,'client/assets/packs/base.json'));
 const runtime=JSON.parse(await readFile(path.join(packageDir,'client/runtime/version.json'),'utf8'));
 for(const field of ['adapter','simulation','protocol','content_hash'])if(version[field]===undefined||version[field]!==runtime[field]||version[field]!==version.product_pack?.runtime?.[field])throw Error(`Demo runtime identity differs: ${field}`);
 const packIdentity=JSON.parse(pack);
 if(packIdentity.id!==version.product_pack?.id||packIdentity.version!==version.product_pack?.version||(await fileDigest(path.join(packageDir,'client/assets/packs/base.json'))).sha256!==version.product_pack?.packSHA256)throw Error('Demo offline pack identity differs from its production build.');
 return {version,executable,index:await readFile(path.join(packageDir,'client/index.html')),pack};
}

async function responseBytes(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(2000),redirect:'error',cache:'no-store'});
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 return Buffer.from(await response.arrayBuffer());
}

export async function matchesDemo(origin,verified){
 try{
  const health=JSON.parse(await responseBytes(`${origin}/api/v1/health`));
  if(health.status!=='ok'||health.load_profile!==''||health.local!==true||health.tick_rate!==20||health.state_updates_hz!==10)return false;
  for(const field of ['simulation','protocol','content_hash'])if(health[field]!==verified.version[field])return false;
  const [index,pack]=await Promise.all([responseBytes(`${origin}/`),responseBytes(`${origin}/assets/packs/base.json`)]);
  return index.equals(verified.index)&&pack.equals(verified.pack);
 }catch{return false}
}

function portOccupied(){return new Promise(resolve=>{
 const socket=createConnection({host:'127.0.0.1',port:8080});
 const finish=value=>{socket.destroy();resolve(value)};
 socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(true));
})}

async function openGame(){
 const program=process.platform==='darwin'?'open':process.platform==='win32'?'rundll32':'xdg-open';
 const args=process.platform==='win32'?['url.dll,FileProtocolHandler',demoOrigin]:[demoOrigin];
 await new Promise(resolve=>{
  const opener=spawn(program,args,{stdio:'ignore'});
  opener.once('error',resolve);opener.once('exit',resolve);
 });
}

export async function runDemo({packageDir,openBrowser=true}){
 console.log('Verifying the production demo package (including all assets)…');
 let verified;
 try{verified=await verifyDemoPackage(packageDir)}catch(error){throw Error(`${error.message}\nPackage: ${packageDir}\nRestore the complete optimized demo package, or run make build intentionally before retrying.`)}
 if(await portOccupied()){
  if(!await matchesDemo(demoOrigin,verified))throw Error(`Port 8080 is occupied by another build or service. Stop it in its own terminal, then run make demo again. Demo data and browser saves use ${demoOrigin}.`);
  console.log(`The verified demo is already running: ${demoOrigin}\nIts original terminal owns the server; this command leaves it running.`);
  if(openBrowser)await openGame();
  return;
 }
 const data=path.join(packageDir,'data');
 const child=spawn(path.join(packageDir,verified.executable),['-addr','127.0.0.1:8080','-data',data,'-static',path.join(packageDir,'client'),'-maps',path.join(packageDir,'content/maps'),'-missions',path.join(packageDir,'content/missions')],{cwd:packageDir,stdio:'inherit'});
 let ended=false,stopping=false;
 const exited=new Promise(resolve=>{
  child.once('error',error=>{ended=true;resolve({error})});
  child.once('exit',(code,signal)=>{ended=true;resolve({code,signal})});
 });
 const stop=()=>{if(!stopping&&!ended){stopping=true;child.kill('SIGTERM')}};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 try{
  const deadline=Date.now()+15000;
  let ready=false;
  while(!ended&&!stopping&&Date.now()<deadline){
   if(await matchesDemo(demoOrigin,verified)){
    // A bind/data-lock failure can race a response from another process.
    await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,150))]);
    if(!ended&&!stopping){ready=true;break}
   }
   await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,150))]);
  }
  if(!ready&&!stopping){
   if(ended){const result=await exited;throw result.error??Error(`Demo host exited before becoming ready (${result.code??result.signal}).`)}
   throw Error(`Demo host did not become healthy at ${demoOrigin} within 15 seconds.`);
  }
  if(ready){
   console.log(`\nFrontline Command demo: ${demoOrigin}\nProduction build verified. Persistent host data: ${data}\nKeep this terminal open. Press Ctrl-C here to stop the server.`);
   if(openBrowser)await openGame();
  }
  const result=await exited;
  if(result.error)throw result.error;
  if(!stopping)throw Error(`Demo host stopped unexpectedly (${result.code??result.signal}). Run make demo to restart.`);
 }finally{
  stop();await exited;
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 }
}
