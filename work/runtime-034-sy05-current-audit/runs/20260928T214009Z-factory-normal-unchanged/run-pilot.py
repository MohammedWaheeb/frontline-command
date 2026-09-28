#!/usr/bin/env python3
"""Unchanged current SY05 Normal optional audit using a verified existing binary."""
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
origin = root.parent / 'runtime-034-territory-perimeter'
source = origin / 'source'
expected_lock = 'cd82f1e43a109a01a5ee1f5919bd78c58a261442c25012a4e7fc1b2d780238b6'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


assert sha(origin / 'source-lock.json') == expected_lock
files = json.loads((origin / 'source-lock.json').read_text())['files']


def verify():
    actual = {str(p.relative_to(source)): sha(p)
              for p in sorted(source.rglob('*')) if p.is_file()}
    return actual == files


assert verify()
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out = root / 'runs' / (stamp + '-factory-normal-unchanged')
out.mkdir(parents=True, exist_ok=False)
for name in ['source-lock.json', 'source-delta.json', 'driver.diff']:
    shutil.copyfile(origin / name, out / name)
shutil.copyfile(root / 'run-pilot.py', out / 'run-pilot.py')
binary = origin / 'runs/20260928T212646Z-sy03-hard-exterior-screen/sim.test'
expected_binary = 'bb0c8b1f36b0adcd4ac1a655cf7654a3afe6f848cc4a50d6bea6ad1065ba15dc'
assert sha(binary) == expected_binary
env = {k: v for k, v in os.environ.items()
       if not k.startswith('FRONTLINE_FATAL_')
       and k not in ['FRONTLINE_TEST_FATAL_DIAGNOSTICS',
                    'FRONTLINE_MISSION_CHECKPOINTS', 'FRONTLINE_MISSION_EVIDENCE']}
env.update(GOMAXPROCS='2', FRONTLINE_MISSION_EVIDENCE=str(out / 'evidence'))
receipt = {
    'scope': 'One unchanged current SY05 Normal factory-optional route audit; no source or command-policy changes',
    'simulation': '0.3.4',
    'source_lock_sha256': expected_lock,
    'source_path': str(source), 'binary_path': str(binary), 'binary_sha256': expected_binary,
    'base_source_lock_sha256': '242c51f4fb427b2088c2038c192b6042bc1c2cdf8421b0d96fe83919edd327e7',
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
code = run_stage('mission', [str(binary),
                               '-test.run=^TestAuthoredOptionalFactoryCapture$/^normal$',
                               '-test.count=1', '-test.timeout=30m', '-test.v'], source / 'pkg/sim')
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
