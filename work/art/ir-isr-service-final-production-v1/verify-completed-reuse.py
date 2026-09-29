"""Post-export exact copied-raw/original-handoff proof; no artifact rewriting."""
from pathlib import Path
import hashlib
import json

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[2]
AID = 'unit.IR.isr'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
lock_path = BASE / 'production-lock.json'
lock = json.loads(lock_path.read_text())
stage = REPO / lock['stage']
audit_path = BASE / 'raw-reuse-audit.json'
assert sha(audit_path) == lock['reuse_audit_sha256']
audit = json.loads(audit_path.read_text())
out = BASE / 'completed-reuse-proof.json'
assert not out.exists(), 'Preserve previous proofs and failures.'
result = {'scope': 'Exact original and copied raw identity after full export. Packed crop/atlas bytes may differ because service geometry changes the common trim; native scale and anchor contracts are checked separately.',
          'script_sha256': sha(Path(__file__)), 'production_lock_sha256': sha(lock_path),
          'raw_reuse_audit_sha256': sha(audit_path), 'failures': 0}
try:
    assert AID in (BASE / 'completed-assets.txt').read_text().splitlines()
    for prefix in ['check-', 'ui-check-']:
        assert json.loads((BASE / (prefix + AID + '.json')).read_text())['failures'] == 0
    for relative, wanted in audit['proof_inputs'].items():
        assert sha(REPO / relative) == wanted, relative
    row = audit['rows'][0]
    assert row['id'] == AID and row['poses'] == 422
    copied = {}
    for relative, record in row['files'].items():
        original = REPO / record['source']
        current = stage / 'assets/build/frames' / AID / relative
        assert sha(original) == sha(current) == record['sha256'], relative
        copied[relative] = record['sha256']
    handoff_path = REPO / lock['isr_service_amendment']['original_handoff']
    assert sha(handoff_path) == lock['isr_service_amendment']['original_handoff_sha256']
    handoff = json.loads(handoff_path.read_text())
    for relative, record in handoff['files'].items():
        assert sha(REPO / record['source']) == record['sha256'], relative
    old_stage = REPO / handoff['stage']
    old_hp = old_stage / 'assets/build/frames' / AID / 'hardpoints.json'
    new_hp = stage / 'assets/build/frames' / AID / 'hardpoints.json'
    assert sha(old_hp) == sha(new_hp), 'Exact projected-hardpoint byte gate failed'
    result.update(original_nonservice_poses=416, candidate_pilot_poses=6, copied_layer_files=len(copied),
                  fresh_service_poses=90, original_handoff_files_unchanged=len(handoff['files']),
                  hardpoints_sha256=sha(new_hp), copied_files=copied)
    out.write_text(json.dumps(result, indent=2) + '\n')
    print('FC_ISR_COMPLETED_REUSE_PROOF 416 6 90', len(copied))
except Exception as error:
    result.update(failures=1, error=repr(error))
    out.write_text(json.dumps(result, indent=2) + '\n')
    raise
