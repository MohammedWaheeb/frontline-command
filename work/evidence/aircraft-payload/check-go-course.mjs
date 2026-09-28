import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),require=createRequire(path.join(root,'client/package.json'));
const {build}=require('esbuild'),out=path.join(root,'client/.test-runtime/aircraft-payload-go-course.mjs');
await build({entryPoints:[path.join(here,'check-go-course.ts')],outfile:out,bundle:true,platform:'node',format:'esm',target:'node24',packages:'external'});
execFileSync(process.execPath,[out],{cwd:root,stdio:'inherit',env:process.env});
