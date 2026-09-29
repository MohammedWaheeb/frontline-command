#!/usr/bin/env python3
"""Serial, bounded integration checks. No host/WASM build or mission matrix."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SOURCE = HERE / 'source'
GO = '/opt/homebrew/bin/go'
ENV = {k: v for k, v in os.environ.items() if not k.startswith('FRONTLINE_')}
ENV['GOMAXPROCS'] = '1'
ENV['GOFLAGS'] = '-p=1'
LOCK = '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify():
    assert sha(HERE / 'source-lock.json') == LOCK
    expected = json.loads((HERE / 'source-lock.json').read_text())['files']
    actual = {str(p.relative_to(SOURCE)): sha(p) for p in sorted(SOURCE.rglob('*')) if p.is_file()}
    assert actual == expected, 'isolated source drift'
    for directory, digest in [('navigation-lookup-candidate', 'c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122'),
                              ('runtime-034-observer-reboard', '757b31785a0c0b869cca06ad01299ef199fd124989e722dce559c2919dddab8d')]:
        base = ROOT / 'work' / directory
        assert sha(base / 'source-lock.json') == digest
        files = json.loads((base / 'source-lock.json').read_text())['files']
        assert {str(p.relative_to(base / 'source')): sha(p) for p in (base / 'source').rglob('*') if p.is_file()} == files
    inventory = json.loads((HERE / 'inputs/selective-files.json').read_text())
    for entry in inventory['changed_or_added']:
        live = ROOT / entry['path']
        assert (sha(live) if live.is_file() else None) == entry['live_sha256'], str(live)

def names(paths):
    return sorted({name for path in paths for name in re.findall(r'^func (Test\w+)\(t \*testing.T\)', path.read_text(), re.M)})

sim_files = ['service_boarding_test.go', 'service_parking_boundary_test.go',
             'service_parking_invariants_test.go', 'service_parking_candidate_test.go',
             'service_parking_mission_test.go', 'combat_feedback_test.go',
             'owner_casualty_test.go', 'owner_ranges_test.go', 'navigation_lookup_test.go',
             'strategic_preview_test.go', 'tactical_view_test.go']
sim_tests = [n for n in names([SOURCE / 'pkg/sim' / f for f in sim_files]) if 'Dense' not in n]
assert not any('AuthoredCampaign' in n or 'Optional' in n or 'Maximum' in n for n in sim_tests)
adapters = ['TestSnapshotMatchesPriorJSONContract', 'TestOptionalZeroPresenceAndAbsentPrivate',
            'TestCombatFeedbackCodecPresenceAndLegacy', 'TestTacticalOptionalWirePresence',
            'TestMissionOriginProtocolSnapshotAndOwnershipDelta',
            'TestCommandAdviceUsesSlotAuthenticationAndNeverChangesMatch',
            'TestCommandAdviceRateAndInFlightBounds', 'TestCommandAdviceSkybreakerOwnerPlan',
            'TestAdviceDoesNotConsumeGeneralWriteAdmission']
selection = dict(sim=sim_tests, adapters=adapters,
                 excluded=['all long main/optional/skirmish matrices', 'maximum/dense timing diagnostics',
                           'environment-dependent actual-save codec tests (require separate artifact stage)'])
(HERE / 'race-selection.json').write_text(json.dumps(selection, indent=2) + '\n')
verify()
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
OUT = HERE / 'checks' / stamp
OUT.mkdir(parents=True, exist_ok=False)
receipt = dict(source_lock_sha256=LOCK, started_utc=stamp,
               conditions='GOMAXPROCS=1, package/compiler parallelism1, serial jobs; root browser and Blender may be active. Correctness only, not timing/performance qualification.',
               stages=[], selected_race_tests=selection)

def save():
    (OUT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')

def run(stage, command, cwd=SOURCE):
    verify()
    log = OUT / (stage + '.log')
    start = time.monotonic()
    with log.open('w') as output:
        result = subprocess.run(command, cwd=cwd, env=ENV, stdout=output, stderr=subprocess.STDOUT)
    item = dict(stage=stage, command=command, cwd=str(cwd), exit_code=result.returncode,
                elapsed_seconds=round(time.monotonic()-start, 3), log_sha256=sha(log))
    receipt['stages'].append(item)
    save()
    print(stage, 'PASS' if result.returncode == 0 else 'FAIL', item['elapsed_seconds'], flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
    verify()

run('toolchain-go', [GO, 'version'])
run('toolchain-protoc', ['/opt/homebrew/bin/protoc', '--version'])
run('toolchain-protoc-go', ['/Users/mohammedkalouti/go/bin/protoc-gen-go', '--version'])
run('toolchain-protoc-es', [str(ROOT / 'client/node_modules/.bin/protoc-gen-es'), '--version'])
assert 'go1.27.1 darwin/arm64' in (OUT/'toolchain-go.log').read_text()
assert (OUT/'toolchain-protoc.log').read_text().strip() == 'libprotoc 36.2'
assert 'v1.36.12' in (OUT/'toolchain-protoc-go.log').read_text()
assert 'v2.15.0' in (OUT/'toolchain-protoc-es.log').read_text()
run('generate-go-protobuf', ['/opt/homebrew/bin/protoc', '-I', 'protocol',
                            '--plugin=protoc-gen-go=/Users/mohammedkalouti/go/bin/protoc-gen-go',
                            '--go_out=protocol', '--go_opt=paths=source_relative', 'protocol/frontline.proto'])
run('generate-ts-protobuf', ['/opt/homebrew/bin/protoc', '-I', 'protocol',
                            '--plugin=protoc-gen-es=' + str(ROOT / 'client/node_modules/.bin/protoc-gen-es'),
                            '--es_out=client/src/protocol', '--es_opt=target=ts', 'protocol/frontline.proto'])
run('generate-viewproto', [GO, 'generate', './internal/viewproto'])
run('check-viewproto', [GO, 'run', './gen', '-check'], SOURCE / 'internal/viewproto')
run('all-package-short', [GO, 'test', '-p=1', './...', '-short', '-count=1', '-timeout=20m', '-json'])
run('all-package-vet', [GO, 'vet', '-p=1', './...'])
run('bounded-sim-race', [GO, 'test', '-p=1', '-race', './pkg/sim', '-short', '-count=1', '-timeout=20m',
                       '-run', '^('+'|'.join(sim_tests)+')$', '-json'])
run('bounded-adapter-race', [GO, 'test', '-p=1', '-race', './internal/viewproto', './cmd/wasm', './internal/server',
                           '-short', '-count=1', '-timeout=10m', '-run', '^('+'|'.join(adapters)+')$', '-json'])
verify()
receipt['source_and_prior_locks_verified_after'] = True
receipt['shipping_inventory_verified_after'] = True
receipt['result'] = 'passed'
save()
print(OUT, flush=True)
