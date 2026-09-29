// Packages actual runtime outputs only. The art pipeline remains a separate owner.
import {createReadStream} from 'node:fs';
import {mkdir,readdir,readFile,stat,copyFile,writeFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {authoredEffectPack,inspectEffectPack,readAuthoredEffectFile} from './effect-pack.mjs';
const TYPES={'.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.webp':'image/webp','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wav':'audio/wav','.txt':'text/plain','.md':'text/markdown; charset=utf-8'};
async function exists(file){try{return (await stat(file)).isFile()}catch{return false}}
async function list(dir){try{return (await readdir(dir)).sort()}catch{return []}}
const safe=rel=>typeof rel==='string'&&!path.isAbsolute(rel)&&!rel.includes('\\')&&!rel.split('/').some(part=>part==='..'||part==='.'||!part);
function resolveArt(assets,urlPath){
 let rel;try{rel=decodeURIComponent(urlPath.replace(/^\/art\//,''))}catch{return}
 if(!safe(rel))return;
 if(rel.startsWith('audio/notices/')){const notice=rel.slice('audio/notices/'.length);if(notice==='README.md'||notice.startsWith('licenses/')&&/\.(md|txt)$/.test(notice))return path.join(assets,'audio',notice);return}
 if(rel.startsWith('ui/icons/build/'))return path.join(assets,'build',rel);
 if(rel.startsWith('ui/icons/')||rel.startsWith('ui/emblems/'))return path.join(assets,rel);
 if(['sprites/','terrain/','ui/','audio/','fx/'].some(prefix=>rel.startsWith(prefix)))return path.join(assets,'build',rel);
}
async function spriteFiles(assets,id,meta){
 const files=[`sprites/${id}/${id}.sprite.json`],atlases=Object.values(meta.atlases??{}).flatMap(scale=>Object.values(scale).flat());
 if(!atlases.length)return;
 for(const atlas of atlases){
  if(!safe(atlas))return;const rel=`sprites/${id}/${atlas}`,file=path.join(assets,'build',rel);if(!await exists(file))return;
  const data=JSON.parse(await readFile(file,'utf8')),image=data.meta?.image;if(!safe(image)||!await exists(path.join(assets,'build/sprites',id,image)))return;
  files.push(rel,`sprites/${id}/${image}`);
 }
 return files;
}
export async function artIndex(assets){
 const sprites={};
 for(const id of await list(path.join(assets,'build/sprites'))){
  if(!safe(id))continue;const file=path.join(assets,'build/sprites',id,`${id}.sprite.json`);
  try{const meta=JSON.parse(await readFile(file,'utf8'));if(await spriteFiles(assets,id,meta))sprites[id]=`sprites/${id}/${id}.sprite.json`}catch{/* In-progress or malformed art is not advertised as complete. */}
 }
 const terrain=(await list(path.join(assets,'build/terrain'))).filter(name=>name.endsWith('.png')&&!name.endsWith('.height.png')).map(name=>name.slice(0,-4));
 const portraits=[];for(const name of await list(path.join(assets,'build/ui/portraits')))if(name.endsWith('@2x.beauty.png')&&await exists(path.join(assets,'build/ui/portraits',name.replace('.beauty.','.team.'))))portraits.push(name.replace('@2x.beauty.png',''));
 const buildIcons=[];for(const name of await list(path.join(assets,'build/ui/icons/build')))if(name.endsWith('@2x.beauty.png')&&await exists(path.join(assets,'build/ui/icons/build',name.replace('.beauty.','.team.'))))buildIcons.push(name.replace('@2x.beauty.png',''));
 const effects=await authoredEffectPack(assets);
 const keyArt='ui/keyart/main_menu.png';
 return {format:1,sprites,terrain,portraits,buildIcons,...effects?{effects:effects.descriptor}:{},...await exists(path.join(assets,'build',keyArt))?{keyArt}:{},chrome:(await list(path.join(assets,'build/ui/chrome'))).filter(name=>name.endsWith('.png')),icons:await exists(path.join(assets,'ui/icons/fc-icons.svg')),emblems:await exists(path.join(assets,'ui/emblems/fc-emblems.svg'))};
}
async function walk(dir){const files=[];for(const name of await list(dir)){const file=path.join(dir,name),entry=await stat(file);if(entry.isDirectory())for(const rel of await walk(file))files.push(`${name}/${rel}`);else if(entry.isFile())files.push(name)}return files}
async function runtimeFiles(assets,index){
 const files=[];
 if(index.effects){const effects=await authoredEffectPack(assets);if(!effects||JSON.stringify(effects.descriptor)!==JSON.stringify(index.effects))throw Error('Effects changed while packaging.');files.push(...effects.files)}
 for(const [id,json] of Object.entries(index.sprites)){const meta=JSON.parse(await readFile(path.join(assets,'build',json),'utf8'));const complete=await spriteFiles(assets,id,meta);if(!complete)throw Error(`Listed sprite changed while packaging: ${id}`);files.push(...complete)}
 for(const name of index.terrain)files.push(`terrain/${name}.png`);
 for(const name of index.portraits)files.push(`ui/portraits/${name}@2x.beauty.png`,`ui/portraits/${name}@2x.team.png`);
 for(const name of index.buildIcons??[])files.push(`ui/icons/build/${name}@2x.beauty.png`,`ui/icons/build/${name}@2x.team.png`);
 for(const name of index.chrome)files.push(`ui/chrome/${name}`);
 if(index.keyArt)files.push(index.keyArt);
 for(const rel of await walk(path.join(assets,'build/audio')))if(/\.(json|ogg|mp3|wav)$/.test(rel))files.push(`audio/${rel}`);
 if(index.icons)files.push('ui/icons/fc-icons.svg');if(index.emblems)files.push('ui/emblems/fc-emblems.svg');return [...new Set(files)];
}
async function copy(from,to){await mkdir(path.dirname(to),{recursive:true});await copyFile(from,to)}
/** The exact source-to-product mapping shared by packaging and its input guard. */
export async function artPackageSources(assets){
 const index=await artIndex(assets),sources=[];
 for(const rel of await runtimeFiles(assets,index)){const source=resolveArt(assets,'/art/'+rel);if(!source)throw Error(`Unsafe art path ${rel}`);sources.push({source,output:'art/'+rel})}
 for(const rel of await walk(path.join(assets,'fonts')))if(/\.(ttf|woff2|txt)$/.test(rel))sources.push({source:path.join(assets,'fonts',rel),output:'assets/fonts/'+rel});
 for(const rel of ['README.md',...((await walk(path.join(assets,'audio/licenses'))).filter(rel=>/\.(md|txt)$/.test(rel)).map(rel=>`licenses/${rel}`))])if(await exists(path.join(assets,'audio',rel)))sources.push({source:path.join(assets,'audio',rel),output:'art/audio/notices/'+rel});
 return {index,sources};
}
export async function writeBasePack(outDir){
 const artPath=path.join(outDir,'art/index.json');
 if(await exists(artPath)){const art=JSON.parse(await readFile(artPath,'utf8'));if(art.effects!==undefined)await inspectEffectPack(path.join(outDir,'art'),{descriptor:art.effects})}
 const indexPath=path.join(outDir,'content/index.json');
 if(await exists(indexPath)){
  const index=JSON.parse(await readFile(indexPath,'utf8'));
  if(index.format_version!==1||!Array.isArray(index.maps)||!Array.isArray(index.missions))throw Error('The packaged content index is invalid.');
  for(const entry of [...index.maps,...index.missions]){
   if(typeof entry.url!=='string'||!entry.url.startsWith('/content/')||!safe(entry.url.slice(1)))throw Error('The content index references an unsafe path.');
   const bytes=await readFile(path.join(outDir,entry.url));
   if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error(`Content changed while packaging: ${entry.id}. Retry once authoring has finished.`);
  }
  for(const entry of index.maps){
   if(entry.environment===undefined)continue;
   const scene=entry.environment;
   if(!scene||typeof scene.url!=='string'||!/^\/content\/environment\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(scene.url)||!safe(scene.url.slice(1))||!Number.isSafeInteger(scene.bytes)||scene.bytes<1||scene.bytes>1024*1024||typeof scene.sha256!=='string'||!/^[0-9a-f]{64}$/.test(scene.sha256))throw Error(`Invalid scenery descriptor while packaging: ${entry.id}.`);
   const bytes=await readFile(path.join(outDir,scene.url));
   if(bytes.length!==scene.bytes||createHash('sha256').update(bytes).digest('hex')!==scene.sha256)throw Error(`Scenery changed while packaging: ${entry.id}. Retry once authoring has finished.`);
  }
 }
 const audioPath=path.join(outDir,'art/audio/index.json');
 if(await exists(audioPath)){
  const audio=JSON.parse(await readFile(audioPath,'utf8'));
  if(audio.format!==1||!audio.entries||typeof audio.entries!=='object')throw Error('The packaged audio index is invalid.');
  for(const [id,entry] of Object.entries(audio.entries))for(const variant of entry.variants??[]){
   const versions=[[variant.url,variant.bytes,variant.sha256],...(variant.mp3_url?[[variant.mp3_url,variant.mp3_bytes,variant.mp3_sha256]]:[])];
   for(const [url,size,hash] of versions){if(typeof url!=='string'||!url.startsWith('/art/audio/')||!safe(url.slice(1)))throw Error('The audio index references an unsafe path.');const bytes=await readFile(path.join(outDir,url));if(bytes.length!==size||createHash('sha256').update(bytes).digest('hex')!==hash)throw Error(`Audio changed while packaging: ${id}. Retry after audio authoring has finished.`)}
  }
 }
 // The index contains the generated version, so canonicalize that one field
 // before deriving identity. No authored content version or map hash changes.
 let stagedIndex;
 if(await exists(indexPath)){
  const index=JSON.parse(await readFile(indexPath,'utf8'));
  const rows=(index.packs??[]).filter(pack=>pack.id==='2.0.0');
  if(rows.length>1||rows.length===1&&rows[0].manifest_url!=='/assets/packs/base.json')throw Error('Invalid base pack reference in the content index.');
  if(rows.length===1){rows[0].version='__base_pack_content_version__';stagedIndex=index}
 }
 const files=[];
 for(const rel of await walk(outDir)){
  if(/\.pending-\d+$/.test(rel))throw Error('Incomplete previous pack staging file: '+rel);
  if(rel==='assets/packs/base.json'||rel.endsWith('.map'))continue;
  const data=rel==='content/index.json'&&stagedIndex?Buffer.from(JSON.stringify(stagedIndex,null,2)+'\n'):await readFile(path.join(outDir,rel));files.push({path:`/${rel}`,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.byteLength});
 }
 if(!files.some(file=>file.path==='/index.html')||!files.some(file=>file.path==='/runtime/frontline.wasm'))throw Error('Build the actual Go runtime before packaging the product (npm run runtime:build).');
 const version='content-v1-'+createHash('sha256').update(JSON.stringify(files)).digest('hex');
 let finalIndex;
 if(stagedIndex){stagedIndex.packs.find(pack=>pack.id==='2.0.0').version=version;finalIndex=Buffer.from(JSON.stringify(stagedIndex,null,2)+'\n');const descriptor=files.find(file=>file.path==='/content/index.json');descriptor.bytes=finalIndex.length;descriptor.sha256=createHash('sha256').update(finalIndex).digest('hex')}
 const pack={id:'2.0.0',version,files};if(files.length>16000||files.reduce((sum,file)=>sum+file.bytes,0)>2*1024**3)throw Error('The base pack exceeds the offline installer limits; split content packs before shipping.');
 const target=path.join(outDir,'assets/packs/base.json');await mkdir(path.dirname(target),{recursive:true});
 // This runs in a new unpublished build directory. Validate everything before
 // writing; rename complete files rather than exposing a partially written JSON.
 const suffix='.pending-'+process.pid,packTemp=target+suffix,indexTemp=indexPath+suffix;
 try{await writeFile(packTemp,JSON.stringify(pack,null,2)+'\n');if(finalIndex){await writeFile(indexTemp,finalIndex);await rename(indexTemp,indexPath)}await rename(packTemp,target)}
 finally{await rm(packTemp,{force:true});await rm(indexTemp,{force:true})}return pack;
}
export function artPlugin({assets,content=path.join(path.dirname(assets),'content')}){
 let outDir='',building=false;
 return {name:'frontline-art',enforce:'pre',
  configResolved(config){outDir=config.build.outDir;building=config.command==='build'},
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
   let url;try{url=new URL(req.url??'/','http://local')}catch{res.statusCode=400;res.end();return}
   const pathname=url.pathname;
   if(pathname==='/assets/packs/base.json'){res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:'production_build_required',message:'Offline packs are generated by the production build.'}));return}
   if(!['/art/','/assets/fonts/','/content/'].some(prefix=>pathname.startsWith(prefix)))return next();
   if(pathname==='/art/index.json'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');try{res.end(JSON.stringify(await artIndex(assets)))}catch{res.statusCode=503;res.end(JSON.stringify({code:'art_pack_invalid',message:'An installed art pack is incomplete or invalid.'}))}return}
   let decoded;try{decoded=decodeURIComponent(pathname)}catch{res.statusCode=400;res.end();return}
   if(decoded.startsWith('/art/fx/')){try{const bytes=await readAuthoredEffectFile(assets,decoded.slice('/art/'.length));if(!bytes){res.statusCode=404;res.end('Effect file not found');return}res.setHeader('Content-Type',TYPES[path.extname(decoded)]??'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Content-Length',String(bytes.length));res.end(bytes)}catch{res.statusCode=503;res.end('Effect pack is incomplete or invalid.')}return}
   let file;if(pathname.startsWith('/art/'))file=resolveArt(assets,pathname);else{const prefix=pathname.startsWith('/content/')?'/content/':'/assets/fonts/',rel=decoded.slice(prefix.length);if(safe(rel)&&(/\.json$/.test(rel)&&prefix==='/content/'||/\.(ttf|woff2|txt)$/.test(rel)&&prefix==='/assets/fonts/'))file=path.join(prefix==='/content/'?content:path.join(assets,'fonts'),rel)}
   if(!file||!await exists(file)){res.statusCode=404;res.end('Content file not found');return}
   res.setHeader('Content-Type',TYPES[path.extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Content-Length',String((await stat(file)).size));createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  })},
  async closeBundle(){
   if(!building)return;const {index,sources}=await artPackageSources(assets);
   for(const {source,output} of sources)await copy(source,path.join(outDir,output));
   await mkdir(path.join(outDir,'art'),{recursive:true});await writeFile(path.join(outDir,'art/index.json'),JSON.stringify(index));
   for(const rel of await walk(content))if(rel.endsWith('.json'))await copy(path.join(content,rel),path.join(outDir,'content',rel));
   await writeBasePack(outDir);
  },
 };
}
