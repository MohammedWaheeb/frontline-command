// Integration rehearsal with the current incomplete live art/runtime. No live writes.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,loadConfigFromFile} from '../../client/node_modules/vite/dist/node/index.js';
import {artPlugin} from './candidate/client/scripts/ui/art-plugin.mjs';
import {capturePresentationInputs,verifyPresentationProduct} from './candidate/scripts/package-presentation-inputs.mjs';
import {verifyProduct,fileDigest} from './candidate/scripts/package-integrity.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const out=path.join(here,process.env.CHECK_DIR??'checks-product-01');await mkdir(out);
const receipt={started:new Date().toISOString(),status:'running',scope:'Private ordinary-config Vite rehearsal, candidate art plugin and manifest enabled, existing accepted runtime and incomplete art. No runtime rebuild, host, browser, final art or release claim.'};
try{
 const candidateFiles=['scripts/package-presentation-inputs.mjs','scripts/local.mjs','scripts/package-integrity.mjs','client/vite.config.ts','client/scripts/ui/art-plugin.mjs','client/scripts/ui/effect-pack.mjs','client/src/content/effect-assets.mjs'];
 receipt.candidate={};for(const rel of candidateFiles)receipt.candidate[rel]=await fileDigest(path.join(here,'candidate',rel));
 receipt.driver=await fileDigest(fileURLToPath(import.meta.url));
 const before=await capturePresentationInputs(root);await writeFile(path.join(out,'inputs-before.json'),JSON.stringify(before,null,2)+'\n');
 const loaded=await loadConfigFromFile({command:'build',mode:'production'},path.join(root,'client/vite.config.ts'));
 if(!loaded)throw Error('Actual Vite config was not loaded');
 const plugins=loaded.config.plugins;let replacements=0;
 const replaced=plugins.map(plugin=>plugin?.name==='frontline-art'?(replacements++,artPlugin({assets:path.join(root,'assets')})):plugin);
 if(replacements!==1)throw Error('Expected exactly one ordinary art plugin');
 await build({...loaded.config,configFile:false,plugins:replaced,build:{...loaded.config.build,manifest:'build-assets.json',outDir:path.join(out,'product')}});
 receipt.product=await verifyProduct(path.join(out,'product'));
 receipt.presentation=await verifyPresentationProduct(root,path.join(out,'product'),before);
 for(const [rel,expected] of Object.entries(receipt.candidate))if((await fileDigest(path.join(here,'candidate',rel))).sha256!==expected.sha256)throw Error('Private candidate changed during build: '+rel);
 if((await fileDigest(fileURLToPath(import.meta.url))).sha256!==receipt.driver.sha256)throw Error('Driver changed during build');
 receipt.pack=await fileDigest(path.join(out,'product/assets/packs/base.json'));
 receipt.viteManifest=await fileDigest(path.join(out,'product/build-assets.json'));
 receipt.status='passed';
}catch(error){receipt.status='failed';receipt.error=error.stack;process.exitCode=1}
receipt.ended=new Date().toISOString();await writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
