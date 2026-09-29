import {readFile} from 'node:fs/promises';
import {promote} from './publication.mjs';
const options=JSON.parse(await readFile(process.argv[2],'utf8'));
await promote({...options,hook:async point=>{if(point==='after-old-rename')process.exit(86)}});
