#!/usr/bin/env python3
"""Read and verify completed frozen receipts; never execute the simulation."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'runtime-034-observer-reboard'
LOCK = '757b31785a0c0b869cca06ad01299ef199fd124989e722dce559c2919dddab8d'
BINARY = '89b0bb0c45c7493b8c6d04c36af25b730a7303b0ef201e1e566da0f62bc6d166'
RUNS = ('20260928T233429Z-main', '20260928T235819Z-optional')
OPTIONALS = dict(MissileBudget='missile-budget', DistantStations='stations-together',
                 TrailSalvage='limited-salvage', MechanicTeams='mechanic-teams',
                 ObserverNetwork='observer-network', WingEvacuation='wing-evacuated',
                 FactoryCapture='factory-captured')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return json.loads(path.read_text())

assert sha(SOURCE / 'source-lock.json') == LOCK
expected = read(SOURCE / 'source-lock.json')['files']
actual = {str(p.relative_to(SOURCE / 'source')): sha(p)
          for p in sorted((SOURCE / 'source').rglob('*')) if p.is_file()}
assert actual == expected, 'frozen commander source changed'
baseline = ROOT.parent / 'runtime-034-candidate'
base_files = read(baseline / 'source-lock.json')['files']
changed = sorted(k for k in base_files if k in actual and base_files[k] != actual[k])
added = sorted(set(actual) - set(base_files))
removed = sorted(set(base_files) - set(actual))
assert not removed and all(p.endswith('_test.go') for p in changed + added)
audit = dict(source_lock_sha256=LOCK, binary_sha256=BINARY,
             baseline_source_lock_sha256=sha(baseline / 'source-lock.json'),
             source_files=len(actual), changed_from_original_combined=changed,
             added_to_original_combined=added, production_protocol_content_unchanged=True,
             scope='Native ordinary mission commander; not a product UI or final optimized-runtime qualification', phases=[])
for name in RUNS:
    directory = ROOT / 'authored-runs' / name
    run = read(directory / 'run.json')
    count = 102 if run['phase'] == 'main' else 21
    assert run['subset'] is None and run['expected_cases'] == count
    assert (run['passed'], run['failed'], run['unrun']) == (count, 0, 0)
    assert run['source_verified_after'] and run['binary_verified_after']
    assert sha(directory / 'source-lock.json') == LOCK == run['source_lock_sha256']
    assert sha(directory / 'sim.test') == BINARY == run['binary_sha256']
    assert len(run['results']) == len({r['case'] for r in run['results']}) == count
    phase = dict(phase=run['phase'], run=name, run_sha256=sha(directory / 'run.json'),
                 passed=count, failed=0, unrun=0, batches=0, orders=0, receipts=0,
                 receipt_codes={}, cases=[])
    codes = Counter()
    for receipt in run['results']:
        path = directory / receipt['artifacts']
        log = (path / 'test.log').read_text()
        assert receipt['exit_code'] == 0 and receipt['actual_leaf_pass'] and receipt['passed']
        assert '--- PASS: ' + receipt['case'] + ' (' in log
        evidence = [(p, read(p)) for p in (path / 'evidence').glob('*.json') if not p.name.endswith('.save.json')]
        evidence = [(p, e) for p, e in evidence if 'FinalHash' in e and 'Metadata' in e]
        assert len(evidence) == 1
        p, e = evidence[0]
        assert sha(p) == receipt['evidence_sha256']
        assert e['FinalHash'] == receipt['final_hash'] and len(e['FinalHash']) == 64
        assert e['FailureHash'] != e['FinalHash'] and len(e['FailureHash']) == 64
        assert e['Tick'] == receipt['tick'] and e['Midpoint'] == receipt['midpoint']
        assert 0 < e['Midpoint'] < e['Tick']
        assert e['Metadata']['simulation'] == '0.3.4' and e['Metadata']['ruleset'] == 'scenario-v2'
        assert e['Outcome'] == dict(finished=True, draw=False, winning_team=1, reason='mission_complete', tick=e['Tick'])
        assert e['Debrief'] is not None
        batches = e['Orders']
        orders = sum(len(b['orders']) for b in batches)
        results = [r for b in batches for r in b['results']]
        assert orders == len(results)
        assert all(r['accepted'] and r['code'] == 'ok' for r in results)
        assert all(not o['kind'].startswith('practice') and o['kind'] != 'surrender'
                   for b in batches for o in b['orders'])
        for b in batches:
            assert [r['index'] for r in b['results']] == list(range(len(b['orders'])))
            assert all(r['player'] == b['player'] and r['sequence'] == b['sequence'] for r in b['results'])
        objective = None
        if run['phase'] == 'optional':
            objective = OPTIONALS[receipt['case'].split('/')[0].removeprefix('TestAuthoredOptional')]
            matches = [o for o in e['Objectives'] if o['id'] == objective]
            assert len(matches) == 1 and matches[0]['optional'] and matches[0]['complete'] and not matches[0]['failure']
        phase['batches'] += len(batches)
        phase['orders'] += orders
        phase['receipts'] += len(results)
        codes.update(r['code'] for r in results)
        phase['cases'].append(dict(case=receipt['case'], evidence=str(p.relative_to(ROOT)),
                                   evidence_sha256=sha(p), log_sha256=sha(path / 'test.log'),
                                   tick=e['Tick'], midpoint=e['Midpoint'], final_hash=e['FinalHash'],
                                   failure_hash=e['FailureHash'], batches=len(batches), orders=orders,
                                   optional_objective=objective))
    phase['receipt_codes'] = dict(codes)
    audit['phases'].append(phase)
(ROOT / 'completed-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
print(json.dumps({p['phase']: {k: v for k, v in p.items() if k != 'cases'} for p in audit['phases']}, indent=2))
