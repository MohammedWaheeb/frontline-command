import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {nativeBuildEnvironment,portablePath,fileInventory,verifyProduct,verifyNativeExecutable,resolveGoLicense,verifyCSSDependencies} from './package-integrity.mjs';
const put=async(root,name,bytes)=>{await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),bytes)};
test('packaged CSS resolves fonts, textures and imports and rejects unresolved source paths',()=>{
 const files=new Set(['/assets/fonts/body.ttf','/art/ui/metal.png','/assets/theme.css']);
 assert.deepEqual(verifyCSSDependencies('@font-face{src:url("fonts/body.ttf")}x{background:url(/art/ui/metal.png)}@import "theme.css";', '/assets/app.css',files),['/assets/fonts/body.ttf','/art/ui/metal.png','/assets/theme.css']);
 assert.deepEqual(verifyCSSDependencies('/* url(missing.png) */x{mask:url(#glyph);background:url(data:image/png;base64,a)}','/assets/app.css',files),[]);
 for(const ref of ['../../../assets/build/ui/chrome/metal_noise.png','https://remote.invalid/font.ttf','//remote.invalid/font.ttf','fonts/body.ttf?rev=1'])assert.throws(()=>verifyCSSDependencies(`x{src:url('${ref}')}`,'/assets/app.css',files),/CSS dependency/);
 assert.throws(()=>verifyCSSDependencies('@import "missing.css";','/assets/app.css',files),/CSS dependency/);
});
test('Go notices support archive and Homebrew layouts without accepting unrelated licenses',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'package-go-license-'));try{
  const license='Copyright The Go Authors.\nRedistribution and use in source and binary forms\nTHIS SOFTWARE IS PROVIDED';
  await put(dir,'archive/LICENSE',license);assert.equal(await resolveGoLicense(path.join(dir,'archive')),path.join(dir,'archive/LICENSE'));
  await mkdir(path.join(dir,'homebrew/libexec'),{recursive:true});await put(dir,'homebrew/LICENSE',license);assert.equal(await resolveGoLicense(path.join(dir,'homebrew/libexec')),path.join(dir,'homebrew/LICENSE'));
  await assert.rejects(resolveGoLicense(path.join(dir,'unrelated')),/missing/);await put(dir,'homebrew/libexec/LICENSE','Not the Go license');await assert.rejects(resolveGoLicense(path.join(dir,'homebrew/libexec')),/Unrecognized/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('native target removes inherited cross and CGO settings',()=>{assert.deepEqual(nativeBuildEnvironment('linux','x64',{GOOS:'js',GOARCH:'wasm',CGO_ENABLED:'1'}),{GOOS:'linux',GOARCH:'amd64',CGO_ENABLED:'0',GOAMD64:'v1',GOARM64:'v8.0'});assert.equal(nativeBuildEnvironment('win32','arm64',{}).GOOS,'windows');assert.throws(()=>nativeBuildEnvironment('darwin','ia32',{}),/unsupported/)});
test('portable inventory rejects escape, Windows reserved names and symlinks',async()=>{for(const name of ['../secret','/absolute','x\\y','AUX.txt','a/COM1','a.','a:secret','a%2fsecret'])assert.throws(()=>portablePath(name));const dir=await mkdtemp(path.join(tmpdir(),'package-paths-'));try{await put(dir,'OK.txt','ok');await symlink(path.join(dir,'OK.txt'),path.join(dir,'link'));await assert.rejects(fileInventory(dir),/Symlink/);await rm(path.join(dir,'link'));assert.equal((await fileInventory(dir)).length,1)}finally{await rm(dir,{recursive:true,force:true})}});
test('native headers must match the recorded package platform and CPU',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'package-native-'));try{const file=path.join(dir,'binary'),b=Buffer.alloc(256);b.writeUInt32LE(0xfeedfacf,0);b.writeUInt32LE(0x100000c,4);await writeFile(file,b);assert.equal((await verifyNativeExecutable(file,'darwin','arm64')).GOARCH,'arm64');await assert.rejects(verifyNativeExecutable(file,'darwin','x64'),/architecture mismatch/);await assert.rejects(verifyNativeExecutable(file,'linux','arm64'),/ELF64/)}finally{await rm(dir,{recursive:true,force:true})}});
test('offline package rejects missing runtime, changed bytes, unlisted resources and reused version',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'package-product-'));try{
  const files={'index.html':'<script src="/runtime/worker.js"></script>','runtime/frontline.wasm':'fixture','runtime/worker.js':'worker','runtime/wasm_exec.js':'exec','service-worker.js':'sw','art/index.json':'{}','runtime/version.json':JSON.stringify({simulation:'0.3.4',content_hash:'hash',protocol:1}),'content/index.json':JSON.stringify({packs:[{id:'2.0.0',version:'test',manifest_url:'/assets/packs/base.json'}]})};
  for(const[name,bytes]of Object.entries(files))await put(dir,name,bytes);
  const pack={id:'2.0.0',version:'test',files:Object.entries(files).map(([name,bytes])=>({path:'/'+name,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')}))};await put(dir,'assets/packs/base.json',JSON.stringify(pack));assert.equal((await verifyProduct(dir)).files,8);
  await put(dir,'runtime/worker.js','broken');await assert.rejects(verifyProduct(dir),/dependency changed/);await put(dir,'runtime/worker.js','worker');
  const removed=pack.files.pop();await put(dir,'assets/packs/base.json',JSON.stringify(pack));await assert.rejects(verifyProduct(dir),/not cached/);pack.files.push(removed);await put(dir,'assets/packs/base.json',JSON.stringify(pack));
  await put(dir,'unexpected.js','extra');await assert.rejects(verifyProduct(dir),/Unmanifested/);await rm(path.join(dir,'unexpected.js'));
  const previous=await mkdtemp(path.join(tmpdir(),'package-prior-'));try{await put(previous,'assets/packs/base.json',JSON.stringify({...pack,files:[]}));await assert.rejects(verifyProduct(dir,{previous}),/reuses a previously/)}finally{await rm(previous,{recursive:true})}
 }finally{await rm(dir,{recursive:true,force:true})}
});
