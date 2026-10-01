// Read-only; never starts a browser, native executable, HTTP server or host.
import {verifyProduct} from './package-integrity.mjs';import {writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
const args=process.argv.slice(2),options={};if(args.length%2)throw Error('Use --product DIR --out FILE [--previous DIR]');for(let i=0;i<args.length;i+=2){if(!['--product','--out','--previous'].includes(args[i])||options[args[i]])throw Error('Invalid arguments');options[args[i]]=args[i+1]}
if(!options['--product']||!options['--out'])throw Error('Use --product DIR --out FILE');
const output=path.resolve(options['--out']),report={time:new Date().toISOString(),product:path.resolve(options['--product']),previous:options['--previous']&&path.resolve(options['--previous']),noBrowserOrHost:true};
try{report.integrity=await verifyProduct(report.product,{previous:report.previous});report.status='passed'}catch(error){report.status='failed';report.error=String(error);process.exitCode=1}
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
