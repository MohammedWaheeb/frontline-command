"""Hash retained completed course artifacts; no build, test, host or promotion."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):
    return json.loads(path.read_text())
matrix = read(HERE / 'matrix-helper-lock.json')
assert all(sha(HERE / p) == value for p, value in matrix['files'].items())
missions = read(HERE / 'completed-mission-audit.json')
bots_path = HERE / 'skirmish-runs/20260929T185233Z'
bots = read(bots_path / 'receipt-audit.json')
assert [(p['passed'], p['failed'], p['unrun']) for p in missions['phases']] == [(102, 0, 0), (21, 0, 0)]
assert all(not p['historical_final_hash_differences'] and not p['historical_order_ledger_differences'] for p in missions['phases'])
bot_run = read(bots_path / 'run.json')
assert (bot_run['passed'], bot_run['failed'], bot_run['unrun']) == (13, 0, 0)
assert len(bots['cases']) == 13 and not bots['differences']
assert all(all(c['baseline_equality'].values()) for c in bots['cases'])
manifest_path = HERE / 'promotion-review/20260929T185739Z/manifest.json'
manifest = read(manifest_path)
assert sha(manifest_path) == '2beefa9d34397de10a07692a3d6fd6c66b11558aa8fe16f40c34a9c92ad5474d'
assert manifest['status'] == 'prepared_only_not_promoted'
for row in manifest['source_changes'] + manifest['runtime_copies']:
    target = ROOT / row['path']
    assert (sha(target) if target.is_file() else None) == row['live_sha256']
    assert sha(ROOT / row['source']) == row['source_sha256']
for rel, row in manifest['prior_live_backup'].items():
    assert sha(manifest_path.parent / 'prior-live' / rel) == row['sha256']
files = {}
for directory in [HERE / p['directory'] for p in missions['phases']] + [bots_path]:
    for path in sorted(directory.rglob('*')):
        if path.is_file():
            assert not path.is_symlink()
            files[str(path.relative_to(HERE))] = dict(sha256=sha(path), bytes=path.stat().st_size)
lock = dict(scope='Exact retained new mission and skirmish artifacts, including local binaries/saves/replays. Compact Git receipts reference these local large files; no artifact is removed.', files=files)
(HERE / 'evidence-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
receipt_paths = [HERE / 'completed-mission-audit.json', bots_path / 'receipt-audit.json',
                 HERE / 'runtime-builds/20260929T182132Z/receipt.json', HERE / 'runtime-builds/20260929T182132Z/audit.json',
                 HERE / 'clean-source-proof.json', HERE / 'matrix-helper-lock.json', HERE / 'evidence-lock.json', manifest_path]
report = dict(status='passed', promoted=False, source_lock_sha256=sha(HERE / 'source-lock.json'),
              routes=dict(main=102, optional=21, skirmish=13, requested=136, passed=136, failed=0, unrun=0, unexpected_skips=0),
              mission_receipts=dict(accepted=sum(p['receipts'] for p in missions['phases']), rejected=0),
              skirmish_receipts=dict(accepted=bots['accepted'], rejected=bots['rejected'], rejection_codes=bots['rejection_codes']),
              complete_mission_ledgers_and_hashes_equal_3d49=123, complete_bot_traces_saves_replays_and_hashes_equal_3d49=13,
              source_inventory=dict(locked_files=359, explicit_ignore=1, production_changed=4, focused_tests_changed_or_added=3, timing_instrumentation=False),
              runtime=dict(actual_wasm_scenes=6, checkpoint_stages=3, whole_checkpoint_protobuf_views=12, whole_checkpoint_saves=3, changed_outputs=3, unchanged_outputs=5),
              file_receipts={str(p.relative_to(HERE)): sha(p) for p in receipt_paths},
              retained_route_artifacts=len(files), retained_route_artifact_bytes=sum(v['bytes'] for v in files.values()),
              scope='Shared-host serial GOMAXPROCS1 correctness. Same12 bot rejections retained; baseline contexts reused only after exact trace/save/replay comparison, not newly reconstructed. No browser/listening-host/performance/platform/final-art certification. No live promotion.')
(HERE / 'acceptance.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
