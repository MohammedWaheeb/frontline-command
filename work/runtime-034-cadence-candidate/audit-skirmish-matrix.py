#!/usr/bin/env python3
"""Read-only audit of every earned bot result and executed command receipt."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'maximum-server-combined-v1/clean-source'
LOCK = 'a7ccba8c892abcf4bc643ed41109399741cf74d6b33161a0e5e29c977adcc5c0'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

parser = argparse.ArgumentParser()
parser.add_argument('run', type=Path)
args = parser.parse_args()
directory = args.run.resolve()
run = json.loads((directory / 'run.json').read_text())
assert sha(ROOT / 'source-lock.json') == LOCK == run['source_lock_sha256']
import importlib.util
HELPER = ROOT.parent / 'maximum-server-combined-v1/runner_guard.py'
assert hashlib.sha256(HELPER.read_bytes()).hexdigest() == '55bc657f42ab0cc53fed601dbb2c75a0c86d9e412d4a524e1d39e5d4a7e3a3db'
spec = importlib.util.spec_from_file_location('cadence_runner_guard', HELPER)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
guard.verify_source(SOURCE, ROOT / 'source-lock.json', LOCK)

assert (run['passed'], run['failed'], run['unrun']) == (13, 0, 0)
assert run['source_verified_after'] and run['binary_verified_after'] and sha(Path(run['binary'])) == run['binary_sha256']
audit = dict(source_lock_sha256=LOCK, binary_sha256=run['binary_sha256'], run_sha256=sha(directory / 'run.json'), cases=[], accepted=0, rejected=0, rejection_codes={}, rejection_classification='Pending exact context review; none silently excused.')
OLD = ROOT.parent / 'runtime-034-integrated-source/skirmish-runs/20260929T075631Z'
old_audit = json.loads((OLD / 'receipt-audit.json').read_text())
old_class = json.loads((OLD / 'rejection-classification.json').read_text())
audit['baseline_run_sha256'] = sha(OLD / 'run.json')
audit['baseline_classification_sha256'] = sha(OLD / 'rejection-classification.json')
audit['baseline_contexts'] = {}
audit['differences'] = []
codes = Counter()
for row in run['cases']:
    folder = directory / row['case']
    report = json.loads((folder / 'result.json').read_text())
    assert sha(folder / 'result.json') == row['result_sha256'] and report['final_hash'] == row['final_hash']
    assert report['ordinary_completion'] and report['initial_restore_exact'] and report['final_restore_exact'] and report['full_replay_exact'] and not report['issues']
    assert report['metadata']['simulation'] == '0.3.4' and report['executable_sha256'] == run['binary_sha256']
    assert report['outcome']['finished'] and report['outcome']['reason'] == 'elimination'
    # Source test checks economic invariants every tick, not just these samples.
    assert all(p['income'] > 0 and p['spent'] > 0 for p in report['minute_samples'][-1]['players'])
    receipts = Counter()
    accepted = Counter()
    rejected = []
    counted = {}
    batches = 0
    with gzip.open(folder / 'commands.jsonl.gz', 'rt') as stream:
        for line in stream:
            trace = json.loads(line)
            by_batch = {}
            for batch in trace['executed_batches']:
                key = (batch['player'], batch['sequence'])
                assert key not in by_batch
                by_batch[key] = batch
                assert all(o['kind'] != 'surrender' and not o['kind'].startswith('practice') for o in batch['orders'])
                batches += 1
            indexes = {key: [] for key in by_batch}
            for receipt in trace['results']:
                key = (receipt['player'], receipt['sequence'])
                assert key in by_batch
                indexes[key].append(receipt['index'])
                player = str(receipt['player'])
                receipts[player] += 1
                if receipt['accepted']:
                    assert receipt['code'] == 'ok'
                    accepted[player] += 1
                else:
                    codes[receipt['code']] += 1
                    counted.setdefault(player, Counter())[receipt['code']] += 1
                    rejected.append(dict(receipt=receipt, order=by_batch[key]['orders'][receipt['index']]))
            for key, batch in by_batch.items():
                assert indexes[key] == list(range(len(batch['orders'])))
    for player, counts in report['orders'].items():
        assert counts['executed'] == receipts[player] and counts['accepted'] == accepted[player]
        assert counts['rejected_by_code'] == dict(counted.get(player, {}))
    item = dict(case=row['case'], tick=report['tick'], minutes_including_countdown=report['tick']/1200, outcome=report['outcome'], final_hash=report['final_hash'], batches=batches, executed=sum(receipts.values()), accepted=sum(accepted.values()), rejected=len(rejected), rejections=rejected,
                files={name: dict(sha256=sha(folder/name), bytes=(folder/name).stat().st_size) for name in ('result.json', 'initial.save.json', 'final.save.json', 'replay.fcr', 'commands.jsonl.gz')})
    previous = next(p for p in old_audit['cases'] if p['case'] == row['case'])
    oldfolder = OLD / row['case']
    for filename, pinned in previous['files'].items():
        assert sha(oldfolder / filename) == pinned['sha256'], 'Baseline artifact drift: ' + filename
    item['baseline_equality'] = {
        'final_hash': report['final_hash'] == previous['final_hash'],
        'outcome': report['outcome'] == previous['outcome'],
        'complete_order_trace': gzip.decompress((folder / 'commands.jsonl.gz').read_bytes()) == gzip.decompress((oldfolder / 'commands.jsonl.gz').read_bytes()),
        'initial_save': (folder / 'initial.save.json').read_bytes() == (oldfolder / 'initial.save.json').read_bytes(),
        'final_save': (folder / 'final.save.json').read_bytes() == (oldfolder / 'final.save.json').read_bytes(),
        'full_replay': (folder / 'replay.fcr').read_bytes() == (oldfolder / 'replay.fcr').read_bytes(),
        'rejections': rejected == previous['rejections'],
    }
    if not all(item['baseline_equality'].values()):
        audit['differences'].append({'case': row['case'], 'fields': [k for k, v in item['baseline_equality'].items() if not v]})
    if rejected and all(item['baseline_equality'].values()):
        context = oldfolder / 'rejection-context.json'
        classified = [r for r in old_class['rejections'] if r['case'] == row['case']]
        assert len(classified) == len(rejected) and all(r['context_sha256'] == sha(context) for r in classified)
        item['rejection_classification'] = classified
        audit['baseline_contexts'][row['case']] = {'path': str(context), 'sha256': sha(context), 'scope': 'Existing exact3d49 context reused only after complete trace, initial/final save and replay equality; no new context execution.'}
    audit['cases'].append(item)
    audit['accepted'] += item['accepted']
    audit['rejected'] += len(rejected)
audit['rejection_codes'] = dict(codes)
if not audit['differences']:
    audit['rejection_classification'] = 'Exact same twelve accepted-baseline decision/execution races, with pinned contextual proof; not an all-orders-clean claim.'
    assert audit['rejected'] == old_audit['rejected'] == 12 and dict(codes) == old_audit['rejection_codes']
(directory / 'receipt-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
print(json.dumps({k: v for k, v in audit.items() if k != 'cases'}, indent=2))

assert not audit['differences'], 'Canonical/order drift versus accepted3d49: preserve and diagnose'
