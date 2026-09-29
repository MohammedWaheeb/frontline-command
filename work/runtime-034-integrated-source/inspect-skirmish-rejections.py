#!/usr/bin/env python3
"""Serial opt-in exact replay inspection, after the13-match run has closed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'source'
LOCK = '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify():
    assert sha(ROOT / 'source-lock.json') == LOCK
    assert {str(p.relative_to(SOURCE)): sha(p) for p in SOURCE.rglob('*') if p.is_file()} == json.loads((ROOT / 'source-lock.json').read_text())['files']

parser = argparse.ArgumentParser()
parser.add_argument('run', type=Path)
parser.add_argument('--execute-after-matrix', action='store_true')
args = parser.parse_args()
run = args.run.resolve()
receipt = json.loads((run / 'run.json').read_text())
assert receipt['source_lock_sha256'] == LOCK
assert (receipt['passed'], receipt['failed'], receipt['unrun']) == (13, 0, 0)
assert receipt['source_verified_after'] and receipt['binary_verified_after']
binary = Path(receipt['binary'])
assert sha(binary) == receipt['binary_sha256']
verify()
needed = [r for r in receipt['cases'] if any(sum(v.values()) for v in r['rejected_by_player'].values())]
if not args.execute_after_matrix:
    print(json.dumps({'cases_requiring_context': [r['case'] for r in needed], 'execution': False}, indent=2))
    raise SystemExit()
out = run / 'inspection'
out.mkdir(exist_ok=False)
report = dict(source_lock_sha256=LOCK, binary_sha256=sha(binary), cases=[],
              scope='Actual replay with three authorized-view boundaries per rejection; classification remains independent review.')
env = {k: v for k, v in os.environ.items() if not k.startswith('FRONTLINE_')}
env['GOMAXPROCS'] = '1'
for row in needed:
    verify()
    assert sha(binary) == report['binary_sha256']
    directory = run / row['case']
    originals = {name: sha(directory / name) for name in ('result.json', 'initial.save.json', 'final.save.json', 'replay.fcr', 'commands.jsonl.gz')}
    assert not (directory / 'rejection-context.json').exists(), 'preserve earlier context'
    env['FRONTLINE_AUTHORED_AI_INSPECT'] = str(directory)
    command = [str(binary), '-test.run=^TestAuthoredSkirmishRejectionContext$', '-test.count=1', '-test.timeout=30m', '-test.v']
    log = out / (row['case'] + '.log')
    started = time.monotonic()
    with log.open('w') as stream:
        process = subprocess.run(command, cwd=SOURCE / 'pkg/sim', env=env, stdout=stream, stderr=subprocess.STDOUT)
    actual = dict(case=row['case'], exit_code=process.returncode, elapsed_seconds=round(time.monotonic()-started, 3), log_sha256=sha(log), command=command)
    assert {name: sha(directory / name) for name in originals} == originals
    if process.returncode == 0:
        contexts = json.loads((directory / 'rejection-context.json').read_text())
        summary = json.loads((directory / 'diagnostic-summary.json').read_text())
        expected = sum(sum(v.values()) for v in row['rejected_by_player'].values())
        assert len(contexts) == expected * 3 and summary['verified_final_hash'] == row['final_hash']
        actual.update(rejections=expected, contexts=len(contexts), context_sha256=sha(directory / 'rejection-context.json'), summary_sha256=sha(directory / 'diagnostic-summary.json'))
    report['cases'].append(actual)
    (out / 'run.json').write_text(json.dumps(report, indent=2) + '\n')
    print(row['case'], 'PASS' if process.returncode == 0 else 'FAIL', flush=True)
    if process.returncode:
        raise SystemExit(process.returncode)
verify()
report.update(source_verified_after=True, binary_verified_after=sha(binary) == report['binary_sha256'])
(out / 'run.json').write_text(json.dumps(report, indent=2) + '\n')
