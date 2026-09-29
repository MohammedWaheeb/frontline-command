"""Exact post-export proof for a frozen complete-tuple reuse family."""
from pathlib import Path
import hashlib
import json
import re
import sys

REPO = Path(__file__).resolve().parents[3]
BASE = (REPO / sys.argv[1]).resolve()
assert BASE.is_relative_to(REPO / 'work/art')
aid = sys.argv[2]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
lock_path = BASE / 'production-lock.json'
lock = json.loads(lock_path.read_text())
assert aid in lock['assets']
stage = REPO / lock['stage']
audit_path = BASE / 'raw-reuse-audit.json'
assert sha(audit_path) == lock['reuse_audit_sha256']
audit = json.loads(audit_path.read_text())
assert audit['failures'] == 0
row = next(r for r in audit['rows'] if r['id'] == aid)
out = BASE / ('post-export-reuse-' + aid + '.json')
assert not out.exists(), 'Preserve each prior proof or failure.'
result = {'id': aid, 'scope': 'Exact copied raw/source identity after complete export; no native or runtime acceptance follows.',
          'script_sha256': sha(Path(__file__)), 'lock_sha256': sha(lock_path),
          'reuse_audit_sha256': sha(audit_path), 'failures': 0}
try:
    assert aid in (BASE / 'completed-assets.txt').read_text().splitlines()
    for prefix in ['check-', 'ui-check-']:
        assert json.loads((BASE / (prefix + aid + '.json')).read_text())['failures'] == 0
    for relative, wanted in lock['sources'].items():
        assert sha(stage / relative) == wanted, relative
    for relative, wanted in lock['drivers'].items():
        assert sha(REPO / relative) == wanted, relative
    for relative, wanted in audit['proof_inputs'].items():
        assert sha(REPO / relative) == wanted, relative
    spec = json.loads((stage / 'assets/pipeline/specs' / (aid + '.json')).read_text())
    required = {f"{s['name']}/d{d:02d}_f{f:02d}": set(s['layers'])
                for s in spec['states'] for d in range(s['directions']) for f in range(s['frames'])}
    actual = {}
    for relative, record in row['files'].items():
        layer, rest = relative.split('/', 1)
        key = rest.removesuffix('.png')
        assert key in required and layer in required[key]
        actual.setdefault(key, set()).add(layer)
        original = REPO / record['source']
        current = stage / 'assets/build/frames' / aid / relative
        assert sha(original) == sha(current) == record['sha256'], relative
    assert len(actual) == row['poses'] and all(layers == required[key] for key, layers in actual.items())
    log_path = BASE / ('full-' + aid + '.log')
    log = log_path.read_text()
    reused = re.search(r'FC_REUSED_POSES ' + re.escape(aid) + r' poses=(\d+)', log)
    total = re.search(r'FC_RENDER_DONE ' + re.escape(aid) + r' poses=(\d+) seconds=([\d.]+)', log)
    assert reused and total and int(reused[1]) == len(actual) and int(total[1]) == len(required)
    result.update(total_poses=len(required), exact_reused_poses=len(actual),
                  fresh_poses=len(required) - len(actual), copied_layer_files=len(row['files']),
                  render_seconds=float(total[2]), render_log_sha256=sha(log_path),
                  exact_reused_keys=sorted(actual), original_source_files_unchanged=True)
    out.write_text(json.dumps(result, indent=2) + '\n')
    print('FC_STAGE_POST_EXPORT_REUSE', aid, len(actual), len(required) - len(actual))
except Exception as error:
    result.update(failures=1, error=repr(error))
    out.write_text(json.dumps(result, indent=2) + '\n')
    raise
