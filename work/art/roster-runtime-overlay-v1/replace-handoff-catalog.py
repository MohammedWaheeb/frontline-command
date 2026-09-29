"""Explicit single-ID successor selection, using the existing strict adapter.

Preserves the old catalog/handoff and writes a new immutable selection receipt.
No product build, source mutation, normalized UI application or publication.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
parser = argparse.ArgumentParser()
parser.add_argument('prior')
parser.add_argument('output')
parser.add_argument('successor')
parser.add_argument('--expected-prior-handoff-sha256', required=True)
args = parser.parse_args()
prior, out, successor = [REPO / x for x in [args.prior, args.output, args.successor]]
assert out.parent == HERE and not out.exists(), 'Use a fresh sibling catalog.'
selection_path = out.with_name(out.name + '-selection.json')
assert not selection_path.exists(), 'Preserve previous selection attempts.'
before = {str(p.relative_to(REPO)): sha(p) for p in [prior, successor]}
catalog = json.loads(prior.read_text())
new = json.loads(successor.read_text())
ids = [row['id'] for row in catalog['assets']]
assert len(ids) == len(set(ids)), 'Prior catalog has duplicate IDs.'
assert ids.count(new['id']) == 1, 'Replacement must already exist exactly once.'
old = next(row for row in catalog['assets'] if row['id'] == new['id'])
old_path = REPO / old['handoff']
assert sha(old_path) == old['handoff_sha256'] == args.expected_prior_handoff_sha256
assert old_path != successor and sha(old_path) != sha(successor), 'Use a distinct successor receipt.'
assert json.loads(old_path.read_text())['id'] == new['id']
before[str(old_path.relative_to(REPO))] = sha(old_path)
selection = {
    'scope': 'Explicit single-ID successor selection. Original catalog and handoff stay immutable; graph validation follows in a new catalog. This is not publication or acceptance beyond the selected handoff.',
    'source_catalog': args.prior,
    'source_catalog_sha256': before[args.prior],
    'removed_selection': old,
    'successor_handoff': args.successor,
    'successor_handoff_sha256': before[args.successor],
    'script_sha256': sha(Path(__file__)),
    'assets': [row for row in catalog['assets'] if row['id'] != new['id']],
}
selection_path.write_text(json.dumps(selection, indent=2) + '\n')
command = [sys.executable, str(HERE / 'append-handoff-catalog.py'),
           str(selection_path.relative_to(REPO)), args.output, args.successor]
proc = subprocess.run(command, cwd=REPO, text=True, capture_output=True)
if proc.returncode:
    failure = selection_path.with_name(selection_path.stem + '-failure.json')
    failure.write_text(json.dumps({'command': command, 'returncode': proc.returncode,
                                  'stdout': proc.stdout, 'stderr': proc.stderr}, indent=2) + '\n')
    raise SystemExit(proc.returncode)
result = json.loads((out / 'result.json').read_text())
assert {row['id'] for row in result['assets']} == set(ids)
unchanged = {row['id']: row for row in catalog['assets'] if row['id'] != new['id']}
assert all(row == unchanged[row['id']] for row in result['assets'] if row['id'] != new['id'])
for relative, wanted in before.items():
    assert sha(REPO / relative) == wanted, 'Selection input changed: ' + relative
print(proc.stdout, end='')
print('FC_SINGLE_HANDOFF_SUCCESSOR_SELECTED', new['id'], len(unchanged), 'unchanged selections')
