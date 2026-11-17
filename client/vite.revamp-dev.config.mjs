// Beta revamp dev server only. The product enforces an exact offline-pack
// identity, so data paths (art, content, runtime, packs) are served from the
// last production build in dist/ while Vite hot-reloads source modules.
// Content or art edits still need a real build. Not used by builds or tests.
import base from './vite.config.ts';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const client=path.dirname(fileURLToPath(import.meta.url));
const dist=path.join(client,'dist');
const pinnedPrefixes=['/art/','/content/','/runtime/','/assets/packs/'];
const types={'.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm','.js':'text/javascript','.bin':'application/octet-stream'};

const pinnedData={
 name:'revamp-dev-pinned-data',
 enforce:'pre',
 configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   const url=decodeURIComponent(req.url?.split('?')[0]??'');
   if(!pinnedPrefixes.some(prefix=>url.startsWith(prefix)))return next();
   const file=path.join(dist,url);
   if(!file.startsWith(dist+path.sep))return next();
   try{if(!(await stat(file)).isFile())return next()}catch{return next()}
   res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');
   res.end(await readFile(file));
  });
 },
};

export default {...base,plugins:[pinnedData,...base.plugins]};
