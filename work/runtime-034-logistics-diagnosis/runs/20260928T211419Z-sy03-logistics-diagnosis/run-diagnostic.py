#!/usr/bin/env python3
"""One exact SY03 failed-trace diagnostic, only after the parent releases the host."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import platform
import shutil
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--execute-after-release', action='store_true')
args = parser.parse_args()
if not args.execute_after_release:
    parser.error('Do not execute during the multiplayer quiet window.')

root = Path(__file__).resolve().parent
source = root / 'source'
expected_lock = '9fc013a3a9d130b2b345050369b6ee29e05d1df9c220b33519719e4c998b4814'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


assert sha(root / 'source-lock.json') == expected_lock
files = json.loads((root / 'source-lock.json').read_text())['files']


def verify():
    actual = {str(p.relative_to(source)): sha(p)
              for p in sorted(source.rglob('*')) if p.is_file()}
    return actual == files


assert verify()
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out = root / 'runs' / (stamp + '-sy03-logistics-diagnosis')
out.mkdir(parents=True, exist_ok=False)
for name in ['source-lock.json', 'source-delta.json', 'driver.diff', 'run-diagnostic.py']:
    shutil.copyfile(root / name, out / name)
binary = out / 'sim.test'
env = {k: v for k, v in os.environ.items()
       if not k.startswith('FRONTLINE_FATAL_')
       and k not in ['FRONTLINE_TEST_FATAL_DIAGNOSTICS',
                    'FRONTLINE_MISSION_CHECKPOINTS', 'FRONTLINE_MISSION_EVIDENCE']}
env.update(GOMAXPROCS='2', FRONTLINE_MISSION_EVIDENCE=str(out / 'evidence'))
receipt = {
    'scope': 'Exact failed SY03 accepted-command replay with authorized-view progress diagnosis',
    'simulation': '0.3.4',
    'source_lock_sha256': expected_lock,
    'base_source_lock_sha256': '73bdd6126bd0ca14e6eace4899f4ba0cd2b24dd8e6cbbe81cfe29e27eafc1889',
    'host': platform.platform(),
    'host_conditions': 'GOMAXPROCS=2, serial native correctness tests; shared desktop, no performance claim',
    'started': now(), 'status': 'running', 'stages': [],
}


def record():
    (out / 'run.json').write_text(json.dumps(receipt, indent=2) + '\n')


def run_stage(name, command, cwd):
    start = time.monotonic()
    stage = {'name': name, 'command': command, 'cwd': str(cwd), 'started': now()}
    receipt['stages'].append(stage)
    record()
    with (out / (name + '.log')).open('w') as log:
        result = subprocess.run(command, cwd=cwd, env=env,
                                stdout=log, stderr=subprocess.STDOUT)
    stage.update(exit_code=result.returncode, elapsed_seconds=round(time.monotonic() - start, 3),
                 completed=now())
    record()
    print(name, result.returncode, stage['elapsed_seconds'], flush=True)
    return result.returncode


record()
print(out, flush=True)
code = run_stage('build', ['go', 'test', '-p=1', '-c', '-o', str(binary), './pkg/sim'], source)
if code == 0:
    receipt['binary_sha256'] = sha(binary)
    env.update(FRONTLINE_TERRITORY_LEDGER=str(root.parent / 'runtime-034-territory-logistics-v2/runs/20260928T211109Z-sy03-hard-observed-logistics/evidence/sy-03-three-crossings-SY-hard.fatal-2389239087/driver-orders.json'), FRONTLINE_TERRITORY_DIAGNOSTIC=str(out / 'evidence'))
    code = run_stage('diagnostic', [str(binary), '-test.run=^TestAuthoredProgressDiagnosis$', '-test.count=1', '-test.timeout=10m', '-test.v'], source / 'pkg/sim')
receipt.update(status='passed' if code == 0 else 'failed', exit_code=code, completed=now(),
               source_verified_after=verify())
if binary.exists():
    receipt['binary_verified_after'] = sha(binary) == receipt.get('binary_sha256')
receipt['artifacts'] = {
    str(p.relative_to(out)): {'bytes': p.stat().st_size, 'sha256': sha(p)}
    for p in sorted((out / 'evidence').rglob('*')) if p.is_file()
}
record()
print(json.dumps({k: v for k, v in receipt.items() if k != 'artifacts'}, indent=2), flush=True)
assert receipt['source_verified_after']
if code == 0:
    assert receipt['binary_verified_after']
raise SystemExit(code)
