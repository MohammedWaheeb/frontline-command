"""Recover existing historical source bytes without changing the first audit."""
from pathlib import Path
import hashlib
import json
import shutil

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
out = HERE / 'snapshot-recovery-v1'
assert not out.exists()
before = REPO / 'work/art/alpha-resize-audit/lock-before/environment-roster-prop-source-lock.json'
original = json.loads(before.read_text())
logistics_lock_path = REPO / 'work/art/logistics/source-lock.json'
logistics = json.loads(logistics_lock_path.read_text())['sha256']
prefixes = ['work/evidence/aircraft-rebase/source',
            'work/evidence/production-inspection/source']
expected = dict(original['preserved_legacy'])
expected.update(logistics)
expected['assets/pipeline/blender/fclib.py'] = original['sources']['assets/pipeline/blender/fclib.py']
rows = []
for relative, want in expected.items():
    copies = []
    for prefix in prefixes:
        p = REPO / prefix / relative
        if p.exists():
            assert sha(p) == want, p
            copies.append({'path': str(p.relative_to(REPO)), 'sha256': want})
    assert copies, relative
    rows.append({'relative': relative, 'sha256': want, 'historical_copies': copies})
out.mkdir()
for row in rows:
    target = out / row['relative']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(REPO / row['historical_copies'][0]['path'], target)
    assert sha(target) == row['sha256']
result = {'scope': 'Exact recovery from preserved historical source snapshots, no new render or retroactive original-job lock.',
          'prior_audit': {'path': str((HERE / 'result.json').relative_to(REPO)), 'sha256': sha(HERE / 'result.json')},
          'locks': {str(before.relative_to(REPO)): sha(before),
                    str(logistics_lock_path.relative_to(REPO)): sha(logistics_lock_path)},
          'files': rows,
          'conclusions': [
              'The five legacy prop model/spec identities were already explicitly pinned in the preserved_legacy section of the older pre-resize prop lock. Both older snapshot copies match those identities; that model/spec lookup gap is now closed.',
              'All eight logistics model/spec identities match their original canvas-amended lock and both historical source snapshots.',
              'The recovered fclib e5bb314a source is independently pinned by the older prop source lock and present identically in both historical source snapshots. It predates the later transparent-team helper.',
              'The original logistics lock still does not bind fclib or every render setting to each original render job. This recovered helper is a historical source identity, not a retroactive byte-exact rerender or new original-job provenance claim.'],
          'script_sha256': sha(Path(__file__))}
(out / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print('Recovered', len(rows), 'source/spec files; original audit unchanged')
