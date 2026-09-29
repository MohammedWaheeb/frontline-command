#!/usr/bin/env python3
"""Audit completed integrated main/optional runs without executing Go."""
import hashlib
import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'source'
LOCK = '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'
OLD = ROOT.parent / 'runtime-034-consolidated-acceptance/authored-runs'
OBJECTIVES = dict(MissileBudget='missile-budget', DistantStations='stations-together',
                  TrailSalvage='limited-salvage', MechanicTeams='mechanic-teams',
                  ObserverNetwork='observer-network', WingEvacuation='wing-evacuated',
                  FactoryCapture='factory-captured')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return json.loads(path.read_text())

assert sha(ROOT / 'source-lock.json') == LOCK
assert {str(p.relative_to(SOURCE)): sha(p) for p in SOURCE.rglob('*') if p.is_file()} == read(ROOT / 'source-lock.json')['files']
plan = read(ROOT / 'authored-matrix-plan.json')
audit = dict(source_lock_sha256=LOCK, phases=[], scope='Fresh integrated native mission correctness; not browser, skirmish or performance qualification.')
for phase in ('main', 'optional'):
    runs = [p for p in sorted((ROOT / 'authored-runs').iterdir()) if p.name.endswith('-' + phase)]
    assert runs, phase + ' not run'
    directory = runs[-1]
    run = read(directory / 'run.json')
    count = 102 if phase == 'main' else 21
    assert (run.get('passed'), run.get('failed'), run.get('unrun')) == (count, 0, 0), 'phase not complete and passing'
    assert run['source_verified_after'] and run['binary_verified_after'] and run['subset'] is None
    assert sha(directory / 'source-lock.json') == LOCK == run['source_lock_sha256']
    assert sha(directory / 'sim.test') == run['binary_sha256']
    assert [r['case'] for r in run['results']] == ['/'.join(c) for c in plan['cases'][phase]]
    old_directory = OLD / ('20260928T233429Z-main' if phase == 'main' else '20260928T235819Z-optional')
    old = {r['case']: r for r in read(old_directory / 'run.json')['results']}
    summary = dict(phase=phase, directory=str(directory.relative_to(ROOT)), run_sha256=sha(directory / 'run.json'),
                   binary_sha256=run['binary_sha256'], passed=count, failed=0, unrun=0,
                   batches=0, orders=0, receipts=0, receipt_codes={}, cases=[],
                   historical_final_hash_differences=[], historical_order_ledger_differences=[])
    codes = Counter()
    for receipt in run['results']:
        case_dir = directory / receipt['artifacts']
        assert receipt['passed'] and receipt['exit_code'] == 0 and receipt['actual_leaf_pass']
        assert '--- PASS: '+receipt['case']+' (' in (case_dir / 'test.log').read_text()
        evidence = [(p, read(p)) for p in (case_dir / 'evidence').glob('*.json') if not p.name.endswith('.save.json')]
        evidence = [(p, e) for p, e in evidence if 'FinalHash' in e and 'Metadata' in e]
        assert len(evidence) == 1
        path, actual = evidence[0]
        assert sha(path) == receipt['evidence_sha256'] and actual['FinalHash'] == receipt['final_hash']
        assert actual['Tick'] == receipt['tick'] and 0 < actual['Midpoint'] == receipt['midpoint'] < actual['Tick']
        assert actual['Metadata']['simulation'] == '0.3.4' and actual['Metadata']['ruleset'] == 'scenario-v2'
        assert actual['Outcome'] == dict(finished=True, draw=False, winning_team=1, reason='mission_complete', tick=actual['Tick'])
        assert actual['Debrief'] is not None and len(actual['FinalHash']) == len(actual['FailureHash']) == 64
        assert actual['FinalHash'] != actual['FailureHash']
        assert all(o['complete'] for o in actual['Objectives'] if not o['optional'] and not o['failure'])
        target = None
        if phase == 'optional':
            target = OBJECTIVES[receipt['case'].split('/')[0].removeprefix('TestAuthoredOptional')]
            matches = [o for o in actual['Objectives'] if o['id'] == target]
            assert len(matches) == 1 and matches[0]['optional'] and matches[0]['complete'] and not matches[0]['failure']
        orders = sum(len(b['orders']) for b in actual['Orders'])
        results = [r for b in actual['Orders'] for r in b['results']]
        assert orders == len(results)
        assert all(r['accepted'] and r['code'] == 'ok' for r in results)
        assert all(o['kind'] != 'surrender' and not o['kind'].startswith('practice') for b in actual['Orders'] for o in b['orders'])
        for b in actual['Orders']:
            assert [r['index'] for r in b['results']] == list(range(len(b['orders'])))
            assert all(r['player'] == b['player'] and r['sequence'] == b['sequence'] for r in b['results'])
        historical = old[receipt['case']]
        old_files = [(p, read(p)) for p in (old_directory / historical['artifacts'] / 'evidence').glob('*.json') if not p.name.endswith('.save.json')]
        old_files = [(p, e) for p, e in old_files if 'FinalHash' in e and 'Metadata' in e]
        assert len(old_files) == 1 and sha(old_files[0][0]) == historical['evidence_sha256']
        previous = old_files[0][1]
        if actual['FinalHash'] != previous['FinalHash']:
            summary['historical_final_hash_differences'].append(receipt['case'])
        if actual['Orders'] != previous['Orders']:
            summary['historical_order_ledger_differences'].append(receipt['case'])
        summary['batches'] += len(actual['Orders'])
        summary['orders'] += orders
        summary['receipts'] += len(results)
        codes.update(r['code'] for r in results)
        summary['cases'].append(dict(case=receipt['case'], evidence=str(path.relative_to(ROOT)), evidence_sha256=sha(path),
                                     log_sha256=sha(case_dir / 'test.log'), tick=actual['Tick'], midpoint=actual['Midpoint'],
                                     final_hash=actual['FinalHash'], failure_hash=actual['FailureHash'],
                                     batches=len(actual['Orders']), orders=orders, optional_objective=target))
    summary['receipt_codes'] = dict(codes)
    audit['phases'].append(summary)
(ROOT / 'completed-mission-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
print(json.dumps([{k: v for k, v in phase.items() if k != 'cases'} for phase in audit['phases']], indent=2))
