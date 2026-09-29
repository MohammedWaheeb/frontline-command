#!/usr/bin/env python3
"""Audit completed JSON test output; no compilation or simulation execution."""
import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'source'
run = sorted((HERE / 'checks').iterdir())[-1]
receipt = json.loads((run / 'receipt.json').read_text())
assert receipt.get('result') == 'passed', 'checks are not complete'
assert receipt['source_and_prior_locks_verified_after'] and receipt['shipping_inventory_verified_after']
selection = json.loads((HERE / 'race-selection.json').read_text())
summary = dict(source_lock_sha256=receipt['source_lock_sha256'], run=str(run.relative_to(HERE)),
               conditions=receipt['conditions'], stages=[])
for stage in receipt['stages']:
    path = run / (stage['stage'] + '.log')
    assert hashlib.sha256(path.read_bytes()).hexdigest() == stage['log_sha256']
    item = {key: value for key, value in stage.items() if key not in ('command', 'cwd')}
    if stage['stage'] in ('all-package-short', 'bounded-sim-race', 'bounded-adapter-race'):
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.startswith('{')]
        assert not [r for r in rows if r['Action'] == 'fail']
        completed = [r for r in rows if r['Action'] in ('pass', 'skip') and r.get('Test') and '/' not in r['Test']]
        passed = {(r['Package'], r['Test']) for r in completed if r['Action'] == 'pass'}
        skipped = {(r['Package'], r['Test']) for r in completed if r['Action'] == 'skip'}
        item['top_level_passed'] = len(passed)
        item['top_level_skipped'] = len(skipped)
        item['skipped'] = [dict(package=p, test=t) for p, t in sorted(skipped)]
        item['packages'] = [dict(package=r['Package'], action=r['Action']) for r in rows
                            if r['Action'] in ('pass', 'skip') and not r.get('Test')]
        if stage['stage'] == 'bounded-sim-race':
            assert passed == {('frontlinecommand/pkg/sim', test) for test in selection['sim']}
            assert not skipped
        if stage['stage'] == 'bounded-adapter-race':
            expected = set()
            for package in ('internal/viewproto', 'cmd/wasm', 'internal/server'):
                available = {name for path in (SOURCE / package).glob('*_test.go')
                             for name in re.findall(r'^func (Test\w+)\(t \*testing.T\)', path.read_text(), re.M)}
                expected |= {('frontlinecommand/' + package, name) for name in selection['adapters'] if name in available}
            assert passed == expected and not skipped
    summary['stages'].append(item)
(HERE / 'completed-checks.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps([{k: v for k, v in stage.items() if k not in ('log_sha256', 'skipped', 'packages')}
                  for stage in summary['stages']], indent=2))
