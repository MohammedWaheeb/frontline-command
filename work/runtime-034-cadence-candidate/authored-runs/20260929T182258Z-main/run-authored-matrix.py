#!/usr/bin/env python3
"""Serial real-command acceptance on the locked candidate; default only plans."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import shutil
import time

ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = ROOT
SOURCE = ROOT.parent / 'maximum-server-combined-v1/clean-source'
LOCK_SHA256 = 'a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0'
GO = '/opt/homebrew/bin/go'
DIFFICULTIES = ('easy', 'normal', 'hard')
GROUPS = {
    'Opening': ('us-01-first-foothold', 'ir-01-forward-signal', 'sy-01-workshop-foothold', 'sa-01-arrival-point'),
    'Escort': ('us-02-open-corridor', 'ir-02-eyes-above', 'sy-02-supply-trail', 'sa-02-moving-shield'),
    'Territory': ('ir-03-beyond-the-basin', 'sa-03-distant-depots', 'sy-03-three-crossings'),
    'Capture': ('us-03-relay-ridge', 'sy-05-relay-break', 'sa-05-three-positions'),
    'Defense': ('us-04-broken-umbrella', 'ir-04-hold-the-network', 'sy-04-open-doors', 'sa-04-intercept-window'),
    'Assault': ('us-05-split-front', 'ir-05-the-second-volley', 'us-06-clear-horizon', 'ir-06-iron-signal', 'sy-06-open-road', 'sa-06-shieldline'),
}
OPTIONAL = ('MissileBudget', 'DistantStations', 'TrailSalvage', 'MechanicTeams', 'ObserverNetwork', 'WingEvacuation', 'FactoryCapture')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

import importlib.util
HELPER = ROOT.parent / 'maximum-server-combined-v1/runner_guard.py'
assert hashlib.sha256(HELPER.read_bytes()).hexdigest() == '55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
spec = importlib.util.spec_from_file_location('cadence_runner_guard', HELPER)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

def verify():
    guard.verify_source(SOURCE, ROOT / 'source-lock.json', LOCK_SHA256)
    return LOCK_SHA256

def cases():
    main, optional = [], []
    for name in ('1-give-an-order', '2-operate-a-base', '3-read-the-counter', '4-defend-the-sky'):
        for difficulty in DIFFICULTIES:
            main.append(['TestAuthoredTutorialCompletion', name, difficulty])
    for faction in ('US', 'IR', 'SY', 'SA'):
        for difficulty in DIFFICULTIES:
            main.append(['TestAuthoredTutorialCompletion', '5-command-a-match', faction, difficulty])
    for group, missions in GROUPS.items():
        for mission in missions:
            for difficulty in DIFFICULTIES:
                main.append(['TestAuthoredCampaign'+group+'Completion', mission, difficulty])
    for mission in ('twin-outposts', 'convoy-union'):
        for difficulty in DIFFICULTIES:
            main.append(['TestAuthoredCoopCompletion', mission, difficulty])
    for name in OPTIONAL:
        for difficulty in DIFFICULTIES:
            optional.append(['TestAuthoredOptional'+name, difficulty])
    assert len(main) == 102 and len(optional) == 21
    return dict(main=main, optional=optional)

parser = argparse.ArgumentParser()
parser.add_argument('--execute-after-release', action='store_true', help='Explicit coordinated host release; never use during the active multiplayer course')
parser.add_argument('--run', choices=('main', 'optional'))
parser.add_argument('--select', help='optional substring filter, recorded as a subset, never a full matrix')
args = parser.parse_args()
if args.run and not args.execute_after_release:
    parser.error('Execution is held until the parent releases the host.')
identity = verify()
plan = dict(simulation='0.3.4', source_lock_sha256=identity, cases=cases(), ordinary_commands_only=True, serial=True, old_evidence_relabelled=False)
(ROOT / 'authored-matrix-plan.json').write_text(json.dumps(plan, indent=2)+'\n')
if not args.run:
    print('Prepared 102 main and 21 optional cases; no simulation cases executed.')
    raise SystemExit()

selected = [case for case in plan['cases'][args.run] if not args.select or args.select in '/'.join(case)]
if not selected:
    raise SystemExit('no selected cases')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out = ROOT / 'authored-runs' / (stamp+'-'+args.run+('-subset' if args.select else ''))
out.mkdir(parents=True, exist_ok=False)
for filename in ('source-lock.json', 'integration-receipt.json'):
    shutil.copyfile(SOURCE_ROOT / filename, out / filename)
shutil.copyfile(Path(__file__), out / 'run-authored-matrix.py')
env = {key: value for key, value in os.environ.items() if not key.startswith('FRONTLINE_')}
env['GOMAXPROCS'] = '1'
env['GOFLAGS'] = '-p=1'
env.pop('GOOS', None)
env.pop('GOARCH', None)
binary = out / 'sim.test'
with (out / 'build.log').open('w') as log:
    subprocess.run([GO, 'test', '-p=1', '-c', '-o', str(binary), './pkg/sim'], cwd=SOURCE, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
manifest = dict(simulation='0.3.4', source_lock_sha256=identity, binary_sha256=sha(binary), phase=args.run, subset=args.select, expected_cases=len(selected), gomaxprocs=1, host_conditions='Clean a7cc candidate: serial GOMAXPROCS1, unchanged 3d49 commanders. Root browser and one Blender may be active. Correctness only; not performance evidence.', results=[])
(out / 'run.json').write_text(json.dumps(manifest, indent=2)+'\n')
for index, case in enumerate(selected):
    name = '/'.join(case)
    caseout = out / (f'{index+1:03d}-'+'-'.join(case[1:])+'-'+case[0].removeprefix('TestAuthored'))
    caseout.mkdir()
    env['FRONTLINE_MISSION_EVIDENCE'] = str(caseout / 'evidence')
    command = [str(binary), '-test.run='+'/'.join('^'+re.escape(part)+'$' for part in case), '-test.count=1', '-test.timeout=30m', '-test.v']
    started = time.time()
    with (caseout / 'test.log').open('w') as log:
        process = subprocess.run(command, cwd=SOURCE / 'pkg/sim', env=env, stdout=log, stderr=subprocess.STDOUT)
    summaries = []
    for path in (caseout / 'evidence').glob('*.json'):
        if path.name.endswith('.save.json'):
            continue
        data = json.loads(path.read_text())
        if 'FinalHash' in data and 'Metadata' in data:
            summaries.append((path, data))
    text = (caseout / 'test.log').read_text()
    leaf_pass = '--- PASS: '+name+' (' in text
    passed = process.returncode == 0 and leaf_pass and len(summaries) == 1
    if passed:
        metadata = summaries[0][1]['Metadata']
        passed = metadata.get('simulation') == '0.3.4'
    receipt = dict(case=name, exit_code=process.returncode, elapsed_seconds=round(time.time()-started, 3), actual_leaf_pass=leaf_pass, completion_artifacts=len(summaries), passed=passed, artifacts=str(caseout.relative_to(out)))
    if len(summaries) == 1:
        path, result = summaries[0]
        receipt.update(tick=result['Tick'], midpoint=result['Midpoint'], final_hash=result['FinalHash'], evidence_sha256=sha(path))
    manifest['results'].append(receipt)
    (out / 'run.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(f'{index+1}/{len(selected)} {name} {"PASS" if passed else "FAIL"} {receipt["elapsed_seconds"]}s', flush=True)
    if not passed:
        manifest['stopped_for_failure'] = dict(case=name, artifacts=receipt['artifacts'])
        break
    if process.returncode < 0 or re.search(r'runtime: out of memory|cannot allocate memory|failed to create new OS thread|signal: killed', text, re.I):
        manifest['stopped_for_resource_issue'] = dict(case=name, exit_code=process.returncode, artifacts=receipt['artifacts'])
        break
manifest['source_verified_after'] = verify() == identity
manifest['binary_verified_after'] = sha(binary) == manifest['binary_sha256']
manifest['passed'] = sum(result['passed'] for result in manifest['results'])
manifest['failed'] = len(manifest['results'])-manifest['passed']
manifest['unrun'] = len(selected)-len(manifest['results'])
(out / 'run.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(out, flush=True)
raise SystemExit(bool(manifest['failed']) or bool(manifest['unrun']) or not manifest['source_verified_after'] or not manifest['binary_verified_after'])
