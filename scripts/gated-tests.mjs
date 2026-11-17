// Guard against Go tests that silently never run in any lane.
//
// Lanes (see scripts/local.mjs and goTestArguments in
// scripts/package-integrity.mjs):
//   test     (make test):          go test -short ./cmd/... ./internal/... ./pkg/... ./protocol/...
//   extended (make test-extended): go test -timeout=120m <same packages>  (no -short)
//   browser  (make test-browser): npm test:browser; runs no Go *_test.go tests.
// Neither lane sets gate variables such as STRESS or FRONTLINE_SOAK, and
// neither passes -race or -bench. A test that skips on testing.Short() runs
// only in extended; a test that skips unless an env var is set runs in no
// lane. This check scans *_test.go sources (text only, no Go build), lists
// every conditionally-skipping test, and fails when one is missing from
// scripts/gated-tests.json, when a manifest entry is stale, or when an entry
// claims a lane that cannot run it. See docs/test-lanes.md.
//
// The scanner is deliberately conservative; it is not a Go control-flow
// interpreter. It proves only two gate shapes:
//   if testing.Short() { t.Skip(...) }        as the first statement, and
//   if os.Getenv("X") != "v" { t.Skip(...) }  (or == ""), a direct call,
// both as a top-level statement whose block holds only that skip, with no
// else. Every other skip under a condition -- else branches, local aliases
// of testing.Short()/os.Getenv(...), nested or compound conditions, gates
// inside helpers -- is `unsupported`: no lane may claim it, and the manifest
// must give a manual command plus a reason.

import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const SCAN_ROOTS=Object.freeze(['cmd','internal','pkg','protocol']);

// What each lane can actually execute. `env` lists env vars the lane sets
// for `go test`; local.mjs passes only nativeBuildEnvironment() (GOOS,
// GOARCH, CGO_ENABLED, ...), so no gate variable is ever set by a lane.
export const LANES=Object.freeze({
 test:{go:true,short:true,race:false,bench:false,env:Object.freeze([])},
 extended:{go:true,short:false,race:false,bench:false,env:Object.freeze([])},
 browser:{go:false,short:false,race:false,bench:false,env:Object.freeze([])},
});

/** Blank comments and string/char literal contents in place (same length),
 * keeping quotes so argument positions stay findable. Literal values are
 * returned keyed by the offset of their opening quote. */
