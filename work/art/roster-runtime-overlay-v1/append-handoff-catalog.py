"""Append completed exact handoffs to a fresh inventory; never build a product."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
parser = argparse.ArgumentParser()
parser.add_argument('prior')
parser.add_argument('output')
parser.add_argument('handoffs', nargs='+')
args = parser.parse_args()
prior = REPO / args.prior
out = REPO / args.output
assert out.parent == HERE and not out.exists(), 'Use a new sibling catalog'
p = json.loads(prior.read_text())
rows = []
ids = set()
inputs = {str(prior.relative_to(REPO)): sha(prior)}
for row in p['assets'] + [{'handoff': name} for name in args.handoffs]:
    hp = REPO / row['handoff']
    digest = sha(hp)
    if 'handoff_sha256' in row:
        assert digest == row['handoff_sha256'], hp
    h = json.loads(hp.read_text())
    assert h['id'] not in ids, 'Duplicate ID: ' + h['id']
    ids.add(h['id'])
    rows.append({'id': h['id'], 'handoff': row['handoff'],
                 'handoff_sha256': digest,
                 'poses': h.get('state_pose_count', h.get('poses', row.get('poses'))),
                 'files': len(h['files']),
                 'bytes': sum(f['bytes'] for f in h['files'].values())})
    assert rows[-1]['poses'] is not None
rows.sort(key=lambda r: r['id'])
base_lock = 'work/art/aircraft-runtime-overlay-v1/base-locks/integration-v25.json'
index = REPO / 'work/art/effects-opus-v2/integration-v25/product/art/index.json'
# This read-only reference index is deliberately the same historical inventory.
assert sha(index) == '3c4b7d623180fcefbeba3ddf2a7a869f644a8e64321821501307c26bb4bf39b6'
inputs[str(index.relative_to(REPO))] = sha(index)
base_ids = set(json.loads(index.read_text())['sprites'])
expected = {s.stem for s in (REPO / 'assets/pipeline/specs').glob('*.json')
            if s.stem.startswith(('unit.', 'building.', 'prop.'))}
planned = set()
families = []
for family in ['aircraft-final-production-v3', 'vehicle-final-production-v1',
               'building-final-production-v1']:
    lp = REPO / 'work/art' / family / 'production-lock.json'
    lock = json.loads(lp.read_text())
    inputs[str(lp.relative_to(REPO))] = sha(lp)
    remaining = []
    for aid in lock['assets']:
        planned.add(aid)
        if aid not in ids:
            spec = REPO / lock['stage'] / 'assets/pipeline/specs' / (aid + '.json')
            s = json.loads(spec.read_text())
            remaining.append({'id': aid, 'spec_sha256': sha(spec),
                              'poses': sum(x['directions'] * x['frames'] for x in s['states'])})
    families.append({'family': family, 'remaining': remaining,
                     'poses': sum(x['poses'] for x in remaining)})
union = base_ids | ids
missing = expected - union
assert missing == planned - ids, (sorted(missing), sorted(planned - ids))
proc = subprocess.run(['node', str(HERE / 'overlay-v3.mjs'), '--base-lock', base_lock,
                       '--check', *[r['handoff'] for r in rows]],
                      cwd=REPO, text=True, capture_output=True)
assert proc.returncode == 0, proc.stdout + proc.stderr
out.mkdir()
(out / 'adapter-check.log').write_text(proc.stdout + proc.stderr)
result = {'scope': 'Immutable private handoff inventory only. Historical v25 graph is read-only context, not a source-compatible product or runtime acceptance.',
          'inputs': inputs, 'assets': rows,
          'totals': {'handoffs': len(rows), 'files': sum(r['files'] for r in rows),
                     'bytes': sum(r['bytes'] for r in rows), 'poses': sum(r['poses'] for r in rows)},
          'reference_graph_inventory': {'union_ids': len(union),
              'base_only_ids': sorted(base_ids - ids), 'missing_ids': sorted(missing),
              'missing_ids_exactly_match_approved_remaining_source_queues': True,
              'warning': 'Base-only presence is not a fresh source or visual audit.'},
          'remaining_families': families,
          'adapter_check_sha256': sha(out / 'adapter-check.log'),
          'script_sha256': sha(Path(__file__))}
(out / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
(out / 'README.md').write_text(
    '# Completed handoff inventory\n\n'
    f"{len(rows)} exact handoffs contain {result['totals']['files']:,} files, "
    f"{result['totals']['bytes']:,} bytes and {result['totals']['poses']:,} poses. "
    'All passed the existing strict graph adapter without creating a product.\n\n'
    f'The read-only historical v25 reference union contains {len(union)} of {len(expected)} IDs. '
    f'The remaining {len(missing)} IDs exactly match the approved frozen queues listed in result.json. '
    'Base-only presence is not new QA. Select an explicitly compatible current client base for future integration; '
    'no runtime, final visual, encoded package budget or shipping acceptance is inferred.\n')
print(json.dumps(result['totals']))
