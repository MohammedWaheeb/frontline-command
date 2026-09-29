import {build} from '../../client/node_modules/esbuild/lib/main.js';
import path from 'node:path';
const directory=path.resolve(process.argv[2]);
await build({entryPoints:[path.join(directory,'inputs/worker.ts')],outfile:path.join(directory,'runtime/worker.js'),bundle:true,format:'iife',platform:'browser',target:'es2022',sourcemap:true});
