#!/usr/bin/env python3
"""Opt-in serial13 authored games, reusing the exact integrated native binary."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'maximum-server-combined-v1/clean-source'
LOCK = 'a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0'
CASES = ('pair-US-IR', 'pair-US-SY', 'pair-US-SA', 'pair-IR-SY', 'pair-IR-SA', 'pair-SY-SA',
         'mirror-US', 'mirror-IR', 'mirror-SY', 'mirror-SA', 'three-ffa', 'four-ffa', 'four-team')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

import importlib.util
HELPER = ROOT.parent / 'maximum-server-combined-v1/runner_guard.py'
assert hashlib.sha256(HELPER.read_bytes()).hexdigest() == '55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
spec = importlib.util.spec_from_file_location('cadence_runner_guard', HELPER)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

def verify():
    guard.verify_source(SOURCE, ROOT / 'source-lock.json', LOCK)
    return LOCK

parser = argparse.ArgumentParser()
parser.add_argument('--execute-after-release', action='store_true')
parser.add_argument('--mission-run', type=Path, help='Completed integrated main/optional run supplying the same compiled sim.test')
args = parser.parse_args()
verify()
if not args.execute_after_release:
    print('Prepared13 serial authored skirmishes; no binary compiled or executed.')
    raise SystemExit()
if not args.mission_run:
    parser.error('a completed exact integrated mission run is required')
prior = args.mission_run.resolve()
manifest = json.loads((prior / 'run.json').read_text())
assert manifest['source_lock_sha256'] == LOCK and manifest['source_verified_after'] and manifest['binary_verified_after']
assert manifest['failed'] == 0 and manifest['unrun'] == 0
binary = prior / 'sim.test'
assert sha(binary) == manifest['binary_sha256']
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out = ROOT / 'skirmish-runs' / stamp
out.mkdir(parents=True, exist_ok=False)
env = {k: v for k, v in os.environ.items() if not k.startswith('FRONTLINE_')}
env.update(GOMAXPROCS='1', FRONTLINE_AUTHORED_AI='1', FRONTLINE_AUTHORED_AI_EVIDENCE=str(out))
receipt = dict(source_lock_sha256=LOCK, binary_sha256=sha(binary), binary=str(binary),
               expected_cases=13, cases=[], runner_sha256=sha(Path(__file__)),
               conditions='SerialGOMAXPROCS1 while root functional browser/Blender may be active; correctness only, no performance claim.')

def save():
    (out / 'run.json').write_text(json.dumps(receipt, indent=2) + '\n')

save()
for index, name in enumerate(CASES):
    verify()
    assert sha(binary) == receipt['binary_sha256']
    log = out / (name + '.log')
    started = time.monotonic()
    command = [str(binary), '-test.run=^TestAuthoredSkirmishAcceptance$/^' + re.escape(name) + '$',
               '-test.count=1', '-test.timeout=30m', '-test.v']
    with log.open('w') as output:
        result = subprocess.run(command, cwd=SOURCE / 'pkg/sim', env=env, stdout=output, stderr=subprocess.STDOUT)
    item = dict(case=name, exit_code=result.returncode, elapsed_seconds=round(time.monotonic()-started, 3),
                log_sha256=sha(log), command=command)
    report = out / name / 'result.json'
    if report.is_file():
        actual = json.loads(report.read_text())
        item.update(result_sha256=sha(report), tick=actual['tick'], final_hash=actual['final_hash'],
                    ordinary_completion=actual['ordinary_completion'],
                    initial_restore_exact=actual['initial_restore_exact'], final_restore_exact=actual['final_restore_exact'],
                    full_replay_exact=actual['full_replay_exact'], issues=actual['issues'],
                    rejected_by_player={p: counts['rejected_by_code'] for p, counts in actual['orders'].items()})
        valid = actual['metadata']['simulation'] == '0.3.4' and actual['executable_sha256'] == receipt['binary_sha256']
        valid = valid and actual['ordinary_completion'] and actual['initial_restore_exact'] and actual['final_restore_exact'] and actual['full_replay_exact'] and not actual['issues']
        item['passed'] = result.returncode == 0 and valid and ('--- PASS: TestAuthoredSkirmishAcceptance/' + name + ' (') in log.read_text()
    else:
        item['passed'] = False
    receipt['cases'].append(item)
    save()
    print(f'{index+1}/13 {name} {"PASS" if item["passed"] else "FAIL"} {item["elapsed_seconds"]}s', flush=True)
    if not item['passed']:
        # A policy/simulation failure is a diagnosis boundary, not a prompt to
        # alter this frozen source or silently repeat until it becomes green.
        receipt['stopped_for_failure'] = name
        break
verify()
receipt['source_verified_after'] = True
receipt['binary_verified_after'] = sha(binary) == receipt['binary_sha256']
receipt['passed'] = sum(x['passed'] for x in receipt['cases'])
receipt['failed'] = len(receipt['cases']) - receipt['passed']
receipt['unrun'] = 13 - len(receipt['cases'])
receipt['receipt_classification'] = 'Pending independent contextual review; accepted lifecycle is not an all-orders-clean claim.'
save()
print(out, flush=True)
raise SystemExit(bool(receipt['failed'] or receipt['unrun']))
