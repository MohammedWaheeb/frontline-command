import {copyDependencyLicenses,copyNpmLicenses} from '../../scripts/package-licenses.mjs';
// Packaging rehearsal from immutable reviewed inputs. No live/dist changes,
// deployment, existing data migration or final-release claim.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,cp,readdir,stat,chmod} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyProduct,verifyNativeExecutable,fileInventory,fileDigest,resolveGoLicense} from '../../scripts/package-integrity.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const label=process.argv[2];assert(/^assembly-[0-9]+$/.test(label??''),'New assembly-N required');const out=path.join(here,label);await mkdir(out);const stage=path.join(out,'Frontline Command candidate');await mkdir(stage);
const sha=b=>createHash('sha256').update(b).digest('hex'),pins=new Map();
async function pin(p,expected){const b=await readFile(p),digest=sha(b);if(expected)assert.equal(digest,expected,p);pins.set(p,digest);return b;}
const receipt={status:'running',scope:'Native macOS arm64 package-layout rehearsal from immutable v25+36 art/runtime. Not the make build pipeline or a complete release; no browser acceptance yet.',commands:[],checks:{}};
const save=()=>writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await save();
try{
 for(const file of ['work/local-package-v25/assemble.mjs','scripts/package-integrity.mjs','scripts/package-licenses.mjs','scripts/local.mjs','go.mod','go.sum'])await pin(path.join(root,file));
 for(const file of await fileInventory(path.join(root,'licenses/npm-supplemental')))await pin(path.join(root,'licenses/npm-supplemental',file.path));
 const union=path.join(root,'work/art/roster-runtime-overlay-v1/outputs/complete-roster-v25'),product=path.join(union,'product');
 const overlay=JSON.parse(await pin(path.join(union,'build.json'),'35a7ade618a5e3afffe9c4fa512e90eefa5131f37721021be5f174c8e6008770'));
 const base=path.join(root,overlay.base),build=JSON.parse(await pin(path.join(base,'build.json'),'6c4f6f675983c3ab428546487ee419212a2b798aa66c513cd5913058084524f0'));
 const source=path.join(root,'work/runtime-034-integrated-source/source'),lock=JSON.parse(await pin(path.join(root,'work/runtime-034-integrated-source/source-lock.json'),'3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'));
 for(const [name,digest]of Object.entries(lock.files))if(name.startsWith('content/')||name==='go.mod'||name==='go.sum')await pin(path.join(source,name),digest);
 const host=path.join(base,'frontline');await pin(host,build.runtime.files['bin/frontline-host'].sha256);receipt.checks.originalProduct=await verifyProduct(product);receipt.checks.executable=await verifyNativeExecutable(host);
 execFileSync('cp',['-cR',product,path.join(stage,'client')]);await cp(path.join(source,'content'),path.join(stage,'content'),{recursive:true,errorOnExist:true,force:false});await copyFile(host,path.join(stage,'frontline'));await chmod(path.join(stage,'frontline'),0o755);
 const productionScript=await pin(path.join(root,'scripts/local.mjs'));
 const launchers={
  'Play.command':'#!/bin/sh\nset -eu\ncd -- "$(dirname -- "$0")"\nexec ./frontline -addr 127.0.0.1:8080 -data ./data -static ./client -maps ./content/maps -missions ./content/missions\n',
  'Host-LAN.command':'#!/bin/sh\nset -eu\ncd -- "$(dirname -- "$0")"\nexec ./frontline -lan -addr 0.0.0.0:8080 -data ./data -static ./client -maps ./content/maps -missions ./content/missions\n',
 };
 // Verify these are the production script's exact string literals, including
 // path quoting. No separately invented launch behavior is being tested.
 for(const [name,text]of Object.entries(launchers)){
  const escaped=text.replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll("'","\\'");
  assert(productionScript.toString().includes("await writeFile(path.join(stage,'"+name+"'),'"+escaped+"')"),'Production launcher changed: '+name);
  await writeFile(path.join(stage,name),text);await chmod(path.join(stage,name),0o755);
 }
 await pin(path.join(root,'docs/local-package.md'));await copyFile(path.join(root,'docs/local-package.md'),path.join(stage,'README.md'));
 await writeFile(path.join(stage,'CANDIDATE.md'),'# Incomplete integration candidate\n\nThis is a local packaging rehearsal, not the complete game or release. It contains\n36 completed art exports alongside earlier incomplete art. See the exact receipt\nand docs/implementation-status.md in the working project. Do not distribute as final.\n');
 const licenses=path.join(stage,'licenses');await mkdir(licenses);
 const goRoot=execFileSync('/opt/homebrew/bin/go',['env','GOROOT'],{encoding:'utf8'}).trim();await copyFile(await resolveGoLicense(goRoot),path.join(licenses,'Go-LICENSE'));
 const notices=['# Third-party notices','','This candidate includes the exact integrated Go executable and captured runtime\nclient. Generated asset provenance remains in its immutable source handoffs.',''];
 const goEnv={...process.env,GOMAXPROCS:'1',GOFLAGS:'-p=1'};delete goEnv.GOOS;delete goEnv.GOARCH;
 const modules=execFileSync('/opt/homebrew/bin/go',['list','-m','-json','all'],{cwd:source,env:goEnv,encoding:'utf8'}).trim().split(/\n(?=\{)/).map(JSON.parse);
 for(const m of modules){if(m.Main)continue;let actual=m.Replace??m;const dest='go/'+m.Path.replaceAll('/','_')+'@'+m.Version;if(!actual.Dir){const downloaded=JSON.parse(execFileSync('/opt/homebrew/bin/go',['mod','download','-json',actual.Path+'@'+actual.Version],{cwd:stage,env:{...goEnv,GOWORK:'off'},encoding:'utf8'}));assert(!downloaded.Error&&downloaded.Path===actual.Path&&downloaded.Version===actual.Version&&downloaded.Dir);actual={...actual,Dir:downloaded.Dir}}assert(await copyDependencyLicenses(actual.Dir,path.join(licenses,dest)),'Missing Go dependency notice');notices.push(`- ${m.Path} ${m.Version}: [license](${dest}/)`)}
 const npmLock=JSON.parse(await pin(path.join(root,'client/package-lock.json'),build.packagingSources['client/package-lock.json']));
 for(const [location,item]of Object.entries(npmLock.packages??{})){if(!location||item.dev)continue;const dir=path.join(root,'client',location),pkg=JSON.parse(await readFile(path.join(dir,'package.json'))),dest='npm/'+pkg.name.replaceAll('/','_')+'@'+pkg.version;await copyNpmLicenses({moduleDir:dir,out:path.join(licenses,dest),lockEntry:item,supplementRoot:path.join(root,'licenses/npm-supplemental')});notices.push(`- ${pkg.name} ${pkg.version}: [license](${dest}/)`)}
 await writeFile(path.join(licenses,'README.md'),notices.join('\n')+'\n');
 receipt.checks.packagedProduct=await verifyProduct(path.join(stage,'client'));assert.deepEqual(receipt.checks.originalProduct,receipt.checks.packagedProduct);
 const version=JSON.parse(await readFile(path.join(stage,'client/runtime/version.json')));await writeFile(path.join(stage,'version.json'),JSON.stringify({...version,platform:process.platform,arch:process.arch,product_pack:receipt.checks.packagedProduct,acceptance:receipt.scope,base_build_sha256:sha(await readFile(path.join(base,'build.json'))),overlay_build_sha256:sha(await readFile(path.join(union,'build.json')))},null,2)+'\n');
 const files=[];for(const entry of await fileInventory(stage))files.push({...entry,...await fileDigest(path.join(stage,entry.path))});await writeFile(path.join(stage,'package-files.json'),JSON.stringify({format_version:1,files},null,2)+'\n');
 for(const [file,digest]of pins)assert.equal(sha(await readFile(file)),digest,'Input changed: '+file);
 receipt.status='assembled';receipt.stage=stage;receipt.fileCount=files.length;receipt.encodedBytes=files.reduce((n,f)=>n+f.bytes,0);receipt.packageManifestSHA256=sha(await readFile(path.join(stage,'package-files.json')));receipt.inputs=Object.fromEntries(pins);receipt.inputsVerifiedAfter=true;await save();console.log(out);
}catch(error){receipt.status='failed';receipt.failure=String(error.stack??error);await save();throw error;}
