import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {scanGatedTests,scanTree,verifyGatedTests,gateLabel,parseManualCommand,LANES} from './gated-tests.mjs';
import {goTestArguments} from './package-integrity.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const FILE='pkg/example/example_test.go';

// The scanner proves only two shapes: a top-of-function
// `if testing.Short() { t.Skip(...) }` and a direct
// `if os.Getenv("X") != "v" / == "" { t.Skip(...) }` with no else.
// Everything else that skips under a condition is `unsupported`.
const FIXTURE=`package example

import (
 "os"
 "testing"
)

// 😀 astral comment before a gated test
func TestUnicodeShort(t *testing.T) {
 if testing.Short() {
  t.Skip("long course")
 }
}

func TestPlain(t *testing.T) {}

func TestShortGate(t *testing.T) {
 if testing.Short() {
  t.Skip("long course")
 }
}

func TestEnvEmptyGate(t *testing.T) {
 if os.Getenv("EXAMPLE_INPUT") == "" {
  t.Skip("fixture required")
 }
}

func TestEnvExactGate(t *testing.T) {
 if os.Getenv("EXAMPLE_FLAG") != "1" {
  t.Skip("opt-in")
 }
}

func TestEvidenceOnly(t *testing.T) {
 if dir := os.Getenv("EXAMPLE_EVIDENCE"); dir != "" {
  t.Log(dir)
 }
}

func TestAliasEnvGate(t *testing.T) {
 dir := os.Getenv("EXAMPLE_ALIAS")
 if dir == "" {
  t.Skip("alias")
 }
}

func TestShortAliasGate(t *testing.T) {
 short := testing.Short()
 if short {
  t.Skip("alias short")
 }
}

func TestCompoundGate(t *testing.T) {
 if testing.Short() || os.Getenv("EXAMPLE_FLAG") != "1" {
  t.Skip("compound")
 }
}

func TestElseGate(t *testing.T) {
 if os.Getenv("EXAMPLE_FLAG") == "1" {
  t.Log("on")
 } else {
  t.Skip("opt in")
 }
}

func TestInverseShortGate(t *testing.T) {
 if !testing.Short() {
  t.Skip("inverse")
 }
}

func TestNestedGate(t *testing.T) {
 if os.Getenv("EXAMPLE_FLAG") != "1" {
  if true {
   t.Skip("nested")
  }
 }
}

func requireExample(t *testing.T) {
 t.Helper()
 if os.Getenv("EXAMPLE_HELPER") == "" {
  t.Skip("helper gate")
 }
}

func TestHelperGate(t *testing.T) {
 requireExample(t)
}

func BenchmarkConditional(b *testing.B) {
 if b.N == 0 {
  b.Skip("no work")
 }
}
`;
const scanned=()=>scanGatedTests([{file:FILE,text:FIXTURE}]);
const byName=list=>new Map(list.map(t=>[t.name,t]));
const UNSUPPORTED=['TestAliasEnvGate','TestShortAliasGate','TestCompoundGate','TestElseGate','TestInverseShortGate','TestNestedGate','TestHelperGate'];
const cmd=(name,env='')=>`manual: ${env?env+' ':''}go test -count=1 -run '^${name}$' ./pkg/example/`;
const baseManifest=()=>({version:1,tests:[
 {name:'TestUnicodeShort',file:FILE,lane:'extended'},
 {name:'TestShortGate',file:FILE,lane:'extended'},
 {name:'TestEnvEmptyGate',file:FILE,lane:cmd('TestEnvEmptyGate','EXAMPLE_INPUT=/path/to/input')},
 {name:'TestEnvExactGate',file:FILE,lane:cmd('TestEnvExactGate','EXAMPLE_FLAG=1')},
 {name:'TestAliasEnvGate',file:FILE,lane:cmd('TestAliasEnvGate','EXAMPLE_ALIAS=/path/to/input'),reason:'env gate through a local variable; the command sets EXAMPLE_ALIAS.'},
 {name:'TestShortAliasGate',file:FILE,lane:cmd('TestShortAliasGate'),reason:'local alias of testing.Short(); run without -short.'},
 {name:'TestCompoundGate',file:FILE,lane:cmd('TestCompoundGate','EXAMPLE_FLAG=1'),reason:'compound short/env condition; run without -short with EXAMPLE_FLAG=1.'},
 {name:'TestElseGate',file:FILE,lane:cmd('TestElseGate','EXAMPLE_FLAG=1'),reason:'skip in an else branch; EXAMPLE_FLAG=1 takes the non-skip branch.'},
 {name:'TestInverseShortGate',file:FILE,lane:"manual: go test -count=1 -short -run '^TestInverseShortGate$' ./pkg/example/",reason:'skips under !testing.Short(); run with -short.'},
 {name:'TestNestedGate',file:FILE,lane:cmd('TestNestedGate','EXAMPLE_FLAG=1'),reason:'nested condition; EXAMPLE_FLAG=1 disables the outer gate.'},
 {name:'TestHelperGate',file:FILE,lane:cmd('TestHelperGate','EXAMPLE_HELPER=1'),reason:'gate lives in helper requireExample; the command sets EXAMPLE_HELPER.'},
 {name:'BenchmarkConditional',file:FILE,lane:"manual: go test -count=1 -run '^$' -bench '^BenchmarkConditional$' ./pkg/example/",reason:'benchmark; b.Skip fires only when b.N is 0.'},
]});

