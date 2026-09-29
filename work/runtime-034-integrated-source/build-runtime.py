#!/usr/bin/env python3
"""Authorized serial isolated production artifact build and real codec parity."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import traceback

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SOURCE = HERE / 'source'
GO = '/opt/homebrew/bin/go'
LOCK = '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
EXPECTED_CONTENT = '318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612'
ENV = {k: v for k, v in os.environ.items() if not k.startswith('FRONTLINE_') and k not in ('GOOS', 'GOARCH')}
ENV.update(GOMAXPROCS='1', GOFLAGS='-p=1')
OLD = ROOT / 'work/navigation-lookup-candidate'
old = json.loads((OLD / 'runtime-build-receipt.json').read_text())
source_lock = json.loads((HERE / 'source-lock.json').read_text())['files']

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

shipping = {str(p.relative_to(ROOT)): sha(p) for p in (ROOT / 'client/public/runtime').rglob('*') if p.is_file()}
shipping['client/src/protocol/frontline_pb.ts'] = sha(ROOT / 'client/src/protocol/frontline_pb.ts')
original_runtime = {name: sha(OLD / 'runtime' / name) for name in old['files']}

def verify():
    assert sha(HERE / 'source-lock.json') == LOCK
    assert {str(p.relative_to(SOURCE)): sha(p) for p in SOURCE.rglob('*') if p.is_file()} == source_lock
    assert {name: sha(ROOT / name) for name in shipping} == shipping
    assert {name: sha(OLD / 'runtime' / name) for name in original_runtime} == original_runtime

verify()
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
OUT = HERE / 'runtime-builds' / stamp
OUT.mkdir(parents=True, exist_ok=False)
RUNTIME = OUT / 'runtime'
(RUNTIME / 'bin').mkdir(parents=True)
(OUT / 'inputs').mkdir()
(OUT / 'logs').mkdir()
shutil.copy2(HERE / 'source-lock.json', OUT / 'source-lock.json')
receipt = dict(source_lock_sha256=LOCK, started=stamp, stages=[], status='running',
               conditions='Serial GOMAXPROCS1 and Go package/compiler parallelism1. Root browser and Blender may run; correctness only, no performance claim.',
               shipping_inputs=shipping, prior_runtime=original_runtime, worker_inputs={}, files={})
receipt['orchestration_inputs'] = {}
for name in ('build-runtime.py', 'build-worker.mjs', 'production-wasm-parity.mjs'):
    shutil.copy2(HERE / name, OUT / 'inputs' / name)
    receipt['orchestration_inputs'][name] = sha(HERE / name)
receipt['wasm_build_info'] = 'go version -m does not support the WASM file format. Use pinned build command, output digest and the actual production WASM session/version parity below.'

def save():
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')

def failure(exc_type, value, stack):
    receipt.update(status='failed', failure=''.join(traceback.format_exception(exc_type, value, stack)))
    save()
    sys.__excepthook__(exc_type, value, stack)

sys.excepthook = failure

def run(name, command, cwd=SOURCE, extra=None, expected=None):
    verify()
    env = dict(ENV)
    env.update(extra or {})
    log = OUT / 'logs' / (name + '.log')
    started = time.monotonic()
    with log.open('w') as stream:
        process = subprocess.run(command, cwd=cwd, env=env, stdout=stream, stderr=subprocess.STDOUT)
    row = dict(stage=name, command=[str(x) for x in command], cwd=str(cwd), environment=extra or {}, exit_code=process.returncode,
               seconds=round(time.monotonic()-started, 3), log_sha256=sha(log))
    receipt['stages'].append(row)
    save()
    print(name, 'PASS' if process.returncode == 0 else 'FAIL', flush=True)
    if process.returncode:
        receipt['status'] = 'failed';save();raise SystemExit(process.returncode)
    if expected:
        found = {}
        for line in log.read_text().splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get('Test') in expected and event.get('Action') in ('pass', 'skip', 'fail'):
                found[event['Test']] = event['Action']
        assert found == dict.fromkeys(expected, 'pass'), (name, found, expected)
        row['selected_passed'] = sorted(found)
        save()
    verify()
    return log.read_text()

def tests(name, package, names, extra):
    return run(name, [GO, 'test', '-p=1', package, '-count=1', '-timeout=20m', '-json', '-run', '^('+'|'.join(names)+')$'], extra=extra, expected=names)

assert 'go1.27.1 darwin/arm64' in run('toolchain-go', [GO, 'version'])
assert run('toolchain-protoc', ['/opt/homebrew/bin/protoc', '--version']).strip() == 'libprotoc 36.2'
assert 'v1.36.12' in run('toolchain-go-plugin', ['/Users/mohammedkalouti/go/bin/protoc-gen-go', '--version'])
assert 'v2.15.0' in run('toolchain-es-plugin', [str(ROOT / 'client/node_modules/.bin/protoc-gen-es'), '--version'])
run('generate-go', ['/opt/homebrew/bin/protoc', '-I', 'protocol', '--plugin=protoc-gen-go=/Users/mohammedkalouti/go/bin/protoc-gen-go', '--go_out=protocol', '--go_opt=paths=source_relative', 'protocol/frontline.proto'])
run('generate-ts', ['/opt/homebrew/bin/protoc', '-I', 'protocol', '--plugin=protoc-gen-es='+str(ROOT/'client/node_modules/.bin/protoc-gen-es'), '--es_out=client/src/protocol', '--es_opt=target=ts', 'protocol/frontline.proto'])
run('generate-viewproto', [GO, 'generate', './internal/viewproto'])
run('check-viewproto', [GO, 'run', './gen', '-check'], SOURCE / 'internal/viewproto')
for name in ('worker.ts', 'errors.ts', 'types.ts'):
    source = ROOT / 'client/src/runtime' / name
    assert sha(source) == old['worker_inputs'][name], 'worker changed; capture/review needed'
    shutil.copy2(source, OUT / 'inputs' / name)
    receipt['worker_inputs'][name] = sha(source)
run('build-wasm', [GO, 'build', '-trimpath', '-o', str(RUNTIME/'frontline.wasm'), './cmd/wasm'], extra=dict(GOOS='js', GOARCH='wasm'))
run('build-native-adapter', [GO, 'build', '-trimpath', '-o', str(RUNTIME/'bin/runtime-native'), './cmd/wasm'])
run('build-native-host', [GO, 'build', '-trimpath', '-o', str(RUNTIME/'bin/frontline-host'), './cmd/frontline'])
goroot = Path(run('goroot', [GO, 'env', 'GOROOT']).strip())
shutil.copy2(goroot/'lib/wasm/wasm_exec.js', RUNTIME/'wasm_exec.js')
version = json.loads(run('artifact-version', [str(RUNTIME/'bin/runtime-native'), '-version']))
assert version == dict(adapter='1', content_hash=EXPECTED_CONTENT, go='go1.27.1', protocol=1, simulation='0.3.4')
receipt['version'] = version
(RUNTIME/'version.json').write_text(json.dumps(version, indent=2)+'\n')
shutil.copy2(SOURCE/'client/src/protocol/frontline_pb.ts', RUNTIME/'frontline_pb.ts')
run('build-worker', ['node', str(HERE/'build-worker.mjs'), str(OUT)], ROOT)
for name in ('bin/runtime-native', 'bin/frontline-host'):
    run('build-info-'+name.replace('/', '-'), [GO, 'version', '-m', str(RUNTIME/name)])
for name in old['files']:
    p = RUNTIME/name
    receipt['files'][name] = dict(bytes=p.stat().st_size, sha256=sha(p), equals_prior=sha(p)==old['files'][name]['sha256'])
save()

sim_names = ['TestCandidateServiceActualReturnsAndNativeScenes']
for filename in ('combat_feedback_test.go','owner_casualty_test.go','owner_ranges_test.go','tactical_view_test.go'):
    sim_names += re.findall(r'^func (Test\w+)\(t \*testing.T\)', (SOURCE/'pkg/sim'/filename).read_text(), re.M)
fixture_sets = {}
for target in ('native', 'wasm'):
    directory = OUT/'fixtures'/target
    for folder in ('service', 'combat', 'tactical'):
        (directory/folder).mkdir(parents=True)
    extra = dict(FRONTLINE_SERVICE_SCENES=str(directory/'service'), FRONTLINE_COMBAT_OUTPUT=str(directory/'combat'), FRONTLINE_TACTICAL_VIEW_DIR=str(directory/'tactical'))
    if target == 'wasm':
        extra.update(GOOS='js', GOARCH='wasm')
        # go test discovers the pinned toolchain's matching execution wrapper.
        extra['PATH'] = str(goroot/'lib/wasm')+os.pathsep+ENV['PATH']
    tests('fixtures-'+target, './pkg/sim', sim_names, extra)
    fixture_sets[target] = {str(p.relative_to(directory)):sha(p) for p in directory.rglob('*') if p.is_file()}
assert fixture_sets['native'] == fixture_sets['wasm'], 'native/WASM fixture drift'
receipt['fixture_files_equal'] = fixture_sets['native'];save()

codec_names = ['TestCombatFeedbackCodecActualAuthorizedOutputs', 'TestOwnerCasualtyActualCodec', 'TestOwnerRangesActualCodec']
for target, package in (('native-adapter','./cmd/wasm'), ('native-host','./internal/server'), ('wasm-adapter','./cmd/wasm')):
    directory = OUT/'parity'/target;directory.mkdir(parents=True)
    extra = {}
    for prefix in ('COMBAT','CASUALTY','RANGES'):
        extra['FRONTLINE_'+prefix+'_INPUT'] = str(OUT/'fixtures/native/combat')
        extra['FRONTLINE_'+prefix+'_CODEC_OUTPUT'] = str(directory/(prefix.lower()+'.json'))
    names = list(codec_names)
    if 'adapter' in target:
        names.append('TestCandidateServiceSessionAdapterParity')
        extra.update(FRONTLINE_SERVICE_INPUT=str(OUT/'fixtures/native/service'), FRONTLINE_SERVICE_ADAPTER_OUTPUT=str(directory/'service'))
    if target == 'wasm-adapter':
        extra.update(GOOS='js', GOARCH='wasm', PATH=str(goroot/'lib/wasm')+os.pathsep+ENV['PATH'])
    tests('codec-'+target, package, names, extra)
for name in ('combat','casualty','ranges'):
    paths = [OUT/'parity'/target/(name+'.json') for target in ('native-adapter','native-host','wasm-adapter')]
    assert len({sha(p) for p in paths}) == 1, name+' codec drift'
    receipt.setdefault('codec_parity', {})[name] = dict(sha256=sha(paths[0]), records=len(json.loads(paths[0].read_text())))
assert {p.name:sha(p) for p in (OUT/'parity/native-adapter/service').glob('*.json')} == {p.name:sha(p) for p in (OUT/'parity/wasm-adapter/service').glob('*.json')}
tests('actual-save-json-oracle', './internal/viewproto', ['TestActualGoSavedViewsMatchJSON'], dict(FRONTLINE_SNAPSHOT_SAVE_DIRS=os.pathsep.join(str(OUT/'fixtures/native'/name) for name in ('service','combat','tactical'))))
run('actual-production-wasm-parity', ['node', str(HERE/'production-wasm-parity.mjs'), str(OUT)], ROOT)
verify()
receipt.update(status='passed', shipping_unchanged=True, prior_runtime_unchanged=True, source_verified_after=True, finished=datetime.datetime.now(datetime.timezone.utc).isoformat())
save()
print(OUT, flush=True)
