import {spawn,execFileSync} from 'node:child_process';
import {access,chmod,copyFile,cp,mkdir,mkdtemp,readFile,readdir,rename,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),client=path.join(root,'client');
const npm=process.platform==='win32'?'npm.cmd':'npm';
const executable=process.platform==='win32'?'frontline.exe':'frontline';
const packageDir=path.join(root,'dist',`frontline-${process.platform}-${process.arch}`);
const command=process.argv[2];
// Use a locally installed Go generator without changing the user's shell setup.
try{const goPaths=execFileSync('go',['env','GOPATH'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(path.delimiter);process.env.PATH=[...goPaths.map(dir=>path.join(dir,'bin')),process.env.PATH??''].join(path.delimiter)}catch{}
function run(program,args,options={}){execFileSync(program,args,{cwd:root,stdio:'inherit',...options})}
function capture(program,args,options={}){return execFileSync(program,args,{cwd:root,encoding:'utf8',...options}).trim()}
async function exists(file){try{await access(file);return true}catch{return false}}
async function clientScript(name){const pkg=JSON.parse(await readFile(path.join(client,'package.json'),'utf8'));if(!pkg.scripts?.[name])throw new Error(`The Claude-authored product client does not yet provide npm run ${name}. This implementation is unfinished; runtime checks are available with make test.`)}
async function dependencies(){if(!await exists(path.join(client,'node_modules/.package-lock.json')))throw new Error('Install the pinned client dependencies with npm --prefix client ci.');}
async function doctor(){
 let missing=0;
 for(const [name,program,args,expected,help] of [
  ['Go','go',['version'],'go1.27.1','Install Go 1.27.1 from go.dev/dl.'],
  ['Node',process.execPath,['--version'],'v26.','Install Node.js 26.'],
  ['npm',npm,['--version'],'11.','Use the npm 11 toolchain shipped with Node.'],
  ['Protocol Buffers','protoc',['--version'],'36.2','Install protoc 36.2.'],
  ['Go protocol generator','protoc-gen-go',['--version'],'v1.36.12','Run go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12 and add the Go bin directory to PATH.'],
 ]){try{const version=capture(program,args);if(!version.includes(expected)){missing++;console.log(`MISMATCH ${name}: ${version}; expected ${expected}. ${help}`)}else console.log(`OK ${name}: ${version}`)}catch{missing++;console.log(`MISSING ${name}. ${help}`)}}
 if(await exists(path.join(client,'node_modules/.package-lock.json')))console.log('OK pinned npm dependencies installed');else{missing++;console.log('MISSING dependencies: npm --prefix client ci')}
 for(const dir of ['content/maps','content/missions','client/dist/index.html'])console.log(`${await exists(path.join(root,dir))?'PRESENT':'PENDING'} ${dir}`);
 console.log('Claude/Blender are content authoring tools only. Local play requires neither them nor an account, AI key, CDN or cloud database.');
 console.log('Browser verification uses the pinned Playwright CLI: node client/node_modules/playwright-core/cli.js install chromium firefox webkit');
 if(missing)process.exitCode=1;
}
async function buildServer(){await mkdir(path.join(root,'bin'),{recursive:true});run('go',['build','-trimpath','-o',path.join(root,'bin',executable),'./cmd/frontline'])}
async function dev(){
 await dependencies();await clientScript('dev');await buildServer();run(npm,['--prefix',client,'run','runtime:build']);
 const children=new Set(),groups=new Set();let stopping=false;
 // npm starts Vite as a descendant. Stop our whole process group, including
 // descendants whose npm parent exits first, without touching other dev servers.
 const stop=()=>{if(stopping)return;stopping=true;for(const pid of groups){try{if(process.platform==='win32')execFileSync('taskkill',['/pid',String(pid),'/T','/F'],{stdio:'ignore'});else process.kill(-pid,'SIGTERM')}catch(error){if(error.code!=='ESRCH'&&process.platform!=='win32')console.error(`Could not stop owned development process group ${pid}: ${error.message}`)}}};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const launch=(program,args)=>new Promise((resolve,reject)=>{const child=spawn(program,args,{cwd:root,stdio:'inherit',detached:process.platform!=='win32'});children.add(child);if(child.pid)groups.add(child.pid);child.once('error',error=>{stop();reject(error)});child.once('exit',(code,signal)=>{children.delete(child);stop();if(code&&code!==0)reject(new Error(`${program} exited ${code}`));else resolve(signal)})});
 console.log('Development API: http://127.0.0.1:8080; client: http://127.0.0.1:5173. Ctrl-C stops both.');
 const results=await Promise.allSettled([
  launch(path.join(root,'bin',executable),['-addr','127.0.0.1:8080','-data','.local','-maps','content/maps','-missions','content/missions','-static','client/dist','-dev-origins','http://127.0.0.1:5173']),
  launch(npm,['--prefix',client,'run','dev','--','--host','127.0.0.1','--port','5173','--strictPort']),
 ]);
 for(const result of results)if(result.status==='rejected')throw result.reason;
}
async function licenseFiles(moduleDir,out){
 const names=(await readdir(moduleDir)).filter(name=>/^(license|licence|copying|notice)(\.|$)/i.test(name));let count=0;
 for(const name of names){const from=path.join(moduleDir,name);if((await stat(from)).isFile()){await mkdir(out,{recursive:true});await copyFile(from,path.join(out,name));count++}}
 return count;
}
async function licenses(stage){
 const dest=path.join(stage,'licenses');await mkdir(dest,{recursive:true});const rows=['# Third-party notices','','These dependency licenses accompany the local package. UI/art attribution is','maintained by the Claude-authored asset manifest and credits.',''];
 const modules=capture('go',['list','-m','-json','all']).trim().split(/\n(?=\{)/).map(item=>JSON.parse(item));
 for(const item of modules){if(item.Main)continue;const info=item.Replace??item;if(!info.Dir)throw new Error(`Missing license source for ${item.Path}; run go mod download first.`);const label=`go/${item.Path.replaceAll('/','_')}@${item.Version}`;const count=await licenseFiles(info.Dir,path.join(dest,label));if(!count)throw new Error(`No license file found for Go dependency ${item.Path}`);rows.push(`- ${item.Path} ${item.Version}: [license files](${label}/)`)}
 const lock=JSON.parse(await readFile(path.join(client,'package-lock.json'),'utf8'));
 for(const [location,item] of Object.entries(lock.packages??{})){
  if(!location||item.dev)continue;const dir=path.join(client,location),pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));const label=`npm/${pkg.name.replaceAll('/','_')}@${pkg.version}`;
  const count=await licenseFiles(dir,path.join(dest,label));if(!count)throw new Error(`No license file found for npm runtime dependency ${pkg.name}`);rows.push(`- ${pkg.name} ${pkg.version} (${pkg.license??'see license'}): [license files](${label}/)`);
 }
 await writeFile(path.join(dest,'README.md'),rows.join('\n')+'\n');
}
async function checksums(stage){
 const entries=[];
 async function walk(dir){for(const name of (await readdir(dir)).sort()){const file=path.join(dir,name),info=await stat(file);if(info.isDirectory())await walk(file);else if(info.isFile()){const data=await readFile(file);entries.push({path:path.relative(stage,file).split(path.sep).join('/'),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')})}}}
 await walk(stage);await writeFile(path.join(stage,'package-files.json'),JSON.stringify({format_version:1,files:entries},null,2)+'\n');
}
async function buildPackage(){
 await dependencies();await clientScript('build');
 run('go',['run','./cmd/contentcheck','-content','content','-release']);
 run(npm,['--prefix',client,'run','runtime:build']);run(npm,['--prefix',client,'run','build']);
 if(!await exists(path.join(client,'dist/index.html')))throw new Error('Product build did not emit client/dist/index.html.');
 await mkdir(path.dirname(packageDir),{recursive:true});const stage=await mkdtemp(path.join(path.dirname(packageDir),'.frontline-build-'));
 run('go',['build','-trimpath','-ldflags=-s -w','-o',path.join(stage,executable),'./cmd/frontline']);
 await cp(path.join(client,'dist'),path.join(stage,'client'),{recursive:true,errorOnExist:true,force:false});
 await cp(path.join(root,'content'),path.join(stage,'content'),{recursive:true,errorOnExist:true,force:false});
 await licenses(stage);
 await writeFile(path.join(stage,'Play.command'),'#!/bin/sh\nset -eu\ncd -- "$(dirname -- "$0")"\nexec ./frontline -addr 127.0.0.1:8080 -data ./data -static ./client -maps ./content/maps -missions ./content/missions\n');
 await writeFile(path.join(stage,'Host-LAN.command'),'#!/bin/sh\nset -eu\ncd -- "$(dirname -- "$0")"\nexec ./frontline -lan -addr 0.0.0.0:8080 -data ./data -static ./client -maps ./content/maps -missions ./content/missions\n');
 await writeFile(path.join(stage,'Play.cmd'),'@echo off\r\ncd /d "%~dp0"\r\nfrontline.exe -addr 127.0.0.1:8080 -data ./data -static ./client -maps ./content/maps -missions ./content/missions\r\n');
 await writeFile(path.join(stage,'Host-LAN.cmd'),'@echo off\r\ncd /d "%~dp0"\r\nfrontline.exe -lan -addr 0.0.0.0:8080 -data ./data -static ./client -maps ./content/maps -missions ./content/missions\r\n');
 for(const name of ['Play.command','Host-LAN.command'])await chmod(path.join(stage,name),0o755);
 await copyFile(path.join(root,'docs/local-package.md'),path.join(stage,'README.md'));
 const version=JSON.parse(await readFile(path.join(client,'public/runtime/version.json'),'utf8'));
 await writeFile(path.join(stage,'version.json'),JSON.stringify({...version,platform:process.platform,arch:process.arch,source_revision:capture('git',['rev-parse','HEAD']),source_dirty:!!capture('git',['status','--porcelain']),built_at:new Date().toISOString(),acceptance:'See release evidence; successful packaging alone does not certify release readiness.'},null,2)+'\n');
 await checksums(stage);
 if(await exists(packageDir))await rename(packageDir,`${packageDir}.previous-${Date.now()}`);
 await rename(stage,packageDir);console.log(`Local package: ${packageDir}. No deployment performed.`);
}
async function play(lan){
 if(!await exists(path.join(packageDir,executable)))throw new Error('No local package is built. Run make build after the complete client/content is available.');
 const args=['-addr',lan?'0.0.0.0:8080':'127.0.0.1:8080','-data',path.join(root,'.local'),'-static',path.join(packageDir,'client'),'-maps',path.join(packageDir,'content/maps'),'-missions',path.join(packageDir,'content/missions')];if(lan)args.push('-lan');
 run(path.join(packageDir,executable),args);
}
try{
 switch(command){
  case 'doctor':await doctor();break;
  case 'dev':await dev();break;
  case 'test':await dependencies();run('go',['test','./...']);run('go',['vet','./...']);run(npm,['--prefix',client,'run','typecheck']);run(npm,['--prefix',client,'run','test:runtime']);break;
  case 'test-browser':await dependencies();run(npm,['--prefix',client,'run','test:browser']);break;
  case 'check-content':run('go',['run','./cmd/contentcheck','-content','content','-release']);break;
  case 'build':await buildPackage();break;
  case 'play':await play(false);break;
  case 'lan':await play(true);break;
  default:throw new Error('Use make doctor, dev, test, test-browser, check-content, build, play or lan.');
 }
}catch(error){console.error(error.message);process.exitCode=1}
