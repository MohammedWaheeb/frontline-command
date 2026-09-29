#!/usr/bin/env python3
"""Read-only audit of every earned bot result and executed command receipt."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'source'
LOCK = '3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

parser = argparse.ArgumentParser()
parser.add_argument('run', type=Path)
args = parser.parse_args()
directory = args.run.resolve()
run = json.loads((directory / 'run.json').read_text())
assert sha(ROOT / 'source-lock.json') == LOCK == run['source_lock_sha256']
assert {str(p.relative_to(SOURCE)): sha(p) for p in SOURCE.rglob('*') if p.is_file()} == json.loads((ROOT / 'source-lock.json').read_text())['files']
assert (run['passed'], run['failed'], run['unrun']) == (13, 0, 0)
assert run['source_verified_after'] and run['binary_verified_after'] and sha(Path(run['binary'])) == run['binary_sha256']
audit = dict(source_lock_sha256=LOCK, binary_sha256=run['binary_sha256'], run_sha256=sha(directory / 'run.json'), cases=[], accepted=0, rejected=0, rejection_codes={}, rejection_classification='Pending exact context review; none silently excused.')
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
    audit['cases'].append(item)
    audit['accepted'] += item['accepted']
    audit['rejected'] += len(rejected)
audit['rejection_codes'] = dict(codes)
(directory / 'receipt-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
print(json.dumps({k: v for k, v in audit.items() if k != 'cases'}, indent=2))