test('scanner proves only direct short and env gates; everything else is unsupported',()=>{
 const got=byName(scanned());
 assert.deepEqual([...got.keys()].sort(),
  ['BenchmarkConditional','TestEnvEmptyGate','TestEnvExactGate','TestShortGate','TestUnicodeShort',...UNSUPPORTED].sort());
 // Astral characters before a gate must not shift offsets (r1 finding).
 assert.equal(gateLabel(got.get('TestUnicodeShort')),'short');
 assert.equal(gateLabel(got.get('TestShortGate')),'short');
 assert.equal(gateLabel(got.get('TestEnvEmptyGate')),'env:EXAMPLE_INPUT');
 assert.deepEqual(got.get('TestEnvEmptyGate').envRequirements,[{name:'EXAMPLE_INPUT',require:'nonempty'}]);
 assert.equal(gateLabel(got.get('TestEnvExactGate')),'env:EXAMPLE_FLAG');
 assert.deepEqual(got.get('TestEnvExactGate').envRequirements,[{name:'EXAMPLE_FLAG',require:'exact',value:'1'}]);
 for(const name of UNSUPPORTED)assert.equal(gateLabel(got.get(name)),'unsupported',name);
 assert.equal(gateLabel(got.get('BenchmarkConditional')),'unsupported+benchmark');
 assert.equal(got.has('TestPlain'),false);
 assert.equal(got.has('TestEvidenceOnly'),false);
});
test('a complete honest manifest is accepted',()=>{
 assert.deepEqual(verifyGatedTests({gated:scanned(),manifest:baseManifest()}),[]);
});
test('an unlisted gated test and a stale entry are flagged',()=>{
 const unlisted=baseManifest();unlisted.tests=unlisted.tests.filter(e=>e.name!=='TestEnvExactGate');
 assert.ok(verifyGatedTests({gated:scanned(),manifest:unlisted})
  .some(e=>e.includes('unlisted gated test')&&e.includes('TestEnvExactGate')));
 const stale=baseManifest();stale.tests.push({name:'TestRemoved',file:FILE,lane:'extended'});
 assert.ok(verifyGatedTests({gated:scanned(),manifest:stale})
  .some(e=>e.includes('stale manifest entry')&&e.includes('TestRemoved')));
});
test('entries claiming a lane that cannot run them are rejected',()=>{
 const claim=(name,lane,dropReason=false)=>{const manifest=baseManifest();const entry=manifest.tests.find(e=>e.name===name);entry.lane=lane;if(dropReason)delete entry.reason;return verifyGatedTests({gated:scanned(),manifest})};
 assert.ok(claim('TestEnvEmptyGate','extended').some(e=>e.includes('does not set EXAMPLE_INPUT')));
 assert.ok(claim('TestEnvEmptyGate','browser').some(e=>e.includes('runs no Go tests')));
 assert.ok(claim('TestShortGate','test').some(e=>e.includes('-short')));
 assert.ok(claim('TestShortGate',"manual: go test -count=1 -short -run '^TestShortGate$' ./pkg/example/").some(e=>e.includes('uses -short')));
 // r2 findings 1 and 2: else branches and Short aliases are unsupported,
 // so no automated lane may claim them (extended skips the else gate;
 // the default lane's -short skips the aliased short gate).
 assert.ok(claim('TestElseGate','extended').some(e=>e.includes('unsupported')));
 assert.ok(claim('TestShortAliasGate','test').some(e=>e.includes('unsupported')));
 assert.ok(claim('TestAliasEnvGate','extended').some(e=>e.includes('unsupported')));
 assert.ok(claim('TestHelperGate','extended').some(e=>e.includes('unsupported')));
 // An unsupported gate needs a manual entry with a reason.
 assert.ok(claim('TestElseGate',cmd('TestElseGate','EXAMPLE_FLAG=1'),true).some(e=>e.includes('needs a reason')));
});
test('manual commands are validated for gate values, package, selection and execution',()=>{
 const gated=scanned();
 const claim=lane=>{const manifest=baseManifest();manifest.tests.find(e=>e.name==='TestEnvExactGate').lane=lane;return verifyGatedTests({gated,manifest})};
 const good=value=>`manual: EXAMPLE_FLAG=${value} go test -count=1 -run '^TestEnvExactGate$' ./pkg/example/`;
 const rejects=[
  // A value the gate still skips on, and a missing variable.
  [good('0'),'sets EXAMPLE_FLAG=0 but the gate requires EXAMPLE_FLAG=1'],
  ["manual: go test -count=1 -run '^TestEnvExactGate$' ./pkg/example/",'does not set EXAMPLE_FLAG'],
  // The right value and selection, in the wrong package.
  ["manual: EXAMPLE_FLAG=1 go test -count=1 -run '^TestEnvExactGate$' ./protocol/",'do not cover pkg/example'],
  // A -run pattern that selects a different test.
  ["manual: EXAMPLE_FLAG=1 go test -count=1 -run '^TestOther$' ./pkg/example/",'-run does not select TestEnvExactGate'],
  // r2 finding 3: non-executing forms.
  ["manual: EXAMPLE_FLAG=1 go test -count=0 -run '^TestEnvExactGate$' ./pkg/example/",'uses -count=0, which executes no tests'],
  ["manual: EXAMPLE_FLAG=1 go test -count=1 -list '^TestEnvExactGate$' ./pkg/example/",'uses -list, which lists'],
  ["manual: EXAMPLE_FLAG=1 go test -c -run '^TestEnvExactGate$' ./pkg/example/",'uses -c'],
  // -run given twice is rejected even when one pattern would match:
  // go test would use only the last value.
  ["manual: EXAMPLE_FLAG=1 go test -count=1 -run '^TestEnvExactGate$' -run '^TestOther$' ./pkg/example/",'-run more than once'],
  ["manual: EXAMPLE_FLAG=1 go test -count=1 -run '^TestOther$' -run '^TestEnvExactGate$' ./pkg/example/",'-run more than once'],
  // r3 finding 2: exclusion flags, exec wrappers and GOFLAGS are not modelled.
  ["manual: EXAMPLE_FLAG=1 go test -count=1 -run '^TestEnvExactGate$' -skip='^TestEnvExactGate$' ./pkg/example/",'uses -skip'],
  ["manual: EXAMPLE_FLAG=1 go test -count=1 -exec=true -run '^TestEnvExactGate$' ./pkg/example/",'uses -exec'],
  ["manual: EXAMPLE_FLAG=1 go test -count=1 -exec true -run '^TestEnvExactGate$' ./pkg/example/",'uses -exec'],
  ["manual: EXAMPLE_FLAG=1 GOFLAGS=-short go test -count=1 -run '^TestEnvExactGate$' ./pkg/example/",'sets GOFLAGS'],
 ];
 for(const [lane,needle] of rejects)
  assert.ok(claim(lane).some(e=>e.includes(needle)),`${lane} should mention ${needle}:\n${claim(lane).join('\n')}`);
 assert.deepEqual(claim(good('1')),[]);
 // The parser itself models effective values and rejects dup -bench too.
 assert.match(parseManualCommand('go test -count=1 -bench A -bench B ./pkg/example/').error??'',/-bench more than once/);
 const parsed=parseManualCommand("EXAMPLE_FLAG=1 go test -count=1 -run '^TestEnvExactGate$' ./pkg/example/");
 assert.equal(parsed.env.get('EXAMPLE_FLAG'),'1');
 assert.deepEqual(parsed.packages,['./pkg/example/']);
 assert.deepEqual(parsed.run,['^TestEnvExactGate$']);
});
test('lane facts match goTestArguments and the local.mjs test lane runs this check',async()=>{
 assert.equal(LANES.test.short,goTestArguments().includes('-short'));
 assert.equal(LANES.extended.short,goTestArguments(true).includes('-short'));
 assert.equal(LANES.browser.go,false);
 const source=await readFile(new URL('local.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("run(process.execPath,['scripts/gated-tests.mjs'])"));
 assert.ok(source.includes("'scripts/gated-tests.test.mjs'"));
});
test('the real tree matches the checked-in manifest',async()=>{
 const {gated,allNames,files}=await scanTree(root);
 const manifest=JSON.parse(await readFile(path.join(root,'scripts/gated-tests.json'),'utf8'));
 assert.ok(files>0&&gated.length>0);
 assert.deepEqual(verifyGatedTests({gated,manifest,allNames}),[]);
});

test('conflicting env requirements and long helper chains are unsupported, not dropped',()=>{
 const chain=Array.from({length:13},(_,i)=>`func h${i}(t *testing.T) { ${i===12?'if os.Getenv("X") == "" { t.Skip("x") }':`h${i+1}(t)`} }`).join('\n');
 const text=`package example

import (
 "os"
 "testing"
)

func TestConflictingEnv(t *testing.T) {
 if os.Getenv("FLAG") != "1" {
  t.Skip("one")
 }
 if os.Getenv("FLAG") != "2" {
  t.Skip("two")
 }
}

func TestAgreeingEnv(t *testing.T) {
 if os.Getenv("FLAG") == "" {
  t.Skip("set")
 }
 if os.Getenv("FLAG") != "1" {
  t.Skip("one")
 }
}

${chain}

func TestLongChain(t *testing.T) {
 h0(t)
}
`;
 const got=byName(scanGatedTests([{file:FILE,text}]));
 assert.match(gateLabel(got.get('TestConflictingEnv')),/unsupported/);
 assert.ok(got.get('TestConflictingEnv').kinds.includes('unsupported'));
 assert.deepEqual(got.get('TestAgreeingEnv').envRequirements,[{name:'FLAG',require:'exact',value:'1'}]);
 assert.ok(got.has('TestLongChain'),'a 13-helper chain must still mark its caller');
 assert.equal(gateLabel(got.get('TestLongChain')),'unsupported');
});