export function maskGo(text){
 // split('') splits UTF-16 code units, preserving JS string offsets;
 // [...text] would count astral characters as one entry and shift all
 // later offsets relative to the masked string and literal map.
 const out=text.split(''),literals=new Map();
 let i=0;
 while(i<text.length){
  const c=text[i],next=text[i+1]??'';
  if(c==='/'&&next==='/'){while(i<text.length&&text[i]!=='\n'){out[i]=' ';i++}continue}
  if(c==='/'&&next==='*'){out[i]=' ';out[i+1]=' ';i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/')){if(text[i]!=='\n')out[i]=' ';i++}if(i<text.length){out[i]=' ';out[i+1]=' ';i+=2}continue}
  if(c==='"'||c==="'"||c==='`'){
   const start=i,quote=c;i++;let value='';
   while(i<text.length&&text[i]!==quote){
    if(quote!=='`'&&text[i]==='\\'){value+=text[i+1]??'';if(text[i]!=='\n')out[i]=' ';if(i+1<text.length&&text[i+1]!=='\n')out[i+1]=' ';i+=2;continue}
    value+=text[i];if(text[i]!=='\n')out[i]=' ';i++;
   }
   i++;literals.set(start,value);continue;
  }
  i++;
 }
 return {masked:out.join(''),literals};
}

function matchBracket(masked,open,openCh,closeCh){
 let depth=0;
 for(let i=open;i<masked.length;i++){
  if(masked[i]===openCh)depth++;
  else if(masked[i]===closeCh){depth--;if(depth===0)return i}
 }
 return -1;
}

/** First `{` at paren depth 0 at or after `from`. */
function blockAfter(masked,from,end){
 let depth=0;
 for(let i=from;i<end;i++){
  const c=masked[i];
  if(c==='(')depth++;
  else if(c===')')depth--;
  else if(c==='{'&&depth===0)return i;
 }
 return -1;
}

/** Every top-level func in one file, with its body span. */
export function parseFunctions(text){
 const {masked,literals}=maskGo(text);
 const pkg=/^package\s+(\w+)/m.exec(text)?.[1]??'';
 const funcs=[];
 const re=/(^|\n)func\s+(?:\(([^)]*)\)\s*)?([A-Za-z_]\w*)\s*\(/g;
 let m;
 while((m=re.exec(masked))){
  const openParen=re.lastIndex-1,closeParen=matchBracket(masked,openParen,'(',')');
  if(closeParen<0)continue;
  const openBrace=masked.indexOf('{',closeParen);
  if(openBrace<0)continue;
  const closeBrace=matchBracket(masked,openBrace,'{','}');
  if(closeBrace<0)continue;
  const line=text.slice(0,m.index+m[1].length).split('\n').length;
  funcs.push({name:m[3],receiver:m[2]??null,
   bodyStart:openBrace,bodyEnd:closeBrace,masked,literals,pkg,line});
  re.lastIndex=closeBrace;
 }
 return funcs;
}

/** Every `if` in one function body: header and block spans, plus whether an
 * `else` follows and where its block spans (else-if counts as else). */
function parseIfs(fn){
 const ifs=[],ifRe=/\bif\b/g;
 ifRe.lastIndex=fn.bodyStart;
 let m;
 while((m=ifRe.exec(fn.masked))&&m.index<fn.bodyEnd){
  const blockStart=blockAfter(fn.masked,ifRe.lastIndex,fn.bodyEnd);
  if(blockStart<0)break;
  const blockEnd=matchBracket(fn.masked,blockStart,'{','}');
  if(blockEnd<0)break;
  let elseStart=-1,elseEnd=-1,j=blockEnd+1;
  while(j<fn.bodyEnd&&/\s/.test(fn.masked[j]))j++;
  if(fn.masked.startsWith('else',j)&&!/\w/.test(fn.masked[j+4]??'')){
   elseStart=j;
   let k=j+4;while(k<fn.bodyEnd&&/\s/.test(fn.masked[k]))k++;
   if(fn.masked[k]==='{')elseEnd=matchBracket(fn.masked,k,'{','}');
   else{const b=blockAfter(fn.masked,k,fn.bodyEnd);elseEnd=b>=0?matchBracket(fn.masked,b,'{','}'):k}
  }
  ifs.push({at:m.index,headerStart:ifRe.lastIndex,headerEnd:blockStart,
   blockStart,blockEnd,hasElse:elseStart>=0,elseStart,elseEnd});
 }
 return ifs;
}

/** Brace depth just before each wanted offset; statements directly in the
 * function body have depth 1. */
function depthsAt(fn,offsets){
 const wanted=new Set(offsets),out=new Map();let depth=0;
 for(let i=fn.bodyStart;i<=fn.bodyEnd;i++){
  if(wanted.has(i))out.set(i,depth);
  if(fn.masked[i]==='{')depth++;
  else if(fn.masked[i]==='}')depth--;
 }
 return out;
}

/** The proven gate for one if header, or null when the shape is not one of
 * the two provable forms. Short must also be the first statement. */
function provenGate(fn,f){
 const cond=fn.masked.slice(f.headerStart,f.headerEnd).trim();
 if(/^testing\.Short\s*\(\s*\)$/.test(cond))
  return fn.masked.slice(fn.bodyStart+1,f.at).trim()===''?{kind:'short'}:null;
 const m=/^os\.Getenv\s*\(\s*"[^"]*"\s*\)\s*(!=|==)\s*"[^"]*"$/.exec(cond);
 if(!m)return null;
 const header=fn.masked.slice(f.headerStart,f.headerEnd);
 const q1=header.indexOf('"'),q2=header.indexOf('"',header.indexOf('"',q1+1)+1);
 const name=fn.literals.get(f.headerStart+q1)??'',value=fn.literals.get(f.headerStart+q2);
 if(!name||value===undefined)return null;
 if(m[1]==='!='&&value!=='')return {kind:'env',name,require:'exact',value};
 if(m[1]==='=='&&value==='')return {kind:'env',name,require:'nonempty'};
 return null;
}

/** Skip gates written directly in one function body. A skip site earns a
 * proven kind only when its single enclosing if is a top-level statement
 * with no else, a provable condition, and a block holding only that skip;
 * every other conditional (or unconditional) skip is `unsupported`. */
function directGates(fn){
 const ifs=parseIfs(fn),depths=depthsAt(fn,ifs.map(f=>f.at));
 const body=fn.masked.slice(fn.bodyStart,fn.bodyEnd+1),gates=[];
 const skipRe=/\b([A-Za-z_]\w*)\.(?:Skip|Skipf|SkipNow)\s*\(/g;
 let m;
 while((m=skipRe.exec(body))){
  const at=fn.bodyStart+m.index;
  const inElse=ifs.some(f=>f.elseStart>=0&&at>f.elseStart&&at<f.elseEnd);
  const enclosing=ifs.filter(f=>at>f.blockStart&&at<f.blockEnd);
  let gate=null;
  if(!inElse&&enclosing.length===1){
   const f=enclosing[0],open=at+m[0].length-1,close=matchBracket(fn.masked,open,'(',')');
   const onlySkip=close>0&&/^[\s;]*$/.test(
    fn.masked.slice(f.blockStart+1,at)+fn.masked.slice(close+1,f.blockEnd));
   if(!f.hasElse&&depths.get(f.at)===1&&onlySkip)gate=provenGate(fn,f);
  }
  gates.push(gate??{kind:'unsupported'});
 }
 return gates;
}

const TEST_NAME=/^(Test|Benchmark|Example|Fuzz)[A-Z0-9_]/;
function isTestFunction(fn){return !fn.receiver&&TEST_NAME.test(fn.name)}

/** Scan in-memory sources: [{file, text}] with repo-relative POSIX paths.
 * Returns gated tests sorted by file then name. Each result:
 * {name, file, line, benchmark, kinds:[...], env:[...], envRequirements}.
 * kinds uses 'short', 'env' and 'unsupported'. A test that (transitively)
 * calls a same-package helper containing any skip is `unsupported`: helper
 * gates are never analysed further. */
function scanSources(sources){
 const byDirPkg=new Map(),tests=[],allNames=new Set();
 const keyOf=fn=>`${fn.dir}\0${fn.pkg}`;
 const parsed=sources.map(({file,text})=>{
  const dir=path.posix.dirname(file);
  return parseFunctions(text).map(fn=>({...fn,file,dir,gates:directGates(fn)}));
 }).flat();
 for(const fn of parsed)if(isTestFunction(fn))allNames.add(`${fn.file}\0${fn.name}`);
 for(const fn of parsed){
  if(!byDirPkg.has(keyOf(fn)))byDirPkg.set(keyOf(fn),new Map());
  byDirPkg.get(keyOf(fn)).set(fn.name,fn);
 }
 const helpersFor=fn=>{
  const maps=[byDirPkg.get(keyOf(fn))];
  if(fn.pkg.endsWith('_test'))maps.push(byDirPkg.get(`${fn.dir}\0${fn.pkg.slice(0,-5)}`));
  return maps.filter(Boolean);
 };
 // Mark functions that call a skip-bearing helper, to a fixpoint so
 // helper chains propagate. The mark only ever adds `unsupported`.
 for(const fn of parsed)fn.callsSkipHelper=false;
 // Marks only ever turn on, so this terminates after at most one round per
 // function; no round cap that could hide a long helper chain.
 for(;;){
  let changed=false;
  for(const fn of parsed){
   if(fn.callsSkipHelper)continue;
   const names=[];
   for(const map of helpersFor(fn))for(const [name,callee] of map)
    if(!isTestFunction(callee)&&name!==fn.name&&(callee.gates.length||callee.callsSkipHelper))names.push(name);
   if(!names.length)continue;
   const body=fn.masked.slice(fn.bodyStart,fn.bodyEnd+1);
   if(new RegExp(`\\b(${names.join('|')})\\s*\\(`).test(body)){fn.callsSkipHelper=true;changed=true}
  }
  if(!changed)break;
 }
 for(const fn of parsed){
  if(!isTestFunction(fn))continue;
  const gates=fn.callsSkipHelper?[...fn.gates,{kind:'unsupported'}]:[...fn.gates];
  if(!gates.length)continue;
  const envReqs=new Map();
  for(const g of gates)if(g.kind==='env'){
   const req={name:g.name,require:g.require,...(g.value!==undefined?{value:g.value}:{})};
   const prev=envReqs.get(g.name);
   // Two direct gates on one variable: keep the stricter one when they
   // agree; incompatible requirements cannot be proven runnable.
   if(!prev||prev.require==='nonempty'&&req.require==='exact')envReqs.set(g.name,req);
   else if(req.require==='exact'&&prev.value!==req.value)gates.push({kind:'unsupported'});
  }
  tests.push({name:fn.name,file:fn.file,line:fn.line,
   benchmark:fn.name.startsWith('Benchmark'),
   kinds:[...new Set(gates.map(g=>g.kind))],
   env:[...envReqs.keys()].sort(),
   envRequirements:[...envReqs.values()].sort((a,b)=>a.name.localeCompare(b.name))});
 }
 tests.sort((a,b)=>a.file.localeCompare(b.file)||a.name.localeCompare(b.name));
 return {gated:tests,allNames};
}

export function scanGatedTests(sources){return scanSources(sources).gated}

/** Map of every test function name (gated or not) per directory, for
 * validating manifest `via` parents. */
export function allTestNames(sources){
 const names=new Set();
 for(const {file,text} of sources)for(const fn of parseFunctions(text))
  if(isTestFunction(fn))names.add(`${file}\0${fn.name}`);
 return names;
}

async function collectSources(root){
 const files=[];
 async function walk(dir){
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(entry.name==='work')continue;
   const full=path.join(dir,entry.name);
   if(entry.isDirectory())await walk(full);
   else if(entry.isFile()&&entry.name.endsWith('_test.go'))files.push(full);
  }
 }
 for(const r of SCAN_ROOTS)await walk(path.join(root,r));
 return Promise.all(files.map(async full=>({
  file:path.relative(root,full).split(path.sep).join('/'),text:await readFile(full,'utf8')})));
}

export async function scanTree(root){
 const sources=await collectSources(root);
 return {...scanSources(sources),files:sources.length};
}

/** Short gate summary for docs and messages, e.g. `short+env:STRESS`. */
export function gateLabel(test){
 const parts=[];
 if(test.kinds.includes('short'))parts.push('short');
 if(test.kinds.includes('env'))parts.push(`env${test.env.length?':'+test.env.join(','):''}`);
 if(test.kinds.includes('unsupported'))parts.push('unsupported');
 if(test.benchmark)parts.push('benchmark');
 return parts.join('+')||'unsupported';
}

/** Can lane `name` actually execute this gated test body? */
export function laneCanRun(test,laneName,lanes=LANES){
 const lane=lanes[laneName];
 if(!lane)return {ok:false,reason:`unknown lane '${laneName}'`};
 if(!lane.go)return {ok:false,reason:`lane '${laneName}' runs no Go tests`};
 if(test.benchmark&&!lane.bench)return {ok:false,reason:`lane '${laneName}' passes no -bench flag`};
 if(test.kinds.includes('unsupported'))return {ok:false,reason:`its gate is unsupported, so no lane eligibility can be claimed for '${laneName}'`};
 if(test.kinds.includes('short')&&lane.short)return {ok:false,reason:`lane '${laneName}' runs with -short, so testing.Short() skips it`};
 const missing=test.env.filter(v=>!lane.env.includes(v));
 if(test.kinds.includes('env')&&missing.length)
  return {ok:false,reason:`lane '${laneName}' does not set ${missing.join(', ')}`};
 return {ok:true};
}

const entryKey=e=>`${e.file}\0${e.name}`;

/** Tokenize one shell command, honouring single/double quotes and
 * backslash escapes. Returns {tokens} or {error}. Unquoted shell control
 * operators are rejected: a manual entry is one exact command. */
function tokenizeShell(command){
 const tokens=[];let cur='',has=false,quote=null;
 for(let i=0;i<command.length;i++){
  const c=command[i];
  if(quote==="'"){if(c==="'")quote=null;else cur+=c;continue}
  if(quote==='"'){
   if(c==='"')quote=null;
   else if(c==='\\'&&i+1<command.length&&'"$`\\'.includes(command[i+1]))cur+=command[++i];
   else cur+=c;
   continue;
  }
  if(c==="'"||c==='"'){quote=c;has=true;continue}
  if(c==='\\'){if(i+1<command.length)cur+=command[++i];has=true;continue}
  if(';&|<>'.includes(c))return {error:`contains unquoted shell operator '${c}'`};
  if(/\s/.test(c)){if(has){tokens.push(cur);cur='';has=false}continue}
  cur+=c;has=true;
 }
 if(quote)return {error:'has an unbalanced quote'};
 if(has)tokens.push(cur);
 return {tokens};
}

// Manual commands may use only flags whose effect on test selection is
// modelled here. Anything else (-skip, -exec, -n, -o, -json filters ...)
// could stop the selected test from executing, so it is rejected.
const GO_TEST_ALLOWED_FLAGS=new Set(['run','bench','benchtime','benchmem','count','cpu','parallel','timeout','short','v','race','tags','failfast','p','vet']);
const GO_TEST_VALUE_FLAGS=new Set(['run','bench','benchtime','count','cpu','parallel','timeout','blockprofile','coverprofile','cpuprofile','memprofile','memprofilerate','mutexprofile','mutexprofilefraction','outputdir','trace','testlogfile','fuzz','fuzztime','fuzzminimizetime','list','exec','tags','ldflags','gcflags','asmflags','cover','covermode','coverpkg']);

/** Parse a manual `NAME=value ... go test ...` command structurally:
 * leading env assignments (last one wins), flags, and package patterns.
 * Returns {env:Map, packages:[], run:[], bench:[], short:bool} or {error}.
 * Non-executing forms are rejected: -count=0 (or a non-numeric -count),
 * -list, -c, and -run/-bench given more than once (go test would silently
 * use only the last value, so an earlier matching pattern proves nothing). */
export function parseManualCommand(command){
 const {tokens,error}=tokenizeShell(command);
 if(error)return {error};
 const env=new Map();let i=0;
 while(i<tokens.length){
  const m=/^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(tokens[i]);
  if(!m)break;
  // GOFLAGS, GOOS, GOARCH and friends can add -short or build for a target
  // that does not run here; they are not modelled, so they are rejected.
  if(/^(GO|CGO_)/.test(m[1]))return {error:`sets ${m[1]}, which can change what go test runs`};
  env.set(m[1],m[2]);i++;
 }
 if(tokens[i]!=='go'||tokens[i+1]!=='test')
  return {error:'must give an exact go test command'};
 i+=2;
 const packages=[],run=[],bench=[],count=[];
 let short=false,list=false,compileOnly=false;
 for(;i<tokens.length;i++){
  const token=tokens[i];
  if(!token.startsWith('-')||token==='-'){packages.push(token);continue}
  let flag=token.replace(/^-+/,'').replace(/^test\./,''),value;
  const eq=flag.indexOf('=');
  if(eq>=0){value=flag.slice(eq+1);flag=flag.slice(0,eq)}
  else if(GO_TEST_VALUE_FLAGS.has(flag)){
   if(i+1>=tokens.length)return {error:`flag -${flag} has no value`};
   value=tokens[++i];
  }
  if(!GO_TEST_ALLOWED_FLAGS.has(flag)&&flag!=='list'&&flag!=='c')
   return {error:`uses -${flag}, which is not an allowed manual go test flag`};
  if(flag==='run')run.push(value??'');
  else if(flag==='bench')bench.push(value??'');
  else if(flag==='count')count.push(value??'');
  else if(flag==='list')list=true;
  else if(flag==='c')compileOnly=true;
  else if(flag==='short')short=value===undefined?true:value!=='false';
 }
 if(run.length>1)return {error:'gives -run more than once; go test would use only the last value'};
 if(bench.length>1)return {error:'gives -bench more than once; go test would use only the last value'};
 if(list)return {error:'uses -list, which lists tests without executing them'};
 if(compileOnly)return {error:'uses -c, which compiles the test binary without executing tests'};
 if(count.length){
  const value=count[count.length-1];
  if(!/^\d+$/.test(value))return {error:`has invalid -count value '${value}'`};
  if(+value===0)return {error:'uses -count=0, which executes no tests'};
 }
 return {env,packages,run,bench,short};
}

/** Does a go test package pattern cover the directory holding `file`?
 * Only repo-relative patterns (`./pkg/x/`, `./pkg/...`, `./...`) and `all`
 * can be proven to cover a file; anything else is rejected. */
function packageCoversFile(pattern,file){
 const dir=path.posix.dirname(file);
 if(pattern==='all'||pattern==='...')return true;
 let p=pattern;
 if(p.startsWith('./'))p=p.slice(2);
 else if(!p.startsWith('.')&&p.includes('/'))return false;
 p=p.replace(/\/+$/,'');
 if(p==='.'||p==='')return dir==='.';
 if(p.endsWith('/...')){const prefix=p.slice(0,-4);return prefix===''||dir===prefix||dir.startsWith(prefix+'/')}
 if(p==='...')return true;
 return p===dir;
}

/** Does any -run/-bench regexp select `name`? go test regexps are
 * unanchored, matching JS RegExp.test for the patterns manifests use. */
function patternsSelect(patterns,name){
 for(const pattern of patterns){
  try{if(new RegExp(pattern).test(name))return true}
  catch{return false}
 }
 return false;
}

/** Verify a manifest against scanned gated tests. Manifest shape:
 * {version:1, tests:[{name, file, lane, reason?, via?}]} where lane is
 * 'test' | 'extended' | 'browser' | 'manual: <exact command>'. `via` names
 * a parent test in the same file that re-executes the entry as a child
 * process with the gate env set (the manual command then runs the parent).
 * An `unsupported` gate must use a manual entry with a reason.
 * Returns a list of error strings (empty when clean). */
export function verifyGatedTests({gated,manifest,allNames=new Set(),lanes=LANES}){
 const errors=[];
 if(!manifest||manifest.version!==1||!Array.isArray(manifest.tests)){
  return ['gated-tests manifest must be {version:1, tests:[...]}'];
 }
 const scanned=new Map(gated.map(t=>[entryKey(t),t])),listed=new Map();
 for(const entry of manifest.tests){
  if(!entry||typeof entry.name!=='string'||typeof entry.file!=='string'||typeof entry.lane!=='string'){
   errors.push(`manifest entry needs string name, file and lane: ${JSON.stringify(entry)}`);continue;
  }
  if(listed.has(entryKey(entry)))errors.push(`duplicate manifest entry: ${entry.file} ${entry.name}`);
  listed.set(entryKey(entry),entry);
 }
 for(const test of gated)if(!listed.has(entryKey(test)))
  errors.push(`unlisted gated test: ${test.file}:${test.line} ${test.name} [${gateLabel(test)}] - add it to scripts/gated-tests.json with the lane that runs it`);
 for(const entry of manifest.tests){
  if(!entry||typeof entry.name!=='string')continue;
  const test=scanned.get(entryKey(entry));
  if(!test){errors.push(`stale manifest entry: ${entry.file} ${entry.name} - no such gated test (renamed, removed, or its gate changed)`);continue}
  const manual=entry.lane.startsWith('manual:')?entry.lane.slice('manual:'.length).trim():null;
  if(manual===null){
   const verdict=laneCanRun(test,entry.lane,lanes);
   if(!verdict.ok)errors.push(`lane cannot run gated test: ${entry.file} ${entry.name} [${gateLabel(test)}] claims '${entry.lane}', but ${verdict.reason}`);
   continue;
  }
  if(entry.via!==undefined&&typeof entry.via!=='string')
   errors.push(`manifest entry via must be a string: ${entry.file} ${entry.name}`);
  if(entry.via&&allNames.size&&!allNames.has(`${entry.file}\0${entry.via}`))
   errors.push(`manifest entry via parent not found: ${entry.file} ${entry.name} claims via ${entry.via}, which is not a test in that file`);
  const target=entry.via||entry.name;
  const parsed=parseManualCommand(manual);
  if(parsed.error){
   errors.push(`manual entry ${parsed.error}: ${entry.file} ${entry.name}: ${entry.lane}`);
  }else{
   if(!parsed.packages.some(p=>packageCoversFile(p,entry.file)))
    errors.push(`manual command packages (${parsed.packages.join(' ')||'none'}) do not cover ${path.posix.dirname(entry.file)}: ${entry.file} ${entry.name}: ${entry.lane}`);
   if(test.benchmark&&!entry.via){
    if(!patternsSelect(parsed.bench,target))
     errors.push(`manual command -bench does not select ${target} (a benchmark needs a matching -bench): ${entry.file} ${entry.name}: ${entry.lane}`);
   }else if(!patternsSelect(parsed.run,target)){
    errors.push(`manual command -run does not select ${target}: ${entry.file} ${entry.name}: ${entry.lane}`);
   }
   // Env checks apply only to proven env gates; an unsupported gate's
   // required values are the reason's job to explain.
   if(!entry.via&&test.kinds.includes('env')){
    for(const req of test.envRequirements){
     if(!parsed.env.has(req.name)){
      errors.push(`manual command does not set ${req.name}: ${entry.file} ${entry.name}: ${entry.lane}`);continue;
     }
     const value=parsed.env.get(req.name);
     if(req.require==='exact'&&value!==req.value)
      errors.push(`manual command sets ${req.name}=${value} but the gate requires ${req.name}=${req.value}: ${entry.file} ${entry.name}: ${entry.lane}`);
     else if(req.require==='nonempty'&&value==='')
      errors.push(`manual command sets ${req.name} to an empty value but the gate requires a non-empty ${req.name}: ${entry.file} ${entry.name}: ${entry.lane}`);
    }
   }
   if(test.kinds.includes('short')&&parsed.short)
    errors.push(`manual command uses -short but the test skips under testing.Short(): ${entry.file} ${entry.name}: ${entry.lane}`);
  }
  if(test.kinds.includes('unsupported')&&!entry.reason)
   errors.push(`manual entry with an unsupported gate needs a reason explaining how the command runs it: ${entry.file} ${entry.name} [${gateLabel(test)}]`);
 }
 return errors;
}

/** Markdown table rows for docs/test-lanes.md, generated from scan+manifest. */
export function gatedTable(gated,manifest){
 const listed=new Map((manifest?.tests??[]).map(e=>[entryKey(e),e]));
 const rows=['| Test | File | Gate | Lane |','|---|---|---|---|'];
 for(const test of gated){
  const entry=listed.get(entryKey(test));
  const lane=entry?entry.lane:'(unlisted)';
  rows.push(`| \`${test.name}\` | \`${test.file}\` | ${gateLabel(test)} | ${lane.replaceAll('|','\\|')} |`);
 }
 return rows.join('\n')+'\n';
}

async function main(){
 const args=process.argv.slice(2);
 const get=(name,fallback)=>{const hit=args.find(a=>a.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback};
 const root=path.resolve(get('root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')));
 const manifestPath=path.resolve(root,get('manifest','scripts/gated-tests.json'));
 const started=Date.now();
 const {gated,allNames,files}=await scanTree(root);
 if(args.includes('--json')){console.log(JSON.stringify(gated,null,2));return}
 let manifest=null;
 try{manifest=JSON.parse(await readFile(manifestPath,'utf8'))}
 catch(error){console.error(`gated-tests: cannot read manifest ${manifestPath}: ${error.message}`);process.exitCode=1;return}
 if(args.includes('--table')){process.stdout.write(gatedTable(gated,manifest));return}
 const errors=verifyGatedTests({gated,manifest,allNames});
 console.log(`gated-tests: scanned ${files} *_test.go files under ${SCAN_ROOTS.join(', ')} in ${Date.now()-started} ms; ${gated.length} gated tests; manifest entries: ${manifest.tests?.length??0}`);
 if(errors.length){
  console.error(`gated-tests: ${errors.length} problem(s):`);
  for(const error of errors)console.error(` - ${error}`);
  process.exitCode=1;return;
 }
 console.log('gated-tests: every gated test is listed with a lane that can run it');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(error=>{console.error(`gated-tests: ${error.message}`);process.exitCode=1});
