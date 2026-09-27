import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
execFileSync('protoc',['-I',path.join(client,'../protocol'),`--plugin=protoc-gen-es=${path.join(client,'node_modules/.bin/protoc-gen-es')}`,`--es_out=${path.join(client,'src/protocol')}`,'--es_opt=target=ts',path.join(client,'../protocol/frontline.proto')],{stdio:'inherit'});
