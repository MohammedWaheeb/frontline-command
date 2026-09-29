#!/usr/bin/env python3
"""Read-only audit of the completed isolated artifact transaction; no Go runs."""
import hashlib
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = Path(sys.argv[1]).resolve()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

receipt = json.loads((OUT / 'receipt.json').read_text())
assert receipt['status'] == 'passed'
assert sha(OUT / 'source-lock.json') == receipt['source_lock_sha256']
locked = json.loads((OUT / 'source-lock.json').read_text())['files']
assert {str(p.relative_to(HERE/'source')):sha(p) for p in (HERE/'source').rglob('*') if p.is_file()} == locked
for collection in ('shipping_inputs', 'prior_runtime'):
    base = ROOT if collection == 'shipping_inputs' else ROOT/'work/navigation-lookup-candidate/runtime'
    assert {name:sha(base/name) for name in receipt[collection]} == receipt[collection]
for collection in ('worker_inputs', 'orchestration_inputs'):
    assert {name:sha(OUT/'inputs'/name) for name in receipt[collection]} == receipt[collection]

tests = {}
for stage in receipt['stages']:
    assert stage['exit_code'] == 0
    log = OUT/'logs'/(stage['stage']+'.log')
    assert sha(log) == stage['log_sha256']
    if 'selected_passed' not in stage:
        continue
    events = []
    for line in log.read_text().splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    terminal = {e['Test']:e['Action'] for e in events if e.get('Test') in stage['selected_passed'] and e.get('Action') in ('pass','fail','skip')}
    assert terminal == dict.fromkeys(stage['selected_passed'], 'pass')
    tests[stage['stage']] = len(terminal)
for name, entry in receipt['files'].items():
    path = OUT/'runtime'/name
    assert sha(path) == entry['sha256'] and path.stat().st_size == entry['bytes']
for target in ('native','wasm'):
    base = OUT/'fixtures'/target
    assert {str(p.relative_to(base)):sha(p) for p in base.rglob('*') if p.is_file()} == receipt['fixture_files_equal']
assert len(receipt['fixture_files_equal']) == 73
for name, entry in receipt['codec_parity'].items():
    for target in ('native-adapter','native-host','wasm-adapter'):
        p = OUT/'parity'/target/(name+'.json')
        assert sha(p) == entry['sha256'] and len(json.loads(p.read_text())) == entry['records']
assert sum(x['records'] for x in receipt['codec_parity'].values()) == 40
native = OUT/'parity/native-adapter/service'
wasm = OUT/'parity/wasm-adapter/service'
assert {p.name:sha(p) for p in native.glob('*.json')} == {p.name:sha(p) for p in wasm.glob('*.json')}
actual = json.loads((OUT/'parity/production-wasm.json').read_text())
assert actual['status'] == 'passed' and actual['goExited']
assert actual['version'] == {**receipt['version'], 'tick_rate':20}
assert len(actual['cases']) == 6
for case in actual['cases']:
    assert case == json.loads((native/(case['scene']+'.json')).read_text())
oracle = (OUT/'logs/actual-save-json-oracle.log').read_text()
assert '29 exact Go saves, 58 player views, detached wire parity' in oracle

# Worker code is unchanged. Only esbuild's path comments and sourcemap paths
# differ because inputs now live in a fresh output directory.
old = ROOT/'work/navigation-lookup-candidate/runtime'
worker = OUT/'runtime/worker.js'
normalize = lambda s: re.sub(r'^  // work/(?:navigation-lookup-candidate/runtime-input|runtime-034-integrated-source/runtime-builds/\d{8}T\d{6}Z/inputs)/(errors|worker)\.ts$', r'  // frozen-input/\1.ts', s, flags=re.M)
assert normalize(worker.read_text()) == normalize((old/'worker.js').read_text())
newmap = json.loads((OUT/'runtime/worker.js.map').read_text())
oldmap = json.loads((old/'worker.js.map').read_text())
assert [Path(p).name for p in newmap['sources']] == [Path(p).name for p in oldmap['sources']]
assert {k:v for k,v in newmap.items() if k != 'sources'} == {k:v for k,v in oldmap.items() if k != 'sources'}
result = dict(status='passed', source_lock_sha256=receipt['source_lock_sha256'], receipt_sha256=sha(OUT/'receipt.json'),
              selected_tests=tests, native_wasm_fixture_files=73, codec_records_per_target=40,
              actual_save_oracle=dict(saves=29, player_views=58), production_wasm_service_scenes=6,
              actual_wasm_api_version=actual['version'], worker_executable_code_equals_prior=True,
              worker_source_map_differs_only_source_paths=True, binaries_byte_identical_to_prior=False,
              limitation='No browser, HTTP host journey, product pack, offline, timing or release qualification. Binary byte identity is not claimed; native VCS metadata differs.',
              shipping_unchanged=True, prior_runtime_unchanged=True, frozen_source_unchanged=True)
(OUT/'audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
