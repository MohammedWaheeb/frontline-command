"""Read-only receipt/raw-sample audit; never reruns or relabels the failed course."""
from pathlib import Path
import datetime, json, sys
from runner_guard import digest, verify_source

HERE = Path(__file__).resolve().parent
out = HERE / sys.argv[1]
receipt = json.loads((out / 'receipt.json').read_text())
for name, expected in receipt['artifacts'].items():
    assert digest(out / name) == expected, name
assert digest(out / 'server.test') == receipt['binary_sha256']
source_guard = verify_source(HERE / 'server-source', HERE / 'server-source-lock.json', receipt['expected_source_lock_sha256'])
result = json.loads((out / 'evidence/server.json').read_text())
samples = result['samples']
assert [s['tick'] for s in samples] == list(range(1, 601))
overruns = [s for s in samples if s['actor_tick_ns'] >= 50_000_000]
gaps = []
for prior, current in zip(samples, samples[1:]):
    gap = (datetime.datetime.fromisoformat(current['scheduled']) - datetime.datetime.fromisoformat(prior['scheduled'])).total_seconds() * 1000
    if gap > 75:
        gaps.append({'tick': current['tick'], 'prior_tick': prior['tick'], 'scheduled_gap_ms': gap})
assert len(overruns) == result['actor_ticks_at_or_over50ms']
report = {
    'integrity_audit': 'passed', 'original_course_status': receipt['status'],
    'original_native_status': result['status'],
    'scope': 'Read-only digest and sample audit; original strict failure unchanged. No simulation, test, compiler, browser or host execution.',
    'audited_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'receipt_sha256': digest(out / 'receipt.json'), 'server_json_sha256': digest(out / 'evidence/server.json'),
    'audit_script_sha256': digest(Path(__file__)), 'binary_sha256': receipt['binary_sha256'],
    'source_guard': source_guard, 'artifact_hashes_verified': len(receipt['artifacts']),
    'summary': result['summary'], 'overruns': overruns, 'scheduled_gaps': gaps,
    'actual_tick': result['actual_tick'], 'hash': result['hash'],
    'restore_full_and_checkpoint_replay_exact': result['restore_full_and_checkpoint_replay_exact'],
    'executed_results': result['executed_results'], 'landed': result['landed'],
    'archive_frames': result['archive_frames'], 'wire': result['wire'],
    'checkpoint': result['checkpoint'], 'authorized_unique_event_counts': result['authorized_unique_event_counts'],
    'unresolved': 'Tick2 Advance wall-time cause needs separate profiling. Tick600 duplicates Save inside replay capture and immediately afterwards; measured components do not establish the speed of an unimplemented optimization.'
}
target = out / 'postrun-audit.json'
with target.open('x') as f:
    json.dump(report, f, indent=2)
    f.write('\n')
print(json.dumps({'integrity_audit': report['integrity_audit'], 'original_course_status': report['original_course_status'], 'overrun_ticks': [s['tick'] for s in overruns], 'artifacts_verified': report['artifact_hashes_verified']}))
